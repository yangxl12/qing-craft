import { CLAYS, GLAZES, SHAPES } from "../../core/catalog";
import { decorationSummary, motifById, STYLE_PACKS } from "../../core/decoration";
import { PotteryEngine } from "../../core/pottery-engine";
import { PotteryWork } from "../../core/model";
import { duplicateWork, loadWork, removeWork, saveWork } from "../../services/storage";
import { track } from "../../services/analytics";

function workInfo(work: PotteryWork) {
  const summary = decorationSummary(work.decorationComposition);
  const style = STYLE_PACKS.find((item) => item.id === work.decorationComposition.stylePackId);
  return {
    shape:SHAPES.find((item) => item.id === work.shapeId)?.name || "器",
    clay:CLAYS.find((item) => item.id === work.clayId)?.name || "陶泥",
    glaze:GLAZES.find((item) => item.id === work.glazeId)?.name || "釉",
    style:style?.name || "自由搭配",
    motifs:summary.motifNames.join("、") || "素面",
    techniques:summary.techniqueNames.join(" / ") || "留白",
    meaning:summary.meaningNote,
    inscription:work.decorationComposition.inscription
      ? (work.decorationComposition.inscription.visibleInExport
          ? work.decorationComposition.inscription.text
          : "已写款")
      : "未写款",
    primaryGlyph:work.decorationComposition.layers[0]
      ? motifById(work.decorationComposition.layers[0].motifId).glyph
      : "素"
  };
}

