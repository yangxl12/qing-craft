import { CLAYS, SHAPES } from "../../core/catalog";
import { createWork, PotteryWork } from "../../core/model";
import { track } from "../../services/analytics";
import { listWorks, removeWork, saveWork } from "../../services/storage";
import { runConfirmedAction } from "../../utils/destructive-actions";
import { loadSettings } from "../../utils/settings";

interface GalleryItem extends PotteryWork {
  selected: boolean;
  shapeName: string;
  clayName: string;
  timeText: string;
  statusLabel: string;
  accessibilityLabel: string;
}

function formatTime(value: number): string {
  const date = new Date(value);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

Page({
  data: {
    works: [] as PotteryWork[],
    tab: "all",
    filtered: [] as GalleryItem[],
    counts: { all: 0, draft: 0, completed: 0 },
    selectMode: false,
    selectedCount: 0,
    allSelected: false,
    reduceMotion: false
  },
  selection: null as Set<string> | null,

  onLoad() {
    this.selection = new Set<string>();
  },

  onShow() {
    this.setData({
      works:listWorks(),
      reduceMotion:loadSettings().reduceMotion
    });
    this.refresh();
  },

  refresh() {
    const works = this.data.works;
    const tab = this.data.tab;
    const selection = this.selectionSet();
    const counts = { all: works.length, draft: 0, completed: 0 };
    works.forEach((work) => {
      counts[work.status] += 1;
    });
    const filtered: GalleryItem[] = works
      .filter((work) => tab === "all" || work.status === tab)
      .map((work) => {
        const selected = selection.has(work.workId);
        const shapeName = SHAPES.find((shape) => shape.id === work.shapeId)?.name || "器";
        const clayName = CLAYS.find((clay) => clay.id === work.clayId)?.name || "陶泥";
        const timeText = formatTime(work.updatedAt);
        const statusLabel = work.status === "completed"
          ? "已成器"
          : `工序 ${work.stageIndex + 1} / 7`;
        const selectionState = this.data.selectMode
          ? selected ? "，已选中" : "，未选中"
          : "";
        return {
          ...work,
          selected,
          shapeName,
          clayName,
          timeText,
          statusLabel,
          accessibilityLabel:`${work.title}，${statusLabel}，${shapeName}，${clayName}，${timeText}${selectionState}`
        };
      });
    const selectedCount = filtered.filter((item) => item.selected).length;
    this.setData({
      filtered,
      counts,
      selectedCount,
      allSelected:filtered.length > 0 && selectedCount === filtered.length
    });
  },

  start() {
    const work = createWork("vase", "porcelain", "free");
    saveWork(work);
    track("creation_start", {
      mode:work.mode,
      base_shape:work.shapeId,
      clay:work.clayId,
      quality_tier:loadSettings().quality
    });
    wx.navigateTo({ url:`/pages/studio/studio?id=${work.workId}` });
  },

  chooseTab(e: WechatMiniprogramTouchEvent) {
    if (this.data.selectMode) return;
    const tab = e.currentTarget.dataset.id;
    if (tab !== "all" && tab !== "draft" && tab !== "completed") return;
    this.setData({ tab });
    this.refresh();
  },

  showAll() {
    this.setData({ tab:"all" });
    this.refresh();
  },

  open(e: WechatMiniprogramTouchEvent) {
    if (this.data.selectMode) {
      this.toggleSelect(e);
      return;
    }
    const id = e.currentTarget.dataset.id;
    const work = this.data.works.find((item) => item.workId === id);
    if (!work) return;
    wx.navigateTo({
      url:work.status === "completed"
        ? `/pages/result/result?id=${id}`
        : `/pages/studio/studio?id=${id}`
    });
  },

  longpress(e: WechatMiniprogramTouchEvent) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const selection = this.selectionSet();
    selection.clear();
    selection.add(id);
    this.setData({ selectMode:true });
    this.refresh();
    this.haptic("medium");
  },

  handleNavBack() {
    if (this.data.selectMode) this.exitSelect();
  },

  enterSelectMode() {
    if (!this.data.works.length) return;
    this.selectionSet().clear();
    this.setData({ selectMode:true });
    this.refresh();
  },

  toggleSelect(e: WechatMiniprogramTouchEvent) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const selection = this.selectionSet();
    if (selection.has(id)) selection.delete(id);
    else selection.add(id);
    this.refresh();
    this.haptic("light");
  },

  toggleAll() {
    const filtered = this.data.filtered;
    const selection = this.selectionSet();
    if (this.data.allSelected) filtered.forEach((item) => selection.delete(item.workId));
    else filtered.forEach((item) => selection.add(item.workId));
    this.refresh();
    this.haptic("light");
  },

  exitSelect() {
    this.selectionSet().clear();
    this.setData({ selectMode:false });
    this.refresh();
  },

  deleteSelected() {
    const count = this.data.selectedCount;
    if (!count) return;
    wx.showModal({
      title:"删除所选作品？",
      content:`即将从本机移除 ${count} 件作品。`,
      confirmText:"继续",
      confirmColor:"#9C3F38",
      success:(result: any) => {
        runConfirmedAction(result, () => wx.showModal({
          title:"再确认一次",
          content:"删除后无法恢复，仍要移除这些作品吗？",
          confirmText:"确认删除",
          confirmColor:"#9C3F38",
          success:(second: any) => {
            runConfirmedAction(second, () => this.performDelete());
          }
        }));
      }
    });
  },

  performDelete() {
    const targets = this.data.filtered.filter((item) => item.selected);
    if (!targets.length) return;
    targets.forEach((item) => removeWork(item.workId));
    track("works_delete", { count:targets.length });
    this.selectionSet().clear();
    wx.showToast({ title:`已移除 ${targets.length} 件`, icon:"none" });
    this.setData({ works:listWorks(), selectMode:false });
    this.refresh();
  },

  haptic(type: "light" | "medium") {
    if (loadSettings().haptics) wx.vibrateShort({ type });
  },

  selectionSet(): Set<string> {
    if (!this.selection) this.selection = new Set<string>();
    return this.selection;
  }
});
