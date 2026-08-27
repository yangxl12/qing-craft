import { ShapeId } from "./catalog";

export type StylePackId = "song_incise" | "yuan_blue" | "modern_studio";
export type DecorationRole = "main" | "border" | "accent";
export type DecorationAnchor =
  | "rim"
  | "neck"
  | "shoulder"
  | "belly"
  | "foot"
  | "well"
  | "base";
export type DecorationTechnique = "incise" | "stamp" | "underglaze" | "overglaze";
export type DecorationRepeatMode = "single" | "pair" | "four" | "band" | "radial";
export type InscriptionContentType = "signature" | "date" | "blessing" | "serial";
export type InscriptionStyleId = "blue" | "seal_red" | "incised";
export type InscriptionAnchor = "base" | "well" | "lower_belly";

export interface DecorationLayer {
  layerId: string;
  catalogKey?: string;
  copySourceId?: string;
  copyNumber?: number;
  motifId: string;
  role: DecorationRole;
  anchor: DecorationAnchor;
  technique: DecorationTechnique;
  repeatMode: DecorationRepeatMode;
  colorId?: string;
  u: number;
  v: number;
  scale: number;
  scaleX: number;
  scaleY: number;
  flipY: boolean;
  rotation: number;
  density: number;
  visible: boolean;
}

export interface DecorationStamp extends Omit<DecorationLayer, "role" | "repeatMode"> {
  role: "stamp";
  repeatMode: "single";
}

export interface Inscription {
  contentType: InscriptionContentType;
  text: string;
  layoutId: string;
  styleId: InscriptionStyleId;
  typefaceId: string;
  anchor: InscriptionAnchor;
  visibleInExport: boolean;
}

export interface DecorationComposition {
  stylePackId: StylePackId;
  templateId?: string;
  paletteId: string;
  layers: DecorationLayer[];
  stamps: DecorationStamp[];
  inscription?: Inscription;
  kilnSeed: number;
}

export interface StylePack {
  id: StylePackId;
  name: string;
  note: string;
  techniques: DecorationTechnique[];
  paletteId: string;
}

export interface MotifOption {
  id: string;
  name: string;
  family: "flora" | "animal" | "cloud_water" | "symbol" | "geometry";
  roles: (DecorationRole | "stamp")[];
  stylePackIds: StylePackId[];
  techniques: DecorationTechnique[];
  anchors: DecorationAnchor[];
  repeatMode: DecorationRepeatMode;
  densityRange: [number, number];
  meaningNote: string;
  shaderCode: number;
  glyph: string;
  license: "original";
}

export interface DecorationTemplate {
  id: string;
  name: string;
  note: string;
  stylePackId: StylePackId;
  recommendedShapes: ShapeId[];
  components: {
    motifId: string;
    role: DecorationRole;
    anchor: DecorationAnchor;
    repeatMode: DecorationRepeatMode;
    scale: number;
    density?: number;
  }[];
}

export interface InscriptionChoice {
  id: string;
  name: string;
  note?: string;
}

export const MAX_DECORATION_LAYERS = 5;
export const MAX_DECORATION_STAMPS = 8;

export const STYLE_PACKS: StylePack[] = [
  {
    id: "song_incise",
    name: "宋式刻花",
    note: "灵感来自同色浅刻与温润青釉",
    techniques: ["incise", "stamp"],
    paletteId: "jade_shadow"
  },
  {
    id: "yuan_blue",
    name: "元明青花",
    note: "灵感来自釉下青蓝与分水浓淡",
    techniques: ["underglaze", "stamp"],
    paletteId: "cobalt_wash"
  },
  {
    id: "modern_studio",
    name: "现代工作室",
    note: "留白、低饱和点色与清楚的个人印记",
    techniques: ["incise", "stamp", "underglaze", "overglaze"],
    paletteId: "studio_muted"
  }
];

const SONG_AND_BLUE: StylePackId[] = ["song_incise", "yuan_blue"];
const ALL_STYLES: StylePackId[] = ["song_incise", "yuan_blue", "modern_studio"];
const CLAY_TECHNIQUES: DecorationTechnique[] = ["incise", "stamp", "underglaze"];

