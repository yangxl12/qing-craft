Page({
  data: {
    settings: { sound: true, haptics: true, quality: "medium", guidance: "relaxed", reduceMotion: false },
    statusBar: 20,
    navBar: 32,
    capsulePad: 96
  },
  onLoad() {
    const stored = wx.getStorageSync("palm-kiln-settings");
    if (stored) this.setData({ settings: stored });
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
  back() {
    wx.navigateBack({ fail: () => wx.reLaunch({ url: "/pages/index/index" }) });
  },
  toggle(e: WechatMiniprogramTouchEvent) {
    const key = e.currentTarget.dataset.key;
    const current = this.data.settings as Record<string, any>;
    const settings = { ...current, [key]: !current[key] };
    this.setData({ settings });
    wx.setStorageSync("palm-kiln-settings", settings);
  },
  setValue(e: WechatMiniprogramTouchEvent) {
    const key = e.currentTarget.dataset.key, value = e.currentTarget.dataset.value;
    const settings = { ...this.data.settings, [key]: value };
    this.setData({ settings });
    wx.setStorageSync("palm-kiln-settings", settings);
  }
});
