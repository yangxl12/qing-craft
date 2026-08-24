import { GLAZES, STAGES, TOOLS } from "../../core/catalog";
import { cloneWork, PotteryWork } from "../../core/model";
import { deformProfile, profileDeltaFromDrag, toolAction } from "../../core/profile";
import { PotteryEngine } from "../../core/pottery-engine";
import { loadWork, saveWork } from "../../services/storage";
import { track } from "../../services/analytics";

Page({
  data:{
    ready:false,fallback:false,work:null as PotteryWork|null,stages:STAGES,stageIndex:0,stageName:"制坯",tools:TOOLS.shaping,tool:"finger",toolName:"推 / 拉",
    glazes:GLAZES,glazeId:"celadon",paintColors:["#315e73","#a95955","#d0b17c","#202822","#f1eee4","#657858"],symmetryLabels:["无对称","左右镜像","四向环绕"],
    canUndo:false,canRedo:false,saveState:"已保存",hint:"按住器身，向外轻轻推",cameraHelp:"双指拖动可 360° 环绕查看，开合手指可放大或缩小。",showHint:false,kiln:false,kilnProgress:0,kilnText:"入窑预热",showHelp:false,reduceMotion:false
  },
  engine:null as PotteryEngine|null, canvas:null as any, rect:null as any, work:null as PotteryWork|null, history:[] as PotteryWork[], future:[] as PotteryWork[], gesture:null as any, saveTimer:null as any, kilnTimer:null as any,firstDeformTracked:false,
  onLoad(query:any){ const work=loadWork(query.id); if(!work){wx.showToast({title:"草稿没有找到",icon:"none"});setTimeout(()=>wx.navigateBack(),500);return;} this.work=work; this.syncData(); },
  onReady(){ setTimeout(()=>this.initCanvas(),60); },
  onHide(){this.persist();this.engine?.setAutoRotate(false);},
  onShow(){const reduceMotion=!!(wx.getStorageSync("palm-kiln-settings")||{}).reduceMotion;this.setData({reduceMotion});this.engine?.setAutoRotate(!reduceMotion);},
  onUnload(){this.persist();this.engine?.destroy();if(this.saveTimer)clearTimeout(this.saveTimer);if(this.kilnTimer)clearInterval(this.kilnTimer);},
  initCanvas(){ const q=wx.createSelectorQuery().in(this);q.select("#potteryCanvas").fields({node:true,size:true,rect:true}).exec((res:any[])=>{const info=res&&res[0];if(!info?.node){this.setData({fallback:true,ready:true});return;}this.canvas=info.node;this.rect={left:info.left||0,top:info.top||0,width:info.width,height:info.height};try{this.engine=new PotteryEngine(info.node,this.work!);const sys=wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync();const dpr=Math.min(sys.pixelRatio||2,2);const reduceMotion=!!(wx.getStorageSync("palm-kiln-settings")||{}).reduceMotion;this.engine.resize(info.width,info.height,dpr);this.engine.setAutoRotate(!reduceMotion);this.setData({ready:true,reduceMotion});this.maybeTutorial();}catch(err){console.error(err);this.setData({fallback:true,ready:true,hint:"已进入轻量模式，作品仍可完成",showHint:true});}});},
  maybeTutorial(){ const seen=wx.getStorageSync("palm-kiln-tutorial-seen"); if(!seen&&this.work?.mode==="relaxed")this.setData({showHint:true}); },
  syncData(){if(!this.work)return;const stage=STAGES[this.work.stageIndex]||STAGES[0],tools=TOOLS[stage.id]||[],selected=tools.find(v=>v.id===this.data.tool)||tools[0];this.setData({work:this.work,stageIndex:this.work.stageIndex,stageName:stage.name,tools,tool:selected?.id||"",toolName:selected?.name||"",glazeId:this.work.glazeId,canUndo:this.history.length>0,canRedo:this.future.length>0});},
  close(){this.persist();wx.showModal({title:"先歇一会儿？",content:"作品已经存在本机，下次可以从这里继续。",confirmText:"回到首页",cancelText:"继续创作",success:(r:any)=>{if(r.confirm)wx.reLaunch({url:"/pages/index/index"});}});},
  help(){this.setData({showHelp:!this.data.showHelp});},
  hideHint(){this.setData({showHint:false,showHelp:false});wx.setStorageSync("palm-kiln-tutorial-seen",true);},
  chooseTool(e:WechatMiniprogramTouchEvent){if(!this.work)return;const id=e.currentTarget.dataset.id;const entry=(this.data.tools as any[]).find(v=>v.id===id);this.setData({tool:id,toolName:entry?.name||"",hint:entry?.hint||"",showHint:true});this.vibrate();
    if(this.work.currentStage==="shaping"&&id!=="finger"&&id!=="open"){this.pushHistory();const action=toolAction(this.work.outerRadius,id);this.work.outerRadius=action.profile;this.work.height=Math.max(.45,Math.min(1.8,this.work.height*action.heightScale));this.work.innerRadius=this.work.outerRadius.map((r,i)=>i<2?0:Math.min(r-.08,this.work!.innerRadius[i]||r-.11));this.changed();}
    if(this.work.currentStage==="glaze"){this.pushHistory();this.work.glazeMethod=id;this.changed();}
    if(this.work.currentStage==="decorate"){this.pushHistory();this.work.decorations.push({type:id,y:.55,angle:0});this.changed();}
    if(this.work.currentStage==="paint"&&id==="pattern"){this.pushHistory();this.work.paintPattern=(this.work.paintPattern%4)+1;this.changed();}
  },
  chooseGlaze(e:WechatMiniprogramTouchEvent){if(!this.work)return;this.pushHistory();this.work.glazeId=e.currentTarget.dataset.id;this.setData({glazeId:this.work.glazeId});this.changed();},
  choosePaint(e:WechatMiniprogramTouchEvent){if(!this.work)return;this.pushHistory();this.work.paintColor=e.currentTarget.dataset.color;this.work.paintPattern=this.work.paintPattern||1;this.changed();},
  cycleSymmetry(){if(!this.work)return;this.work.symmetry=(this.work.symmetry+1)%3;this.changed();},
  touchStart(e:WechatMiniprogramTouchEvent){
    if(!this.work||this.data.kiln)return;
    const ts=e.touches;
    if(ts.length===2){
      this.commitGestureChange();
      this.gesture={type:"camera2",distance:this.distance(ts[0],ts[1]),x:(ts[0].clientX+ts[1].clientX)/2,y:(ts[0].clientY+ts[1].clientY)/2};
      return;
    }
    const t=ts[0];if(!t)return;
    const local=this.local(t),hit=this.hitPot(local.x,local.y);
    const editable=hit&&(this.work.currentStage==="shaping"||this.work.currentStage==="paint");
    this.gesture={type:editable?"edit":"orbit",x:t.clientX,y:t.clientY,local,side:local.x<this.rect.width/2?-1:1,filteredDx:0,changed:false,snapshot:cloneWork(this.work)};
  },
  touchMove(e:WechatMiniprogramTouchEvent){if(!this.work||!this.gesture)return;const ts=e.touches;if(ts.length===2){const d=this.distance(ts[0],ts[1]),x=(ts[0].clientX+ts[1].clientX)/2,y=(ts[0].clientY+ts[1].clientY)/2;if(this.gesture.type!=="camera2"){this.commitGestureChange();this.gesture={type:"camera2",distance:d,x,y};}else{if(this.gesture.distance>2&&d>2)this.engine?.dolly(d/this.gesture.distance);this.engine?.orbit(x-this.gesture.x,y-this.gesture.y);this.gesture.distance=d;this.gesture.x=x;this.gesture.y=y;}return;}const t=ts[0];if(!t)return;const dx=t.clientX-this.gesture.x,dy=t.clientY-this.gesture.y;
    if(this.gesture.type==="orbit"){this.engine?.orbit(dx,dy);}
    else if(this.gesture.type==="edit"&&this.work.currentStage==="shaping"){
      const local=this.local(t),center=this.profileIndexAt(local.y);
      const cappedDx=Math.max(-14,Math.min(14,dx));
      this.gesture.filteredDx=this.gesture.filteredDx*.55+cappedDx*.45;
      const radialDrag=this.gesture.filteredDx*this.gesture.side;
      if(this.data.tool==="open"){
        const openingDelta=Math.max(0,profileDeltaFromDrag(radialDrag,this.rect.width)*1.1);
        if(openingDelta>0){const start=Math.floor(this.work.innerRadius.length*.7);for(let i=start;i<this.work.innerRadius.length;i++){const current=this.work.innerRadius[i]||0,target=this.work.outerRadius[i]-.09,next=Math.min(target,current+openingDelta);if(next>current){this.work.innerRadius[i]=next;this.gesture.changed=true;}}}
      }else{
        const delta=this.data.tool==="finger"?profileDeltaFromDrag(radialDrag,this.rect.width):0;
        if(Math.abs(delta)>.00005){this.work.outerRadius=deformProfile(this.work.outerRadius,center,delta,.018,this.work.mode==="relaxed");this.work.innerRadius=this.work.outerRadius.map((r,i)=>i<2?0:Math.min(r-.075,this.work!.innerRadius[i]||r-.11));this.gesture.changed=true;}
      }
      if(this.gesture.changed){this.engine?.update(this.work);this.setData({work:this.work,saveState:"未保存"});}
    }
    else if(this.gesture.type==="edit"&&this.work.currentStage==="paint"){if(this.data.tool==="eraser")this.work.paintPattern=0;else this.work.paintPattern=this.data.tool==="dot"?3:this.data.tool==="pattern"?4:2;this.gesture.changed=true;this.engine?.update(this.work);}
    this.gesture.x=t.clientX;this.gesture.y=t.clientY;
  },
  touchEnd(e:WechatMiniprogramTouchEvent){if(!this.work||!this.gesture)return;this.commitGestureChange();const remaining=e.touches?.[0];if(remaining&&this.gesture.type==="camera2"){this.gesture={type:"orbit",x:remaining.clientX,y:remaining.clientY};return;}this.gesture=null;this.engine?.setAutoRotate(!(wx.getStorageSync("palm-kiln-settings")||{}).reduceMotion);this.syncData();},
  commitGestureChange(){if(!this.work||!this.gesture?.changed||!this.gesture.snapshot)return;this.history.push(this.gesture.snapshot);if(this.history.length>50)this.history.shift();this.future=[];this.changed();if(!this.firstDeformTracked&&this.work.currentStage==="shaping"){track("first_deform",{gesture_type:this.data.tool,quality_tier:(wx.getStorageSync("palm-kiln-settings")||{}).quality||"medium"});this.firstDeformTracked=true;}this.setData({hint:"很好，轮廓已经跟着手指变了",showHint:true});wx.setStorageSync("palm-kiln-tutorial-seen",true);this.gesture.changed=false;},
  local(t:WechatMiniprogramTouch){return{x:t.clientX-this.rect.left,y:t.clientY-this.rect.top};},
  hitPot(x:number,y:number){return this.engine?.hitTest(x,y)??(x>this.rect.width*.19&&x<this.rect.width*.81&&y>this.rect.height*.08&&y<this.rect.height*.72);},
  profileIndexAt(y:number){if(!this.work)return 0;if(this.engine)return this.engine.profileIndexAtCanvasY(y);const bottom=this.rect.height*.67,top=Math.max(this.rect.height*.12,bottom-this.rect.height*.5),position=Math.max(0,Math.min(1,(bottom-y)/Math.max(1,bottom-top)));return Math.round(position*(this.work.outerRadius.length-1));},
  distance(a:WechatMiniprogramTouch,b:WechatMiniprogramTouch){return Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);},
  pushHistory(){if(!this.work)return;this.history.push(cloneWork(this.work));if(this.history.length>50)this.history.shift();this.future=[];},
  undo(){if(!this.work||!this.history.length)return;this.future.push(cloneWork(this.work));this.work=this.history.pop()!;this.changed();this.syncData();},
  redo(){if(!this.work||!this.future.length)return;this.history.push(cloneWork(this.work));this.work=this.future.pop()!;this.changed();this.syncData();},
  resetCamera(){this.engine?.resetCamera();},
  changed(){if(!this.work)return;this.work.updatedAt=Date.now();this.engine?.update(this.work);this.setData({work:this.work,saveState:"保存中…",canUndo:this.history.length>0,canRedo:this.future.length>0});if(this.saveTimer)clearTimeout(this.saveTimer);this.saveTimer=setTimeout(()=>this.persist(),500);},
  persist(){if(!this.work)return;saveWork(this.work);this.setData({saveState:"已保存"});},
  completeStage(){if(!this.work)return;const stage=this.work.currentStage;if(stage==="firing"||stage==="refire"){this.startKiln(stage==="refire");return;}if(stage==="finished"){wx.redirectTo({url:`/pages/result/result?id=${this.work.workId}`});return;}this.advance();},
  advance(){if(!this.work)return;const completed=this.work.currentStage;this.pushHistory();this.work.stageIndex=Math.min(STAGES.length-1,this.work.stageIndex+1);this.work.currentStage=STAGES[this.work.stageIndex].id;track("stage_complete",{stage:completed,next_stage:this.work.currentStage});this.changed();this.syncData();this.setData({hint:`现在开始${STAGES[this.work.stageIndex].name}`,showHint:true});this.vibrate("medium");},
  startKiln(refire:boolean){if(this.data.kiln)return;this.setData({kiln:true,kilnProgress:0,kilnText:refire?"彩绘正在定色":"窑温缓缓升高"});let progress=0;this.kilnTimer=setInterval(()=>{progress+=4;this.setData({kilnProgress:progress,kilnText:progress<34?"窑温缓缓升高":progress<70?"釉面正在熔融":"慢慢冷却显色"});if(progress>=100)this.finishKiln();},120);},
  skipKiln(){this.finishKiln();},
  finishKiln(){if(this.kilnTimer){clearInterval(this.kilnTimer);this.kilnTimer=null;}this.setData({kiln:false,kilnProgress:100});this.advance();},
  vibrate(type="light"){const s=wx.getStorageSync("palm-kiln-settings")||{};if(s.haptics)wx.vibrateShort({type});}
});
