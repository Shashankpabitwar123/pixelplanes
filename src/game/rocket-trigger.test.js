import test from 'node:test';
import assert from 'node:assert/strict';
import {createRocketTrigger} from './rocket-trigger.js';
test('tap and held R each fire once on release, never on repeat',()=>{
  const trigger=createRocketTrigger();
  assert.equal(trigger.held,false);
  trigger.press(true);
  assert.equal(trigger.held,true);
  trigger.press(true,true);
  assert.equal(trigger.release(true),true);
  assert.equal(trigger.held,false);
  assert.equal(trigger.release(true),false);
  trigger.press(true);
  assert.equal(trigger.release(true),true);
});
test('pause, crash, restart and focus loss cancel pending fire',()=>{
  const trigger=createRocketTrigger();
  trigger.press(true); trigger.cancel();
  trigger.press(true,true);
  assert.equal(trigger.held,false);
  assert.equal(trigger.release(true),false);
  trigger.press(false);
  assert.equal(trigger.release(true),false);
  trigger.press(true);
  assert.equal(trigger.release(false),false);
  assert.equal(trigger.held,false);
});
