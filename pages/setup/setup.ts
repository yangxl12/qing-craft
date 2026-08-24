import { CLAYS, SHAPES, ShapeId, ClayId } from "../../core/catalog";
import { createWork } from "../../core/model";
import { saveWork } from "../../services/storage";
import { track } from "../../services/analytics";

Page({
  data:{step:0,shapes:SHAPES,clays:CLAYS,shapeId:"cup",clayId:"porcelain",mode:"relaxed",kneads:0},
  back(){ if(this.data.step>0)this.setData({step:this.data.step-1});else wx.navigateBack(); },
  chooseMode(e:WechatMiniprogramTouchEvent){this.setData({mode:e.currentTarget.dataset.id});},
  chooseShape(e:WechatMiniprogramTouchEvent){this.setData({shapeId:e.currentTarget.dataset.id});},
  chooseClay(e:WechatMiniprogramTouchEvent){this.setData({clayId:e.currentTarget.dataset.id});},
  next(){ if(this.data.step<2)this.setData({step:this.data.step+1});else this.finish(); },
  knead(){const n=Math.min(4,this.data.kneads+1);this.setData({kneads:n});const settings=wx.getStorageSync("palm-kiln-settings")||{};if(settings.haptics)wx.vibrateShort({type:"light"});},
  finish(){const work=createWork(this.data.shapeId as ShapeId,this.data.clayId as ClayId,this.data.mode as "relaxed"|"free");saveWork(work);track("creation_start",{mode:work.mode,base_shape:work.shapeId,clay:work.clayId,quality_tier:(wx.getStorageSync("palm-kiln-settings")||{}).quality||"medium"});wx.redirectTo({url:`/pages/studio/studio?id=${work.workId}`});}
});
