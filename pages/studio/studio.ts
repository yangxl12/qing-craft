import {
  CLASSIC_GLAZES,
  CLAYS,
  SHAPES,
  ClayId,
  ShapeId,
  STAGES,
  TOOLS
} from "../../core/catalog";
import { cloneWork, createWork, PotteryWork } from "../../core/model";
import {
  ALL_DECORATION_MOTIFS,
  anchorRange,
  applyDecorationTemplate,
  availableAnchors,
  BLESSINGS,
  BORDERS,
  clampDecorationLayer,
  clampSealMark,
  createDecorationComposition,
  createDecorationLayer,
  createDecorationStamp,
  createSealMark,
  duplicateDecorationLayer,
  DecorationAnchor,
  DecorationLayer,
  DecorationStamp,
  DecorationTechnique,
  defaultInscription,
  INSCRIPTION_LAYOUTS,
  INSCRIPTION_STYLES,
  INSCRIPTION_TYPEFACES,
  Inscription,
  MAX_DECORATION_STAMPS,
  MAX_SEAL_MARK_CHARACTERS,
  MOTIFS,
  motifById,
  PALETTES,
  REPEAT_LABELS,
  retargetStyle,
  SEAL_MARK_COLOR_OPTIONS,
  SealMarkColorId,
  STYLE_PACKS,
  StylePackId,
  TECHNIQUE_LABELS,
  validateInscriptionText,
  DECORATION_TEMPLATES
} from "../../core/decoration";
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
import {
  loadPrivateMarks,
  loadWork,
  savePrivateMark,
  saveWork
} from "../../services/storage";
import { track } from "../../services/analytics";
import { runConfirmedAction } from "../../utils/destructive-actions";
import {
  GuidanceHintKind,
  GuidanceLevel,
  loadSettings,
  shouldShowGuidance
} from "../../utils/settings";
import { resolveRenderDpr } from "../../utils/render-quality";

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

interface DecorGesture {
  type: "decor";
  x: number;
  y: number;
  layerId: string;
  changed: boolean;
  snapshot: PotteryWork;
}

interface SealGesture {
  type: "seal";
  x: number;
  y: number;
  changed: boolean;
  snapshot: PotteryWork;
}

type StudioGesture = EditGesture | CameraGesture | DecorGesture | SealGesture;

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

// Two fingers travel as a pair, so their midpoint covers less screen than a
// lone finger; boost yaw and pitch so one stroke still sweeps a full turn and
// can flip the piece completely over.
const TWO_FINGER_ORBIT_GAIN = 1.5;
const SEAL_MARK_SELECTION_ID = "seal_mark";
const KILN_DURATION_MS = 20_000;
const KILN_TICK_MS = 100;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function kilnVisualState(refire: boolean, progress: number) {
  const safeProgress = clamp(progress, 0, 100);
  const ratio = safeProgress / 100;
  const startTemperature = refire ? 40 : 80;
  const targetTemperature = refire ? 820 : 1300;
  const temperature = Math.round(
    (startTemperature + (targetTemperature - startTemperature) * ratio) / 10
  ) * 10;
  const phaseIndex = safeProgress < 24 ? 0 : safeProgress < 52 ? 1 : safeProgress < 80 ? 2 : 3;
  const phases = refire
    ? ["温窑 · 彩面回暖", "升温 · 颜料定色", "恒火 · 花色入釉", "烤花 · 色泽安定"]
    : ["封窑 · 炉火初醒", "升焰 · 坯体转暖", "正烧 · 釉色熔融", "满火 · 器身通红"];
  const heatClass = safeProgress < 10
    ? "original"
    : safeProgress < 36
      ? "yellow"
      : safeProgress < 64
        ? "orange"
        : safeProgress < 86
          ? "red"
          : "hot";
  return {
    kilnProgress:Math.round(safeProgress * 10) / 10,
    kilnText:phases[phaseIndex],
    kilnType:refire ? "low" : "high",
    kilnTitle:refire ? "低温烤花" : "高温烧制",
    kilnSeal:refire ? "彩" : "火",
    kilnBackground: refire
      ? "/pages/studio/assets/lowBg.jpg"
      : "/pages/studio/assets/highBg.jpg",
    kilnTemperature:temperature,
    kilnTargetTemperature:targetTemperature,
    kilnHeatClass:heatClass
  };
}

function wallThicknessLabel(thickness: number): string {
  if (thickness <= 0.026) return "极薄";
  if (thickness <= 0.045) return "轻薄";
  if (thickness <= 0.085) return "适中";
  if (thickness <= 0.135) return "厚实";
  return "加厚";
}

type DecorCatalogTabId = "pattern" | "ornament" | "inscription" | "carving";
type PaintCatalogTabId = "pattern" | "ornament" | "color";

const DECOR_CATALOG_TABS: { id: DecorCatalogTabId; name: string; seal: string }[] = [
  { id:"pattern", name:"图案", seal:"绘" },
  { id:"ornament", name:"纹样", seal:"纹" },
  { id:"inscription", name:"写款", seal:"款" },
  { id:"carving", name:"刻花", seal:"刻" }
];

const PAINT_CATALOG_TABS: { id: PaintCatalogTabId; name: string; seal: string }[] = [
  { id:"pattern", name:"图案", seal:"彩" },
  { id:"ornament", name:"纹样", seal:"纹" },
  { id:"color", name:"涂色", seal:"色" }
];

const PAINT_PATTERN_MOTIF_IDS = [
  "plum",
  "peony",
  "crane",
  "butterfly",
  "bat",
  "lotus",
  "cloud",
  "longevity",
  "bamboo"
];

function paintCatalogPool(tab: PaintCatalogTabId, shapeId: ShapeId) {
  const available = availableAnchors(shapeId);
  const source = tab === "ornament"
    ? BORDERS
    : PAINT_PATTERN_MOTIF_IDS
        .map((id) => MOTIFS.find((motif) => motif.id === id))
        .filter((motif): motif is (typeof MOTIFS)[number] => !!motif);
  return source.filter((motif) => motif.anchors.some((anchor) => available.includes(anchor)));
}

const DECOR_SIDE_MENUS = [
  { id:"flora", name:"花卉", icon:"flower", index:0 },
  { id:"animal", name:"瑞兽", icon:"animal", index:1 },
  { id:"water", name:"云水", icon:"wave", index:2 },
  { id:"geometry", name:"几何", icon:"geometry", index:3 }
] as const;

function stageProgressSteps(currentIndex: number) {
  return STAGES.map((stage, index) => ({
    id:stage.id,
    short:stage.short,
    name:stage.name,
    state:index < currentIndex ? "done" : index === currentIndex ? "current" : "future"
  }));
}

function rotateOptions<T>(values: T[], offset: number, count = 6): T[] {
  if (!values.length) return [];
  return Array.from({ length:Math.min(count, values.length) }, (_, index) =>
    values[(offset + index) % values.length]
  );
}

function decorCatalogPool(tab: DecorCatalogTabId, menuIndex: number) {
  if (tab === "pattern") {
    const families = ["flora", "animal", "cloud_water", "symbol"];
    const family = families[menuIndex] || "geometry";
    const familyItems = MOTIFS.filter((motif) =>
      motif.family === family || (menuIndex === 3 && motif.family === "geometry")
    );
    return familyItems.length >= 3 ? familyItems : rotateOptions(MOTIFS, menuIndex * 4);
  }
  if (tab === "ornament") return rotateOptions(BORDERS, menuIndex * 2, 6);
  if (tab === "inscription") {
    return rotateOptions(MOTIFS.filter((motif) => motif.roles.includes("stamp")), menuIndex * 3, 6);
  }
  return rotateOptions(MOTIFS.filter((motif) => motif.techniques.includes("incise")), menuIndex * 3, 6);
}

function decorCatalogRole(tab: DecorCatalogTabId): "main" | "border" | "stamp" {
  if (tab === "ornament") return "border";
  if (tab === "inscription") return "stamp";
  return "main";
}

function decorCatalogTechnique(tab: DecorCatalogTabId, motifId: string): DecorationTechnique {
  const motif = motifById(motifId);
  if (tab === "carving") return "incise";
  if (tab === "inscription" && motif.techniques.includes("stamp")) return "stamp";
  if (motif.techniques.includes("underglaze")) return "underglaze";
  return motif.techniques[0];
}

function decorCatalogColor(tab: DecorCatalogTabId, technique: DecorationTechnique): string {
  if (technique === "incise") return "clay_shadow";
  if (tab === "inscription") return "jade_shadow";
  return tab === "ornament" ? "cobalt_light" : "cobalt";
}

