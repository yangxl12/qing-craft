Page({
 data:{settings:{sound:true,haptics:true,quality:"medium",guidance:"relaxed",reduceMotion:false}},
 onLoad(){const s=wx.getStorageSync("palm-kiln-settings");if(s)this.setData({settings:s});},
 back(){wx.navigateBack();},
 toggle(e:WechatMiniprogramTouchEvent){const key=e.currentTarget.dataset.key;const current=this.data.settings as Record<string,any>;const settings={...current,[key]:!current[key]};this.setData({settings});wx.setStorageSync("palm-kiln-settings",settings);},
 setValue(e:WechatMiniprogramTouchEvent){const key=e.currentTarget.dataset.key,value=e.currentTarget.dataset.value;const settings={...this.data.settings,[key]:value};this.setData({settings});wx.setStorageSync("palm-kiln-settings",settings);}
});
