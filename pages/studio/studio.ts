import { CLAYS, GLAZES, SHAPES, ClayId, ShapeId, STAGES, TOOLS } from "../../core/catalog";
import { cloneWork, createWork, PotteryWork } from "../../core/model";
import {
  applySweptDeformation,
  applyVerticalThrowing,
  measureWallThickness,
  setWallThickness,
  ShapingForm,
  synchronizeInnerWall
} from "../../core/profile";
import {
  MAX_POTTERY_WALL,
  MIN_POTTERY_WALL,
  POTTERY_MODEL_UNIT_MILLIMETERS
} from "../../core/pottery-dimensions";
import { PotteryEngine } from "../../core/pottery-engine";
import {
  calculatePotteryBaseScreenY,
  calculatePotteryBaseScreenYFromLayout,
  calculatePotteryTargetRpm,
  potteryRpmToPeriodMs,
  PotteryRotationState
} from "../../core/pottery-scene";
import {
  ShapingMotion,
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
  form: ShapingForm;
  motion: ShapingMotion;
  changed: boolean;
  snapshot: PotteryWork;
  input: ShapingInputSession | null;
  pending: SweptInputSample[];
}

interface CameraGesture {
  type: "camera2";
  distance: number;
  x: number;
  y: number;
  angle: number;
}

type StudioGesture = EditGesture | CameraGesture;

const SHAPING_FORMS: { id: ShapingForm; name: string; note: string }[] = [
  { id: "curve", name: "曲线", note: "圆润过渡" },
  { id: "cone", name: "锥形", note: "集中塑出肩线" },
  { id: "square", name: "方形", note: "形成平直器壁" }
];

const SHAPE_OPTIONS = (["vase", "cup", "bowl", "jar", "plate"] as ShapeId[])
  .map((id) => SHAPES.find((item) => item.id === id)!)
  .filter(Boolean);

const MOTION_LABELS: Record<ShapingMotion, string> = {
  stretch: "向外拉伸 · 放宽器腹",
  compress: "向内压缩 · 收紧器壁",
  "smooth-up": "向上抹平 · 器身升高，泥壁自然变薄",
  "smooth-down": "向下抹平 · 器身降低，泥壁自然回厚",
  steady: "单指贴近器壁开始塑形"
};

// Ten slider steps per displayed millimetre keeps thin-wall control precise.
const WALL_SLIDER_SCALE = POTTERY_MODEL_UNIT_MILLIMETERS * 10;
const WALL_SLIDER_MIN = Math.round(MIN_POTTERY_WALL * WALL_SLIDER_SCALE);
const WALL_SLIDER_MAX = Math.round(MAX_POTTERY_WALL * WALL_SLIDER_SCALE);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function wallThicknessLabel(thickness: number): string {
  if (thickness <= 0.026) return "极薄";
  if (thickness <= 0.045) return "轻薄";
  if (thickness <= 0.085) return "适中";
  if (thickness <= 0.135) return "厚实";
  return "加厚";
}

