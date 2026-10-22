import test from 'node:test';
import assert from 'node:assert/strict';
import {planBotAltitude} from './bot-altitude.js';

test('new bots climb even when a target is near the runway',()=>{
 const p=planBotAltitude({x:350,y:0,vx:0,vy:0},0,1/90,true,0);
 assert.ok(p.overridePursuit);assert.equal(p.throttle,1);assert.ok(p.target.y>0);
});
test('bots resume normal pursuit once their initial climb is complete',()=>{
 const p=planBotAltitude({x:350,y:70,vx:-30,vy:5,altitudeRecovery:true},2,.1,true,0);
 assert.equal(p.overridePursuit,false);
});
test('patrol heights vary and sinking bots request more climb',()=>{
 const bot={x:350,y:90,vx:-30,vy:0,altitudeRecovery:false};
 const low=planBotAltitude(bot,0,.1,false,0),high=planBotAltitude(bot,3,.1,false,0);
 assert.ok(high.target.y>low.target.y);
 assert.ok(planBotAltitude({...bot,vy:-10},0,.1,false,0).target.y>low.target.y);
});
test('brief low attacks remain possible, sustained low fights trigger recovery',()=>{
 const bot={x:200,y:20,vx:-30,vy:0,altitudeRecovery:false};
 assert.equal(planBotAltitude({...bot,lowFlightSeconds:5},0,.1,true,0).overridePursuit,false);
 const recovery=planBotAltitude({...bot,lowFlightSeconds:13},0,.1,true,0);
 assert.equal(recovery.overridePursuit,true);
 assert.equal(planBotAltitude({...bot,...recovery},0,.1,true,0).overridePursuit,true);
});
