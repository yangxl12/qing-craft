import { loadSettings } from "../../utils/settings";

Page({
  data: {
    reduceMotion:false
  },
  onShow() {
    this.setData({ reduceMotion:loadSettings().reduceMotion });
  }
});