export const MOTIFS: MotifOption[] = [
  { id:"lotus", name:"莲花", family:"flora", roles:["main","stamp"], stylePackIds:ALL_STYLES, techniques:CLAY_TECHNIQUES, anchors:["belly","well"], repeatMode:"radial", densityRange:[.8,1.5], meaningNote:"常见解释：清雅自持，也常用于表达连绵生意。", shaderCode:1, glyph:"莲", license:"original" },
  { id:"peony", name:"牡丹", family:"flora", roles:["main","stamp"], stylePackIds:ALL_STYLES, techniques:CLAY_TECHNIQUES, anchors:["belly","shoulder","well"], repeatMode:"single", densityRange:[.8,1.4], meaningNote:"常用于表达丰盛、雍容与美好祝愿。", shaderCode:2, glyph:"牡", license:"original" },
  { id:"plum", name:"梅", family:"flora", roles:["main","stamp"], stylePackIds:ALL_STYLES, techniques:["incise","underglaze","overglaze"], anchors:["belly","neck"], repeatMode:"single", densityRange:[.7,1.35], meaningNote:"常见解释：凌寒而开，寄托坚韧与新春之意。", shaderCode:3, glyph:"梅", license:"original" },
  { id:"bamboo", name:"竹", family:"flora", roles:["main","stamp"], stylePackIds:ALL_STYLES, techniques:["incise","underglaze"], anchors:["neck","belly"], repeatMode:"pair", densityRange:[.7,1.4], meaningNote:"常用于表达清雅、挺拔与节节向上。", shaderCode:4, glyph:"竹", license:"original" },
  { id:"fish", name:"鱼", family:"animal", roles:["main","stamp"], stylePackIds:SONG_AND_BLUE, techniques:CLAY_TECHNIQUES, anchors:["belly","well"], repeatMode:"pair", densityRange:[.8,1.4], meaningNote:"常见解释：有余、有活力，也常见于水景构图。", shaderCode:5, glyph:"鱼", license:"original" },
  { id:"crane", name:"鹤", family:"animal", roles:["main","stamp"], stylePackIds:["yuan_blue","modern_studio"], techniques:["underglaze","overglaze"], anchors:["belly"], repeatMode:"pair", densityRange:[.7,1.2], meaningNote:"常用于表达安宁、长久与舒展的气韵。", shaderCode:6, glyph:"鹤", license:"original" },
  { id:"bat", name:"蝙蝠", family:"animal", roles:["main","stamp"], stylePackIds:ALL_STYLES, techniques:["stamp","underglaze","overglaze"], anchors:["belly","well"], repeatMode:"four", densityRange:[.8,1.5], meaningNote:"因谐音关系，常用于表达福意与祝愿。", shaderCode:7, glyph:"福", license:"original" },
  { id:"butterfly", name:"蝴蝶", family:"animal", roles:["main","stamp"], stylePackIds:["yuan_blue","modern_studio"], techniques:["underglaze","overglaze"], anchors:["belly","well"], repeatMode:"pair", densityRange:[.8,1.4], meaningNote:"常用于表达生机、轻盈与花间相伴。", shaderCode:8, glyph:"蝶", license:"original" },
  { id:"dragon", name:"龙", family:"animal", roles:["main"], stylePackIds:["yuan_blue"], techniques:["underglaze"], anchors:["belly"], repeatMode:"single", densityRange:[.75,1.15], meaningNote:"常见于气势舒展的器身构图，表达昂扬之意。", shaderCode:9, glyph:"龙", license:"original" },
  { id:"cloud", name:"祥云", family:"cloud_water", roles:["main","stamp"], stylePackIds:ALL_STYLES, techniques:CLAY_TECHNIQUES, anchors:["neck","shoulder","belly","well"], repeatMode:"four", densityRange:[.8,1.6], meaningNote:"常用于连接主体与留白，表达舒展、和合的气息。", shaderCode:10, glyph:"云", license:"original" },
  { id:"sea", name:"海水", family:"cloud_water", roles:["main"], stylePackIds:SONG_AND_BLUE, techniques:["incise","underglaze"], anchors:["belly","foot","well"], repeatMode:"band", densityRange:[.8,1.6], meaningNote:"常用于承托主纹，形成水意与层次。", shaderCode:11, glyph:"水", license:"original" },
  { id:"longevity", name:"寿字", family:"symbol", roles:["main","stamp"], stylePackIds:ALL_STYLES, techniques:CLAY_TECHNIQUES, anchors:["belly","well"], repeatMode:"single", densityRange:[.8,1.3], meaningNote:"常用于表达安康长久的祝愿。", shaderCode:12, glyph:"寿", license:"original" },
  { id:"meander", name:"回纹", family:"geometry", roles:["main","border"], stylePackIds:ALL_STYLES, techniques:CLAY_TECHNIQUES, anchors:["rim","shoulder","foot"], repeatMode:"band", densityRange:[.8,1.7], meaningNote:"连续折线常用于收束边界，形成连绵秩序。", shaderCode:13, glyph:"回", license:"original" },
  { id:"ruyi", name:"如意", family:"symbol", roles:["main","border","stamp"], stylePackIds:ALL_STYLES, techniques:CLAY_TECHNIQUES, anchors:["rim","shoulder","belly","foot"], repeatMode:"band", densityRange:[.8,1.6], meaningNote:"云头式轮廓常用于表达顺遂与圆满祝愿。", shaderCode:14, glyph:"意", license:"original" },
  { id:"lotus_petals", name:"莲瓣", family:"flora", roles:["main","border"], stylePackIds:SONG_AND_BLUE, techniques:CLAY_TECHNIQUES, anchors:["shoulder","foot","well"], repeatMode:"band", densityRange:[.8,1.7], meaningNote:"常作为器身上下的收束纹，形成向心秩序。", shaderCode:15, glyph:"瓣", license:"original" }
];

