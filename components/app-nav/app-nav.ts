import { resolveUiMetrics } from "../../utils/ui-metrics";

Component({
  options: { addGlobalClass:true },
  properties: {
    title: { type:String, value:"" },
    theme: { type:String, value:"light" },
    back: { type:Boolean, value:true },
    backLabel: { type:String, value:"返回" },
    autoBack: { type:Boolean, value:true },
    rightIcon: { type:String, value:"" },
    rightLabel: { type:String, value:"" },
    fixed: { type:Boolean, value:true },
    embedded: { type:Boolean, value:false },
    avoidCapsule: { type:Boolean, value:true }
  },
  data: {
    navigationTop:20,
    navigationBarHeight:44,
    contentTop:64,
    capsulePadding:96
  },
  lifetimes: {
    attached() {
      this.setData(resolveUiMetrics());
    }
  },
  methods: {
    onBack() {
      this.triggerEvent("back");
      if (!this.data.autoBack) return;
      wx.navigateBack({ fail:() => wx.reLaunch({ url:"/pages/index/index" }) });
    },
    onRight() {
      if (!this.data.rightIcon && !this.data.rightLabel) return;
      this.triggerEvent("right");
    }
  }
});
