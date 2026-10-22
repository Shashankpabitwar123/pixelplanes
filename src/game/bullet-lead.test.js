import test from 'node:test';
import assert from 'node:assert/strict';
import { getBulletLead } from './bullet-lead.js';
import { getBulletTrajectory, getRenderedPlanePoint, segmentHitsPlane, planeModel } from './mechanics.js';
import { BULLET_RANGE, BULLET_LIFETIME_MS, BULLET_FLIGHT_SECONDS, BULLET_MUZZLE_POINT, createSoloGameRules, MAX_BULLETS } from './config.js';
globalThis.window = {innerWidth:1440,innerHeight:900};
const player = {x:100,y:100,vx:-40,vy:5,angle:0,hasLifted:true};
const target = {x:65,y:105,vx:-25,vy:12,hasLifted:true};
test('lead intercepts a moving target including inherited velocity across aspect ratios', () => {
  for(const aspect of [0.6, 1.35, 16/9, 2.4]) {
    globalThis.window = {innerWidth:900*aspect,innerHeight:900};
    const lead = getBulletLead(player,[target],{aspect});
    assert.ok(lead);
    const muzzle = getRenderedPlanePoint(player,BULLET_MUZZLE_POINT);
    const dx=lead.x-muzzle.x,dy=(lead.y-muzzle.y)/aspect,length=Math.hypot(dx,dy);
    const life=BULLET_LIFETIME_MS/1000,speed=BULLET_RANGE/life,inherit=BULLET_FLIGHT_SECONDS/life;
    const x=muzzle.x+(dx/length*speed+player.vx*inherit)*lead.time;
    const y=muzzle.y+(dy/length*speed*aspect+player.vy*inherit)*lead.time;
    assert.ok(Math.abs(x-target.x-target.vx*lead.time)<1e-8);
    assert.ok(Math.abs(y-target.y-target.vy*lead.time)<1e-8);
  }
});
test('marker excludes distant, behind, crashed and unreachable targets and keeps a valid lock', () => {
  assert.equal(getBulletLead(player,[{...target,x:150}]),null);
  assert.equal(getBulletLead(player,[{...target,x:0}]),null);
  assert.equal(getBulletLead(player,[{...target,crashed:true}]),null);
  assert.equal(getBulletLead(player,[{...target,vx:-1000}]),null);
  assert.equal(getBulletLead(player,[{...target,x:50}],{maxDistance:45}),null);
  assert.equal(getBulletLead({...player,crashed:true},[target]),null);
  assert.equal(getBulletLead(player,[target,{...target,x:60}],{preferredIndex:1}).index,1);
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
