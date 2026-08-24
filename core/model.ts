import { CLAYS, GLAZES, SHAPES, ClayId, ShapeId } from "./catalog";

export interface Decoration { type: string; y: number; angle: number; color?: string; }
export interface PotteryWork {
  workId: string; schemaVersion: 1; status: "draft" | "completed"; title: string; currentStage: string; stageIndex: number;
  shapeId: ShapeId; clayId: ClayId; mode: "relaxed" | "free"; height: number; outerRadius: number[]; innerRadius: number[];
  decorations: Decoration[]; glazeId: string; glazeMethod: string; paintColor: string; paintPattern: number; symmetry: number;
  createdAt: number; updatedAt: number; revision: number;
}

function sampleProfile(profile: number[], count = 48): number[] {
  return Array.from({length: count}, (_, i) => {
    const p = i / (count - 1) * (profile.length - 1); const a = Math.floor(p); const b = Math.min(profile.length - 1, a + 1); const t = p - a;
    return profile[a] * (1 - t) + profile[b] * t;
  });
}

export function createWork(shapeId: ShapeId = "cup", clayId: ClayId = "porcelain", mode: "relaxed"|"free" = "relaxed"): PotteryWork {
  const shape = SHAPES.find(v => v.id === shapeId) || SHAPES[0]; const outer = sampleProfile(shape.profile);
  return { workId: `work_${Date.now()}_${Math.random().toString(36).slice(2,7)}`, schemaVersion:1, status:"draft", title:`我的${shape.name}`,
    currentStage:"shaping", stageIndex:0, shapeId, clayId, mode, height: shapeId === "plate" ? .58 : 1.2, outerRadius:outer,
    innerRadius:outer.map((r,i) => i < 3 ? 0 : Math.max(0, r - .11)), decorations:[], glazeId:"celadon", glazeMethod:"full",
    paintColor:"#315e73", paintPattern:0, symmetry:0, createdAt:Date.now(), updatedAt:Date.now(), revision:1 };
}

export function cloneWork(work: PotteryWork): PotteryWork { return JSON.parse(JSON.stringify(work)) as PotteryWork; }
export function clayColor(work: PotteryWork): string { return (CLAYS.find(v=>v.id===work.clayId)||CLAYS[0])[work.stageIndex >= 3 ? "fired" : "wet"]; }
export function glazeColor(work: PotteryWork): string { return (GLAZES.find(v=>v.id===work.glazeId)||GLAZES[0]).fired; }

export function validateWork(raw: any): PotteryWork | null {
  if (!raw || raw.schemaVersion !== 1 || !Array.isArray(raw.outerRadius) || raw.outerRadius.length < 8) return null;
  const work = raw as PotteryWork;
  work.outerRadius = work.outerRadius.map(r => Number.isFinite(r) ? Math.max(.18, Math.min(1.25, r)) : .5);
  work.height = Number.isFinite(work.height) ? Math.max(.45, Math.min(1.8, work.height)) : 1.2;
  return work;
}
