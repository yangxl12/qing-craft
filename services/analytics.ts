interface AnalyticsEvent { name:string; at:number; properties:Record<string,string|number|boolean>; }
const KEY="palm-kiln-analytics-v1";

// v1 先保存匿名、低频事件；不记录触摸点、笔迹、作品名或图片内容。
export function track(name:string,properties:Record<string,string|number|boolean>={}):void{
  const events:AnalyticsEvent[]=wx.getStorageSync(KEY)||[];
  events.push({name,at:Date.now(),properties});
  wx.setStorageSync(KEY,events.slice(-200));
}