export const BORDERS: MotifOption[] = [
  { ...MOTIFS[12], id:"meander_border", name:"回纹边饰", roles:["border"], shaderCode:16 },
  { ...MOTIFS[13], id:"ruyi_border", name:"如意云头", roles:["border"], shaderCode:17 },
  { ...MOTIFS[14], id:"lotus_border", name:"莲瓣边饰", roles:["border"], shaderCode:18 },
  { ...MOTIFS[10], id:"sea_border", name:"海水边饰", roles:["border"], shaderCode:19 },
  { ...MOTIFS[1], id:"scroll_border", name:"缠枝边饰", roles:["border"], shaderCode:20 },
  { ...MOTIFS[11], id:"pearl_border", name:"珠点边饰", roles:["border"], shaderCode:21 }
];

export const ALL_DECORATION_MOTIFS = [...MOTIFS, ...BORDERS];

export const DECORATION_TEMPLATES: DecorationTemplate[] = [
  { id:"lotus_pond", name:"莲池清韵", note:"莲花与游鱼留出水面般的呼吸", stylePackId:"song_incise", recommendedShapes:["bowl","plate","jar"], components:[
    {motifId:"lotus",role:"main",anchor:"well",repeatMode:"radial",scale:1.1},
    {motifId:"fish",role:"main",anchor:"belly",repeatMode:"pair",scale:.82},
    {motifId:"sea_border",role:"border",anchor:"foot",repeatMode:"band",scale:.72,density:1.15}
  ]},
  { id:"plum_bird", name:"梅鹊报春", note:"梅枝斜出，留一处早春的空白", stylePackId:"yuan_blue", recommendedShapes:["vase","jar"], components:[
    {motifId:"plum",role:"main",anchor:"belly",repeatMode:"single",scale:1.08},
    {motifId:"crane",role:"main",anchor:"shoulder",repeatMode:"pair",scale:.68},
    {motifId:"ruyi_border",role:"border",anchor:"foot",repeatMode:"band",scale:.66,density:1.2}
  ]},
  { id:"scrolling_bloom", name:"缠枝花卉", note:"花叶沿器身连绵生长", stylePackId:"yuan_blue", recommendedShapes:["vase","jar","cup"], components:[
    {motifId:"peony",role:"main",anchor:"belly",repeatMode:"four",scale:.9},
    {motifId:"scroll_border",role:"border",anchor:"shoulder",repeatMode:"band",scale:.7,density:1.35},
    {motifId:"lotus_border",role:"border",anchor:"foot",repeatMode:"band",scale:.68,density:1.2}
  ]},
  { id:"cloud_crane", name:"云鹤延年", note:"鹤在云气间舒展，边界以回纹收束", stylePackId:"yuan_blue", recommendedShapes:["vase","cup"], components:[
    {motifId:"crane",role:"main",anchor:"belly",repeatMode:"pair",scale:1.02},
    {motifId:"cloud",role:"main",anchor:"shoulder",repeatMode:"four",scale:.66},
    {motifId:"meander_border",role:"border",anchor:"foot",repeatMode:"band",scale:.58,density:1.45}
  ]},
  { id:"fortune_longevity", name:"福寿相伴", note:"中心有寿，四周以福意环抱", stylePackId:"modern_studio", recommendedShapes:["plate","jar","cup"], components:[
    {motifId:"longevity",role:"main",anchor:"well",repeatMode:"single",scale:1.04},
    {motifId:"bat",role:"main",anchor:"belly",repeatMode:"four",scale:.72},
    {motifId:"ruyi_border",role:"border",anchor:"foot",repeatMode:"band",scale:.62,density:1.3}
  ]},
  { id:"quiet_geometry", name:"留白几何", note:"一圈线、一列点，把余地留给款识", stylePackId:"modern_studio", recommendedShapes:["cup","bowl","vase","jar","plate"], components:[
    {motifId:"meander_border",role:"border",anchor:"belly",repeatMode:"band",scale:.72,density:.9},
    {motifId:"pearl_border",role:"border",anchor:"foot",repeatMode:"band",scale:.52,density:1.25}
  ]}
];

