import { cloneWork, PotteryWork, validateWork } from "../core/model";

const INDEX_KEY = "palm-kiln-work-index";
const ACTIVE_KEY = "palm-kiln-active-work";
const key = (id:string) => `palm-kiln-work:${id}`;

export function saveWork(work: PotteryWork): void {
  const next = cloneWork(work); next.updatedAt = Date.now(); next.revision += 1;
  wx.setStorageSync(key(next.workId), next); wx.setStorageSync(ACTIVE_KEY, next.workId);
  const ids: string[] = wx.getStorageSync(INDEX_KEY) || []; if (!ids.includes(next.workId)) ids.unshift(next.workId); wx.setStorageSync(INDEX_KEY, ids);
}
export function loadWork(id?: string): PotteryWork | null { const target = id || wx.getStorageSync(ACTIVE_KEY); return target ? validateWork(wx.getStorageSync(key(target))) : null; }
export function listWorks(): PotteryWork[] { const ids:string[] = wx.getStorageSync(INDEX_KEY)||[]; return ids.map(id=>loadWork(id)).filter(Boolean).sort((a:any,b:any)=>b.updatedAt-a.updatedAt) as PotteryWork[]; }
export function loadLatestDraft():PotteryWork|null { return listWorks().find(v=>v.status==="draft")||null; }
export function duplicateWork(work:PotteryWork):PotteryWork { const next=cloneWork(work); next.workId=`work_${Date.now()}_copy`; next.title=`${work.title} · 副本`; next.status="draft"; next.createdAt=Date.now(); next.updatedAt=Date.now(); next.revision=1; saveWork(next); return next; }
export function removeWork(id:string):void { wx.removeStorageSync(key(id)); const ids=(wx.getStorageSync(INDEX_KEY)||[]).filter((v:string)=>v!==id); wx.setStorageSync(INDEX_KEY,ids); if(wx.getStorageSync(ACTIVE_KEY)===id) wx.removeStorageSync(ACTIVE_KEY); }
export function hasDraft():boolean { return listWorks().some(v=>v.status==="draft"); }
