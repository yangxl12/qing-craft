export type ShapeId = "cup" | "bowl" | "vase" | "jar" | "plate";
export type ClayId = "porcelain" | "stoneware" | "red";

export interface ShapeOption {
  id: ShapeId;
  name: string;
  glyph: string;
  story: string;
  minutes: string;
  profile: number[];
}

export interface ClayOption { id: ClayId; name: string; note: string; wet: string; fired: string; grain: string; }
export interface GlazeMaterial {
  /** 0-5 对应 WebGL 中六种经典釉的烧成特征。 */
  profile: number;
  /** 0 为镜面，1 为柔哑。 */
  roughness: number;
  /** 流釉、积釉与窑变的可见强度。 */
  variation: number;
  /** 胎色透过釉层的比例。 */
  translucency: number;
}

export interface GlazeOption {
  id: string;
  name: string;
  wet: string;
  fired: string;
  swatch: string;
  material: GlazeMaterial;
}

export const SHAPES: ShapeOption[] = [
  { id: "cup", name: "杯", glyph: "盏", story: "从一只日用杯开始，适合第一次捏陶", minutes: "约 8 分钟", profile: [.52,.56,.58,.59,.59,.58,.56,.54] },
  { id: "bowl", name: "碗", glyph: "钵", story: "宽口、稳重，适合做一圈连续纹样", minutes: "约 7 分钟", profile: [.38,.46,.58,.70,.79,.84,.88,.9] },
  { id: "vase", name: "花瓶", glyph: "瓶", story: "收腰与肩线最能看出你的手感", minutes: "约 10 分钟", profile: [.48,.55,.64,.70,.62,.48,.34,.31] },
  { id: "jar", name: "罐", glyph: "罐", story: "圆润饱满，适合压纹与印章", minutes: "约 9 分钟", profile: [.5,.61,.7,.73,.69,.61,.52,.48] },
  { id: "plate", name: "盘", glyph: "盘", story: "低而开阔，留给彩绘更多空间", minutes: "约 7 分钟", profile: [.48,.64,.82,.94,1.02,1.08,1.12,1.14] }
];

export const CLAYS: ClayOption[] = [
  { id: "porcelain", name: "白瓷泥", note: "细腻清亮，最能显出釉色", wet: "#d8d6cc", fired: "#f2f1e9", grain: "细" },
  { id: "stoneware", name: "暖灰陶泥", note: "温和朴素，保留一点手作颗粒", wet: "#a99682", fired: "#b8a58e", grain: "中" },
  { id: "red", name: "赭红陶泥", note: "烧后温暖，适合留白与刻线", wet: "#9f6653", fired: "#a95f45", grain: "粗" }
];

/**
 * 上釉页只展示这里的六种经典釉。沿用既有 id，避免旧作品因为改版丢失釉色。
 * swatch 是釉样卡的静态预览；真正的器身效果由同一项的 material 驱动 WebGL。
 */
export const CLASSIC_GLAZES: GlazeOption[] = [
  {
    id:"celadon",
    name:"天青釉",
    wet:"#a7c1bc",
    fired:"#83a9a1",
    swatch:"radial-gradient(circle at 31% 22%, #eef5ed 0 7%, #b9d0c8 20%, #83a9a1 57%, #587d74 100%)",
    material:{ profile:0, roughness:.36, variation:.52, translucency:.46 }
  },
  {
    id:"plum",
    name:"龙泉青瓷",
    wet:"#78998a",
    fired:"#527b68",
    swatch:"radial-gradient(circle at 31% 22%, #dbe9d7 0 6%, #90ae98 19%, #527b68 58%, #294d41 100%)",
    material:{ profile:1, roughness:.22, variation:.7, translucency:.34 }
  },
  {
    id:"black",
    name:"建盏黑釉",
    wet:"#39382f",
    fired:"#201e18",
    swatch:"radial-gradient(circle at 32% 20%, #d6b66f 0 4%, #765a32 10%, #29251d 31%, #121512 72%, #070908 100%)",
    material:{ profile:2, roughness:.18, variation:.92, translucency:.1 }
  },
  {
    id:"moon",
    name:"甜白釉",
    wet:"#e5e1d6",
    fired:"#eee8db",
    swatch:"radial-gradient(circle at 31% 22%, #ffffff 0 9%, #f7f2e8 24%, #e8e0d1 66%, #c7bfaf 100%)",
    material:{ profile:3, roughness:.44, variation:.3, translucency:.58 }
  },
  {
    id:"cobalt",
    name:"霁蓝釉",
    wet:"#365f86",
    fired:"#16477b",
    swatch:"radial-gradient(circle at 31% 22%, #a7cbe1 0 5%, #3e78a7 16%, #16477b 52%, #09284d 100%)",
    material:{ profile:4, roughness:.14, variation:.5, translucency:.18 }
  },
  {
    id:"cloud",
    name:"青白釉",
    wet:"#d3dfdb",
    fired:"#c7dad5",
    swatch:"radial-gradient(circle at 31% 22%, #ffffff 0 9%, #e6f0ec 24%, #bfd6d0 65%, #91aaa4 100%)",
    material:{ profile:5, roughness:.28, variation:.42, translucency:.68 }
  }
];

