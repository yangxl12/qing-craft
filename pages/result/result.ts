import { CLAYS, GLAZES, SHAPES } from "../../core/catalog";
import { decorationSummary, motifById, STYLE_PACKS } from "../../core/decoration";
import { PotteryEngine } from "../../core/pottery-engine";
import { PotteryWork } from "../../core/model";
import { duplicateWork, loadWork, removeWork, saveWork } from "../../services/storage";
import { track } from "../../services/analytics";
import { runConfirmedAction } from "../../utils/destructive-actions";
import { loadSettings } from "../../utils/settings";
import { resolveRenderDpr } from "../../utils/render-quality";

const ART_SIZE = 1080;

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
    infoOpen:false,
    exportTask:"" as "" | "art" | "poster",
    exportError:"",
    sharing:false,
    savingPreview:false,
    previewSaveState:"",
    removing:false,
    copying:false,
    reduceMotion:false,
    preview:"",
    previewType:""
  },
  work:null as PotteryWork | null,
  engine:null as PotteryEngine | null,
  gesture:null as any,
  shareTimer:null as ReturnType<typeof setTimeout> | null,

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

  onShow() {
    this.setData({ reduceMotion:loadSettings().reduceMotion });
  },

  onReady() {
    setTimeout(() => this.initCanvas(), 50);
  },

  onUnload() {
    this.engine?.destroy();
    if (this.shareTimer) clearTimeout(this.shareTimer);
  },

  initCanvas() {
    wx.createSelectorQuery().in(this).select("#resultCanvas").fields({ node:true, size:true }).exec((results: any[]) => {
      const info = results?.[0];
      if (!info?.node) {
        this.setData({ fallback:true, ready:true });
        return;
      }
      try {
        this.engine = new PotteryEngine(info.node, this.work!);
        const system = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        this.engine.resize(
          info.width,
          info.height,
          resolveRenderDpr(system.pixelRatio || 2, loadSettings().quality)
        );
        this.engine.setLighting("showcase");
        // 展台上的成品保持静止，只在用户拖动时改变视角。
        this.engine.setAutoRotate(false);
        this.setData({ ready:true });
      } catch (_error) {
        this.setData({ fallback:true, ready:true });
      }
    });
  },

  backHome() { wx.reLaunch({ url:"/pages/index/index" }); },

  openInfo() { this.setData({ infoOpen:true }); },

  closeInfo() { this.setData({ infoOpen:false }); },

  /** 弹窗本体拦截点击冒泡，让遮罩层负责“点外部关闭”。 */
  noop() {},

  touchStart(event: WechatMiniprogramTouchEvent) {
    const touches = event.touches;
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
          try {
            saveWork(this.work);
            this.setData({ work:this.work, workInfo:workInfo(this.work) });
            wx.showToast({ title:"作品名称已保存", icon:"none" });
          } catch (_error) {
            wx.showToast({ title:"名称没有保存，请重试", icon:"none" });
          }
        }
      }
    });
  },

  copy() {
    if (!this.work || this.data.copying) return;
    this.setData({ copying:true });
    wx.showActionSheet({
      itemList:["只沿用纹样", "完整复制"],
      success:(result: any) => {
        const mode = result.tapIndex === 0 ? "decor" : "full";
        try {
          const next = duplicateWork(this.work!, mode);
          wx.showToast({ title:mode === "decor" ? "已沿用纹样" : "已完整复制", icon:"none" });
          setTimeout(() => wx.redirectTo({
            url:`/pages/studio/studio?id=${next.workId}`,
            fail:() => {
              this.setData({ copying:false });
              wx.showToast({ title:"新作品已建立，请从首页继续", icon:"none" });
            }
          }), 450);
        } catch (_error) {
          this.setData({ copying:false });
          wx.showToast({ title:"新作品没有建立，请重试", icon:"none" });
        }
      },
      fail:() => this.setData({ copying:false })
    });
  },

  remove() {
    if (!this.work || this.data.removing) return;
    this.setData({ removing:true });
    wx.showModal({
      title:"移到回收站？",
      content:"当前版本会从本机作品集中移除这件作品。",
      confirmText:"删除",
      confirmColor:"#9c3f38",
      success:(result: any) => {
        const committed = runConfirmedAction(result, () => {
          try {
            removeWork(this.work!.workId);
            this.setData({ removing:false });
            wx.reLaunch({ url:"/pages/gallery/gallery" });
          } catch (_error) {
            this.setData({ removing:false });
            wx.showToast({ title:"作品没有删除，请重试", icon:"none" });
          }
        });
        if (!committed) this.setData({ removing:false });
      },
      fail:() => this.setData({ removing:false })
    });
  },

  async exportWork() {
    if (this.data.exportTask || this.data.sharing || !this.work) return;
    this.setData({ exportTask:"art", exportError:"" });
    const started = Date.now();
    try {
      const path = await this.renderShowcaseArt();
      this.setData({ preview:path, previewType:"纯作品图", previewSaveState:"" });
      track("export_result", { format:"art", duration_ms:Date.now() - started, success:true });
    } catch (_error) {
      track("export_result", { format:"art", duration_ms:Date.now() - started, success:false });
      this.setData({ exportError:"作品图没有生成，请检查画面后重试。" });
      wx.showToast({ title:"作品图没有生成，请重试", icon:"none" });
    } finally {
      this.setData({ exportTask:"" });
    }
  },

  async exportPoster() {
    if (this.data.exportTask || this.data.sharing || !this.work) return;
    this.setData({ exportTask:"poster", exportError:"" });
    const started = Date.now();
    try {
      const art = await this.renderShowcaseArt();
      const poster = await this.composePoster(art);
      this.setData({ preview:poster, previewType:"纪念海报", previewSaveState:"" });
      track("export_result", { format:"poster", duration_ms:Date.now() - started, success:true });
    } catch (_error) {
      track("export_result", { format:"poster", duration_ms:Date.now() - started, success:false });
      this.setData({ exportError:"纪念海报没有生成，请重试。" });
      wx.showToast({ title:"纪念海报没有生成，请重试", icon:"none" });
    } finally {
      this.setData({ exportTask:"" });
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

  /**
   * 生成正方形成品图。WebGL 画布不支持直接 canvasToTempFilePath，
   * 所以先从引擎读回像素，再与展台底景在 2D 画布上合成后导出。
   */
  renderShowcaseArt(): Promise<string> {
    return new Promise((resolve, reject) => {
      wx.createSelectorQuery().in(this).select("#posterCanvas").fields({ node:true, size:true }).exec((results: any[]) => {
        const canvas = results?.[0]?.node;
        if (!canvas || !this.work) {
          reject(new Error("poster canvas"));
          return;
        }
        canvas.width = ART_SIZE;
        canvas.height = ART_SIZE;
        const context = canvas.getContext("2d");
        const pixels = this.engine ? this.engine.snapshot(ART_SIZE) : null;
        if (pixels) {
          const image = context.createImageData(ART_SIZE, ART_SIZE);
          compositeShowcasePixels(image.data, pixels, ART_SIZE);
          context.putImageData(image, 0, 0);
        } else {
          this.drawFallbackArt(context);
        }
        this.canvasFile(canvas, ART_SIZE, ART_SIZE).then(resolve, reject);
      });
    });
  },

  drawFallbackArt(context: any) {
    if (!this.work) return;
    const info = workInfo(this.work);
    context.fillStyle = "#dce6df";
    context.fillRect(0, 0, ART_SIZE, ART_SIZE);
    context.save();
    context.translate(ART_SIZE / 2, ART_SIZE / 2 + 8);
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
        context.fillText("泥火青花", 72, 86);
        context.font = "26px sans-serif";
        context.fillStyle = "#52796a";
        context.fillText(`${info.style} · ${info.techniques}`, 72, 130);
        const image = canvas.createImage();
        image.onload = () => {
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
    if (!this.data.preview || this.data.savingPreview) return;
    this.setData({ savingPreview:true, previewSaveState:"正在保存到相册" });
    wx.saveImageToPhotosAlbum({
      filePath:this.data.preview,
      success:() => {
        this.setData({ savingPreview:false, previewSaveState:"已保存到相册" });
        wx.showToast({ title:"已保存到相册" });
      },
      fail:(error: any) => {
        const permissionDenied = /auth|authorize|permission|deny/i.test(error?.errMsg || "");
        this.setData({
          savingPreview:false,
          previewSaveState:permissionDenied
            ? "没有保存，请开启相册权限后重试"
            : "没有保存，预览已保留，请稍后重试"
        });
        if (!permissionDenied) {
          wx.showToast({ title:"没有保存，预览已保留", icon:"none" });
          return;
        }
        wx.showModal({
          title:"相册权限未开启",
          content:"作品图已经生成。开启相册权限后，返回这里再次点“保存到相册”即可。",
          confirmText:"去设置",
          cancelText:"保留预览",
          success:(result: any) => { if (result.confirm) wx.openSetting(); }
        });
      }
    });
  },

  closePreview() {
    if (this.data.savingPreview) return;
    this.setData({ preview:"", previewType:"", previewSaveState:"" });
  },

  startShare() {
    if (this.data.exportTask || this.data.sharing) return;
    this.setData({ sharing:true, exportError:"" });
    if (this.shareTimer) clearTimeout(this.shareTimer);
    this.shareTimer = setTimeout(() => {
      this.shareTimer = null;
      this.setData({ sharing:false });
    }, 800);
  },

  onShareAppMessage() {
    if (this.shareTimer) {
      clearTimeout(this.shareTimer);
      this.shareTimer = null;
    }
    this.setData({ sharing:false });
    return {
      title:`我在泥火青花做了「${this.work?.title || "一件陶器"}」`,
      path:`/pages/result/result?id=${this.work?.workId || ""}`
    };
  }
});

/**
 * 把 WebGL 快照合成到展台底景上：深青绿渐变 + 中央柔光 + 底部投影，
 * 与成品页背景同一氛围。快照为非预乘 RGBA，按 alpha 直接混合。
 */
function compositeShowcasePixels(target: Uint8ClampedArray, pixels: Uint8Array, size: number): void {
  const footY = 0.74 * size;
  for (let y = 0; y < size; y++) {
    const top = y / size;
    // 纵向渐变：上暖下冷的深色展台空间。
    const baseRed = 32 + (14 - 32) * top;
    const baseGreen = 50 + (26 - 50) * top;
    const baseBlue = 45 + (23 - 45) * top;
    const dy = (y + 0.5) / size - 0.42;
    const shadowY = (y - footY) * (y - footY) / 3000;
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      // 器物背后的柔光晕。
      const glow = Math.exp(-(dx * dx * 9 + dy * dy * 16));
      // 器底的接触投影。
      const shade = 1 - 0.4 * Math.exp(-((dx * dx) / 0.028 + shadowY));
      const red = (baseRed + 26 * glow) * shade;
      const green = (baseGreen + 23 * glow) * shade;
      const blue = (baseBlue + 17 * glow) * shade;
      const index = (y * size + x) * 4;
      const alpha = pixels[index + 3] / 255;
      if (alpha >= 1) {
        target[index] = pixels[index];
        target[index + 1] = pixels[index + 1];
        target[index + 2] = pixels[index + 2];
        target[index + 3] = 255;
      } else if (alpha > 0) {
        target[index] = pixels[index] * alpha + red * (1 - alpha);
        target[index + 1] = pixels[index + 1] * alpha + green * (1 - alpha);
        target[index + 2] = pixels[index + 2] * alpha + blue * (1 - alpha);
        target[index + 3] = 255;
      } else {
        target[index] = red;
        target[index + 1] = green;
        target[index + 2] = blue;
        target[index + 3] = 255;
      }
    }
  }
}
