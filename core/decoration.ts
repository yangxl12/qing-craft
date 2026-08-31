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
  /** 0..1 为器身高度；-1..0 为从器底中心到足边的连续路径。 */
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

export type SealMarkColorId = "seal_red" | "cobalt" | "wujin";

/** 器身题款：正方形印章式款识，字符竖排，可拖动到器身任意位置。 */
export interface SealMark {
  text: string;
  colorId: SealMarkColorId;
  u: number;
  /** 0..1 为器身高度；-1..0 为从器底中心到足边的连续路径。 */
  v: number;
  scaleX: number;
  scaleY: number;
}

export interface DecorationComposition {
  stylePackId: StylePackId;
  templateId?: string;
  paletteId: string;
  layers: DecorationLayer[];
  stamps: DecorationStamp[];
  inscription?: Inscription;
  sealMark?: SealMark;
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
  /** Index into the packaged 5x4 bitmap atlas for source-preserving motifs. */
  atlasIndex?: number;
  catalogDefaults?: Partial<Pick<
    DecorationLayer,
    "anchor" | "repeatMode" | "scale" | "scaleX" | "scaleY" | "rotation" | "density"
  >>;
  license: "original" | "user-provided";
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

export const MAX_DECORATION_STAMPS = 8;
export const MAX_SEAL_MARK_CHARACTERS = 6;
export const DECOR_PATTERN_ATLAS_PATH = "/assets/decoration/patterns/blue-white-pattern-atlas.jpg";
export const DECOR_PATTERN_ATLAS_COLUMNS = 5;
export const DECOR_PATTERN_ATLAS_ROWS = 4;
export const DECOR_PATTERN_ATLAS_SHADER_CODE_BASE = 256;
/** 0 是器身与器底交界，-1 是器底中心，1 是器身口沿。 */
export const MIN_DECORATION_SURFACE_V = -1;

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

interface CuratedMotifOptions {
  id: string;
  name: string;
  shaderCode: number;
  defaults: NonNullable<MotifOption["catalogDefaults"]>;
}

function curatedMotif(
  source: MotifOption,
  options: CuratedMotifOptions,
  kind: "pattern" | "ornament" | "carving"
): MotifOption {
  return {
    ...source,
    id:options.id,
    name:options.name,
    roles:kind === "ornament" ? ["border"] : ["main"],
    stylePackIds:ALL_STYLES,
    techniques:kind === "carving" ? ["incise"] : ["underglaze"],
    repeatMode:options.defaults.repeatMode || source.repeatMode,
    shaderCode:options.shaderCode,
    catalogDefaults:options.defaults,
    license:"original"
  };
}

/**
 * 装饰材料库中的馆藏级图案。每一项都拥有独立目录 ID、构图比例与着色器变体，
 * 不再通过侧栏轮转少量母纹样来凑数；母纹样仍保留给旧作品和一键构图使用。
 */
const LEGACY_DECOR_PATTERN_WORKS: MotifOption[] = [
  curatedMotif(MOTIFS[0], { id:"curated_lotus_pond", name:"莲池清韵", shaderCode:33, defaults:{ repeatMode:"radial", scaleX:1.08, scaleY:1.08, density:1.15 } }, "pattern"),
  curatedMotif(MOTIFS[1], { id:"curated_peony_scroll", name:"缠枝牡丹", shaderCode:66, defaults:{ repeatMode:"four", scaleX:.88, scaleY:.94, rotation:-8, density:1.3 } }, "pattern"),
  curatedMotif(MOTIFS[2], { id:"curated_plum_shadow", name:"梅枝疏影", shaderCode:99, defaults:{ repeatMode:"single", scaleX:1.18, scaleY:.9, rotation:-16, density:.88 } }, "pattern"),
  curatedMotif(MOTIFS[3], { id:"curated_bamboo_stone", name:"竹石清风", shaderCode:36, defaults:{ repeatMode:"pair", scaleX:.82, scaleY:1.16, rotation:7, density:1.02 } }, "pattern"),
  curatedMotif(MOTIFS[4], { id:"curated_fish_algae", name:"鱼藻同游", shaderCode:69, defaults:{ repeatMode:"pair", scaleX:1.04, scaleY:.76, rotation:-5, density:1.18 } }, "pattern"),
  curatedMotif(MOTIFS[5], { id:"curated_cloud_crane", name:"云鹤延年", shaderCode:102, defaults:{ repeatMode:"pair", scaleX:1.02, scaleY:1.08, rotation:8, density:.92 } }, "pattern"),
  curatedMotif(MOTIFS[6], { id:"curated_five_bats", name:"五福捧寿", shaderCode:39, defaults:{ repeatMode:"four", scaleX:.82, scaleY:.82, rotation:12, density:1.24 } }, "pattern"),
  curatedMotif(MOTIFS[7], { id:"curated_butterfly_peony", name:"蝶恋牡丹", shaderCode:72, defaults:{ repeatMode:"pair", scaleX:.96, scaleY:.84, rotation:-12, density:1.08 } }, "pattern"),
  curatedMotif(MOTIFS[8], { id:"curated_dragon_pearl", name:"云龙赶珠", shaderCode:105, defaults:{ repeatMode:"single", scaleX:1.2, scaleY:.88, rotation:-6, density:.8 } }, "pattern"),
  curatedMotif(MOTIFS[9], { id:"curated_auspicious_cloud", name:"瑞云流霞", shaderCode:42, defaults:{ repeatMode:"four", scaleX:.9, scaleY:.78, rotation:6, density:1.36 } }, "pattern"),
  curatedMotif(MOTIFS[10], { id:"curated_cliff_sea", name:"海水江崖", shaderCode:75, defaults:{ repeatMode:"band", scaleX:.78, scaleY:.72, density:1.45 } }, "pattern"),
  curatedMotif(MOTIFS[11], { id:"curated_longevity_roundel", name:"团寿如意", shaderCode:108, defaults:{ repeatMode:"single", scaleX:.88, scaleY:.88, rotation:45, density:1.05 } }, "pattern"),
  curatedMotif(MOTIFS[14], { id:"curated_lotus_treasure", name:"莲瓣宝相", shaderCode:47, defaults:{ repeatMode:"radial", scaleX:.94, scaleY:.94, density:1.28 } }, "pattern"),
  curatedMotif(MOTIFS[1], { id:"curated_broken_peony", name:"折枝牡丹", shaderCode:98, defaults:{ repeatMode:"single", scaleX:1.12, scaleY:1.04, rotation:14, density:.86 } }, "pattern"),
  curatedMotif(MOTIFS[0], { id:"curated_twin_lotus", name:"并蒂莲华", shaderCode:65, defaults:{ repeatMode:"pair", scaleX:.9, scaleY:1.08, rotation:-4, density:1.12 } }, "pattern"),
  curatedMotif(MOTIFS[3], { id:"curated_orchid_bamboo", name:"兰竹双清", shaderCode:100, defaults:{ repeatMode:"pair", scaleX:.72, scaleY:1.22, rotation:-9, density:.94 } }, "pattern"),
  curatedMotif(MOTIFS[4], { id:"curated_double_fish", name:"双鱼吉庆", shaderCode:37, defaults:{ repeatMode:"pair", scaleX:1.12, scaleY:.8, rotation:6, density:1.2 } }, "pattern"),
  curatedMotif(MOTIFS[5], { id:"curated_crane_sun", name:"鹤舞朝阳", shaderCode:70, defaults:{ repeatMode:"single", scaleX:1.08, scaleY:1.18, rotation:-7, density:.84 } }, "pattern"),
  curatedMotif(MOTIFS[7], { id:"curated_spring_butterfly", name:"花蝶迎春", shaderCode:104, defaults:{ repeatMode:"four", scaleX:.78, scaleY:.82, rotation:15, density:1.26 } }, "pattern"),
  curatedMotif(MOTIFS[6], { id:"curated_fortune_longevity", name:"福寿连绵", shaderCode:71, defaults:{ repeatMode:"four", scaleX:.88, scaleY:.88, rotation:-10, density:1.38 } }, "pattern")
];

interface UploadedPatternOptions {
  id: string;
  name: string;
  glyph: string;
  atlasIndex: number;
  meaningNote: string;
}

function uploadedPattern(source: MotifOption, options: UploadedPatternOptions): MotifOption {
  return {
    ...source,
    id:options.id,
    name:options.name,
    roles:["main"],
    stylePackIds:ALL_STYLES,
    techniques:["underglaze"],
    anchors:["belly", "well"],
    repeatMode:"single",
    densityRange:[.7, 1.3],
    meaningNote:options.meaningNote,
    shaderCode:DECOR_PATTERN_ATLAS_SHADER_CODE_BASE + options.atlasIndex,
    glyph:options.glyph,
    atlasIndex:options.atlasIndex,
    catalogDefaults:{
      anchor:"belly",
      repeatMode:"single",
      scale:1.32,
      scaleX:1.32,
      scaleY:1.32,
      density:1
    },
    license:"user-provided"
  };
}

/**
 * 用户提供的二十幅青花圆景。目录缩略图与器身渲染共用同一图集索引，
 * 避免菜单看见新图、实际贴到器物上仍回退到旧程序纹样。
 */
export const DECOR_PATTERN_WORKS: MotifOption[] = [
  uploadedPattern(MOTIFS[1], { id:"uploaded_peony_prosperity", name:"牡丹富贵图", glyph:"牡", atlasIndex:0, meaningNote:"牡丹与花蝶相映，常用于表达富贵丰盛与春日生机。" }),
  uploadedPattern(MOTIFS[0], { id:"uploaded_lotus_ducks", name:"莲池鸳鸯图", glyph:"鸳", atlasIndex:1, meaningNote:"莲池鸳鸯成双，常用于表达和美相伴与清雅圆满。" }),
  uploadedPattern(MOTIFS[3], { id:"uploaded_four_gentlemen", name:"梅兰竹菊", glyph:"雅", atlasIndex:2, meaningNote:"梅兰竹菊四时相续，寄托清雅、坚韧与自持之意。" }),
  uploadedPattern(MOTIFS[2], { id:"uploaded_winter_friends", name:"岁寒三友", glyph:"友", atlasIndex:3, meaningNote:"松竹梅凌寒相伴，常用于表达坚贞、长青与高洁品格。" }),
  uploadedPattern(MOTIFS[9], { id:"uploaded_children_play", name:"婴戏图", glyph:"童", atlasIndex:4, meaningNote:"童子嬉游构图活泼，寄托家宅欢悦与生机绵延。" }),
  uploadedPattern(MOTIFS[10], { id:"uploaded_landscape_pavilion", name:"山水楼阁图", glyph:"山", atlasIndex:5, meaningNote:"远山楼阁层叠开合，营造可游可居的清远意境。" }),
  uploadedPattern(MOTIFS[5], { id:"uploaded_pine_cranes", name:"松鹤延年图", glyph:"鹤", atlasIndex:6, meaningNote:"苍松与双鹤相伴，常用于表达安康长久与松龄鹤寿。" }),
  uploadedPattern(MOTIFS[4], { id:"uploaded_fish_algae", name:"鱼藻图", glyph:"鱼", atlasIndex:7, meaningNote:"游鱼穿行水藻之间，常用于表达有余、生机与水意。" }),
  uploadedPattern(MOTIFS[1], { id:"uploaded_phoenix_peony", name:"凤凰牡丹图", glyph:"凤", atlasIndex:8, meaningNote:"凤凰与牡丹同绘，常用于表达华美、祥瑞与盛世气象。" }),
  uploadedPattern(MOTIFS[8], { id:"uploaded_dragon_pearl", name:"龙戏珠图", glyph:"龙", atlasIndex:9, meaningNote:"云龙逐珠盘旋舒展，呈现昂扬灵动与吉庆气韵。" }),
  uploadedPattern(MOTIFS[11], { id:"uploaded_eight_immortals", name:"八仙庆寿图", glyph:"仙", atlasIndex:10, meaningNote:"群仙会聚庆寿，寄托福泽、安康与长久祝愿。" }),
  uploadedPattern(MOTIFS[1], { id:"uploaded_three_abundances", name:"三多纹", glyph:"多", atlasIndex:11, meaningNote:"桃、石榴与佛手相映，常用于表达多福、多寿与多子。" }),
  uploadedPattern(MOTIFS[7], { id:"uploaded_flower_bird_spray", name:"折枝花鸟图", glyph:"鸟", atlasIndex:12, meaningNote:"折枝花卉与鸣鸟相映，传达春意、清趣与自然生机。" }),
  uploadedPattern(MOTIFS[1], { id:"uploaded_rock_flowers", name:"洞石花卉图", glyph:"石", atlasIndex:13, meaningNote:"洞石与繁花虚实相生，形成古雅而有层次的园林清供。" }),
  uploadedPattern(MOTIFS[2], { id:"uploaded_magpie_plum", name:"喜上眉梢", glyph:"喜", atlasIndex:14, meaningNote:"喜鹊立于梅梢，借谐音表达喜事将至与新春祝愿。" }),
  uploadedPattern(MOTIFS[7], { id:"uploaded_hundred_butterflies", name:"百蝶图", glyph:"蝶", atlasIndex:15, meaningNote:"群蝶穿花轻盈繁盛，常用于表达百福、生机与春色。" }),
  uploadedPattern(MOTIFS[1], { id:"uploaded_ladies_flowers", name:"仕女赏花图", glyph:"仕", atlasIndex:16, meaningNote:"仕女赏花构图闲雅，呈现庭院清欢与从容气韵。" }),
  uploadedPattern(MOTIFS[5], { id:"uploaded_deer_crane", name:"鹿鹤同春图", glyph:"春", atlasIndex:17, meaningNote:"鹿鹤与松景相伴，寄托安宁、长寿与同享春和。" }),
  uploadedPattern(MOTIFS[11], { id:"uploaded_antiquities", name:"博古清供图", glyph:"博", atlasIndex:18, meaningNote:"古器、花木与案几陈设相映，表达雅集清赏与文房意趣。" }),
  uploadedPattern(MOTIFS[11], { id:"uploaded_fortune_longevity", name:"福寿双全图", glyph:"寿", atlasIndex:19, meaningNote:"寿字、桃实与吉祥结组合，集中表达福寿双全的祝愿。" })
];

export const DECOR_ORNAMENT_WORKS: MotifOption[] = [
  curatedMotif(BORDERS[0], { id:"curated_meander_brocade", name:"回纹锦地", shaderCode:48, defaults:{ repeatMode:"band", scaleX:.72, scaleY:.64, density:1.52 } }, "ornament"),
  curatedMotif(BORDERS[1], { id:"curated_ruyi_cloud", name:"如意云头", shaderCode:81, defaults:{ repeatMode:"band", scaleX:.82, scaleY:.72, density:1.28 } }, "ornament"),
  curatedMotif(BORDERS[2], { id:"curated_lotus_up_down", name:"仰覆莲瓣", shaderCode:114, defaults:{ repeatMode:"band", scaleX:.74, scaleY:.82, density:1.36 } }, "ornament"),
  curatedMotif(BORDERS[3], { id:"curated_waves_cliff", name:"海水江崖", shaderCode:147, defaults:{ repeatMode:"band", scaleX:.78, scaleY:.76, density:1.48 } }, "ornament"),
  curatedMotif(BORDERS[4], { id:"curated_scroll_lotus", name:"缠枝莲带", shaderCode:52, defaults:{ repeatMode:"band", scaleX:.84, scaleY:.72, rotation:-4, density:1.42 } }, "ornament"),
  curatedMotif(BORDERS[5], { id:"curated_linked_pearl", name:"联珠纹", shaderCode:85, defaults:{ repeatMode:"band", scaleX:.58, scaleY:.58, density:1.62 } }, "ornament"),
  curatedMotif(BORDERS[4], { id:"curated_scroll_grass", name:"卷草纹", shaderCode:116, defaults:{ repeatMode:"band", scaleX:.86, scaleY:.66, rotation:7, density:1.34 } }, "ornament"),
  curatedMotif(BORDERS[0], { id:"curated_thunder", name:"云雷纹", shaderCode:144, defaults:{ repeatMode:"band", scaleX:.64, scaleY:.58, rotation:45, density:1.68 } }, "ornament"),
  curatedMotif(BORDERS[0], { id:"curated_tortoise_brocade", name:"龟背锦", shaderCode:80, defaults:{ repeatMode:"band", scaleX:.72, scaleY:.72, rotation:30, density:1.26 } }, "ornament"),
  curatedMotif(BORDERS[2], { id:"curated_diamond_flower", name:"菱花锦", shaderCode:50, defaults:{ repeatMode:"band", scaleX:.68, scaleY:.68, rotation:45, density:1.44 } }, "ornament"),
  curatedMotif(BORDERS[5], { id:"curated_yingluo", name:"璎珞垂珠", shaderCode:117, defaults:{ repeatMode:"band", scaleX:.7, scaleY:.86, density:1.3 } }, "ornament"),
  curatedMotif(BORDERS[2], { id:"curated_banana_leaf", name:"蕉叶纹", shaderCode:82, defaults:{ repeatMode:"band", scaleX:.64, scaleY:.92, density:1.38 } }, "ornament"),
  curatedMotif(BORDERS[3], { id:"curated_layered_waves", name:"叠浪纹", shaderCode:51, defaults:{ repeatMode:"band", scaleX:.8, scaleY:.66, density:1.56 } }, "ornament"),
  curatedMotif(BORDERS[1], { id:"curated_cloud_scroll", name:"卷云纹", shaderCode:113, defaults:{ repeatMode:"band", scaleX:.76, scaleY:.7, rotation:-8, density:1.32 } }, "ornament"),
  curatedMotif(BORDERS[4], { id:"curated_treasure_flower", name:"宝相花带", shaderCode:84, defaults:{ repeatMode:"band", scaleX:.82, scaleY:.78, density:1.22 } }, "ornament"),
  curatedMotif(BORDERS[4], { id:"curated_honeysuckle", name:"忍冬纹", shaderCode:148, defaults:{ repeatMode:"band", scaleX:.86, scaleY:.68, rotation:10, density:1.4 } }, "ornament"),
  curatedMotif(BORDERS[2], { id:"curated_ice_flower", name:"六出冰花", shaderCode:146, defaults:{ repeatMode:"band", scaleX:.66, scaleY:.66, rotation:30, density:1.5 } }, "ornament"),
  curatedMotif(BORDERS[5], { id:"curated_pearl_roundel", name:"联珠团花", shaderCode:53, defaults:{ repeatMode:"band", scaleX:.62, scaleY:.62, density:1.46 } }, "ornament"),
  curatedMotif(BORDERS[1], { id:"curated_lotus_ruyi", name:"莲瓣如意", shaderCode:49, defaults:{ repeatMode:"band", scaleX:.78, scaleY:.78, density:1.34 } }, "ornament"),
  curatedMotif(BORDERS[3], { id:"curated_winding_water", name:"曲水纹", shaderCode:115, defaults:{ repeatMode:"band", scaleX:.88, scaleY:.64, rotation:-5, density:1.58 } }, "ornament")
];

export const DECOR_CARVING_WORKS: MotifOption[] = [
  curatedMotif(MOTIFS[0], { id:"curated_incised_lotus", name:"半刀泥莲花", shaderCode:129, defaults:{ repeatMode:"four", scaleX:.86, scaleY:.86, density:1.12 } }, "carving"),
  curatedMotif(MOTIFS[1], { id:"curated_incised_peony", name:"剔刻缠枝牡丹", shaderCode:162, defaults:{ repeatMode:"four", scaleX:.9, scaleY:.96, rotation:-8, density:1.3 } }, "carving"),
  curatedMotif(MOTIFS[2], { id:"curated_incised_plum", name:"刻划梅枝", shaderCode:195, defaults:{ repeatMode:"single", scaleX:1.2, scaleY:.9, rotation:-17, density:.86 } }, "carving"),
  curatedMotif(MOTIFS[3], { id:"curated_incised_bamboo", name:"刻花竹叶", shaderCode:132, defaults:{ repeatMode:"pair", scaleX:.78, scaleY:1.18, rotation:7, density:.98 } }, "carving"),
  curatedMotif(MOTIFS[4], { id:"curated_incised_fish", name:"划花游鱼", shaderCode:165, defaults:{ repeatMode:"pair", scaleX:1.08, scaleY:.78, rotation:-5, density:1.15 } }, "carving"),
  curatedMotif(MOTIFS[5], { id:"curated_incised_crane", name:"暗刻云鹤", shaderCode:198, defaults:{ repeatMode:"pair", scaleX:1.02, scaleY:1.1, rotation:8, density:.9 } }, "carving"),
  curatedMotif(MOTIFS[9], { id:"curated_incised_cloud", name:"刻花如意云", shaderCode:138, defaults:{ repeatMode:"four", scaleX:.86, scaleY:.76, rotation:6, density:1.34 } }, "carving"),
  curatedMotif(MOTIFS[10], { id:"curated_incised_wave", name:"篦划水波", shaderCode:171, defaults:{ repeatMode:"band", scaleX:.8, scaleY:.68, density:1.58 } }, "carving"),
  curatedMotif(MOTIFS[11], { id:"curated_incised_longevity", name:"暗刻团寿", shaderCode:204, defaults:{ repeatMode:"single", scaleX:.88, scaleY:.88, rotation:45, density:1.05 } }, "carving"),
  curatedMotif(MOTIFS[12], { id:"curated_incised_meander", name:"暗刻回纹", shaderCode:141, defaults:{ repeatMode:"band", scaleX:.68, scaleY:.58, density:1.62 } }, "carving"),
  curatedMotif(MOTIFS[13], { id:"curated_incised_ruyi", name:"刻花如意", shaderCode:174, defaults:{ repeatMode:"band", scaleX:.76, scaleY:.72, density:1.36 } }, "carving"),
  curatedMotif(MOTIFS[14], { id:"curated_incised_petals", name:"刻划莲瓣", shaderCode:207, defaults:{ repeatMode:"band", scaleX:.72, scaleY:.84, density:1.42 } }, "carving"),
  curatedMotif(MOTIFS[0], { id:"curated_incised_lotus_pond", name:"划花莲池", shaderCode:193, defaults:{ repeatMode:"radial", scaleX:1.12, scaleY:1.02, rotation:-7, density:1.24 } }, "carving"),
  curatedMotif(MOTIFS[7], { id:"curated_incised_butterfly", name:"刻划双蝶", shaderCode:136, defaults:{ repeatMode:"pair", scaleX:.94, scaleY:.82, rotation:14, density:1.08 } }, "carving"),
  curatedMotif(MOTIFS[8], { id:"curated_incised_dragon", name:"剔刻云龙", shaderCode:169, defaults:{ repeatMode:"single", scaleX:1.2, scaleY:.9, rotation:-6, density:.8 } }, "carving"),
  curatedMotif(MOTIFS[1], { id:"curated_incised_treasure", name:"半刀泥宝相花", shaderCode:194, defaults:{ repeatMode:"radial", scaleX:1.02, scaleY:1.02, density:1.2 } }, "carving"),
  curatedMotif(BORDERS[4], { id:"curated_incised_scroll", name:"剔刻卷草", shaderCode:180, defaults:{ repeatMode:"band", scaleX:.84, scaleY:.68, rotation:8, density:1.44 } }, "carving"),
  curatedMotif(MOTIFS[1], { id:"curated_incised_flower_spray", name:"刻花折枝花", shaderCode:130, defaults:{ repeatMode:"single", scaleX:1.14, scaleY:1.02, rotation:15, density:.88 } }, "carving"),
  curatedMotif(BORDERS[0], { id:"curated_incised_cloud_thunder", name:"暗刻云雷", shaderCode:176, defaults:{ repeatMode:"band", scaleX:.66, scaleY:.58, rotation:45, density:1.66 } }, "carving"),
  curatedMotif(MOTIFS[1], { id:"curated_incised_scroll_peony", name:"刻花缠枝牡丹", shaderCode:226, defaults:{ repeatMode:"four", scaleX:.88, scaleY:.94, rotation:-10, density:1.38 } }, "carving")
];

export const ALL_DECORATION_MOTIFS = [
  ...MOTIFS,
  ...BORDERS,
  // 旧目录只用于恢复已经保存的作品，不再出现在材料菜单中。
  ...LEGACY_DECOR_PATTERN_WORKS,
  ...DECOR_PATTERN_WORKS,
  ...DECOR_ORNAMENT_WORKS,
  ...DECOR_CARVING_WORKS
];

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

export const SEAL_MARK_COLORS: Record<SealMarkColorId, string> = {
  seal_red: "#9d3b2c",
  cobalt: "#315e73",
  wujin: "#2a241e"
};

export const SEAL_MARK_COLOR_OPTIONS: { id: SealMarkColorId; name: string; color: string }[] = [
  { id: "seal_red", name: "釉里红", color: SEAL_MARK_COLORS.seal_red },
  { id: "cobalt", name: "青花", color: SEAL_MARK_COLORS.cobalt },
  { id: "wujin", name: "乌金", color: SEAL_MARK_COLORS.wujin }
];

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
    // anchor 只负责初始构图与语义标记，不能再充当拖动边界。v>=0
    // 位于器身外壁；v<0 从足边连续进入器底，-1 到达器底中心。
    v:Math.max(
      MIN_DECORATION_SURFACE_V,
      Math.min(1, finite(layer.v, (range[0] + range[1]) / 2))
    ),
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
  const layers = template.components.map((component, index) => {
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

export function clampSealMark(seal: SealMark): SealMark {
  const finite = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);
  return {
    ...seal,
    u:((finite(seal.u, .75) % 1) + 1) % 1,
    v:Math.max(MIN_DECORATION_SURFACE_V, Math.min(1, finite(seal.v, .45))),
    scaleX:Math.max(.42, Math.min(1.65, finite(seal.scaleX, 1))),
    scaleY:Math.max(.42, Math.min(1.65, finite(seal.scaleY, 1)))
  };
}

export function createSealMark(
  text: string,
  colorId: SealMarkColorId,
  u = .75,
  v = .45
): SealMark {
  return clampSealMark({
    text:Array.from(text.replace(/\s/g, "")).slice(0, MAX_SEAL_MARK_CHARACTERS).join(""),
    colorId:SEAL_MARK_COLORS[colorId] ? colorId : "seal_red",
    u,
    v,
    scaleX:1,
    scaleY:1
  });
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

function safeSealMark(raw: any): SealMark | undefined {
  if (!raw || typeof raw.text !== "string") return undefined;
  const text = raw.text
    .slice(0, 40)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\s]/g, "");
  if (!text) return undefined;
  const colorId: SealMarkColorId = ["seal_red", "cobalt", "wujin"].includes(raw.colorId)
    ? raw.colorId
    : "seal_red";
  return clampSealMark({
    text:Array.from(text).slice(0, MAX_SEAL_MARK_CHARACTERS).join(""),
    colorId,
    u:Number(raw.u),
    v:Number(raw.v),
    scaleX:Number(raw.scaleX),
    scaleY:Number(raw.scaleY)
  });
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
    sealMark:safeSealMark(raw.sealMark),
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
