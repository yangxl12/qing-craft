import {
  CLAYS,
  GLAZES,
  SHAPES,
  STAGES,
  ClayId,
  GlazeMaterial,
  GlazeOption,
  ShapeId
} from "./catalog";
import {
  createDecorationComposition,
  DecorationComposition,
  migrateLegacyDecoration,
  validateDecorationComposition
} from "./decoration";
import {
  DEFAULT_POTTERY_WALL,
  MAX_POTTERY_HEIGHT,
  MAX_POTTERY_RADIUS,
  MIN_POTTERY_HEIGHT,
  MIN_POTTERY_RADIUS,
  MIN_POTTERY_WALL
} from "./pottery-dimensions";

export const POTTERY_SCHEMA_VERSION = 2 as const;

export interface PotteryWork {
  workId: string;
  schemaVersion: typeof POTTERY_SCHEMA_VERSION;
  status: "draft" | "completed";
  title: string;
  currentStage: string;
  stageIndex: number;
  shapeId: ShapeId;
  clayId: ClayId;
  mode: "relaxed" | "free";
  height: number;
  outerRadius: number[];
  innerRadius: number[];
  decorationComposition: DecorationComposition;
  glazeId: string;
  glazeMethod: string;
  createdAt: number;
  updatedAt: number;
  revision: number;
}

function sampleProfile(profile: number[], count = 48): number[] {
  return Array.from({ length: count }, (_, index) => {
    const position = (index / (count - 1)) * (profile.length - 1);
    const lower = Math.floor(position);
    const upper = Math.min(profile.length - 1, lower + 1);
    const blend = position - lower;
    return profile[lower] * (1 - blend) + profile[upper] * blend;
  });
}

export function createWork(
  shapeId: ShapeId = "cup",
  clayId: ClayId = "porcelain",
  mode: "relaxed" | "free" = "relaxed"
): PotteryWork {
  const shape = SHAPES.find((value) => value.id === shapeId) || SHAPES[0];
  const outer = sampleProfile(shape.profile);
  const now = Date.now();
  const workId = `work_${now}_${Math.random().toString(36).slice(2, 7)}`;
  return {
    workId,
    schemaVersion:POTTERY_SCHEMA_VERSION,
    status:"draft",
    title:`我的${shape.name}`,
    currentStage:"shaping",
    stageIndex:0,
    shapeId,
    clayId,
    mode,
    height:shapeId === "plate" ? .58 : 1.2,
    outerRadius:outer,
    innerRadius:outer.map((radius, index) =>
      index < 3 ? 0 : Math.max(0, radius - DEFAULT_POTTERY_WALL)
    ),
    decorationComposition:createDecorationComposition(workId),
    glazeId:"celadon",
    glazeMethod:"full",
    createdAt:now,
    updatedAt:now,
    revision:1
  };
}

export function cloneWork(work: PotteryWork): PotteryWork {
  return JSON.parse(JSON.stringify(work)) as PotteryWork;
}

export function clayColor(work: PotteryWork): string {
  return (CLAYS.find((value) => value.id === work.clayId) || CLAYS[0])[
    work.stageIndex >= 3 ? "fired" : "wet"
  ];
}

export function glazeColor(work: PotteryWork): string {
  return glazeOption(work).fired;
}

export function glazeOption(work: PotteryWork): GlazeOption {
  return GLAZES.find((value) => value.id === work.glazeId) || GLAZES[0];
}

export function glazeMaterial(work: PotteryWork): GlazeMaterial {
  return glazeOption(work).material;
}

function finiteTime(value: any, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function validateWork(raw: any): PotteryWork | null {
  if (
    !raw ||
    (raw.schemaVersion !== 1 && raw.schemaVersion !== POTTERY_SCHEMA_VERSION) ||
    typeof raw.workId !== "string" ||
    !Array.isArray(raw.outerRadius) ||
    raw.outerRadius.length < 8
  ) {
    return null;
  }

  const now = Date.now();
  const shapeId = SHAPES.some((value) => value.id === raw.shapeId)
    ? raw.shapeId as ShapeId
    : "cup";
  const clayId = CLAYS.some((value) => value.id === raw.clayId)
    ? raw.clayId as ClayId
    : "porcelain";
  const stageIndex = Math.max(0, Math.min(STAGES.length - 1, Math.round(Number(raw.stageIndex) || 0)));
  const outerRadius = raw.outerRadius.map((radius: any) =>
    Number.isFinite(radius)
      ? Math.max(MIN_POTTERY_RADIUS, Math.min(MAX_POTTERY_RADIUS, radius))
      : .5
  );
  const storedInner = Array.isArray(raw.innerRadius) ? raw.innerRadius : [];
  const innerRadius = outerRadius.map((outer: number, index: number) => {
    if (index < 3) return 0;
    const fallback = Math.max(.035, outer - DEFAULT_POTTERY_WALL);
    const candidate = Number.isFinite(storedInner[index]) ? storedInner[index] : fallback;
    // v1 shaping drafts used a visibly heavy shell. Adopting the current
    // default while the clay is still editable preserves the silhouette and
    // keeps old drafts compatible with the thinner manipulation range.
    const shapingInner = stageIndex === 0 ? Math.max(candidate, fallback) : candidate;
    return Math.max(.035, Math.min(outer - MIN_POTTERY_WALL, shapingInner));
  });
  const height = Number.isFinite(raw.height)
    ? Math.max(MIN_POTTERY_HEIGHT, Math.min(MAX_POTTERY_HEIGHT, raw.height))
    : 1.2;
  const decorationComposition = raw.schemaVersion === 1
    ? migrateLegacyDecoration(raw, shapeId, raw.workId)
    : validateDecorationComposition(raw.decorationComposition, shapeId, raw.workId);

  return {
    workId:raw.workId,
    schemaVersion:POTTERY_SCHEMA_VERSION,
    status:raw.status === "completed" ? "completed" : "draft",
    title:typeof raw.title === "string" && raw.title.trim()
      ? raw.title.trim().slice(0, 20)
      : `我的${SHAPES.find((value) => value.id === shapeId)?.name || "陶器"}`,
    currentStage:STAGES[stageIndex].id,
    stageIndex,
    shapeId,
    clayId,
    mode:raw.mode === "free" ? "free" : "relaxed",
    height,
    outerRadius,
    innerRadius,
    decorationComposition,
    glazeId:GLAZES.some((value) => value.id === raw.glazeId) ? raw.glazeId : "celadon",
    glazeMethod:["full", "half", "brush", "splash"].includes(raw.glazeMethod)
      ? raw.glazeMethod
      : "full",
    createdAt:finiteTime(raw.createdAt, now),
    updatedAt:finiteTime(raw.updatedAt, now),
    revision:Number.isFinite(raw.revision) && raw.revision > 0 ? Math.floor(raw.revision) : 1
  };
}