export const INSCRIPTION_LAYOUTS: InscriptionChoice[] = [
  { id:"square_2x2", name:"2×2 方款" },
  { id:"square_2x3", name:"2×3 方款" },
  { id:"horizontal", name:"横排短款" },
  { id:"vertical", name:"竖排短款" },
  { id:"round", name:"圆章款" }
];

export const INSCRIPTION_STYLES: InscriptionChoice[] = [
  { id:"blue", name:"青花" },
  { id:"seal_red", name:"印红" },
  { id:"incised", name:"刻款" }
];

export const INSCRIPTION_TYPEFACES: InscriptionChoice[] = [
  { id:"regular", name:"清雅楷意" },
  { id:"seal", name:"篆意印文" }
];

export const BLESSINGS = [
  "平安喜乐", "福寿康宁", "岁岁安好", "万事胜意", "长乐未央", "四时如意",
  "春和景明", "心有清欢", "顺遂无忧", "花开见喜", "竹报平安", "常乐常安"
];

export const DECORATION_COLORS: Record<string, string> = {
  clay_shadow: "#756a5d",
  jade_shadow: "#4f6f62",
  cobalt_light: "#668da0",
  cobalt: "#315e73",
  cobalt_deep: "#203f58",
  seal_red: "#a84f43",
  amber: "#bb7b46",
  moss: "#657858",
  ink: "#27322d",
  porcelain: "#eee9dc"
};

export const PALETTES: InscriptionChoice[] = [
  { id:"jade_shadow", name:"青釉浅影", note:"同色浅刻，靠光影显纹" },
  { id:"cobalt_wash", name:"青花三浓", note:"淡、中、浓三档釉下蓝" },
  { id:"studio_muted", name:"工坊点色", note:"松烟、印红与低饱和点色" }
];

const SHAPE_ANCHORS: Record<ShapeId, DecorationAnchor[]> = {
  cup: ["rim", "belly", "foot", "base"],
  bowl: ["rim", "belly", "foot", "well", "base"],
  vase: ["neck", "shoulder", "belly", "foot", "base"],
  jar: ["rim", "shoulder", "belly", "foot", "base"],
  plate: ["rim", "well", "base"]
};

export const ANCHOR_LABELS: Record<DecorationAnchor, string> = {
  rim:"口沿", neck:"颈部", shoulder:"肩部", belly:"腹部", foot:"足边", well:"盘心", base:"底部"
};

