import { stableKilnSeed, Inscription } from "../core/decoration";
import { cloneWork, PotteryWork, validateWork } from "../core/model";

const INDEX_KEY = "palm-kiln-work-index";
const ACTIVE_KEY = "palm-kiln-active-work";
const PRIVATE_MARKS_KEY = "palm-kiln-private-stamps";
const key = (id: string) => `palm-kiln-work:${id}`;
const recoveryKey = (id: string) => `palm-kiln-work-recovery:${id}`;

export interface PrivateMark {
  id: string;
  inscription: Inscription;
  updatedAt: number;
}

function preserveForRecovery(id: string, raw: any): void {
  try {
    if (!wx.getStorageSync(recoveryKey(id))) wx.setStorageSync(recoveryKey(id), raw);
  } catch (_error) {
    // Recovery is best-effort. Never replace the source entry when the backup
    // itself cannot be written because local storage is full.
  }
}

export function saveWork(work: PotteryWork): PotteryWork {
  const next = cloneWork(work);
  next.updatedAt = Date.now();
  next.revision += 1;
  const validated = validateWork(next);
  if (!validated) throw new Error("WORK_VALIDATION_FAILED");

  // Write the complete validated body first. If a later index write fails, the
  // previous index remains usable and the work body is still recoverable.
  wx.setStorageSync(key(validated.workId), validated);
  wx.setStorageSync(ACTIVE_KEY, validated.workId);
  const ids: string[] = wx.getStorageSync(INDEX_KEY) || [];
  if (!ids.includes(validated.workId)) ids.unshift(validated.workId);
  wx.setStorageSync(INDEX_KEY, ids);
  work.updatedAt = validated.updatedAt;
  work.revision = validated.revision;
  return validated;
}

export function loadWork(id?: string): PotteryWork | null {
  const target = id || wx.getStorageSync(ACTIVE_KEY);
  if (!target) return null;
  let raw: any;
  try {
    raw = wx.getStorageSync(key(target));
  } catch (_error) {
    return null;
  }
  if (!raw) return null;
  const legacy = raw.schemaVersion === 1;
  if (legacy) preserveForRecovery(target, raw);
  const validated = validateWork(raw);
  if (!validated) {
    preserveForRecovery(target, raw);
    return null;
  }
  if (
    raw.schemaVersion === 2 &&
    JSON.stringify(raw.decorationComposition) !== JSON.stringify(validated.decorationComposition)
  ) {
    preserveForRecovery(target, raw);
  }
  if (legacy) {
    try {
      wx.setStorageSync(key(target), validated);
    } catch (_error) {
      // The validated in-memory work remains editable; the untouched recovery
      // entry keeps the original schema available for a later retry.
    }
  }
  return validated;
}

export function listWorks(): PotteryWork[] {
  const ids: string[] = wx.getStorageSync(INDEX_KEY) || [];
  return ids
    .map((id) => loadWork(id))
    .filter(Boolean)
    .sort((a: any, b: any) => b.updatedAt - a.updatedAt) as PotteryWork[];
}

export function loadLatestDraft(): PotteryWork | null {
  return listWorks().find((value) => value.status === "draft") || null;
}

function copiedLayerId(prefix: string, index: number): string {
  return `${prefix}_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`;
}

export function duplicateWork(
  work: PotteryWork,
  mode: "decor" | "full" = "full"
): PotteryWork {
  const next = cloneWork(work);
  next.workId = `work_${Date.now()}_copy_${Math.random().toString(36).slice(2, 6)}`;
  next.title = `${work.title} · 新作`;
  next.status = "draft";
  next.currentStage = "decorate";
  next.stageIndex = 1;
  next.createdAt = Date.now();
  next.updatedAt = next.createdAt;
  next.revision = 0;
  next.decorationComposition = {
    ...next.decorationComposition,
    kilnSeed:stableKilnSeed(next.workId),
    layers:next.decorationComposition.layers.map((layer, index) => ({
      ...layer,
      layerId:copiedLayerId("layer", index)
    })),
    stamps:next.decorationComposition.stamps.map((stamp, index) => ({
      ...stamp,
      layerId:copiedLayerId("stamp", index)
    }))
  };
  if (mode === "decor") {
    next.glazeId = "celadon";
    next.glazeMethod = "full";
    delete next.decorationComposition.inscription;
    delete next.decorationComposition.sealMark;
    next.title = `${work.title} · 同纹`;
  }
  saveWork(next);
  return next;
}

export function removeWork(id: string): void {
  wx.removeStorageSync(key(id));
  const ids = (wx.getStorageSync(INDEX_KEY) || []).filter((value: string) => value !== id);
  wx.setStorageSync(INDEX_KEY, ids);
  if (wx.getStorageSync(ACTIVE_KEY) === id) wx.removeStorageSync(ACTIVE_KEY);
}

export function hasDraft(): boolean {
  return listWorks().some((value) => value.status === "draft");
}

export function loadPrivateMarks(): PrivateMark[] {
  const raw = wx.getStorageSync(PRIVATE_MARKS_KEY);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((value: any) => value && typeof value.id === "string" && value.inscription?.text)
    .slice(0, 3) as PrivateMark[];
}

export function savePrivateMark(inscription: Inscription, replaceIndex = -1): PrivateMark[] {
  const marks = loadPrivateMarks();
  const mark: PrivateMark = {
    id:`mark_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    inscription:JSON.parse(JSON.stringify(inscription)) as Inscription,
    updatedAt:Date.now()
  };
  if (replaceIndex >= 0 && replaceIndex < marks.length) marks.splice(replaceIndex, 1, mark);
  else if (marks.length < 3) marks.unshift(mark);
  else throw new Error("PRIVATE_MARK_LIMIT");
  wx.setStorageSync(PRIVATE_MARKS_KEY, marks.slice(0, 3));
  return marks.slice(0, 3);
}
