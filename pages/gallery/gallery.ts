import { PotteryWork } from "../../core/model";
import { listWorks } from "../../services/storage";

Page({
 data:{works:[] as PotteryWork[],tab:"all"},
 onShow(){this.setData({works:listWorks()});},
 back(){wx.navigateBack({fail:()=>wx.reLaunch({url:"/pages/index/index"})});},
 start(){wx.navigateTo({url:"/pages/setup/setup"});},
 chooseTab(e:WechatMiniprogramTouchEvent){this.setData({tab:e.currentTarget.dataset.id});},
 open(e:WechatMiniprogramTouchEvent){const id=e.currentTarget.dataset.id;const work=(this.data.works as PotteryWork[]).find(v=>v.workId===id);if(!work)return;wx.navigateTo({url:work.status==="completed"?`/pages/result/result?id=${id}`:`/pages/studio/studio?id=${id}`});}
});
