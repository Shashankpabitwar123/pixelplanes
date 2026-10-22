import test from 'node:test';
import assert from 'node:assert/strict';
import {TRAINING_LESSONS,readTrainingSave,trainingSetup,createTrainingSession,assessTraining,trainingEvent,moveTrainingTargets} from './training.js';
const active=i=>({...createTrainingSession(i),status:'active'});
test('eight isolated exercises have safe starting supplies and one target at most',()=>{
  assert.equal(TRAINING_LESSONS.length,8);
  for(let i=0;i<8;i++) {
    const setup=trainingSetup(i);
    assert.ok(setup.spawn.fuel>0);
    assert.ok(setup.targets.length<=1);
    for(const target of setup.targets) assert.ok(target.active&&target.state.hasLifted&&Number.isFinite(target.state.vx));
  }
});
test('briefings cannot pass, takeoff requires a lifted plane at its gate',()=>{
  const {spawn,gate}=trainingSetup(0);
  const plane={...spawn,x:gate.x,y:gate.y,hasLifted:true};
  assert.equal(assessTraining(createTrainingSession(),plane,.1,gate).status,'briefing');
  assert.equal(assessTraining(active(0),{...plane,hasLifted:false},.1,gate).status,'active');
  assert.equal(assessTraining(active(0),plane,.1,gate).status,'success');
});
test('handling requires both turns and two continuous seconds of controlled flight',()=>{
  let s=active(1); const plane={...trainingSetup(1).spawn};
  s=assessTraining(s,{...plane,angle:-15},.1);
  s=assessTraining(s,{...plane,angle:45},.1);
  assert.ok(s.left&&s.right);
  s=assessTraining(s,plane,1);
  assert.equal(s.status,'active');
  s=assessTraining(s,{...plane,turnRate:30},.1);
  assert.equal(s.steady,0);
  s=assessTraining(s,plane,2);
  assert.equal(s.status,'success');
});
test('landing requires a safe touchdown before refueling, not proximity alone',()=>{
  let s=trainingEvent(active(2),'refuel');
  assert.equal(s.status,'active');
  s=trainingEvent(s,'land');s=trainingEvent(s,'refuel');
  assert.equal(s.status,'success');
});
test('bullet lesson requires two hits plus emptying and refilling seven rounds',()=>{
  let s=active(3);s=trainingEvent(s,'hit');s=trainingEvent(s,'hit');
  assert.equal(s.status,'active');
  s=trainingEvent(s,'ammo',{count:7,reloading:false});assert.equal(s.status,'active');
  s=trainingEvent(s,'ammo',{count:0,reloading:true});
  s=trainingEvent(s,'ammo',{count:7,reloading:false});assert.equal(s.status,'success');
  assert.equal(trainingEvent(active(4),'hit').status,'active');
  assert.equal(trainingEvent(trainingEvent(active(4),'hit'),'hit').status,'success');
  assert.equal(trainingEvent(active(5),'hit').status,'success');
});
test('recovery requires actual danger and sustained climb; fog needs light at gate',()=>{
  const {spawn}=trainingSetup(6);
  let s=assessTraining(active(6),spawn,.1);
  assert.equal(s.warningSeen,true);
  s=assessTraining(s,{...spawn,angle:30,y:12,vy:4},.25);
  assert.equal(s.status,'active');
  s=assessTraining(s,{...spawn,angle:30,y:13,vy:4},.25);
  assert.equal(s.status,'success');
  const setup=trainingSetup(7),plane={...setup.spawn,...setup.gate};
  assert.equal(assessTraining(active(7),plane,.1,setup.gate).status,'active');
  assert.equal(assessTraining(active(7),{...plane,searchLightOn:true},.1,setup.gate).status,'success');
});
test('crashes stop the lesson and retries reset only exercise state',()=>{
  const failed=assessTraining({...active(4),hits:1},{crashed:true},.1);
  assert.equal(failed.status,'failed');
  assert.equal(trainingEvent(failed,'hit').status,'failed');
  const retry=createTrainingSession(4);assert.equal(retry.hits,0);assert.equal(retry.status,'briefing');
});
test('moving target velocity matches its movement; same elapsed time freezes targets',()=>{
  const {targets}=trainingSetup(4);moveTrainingTargets(targets,1);const before={...targets[0].state};
  moveTrainingTargets(targets,1);assert.deepEqual(targets[0].state,before);
  moveTrainingTargets(targets,1.00001);
  assert.ok(Math.abs((targets[0].state.x-before.x)/.00001-before.vx)<.001);
  assert.ok(Math.abs((targets[0].state.y-before.y)/.00001-before.vy)<.001);
});
test('saved progress distinguishes skipped from passed and handles corrupt storage',()=>{
  const save=readTrainingSave({getItem:()=>JSON.stringify({index:99,results:{takeoff:'passed',handling:'skipped',weather:'madeup'}})});
  assert.equal(save.index,7);assert.equal(save.results.takeoff,'passed');assert.equal(save.results.handling,'skipped');assert.equal(save.results.weather,null);
  assert.deepEqual(readTrainingSave({getItem(){throw Error();}}),{index:0,results:{}});
});
