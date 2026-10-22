import test from 'node:test';
import assert from 'node:assert/strict';
import {selectRocketTarget, rocketInterceptPoint} from './rocket-guidance.js';
import {createRocketProjectile, updateGuidedRocket, getRocketSegment, segmentHitsPlane} from './mechanics.js';
import {ROCKET_SPEED,ROCKET_TURN_RATE,ROCKET_LIFETIME_MS,ROCKET_HOMING_MS} from './config.js';
const player={x:200,y:100,angle:0,vx:-45,vy:0};
const target=(index,x=150,y=100,vx=0,vy=0)=>({type:'bot',index,state:{x,y,angle:0,vx,vy,hasLifted:true}});
const launch=(targets=[])=>createRocketProjectile(player,0,{x:.34,y:.8},'test',null,targets);
test('acquisition prefers the nose and rejects behind, distant and crashed targets',()=>{
  const ahead=target(0), nearerOffAxis=target(1,180,113);
  assert.equal(selectRocketTarget(player,[nearerOffAxis,ahead]).index,0);
  assert.equal(selectRocketTarget(player,[target(0,220)]),null);
  assert.equal(selectRocketTarget(player,[target(0,90)]),null);
  assert.equal(selectRocketTarget(player,[{...ahead,state:{...ahead.state,crashed:true}}]),null);
  assert.equal(selectRocketTarget(player,[ahead],45),null);
});
test('rocket retains its launch target and never switches after target loss',()=>{
  const original=target(0),other=target(1,185,105);
  let rocket=launch([original]);
  rocket=updateGuidedRocket(rocket,100,[other,original]);
  assert.equal(rocket.targetKey,'bot:0');
  rocket=updateGuidedRocket(rocket,150,[other]);
  assert.equal(rocket.lockLost,true);
  rocket=updateGuidedRocket(rocket,200,[original,other]);
  assert.equal(rocket.lockLost,true);
  assert.equal(rocket.turnRate,0);
  const unguided=updateGuidedRocket(launch(),100,[original]);
  assert.equal(unguided.targetKey,null);
});
test('launch boosts smoothly, turning is limited, and guidance and life expire',()=>{
  const bot=target(0,160,125);
  let rocket=launch([bot]);
  const initial=Math.hypot(rocket.vx,rocket.vy);
  rocket=updateGuidedRocket(rocket,100,[bot]);
  assert.ok(Math.hypot(rocket.vx,rocket.vy)>initial);
  assert.ok(Math.hypot(rocket.vx,rocket.vy)<ROCKET_SPEED);
  assert.ok(Math.abs(rocket.turnRate)<=ROCKET_TURN_RATE);
  rocket=updateGuidedRocket(rocket,200,[bot]);
  assert.ok(Math.abs(Math.hypot(rocket.vx,rocket.vy)-ROCKET_SPEED)<1e-8);
  const angle=rocket.angle;
  rocket=updateGuidedRocket(rocket,ROCKET_HOMING_MS+1,[bot]);
  assert.equal(rocket.angle,angle);
  assert.equal(updateGuidedRocket(rocket,ROCKET_LIFETIME_MS,[bot]),null);
});
test('intercept prediction leads crossing targets and guided rocket reaches one',()=>{
  const bot=target(0,150,110,-15,12);
  const point=rocketInterceptPoint(player,bot.state,ROCKET_SPEED);
  assert.ok(point.x<bot.state.x && point.y>bot.state.y);
  for(const hz of [30,60,120]) {
    let rocket=launch([bot]),hit=false;
    for(let tick=1;tick<=hz*ROCKET_HOMING_MS/1000;tick++) {
      const t=tick/hz;
      const moving={...bot,state:{...bot.state,x:bot.state.x+bot.state.vx*t,y:bot.state.y+bot.state.vy*t}};
      rocket=updateGuidedRocket(rocket,t*1000,[moving]);
      if(segmentHitsPlane(getRocketSegment(rocket),moving.state,rocket.radius)){hit=true;break;}
    }
    assert.equal(hit,true,`intercept at ${hz} Hz`);
  }
});
