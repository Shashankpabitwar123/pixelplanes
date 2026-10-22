import test from 'node:test';
import assert from 'node:assert/strict';
import { createWeatherCycle } from './weather.js';
import { createSoloGameRules } from './config.js';
test('only three weather and difficulty values are accepted', () => {
  assert.equal(createSoloGameRules({weatherMode:3}).weatherMode,2);
  assert.equal(createSoloGameRules({botDifficulty:5}).botDifficulty,3);
});
test('clear never starts fog or rain', () => {
  assert.deepEqual(createWeatherCycle(0).advance(1e9),{fog:false,rain:false});
});
test('normal and harsh follow distinct start, duration and break rules', () => {
  const normal=createWeatherCycle(1,()=>0), harsh=createWeatherCycle(2,()=>0);
  assert.deepEqual(normal.advance(1100),{fog:false,rain:false});
  assert.deepEqual(harsh.advance(1100),{fog:true,rain:false});
  assert.deepEqual(harsh.advance(1100),{fog:true,rain:true});
  assert.deepEqual(normal.advance(3400),{fog:true,rain:false});
  assert.deepEqual(normal.advance(10500),{fog:true,rain:true});
  assert.equal(normal.advance(2500).fog,false);
  assert.equal(harsh.advance(16900).fog,false);
  assert.equal(harsh.advance(5000).fog,true);
});
test('zero elapsed time preserves weather and a fresh cycle resets active effects', () => {
  const cycle=createWeatherCycle(2,()=>0);
  const active=cycle.advance(3000);
  for(let i=0;i<100;i++) assert.deepEqual(cycle.advance(0),active);
  assert.deepEqual(createWeatherCycle(1,()=>0).advance(0),{fog:false,rain:false});
});
