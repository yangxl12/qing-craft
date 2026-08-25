import { createWork, PotteryWork } from "../../core/model";
import { track } from "../../services/analytics";
import { listWorks, saveWork } from "../../services/storage";

Page({
 data:{works:[] as PotteryWork[],tab:"all"},
 onShow(){this.setData({works:listWorks()});},
 back(){wx.navigateBack({fail:()=>wx.reLaunch({url:"/pages/index/index"})});},
 start(){
  const work=createWork("vase","porcelain","free");
  saveWork(work);
  track("creation_start",{mode:work.mode,base_shape:work.shapeId,clay:work.clayId,quality_tier:(wx.getStorageSync("palm-kiln-settings")||{}).quality||"medium"});
  wx.navigateTo({url:`/pages/studio/studio?id=${work.workId}`});
 },
 chooseTab(e:WechatMiniprogramTouchEvent){this.setData({tab:e.currentTarget.dataset.id});},
 open(e:WechatMiniprogramTouchEvent){const id=e.currentTarget.dataset.id;const work=(this.data.works as PotteryWork[]).find(v=>v.workId===id);if(!work)return;wx.navigateTo({url:work.status==="completed"?`/pages/result/result?id=${id}`:`/pages/studio/studio?id=${id}`});}
});
