import { GLAZES, STAGES, TOOLS } from "../../core/catalog";
import { cloneWork, PotteryWork } from "../../core/model";
import {
  applySweptDeformation,
  synchronizeInnerWall,
  toolAction
} from "../../core/profile";
import { PotteryEngine } from "../../core/pottery-engine";
import {
  calculatePotteryBaseScreenY,
  calculatePotteryTargetRpm,
  potteryRpmToPeriodMs,
  PotteryRotationState
} from "../../core/pottery-scene";
import {
  ShapingInputSession,
  ShapingInputPoint,
  SweptInputSample
} from "../../core/shaping-input";
import { loadWork, saveWork } from "../../services/storage";
import { track } from "../../services/analytics";

interface CanvasRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface EditGesture {
  type: "edit";
  x: number;
  y: number;
  side: -1 | 1;
  tool: string;
  changed: boolean;
  snapshot: PotteryWork;
  input: ShapingInputSession | null;
  pending: SweptInputSample[];
}

interface OrbitGesture {
  type: "orbit";
  x: number;
  y: number;
}

interface CameraGesture {
  type: "camera2";
  distance: number;
  x: number;
  y: number;
}

type StudioGesture = EditGesture | OrbitGesture | CameraGesture;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

Page({
  data: {
    ready: false,
    fallback: false,
    work: null as PotteryWork | null,
    stages: STAGES,
    stageIndex: 0,
    stageName: "制坯",
    tools: TOOLS.shaping,
    tool: "finger",
    toolName: "推 / 拉",
    glazes: GLAZES,
    glazeId: "celadon",
    paintColors: ["#315e73", "#a95955", "#d0b17c", "#202822", "#f1eee4", "#657858"],
    symmetryLabels: ["无对称", "左右镜像", "四向环绕"],
    canUndo: false,
    canRedo: false,
    saveState: "已保存",
    hint: "按住器身，向外轻轻推",
    cameraHelp: "单指拖动背景可环绕，双指开合可放大或缩小。",
    showHint: false,
    kiln: false,
    kilnProgress: 0,
    kilnText: "入窑预热",
    showHelp: false,
    reduceMotion: false,
    baseScreenY: 0.74,
    baseScreenPercent: 74,
    wheelRpm: 38,
    wheelPeriodMs: 1579,
    wheelPaused: false,
    wheelState: "idle",
    contactShadowWidth: 220
  },

  engine: null as PotteryEngine | null,
  canvas: null as any,
  rect: null as CanvasRect | null,
  work: null as PotteryWork | null,
  history: [] as PotteryWork[],
  future: [] as PotteryWork[],
  gesture: null as StudioGesture | null,
  saveTimer: null as any,
  kilnTimer: null as any,
  firstDeformTracked: false,

  onLoad(query: any) {
    const work = loadWork(query.id);
    if (!work) {
      wx.showToast({ title: "草稿没有找到", icon: "none" });
      setTimeout(() => wx.navigateBack(), 500);
      return;
    }
    this.work = work;
    this.syncData();
  },

  onReady() {
    setTimeout(() => this.initCanvas(), 60);
  },

  onHide() {
    this.commitGestureChange();
    this.gesture = null;
    this.persist();
    this.engine?.setAutoRotate(false);
  },

  onShow() {
    const reduceMotion = !!(wx.getStorageSync("palm-kiln-settings") || {}).reduceMotion;
    this.engine?.setAutoRotate(!reduceMotion);
    this.setData({ reduceMotion });
    this.setWheelState("idle", reduceMotion);
  },

  onUnload() {
    this.commitGestureChange();
    this.persist();
    this.engine?.destroy();
    if (this.saveTimer) clearTimeout(this.saveTimer);
    if (this.kilnTimer) clearInterval(this.kilnTimer);
  },

  initCanvas() {
    const query = wx.createSelectorQuery().in(this);
    query
      .select("#potteryCanvas")
      .fields({ node: true, size: true, rect: true })
      .exec((results: any[]) => {
        const info = results && results[0];
        if (!info?.node) {
          this.setData({ fallback: true, ready: true });
          return;
        }
        this.canvas = info.node;
        this.rect = {
          left: info.left || 0,
          top: info.top || 0,
          width: info.width,
          height: info.height
        };
        try {
          this.engine = new PotteryEngine(info.node, this.work!);
          const system = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
          const dpr = Math.min(system.pixelRatio || 2, 2);
          const reduceMotion = !!(wx.getStorageSync("palm-kiln-settings") || {}).reduceMotion;
          const baseScreenY = calculatePotteryBaseScreenY(system.windowHeight || info.height);
          this.engine.resize(info.width, info.height, dpr);
          this.engine.setBaseScreenY(baseScreenY);
          this.engine.setFrameProcessor(() => this.flushShapingFrame(false));
          this.engine.setAutoRotate(!reduceMotion);
          this.setData({
            ready: true,
            reduceMotion,
            baseScreenY,
            baseScreenPercent: Math.round(baseScreenY * 1000) / 10
          });
          this.setWheelState("idle", reduceMotion);
          this.maybeTutorial();
        } catch (error) {
          console.error(error);
          this.setData({
            fallback: true,
            ready: true,
            hint: "已进入轻量模式，作品仍可完成",
            showHint: true
          });
        }
      });
  },

  maybeTutorial() {
    const seen = wx.getStorageSync("palm-kiln-tutorial-seen");
    if (!seen && this.work?.mode === "relaxed") this.setData({ showHint: true });
  },

  syncData() {
    if (!this.work) return;
    const stage = STAGES[this.work.stageIndex] || STAGES[0];
    const tools = TOOLS[stage.id] || [];
    const selected = tools.find((value) => value.id === this.data.tool) || tools[0];
    this.setData({
      work: this.work,
      stageIndex: this.work.stageIndex,
      stageName: stage.name,
      tools,
      tool: selected?.id || "",
      toolName: selected?.name || "",
      glazeId: this.work.glazeId,
      canUndo: this.history.length > 0,
      canRedo: this.future.length > 0,
      contactShadowWidth: this.contactShadowWidth()
    });
  },

  close() {
    this.persist();
    wx.showModal({
      title: "先歇一会儿？",
      content: "作品已经存在本机，下次可以从这里继续。",
      confirmText: "回到首页",
      cancelText: "继续创作",
      success: (result: any) => {
        if (result.confirm) wx.reLaunch({ url: "/pages/index/index" });
      }
    });
  },

  help() {
    this.setData({ showHelp: !this.data.showHelp });
  },

  hideHint() {
    this.setData({ showHint: false, showHelp: false });
    wx.setStorageSync("palm-kiln-tutorial-seen", true);
  },

  chooseTool(event: WechatMiniprogramTouchEvent) {
    if (!this.work) return;
    const id = event.currentTarget.dataset.id;
    const entry = (this.data.tools as { id: string; name: string; hint: string }[]).find(
      (value) => value.id === id
    );
    this.setData({
      tool: id,
      toolName: entry?.name || "",
      hint: entry?.hint || "",
      showHint: true
    });
    this.vibrate();

    const gestureTools = ["finger", "open", "collar", "smooth"];
    if (this.work.currentStage === "shaping" && !gestureTools.includes(id)) {
      this.pushHistory();
      const previousOuter = this.work.outerRadius.slice();
      const action = toolAction(this.work.outerRadius, id);
      this.work.outerRadius = action.profile;
      this.work.height = clamp(this.work.height * action.heightScale, 0.45, 1.8);
      this.work.innerRadius = synchronizeInnerWall(
        previousOuter,
        this.work.outerRadius,
        this.work.innerRadius
      );
      this.changed();
    }
    if (this.work.currentStage === "glaze") {
      this.pushHistory();
      this.work.glazeMethod = id;
      this.changed();
    }
    if (this.work.currentStage === "decorate") {
      this.pushHistory();
      this.work.decorations.push({ type: id, y: 0.55, angle: 0 });
      this.changed();
    }
    if (this.work.currentStage === "paint" && id === "pattern") {
      this.pushHistory();
      this.work.paintPattern = (this.work.paintPattern % 4) + 1;
      this.changed();
    }
  },

  chooseGlaze(event: WechatMiniprogramTouchEvent) {
    if (!this.work) return;
    this.pushHistory();
    this.work.glazeId = event.currentTarget.dataset.id;
    this.setData({ glazeId: this.work.glazeId });
    this.changed();
  },

  choosePaint(event: WechatMiniprogramTouchEvent) {
    if (!this.work) return;
    this.pushHistory();
    this.work.paintColor = event.currentTarget.dataset.color;
    this.work.paintPattern = this.work.paintPattern || 1;
    this.changed();
  },

  cycleSymmetry() {
    if (!this.work) return;
    this.pushHistory();
    this.work.symmetry = (this.work.symmetry + 1) % 3;
    this.changed();
  },

  touchStart(event: WechatMiniprogramTouchEvent) {
    if (!this.work || !this.rect || this.data.kiln) return;
    const touches = event.touches;
    if (touches.length === 2) {
      this.commitGestureChange();
      this.gesture = {
        type: "camera2",
        distance: this.distance(touches[0], touches[1]),
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2
      };
      this.setWheelState("orbit");
      return;
    }

    const touch = touches[0];
    if (!touch) return;
    const local = this.local(touch);
    const hit = this.hitPot(local.x, local.y);
    const editable =
      hit && (this.work.currentStage === "shaping" || this.work.currentStage === "paint");
    if (!editable) {
      this.gesture = { type: "orbit", x: touch.clientX, y: touch.clientY };
      this.setWheelState("orbit");
      return;
    }

    const side: -1 | 1 = local.x < this.rect.width / 2 ? -1 : 1;
    const input =
      this.work.currentStage === "shaping"
        ? new ShapingInputSession({
            viewportWidth: this.rect.width,
            profileCount: this.work.outerRadius.length,
            side
          })
        : null;
    if (input) {
      input.begin(
        this.inputPoint(local.x, local.y, event),
        this.profilePositionAt(local.y)
      );
    }
    this.gesture = {
      type: "edit",
      x: touch.clientX,
      y: touch.clientY,
      side,
      tool: this.data.tool,
      changed: false,
      snapshot: cloneWork(this.work),
      input,
      pending: []
    };
    this.setWheelState(this.work.currentStage === "shaping" ? "shaping" : "orbit");
  },

  touchMove(event: WechatMiniprogramTouchEvent) {
    if (!this.work || !this.gesture || !this.rect) return;
    const touches = event.touches;
    if (touches.length === 2) {
      const distance = this.distance(touches[0], touches[1]);
      const x = (touches[0].clientX + touches[1].clientX) / 2;
      const y = (touches[0].clientY + touches[1].clientY) / 2;
      if (this.gesture.type !== "camera2") {
        this.commitGestureChange();
        this.gesture = { type: "camera2", distance, x, y };
        this.setWheelState("orbit");
      } else {
        if (this.gesture.distance > 2 && distance > 2) {
          this.engine?.dolly(distance / this.gesture.distance);
        }
        this.engine?.orbit(x - this.gesture.x, y - this.gesture.y);
        this.gesture.distance = distance;
        this.gesture.x = x;
        this.gesture.y = y;
      }
      return;
    }

    const touch = touches[0];
    if (!touch) return;
    const dx = touch.clientX - this.gesture.x;
    const dy = touch.clientY - this.gesture.y;
    if (this.gesture.type === "orbit") {
      this.engine?.orbit(dx, dy);
      this.gesture.x = touch.clientX;
      this.gesture.y = touch.clientY;
      return;
    }

    if (this.gesture.type === "edit" && this.work.currentStage === "shaping") {
      const local = this.local(touch);
      const samples = this.gesture.input?.push(
        this.inputPoint(local.x, local.y, event),
        (canvasY) => this.profilePositionAt(canvasY)
      );
      if (samples?.length) this.gesture.pending.push(...samples);
    } else if (this.gesture.type === "edit" && this.work.currentStage === "paint") {
      const nextPattern =
        this.gesture.tool === "eraser"
          ? 0
          : this.gesture.tool === "dot"
            ? 3
            : this.gesture.tool === "pattern"
              ? 4
              : 2;
      if (nextPattern !== this.work.paintPattern) {
        this.work.paintPattern = nextPattern;
        this.gesture.changed = true;
        this.engine?.update(this.work);
      }
    }
    this.gesture.x = touch.clientX;
    this.gesture.y = touch.clientY;
  },

  touchEnd(event: WechatMiniprogramTouchEvent) {
    if (!this.work || !this.gesture) return;
    const previousType = this.gesture.type;
    this.commitGestureChange();
    const remaining = event.touches?.[0];
    if (remaining && previousType === "camera2") {
      this.gesture = { type: "orbit", x: remaining.clientX, y: remaining.clientY };
      this.setWheelState("orbit");
      return;
    }
    this.gesture = null;
    this.setWheelState("idle");
    this.syncData();
  },

  flushShapingFrame(renderNow = false): boolean {
    if (
      !this.work ||
      !this.gesture ||
      this.gesture.type !== "edit" ||
      this.work.currentStage !== "shaping" ||
      !this.gesture.pending.length
    ) {
      return false;
    }
    const samples = this.gesture.pending.splice(0);
    const previousOuter = this.work.outerRadius.slice();
    const previousInner = this.work.innerRadius.slice();

    if (this.gesture.tool === "open") {
      const openingDelta = samples.reduce(
        (total, sample) => total + Math.max(0, sample.deltaRadius) * 1.1,
        0
      );
      if (openingDelta > 0) {
        const start = Math.floor(this.work.innerRadius.length * 0.7);
        for (let index = start; index < this.work.innerRadius.length; index++) {
          const current = this.work.innerRadius[index] || 0;
          const target = this.work.outerRadius[index] - 0.09;
          this.work.innerRadius[index] = Math.min(target, current + openingDelta);
        }
      }
    } else {
      const shapingTool =
        this.gesture.tool === "smooth"
          ? "smooth"
          : this.gesture.tool === "collar"
            ? "collar"
            : "finger";
      this.work.outerRadius = applySweptDeformation(this.work.outerRadius, samples, {
        tool: shapingTool,
        relaxed: this.work.mode === "relaxed"
      });
      this.work.innerRadius = synchronizeInnerWall(
        previousOuter,
        this.work.outerRadius,
        this.work.innerRadius
      );
    }

    const changed =
      this.profileChanged(previousOuter, this.work.outerRadius) ||
      this.profileChanged(previousInner, this.work.innerRadius);
    if (!changed) return false;
    this.gesture.changed = true;
    this.engine?.update(this.work, renderNow);
    if (this.data.saveState !== "未保存") this.setData({ saveState: "未保存" });
    return true;
  },

  commitGestureChange() {
    if (!this.work || !this.gesture) return;
    if (this.gesture.type === "edit") this.flushShapingFrame(true);
    if (this.gesture.type !== "edit" || !this.gesture.changed) return;
    this.history.push(this.gesture.snapshot);
    if (this.history.length > 50) this.history.shift();
    this.future = [];
    this.changed(false);
    if (!this.firstDeformTracked && this.work.currentStage === "shaping") {
      track("first_deform", {
        gesture_type: this.gesture.tool,
        quality_tier: (wx.getStorageSync("palm-kiln-settings") || {}).quality || "medium"
      });
      this.firstDeformTracked = true;
    }
    this.setData({
      hint:
        this.gesture.tool === "smooth"
          ? "凹凸已经顺下来，可以继续轻抹局部"
          : "很好，轮廓已经跟着手指变了",
      showHint: true
    });
    wx.setStorageSync("palm-kiln-tutorial-seen", true);
    this.gesture.changed = false;
  },

  inputPoint(x: number, y: number, event: WechatMiniprogramTouchEvent): ShapingInputPoint {
    return { x, y, timestamp: this.eventTimestamp(event) };
  },

  eventTimestamp(event: WechatMiniprogramTouchEvent): number {
    return Number.isFinite(event.timeStamp) ? (event.timeStamp as number) : Date.now();
  },

  local(touch: WechatMiniprogramTouch): { x: number; y: number } {
    return {
      x: touch.clientX - (this.rect?.left || 0),
      y: touch.clientY - (this.rect?.top || 0)
    };
  },

  hitPot(x: number, y: number): boolean {
    if (!this.rect) return false;
    return (
      this.engine?.hitTest(x, y) ??
      (x > this.rect.width * 0.19 &&
        x < this.rect.width * 0.81 &&
        y > this.rect.height * 0.08 &&
        y < this.rect.height * this.data.baseScreenY)
    );
  },

  profilePositionAt(y: number): number {
    if (!this.work || !this.rect) return 0;
    if (this.engine) return this.engine.profilePositionAtCanvasY(y);
    const bottom = this.rect.height * this.data.baseScreenY;
    const top = Math.max(this.rect.height * 0.08, bottom - this.rect.height * 0.54);
    const position = clamp((bottom - y) / Math.max(1, bottom - top), 0, 1);
    return position * (this.work.outerRadius.length - 1);
  },

  distance(a: WechatMiniprogramTouch, b: WechatMiniprogramTouch): number {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  },

  profileChanged(before: number[], after: number[]): boolean {
    if (before.length !== after.length) return true;
    return before.some((value, index) => Math.abs(value - after[index]) > 1e-7);
  },

  contactShadowWidth(): number {
    const footRadius = this.work?.outerRadius[0] || 0.5;
    return Math.round(clamp(145 + footRadius * 150, 180, 315));
  },

  setWheelState(state: Exclude<PotteryRotationState, "reduced">, reduced?: boolean) {
    const shouldReduce = reduced === undefined ? this.data.reduceMotion : reduced;
    const actualState: PotteryRotationState = shouldReduce ? "reduced" : state;
    const maxRadius = this.work?.outerRadius.length
      ? Math.max(...this.work.outerRadius)
      : 0.72;
    const rpm = calculatePotteryTargetRpm(maxRadius, actualState);
    this.engine?.setRotationState(actualState);
    this.setData({
      wheelState: state,
      wheelRpm: Math.round(rpm * 10) / 10,
      wheelPeriodMs: rpm > 0 ? Math.round(potteryRpmToPeriodMs(rpm)) : 1600,
      wheelPaused: rpm === 0,
      contactShadowWidth: this.contactShadowWidth()
    });
  },

  pushHistory() {
    if (!this.work) return;
    this.history.push(cloneWork(this.work));
    if (this.history.length > 50) this.history.shift();
    this.future = [];
  },

  undo() {
    if (!this.work || !this.history.length) return;
    this.future.push(cloneWork(this.work));
    this.work = this.history.pop()!;
    this.changed();
    this.syncData();
    this.setWheelState("idle");
  },

  redo() {
    if (!this.work || !this.future.length) return;
    this.history.push(cloneWork(this.work));
    this.work = this.future.pop()!;
    this.changed();
    this.syncData();
    this.setWheelState("idle");
  },

  resetCamera() {
    this.engine?.resetCamera();
  },

  changed(updateEngine = true) {
    if (!this.work) return;
    this.work.updatedAt = Date.now();
    if (updateEngine) this.engine?.update(this.work);
    this.setData({
      work: this.work,
      saveState: "保存中…",
      canUndo: this.history.length > 0,
      canRedo: this.future.length > 0
    });
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.persist(), 500);
  },

  persist() {
    if (!this.work) return;
    saveWork(this.work);
    this.setData({ saveState: "已保存" });
  },

  completeStage() {
    if (!this.work) return;
    const stage = this.work.currentStage;
    if (stage === "firing" || stage === "refire") {
      this.startKiln(stage === "refire");
      return;
    }
    if (stage === "finished") {
      wx.redirectTo({ url: `/pages/result/result?id=${this.work.workId}` });
      return;
    }
    this.advance();
  },

  advance() {
    if (!this.work) return;
    const completed = this.work.currentStage;
    this.pushHistory();
    this.work.stageIndex = Math.min(STAGES.length - 1, this.work.stageIndex + 1);
    this.work.currentStage = STAGES[this.work.stageIndex].id;
    track("stage_complete", { stage: completed, next_stage: this.work.currentStage });
    this.changed();
    this.syncData();
    this.setData({
      hint: `现在开始${STAGES[this.work.stageIndex].name}`,
      showHint: true
    });
    this.vibrate("medium");
  },

  startKiln(refire: boolean) {
    if (this.data.kiln) return;
    this.setData({
      kiln: true,
      kilnProgress: 0,
      kilnText: refire ? "彩绘正在定色" : "窑温缓缓升高"
    });
    let progress = 0;
    this.kilnTimer = setInterval(() => {
      progress += 4;
      this.setData({
        kilnProgress: progress,
        kilnText:
          progress < 34 ? "窑温缓缓升高" : progress < 70 ? "釉面正在熔融" : "慢慢冷却显色"
      });
      if (progress >= 100) this.finishKiln();
    }, 120);
  },

  skipKiln() {
    this.finishKiln();
  },

  finishKiln() {
    if (this.kilnTimer) {
      clearInterval(this.kilnTimer);
      this.kilnTimer = null;
    }
    this.setData({ kiln: false, kilnProgress: 100 });
    this.advance();
  },

  vibrate(type = "light") {
    const settings = wx.getStorageSync("palm-kiln-settings") || {};
    if (settings.haptics) wx.vibrateShort({ type });
  }
});
