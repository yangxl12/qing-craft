import { hasDraft, loadLatestDraft } from "../../services/storage";

Page({
  data: { hasDraft:false, draftTitle:"", draftStage:"", entrance:false },
  onShow(){ const draft=loadLatestDraft(); this.setData({hasDraft:hasDraft(),draftTitle:draft?.title||"",draftStage:draft?.currentStage||""}); setTimeout(()=>this.setData({entrance:true}),80); },
  start(){ wx.navigateTo({url:"/pages/setup/setup"}); },
  continueWork(){ const work=loadLatestDraft(); if(work) wx.navigateTo({url:`/pages/studio/studio?id=${work.workId}`}); else this.start(); },
  gallery(){ wx.navigateTo({url:"/pages/gallery/gallery"}); },
  settings(){ wx.navigateTo({url:"/pages/settings/settings"}); }
});
