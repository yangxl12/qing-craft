import { CLAYS, SHAPES } from "../../core/catalog";
import { createWork, PotteryWork } from "../../core/model";
import { track } from "../../services/analytics";
import { listWorks, removeWork, saveWork } from "../../services/storage";
import { runConfirmedAction } from "../../utils/destructive-actions";

interface GalleryItem extends PotteryWork {
  selected: boolean;
  shapeName: string;
  clayName: string;
  timeText: string;
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
    statusBar: 20,
    navBar: 32,
    capsulePad: 96,
    selectMode: false,
    selectedCount: 0,
    allSelected: false
  },
  selection: new Set<string>(),

  onLoad() {
    // 对齐微信胶囊按钮：导航与胶囊同顶同高，右侧让出胶囊宽度，避免重叠。
    let statusBar = 20;
    let navBar = 32;
    let capsulePad = 96;
    try {
      const rect = wx.getMenuButtonBoundingClientRect();
      if (rect && rect.top > 0 && rect.height > 0) {
        const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        const windowWidth = (win && win.windowWidth) || 375;
        statusBar = rect.top;
        navBar = rect.height;
        capsulePad = Math.max(90, windowWidth - rect.left);
      }
    } catch (_error) {
      // 取不到胶囊位置时退回保守值。
    }
    this.setData({ statusBar, navBar, capsulePad });
  },

  onShow() {
    this.setData({ works: listWorks() });
    this.refresh();
  },

  refresh() {
    const works = this.data.works;
    const tab = this.data.tab;
    const counts = { all: works.length, draft: 0, completed: 0 };
    works.forEach((work) => {
      counts[work.status] += 1;
    });
    const filtered: GalleryItem[] = works
      .filter((work) => tab === "all" || work.status === tab)
      .map((work) => ({
        ...work,
        selected: this.selection.has(work.workId),
        shapeName: SHAPES.find((shape) => shape.id === work.shapeId)?.name || "器",
        clayName: CLAYS.find((clay) => clay.id === work.clayId)?.name || "陶泥",
        timeText: formatTime(work.updatedAt)
      }));
    const selectedCount = filtered.filter((item) => item.selected).length;
    this.setData({
      filtered,
      counts,
      selectedCount,
      allSelected: filtered.length > 0 && selectedCount === filtered.length
    });
  },

  back() {
    wx.navigateBack({ fail: () => wx.reLaunch({ url: "/pages/index/index" }) });
  },

  start() {
    const work = createWork("vase", "porcelain", "free");
    saveWork(work);
    track("creation_start", { mode: work.mode, base_shape: work.shapeId, clay: work.clayId, quality_tier: (wx.getStorageSync("palm-kiln-settings") || {}).quality || "medium" });
    wx.navigateTo({ url: `/pages/studio/studio?id=${work.workId}` });
  },

  chooseTab(e: WechatMiniprogramTouchEvent) {
    if (this.data.selectMode) return;
    this.setData({ tab: e.currentTarget.dataset.id });
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
    wx.navigateTo({ url: work.status === "completed" ? `/pages/result/result?id=${id}` : `/pages/studio/studio?id=${id}` });
  },

  longpress(e: WechatMiniprogramTouchEvent) {
    const id = e.currentTarget.dataset.id;
    const settings = wx.getStorageSync("palm-kiln-settings") || {};
    if (settings.haptics) wx.vibrateShort({ type: "medium" });
    this.selection.clear();
    this.selection.add(id);
    this.setData({ selectMode: true });
    this.refresh();
  },

  toggleSelect(e: WechatMiniprogramTouchEvent) {
    const id = e.currentTarget.dataset.id;
    if (this.selection.has(id)) this.selection.delete(id);
    else this.selection.add(id);
    this.refresh();
  },

  toggleAll() {
    const filtered = this.data.filtered;
    if (this.data.allSelected) filtered.forEach((item) => this.selection.delete(item.workId));
    else filtered.forEach((item) => this.selection.add(item.workId));
    this.refresh();
  },

  exitSelect() {
    this.selection.clear();
    this.setData({ selectMode: false });
    this.refresh();
  },

  deleteSelected() {
    const count = this.data.selectedCount;
    if (!count) return;
    wx.showModal({
      title: "删除所选作品？",
      content: `即将从本机移除 ${count} 件作品。`,
      confirmText: "继续",
      confirmColor: "#b04a3a",
      success: (result: any) => {
        runConfirmedAction(result, () => wx.showModal({
          title: "再确认一次",
          content: "删除后无法恢复，仍要移除这些作品吗？",
          confirmText: "确认删除",
          confirmColor: "#b04a3a",
          success: (second: any) => {
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
    track("works_delete", { count: targets.length });
    this.selection.clear();
    wx.showToast({ title: `已移除 ${targets.length} 件`, icon: "none" });
    this.setData({ works: listWorks(), selectMode: false });
    this.refresh();
  }
});