Page({
  data: {
    ready: false,
    fallback: false,
    statusBarHeight: 20,
    work: null as PotteryWork | null,
    stageIndex: 0,
    stageName: "制坯",
    nextStageName: "装饰",
    stageSteps: stageProgressSteps(0),
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
    glazes: CLASSIC_GLAZES,
    glazeId: "celadon",
    glazeName: CLASSIC_GLAZES[0].name,
    paintColors: [
      { id:"cobalt", name:"青花蓝", color:"#315e73" },
      { id:"seal_red", name:"印红", color:"#a84f43" },
      { id:"amber", name:"窑火金", color:"#bb7b46" },
      { id:"ink", name:"松烟", color:"#27322d" },
      { id:"porcelain", name:"瓷白", color:"#eee9dc" },
      { id:"moss", name:"苔绿", color:"#657858" }
    ],
    paintTabs: PAINT_CATALOG_TABS,
    paintTab: "pattern" as PaintCatalogTabId,
    paintCatalogItems: [] as any[],
    paintLayers: [] as any[],
    paintLayerCount: 0,
    hasSelectedPaintItem: false,
    decorMode: "template",
    decorSection: "main",
    decorTabs: DECOR_CATALOG_TABS,
    decorTab: "pattern" as DecorCatalogTabId,
    decorSideMenus: DECOR_SIDE_MENUS,
    decorMenuId: DECOR_SIDE_MENUS[0].id,
    decorCatalogItems: [] as any[],
    sealColors: SEAL_MARK_COLOR_OPTIONS,
    sealText: "",
    sealTextLength: 0,
    sealTextLimit: MAX_SEAL_MARK_CHARACTERS,
    sealColorId: "seal_red" as SealMarkColorId,
    sealApplied: false,
    decorTrayOpen: true,
    decorFullscreen: false,
    decorToolsCollapsed: false,
    decorToolStyle: "",
    stylePacks: STYLE_PACKS,
    stylePackId: "yuan_blue",
    templates: DECORATION_TEMPLATES.map((item) => ({ ...item, glyph:item.name.slice(0, 1), recommended:true })),
    motifs: MOTIFS,
    stampMotifs: MOTIFS.filter((item) => item.roles.includes("stamp")),
    borders: BORDERS,
    palettes: PALETTES,
    decorationLayers: [] as any[],
    selectedDecorationId: "",
    selectedDecoration: null as any,
    hasSelectedDecorItem: false,
    selectedDecorationIsSeal: false,
    selectedDecorationLabel: "图案",
    selectedDecorationName: "",
    selectedTechniqueName: "",
    selectedRepeatName: "",
    decorationCount: 0,
    stampCount: 0,
    selectedItemCount: 0,
    pendingStampMotifId: "",
    firedPreview: false,
    accentColorId: "",
    inscriptionDraft: defaultInscription() as Inscription,
    inscriptionError: "",
    inscriptionLayouts: INSCRIPTION_LAYOUTS,
    inscriptionStyles: INSCRIPTION_STYLES,
    inscriptionTypefaces: INSCRIPTION_TYPEFACES,
    inscriptionContentTypes: [
      { id:"signature", name:"署名" },
      { id:"date", name:"日期" },
      { id:"blessing", name:"祝语" },
      { id:"serial", name:"编号" }
    ],
    inscriptionAnchors: [
      { id:"base", name:"器底" },
      { id:"well", name:"盘心侧记" },
      { id:"lower_belly", name:"外壁下部" }
    ],
    blessings: BLESSINGS,
    privateMarks: [] as any[],
    canUndo: false,
    canRedo: false,
    saveState: "已保存",
    hint: "按住器身，向外轻轻推",
    cameraHelp: "单指推拉并上下抹平；双指环看与缩放，可整圈环视、上下翻转到任意角度并贴近细看纹样。点回正完整看全器形。",
    showHint: false,
    kiln: false,
    kilnProgress: 0,
    kilnText: "入窑预热",
    kilnType: "high",
    kilnTitle: "高温烧制",
    kilnSeal: "火",
    kilnBackground: "/pages/studio/assets/highBg.jpg",
    kilnTemperature: 80,
    kilnTargetTemperature: 1300,
    kilnHeatClass: "original",
    showHelp: false,
    reduceMotion: false,
    guidance: "relaxed" as GuidanceLevel,
    confirmingReturn: false,
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
  guidanceTimer: null as any,
  kilnTimer: null as any,
  kilnStartedAt: 0,
  firstDeformTracked: false,
  layoutStageIndex: -1,
  wallThicknessSnapshot: null as PotteryWork | null,
  wallThicknessDirty: false,
  lastWallUiUpdate: 0,
  decorEnterTracked: false,
  decorateStartedAt: 0,
  previewStartedAt: 0,
  decorPanelDrag: null as null | {
    grabX: number;
    grabY: number;
    areaLeft: number;
    areaTop: number;
    width: number;
    height: number;
  },

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
    // 旧版草稿可能停在半浸、刷涂或泼釉。新版上釉页只有完整施釉，
    // 进入该阶段时统一归一化，保证当前器身与六枚釉样的预期一致。
    if (work.currentStage === "glaze") {
      work.glazeMethod = "full";
      if (!CLASSIC_GLAZES.some((item) => item.id === work.glazeId)) {
        work.glazeId = CLASSIC_GLAZES[0].id;
      }
    }
    const inscriptionDraft = work.decorationComposition.inscription
      ? JSON.parse(JSON.stringify(work.decorationComposition.inscription)) as Inscription
      : defaultInscription();
    const sealMark = work.decorationComposition.sealMark;
    const firstPaintLayer = work.currentStage === "paint"
      ? work.decorationComposition.layers.find((layer) => layer.technique === "overglaze")
      : undefined;
    this.setData({
      inscriptionDraft,
      privateMarks:loadPrivateMarks(),
      selectedDecorationId:firstPaintLayer?.layerId || "",
      ...(sealMark ? {
        sealText:sealMark.text,
        sealTextLength:Array.from(sealMark.text).length,
        sealColorId:sealMark.colorId
      } : {})
    });
    this.syncData();
    if (work.currentStage === "decorate") this.trackDecorEnter();
    // 草稿若停在窑烧工序（上次烧制被打断），重新进入时直接续烧，不再回到待机过渡页。
    this.igniteKilnIfPending();
  },

  onReady() {
    setTimeout(() => this.initCanvas(), 60);
  },

  onHide() {
    this.commitGestureChange();
    this.commitWallThicknessChange();
    this.gesture = null;
    this.persist();
    this.previewFiredEnd();
    this.engine?.setAutoRotate(false);
    this.clearGuidanceTimer();
  },

  onShow() {
    const settings = loadSettings();
    const reduceMotion = settings.reduceMotion;
    this.setData({ reduceMotion, guidance:settings.guidance });
    this.setWheelState("idle", reduceMotion);
    this.scheduleIdleGuidance();
  },

  onUnload() {
    this.commitGestureChange();
    this.commitWallThicknessChange();
    this.persist();
    this.engine?.destroy();
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.clearGuidanceTimer();
    if (this.kilnTimer) clearInterval(this.kilnTimer);
  },

  initCanvas() {
    const query = wx.createSelectorQuery().in(this);
    query.select("#potteryCanvas").fields({ node: true, size: true, rect: true });
    query.select("#wheelContact").boundingClientRect();
    query.exec((results: any[]) => {
        const info = results && results[0];
        const wheelInfo = results && results[1];
        const system = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        const baseScreenY = wheelInfo && info?.height
          ? calculatePotteryBaseScreenYFromLayout(
              info.top || 0,
              info.height,
              wheelInfo.top
            )
          : calculatePotteryBaseScreenY(system.windowHeight || info?.height || 812);
        if (!info?.node) {
          this.setData({
            fallback: true,
            ready: true,
            baseScreenY,
            baseScreenPercent: Math.round(baseScreenY * 1000) / 10
          });
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
          const settings = loadSettings();
          const dpr = resolveRenderDpr(system.pixelRatio || 2, settings.quality);
          const reduceMotion = settings.reduceMotion;
          this.engine.resize(info.width, info.height, dpr);
          this.engine.setBaseScreenY(baseScreenY);
          this.engine.setPotteryCentered(!!this.data.kiln);
          this.engine.setKilnHeat(this.data.kiln ? this.data.kilnProgress / 100 : 0);
          this.engine.setFrameProcessor(() => this.flushShapingFrame(false));
          this.setData({
            ready: true,
            reduceMotion,
            baseScreenY,
            baseScreenPercent: Math.round(baseScreenY * 1000) / 10
          });
          this.setWheelState("idle", reduceMotion);
          this.maybeTutorial();
          this.scheduleIdleGuidance();
        } catch (error) {
          console.error(error);
          this.setData({
            fallback: true,
            ready: true,
            baseScreenY,
            baseScreenPercent: Math.round(baseScreenY * 1000) / 10,
            hint: "已进入轻量模式，作品仍可完成",
            showHint: shouldShowGuidance(this.data.guidance, "error")
          });
        }
    });
  },

  maybeTutorial() {
    const seen = wx.getStorageSync("palm-kiln-tutorial-seen");
    if (!seen && this.work?.mode === "relaxed") {
      this.setGuidanceHint("按住器身向外推；需要观察时用双指环看和缩放", "teaching");
    }
  },

  setGuidanceHint(message: string, kind: GuidanceHintKind = "teaching") {
    this.clearGuidanceTimer();
    const showHint = shouldShowGuidance(this.data.guidance, kind);
    this.setData({ hint:showHint ? message : "", showHint });
  },

  clearGuidanceTimer() {
    if (!this.guidanceTimer) return;
    clearTimeout(this.guidanceTimer);
    this.guidanceTimer = null;
  },

  scheduleIdleGuidance() {
    this.clearGuidanceTimer();
    if (!this.work || this.data.guidance !== "relaxed" || this.data.kiln) return;
    this.guidanceTimer = setTimeout(() => {
      this.guidanceTimer = null;
      if (!this.work || this.data.showHelp || this.data.showHint || this.data.kiln) return;
      const messages = [
        "可以先轻推器腹找轮廓，再用泥壁厚度微调手感",
        "可从左侧挑一枚纹样；右侧只管理已经放上器物的图层",
        "先选一种釉色，器物会立即预览完整施釉效果",
        "烧制会自动完成，也可使用右下角的跳过",
        "可先选图案或颜料，再在器身上调整位置",
        "低温烤花会让釉上彩稳定显色",
        "七道工序已经完成，可以查看成品"
      ];
      this.setGuidanceHint(messages[this.work.stageIndex] || messages[0], "teaching");
    }, 14_000);
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
        nextStageName: STAGES[this.work.stageIndex + 1]?.name || "查看成品",
        stageSteps:stageProgressSteps(this.work.stageIndex),
        tools,
        tool: selected?.id || "",
        toolName: selected?.name || "",
        glazeId: this.work.glazeId,
        glazeName: CLASSIC_GLAZES.find((item) => item.id === this.work!.glazeId)?.name || "",
        shapeName: SHAPES.find((item) => item.id === this.work!.shapeId)?.glyph || "瓶",
        clayName: CLAYS.find((item) => item.id === this.work!.clayId)?.name || "白瓷泥",
        canUndo: this.history.length > 0,
        canRedo: this.future.length > 0,
        contactShadowWidth: this.contactShadowWidth(),
        ...this.decorationData(),
        ...this.wallThicknessData()
      },
      () => {
        if (layoutChanged) setTimeout(() => this.refreshCanvasLayout(), 0);
      }
    );
  },

  decorationData() {
    if (!this.work) return {};
    const composition = this.work.decorationComposition;
    const all: (DecorationLayer | DecorationStamp)[] = [
      ...composition.layers,
      ...composition.stamps
    ];
    const selected = all.find((layer) => layer.layerId === this.data.selectedDecorationId) || null;
    const paintLayers = composition.layers.filter((layer) => layer.technique === "overglaze");
    const selectedPaint = selected?.technique === "overglaze" ? selected as DecorationLayer : null;
    const paintTarget = selectedPaint || paintLayers[0] || null;
    const paintTab = this.data.paintTab as PaintCatalogTabId;
    const activePaintColor = this.data.paintColors.find((item) => item.id === paintTarget?.colorId)
      || this.data.paintColors[1];
    const paintCatalogItems = paintTab === "color"
      ? this.data.paintColors.map((item) => ({
          id:item.id,
          key:`paint:color:${item.id}`,
          kind:"color",
          name:item.name,
          glyph:item.name.slice(0, 1),
          color:item.color,
          checked:paintTarget?.colorId === item.id,
          ariaLabel:paintTarget ? `为${motifById(paintTarget.motifId).name}涂${item.name}` : `用${item.name}开始彩绘`
        }))
      : paintCatalogPool(paintTab, this.work.shapeId).map((motif) => {
          const role = paintTab === "ornament" ? "border" : "accent";
          const key = `paint:${paintTab}:${motif.id}`;
          const match = paintLayers.find((layer) =>
            layer.catalogKey === key ||
            (!layer.catalogKey && layer.motifId === motif.id && layer.role === role)
          );
          return {
            id:motif.id,
            key,
            kind:"motif",
            name:motif.name,
            glyph:motif.glyph,
            color:activePaintColor?.color || "#a84f43",
            checked:!!match,
            ariaLabel:match ? `移除${motif.name}彩绘` : `添加${motif.name}彩绘`,
            layerId:match?.layerId || "",
            patternClass:`motif-ink-${(motif.shaderCode % 6) + 1}`
          };
        });
    const paintLayerCards = paintLayers.map((layer) => {
      const motif = motifById(layer.motifId);
      const color = this.data.paintColors.find((item) => item.id === layer.colorId);
      return {
        id:layer.layerId,
        name:motif.name,
        glyph:motif.glyph,
        roleName:layer.role === "border" ? "彩纹" : "彩图",
        ariaLabel:`选中${motif.name}彩绘进行调整`,
        selected:layer.layerId === this.data.selectedDecorationId,
        visible:layer.visible,
        copyNumber:layer.copyNumber || 0,
        color:color?.color || "#a84f43",
        colorName:color?.name || "釉上彩",
        patternClass:`motif-ink-${(motif.shaderCode % 6) + 1}`
      };
    });
    const sealMark = composition.sealMark;
    const sealSelected = !!sealMark && this.data.selectedDecorationId === SEAL_MARK_SELECTION_ID;
    const roleNames: Record<string, string> = {
      main:"主纹",
      border:"边饰",
      accent:"点彩",
      stamp:"落印"
    };
    const anchors = availableAnchors(this.work.shapeId);
    const compatibleMotifs = MOTIFS.filter((motif) =>
      motif.anchors.some((anchor) => anchors.includes(anchor)) &&
      (this.work!.mode === "free" || motif.stylePackIds.includes(composition.stylePackId))
    );
    const compatibleBorders = BORDERS.filter((motif) =>
      motif.anchors.some((anchor) => anchors.includes(anchor)) &&
      (this.work!.mode === "free" || motif.stylePackIds.includes(composition.stylePackId))
    );
    const menuIndex = DECOR_SIDE_MENUS.find((menu) => menu.id === this.data.decorMenuId)?.index || 0;
    const catalogItems = decorCatalogPool(this.data.decorTab as DecorCatalogTabId, menuIndex).map((motif) => {
      const role = decorCatalogRole(this.data.decorTab as DecorCatalogTabId);
      const technique = decorCatalogTechnique(this.data.decorTab as DecorCatalogTabId, motif.id);
      const key = `${this.data.decorTab}:${motif.id}`;
      const match = all.find((layer) =>
        layer.catalogKey === key ||
        (!layer.catalogKey && layer.motifId === motif.id && layer.role === role && layer.technique === technique)
      );
      return {
        id:motif.id,
        key,
        name:motif.name,
        glyph:motif.glyph,
        role,
        technique,
        checked:!!match,
        layerId:match?.layerId || "",
        patternClass:`motif-ink-${(motif.shaderCode % 6) + 1}`
      };
    });
    const decorationLayers = all.map((layer) => ({
      id:layer.layerId,
      name:motifById(layer.motifId).name,
      glyph:motifById(layer.motifId).glyph,
      roleName:roleNames[layer.role],
      ariaLabel:`选中${roleNames[layer.role]}${motifById(layer.motifId).name}进行调整`,
      selected:layer.layerId === this.data.selectedDecorationId,
      visible:layer.visible,
      copyNumber:layer.copyNumber || 0,
      isSeal:false,
      patternClass:`motif-ink-${(motifById(layer.motifId).shaderCode % 6) + 1}`
    }));
    if (sealMark) {
      decorationLayers.push({
        id:SEAL_MARK_SELECTION_ID,
        name:"题款",
        glyph:Array.from(sealMark.text)[0] || "款",
        roleName:"题款",
        ariaLabel:"选中题款进行调整",
        selected:sealSelected,
        visible:true,
        copyNumber:0,
        isSeal:true,
        patternClass:`seal-mark-art ${sealMark.colorId === "seal_red" ? "motif-ink-5" : sealMark.colorId === "wujin" ? "motif-ink-1" : "motif-ink-3"}`
      });
    }
    return {
      stylePackId:composition.stylePackId,
      motifs:this.work.mode === "relaxed" ? compatibleMotifs.slice(0, 4) : compatibleMotifs,
      stampMotifs:(this.work.mode === "relaxed" ? compatibleMotifs.slice(0, 4) : compatibleMotifs)
        .filter((motif) => motif.roles.includes("stamp")),
      borders:this.work.mode === "relaxed" ? compatibleBorders.slice(0, 4) : compatibleBorders,
      templates:DECORATION_TEMPLATES.map((item) => ({
        ...item,
        glyph:item.name.slice(0, 1),
        recommended:item.recommendedShapes.includes(this.work!.shapeId),
        active:composition.templateId === item.id
      })),
      decorationLayers,
      decorCatalogItems:catalogItems,
      paintCatalogItems,
      paintLayers:paintLayerCards,
      paintLayerCount:paintLayers.length,
      selectedDecoration:selected,
      hasSelectedDecorItem:!!selected || sealSelected,
      hasSelectedPaintItem:!!selectedPaint,
      selectedDecorationIsSeal:sealSelected,
      selectedDecorationLabel:sealSelected ? "题款" : selectedPaint ? "彩绘" : "图案",
      selectedDecorationName:sealSelected ? "题款" : selected ? motifById(selected.motifId).name : "",
      selectedTechniqueName:selected ? TECHNIQUE_LABELS[selected.technique] : "",
      selectedRepeatName:selected ? REPEAT_LABELS[selected.repeatMode] : "",
      decorationCount:composition.layers.length,
      stampCount:composition.stamps.length,
      selectedItemCount:all.length + (sealMark ? 1 : 0),
      accentColorId:paintTarget?.colorId || "",
      sealApplied:!!composition.sealMark,
      inscriptionAnchors:this.inscriptionAnchorOptions()
    };
  },

  inscriptionAnchorOptions() {
    const options = [{ id:"base", name:"器底" }];
    if (this.work?.shapeId === "bowl" || this.work?.shapeId === "plate") {
      options.push({ id:"well", name:"盘心侧记" });
    }
    if (this.work?.shapeId !== "plate") options.push({ id:"lower_belly", name:"外壁下部" });
    return options;
  },

  trackDecorEnter() {
    if (!this.work || this.decorEnterTracked) return;
    this.decorEnterTracked = true;
    this.decorateStartedAt = Date.now();
    track("decorate_enter", {
      shape:this.work.shapeId,
      mode:this.work.mode,
      legacy:false
    });
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

  refreshCanvasLayout(preserveVisualScale = false, centerPottery = false) {
    if (!this.engine || !this.canvas) return;
    const query = wx.createSelectorQuery().in(this);
    query.select("#potteryCanvas").fields({ size: true, rect: true });
    query.select("#wheelContact").boundingClientRect();
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
      const dpr = resolveRenderDpr(system.pixelRatio || 2, loadSettings().quality);
      const baseScreenY = calculatePotteryBaseScreenYFromLayout(
        info.top || 0,
        info.height,
        wheelInfo.top
      );
      this.engine?.resize(info.width, info.height, dpr, preserveVisualScale);
      this.engine?.setBaseScreenY(baseScreenY);
      this.engine?.setPotteryCentered(centerPottery);
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
    this.scheduleIdleGuidance();
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

  setDecorMode(event: WechatMiniprogramTouchEvent) {
    const mode = event.currentTarget.dataset.id === "custom" ? "custom" : "template";
    this.setData({ decorMode:mode, pendingStampMotifId:"" });
  },

  setDecorSection(event: WechatMiniprogramTouchEvent) {
    const section = event.currentTarget.dataset.id;
    if (!["main", "border", "stamp"].includes(section)) return;
    this.setData({ decorSection:section, pendingStampMotifId:"" });
  },

  selectPaintTab(event: WechatMiniprogramTouchEvent) {
    const tab = event.currentTarget.dataset.id as PaintCatalogTabId;
    if (!PAINT_CATALOG_TABS.some((item) => item.id === tab)) return;
    this.setData({ paintTab:tab }, () => this.setData(this.decorationData()));
    this.vibrate();
  },

  togglePaintCatalogItem(event: WechatMiniprogramTouchEvent) {
    if (!this.work || this.work.currentStage !== "paint") return;
    const key = String(event.currentTarget.dataset.key || "");
    const motifId = String(event.currentTarget.dataset.id || "");
    const tab = key.split(":")[1] as PaintCatalogTabId;
    if (tab === "color") {
      this.choosePaint(event);
      return;
    }
    if (tab !== "pattern" && tab !== "ornament") return;
    const motif = ALL_DECORATION_MOTIFS.find((item) => item.id === motifId);
    if (!motif) return;

    const composition = this.work.decorationComposition;
    const role = tab === "ornament" ? "border" : "accent";
    const existing = composition.layers.find((layer) =>
      layer.technique === "overglaze" &&
      (layer.catalogKey === key || (!layer.catalogKey && layer.motifId === motifId && layer.role === role))
    );

    if (existing) {
      this.pushHistory();
      composition.layers = composition.layers.filter((layer) => layer.layerId !== existing.layerId);
      const remainingPaint = composition.layers.filter((layer) => layer.technique === "overglaze");
      this.setData({
        selectedDecorationId:this.data.selectedDecorationId === existing.layerId
          ? remainingPaint[0]?.layerId || ""
          : this.data.selectedDecorationId
      });
      this.changed();
      this.syncData();
      track("paint_layer_toggle", { action:"remove", motif_id:motifId, role });
      this.vibrate();
      return;
    }

    const selected = this.selectedDecoration();
    const paintTarget = selected?.technique === "overglaze"
      ? selected
      : composition.layers.find((layer) => layer.technique === "overglaze");
    const colorId = paintTarget?.colorId || this.data.accentColorId || "seal_red";
    const layer = createDecorationLayer(motifId, role, this.work.shapeId, "modern_studio", {
      catalogKey:key,
      technique:"overglaze",
      colorId,
      repeatMode:role === "border" ? "band" : motif.repeatMode,
      scale:role === "border" ? .72 : .88
    });
    this.pushHistory();
    composition.layers.push(layer);
    this.setData({ selectedDecorationId:layer.layerId });
    this.changed();
    this.syncData();
    track("paint_layer_toggle", { action:"add", motif_id:motifId, role, color_id:colorId });
    this.vibrate();
  },

  selectDecorTab(event: WechatMiniprogramTouchEvent) {
    const tab = event.currentTarget.dataset.id as DecorCatalogTabId;
    if (!DECOR_CATALOG_TABS.some((item) => item.id === tab)) return;
    this.setData({
      decorTab:tab,
      decorMenuId:DECOR_SIDE_MENUS[0].id,
      pendingStampMotifId:""
    }, () => this.setData(this.decorationData()));
    this.vibrate();
  },

  selectDecorMenu(event: WechatMiniprogramTouchEvent) {
    const id = event.currentTarget.dataset.id;
    if (!DECOR_SIDE_MENUS.some((item) => item.id === id)) return;
    this.setData({ decorMenuId:id }, () => this.setData(this.decorationData()));
  },

  toggleDecorCatalogItem(event: WechatMiniprogramTouchEvent) {
    if (!this.work) return;
    const key = event.currentTarget.dataset.key;
    const motifId = event.currentTarget.dataset.id;
    const tab = String(key || "").split(":")[0] as DecorCatalogTabId;
    const motif = ALL_DECORATION_MOTIFS.find((item) => item.id === motifId);
    if (!key || !motif || !DECOR_CATALOG_TABS.some((item) => item.id === tab)) return;
    const composition = this.work.decorationComposition;
    const all = [...composition.layers, ...composition.stamps];
    const role = decorCatalogRole(tab);
    const technique = decorCatalogTechnique(tab, motifId);
    const existing = all.find((layer) =>
      layer.catalogKey === key ||
      (!layer.catalogKey && layer.motifId === motifId && layer.role === role && layer.technique === technique)
    );
    this.pushHistory();
    if (existing) {
      composition.layers = composition.layers.filter((layer) => layer.layerId !== existing.layerId);
      composition.stamps = composition.stamps.filter((layer) => layer.layerId !== existing.layerId);
      const remaining = [...composition.layers, ...composition.stamps];
      this.setData({
        selectedDecorationId:this.data.selectedDecorationId === existing.layerId
          ? remaining[0]?.layerId || (composition.sealMark ? SEAL_MARK_SELECTION_ID : "")
          : this.data.selectedDecorationId
      });
    } else if (role === "stamp") {
      if (composition.stamps.length >= MAX_DECORATION_STAMPS) {
        this.history.pop();
        wx.showToast({ title:"写款与落印最多八枚", icon:"none" });
        return;
      }
      const stamp = createDecorationStamp(motifId, this.work.shapeId, composition.stylePackId);
      stamp.catalogKey = key;
      stamp.technique = technique;
      stamp.colorId = decorCatalogColor(tab, technique);
      composition.stamps.push(stamp);
      this.setData({ selectedDecorationId:stamp.layerId });
    } else {
      const layer = createDecorationLayer(motifId, role, this.work.shapeId, composition.stylePackId, {
        catalogKey:key,
        technique,
        colorId:decorCatalogColor(tab, technique),
        scale:role === "border" ? .72 : 1
      });
      composition.layers.push(layer);
      this.setData({ selectedDecorationId:layer.layerId });
    }
    delete composition.templateId;
    this.changed();
    this.syncData();
    track("decor_layer_add", { role, motif_id:motifId, technique_id:technique });
    this.vibrate();
  },

  inputSealText(event: any) {
    const text = Array.from(String(event.detail?.value || "").replace(/\s/g, ""))
      .slice(0, MAX_SEAL_MARK_CHARACTERS)
      .join("");
    this.setData({ sealText:text, sealTextLength:Array.from(text).length });
    return text;
  },

  chooseSealColor(event: WechatMiniprogramTouchEvent) {
    const id = event.currentTarget.dataset.id as SealMarkColorId;
    if (!SEAL_MARK_COLOR_OPTIONS.some((item) => item.id === id)) return;
    this.setData({ sealColorId:id });
    this.vibrate();
  },

  applySealMark() {
    if (!this.work) return;
    const text = Array.from(String(this.data.sealText || "").replace(/\s/g, ""))
      .slice(0, MAX_SEAL_MARK_CHARACTERS)
      .join("");
    if (!text) {
      wx.showToast({ title:"先写下要刻的内容", icon:"none" });
      return;
    }
    this.pushHistory();
    const previous = this.work.decorationComposition.sealMark;
    const position = previous
      ? { u:previous.u, v:previous.v }
      : this.sealDefaultPosition();
    const sealMark = createSealMark(text, this.data.sealColorId, position.u, position.v);
    if (previous) {
      sealMark.scaleX = Number.isFinite(previous.scaleX) ? previous.scaleX : 1;
      sealMark.scaleY = Number.isFinite(previous.scaleY) ? previous.scaleY : 1;
      Object.assign(sealMark, clampSealMark(sealMark));
    }
    this.work.decorationComposition.sealMark = sealMark;
    this.setData({
      selectedDecorationId:SEAL_MARK_SELECTION_ID,
      sealText:sealMark.text,
      sealTextLength:Array.from(sealMark.text).length
    });
    this.changed();
    this.syncData();
    track("seal_mark_add", {
      color_id:sealMark.colorId,
      text_length:Array.from(sealMark.text).length
    });
    this.vibrate("medium");
    wx.showToast({ title:"题款已落于器身，选中后可拖动", icon:"none" });
  },

  /** 新题款默认落在正对视线、器身中段的位置。 */
  sealDefaultPosition(): { u: number; v: number } {
    if (this.engine && this.rect) {
      const surface = this.engine.screenToSurface(
        this.rect.width / 2,
        this.rect.height * 0.45
      );
      if (surface) return { u:surface.u, v:surface.v };
    }
    return { u:0.75, v:0.45 };
  },

  toggleDecorTray() {
    const decorTrayOpen = !this.data.decorTrayOpen;
    this.setData({ decorTrayOpen }, () => {
      setTimeout(() => this.refreshCanvasLayout(true, !decorTrayOpen), 0);
    });
  },

  toggleDecorFullscreen() {
    if (!this.work || !["decorate", "paint"].includes(this.work.currentStage)) return;
    const decorFullscreen = !this.data.decorFullscreen;
    this.setData({ decorFullscreen }, () => {
      setTimeout(
        () => this.refreshCanvasLayout(true, decorFullscreen || !this.data.decorTrayOpen),
        0
      );
    });
  },

  toggleDecorTools() {
    this.setData({ decorToolsCollapsed:!this.data.decorToolsCollapsed });
  },

  returnToShaping() {
    if (!this.work || this.work.currentStage !== "decorate" || this.data.confirmingReturn) return;
    this.setData({ confirmingReturn:true });
    wx.showModal({
      title:"返回上一步？",
      content:"返回制坯后，当前所有装饰效果都会丢失。是否确认返回？",
      confirmText:"确认返回",
      cancelText:"继续装饰",
      confirmColor:"#9b4f42",
      success:(result: any) => {
        const committed = runConfirmedAction(result, () => {
          if (!this.work || this.work.currentStage !== "decorate") {
            this.setData({ confirmingReturn:false });
            return;
          }
          this.commitGestureChange();
          this.gesture = null;
          this.pushHistory();
          this.work.decorationComposition = createDecorationComposition(this.work.workId);
          this.work.stageIndex = 0;
          this.work.currentStage = STAGES[0].id;
          this.engine?.setPotteryCentered(false);
          this.setData({
            selectedDecorationId:"",
            pendingStampMotifId:"",
            decorTrayOpen:true,
            decorFullscreen:false,
            decorToolsCollapsed:false,
            decorToolStyle:"",
            confirmingReturn:false
          });
          this.changed();
          this.syncData();
          this.persist();
          this.setWheelState("idle");
          this.vibrate("medium");
        });
        if (!committed) this.setData({ confirmingReturn:false });
      },
      fail:() => this.setData({ confirmingReturn:false })
    });
  },

  startDecorToolDrag(event: any) {
    const touch = event.touches?.[0];
    if (!touch) return;
    const query = wx.createSelectorQuery().in(this);
    query.select("#decorToolPanel").boundingClientRect();
    query.select(".stage-area").boundingClientRect();
    query.exec((results: any[]) => {
      const panelRect = results[0];
      const areaRect = results[1];
      if (!panelRect || !areaRect) return;
      this.decorPanelDrag = {
        grabX: touch.clientX - panelRect.left,
        grabY: touch.clientY - panelRect.top,
        areaLeft: areaRect.left,
        areaTop: areaRect.top,
        width: panelRect.width,
        height: panelRect.height
      };
    });
  },

  moveDecorToolPanel(event: any) {
    const touch = event.touches?.[0];
    const drag = this.decorPanelDrag;
    if (!touch || !drag) return;
    const system = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    // 以按下时手指在面板内的位置为锚点，面板始终贴在手指下方。
    const viewLeft = clamp(touch.clientX - drag.grabX, 6, system.windowWidth - drag.width - 6);
    const viewTop = clamp(touch.clientY - drag.grabY, this.data.statusBarHeight + 6, system.windowHeight - drag.height - 8);
    // boundingClientRect 是视口坐标，style 的 left/top 相对 .stage-area，需换算后再写入。
    this.setData({ decorToolStyle:`left:${viewLeft - drag.areaLeft}px; top:${viewTop - drag.areaTop}px; right:auto;` });
  },

  endDecorToolDrag() {
    this.decorPanelDrag = null;
  },

  chooseStylePack(event: WechatMiniprogramTouchEvent) {
    if (!this.work) return;
    const id = event.currentTarget.dataset.id as StylePackId;
    if (!STYLE_PACKS.some((item) => item.id === id) || id === this.work.decorationComposition.stylePackId) return;
    const incompatible = [
      ...this.work.decorationComposition.layers,
      ...this.work.decorationComposition.stamps
    ].some((layer) => !motifById(layer.motifId).stylePackIds.includes(id));
    this.pushHistory();
    this.work.decorationComposition = retargetStyle(this.work.decorationComposition, id);
    this.changed();
    this.syncData();
    if (incompatible) {
      this.setGuidanceHint("有一枚纹样不属于这个风格，已保留原工艺", "risk");
    }
    this.vibrate();
  },

  applyDecorTemplate(event: WechatMiniprogramTouchEvent) {
    if (!this.work) return;
    const id = event.currentTarget.dataset.id;
    if (!DECORATION_TEMPLATES.some((item) => item.id === id)) return;
    this.pushHistory();
    this.work.decorationComposition = applyDecorationTemplate(
      this.work.decorationComposition,
      id,
      this.work.shapeId
    );
    this.setData({
      selectedDecorationId:this.work.decorationComposition.layers[0]?.layerId || "",
      pendingStampMotifId:""
    });
    this.changed();
    this.syncData();
    track("decor_template_apply", {
      template_id:id,
      style_pack_id:this.work.decorationComposition.stylePackId
    });
    this.vibrate("medium");
  },

  clearDecoration() {
    if (!this.work) return;
    if (
      !this.work.decorationComposition.layers.length &&
      !this.work.decorationComposition.stamps.length &&
      !this.work.decorationComposition.sealMark
    ) return;
    this.pushHistory();
    this.work.decorationComposition.layers = [];
    this.work.decorationComposition.stamps = [];
    delete this.work.decorationComposition.sealMark;
    delete this.work.decorationComposition.templateId;
    this.setData({ selectedDecorationId:"", pendingStampMotifId:"" });
    this.changed();
    this.syncData();
  },

  chooseDecorMotif(event: WechatMiniprogramTouchEvent) {
    if (!this.work) return;
    const motifId = event.currentTarget.dataset.id;
    const section = this.data.decorSection;
    const motif = ALL_DECORATION_MOTIFS.find((item) => item.id === motifId);
    if (!motif) return;
    if (section === "stamp") {
      if (this.work.decorationComposition.stamps.length >= MAX_DECORATION_STAMPS) {
        wx.showToast({ title:"落印已经有八枚了", icon:"none" });
        return;
      }
      this.setData({ pendingStampMotifId:motifId });
      this.setGuidanceHint(`已拿起${motif.name}，点在器身上落印`, "teaching");
      return;
    }

    const role = section === "border" ? "border" : "main";
    const layer = createDecorationLayer(
      motifId,
      role,
      this.work.shapeId,
      this.work.decorationComposition.stylePackId
    );
    this.pushHistory();
    this.work.decorationComposition.layers.push(layer);
    delete this.work.decorationComposition.templateId;
    this.setData({ selectedDecorationId:layer.layerId });
    this.changed();
    this.syncData();
    track("decor_layer_add", {
      role,
      motif_id:motifId,
      technique_id:layer.technique
    });
    this.vibrate();
  },

  selectDecoration(event: WechatMiniprogramTouchEvent) {
    const id = event.currentTarget.dataset.id;
    if (
      this.work?.currentStage === "paint" &&
      !this.work.decorationComposition.layers.some((layer) =>
        layer.layerId === id && layer.technique === "overglaze"
      )
    ) return;
    this.setData({
      selectedDecorationId:id,
      pendingStampMotifId:"",
      ...(id === SEAL_MARK_SELECTION_ID ? { decorTab:"inscription" } : {})
    }, () => {
      this.setData(this.decorationData());
    });
  },

  selectedDecoration(): DecorationLayer | DecorationStamp | null {
    if (!this.work) return null;
    return [
      ...this.work.decorationComposition.layers,
      ...this.work.decorationComposition.stamps
    ].find((layer) => layer.layerId === this.data.selectedDecorationId) || null;
  },

  isSealSelected(): boolean {
    return !!this.work?.decorationComposition.sealMark &&
      this.data.selectedDecorationId === SEAL_MARK_SELECTION_ID;
  },

  adjustDecoration(event: WechatMiniprogramTouchEvent) {
    if (!this.work) return;
    const selected = this.selectedDecoration();
    if (!selected) return;
    if (this.work.currentStage === "paint" && selected.technique !== "overglaze") return;
    const action = event.currentTarget.dataset.action;
    const before = JSON.stringify(selected);
    this.pushHistory();
    if (action === "up") selected.v += .045;
    else if (action === "down") selected.v -= .045;
    else if (action === "size") {
      selected.scale = selected.scale < .86 ? 1 : selected.scale < 1.16 ? 1.32 : .72;
      selected.scaleX = selected.scale;
      selected.scaleY = selected.scale;
    } else if (action === "rotate") {
      selected.rotation = selected.rotation >= 165 ? -180 : selected.rotation + 15;
    } else if (action === "density") {
      selected.density = selected.density < .9 ? 1.15 : selected.density < 1.35 ? 1.55 : .75;
    } else if (action === "repeat" && selected.role !== "border" && selected.role !== "stamp") {
      const modes: ("single" | "pair" | "four")[] = ["single", "pair", "four"];
      selected.repeatMode = modes[(modes.indexOf(selected.repeatMode as any) + 1) % modes.length];
    } else if (action === "anchor") {
      let anchors: DecorationAnchor[] = availableAnchors(this.work.shapeId).filter((anchor) => anchor !== "base");
      if (selected.role === "border") {
        anchors = anchors.filter((anchor) => ["rim", "shoulder", "belly", "foot"].includes(anchor));
      }
      if (selected.role === "stamp") anchors = anchors.filter((anchor) => anchor === "belly" || anchor === "well");
      const index = anchors.indexOf(selected.anchor);
      selected.anchor = anchors[(index + 1) % anchors.length] || selected.anchor;
      const range = this.anchorRangeForSelected(selected.anchor);
      selected.v = (range[0] + range[1]) / 2;
    } else if (action === "technique") {
      const motif = motifById(selected.motifId);
      const techniques: DecorationTechnique[] = motif.techniques.filter((technique) => technique !== "overglaze");
      selected.technique = techniques[(techniques.indexOf(selected.technique) + 1) % techniques.length] || techniques[0];
      selected.colorId = selected.technique === "incise"
        ? "clay_shadow"
        : selected.technique === "stamp"
          ? "jade_shadow"
          : "cobalt";
    }
    const clamped = clampDecorationLayer(selected, this.work.shapeId);
    Object.assign(selected, clamped);
    if (before === JSON.stringify(selected)) {
      this.history.pop();
      return;
    }
    this.changed();
    this.syncData();
    track("decor_layer_adjust", { adjust_type:action || "unknown" });
    this.vibrate();
  },

  adjustDecorAxis(event: WechatMiniprogramTouchEvent) {
    if (!this.work) return;
    const seal = this.isSealSelected() ? this.work.decorationComposition.sealMark : undefined;
    const selected = this.selectedDecoration();
    if (!selected && !seal) return;
    if (this.work.currentStage === "paint" && (!selected || selected.technique !== "overglaze")) return;
    const axis = event.currentTarget.dataset.axis;
    const direction = Number(event.currentTarget.dataset.direction) < 0 ? -1 : 1;
    if (axis !== "x" && axis !== "y") return;
    const before = JSON.stringify(seal || selected);
    this.pushHistory();
    if (seal) {
      if (axis === "x") seal.scaleX += direction * .1;
      else seal.scaleY += direction * .1;
      Object.assign(seal, clampSealMark(seal));
    } else if (selected) {
      if (axis === "x") selected.scaleX = clamp((selected.scaleX ?? selected.scale) + direction * .1, .42, 1.65);
      else selected.scaleY = clamp((selected.scaleY ?? selected.scale) + direction * .1, .42, 1.65);
      selected.scale = ((selected.scaleX ?? selected.scale) + (selected.scaleY ?? selected.scale)) / 2;
      Object.assign(selected, clampDecorationLayer(selected, this.work.shapeId));
    }
    if (before === JSON.stringify(seal || selected)) {
      this.history.pop();
      return;
    }
    this.changed();
    this.syncData();
    track(seal ? "seal_mark_adjust" : "decor_layer_adjust", {
      adjust_type:axis === "x" ? "scale_x" : "scale_y"
    });
    this.vibrate();
  },

  flipSelectedDecoration() {
    if (!this.work) return;
    const selected = this.selectedDecoration();
    if (!selected) return;
    if (this.work.currentStage === "paint" && selected.technique !== "overglaze") return;
    this.pushHistory();
    selected.flipY = !selected.flipY;
    this.changed();
    this.syncData();
    track("decor_layer_adjust", { adjust_type:"flip_y" });
    this.vibrate();
  },

  copySelectedDecoration() {
    if (!this.work || !["decorate", "paint"].includes(this.work.currentStage)) return;
    if (this.isSealSelected()) {
      wx.showToast({ title:"题款只能保留一处，可直接修改后重刻", icon:"none" });
      return;
    }
    const selected = this.selectedDecoration();
    if (!selected) return;
    if (this.work.currentStage === "paint" && selected.technique !== "overglaze") return;
    const composition = this.work.decorationComposition;
    if (selected.role === "stamp") {
      if (composition.stamps.length >= MAX_DECORATION_STAMPS) {
        wx.showToast({ title:"落印已经有八枚了", icon:"none" });
        return;
      }
    }
    this.pushHistory();
    const duplicate = duplicateDecorationLayer(
      selected,
      [...composition.layers, ...composition.stamps],
      this.work.shapeId
    );
    if (duplicate.role === "stamp") composition.stamps.push(duplicate as DecorationStamp);
    else composition.layers.push(duplicate as DecorationLayer);
    delete composition.templateId;
    this.setData({ selectedDecorationId:duplicate.layerId });
    this.changed();
    this.syncData();
    track("decor_layer_copy", {
      role:duplicate.role,
      motif_id:duplicate.motifId,
      copy_number:duplicate.copyNumber || 1
    });
    this.vibrate();
  },

  anchorRangeForSelected(anchor: DecorationAnchor): [number, number] {
    if (!this.work) return [0, 1];
    // 分区按钮仍是快速落点预设；用户从该落点继续拖动时不再受分区限制。
    return anchorRange(this.work.shapeId, anchor);
  },

  deleteSelectedDecoration() {
    if (!this.work) return;
    if (this.work.currentStage !== "decorate" && this.work.currentStage !== "paint") return;
    const id = this.data.selectedDecorationId;
    if (!id) return;
    const composition = this.work.decorationComposition;
    if (
      this.work.currentStage === "paint" &&
      !composition.layers.some((layer) => layer.layerId === id && layer.technique === "overglaze")
    ) return;
    if (id === SEAL_MARK_SELECTION_ID && composition.sealMark) {
      this.pushHistory();
      delete composition.sealMark;
      const remaining = [...composition.layers, ...composition.stamps];
      this.setData({ selectedDecorationId:remaining[0]?.layerId || "" });
      this.changed();
      this.syncData();
      track("seal_mark_delete", {});
      this.vibrate();
      return;
    }
    if (!composition.layers.some((layer) => layer.layerId === id) && !composition.stamps.some((layer) => layer.layerId === id)) return;
    this.pushHistory();
    composition.layers = composition.layers.filter((layer) => layer.layerId !== id);
    composition.stamps = composition.stamps.filter((layer) => layer.layerId !== id);
    const remaining = this.work.currentStage === "paint"
      ? composition.layers.filter((layer) => layer.technique === "overglaze")
      : [...composition.layers, ...composition.stamps];
    this.setData({
      selectedDecorationId:remaining[0]?.layerId || (composition.sealMark ? SEAL_MARK_SELECTION_ID : "")
    });
    this.changed();
    this.syncData();
    this.vibrate();
  },

  previewFiredStart() {
    this.previewStartedAt = Date.now();
    this.setData({ firedPreview:true });
    this.engine?.setFiredPreview(true);
  },

  previewFiredEnd() {
    if (this.previewStartedAt) {
      track("decor_preview_fired", {
        technique_id:this.selectedDecoration()?.technique || "combined",
        duration_ms:Date.now() - this.previewStartedAt
      });
      this.previewStartedAt = 0;
    }
    this.setData({ firedPreview:false });
    this.engine?.setFiredPreview(false);
  },

  chooseTool(event: WechatMiniprogramTouchEvent) {
    if (!this.work) return;
    const id = event.currentTarget.dataset.id;
    const entry = (this.data.tools as { id: string; name: string; hint: string }[]).find(
      (value) => value.id === id
    );
    this.setData({ tool:id, toolName:entry?.name || "" });
    this.setGuidanceHint(entry?.hint || "", "teaching");
    this.vibrate();

  },

  chooseGlaze(event: WechatMiniprogramTouchEvent) {
    if (!this.work) return;
    const glazeId = String(event.currentTarget.dataset.id || "");
    if (!CLASSIC_GLAZES.some((item) => item.id === glazeId)) return;
    if (this.work.glazeId === glazeId && this.work.glazeMethod === "full") return;
    this.pushHistory();
    this.work.glazeId = glazeId;
    this.work.glazeMethod = "full";
    this.setData({
      glazeId: this.work.glazeId,
      glazeName: CLASSIC_GLAZES.find((item) => item.id === glazeId)?.name || ""
    });
    this.changed();
    this.vibrate();
  },

  choosePaint(event: WechatMiniprogramTouchEvent) {
    if (!this.work || this.work.currentStage !== "paint") return;
    const colorId = String(event.currentTarget.dataset.id || "");
    if (!this.data.paintColors.some((item) => item.id === colorId)) return;
    const composition = this.work.decorationComposition;
    const selected = this.selectedDecoration();
    let accent = selected?.technique === "overglaze"
      ? selected as DecorationLayer
      : composition.layers.find((layer) => layer.technique === "overglaze");
    if (accent?.colorId === colorId) {
      this.setData({ selectedDecorationId:accent.layerId }, () => this.setData(this.decorationData()));
      return;
    }
    this.pushHistory();
    if (!accent) {
      const source = composition.layers.find((layer) =>
        layer.technique !== "overglaze" && layer.role === "main"
      );
      accent = createDecorationLayer(
        source?.motifId || "lotus",
        "accent",
        this.work.shapeId,
        "modern_studio",
        {
          catalogKey:`paint:pattern:${source?.motifId || "lotus"}`,
          anchor:source?.anchor || "belly",
          repeatMode:source?.repeatMode || "four",
          u:source?.u ?? .5,
          v:source?.v,
          scale:(source?.scale || 1) * .88,
          scaleX:(source?.scaleX || source?.scale || 1) * .88,
          scaleY:(source?.scaleY || source?.scale || 1) * .88,
          flipY:source?.flipY || false,
          rotation:source?.rotation || 0,
          density:source?.density || 1,
          technique:"overglaze"
        }
      );
      composition.layers.push(accent);
      track("decor_layer_add", {
        role:"accent",
        motif_id:accent.motifId,
        technique_id:"overglaze"
      });
    }
    accent.colorId = colorId;
    accent.technique = "overglaze";
    this.setData({ selectedDecorationId:accent.layerId });
    this.changed();
    this.syncData();
    track("paint_color_apply", {
      motif_id:accent.motifId,
      color_id:colorId
    });
    this.vibrate();
  },

  cycleSymmetry() {
    this.adjustDecoration({ currentTarget:{ dataset:{ action:"repeat" } } } as any);
  },

  chooseInscriptionContent(event: WechatMiniprogramTouchEvent) {
    const contentType = event.currentTarget.dataset.id as Inscription["contentType"];
    if (!["signature", "date", "blessing", "serial"].includes(contentType)) return;
    const now = new Date();
    const defaultText: Record<Inscription["contentType"], string> = {
      signature:"掌心作",
      date:`${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`,
      blessing:BLESSINGS[0],
      serial:`No. ${String(Math.max(1, this.work?.revision || 1)).padStart(3, "0")}`
    };
    const draft = {
      ...this.data.inscriptionDraft,
      contentType,
      text:defaultText[contentType]
    };
    this.setData({ inscriptionDraft:draft, inscriptionError:"" });
  },

  inputInscription(event: any) {
    const text = String(event.detail?.value || "");
    this.setData({
      inscriptionDraft:{ ...this.data.inscriptionDraft, text },
      inscriptionError:validateInscriptionText(text)
    });
  },

  chooseInscriptionOption(event: WechatMiniprogramTouchEvent) {
    const kind = event.currentTarget.dataset.kind;
    const id = event.currentTarget.dataset.id;
    const draft = { ...this.data.inscriptionDraft } as Inscription;
    if (kind === "layout" && INSCRIPTION_LAYOUTS.some((item) => item.id === id)) draft.layoutId = id;
    else if (kind === "style" && INSCRIPTION_STYLES.some((item) => item.id === id)) draft.styleId = id as any;
    else if (kind === "typeface" && INSCRIPTION_TYPEFACES.some((item) => item.id === id)) draft.typefaceId = id;
    else if (kind === "anchor" && this.inscriptionAnchorOptions().some((item) => item.id === id)) draft.anchor = id as any;
    else return;
    this.setData({ inscriptionDraft:draft });
  },

  chooseBlessing(event: WechatMiniprogramTouchEvent) {
    const text = event.currentTarget.dataset.text;
    if (!BLESSINGS.includes(text)) return;
    this.setData({
      inscriptionDraft:{ ...this.data.inscriptionDraft, contentType:"blessing", text },
      inscriptionError:""
    });
  },

  applyInscription() {
    if (!this.work) return;
    const error = validateInscriptionText(this.data.inscriptionDraft.text);
    if (error) {
      this.setData({ inscriptionError:error });
      return;
    }
    this.pushHistory();
    this.work.decorationComposition.inscription = JSON.parse(
      JSON.stringify(this.data.inscriptionDraft)
    ) as Inscription;
    this.changed();
    this.syncData();
    track("inscription_add", {
      content_type:this.data.inscriptionDraft.contentType,
      layout_id:this.data.inscriptionDraft.layoutId,
      style_id:this.data.inscriptionDraft.styleId
    });
    wx.showToast({ title:"款识已经落稳", icon:"none" });
    this.vibrate("medium");
  },

  removeInscription() {
    if (!this.work?.decorationComposition.inscription) return;
    this.pushHistory();
    delete this.work.decorationComposition.inscription;
    this.changed();
    this.syncData();
  },

  saveCurrentPrivateMark() {
    const error = validateInscriptionText(this.data.inscriptionDraft.text);
    if (error) {
      this.setData({ inscriptionError:error });
      return;
    }
    try {
      const privateMarks = savePrivateMark(this.data.inscriptionDraft);
      this.setData({ privateMarks });
      wx.showToast({ title:"已存为本机私款", icon:"none" });
    } catch (_error) {
      wx.showToast({ title:"私款已有三枚，可点一枚替换", icon:"none" });
    }
  },

  applyPrivateMark(event: WechatMiniprogramTouchEvent) {
    const index = Number(event.currentTarget.dataset.index);
    const mark = this.data.privateMarks[index];
    if (!mark?.inscription) return;
    this.setData({
      inscriptionDraft:JSON.parse(JSON.stringify(mark.inscription)),
      inscriptionError:""
    });
  },

  replacePrivateMark(event: WechatMiniprogramTouchEvent) {
    const index = Number(event.currentTarget.dataset.index);
    try {
      const privateMarks = savePrivateMark(this.data.inscriptionDraft, index);
      this.setData({ privateMarks });
      wx.showToast({ title:"这枚私款已替换", icon:"none" });
    } catch (_error) {
      wx.showToast({ title:"私款没有保存好", icon:"none" });
    }
  },

  touchStart(event: WechatMiniprogramTouchEvent) {
    if (!this.work || !this.rect || this.data.kiln) return;
    this.commitWallThicknessChange();
    const touches = event.touches;
    if (touches.length >= 2) {
      this.revertIncidentalDecorDrag();
      this.commitGestureChange();
      this.gesture = this.cameraGesture(touches[0], touches[1]);
      this.setWheelState("orbit");
      return;
    }
    this.beginSingleTouchGesture(touches[0], true, event);
  },

  beginSingleTouchGesture(
    touch: WechatMiniprogramTouch | undefined,
    allowStamp: boolean,
    event?: WechatMiniprogramTouchEvent
  ) {
    if (!this.work || !this.rect || !touch) return;
    const local = this.local(touch);
    const hit = this.hitPot(local.x, local.y);
    const surfaceEditing = this.work.currentStage === "decorate" || this.work.currentStage === "paint";
    if (hit && surfaceEditing && !this.data.decorFullscreen) {
      const snapshot = cloneWork(this.work);
      let selected = this.selectedDecoration();
      if (this.work.currentStage === "paint" && selected?.technique !== "overglaze") selected = null;
      if (this.work.currentStage === "decorate" && allowStamp && this.data.pendingStampMotifId) {
        if (this.work.decorationComposition.stamps.length >= MAX_DECORATION_STAMPS) {
          wx.showToast({ title:"落印已经有八枚了", icon:"none" });
          return;
        }
        const placement = this.stampPlacementAt(local.x, local.y);
        const stamp = createDecorationStamp(
          this.data.pendingStampMotifId,
          this.work.shapeId,
          this.work.decorationComposition.stylePackId,
          placement.u,
          placement.v
        );
        this.work.decorationComposition.stamps.push(stamp);
        selected = stamp;
        this.setData({ selectedDecorationId:stamp.layerId, pendingStampMotifId:"" });
        this.engine?.update(this.work);
        track("decor_layer_add", {
          role:"stamp",
          motif_id:stamp.motifId,
          technique_id:stamp.technique
        });
      }
      // 题款和普通纹样共用“先在被选图菜单选中，再到器身拖动”的规则，
      // 避免写款页签抢走当前普通图案的手势。
      const sealMark = this.work.decorationComposition.sealMark;
      if (this.work.currentStage === "decorate" && sealMark && this.isSealSelected()) {
        this.gesture = {
          type:"seal",
          x:touch.clientX,
          y:touch.clientY,
          changed:false,
          snapshot
        };
        this.setData({ saveState:"未保存" });
        return;
      }
      if (!selected) {
        this.gesture = null;
        return;
      }
      this.gesture = {
        type:"decor",
        x:touch.clientX,
        y:touch.clientY,
        layerId:selected.layerId,
        changed:JSON.stringify(snapshot.decorationComposition) !== JSON.stringify(this.work.decorationComposition),
        snapshot
      };
      this.setData({ saveState:"未保存" });
      return;
    }
    const editable = hit && this.work.currentStage === "shaping";
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
      tool:"gesture",
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
        this.revertIncidentalDecorDrag();
        this.commitGestureChange();
        this.gesture = { type: "camera2", distance, x, y, angle };
        this.setWheelState("orbit");
      } else {
        if (this.gesture.distance > 2 && distance > 2) {
          this.engine?.dolly(distance / this.gesture.distance);
        }
        const twist = this.angleDelta(angle, this.gesture.angle);
        const twistPixels = (twist * this.rect.width * 0.58) / (Math.PI * 2);
        this.engine?.orbit(
          (x - this.gesture.x + twistPixels) * TWO_FINGER_ORBIT_GAIN,
          (y - this.gesture.y) * TWO_FINGER_ORBIT_GAIN
        );
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

    if (this.gesture.type === "decor") {
      const selected = this.selectedDecoration();
      if (!selected || selected.layerId !== this.gesture.layerId) return;
      const dx = touch.clientX - this.gesture.x;
      const dy = touch.clientY - this.gesture.y;
      // The motif must follow the finger at any viewpoint, so invert the
      // on-screen projection of the surface instead of assuming a front view;
      // the normalized mapping is only the WebGL-free fallback.
      const delta = this.engine
        ? this.engine.surfaceDragDelta(selected.u, selected.v, dx, dy)
        : {
            du: -(dx / Math.max(1, this.rect.width)),
            dv: -(dy / Math.max(1, this.rect.height))
          };
      if (Math.abs(delta.du) + Math.abs(delta.dv) > 1e-5) {
        selected.u += delta.du;
        selected.v += delta.dv;
        Object.assign(selected, clampDecorationLayer(selected, this.work.shapeId));
        this.gesture.changed = true;
        this.engine?.update(this.work);
        this.setData({ saveState: "未保存" });
      }
      this.gesture.x = touch.clientX;
      this.gesture.y = touch.clientY;
      return;
    }

    if (this.gesture.type === "seal") {
      const seal = this.work.decorationComposition.sealMark;
      if (!seal) return;
      const dx = touch.clientX - this.gesture.x;
      const dy = touch.clientY - this.gesture.y;
      // 与纹样拖动同源：按当前投影反解表面位移，题款在任何视角都跟手。
      const delta = this.engine
        ? this.engine.surfaceDragDelta(seal.u, seal.v, dx, dy)
        : {
            du: -(dx / Math.max(1, this.rect.width)),
            dv: -(dy / Math.max(1, this.rect.height))
          };
      if (Math.abs(delta.du) + Math.abs(delta.dv) > 1e-5) {
        seal.u += delta.du;
        seal.v += delta.dv;
        Object.assign(seal, clampSealMark(seal));
        this.gesture.changed = true;
        this.engine?.update(this.work);
        this.setData({ saveState: "未保存" });
      }
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
    }
    this.gesture.x = touch.clientX;
    this.gesture.y = touch.clientY;
  },

  touchEnd(event: WechatMiniprogramTouchEvent) {
    if (!this.work || !this.gesture) return;
    if (this.gesture.type === "camera2") {
      const touches = event.touches || [];
      if (touches.length >= 2) {
        // An extra finger left early: rebase on the remaining pair and keep orbiting.
        this.gesture = this.cameraGesture(touches[0], touches[1]);
        return;
      }
      if (touches.length === 1 && touches[0] && !this.data.kiln) {
        // Two fingers became one: hand control to the remaining finger so the
        // piece can still be edited without lifting and touching down again.
        this.gesture = null;
        this.beginSingleTouchGesture(touches[0], false);
        if ((this.gesture as StudioGesture | null)?.type !== "edit") this.setWheelState("idle");
        return;
      }
    }
    this.commitGestureChange();
    this.gesture = null;
    this.setWheelState("idle");
    this.syncData();
  },

  // A second finger signals camera intent. If the brief one-finger landing
  // nudged the selected motif while the pair was being placed, restore it
  // before switching to the camera so patterns never creep during orbiting.
  revertIncidentalDecorDrag() {
    const gesture = this.gesture;
    if (!this.work || !gesture) return;
    if (gesture.type === "seal") {
      if (!gesture.changed) return;
      const current = this.work.decorationComposition.sealMark;
      const before = gesture.snapshot.decorationComposition.sealMark;
      if (!current || !before) return;
      if (Math.abs(current.u - before.u) + Math.abs(current.v - before.v) > 0.01) return;
      current.u = before.u;
      current.v = before.v;
      gesture.changed = false;
      this.engine?.update(this.work);
      return;
    }
    if (gesture.type !== "decor" || !gesture.changed) return;
    const current = [
      ...this.work.decorationComposition.layers,
      ...this.work.decorationComposition.stamps
    ].find((layer) => layer.layerId === gesture.layerId);
    const before = [
      ...gesture.snapshot.decorationComposition.layers,
      ...gesture.snapshot.decorationComposition.stamps
    ].find((layer) => layer.layerId === gesture.layerId);
    if (!current || !before) return;
    if (Math.abs(current.u - before.u) + Math.abs(current.v - before.v) > 0.01) return;
    current.u = before.u;
    current.v = before.v;
    gesture.changed = false;
    this.engine?.update(this.work);
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
    const gesture = this.gesture;
    if (gesture.type === "edit") this.flushShapingFrame(true);
    if ((gesture.type !== "edit" && gesture.type !== "decor" && gesture.type !== "seal") || !gesture.changed) return;
    this.history.push(gesture.snapshot);
    if (this.history.length > 50) this.history.shift();
    this.future = [];
    this.changed(false);
    if (!this.firstDeformTracked && gesture.type === "edit" && this.work.currentStage === "shaping") {
      track("first_deform", {
        gesture_type: gesture.motion,
        shaping_form: gesture.form,
        quality_tier: (wx.getStorageSync("palm-kiln-settings") || {}).quality || "medium"
      });
      this.firstDeformTracked = true;
    }
    if (gesture.type === "edit") {
      this.setGuidanceHint(MOTION_LABELS[gesture.motion], "teaching");
      wx.setStorageSync("palm-kiln-tutorial-seen", true);
    } else if (gesture.type === "seal") {
      track("seal_mark_move", {});
    } else {
      track("decor_layer_adjust", { adjust_type:"position" });
    }
    gesture.changed = false;
  },

  inputPoint(x: number, y: number, event?: WechatMiniprogramTouchEvent): ShapingInputPoint {
    return { x, y, timestamp: this.eventTimestamp(event) };
  },

  eventTimestamp(event?: WechatMiniprogramTouchEvent): number {
    return Number.isFinite(event?.timeStamp) ? (event?.timeStamp as number) : Date.now();
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

  /** Resolves a tap to surface coordinates so stamps land under the finger at any viewpoint. */
  stampPlacementAt(x: number, y: number): { u: number; v: number } {
    const fallback = {
      u: clamp(x / Math.max(1, this.rect?.width || 1), 0, 1),
      v: clamp(
        this.profilePositionAt(y) / Math.max(1, (this.work?.outerRadius.length || 2) - 1),
        0,
        1
      )
    };
    return (this.engine && this.engine.screenToSurface(x, y)) || fallback;
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
    const shouldPause = shouldReduce || this.work?.stageIndex !== 0;
    const actualState: PotteryRotationState = shouldPause ? "reduced" : state;
    const maxRadius = this.work?.outerRadius.length
      ? Math.max(...this.work.outerRadius)
      : 0.72;
    const rpm = calculatePotteryTargetRpm(maxRadius, actualState);
    this.engine?.setAutoRotate(!shouldPause);
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
    this.igniteKilnIfPending();
  },

  redo() {
    this.commitWallThicknessChange();
    if (!this.work || !this.future.length) return;
    this.history.push(cloneWork(this.work));
    this.work = this.future.pop()!;
    this.changed();
    this.syncData();
    this.setWheelState("idle");
    this.igniteKilnIfPending();
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
    this.scheduleIdleGuidance();
  },

  persist() {
    if (!this.work) return;
    try {
      saveWork(this.work);
      this.setData({ saveState:"已保存", work:this.work });
    } catch (_error) {
      this.setData({ saveState:"保存失败" });
      this.setGuidanceHint("这次修改还没落盘，请再试一次", "error");
    }
  },

  /** 彩釉页右下角按钮：完成上釉后直接进入高温烧制全屏过程。 */
  startFiring() {
    if (!this.work || this.work.currentStage !== "glaze") return;
    this.completeStage();
    this.igniteKilnIfPending();
  },

  /** 彩绘页右下角按钮：完成彩绘后直接进入低温烤花全屏过程。 */
  startRefire() {
    if (!this.work || this.work.currentStage !== "paint") return;
    this.completeStage();
    this.igniteKilnIfPending();
  },

  /** 工序只要停在窑烧（高温烧制/低温烤花）就立即开始二十秒烧制过程。 */
  igniteKilnIfPending() {
    const stage = this.work?.currentStage;
    if ((stage === "firing" || stage === "refire") && !this.data.kiln) {
      this.startKiln(stage === "refire");
    }
  },

  completeStage() {
    this.commitWallThicknessChange();
    if (!this.work) return;
    const stage = this.work.currentStage;
    if (stage === "firing" || stage === "refire") {
      this.persist();
      this.startKiln(stage === "refire");
      return;
    }
    if (stage === "finished") {
      wx.redirectTo({ url: `/pages/result/result?id=${this.work.workId}` });
      return;
    }
    if (stage === "decorate") {
      const composition = this.work.decorationComposition;
      track("decorate_complete", {
        layer_count:composition.layers.length + composition.stamps.length,
        used_template:!!composition.templateId,
        has_inscription:!!composition.inscription,
        duration_ms:this.decorateStartedAt ? Date.now() - this.decorateStartedAt : 0
      });
      this.persist();
    }
    this.advance();
  },

  advance() {
    if (!this.work) return;
    const completed = this.work.currentStage;
    this.pushHistory();
    this.work.stageIndex = Math.min(STAGES.length - 1, this.work.stageIndex + 1);
    this.work.currentStage = STAGES[this.work.stageIndex].id;
    if (this.work.currentStage === "glaze") {
      this.work.glazeMethod = "full";
      if (!CLASSIC_GLAZES.some((item) => item.id === this.work!.glazeId)) {
        this.work.glazeId = CLASSIC_GLAZES[0].id;
      }
    }
    track("stage_complete", { stage: completed, next_stage: this.work.currentStage });
    this.changed();
    this.syncData();
    if (this.work.currentStage === "decorate") this.trackDecorEnter();
    if (this.work.currentStage === "paint") this.enterPaintStage();
    this.setWheelState("idle");
    if (this.work.currentStage !== "decorate") {
      this.setGuidanceHint(`现在开始${STAGES[this.work.stageIndex].name}`, "teaching");
    }
    this.vibrate("medium");
  },

  /** 工序底栏「上一步」：制坯返回前置设置，其余工序回到上一道可驻留工序（窑烧为自动过渡，直接跳过）。 */
  goPreviousStage() {
    if (!this.work) return;
    if (this.work.stageIndex === 0) {
      wx.showModal({
        title: "返回首页？",
        content: "当前草稿已保存在本机，可随时从首页继续；重新练泥会开始一件新作品。",
        confirmText: "返回首页",
        cancelText: "继续制坯",
        success: (result: any) => {
          if (!result.confirm) return;
          this.persist();
          wx.redirectTo({ url: "/pages/index/index" });
        }
      });
      return;
    }
    const targetIndex = this.work.stageIndex >= 5 ? 4 : this.work.stageIndex >= 3 ? 2 : this.work.stageIndex - 1;
    this.commitGestureChange();
    this.gesture = null;
    this.pushHistory();
    this.work.stageIndex = targetIndex;
    this.work.currentStage = STAGES[targetIndex].id;
    this.changed();
    this.syncData();
    if (this.work.currentStage === "paint") {
      this.enterPaintStage();
    } else {
      this.setData({
        selectedDecorationId: "",
        pendingStampMotifId: "",
        decorTrayOpen: true,
        decorFullscreen: false,
        decorToolsCollapsed: false,
        decorToolStyle: ""
      });
      if (this.work.currentStage === "decorate") this.trackDecorEnter();
    }
    this.setWheelState("idle");
    this.persist();
    this.vibrate("medium");
  },

  /** 进入彩绘工序：复位图库页签与被选图层（前进与返回上一步共用）。 */
  enterPaintStage() {
    if (!this.work) return;
    const inscriptionDraft = this.work.decorationComposition.inscription
      ? JSON.parse(JSON.stringify(this.work.decorationComposition.inscription)) as Inscription
      : defaultInscription();
    const firstPaintLayer = this.work.decorationComposition.layers.find((layer) =>
      layer.technique === "overglaze"
    );
    this.setData({
      inscriptionDraft,
      inscriptionError: "",
      selectedDecorationId: firstPaintLayer?.layerId || "",
      paintTab: "pattern",
      decorTrayOpen: true,
      decorFullscreen: false,
      decorToolsCollapsed: false,
      decorToolStyle: ""
    }, () => this.setData(this.decorationData()));
  },

  startKiln(refire: boolean) {
    if (this.data.kiln) return;
    this.persist();
    this.kilnStartedAt = Date.now();
    const initial = kilnVisualState(refire, 0);
    this.engine?.setKilnHeat(0);
    this.engine?.setPotteryCentered(true);
    this.setData({
      kiln: true,
      ...initial
    }, () => {
      setTimeout(() => this.refreshCanvasLayout(false, true), 0);
    });
    this.kilnTimer = setInterval(() => {
      const elapsed = Date.now() - this.kilnStartedAt;
      const progress = Math.min(100, elapsed / KILN_DURATION_MS * 100);
      const visual = kilnVisualState(refire, progress);
      this.engine?.setKilnHeat(progress / 100);
      this.setData(visual);
      if (progress >= 100) this.finishKiln();
    }, KILN_TICK_MS);
  },

  skipKiln() {
    this.finishKiln();
  },

  finishKiln() {
    if (!this.data.kiln) return;
    if (this.kilnTimer) {
      clearInterval(this.kilnTimer);
      this.kilnTimer = null;
    }
    this.kilnStartedAt = 0;
    this.engine?.setKilnHeat(0);
    this.engine?.setPotteryCentered(false);
    this.setData({ kiln: false, kilnProgress: 100 }, () => {
      this.advance();
      setTimeout(() => this.refreshCanvasLayout(false, false), 0);
    });
  },

  vibrate(type = "light") {
    const settings = loadSettings();
    if (settings.haptics) wx.vibrateShort({ type });
  }
});