/**
 * 不再出现在上釉页，但继续保留给旧作品读取与导出，避免存量 glazeId 失效。
 */
const LEGACY_GLAZES: GlazeOption[] = [
  { id:"tea", name:"茶末", wet:"#77745d", fired:"#606b4f", swatch:"#606b4f", material:{ profile:1, roughness:.4, variation:.55, translucency:.18 } },
  { id:"amber", name:"琥珀", wet:"#a9784b", fired:"#b96b36", swatch:"#b96b36", material:{ profile:4, roughness:.25, variation:.54, translucency:.3 } },
  { id:"rose", name:"胭脂", wet:"#b67e75", fired:"#a95955", swatch:"#a95955", material:{ profile:0, roughness:.3, variation:.42, translucency:.26 } },
  { id:"moss", name:"苔绿", wet:"#7d8a6a", fired:"#657858", swatch:"#657858", material:{ profile:1, roughness:.37, variation:.58, translucency:.2 } },
  { id:"sand", name:"流沙", wet:"#c1a985", fired:"#d0b17c", swatch:"#d0b17c", material:{ profile:3, roughness:.48, variation:.36, translucency:.32 } },
  { id:"violet", name:"暮紫", wet:"#777080", fired:"#665e79", swatch:"#665e79", material:{ profile:4, roughness:.28, variation:.44, translucency:.2 } }
];

export const GLAZES: GlazeOption[] = [...CLASSIC_GLAZES, ...LEGACY_GLAZES];

export const STAGES = [
  { id:"shaping", short:"坯", name:"制坯" }, { id:"decorate", short:"饰", name:"装饰" }, { id:"glaze", short:"釉", name:"上釉" },
  { id:"firing", short:"烧", name:"高温烧制" }, { id:"paint", short:"彩", name:"釉上彩绘" }, { id:"refire", short:"烤", name:"低温烤花" }
] as const;

export const TOOLS: Record<string, { id:string; name:string; hint:string }[]> = {
  // 制坯不再使用离散工具按钮：四向手势与三种受力形态由 studio 直接编排。
  shaping: [],
  decorate: [
    {id:"carve",name:"刻线",hint:"在器身刻出细线"},{id:"impress",name:"压纹",hint:"压出连续纹理"},{id:"stamp",name:"印章",hint:"放下一枚小印"},
    {id:"decal",name:"贴花",hint:"贴上一片浮雕"},{id:"handle",name:"加杯耳",hint:"从侧面添一个耳"}
  ],
  // 上釉阶段改为六种经典釉单选，器身统一完整施釉，不再展示施釉方式菜单。
  glaze: [],
  firing: [{id:"kiln",name:"点火入窑",hint:"泥与釉会在火中定形"}],
  paint: [{id:"brush",name:"画笔",hint:"在器身直接落笔"},{id:"dot",name:"点彩",hint:"点下细小色斑"},{id:"pattern",name:"纹样",hint:"添加环绕纹样"},{id:"eraser",name:"橡皮",hint:"擦去刚才的颜色"}],
  refire: [{id:"refire",name:"合窑烤花",hint:"让彩绘颜色定住"}]
};