export const TECHNIQUE_LABELS: Record<DecorationTechnique, string> = {
  incise:"刻花", stamp:"印花", underglaze:"青花", overglaze:"釉上彩"
};

export const REPEAT_LABELS: Record<DecorationRepeatMode, string> = {
  single:"无对称", pair:"左右成对", four:"四向环绕", band:"连续一周", radial:"同心展开"
};

export function availableAnchors(shapeId: ShapeId): DecorationAnchor[] {
  return SHAPE_ANCHORS[shapeId].slice();
}

export function anchorRange(shapeId: ShapeId, anchor: DecorationAnchor): [number, number] {
  const ranges: Record<DecorationAnchor, [number, number]> = {
    rim:[.84,.97], neck:[.69,.9], shoulder:[.58,.78], belly:[.25,.7], foot:[.08,.27], well:[.12,.58], base:[0,.13]
  };
  if (shapeId === "plate" && anchor === "well") return [.15,.72];
  if (shapeId === "bowl" && anchor === "well") return [.18,.66];
  if (shapeId === "cup" && anchor === "belly") return [.3,.67];
  return ranges[anchor];
}

export function stableKilnSeed(workId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < workId.length; index++) {
    hash ^= workId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || 1;
}

export function createDecorationComposition(workId: string): DecorationComposition {
  return {
    stylePackId:"yuan_blue",
    paletteId:"cobalt_wash",
    layers:[],
    stamps:[],
    kilnSeed:stableKilnSeed(workId)
  };
}

