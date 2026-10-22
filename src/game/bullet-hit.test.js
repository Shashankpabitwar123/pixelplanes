import test from 'node:test';
import assert from 'node:assert/strict';
import {bulletSegmentHitsPlane,segmentHitsPlane,getRenderedPlanePoint,planeModel,createBulletProjectile} from './mechanics.js';
import {BULLET_HIT_RADIUS,MAX_BULLETS} from './config.js';
import {flashPlaneHit} from './hit-feedback.js';
const plane={x:100,y:100,angle:0,vx:0,vy:0};
globalThis.window={innerWidth:1440,innerHeight:900};
test('connected body catches gaps between old sample points across rotations and screen sizes',()=>{
  for(const aspect of [.6,16/9,2.4]) for(const angle of [0,45,90]) {
    window.innerWidth=900*aspect;
    const p={...plane,angle};
    const a=getRenderedPlanePoint(p,planeModel.hitPoints[0]),b=getRenderedPlanePoint(p,planeModel.hitPoints[2]);
    const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    const segment={start:mid,end:mid};
    assert.equal(segmentHitsPlane(segment,p,.01),false);
    assert.equal(bulletSegmentHitsPlane(segment,p,.01),true);
    assert.equal(bulletSegmentHitsPlane(segment,{...p,crashed:true}),false);
  }
});
test('20 percent tolerance catches near misses but not distant shots; ammo stays seven',()=>{
  window.innerWidth=1440;
  const aspect=1440/900;
  const edge=planeModel.hitPoints.map(p=>getRenderedPlanePoint(plane,p)).sort((a,b)=>b.x-a.x)[0];
  for(const [distance,hit] of [[1.15,true],[1.4,false]]) {
    const point={x:edge.x+distance/aspect,y:edge.y};
    assert.equal(bulletSegmentHitsPlane({start:point,end:point},plane),hit);
    assert.equal(segmentHitsPlane({start:point,end:point},plane,1.05),false);
  }
  assert.equal(BULLET_HIT_RADIUS,1.05*1.2);
  assert.equal(createBulletProjectile(plane,0).radius,BULLET_HIT_RADIUS);
  assert.equal(MAX_BULLETS,7);
});
test('white hit feedback lasts 120 ms and restores the existing plane filter',()=>{
  const oldComputed=globalThis.getComputedStyle;
  let frames,options,cancels=0;
  const sprite={animate(f,o){frames=f;options=o;return {cancel(){cancels++;}};}};
  globalThis.getComputedStyle=()=>({filter:'hue-rotate(30deg)'});
  const element={querySelectorAll:()=>[sprite]};
  try {
    flashPlaneHit(element);
    assert.equal(options.duration,120);
    assert.equal(frames[0].filter,'brightness(0) invert(1)');
    assert.equal(frames.at(-1).filter,'hue-rotate(30deg)');
    flashPlaneHit(element);
    assert.equal(cancels,1);
  } finally {globalThis.getComputedStyle=oldComputed;}
});
