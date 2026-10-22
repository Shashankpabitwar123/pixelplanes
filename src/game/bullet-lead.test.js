import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPredictedBulletHit } from './bullet-lead.js';
import { getBulletTrajectory, getRenderedPlanePoint, segmentHitsPlane, planeModel } from './mechanics.js';
import { createSoloGameRules, MAX_BULLETS } from './config.js';
globalThis.window = {innerWidth:1440,innerHeight:900};
const player = {x:100,y:100,vx:-40,vy:5,angle:0,hasLifted:true};
const target = {x:65,y:105,vx:-25,vy:12,hasLifted:true};
test('green feedback tests the current shot, accounting for target motion and screen proportions', () => {
  for(const aspect of [0.6,1.35,16/9,2.4]) {
    globalThis.window={innerWidth:900*aspect,innerHeight:900};
    const shooter={...player,vy:0};
    const trajectory=getBulletTrajectory(shooter);
    const seconds=0.3, progress=seconds/(trajectory.life/1000);
    const bot={...target,angle:0,vx:-10,vy:8,
      x:trajectory.x+trajectory.dx*progress+10*seconds,
      y:trajectory.y-trajectory.dy*progress-8*seconds};
    assert.equal(hasPredictedBulletHit(shooter,[bot],trajectory),true);
    assert.equal(hasPredictedBulletHit(shooter,[{...bot,y:bot.y+15}],trajectory),false);
    assert.equal(hasPredictedBulletHit(shooter,[{...bot,vy:-40}],trajectory),false);
    assert.equal(hasPredictedBulletHit(shooter,[{...bot,crashed:true}],trajectory),false);
    assert.equal(hasPredictedBulletHit(shooter,[bot],trajectory,{maxDistance:5}),false);
    assert.equal(hasPredictedBulletHit({...shooter,crashed:true},[bot],trajectory),false);
  }
});
test('feedback cannot predict beyond bullet lifetime or ground-clipped path', () => {
  globalThis.window={innerWidth:1440,innerHeight:900};
  const shooter={...player,vx:0,vy:0};
  const trajectory=getBulletTrajectory(shooter);
  const bot={...target,angle:0,vx:0,vy:0,x:trajectory.x-30,y:trajectory.y};
  assert.equal(hasPredictedBulletHit(shooter,[bot],trajectory),true);
  assert.equal(hasPredictedBulletHit(shooter,[bot],{...trajectory,dx:-10,life:100,groundHit:true}),false);
  assert.equal(hasPredictedBulletHit(shooter,[{...bot,x:130}],trajectory),false);
});
test('bullets retain range, gain speed, and swept collision catches a crossed plane', () => {
  const previousWindow=globalThis.window;
  try {
    for(const aspect of [0.6,16/9]) {
      globalThis.window={innerWidth:900*aspect,innerHeight:900};
      const bullet=getBulletTrajectory({...player,vx:0,vy:0});
      assert.equal(bullet.life,1350/1.6);
      assert.equal(bullet.dx,-102);
      const point=getRenderedPlanePoint(player,planeModel.hitPoints[0]);
      assert.equal(segmentHitsPlane({start:{x:point.x-20,y:point.y},end:{x:point.x+20,y:point.y}},player),true);
    }
  } finally { globalThis.window=previousWindow; }
  const rules=createSoloGameRules();
  assert.equal((MAX_BULLETS-1)*rules.bulletCooldownMs,600);
  assert.equal(rules.bulletReloadSeconds,4);
});

test('hit margin follows screen proportions and the visible sprite', () => {
  const previousWindow=globalThis.window;
  try {
    for (const aspect of [0.6, 1.35, 2.4]) {
      globalThis.window={innerWidth:900*aspect,innerHeight:900};
      const edge=planeModel.hitPoints.map(p=>getRenderedPlanePoint(player,p)).sort((a,b)=>b.x-a.x)[0];
      for (const [factor, expected] of [[0.9,true],[1.1,false]]) {
        const point={x:edge.x+0.2/aspect*factor,y:edge.y};
        assert.equal(segmentHitsPlane({start:point,end:point},player,0.2),expected);
      }
    }
  } finally { globalThis.window=previousWindow; }
});