function layerId(prefix = "layer"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function preferredAnchor(
  shapeId: ShapeId,
  requested: DecorationAnchor,
  role: DecorationRole | "stamp"
): DecorationAnchor {
  const available = availableAnchors(shapeId);
  if (available.includes(requested)) return requested;
  if ((requested === "well" || role === "main") && available.includes("belly")) return "belly";
  if (role === "border" && available.includes("foot")) return "foot";
  return available.find((anchor) => anchor !== "base") || available[0];
}

function defaultTechnique(stylePackId: StylePackId, motif: MotifOption): DecorationTechnique {
  const pack = STYLE_PACKS.find((item) => item.id === stylePackId) || STYLE_PACKS[1];
  return pack.techniques.find((technique) => motif.techniques.includes(technique)) || motif.techniques[0];
}

function defaultColor(stylePackId: StylePackId, technique: DecorationTechnique): string {
  if (technique === "incise") return "clay_shadow";
  if (technique === "stamp") return stylePackId === "modern_studio" ? "ink" : "jade_shadow";
  if (technique === "overglaze") return "seal_red";
  return stylePackId === "yuan_blue" ? "cobalt" : "cobalt_light";
}

export function createDecorationLayer(
  motifId: string,
  role: DecorationRole,
  shapeId: ShapeId,
  stylePackId: StylePackId,
  overrides: Partial<DecorationLayer> = {}
): DecorationLayer {
  const motif = ALL_DECORATION_MOTIFS.find((item) => item.id === motifId) || MOTIFS[0];
  const anchor = preferredAnchor(shapeId, overrides.anchor || motif.anchors[0], role);
  const range = anchorRange(shapeId, anchor);
  const technique = overrides.technique || defaultTechnique(stylePackId, motif);
  return clampDecorationLayer({
    layerId:overrides.layerId || layerId(),
    catalogKey:typeof overrides.catalogKey === "string"
      ? overrides.catalogKey.slice(0, 64)
      : undefined,
    copySourceId:typeof overrides.copySourceId === "string"
      ? overrides.copySourceId.slice(0, 64)
      : undefined,
    copyNumber:Number.isInteger(overrides.copyNumber) && Number(overrides.copyNumber) > 0
      ? Math.min(99, Number(overrides.copyNumber))
      : undefined,
    motifId:motif.id,
    role,
    anchor,
    technique,
    repeatMode:overrides.repeatMode || (role === "border" ? "band" : motif.repeatMode),
    colorId:overrides.colorId || defaultColor(stylePackId, technique),
    u:overrides.u ?? .5,
    v:overrides.v ?? (range[0] + range[1]) / 2,
    scale:overrides.scale ?? 1,
    scaleX:overrides.scaleX ?? overrides.scale ?? 1,
    scaleY:overrides.scaleY ?? overrides.scale ?? 1,
    flipY:overrides.flipY === true,
    rotation:overrides.rotation ?? 0,
    density:overrides.density ?? 1,
    visible:overrides.visible !== false
  }, shapeId);
}

export function createDecorationStamp(
  motifId: string,
  shapeId: ShapeId,
  stylePackId: StylePackId,
  u = .5,
  v?: number
): DecorationStamp {
  const base = createDecorationLayer(motifId, "main", shapeId, stylePackId, {
    layerId:layerId("stamp"),
    anchor:"belly",
    repeatMode:"single",
    u,
    v,
    scale:.62
  });
  return { ...base, role:"stamp", repeatMode:"single" };
}

export function clampDecorationLayer<T extends DecorationLayer | DecorationStamp>(
  layer: T,
  shapeId: ShapeId
): T {
  const motif = ALL_DECORATION_MOTIFS.find((item) => item.id === layer.motifId) || MOTIFS[0];
  const role = layer.role;
  const anchor = preferredAnchor(shapeId, layer.anchor, role);
  const range = anchorRange(shapeId, anchor);
  const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;
  return {
    ...layer,
    motifId:motif.id,
    anchor,
    u:((finite(layer.u, .5) % 1) + 1) % 1,
    v:Math.max(range[0], Math.min(range[1], finite(layer.v, (range[0] + range[1]) / 2))),
    scale:Math.max(.42, Math.min(1.65, finite(layer.scale, 1))),
    scaleX:Math.max(.42, Math.min(1.65, finite(layer.scaleX, finite(layer.scale, 1)))),
    scaleY:Math.max(.42, Math.min(1.65, finite(layer.scaleY, finite(layer.scale, 1)))),
    flipY:layer.flipY === true,
    rotation:Math.max(-180, Math.min(180, finite(layer.rotation, 0))),
    density:Math.max(.65, Math.min(1.8, finite(layer.density, 1))),
    visible:layer.visible !== false
  } as T;
}

export function duplicateDecorationLayer<T extends DecorationLayer | DecorationStamp>(
  source: T,
  existing: (DecorationLayer | DecorationStamp)[],
  shapeId: ShapeId
): T {
  const copySourceId = source.copySourceId || source.layerId;
  const copyNumber = existing.reduce((highest, layer) => {
    if (layer.copySourceId !== copySourceId) return highest;
    return Math.max(highest, layer.copyNumber || 0);
  }, 0) + 1;
  return clampDecorationLayer({
    ...source,
    layerId:layerId(source.role === "stamp" ? "stamp" : "layer"),
    catalogKey:undefined,
    copySourceId,
    copyNumber,
    u:source.u + .04,
    v:source.v + .025
  } as T, shapeId);
}

export function applyDecorationTemplate(
  composition: DecorationComposition,
  templateId: string,
  shapeId: ShapeId
): DecorationComposition {
  const template = DECORATION_TEMPLATES.find((item) => item.id === templateId) || DECORATION_TEMPLATES[0];
  const stylePackId = template.stylePackId;
  const pack = STYLE_PACKS.find((item) => item.id === stylePackId)!;
  const layers = template.components.slice(0, MAX_DECORATION_LAYERS).map((component, index) => {
    const anchor = preferredAnchor(shapeId, component.anchor, component.role);
    const range = anchorRange(shapeId, anchor);
    return createDecorationLayer(component.motifId, component.role, shapeId, stylePackId, {
      anchor,
      repeatMode:component.repeatMode,
      scale:component.scale,
      density:component.density || 1,
      u:(.5 + index * .17) % 1,
      v:(range[0] + range[1]) / 2
    });
  });
  return {
    ...composition,
    stylePackId,
    paletteId:pack.paletteId,
    templateId:template.id,
    layers,
    stamps:[]
  };
}

export function retargetStyle(
  composition: DecorationComposition,
  stylePackId: StylePackId
): DecorationComposition {
  const pack = STYLE_PACKS.find((item) => item.id === stylePackId) || STYLE_PACKS[1];
  const retarget = <T extends DecorationLayer | DecorationStamp>(layer: T): T => {
    const motif = ALL_DECORATION_MOTIFS.find((item) => item.id === layer.motifId) || MOTIFS[0];
    const technique = defaultTechnique(pack.id, motif);
    return { ...layer, technique, colorId:defaultColor(pack.id, technique) };
  };
  return {
    ...composition,
    stylePackId:pack.id,
    paletteId:pack.paletteId,
    layers:composition.layers.map(retarget),
    stamps:composition.stamps.map(retarget)
  };
}

export function borderRepeatCount(density: number): number {
  return Math.max(6, Math.min(18, Math.round(10 * Math.max(.65, Math.min(1.8, density)))));
}

export function motifById(id: string): MotifOption {
  return ALL_DECORATION_MOTIFS.find((item) => item.id === id) || MOTIFS[0];
}

export function motifShaderCode(id: string): number {
  return motifById(id).shaderCode;
}

export function decorationColorHex(colorId?: string): string {
  return DECORATION_COLORS[colorId || "cobalt"] || DECORATION_COLORS.cobalt;
}

export function validateInscriptionText(text: string): string {
  if (!text.trim()) return "写款内容还空着";
  const lines = text.split("\n");
  if (lines.length > 2) return "写款最多排成两行";
  const visible = Array.from(text.replace(/\s/g, ""));
  if (visible.length > 12) return "写款最多 12 个字";
  if (Array.from(text).some((character) => (character.codePointAt(0) || 0) > 0xffff)) {
    return "写款暂不支持 emoji";
  }
  if (/[^\u3400-\u9fffA-Za-z0-9 .·,，。#№No/\-\n]/.test(text)) {
    return "有些字符还不能落款，请换成常用字、字母或数字";
  }
  return "";
}

export function defaultInscription(now = new Date()): Inscription {
  const date = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;
  return {
    contentType:"signature",
    text:`掌心作\n${date}`,
    layoutId:"square_2x3",
    styleId:"blue",
    typefaceId:"regular",
    anchor:"base",
    visibleInExport:true
  };
}

function safeInscription(raw: any): Inscription | undefined {
  if (!raw || typeof raw.text !== "string") return undefined;
  const text = raw.text.slice(0, 32).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  if (validateInscriptionText(text)) return undefined;
  const layoutId = INSCRIPTION_LAYOUTS.some((item) => item.id === raw.layoutId) ? raw.layoutId : "square_2x2";
  const styleId: InscriptionStyleId = INSCRIPTION_STYLES.some((item) => item.id === raw.styleId) ? raw.styleId : "blue";
  const typefaceId = INSCRIPTION_TYPEFACES.some((item) => item.id === raw.typefaceId) ? raw.typefaceId : "regular";
  const contentType: InscriptionContentType = ["signature","date","blessing","serial"].includes(raw.contentType) ? raw.contentType : "signature";
  const anchor: InscriptionAnchor = ["base","well","lower_belly"].includes(raw.anchor) ? raw.anchor : "base";
  return { contentType, text, layoutId, styleId, typefaceId, anchor, visibleInExport:raw.visibleInExport !== false };
}

export function validateDecorationComposition(
  raw: any,
  shapeId: ShapeId,
  workId: string
): DecorationComposition {
  const fallback = createDecorationComposition(workId);
  if (!raw || typeof raw !== "object") return fallback;
  const stylePackId: StylePackId = STYLE_PACKS.some((item) => item.id === raw.stylePackId)
    ? raw.stylePackId
    : fallback.stylePackId;
  const pack = STYLE_PACKS.find((item) => item.id === stylePackId)!;
  const validTechnique = (value: any): DecorationTechnique =>
    ["incise","stamp","underglaze","overglaze"].includes(value) ? value : pack.techniques[0];
  const parseLayer = (value: any, role: DecorationRole | "stamp") => {
    const motif = motifById(String(value?.motifId || "lotus"));
    const layer = createDecorationLayer(
      motif.id,
      role === "stamp" ? "main" : role,
      shapeId,
      stylePackId,
      {
        ...value,
        role:role === "stamp" ? "main" : role,
        technique:validTechnique(value?.technique),
        layerId:typeof value?.layerId === "string" ? value.layerId : layerId(role),
        colorId:DECORATION_COLORS[value?.colorId] ? value.colorId : undefined
      }
    );
    return role === "stamp"
      ? ({ ...layer, role:"stamp", repeatMode:"single" } as DecorationStamp)
      : layer;
  };
  const layers = (Array.isArray(raw.layers) ? raw.layers : [])
    .slice(0, MAX_DECORATION_LAYERS)
    .map((value: any) => parseLayer(value, ["main","border","accent"].includes(value?.role) ? value.role : "main")) as DecorationLayer[];
  const stamps = (Array.isArray(raw.stamps) ? raw.stamps : [])
    .slice(0, MAX_DECORATION_STAMPS)
    .map((value: any) => parseLayer(value, "stamp")) as DecorationStamp[];
  const seed = Number.isFinite(raw.kilnSeed) && raw.kilnSeed > 0
    ? Math.floor(raw.kilnSeed) >>> 0
    : fallback.kilnSeed;
  const inscription = safeInscription(raw.inscription);
  if (inscription?.anchor === "well" && shapeId !== "bowl" && shapeId !== "plate") {
    inscription.anchor = "base";
  }
  if (inscription?.anchor === "lower_belly" && shapeId === "plate") inscription.anchor = "base";
  return {
    stylePackId,
    templateId:DECORATION_TEMPLATES.some((item) => item.id === raw.templateId) ? raw.templateId : undefined,
    paletteId:PALETTES.some((item) => item.id === raw.paletteId) ? raw.paletteId : pack.paletteId,
    layers,
    stamps,
    inscription,
    kilnSeed:seed || fallback.kilnSeed
  };
}

export function migrateLegacyDecoration(raw: any, shapeId: ShapeId, workId: string): DecorationComposition {
  let composition = createDecorationComposition(workId);
  const legacy = Array.isArray(raw?.decorations) ? raw.decorations : [];
  const last = legacy.slice().reverse().find((item: any) => ["carve","impress","stamp","decal"].includes(item?.type));
  if (last) {
    const mapping: Record<string, { motifId:string; technique:DecorationTechnique }> = {
      carve:{motifId:"meander",technique:"incise"},
      impress:{motifId:"ruyi",technique:"stamp"},
      stamp:{motifId:"longevity",technique:"stamp"},
      decal:{motifId:"lotus",technique:"underglaze"}
    };
    const mapped = mapping[last.type];
    composition.layers.push(createDecorationLayer(mapped.motifId, "main", shapeId, composition.stylePackId, {
      technique:mapped.technique,
      u:Number.isFinite(last.angle) ? ((last.angle / 360) % 1 + 1) % 1 : .5,
      v:Number.isFinite(last.y) ? last.y : .55
    }));
  }
  if (Number(raw?.paintPattern) > 0) {
    const motifIds = ["lotus", "meander", "pearl_border", "cloud"];
    composition.layers.push(createDecorationLayer(
      motifIds[(Math.max(1, Math.min(4, Number(raw.paintPattern))) - 1)],
      "accent",
      shapeId,
      "modern_studio",
      { technique:"overglaze", colorId:"seal_red", anchor:"belly", repeatMode:"four", scale:.72 }
    ));
  }
  composition.layers = composition.layers.slice(0, MAX_DECORATION_LAYERS);
  return composition;
}

export function decorationSummary(composition: DecorationComposition): {
  motifNames: string[];
  techniqueNames: string[];
  meaningNote: string;
} {
  const all = [...composition.layers, ...composition.stamps];
  const motifNames = Array.from(new Set(all.map((layer) => motifById(layer.motifId).name)));
  const techniqueNames = Array.from(new Set(all.map((layer) => TECHNIQUE_LABELS[layer.technique])));
  const first = all[0] ? motifById(all[0].motifId) : undefined;
  return { motifNames, techniqueNames, meaningNote:first?.meaningNote || "素面留白，让泥与釉自己说话。" };
}
