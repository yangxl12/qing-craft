import { createWork } from "../../core/model";
import { track } from "../../services/analytics";
import { hasDraft, loadLatestDraft, saveWork } from "../../services/storage";

Page({
  data: {
    hasDraft: false,
    draftTitle: "",
    entrance: false,
    statusBarHeight: 20,
    navigationBarHeight: 44
  },

  onLoad() {
    const system = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const statusBarHeight = Math.max(20, system.statusBarHeight || 20);
    let navigationBarHeight = 44;
    if (wx.getMenuButtonBoundingClientRect) {
      const menu = wx.getMenuButtonBoundingClientRect();
      navigationBarHeight = Math.max(44, menu.height + Math.max(0, menu.top - statusBarHeight) * 2);
    }
    this.setData({ statusBarHeight, navigationBarHeight });
  },

  onShow() {
    const draft = loadLatestDraft();
    this.setData({ hasDraft: hasDraft(), draftTitle: draft?.title || "" });
    setTimeout(() => this.setData({ entrance: true }), 80);
  },

  start() {
    const work = createWork("vase", "porcelain", "free");
    saveWork(work);
    track("creation_start", {
      mode: work.mode,
      base_shape: work.shapeId,
      clay: work.clayId,
      quality_tier: (wx.getStorageSync("palm-kiln-settings") || {}).quality || "medium"
    });
    wx.navigateTo({ url: `/pages/studio/studio?id=${work.workId}` });
  },

  continueWork() {
    const work = loadLatestDraft();
    if (work) wx.navigateTo({ url: `/pages/studio/studio?id=${work.workId}` });
    else this.start();
  },

  gallery() {
    wx.navigateTo({ url: "/pages/gallery/gallery" });
  },

  settings() {
    wx.navigateTo({ url: "/pages/settings/settings" });
  }
});