Page({
  data: {
    work:null as PotteryWork | null,
    workInfo:null as any,
    ready:false,
    fallback:false,
    light:"workshop",
    lightName:"工坊光",
    infoOpen:false,
    exporting:false,
    preview:"",
    previewType:""
  },
  work:null as PotteryWork | null,
  engine:null as PotteryEngine | null,
  canvas:null as any,
  gesture:null as any,

  onLoad(query: any) {
    const work = loadWork(query.id);
    if (!work) {
      wx.reLaunch({ url:"/pages/index/index" });
      return;
    }
    this.work = work;
    this.work.status = "completed";
    this.work.currentStage = "finished";
    this.work.stageIndex = 6;
    try { saveWork(this.work); } catch (_error) {
      wx.showToast({ title:"成品状态还没落盘", icon:"none" });
    }
    this.setData({ work:this.work, workInfo:workInfo(this.work) });
  },

  onReady() {
    setTimeout(() => this.initCanvas(), 50);
  },

  onUnload() {
    this.engine?.destroy();
  },

  initCanvas() {
    wx.createSelectorQuery().in(this).select("#resultCanvas").fields({ node:true, size:true }).exec((results: any[]) => {
      const info = results?.[0];
      if (!info?.node) {
        this.setData({ fallback:true, ready:true });
        return;
      }
      this.canvas = info.node;
      try {
        this.engine = new PotteryEngine(info.node, this.work!);
        const system = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        this.engine.resize(info.width, info.height, Math.min(system.pixelRatio || 2, 2));
        this.engine.setLighting(this.data.light);
        this.engine.setAutoRotate(!(wx.getStorageSync("palm-kiln-settings") || {}).reduceMotion);
        this.setData({ ready:true });
      } catch (_error) {
        this.setData({ fallback:true, ready:true });
      }
    });
  },

  backHome() { wx.reLaunch({ url:"/pages/index/index" }); },

  chooseLight(event: WechatMiniprogramTouchEvent) {
    const id = event.currentTarget.dataset.id;
    const names: Record<string, string> = {
      workshop:"工坊光",
      museum:"博物馆光",
      window:"日光窗边"
    };
    this.setData({ light:id, lightName:names[id] || names.workshop });
    this.engine?.setLighting(id);
  },

  toggleInfo() { this.setData({ infoOpen:!this.data.infoOpen }); },

  touchStart(event: WechatMiniprogramTouchEvent) {
    const touches = event.touches;
    this.engine?.setAutoRotate(false);
    if (touches.length === 2) {
      this.gesture = {
        type:"two",
        distance:Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY),
        x:(touches[0].clientX + touches[1].clientX) / 2,
        y:(touches[0].clientY + touches[1].clientY) / 2
      };
    } else if (touches[0]) {
      this.gesture = { type:"one", x:touches[0].clientX, y:touches[0].clientY };
    }
  },

  touchMove(event: WechatMiniprogramTouchEvent) {
    if (!this.gesture) return;
    const touches = event.touches;
    if (touches.length === 2) {
      const distance = Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
      const x = (touches[0].clientX + touches[1].clientX) / 2;
      const y = (touches[0].clientY + touches[1].clientY) / 2;
      if (this.gesture.type !== "two") this.gesture = { type:"two", distance, x, y };
      else {
        if (this.gesture.distance > 2 && distance > 2) this.engine?.dolly(distance / this.gesture.distance);
        this.engine?.orbit(x - this.gesture.x, y - this.gesture.y);
        this.gesture.distance = distance;
        this.gesture.x = x;
        this.gesture.y = y;
      }
    } else if (touches[0] && this.gesture.type === "one") {
      this.engine?.orbit(touches[0].clientX - this.gesture.x, touches[0].clientY - this.gesture.y);
      this.gesture.x = touches[0].clientX;
      this.gesture.y = touches[0].clientY;
    }
  },

  touchEnd(event: WechatMiniprogramTouchEvent) {
    const remaining = event.touches?.[0];
    if (remaining && this.gesture?.type === "two") {
      this.gesture = { type:"one", x:remaining.clientX, y:remaining.clientY };
      return;
    }
    this.gesture = null;
    const reduceMotion = (wx.getStorageSync("palm-kiln-settings") || {}).reduceMotion;
    this.engine?.setAutoRotate(!reduceMotion);
  },

  rename() {
    wx.showModal({
      title:"给作品取个名字",
      editable:true,
      placeholderText:this.work?.title || "",
      confirmText:"保存作品",
      success:(result: any) => {
        if (result.confirm && result.content?.trim() && this.work) {
          this.work.title = result.content.trim().slice(0, 20);
          saveWork(this.work);
          this.setData({ work:this.work, workInfo:workInfo(this.work) });
        }
      }
    });
  },

  copy() {
    if (!this.work) return;
    wx.showActionSheet({
      itemList:["只沿用纹样", "完整复制"],
      success:(result: any) => {
        const mode = result.tapIndex === 0 ? "decor" : "full";
        const next = duplicateWork(this.work!, mode);
        wx.showToast({ title:mode === "decor" ? "已沿用纹样" : "已完整复制", icon:"none" });
        setTimeout(() => wx.redirectTo({ url:`/pages/studio/studio?id=${next.workId}` }), 450);
      }
    });
  },

  remove() {
    if (!this.work) return;
    wx.showModal({
      title:"移到回收站？",
      content:"当前版本会从本机作品集中移除这件作品。",
      confirmText:"删除",
      confirmColor:"#b64f38",
      success:(result: any) => {
        if (result.confirm) {
          removeWork(this.work!.workId);
          wx.reLaunch({ url:"/pages/gallery/gallery" });
        }
      }
    });
  },

  async exportWork() {
    if (this.data.exporting || !this.work) return;
    this.engine?.setAutoRotate(false);
    this.setData({ exporting:true });
    const started = Date.now();
    try {
      const path = this.canvas
        ? await this.canvasFile(this.canvas, 1080, 1080)
        : await this.renderFallbackArt();
      this.setData({ preview:path, previewType:"纯作品图" });
      track("export_result", { format:"art", duration_ms:Date.now() - started, success:true });
    } catch (_error) {
      track("export_result", { format:"art", duration_ms:Date.now() - started, success:false });
      wx.showToast({ title:"图片没有生成好，请再试一次", icon:"none" });
    } finally {
      this.setData({ exporting:false });
    }
  },

  async exportPoster() {
    if (this.data.exporting || !this.work) return;
    this.engine?.setAutoRotate(false);
    this.setData({ exporting:true });
    const started = Date.now();
    try {
      const art = this.canvas
        ? await this.canvasFile(this.canvas, 900, 900)
        : await this.renderFallbackArt();
      const poster = await this.composePoster(art);
      this.setData({ preview:poster, previewType:"纪念海报" });
      track("export_result", { format:"poster", duration_ms:Date.now() - started, success:true });
    } catch (_error) {
      track("export_result", { format:"poster", duration_ms:Date.now() - started, success:false });
      wx.showToast({ title:"海报没有生成好，请再试一次", icon:"none" });
    } finally {
      this.setData({ exporting:false });
    }
  },

  canvasFile(canvas: any, width: number, height: number): Promise<string> {
    return new Promise((resolve, reject) => wx.canvasToTempFilePath({
      canvas,
      destWidth:width,
      destHeight:height,
      fileType:"png",
      quality:1,
      success:(result: any) => resolve(result.tempFilePath),
      fail:reject
    }));
  },

  renderFallbackArt(): Promise<string> {
    return new Promise((resolve, reject) => {
      wx.createSelectorQuery().in(this).select("#posterCanvas").fields({ node:true, size:true }).exec((results: any[]) => {
        const canvas = results?.[0]?.node;
        if (!canvas || !this.work) {
          reject(new Error("fallback canvas"));
          return;
        }
        canvas.width = 1080;
        canvas.height = 1080;
        const context = canvas.getContext("2d");
        const info = workInfo(this.work);
        context.fillStyle = "#dce6df";
        context.fillRect(0, 0, 1080, 1080);
        context.save();
        context.translate(540, 548);
        context.beginPath();
        context.moveTo(-150, -330);
        context.bezierCurveTo(-185, -205, -285, 88, -228, 312);
        context.quadraticCurveTo(0, 372, 228, 312);
        context.bezierCurveTo(285, 88, 185, -205, 150, -330);
        context.closePath();
        context.fillStyle = GLAZES.find((item) => item.id === this.work!.glazeId)?.fired || "#78a291";
        context.fill();
        context.clip();
        context.fillStyle = "#315e73";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.font = "bold 150px serif";
        context.fillText(info.primaryGlyph, 0, 0);
        context.font = "42px serif";
        context.fillText(info.motifs, 0, 155);
        if (this.work!.decorationComposition.inscription) {
          context.fillStyle = this.work!.decorationComposition.inscription!.styleId === "seal_red" ? "#a84f43" : "#315e73";
          context.font = "34px serif";
          context.fillText(this.work!.decorationComposition.inscription!.text.replace(/\n/g, " "), 0, 252);
        }
        context.restore();
        this.canvasFile(canvas, 1080, 1080).then(resolve, reject);
      });
    });
  },

  composePoster(art: string): Promise<string> {
    return new Promise((resolve, reject) => {
      wx.createSelectorQuery().in(this).select("#posterCanvas").fields({ node:true, size:true }).exec((results: any[]) => {
        const canvas = results?.[0]?.node;
        if (!canvas || !this.work) {
          reject(new Error("poster canvas"));
          return;
        }
        canvas.width = 1080;
        canvas.height = 1440;
        const context = canvas.getContext("2d");
        const info = workInfo(this.work);
        context.fillStyle = "#e9eee9";
        context.fillRect(0, 0, 1080, 1440);
        context.fillStyle = "#202822";
        context.font = "bold 42px serif";
        context.fillText("掌 心 窑", 72, 86);
        context.font = "26px sans-serif";
        context.fillStyle = "#52796a";
        context.fillText(`${info.style} · ${info.techniques}`, 72, 130);
        const image = canvas.createImage();
        image.onload = () => {
          context.fillStyle = "#cbd7cf";
          context.fillRect(72, 190, 936, 936);
          context.drawImage(image, 72, 190, 936, 936);
          context.fillStyle = "#202822";
          context.font = "bold 56px serif";
          context.fillText(this.work!.title, 72, 1218);
          context.font = "26px sans-serif";
          context.fillStyle = "#66716b";
          context.fillText(`${info.shape} · ${info.clay} · ${info.glaze}`, 72, 1270);
          context.fillText(`纹样：${info.motifs}`, 72, 1315);
          const inscription = this.work!.decorationComposition.inscription;
          const inscriptionText = inscription
            ? (inscription.contentType === "blessing" ? "已写祝语款" : inscription.text.replace(/\n/g, " "))
            : "未写款";
          context.fillText(`款识：${inscriptionText}`, 72, 1360);
          this.canvasFile(canvas, 1080, 1440).then(resolve, reject);
        };
        image.onerror = reject;
        image.src = art;
      });
    });
  },

  saveImage() {
    if (!this.data.preview) return;
    wx.saveImageToPhotosAlbum({
      filePath:this.data.preview,
      success:() => wx.showToast({ title:"已保存到相册" }),
      fail:() => wx.showModal({
        title:"图片已生成",
        content:"开启相册权限后即可保存，也可以先保留预览。",
        confirmText:"去设置",
        success:(result: any) => { if (result.confirm) wx.openSetting(); }
      })
    });
  },

  closePreview() { this.setData({ preview:"", previewType:"" }); },

  onShareAppMessage() {
    return {
      title:`我在泥火青花做了「${this.work?.title || "一件陶器"}」`,
      path:`/pages/result/result?id=${this.work?.workId || ""}`
    };
  }
});