Page({
  data: {
    ready: false,
    fallback: false,
    statusBarHeight: 20,
    work: null as PotteryWork | null,
    stages: STAGES,
    stageIndex: 0,
    stageName: "制坯",
    tools: TOOLS.shaping,
    tool: "",
    toolName: "手势塑形",
    shapingForms: SHAPING_FORMS,
    shapingForm: "curve" as ShapingForm,
    shapeOptions: SHAPE_OPTIONS,
    clayOptions: CLAYS,
    shapeName: "瓶",
    clayName: "白瓷泥",
    shapeMenuOpen: false,
    clayMenuOpen: false,
    glazes: GLAZES,
    glazeId: "celadon",
    paintColors: ["#315e73", "#a95955", "#d0b17c", "#202822", "#f1eee4", "#657858"],
    symmetryLabels: ["无对称", "左右镜像", "四向环绕"],
    canUndo: false,
    canRedo: false,
    saveState: "已保存",
    hint: "按住器身，向外轻轻推",
    cameraHelp: "单指推拉并上下抹平；双指环看与缩放。缩小后仍可继续上拉，点回正完整看全器形。",
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
    contactShadowWidth: 220,
    wallThicknessMin: WALL_SLIDER_MIN,
    wallThicknessMax: WALL_SLIDER_MAX,
    wallThicknessValue: 70,
    wallThicknessText: "7.0 mm",
    wallThicknessLabel: "适中",
    wallAdjusting: false
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
  layoutStageIndex: -1,
  wallThicknessSnapshot: null as PotteryWork | null,
  wallThicknessDirty: false,
  lastWallUiUpdate: 0,

  onLoad(query: any) {
    const system = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({ statusBarHeight: Math.max(20, system.statusBarHeight || 20) });
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
    this.commitWallThicknessChange();
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
    this.commitWallThicknessChange();
    this.persist();
    this.engine?.destroy();
    if (this.saveTimer) clearTimeout(this.saveTimer);
    if (this.kilnTimer) clearInterval(this.kilnTimer);
  },

  initCanvas() {
    const query = wx.createSelectorQuery().in(this);
    query.select("#potteryCanvas").fields({ node: true, size: true, rect: true });
    query.select("#wheelRoot").boundingClientRect();
    query.exec((results: any[]) => {
        const info = results && results[0];
        const wheelInfo = results && results[1];
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
          const baseScreenY = wheelInfo
            ? calculatePotteryBaseScreenYFromLayout(
                info.top || 0,
                info.height,
                wheelInfo.top
              )
            : calculatePotteryBaseScreenY(system.windowHeight || info.height);
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
    const layoutChanged = this.layoutStageIndex !== this.work.stageIndex;
    this.layoutStageIndex = this.work.stageIndex;
    this.setData(
      {
        work: this.work,
        stageIndex: this.work.stageIndex,
        stageName: stage.name,
        tools,
        tool: selected?.id || "",
        toolName: selected?.name || "",
        glazeId: this.work.glazeId,
        shapeName: SHAPES.find((item) => item.id === this.work!.shapeId)?.glyph || "瓶",
        clayName: CLAYS.find((item) => item.id === this.work!.clayId)?.name || "白瓷泥",
        canUndo: this.history.length > 0,
        canRedo: this.future.length > 0,
        contactShadowWidth: this.contactShadowWidth(),
        ...this.wallThicknessData()
      },
      () => {
        if (layoutChanged) setTimeout(() => this.refreshCanvasLayout(), 0);
      }
    );
  },

  wallThicknessData() {
    const thickness = this.work
      ? measureWallThickness(this.work.outerRadius, this.work.innerRadius)
      : 0.07;
    return {
      wallThicknessValue: Math.round(
        clamp(thickness, MIN_POTTERY_WALL, MAX_POTTERY_WALL) * WALL_SLIDER_SCALE
      ),
      wallThicknessText: `${(
        thickness * POTTERY_MODEL_UNIT_MILLIMETERS
      ).toFixed(1)} mm`,
      wallThicknessLabel: wallThicknessLabel(thickness)
    };
  },

  syncWallThicknessData(force = false) {
    if (!this.work || this.work.stageIndex !== 0 || this.wallThicknessSnapshot) return;
    const now = Date.now();
    if (!force && now - this.lastWallUiUpdate < 72) return;
    this.lastWallUiUpdate = now;
    this.setData(this.wallThicknessData());
  },

  applyWallThicknessValue(value: number) {
    if (!this.work || this.work.stageIndex !== 0) return;
    const requestedValue = Number.isFinite(value)
      ? value
      : Number(this.data.wallThicknessValue);
    const sliderValue = Math.round(
      clamp(requestedValue, WALL_SLIDER_MIN, WALL_SLIDER_MAX)
    );
    if (!this.wallThicknessSnapshot) {
      this.wallThicknessSnapshot = cloneWork(this.work);
      this.wallThicknessDirty = false;
    }
    const previousInner = this.work.innerRadius.slice();
    this.work.innerRadius = setWallThickness(
      this.work.outerRadius,
      this.work.innerRadius,
      sliderValue / WALL_SLIDER_SCALE
    );
    const changed = this.profileChanged(previousInner, this.work.innerRadius);
    if (changed) {
      this.wallThicknessDirty = true;
      this.engine?.update(this.work);
    }
    const thickness = measureWallThickness(this.work.outerRadius, this.work.innerRadius);
    this.setData({
      wallThicknessText: `${(
        thickness * POTTERY_MODEL_UNIT_MILLIMETERS
      ).toFixed(1)} mm`,
      wallThicknessLabel: wallThicknessLabel(thickness),
      wallAdjusting: true,
      saveState: "未保存"
    });
  },

  changeWallThickness(event: any) {
    this.applyWallThicknessValue(Number(event.detail?.value));
  },

  finishWallThickness(event: any) {
    this.applyWallThicknessValue(Number(event.detail?.value));
    this.commitWallThicknessChange();
  },

  commitWallThicknessChange() {
    const snapshot = this.wallThicknessSnapshot;
    if (!snapshot) return;
    const changed = !!snapshot && this.wallThicknessDirty;
    this.wallThicknessSnapshot = null;
    this.wallThicknessDirty = false;
    if (snapshot && changed) {
      this.history.push(snapshot);
      if (this.history.length > 50) this.history.shift();
      this.future = [];
      this.changed(false);
      this.vibrate();
    }
    this.setData({ wallAdjusting: false });
    this.syncWallThicknessData(true);
  },

  refreshCanvasLayout() {
    if (!this.engine || !this.canvas) return;
    const query = wx.createSelectorQuery().in(this);
    query.select("#potteryCanvas").fields({ size: true, rect: true });
    query.select("#wheelRoot").boundingClientRect();
    query.exec((results: any[]) => {
      const info = results && results[0];
      const wheelInfo = results && results[1];
      if (!info?.width || !info?.height || !wheelInfo) return;
      this.rect = {
        left: info.left || 0,
        top: info.top || 0,
        width: info.width,
        height: info.height
      };
      const system = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const dpr = Math.min(system.pixelRatio || 2, 2);
      const baseScreenY = calculatePotteryBaseScreenYFromLayout(
        info.top || 0,
        info.height,
        wheelInfo.top
      );
      this.engine?.resize(info.width, info.height, dpr);
      this.engine?.setBaseScreenY(baseScreenY);
      this.setData({
        baseScreenY,
        baseScreenPercent: Math.round(baseScreenY * 1000) / 10
      });
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

  chooseShapingForm(event: WechatMiniprogramTouchEvent) {
    const form = event.currentTarget.dataset.id as ShapingForm;
    const selected = SHAPING_FORMS.find((item) => item.id === form);
    if (!selected) return;
    this.setData({
      shapingForm: selected.id,
      showHint: false
    });
    this.vibrate();
  },

  toggleShapeMenu() {
    this.setData({
      shapeMenuOpen: !this.data.shapeMenuOpen,
      clayMenuOpen: false
    });
  },

  toggleClayMenu() {
    this.setData({
      clayMenuOpen: !this.data.clayMenuOpen,
      shapeMenuOpen: false
    });
  },

  chooseBaseShape(event: WechatMiniprogramTouchEvent) {
    if (!this.work || this.work.stageIndex !== 0) return;
    const shapeId = event.currentTarget.dataset.id as ShapeId;
    const selected = SHAPES.find((item) => item.id === shapeId);
    if (!selected) return;
    if (shapeId === this.work.shapeId) {
      this.setData({ shapeMenuOpen: false });
      return;
    }

    const defaultTitle = SHAPES.some((item) => this.work!.title === `我的${item.name}`);
    const template = createWork(shapeId, this.work.clayId, "free");
    this.pushHistory();
    this.work.shapeId = shapeId;
    this.work.mode = "free";
    this.work.height = template.height;
    this.work.outerRadius = template.outerRadius;
    this.work.innerRadius = template.innerRadius;
    if (defaultTitle) this.work.title = `我的${selected.name}`;
    this.setData({ shapeMenuOpen: false });
    this.changed();
    this.syncData();
    this.setWheelState("idle");
    this.vibrate();
  },

  chooseClay(event: WechatMiniprogramTouchEvent) {
    if (!this.work || this.work.stageIndex !== 0) return;
    const clayId = event.currentTarget.dataset.id as ClayId;
    if (!CLAYS.some((item) => item.id === clayId)) return;
    if (clayId === this.work.clayId) {
      this.setData({ clayMenuOpen: false });
      return;
    }

    this.pushHistory();
    this.work.clayId = clayId;
    this.work.mode = "free";
    this.setData({ clayMenuOpen: false });
    this.changed();
    this.syncData();
    this.vibrate();
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
    this.commitWallThicknessChange();
    const touches = event.touches;
    if (touches.length >= 2) {
      this.commitGestureChange();
      this.gesture = this.cameraGesture(touches[0], touches[1]);
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
      // A lone finger never controls the camera. Starting outside the piece is
      // intentionally inert so accidental background drags cannot change view.
      this.gesture = null;
      return;
    }

    const shaping = this.work.currentStage === "shaping";
    const side: -1 | 1 = local.x < this.rect.width / 2 ? -1 : 1;
    const input = shaping
        ? new ShapingInputSession({
            viewportWidth: this.rect.width,
            viewportHeight: this.rect.height,
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
      tool: shaping ? "gesture" : this.data.tool,
      form: this.data.shapingForm as ShapingForm,
      motion: "steady",
      changed: false,
      snapshot: cloneWork(this.work),
      input,
      pending: []
    };
    this.setWheelState(shaping ? "shaping" : "idle");
  },

  touchMove(event: WechatMiniprogramTouchEvent) {
    if (!this.work || !this.rect) return;
    const touches = event.touches;
    if (touches.length >= 2) {
      const distance = this.distance(touches[0], touches[1]);
      const x = (touches[0].clientX + touches[1].clientX) / 2;
      const y = (touches[0].clientY + touches[1].clientY) / 2;
      const angle = this.touchAngle(touches[0], touches[1]);
      if (!this.gesture || this.gesture.type !== "camera2") {
        this.commitGestureChange();
        this.gesture = { type: "camera2", distance, x, y, angle };
        this.setWheelState("orbit");
      } else {
        if (this.gesture.distance > 2 && distance > 2) {
          this.engine?.dolly(distance / this.gesture.distance);
        }
        const twist = this.angleDelta(angle, this.gesture.angle);
        const twistPixels = (twist * this.rect.width * 0.58) / (Math.PI * 2);
        this.engine?.orbit(x - this.gesture.x + twistPixels, y - this.gesture.y);
        this.gesture.distance = distance;
        this.gesture.x = x;
        this.gesture.y = y;
        this.gesture.angle = angle;
      }
      return;
    }

    if (!this.gesture || this.gesture.type === "camera2") return;
    const touch = touches[0];
    if (!touch) return;

    if (this.gesture.type === "edit" && this.work.currentStage === "shaping") {
      const local = this.local(touch);
      const samples = this.gesture.input?.push(
        this.inputPoint(local.x, local.y, event),
        (canvasY) => this.profilePositionAt(canvasY)
      );
      if (samples?.length) {
        this.gesture.pending.push(...samples);
        for (let index = samples.length - 1; index >= 0; index--) {
          const motion = samples[index].motion;
          if (motion && motion !== "steady") {
            this.gesture.motion = motion;
            break;
          }
        }
      }
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
    this.commitGestureChange();
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
    const previousHeight = this.work.height;
    const relaxed = this.work.mode === "relaxed";
    const sweptOuter = applySweptDeformation(this.work.outerRadius, samples, {
      tool: "finger",
      form: this.gesture.form,
      relaxed
    });
    const verticalThrow = applyVerticalThrowing(
      sweptOuter,
      this.work.height,
      samples,
      relaxed
    );
    this.work.outerRadius = verticalThrow.profile;
    this.work.height = verticalThrow.height;
    this.work.innerRadius = synchronizeInnerWall(
      previousOuter,
      this.work.outerRadius,
      this.work.innerRadius,
      previousHeight,
      this.work.height
    );
    this.syncWallThicknessData(false);

    const changed =
      this.profileChanged(previousOuter, this.work.outerRadius) ||
      this.profileChanged(previousInner, this.work.innerRadius) ||
      Math.abs(previousHeight - this.work.height) > 1e-7;
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
        gesture_type: this.gesture.motion,
        shaping_form: this.gesture.form,
        quality_tier: (wx.getStorageSync("palm-kiln-settings") || {}).quality || "medium"
      });
      this.firstDeformTracked = true;
    }
    this.setData({
      hint: MOTION_LABELS[this.gesture.motion],
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

  touchAngle(a: WechatMiniprogramTouch, b: WechatMiniprogramTouch): number {
    const first = a.identifier <= b.identifier ? a : b;
    const second = first === a ? b : a;
    return Math.atan2(
      second.clientY - first.clientY,
      second.clientX - first.clientX
    );
  },

  angleDelta(next: number, previous: number): number {
    const turn = Math.PI * 2;
    return ((next - previous + Math.PI) % turn + turn) % turn - Math.PI;
  },

  cameraGesture(
    a: WechatMiniprogramTouch,
    b: WechatMiniprogramTouch
  ): CameraGesture {
    return {
      type: "camera2",
      distance: this.distance(a, b),
      x: (a.clientX + b.clientX) / 2,
      y: (a.clientY + b.clientY) / 2,
      angle: this.touchAngle(a, b)
    };
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
    this.commitWallThicknessChange();
    if (!this.work || !this.history.length) return;
    this.future.push(cloneWork(this.work));
    this.work = this.history.pop()!;
    this.changed();
    this.syncData();
    this.setWheelState("idle");
  },

  redo() {
    this.commitWallThicknessChange();
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
    this.commitWallThicknessChange();
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
