App({
  onLaunch() {
    const settings = wx.getStorageSync("palm-kiln-settings");
    if (!settings) {
      wx.setStorageSync("palm-kiln-settings", {
        sound: true,
        haptics: true,
        quality: "medium",
        guidance: "relaxed",
        reduceMotion: false
      });
    }
  }
});
