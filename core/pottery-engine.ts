import { clayColor, glazeColor, PotteryWork } from "./model";

type GL = any;

function hexRgb(hex:string):number[]{ const clean=hex.replace("#",""); return [parseInt(clean.slice(0,2),16)/255,parseInt(clean.slice(2,4),16)/255,parseInt(clean.slice(4,6),16)/255]; }
function normalize(x:number,y:number,z:number):number[]{ const l=Math.hypot(x,y,z)||1; return [x/l,y/l,z/l]; }

function perspective(fov:number, aspect:number, near:number, far:number):Float32Array {
  const f=1/Math.tan(fov/2), nf=1/(near-far); return new Float32Array([f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0]);
}
function multiply(a:Float32Array,b:Float32Array):Float32Array{
  const out=new Float32Array(16); for(let c=0;c<4;c++) for(let r=0;r<4;r++) out[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3]; return out;
}
function lookAt(eye:number[],center:number[],up:number[]):Float32Array{
  const z=normalize(eye[0]-center[0],eye[1]-center[1],eye[2]-center[2]); const x=normalize(up[1]*z[2]-up[2]*z[1],up[2]*z[0]-up[0]*z[2],up[0]*z[1]-up[1]*z[0]);
  const y=[z[1]*x[2]-z[2]*x[1],z[2]*x[0]-z[0]*x[2],z[0]*x[1]-z[1]*x[0]];
  return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-x[0]*eye[0]-x[1]*eye[1]-x[2]*eye[2],-y[0]*eye[0]-y[1]*eye[1]-y[2]*eye[2],-z[0]*eye[0]-z[1]*eye[1]-z[2]*eye[2],1]);
}
function rotateY(a:number):Float32Array{ const c=Math.cos(a),s=Math.sin(a); return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]); }

const VS=`
attribute vec3 aPosition; attribute vec3 aNormal;
uniform mat4 uMvp; uniform mat4 uModel; uniform float uHeight;
varying vec3 vNormal; varying vec3 vPos; varying float vY;
void main(){ vec4 world=uModel*vec4(aPosition,1.0); vPos=world.xyz; vNormal=mat3(uModel)*aNormal; vY=aPosition.y/uHeight; gl_Position=uMvp*vec4(aPosition,1.0); }
`;
const FS=`
precision mediump float; varying vec3 vNormal; varying vec3 vPos; varying float vY;
uniform vec3 uBase; uniform vec3 uGlaze; uniform vec3 uAccent; uniform float uGlazeMix; uniform float uPattern; uniform float uMethod;
void main(){
 vec3 n=normalize(vNormal); vec3 light=normalize(vec3(-.55,.82,.42)); float diff=max(dot(n,light),0.0); float side=.38+.68*diff;
 float angle=atan(vPos.z,vPos.x); float glazeMask=1.0; if(uMethod==1.0) glazeMask=smoothstep(.48,.52,vY); else if(uMethod==2.0) glazeMask=.72+.18*sin(vY*31.0+angle*2.0); else if(uMethod==3.0) glazeMask=smoothstep(-.1,.22,sin(angle*3.0+vY*13.0));
 vec3 material=mix(uBase,uGlaze,uGlazeMix*glazeMask); float mark=0.0;
 if(uPattern==1.0) mark=smoothstep(.88,1.0,sin(vY*72.0));
 if(uPattern==2.0) mark=smoothstep(.83,1.0,sin(angle*8.0+vY*18.0));
 if(uPattern==3.0) mark=smoothstep(.76,1.0,cos(angle*12.0)*cos((vY-.55)*24.0));
 if(uPattern==4.0) mark=smoothstep(.82,1.0,sin(angle*4.0-vY*22.0));
 material=mix(material,uAccent,mark*.82); float rim=pow(max(dot(n,normalize(vec3(.15,.15,1.0))),0.0),24.0)*uGlazeMix;
 gl_FragColor=vec4(material*side+vec3(rim*.28),1.0);
}`;

