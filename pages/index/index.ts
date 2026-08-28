import { createWork } from "../../core/model";
import { track } from "../../services/analytics";
import { hasDraft, loadLatestDraft, saveWork } from "../../services/storage";
import { loadSettings } from "../../utils/settings";
import { resolveUiMetrics } from "../../utils/ui-metrics";

Page({
  data: {
    hasDraft: false,
    draftTitle: "",
    entrance: false,
    reduceMotion: false,
    statusBarHeight: 20,
    navigationBarHeight: 44
  },
  entranceTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  hasEntered: false,

  onLoad() {
    const metrics = resolveUiMetrics();
    this.setData({
      statusBarHeight:metrics.statusBarHeight,
      navigationBarHeight:metrics.navigationBarHeight
    });
  },

  onShow() {
    const draft = loadLatestDraft();
    const reduceMotion = loadSettings().reduceMotion;
    if (this.entranceTimer) clearTimeout(this.entranceTimer);
    this.setData({
      hasDraft:hasDraft(),
      draftTitle:draft?.title || "",
      reduceMotion,
      entrance:reduceMotion || this.hasEntered
    });
    if (reduceMotion || this.hasEntered) return;
    this.entranceTimer = setTimeout(() => {
      this.hasEntered = true;
      this.setData({ entrance:true });
      this.entranceTimer = undefined;
    }, 80);
  },

  onHide() {
    if (this.entranceTimer) clearTimeout(this.entranceTimer);
  },

  onUnload() {
    if (this.entranceTimer) clearTimeout(this.entranceTimer);
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

  continueWork() {
    const work = loadLatestDraft();
    if (work) wx.navigateTo({ url:`/pages/studio/studio?id=${work.workId}` });
    else this.start();
  },

  gallery() {
    wx.navigateTo({ url:"/pages/gallery/gallery" });
  },

  settings() {
    wx.navigateTo({ url:"/pages/settings/settings" });
  }
});
