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
export interface GlazeOption { id: string; name: string; wet: string; fired: string; }

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

export const GLAZES: GlazeOption[] = [
  { id:"celadon", name:"雨后青", wet:"#9fbab1", fired:"#78a291" }, { id:"moon", name:"月白", wet:"#d9e1dc", fired:"#eef1e9" },
  { id:"cobalt", name:"青花蓝", wet:"#587588", fired:"#2f5d78" }, { id:"tea", name:"茶末", wet:"#77745d", fired:"#606b4f" },
  { id:"black", name:"乌金", wet:"#50514d", fired:"#232b29" }, { id:"amber", name:"琥珀", wet:"#a9784b", fired:"#b96b36" },
  { id:"plum", name:"梅子青", wet:"#91a99c", fired:"#729486" }, { id:"cloud", name:"烟云", wet:"#929897", fired:"#737d7a" },
  { id:"rose", name:"胭脂", wet:"#b67e75", fired:"#a95955" }, { id:"moss", name:"苔绿", wet:"#7d8a6a", fired:"#657858" },
  { id:"sand", name:"流沙", wet:"#c1a985", fired:"#d0b17c" }, { id:"violet", name:"暮紫", wet:"#777080", fired:"#665e79" }
];

export const STAGES = [
  { id:"shaping", short:"坯", name:"制坯" }, { id:"decorate", short:"饰", name:"装饰" }, { id:"glaze", short:"釉", name:"上釉" },
  { id:"firing", short:"烧", name:"高温烧制" }, { id:"paint", short:"彩", name:"釉上彩绘" }, { id:"refire", short:"烤", name:"低温烤花" },
  { id:"finished", short:"成", name:"成品" }
] as const;

export const TOOLS: Record<string, { id:string; name:string; hint:string }[]> = {
  shaping: [
    {id:"finger",name:"推 / 拉",hint:"按住器身左右移动"},{id:"raise",name:"拉高",hint:"向上提起器形"},{id:"lower",name:"压低",hint:"压低并稍稍放宽"},
    {id:"open",name:"打开",hint:"向外拖动，打开顶部内腔"},{id:"collar",name:"收口",hint:"沿器壁上下滑动，收出连续颈线"},{id:"rim",name:"修口",hint:"抚平杯口"},
    {id:"foot",name:"修足",hint:"收稳底足"},{id:"smooth",name:"海绵",hint:"沿器壁上下轻抹，修顺凹凸"}
  ],
  decorate: [
    {id:"carve",name:"刻线",hint:"在器身刻出细线"},{id:"impress",name:"压纹",hint:"压出连续纹理"},{id:"stamp",name:"印章",hint:"放下一枚小印"},
    {id:"decal",name:"贴花",hint:"贴上一片浮雕"},{id:"handle",name:"加杯耳",hint:"从侧面添一个耳"}
  ],
  glaze: [{id:"full",name:"全浸",hint:"让釉色覆盖器身"},{id:"half",name:"半浸",hint:"保留一半泥色"},{id:"brush",name:"刷涂",hint:"手指刷上釉色"},{id:"splash",name:"泼釉",hint:"留下自然边缘"}],
  firing: [{id:"kiln",name:"点火入窑",hint:"泥与釉会在火中定形"}],
  paint: [{id:"brush",name:"画笔",hint:"在器身直接落笔"},{id:"dot",name:"点彩",hint:"点下细小色斑"},{id:"pattern",name:"纹样",hint:"添加环绕纹样"},{id:"eraser",name:"橡皮",hint:"擦去刚才的颜色"}],
  refire: [{id:"refire",name:"合窑烤花",hint:"让彩绘颜色定住"}],
  finished: []
};