export class PotteryEngine {
  private canvas:any; private gl:GL; private program:any; private vbo:any; private nbo:any; private ibo:any; private count=0; private work:PotteryWork;
  private yaw=.2; private pitch=.08; private zoom=3.1; private frame=0; private running=true; private autoRotate=true;
  constructor(canvas:any, work:PotteryWork){ this.canvas=canvas; this.work=work; const gl=canvas.getContext("webgl",{antialias:true,alpha:true,preserveDrawingBuffer:true}); if(!gl) throw new Error("WEBGL_UNAVAILABLE"); this.gl=gl; this.program=this.makeProgram(VS,FS); this.vbo=gl.createBuffer();this.nbo=gl.createBuffer();this.ibo=gl.createBuffer(); this.rebuild(); this.loop(); }
  private makeProgram(vsSource:string,fsSource:string):any { const gl=this.gl; const compile=(type:number,src:string)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)||"shader");return s;}; const p=gl.createProgram();gl.attachShader(p,compile(gl.VERTEX_SHADER,vsSource));gl.attachShader(p,compile(gl.FRAGMENT_SHADER,fsSource));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p)||"link");return p; }
  resize(width:number,height:number,dpr:number){ this.canvas.width=Math.max(1,Math.floor(width*dpr));this.canvas.height=Math.max(1,Math.floor(height*dpr));this.gl.viewport(0,0,this.canvas.width,this.canvas.height);this.render(); }
  update(work:PotteryWork){ this.work=work; this.rebuild(); this.render(); }
  setAutoRotate(value:boolean){this.autoRotate=value;}
  orbit(dx:number,dy:number){this.yaw+=dx*.012;this.pitch=Math.max(-.25,Math.min(.5,this.pitch+dy*.006));this.render();}
  dolly(scale:number){this.zoom=Math.max(2.25,Math.min(4.8,this.zoom/scale));this.render();}
  resetCamera(){this.yaw=.2;this.pitch=.08;this.zoom=3.1;this.render();}
  destroy(){this.running=false;const gl=this.gl;gl.deleteBuffer(this.vbo);gl.deleteBuffer(this.nbo);gl.deleteBuffer(this.ibo);gl.deleteProgram(this.program);}
  private rebuild(){
    const settings=wx.getStorageSync("palm-kiln-settings")||{}; const radial=settings.quality==="low"?48:settings.quality==="high"?88:64, rings=this.work.outerRadius.length, h=this.work.height; const pos:number[]=[],norm:number[]=[],idx:number[]=[];
    const appendSurface=(inner:boolean)=>{ const base=pos.length/3; for(let y=0;y<rings;y++){ const t=y/(rings-1), r=inner?Math.max(y<2?.04:this.work.innerRadius[y]||this.work.outerRadius[y]-.11,.04):this.work.outerRadius[y]; const prev=this.work.outerRadius[Math.max(0,y-1)], next=this.work.outerRadius[Math.min(rings-1,y+1)], slope=(next-prev)*rings/h*.5;
      for(let a=0;a<=radial;a++){const th=a/radial*Math.PI*2,c=Math.cos(th),s=Math.sin(th);pos.push(r*c,t*h-h*.5,r*s);const nn=normalize(c,inner?slope:-slope,s);norm.push((inner?-1:1)*nn[0],(inner?-1:1)*nn[1],(inner?-1:1)*nn[2]);}}
      for(let y=0;y<rings-1;y++)for(let a=0;a<radial;a++){const i=base+y*(radial+1)+a,j=i+radial+1;if(inner)idx.push(i,j,i+1,i+1,j,j+1);else idx.push(i,i+1,j,i+1,j+1,j);}
      return base;
    };
    const outerBase=appendSurface(false), innerBase=appendSurface(true); const top=rings-1;
    for(let a=0;a<radial;a++){const o=outerBase+top*(radial+1)+a, inn=innerBase+top*(radial+1)+a;idx.push(o,o+1,inn,o+1,inn+1,inn);}
    const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,this.vbo);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(pos),gl.DYNAMIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,this.nbo);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(norm),gl.DYNAMIC_DRAW);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.ibo);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(idx),gl.DYNAMIC_DRAW);this.count=idx.length;
  }
  render(){
    const gl=this.gl,p=this.program,w=this.canvas.width||1,h=this.canvas.height||1;gl.viewport(0,0,w,h);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(p);
    const model=rotateY(this.yaw), eye=[Math.sin(this.yaw)*this.zoom,Math.sin(this.pitch)*this.zoom,Math.cos(this.yaw)*this.zoom]; const view=lookAt(eye,[0,0,0],[0,1,0]); const mvp=multiply(perspective(.68,w/h,.1,20),view);
    const attrib=(name:string,buffer:any)=>{const loc=gl.getAttribLocation(p,name);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,0,0);};attrib("aPosition",this.vbo);attrib("aNormal",this.nbo);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.ibo);
    gl.uniformMatrix4fv(gl.getUniformLocation(p,"uMvp"),false,mvp);gl.uniformMatrix4fv(gl.getUniformLocation(p,"uModel"),false,model);gl.uniform1f(gl.getUniformLocation(p,"uHeight"),this.work.height);
    const set3=(name:string,v:number[])=>gl.uniform3fv(gl.getUniformLocation(p,name),new Float32Array(v));set3("uBase",hexRgb(clayColor(this.work)));set3("uGlaze",hexRgb(glazeColor(this.work)));set3("uAccent",hexRgb(this.work.paintColor));
    gl.uniform1f(gl.getUniformLocation(p,"uGlazeMix"),this.work.stageIndex>=2?(this.work.stageIndex>=3?1:.72):0);gl.uniform1f(gl.getUniformLocation(p,"uPattern"),this.work.paintPattern||this.decorationPattern());
    const method={full:0,half:1,brush:2,splash:3}[this.work.glazeMethod]||0;gl.uniform1f(gl.getUniformLocation(p,"uMethod"),method);gl.drawElements(gl.TRIANGLES,this.count,gl.UNSIGNED_SHORT,0);
  }
  private decorationPattern():number { if(!this.work.decorations.length)return 0; const t=this.work.decorations[this.work.decorations.length-1].type; return t==="carve"?1:t==="impress"?2:t==="stamp"?3:4; }
  private loop(){ if(!this.running)return; if(this.autoRotate){this.yaw+=.002;this.render();} this.frame=this.canvas.requestAnimationFrame(()=>this.loop()); }
}
