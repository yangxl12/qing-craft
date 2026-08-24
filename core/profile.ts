/**
 * Converts a touch move in CSS pixels into a small radial profile change.
 * A full-width drag changes the radius by roughly one third of a model unit,
 * while a single delayed touch event is capped so the clay cannot jump.
 */
export function profileDeltaFromDrag(deltaPixels:number, viewportWidth:number):number {
  if(!Number.isFinite(deltaPixels)) return 0;
  const safeWidth=Math.max(280,Number.isFinite(viewportWidth)?viewportWidth:0);
  const capped=Math.max(-14,Math.min(14,deltaPixels));
  return capped*(.34/safeWidth);
}

export function deformProfile(profile:number[], center:number, delta:number, strength=.12, relaxed=true):number[] {
  const next=profile.slice(); const sigma=Math.max(2, profile.length*.08); const d=Math.max(-strength,Math.min(strength,delta));
  for(let i=0;i<next.length;i++){ const dist=i-center; const weight=Math.exp(-(dist*dist)/(2*sigma*sigma)); next[i]+=d*weight; }
  return constrainProfile(next, relaxed);
}
export function smoothProfile(profile:number[]):number[]{ const next=profile.slice(); for(let i=1;i<profile.length-1;i++) next[i]=profile[i]*.5+(profile[i-1]+profile[i+1])*.25; return constrainProfile(next,true); }
export function constrainProfile(profile:number[], relaxed:boolean):number[]{
  const next=profile.map(r=>Math.max(.18,Math.min(1.25,r))); if(!relaxed) return next;
  for(let pass=0;pass<2;pass++) for(let i=1;i<next.length;i++){ const max=.075; const d=next[i]-next[i-1]; if(Math.abs(d)>max) next[i]=next[i-1]+Math.sign(d)*max; }
  next[0]=Math.max(.28,next[0]); next[1]=Math.max(next[0]*.94,next[1]); return next;
}
export function toolAction(profile:number[], tool:string):{profile:number[];heightScale:number}{
  let next=profile.slice(),heightScale=1;
  if(tool==="raise") heightScale=1.08; else if(tool==="lower") heightScale=.92;
  else if(tool==="collar") next=next.map((r,i)=>i>next.length*.62?r*(.88+.12*(1-i/next.length)):r);
  else if(tool==="rim"){ const n=next.length; next[n-1]=(next[n-2]+next[n-3])*.5; }
  else if(tool==="foot"){ next[0]*=.85; next[1]*=.9; next[2]*=.95; }
  else if(tool==="smooth") next=smoothProfile(next);
  return {profile:constrainProfile(next,true),heightScale};
}
