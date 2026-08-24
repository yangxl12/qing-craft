const assert = require('node:assert/strict');

function constrain(profile) {
  const next = profile.map(r => Math.max(.18, Math.min(1.25, r)));
  for (let pass=0; pass<2; pass++) for (let i=1; i<next.length; i++) {
    const d=next[i]-next[i-1]; if(Math.abs(d)>.075) next[i]=next[i-1]+Math.sign(d)*.075;
  }
  next[0]=Math.max(.28,next[0]); next[1]=Math.max(next[0]*.94,next[1]); return next;
}
function deform(profile,center,delta){const sigma=Math.max(2,profile.length*.08),d=Math.max(-.12,Math.min(.12,delta));return constrain(profile.map((r,i)=>r+d*Math.exp(-((i-center)**2)/(2*sigma*sigma))));}

const base=Array(48).fill(.55); const pushed=deform(base,24,.1);
assert.ok(pushed[24]>base[24], '触点应向外鼓起');
assert.ok(pushed[24]>pushed[10], '影响应集中在触点邻域');
assert.ok(pushed.every(Number.isFinite), '不应产生 NaN');
assert.ok(pushed.every(r=>r>=.18&&r<=1.25), '半径必须在保护范围内');
for(let i=0;i<100;i++){const center=(i*17)%48,delta=i%2?.5:-.5;const next=deform(base,center,delta);assert.ok(next.every(Number.isFinite));assert.ok(next.every(r=>r>=.18&&r<=1.25));}
console.log('profile tests passed: gaussian locality, radius bounds, 100 deformation stress cases');
