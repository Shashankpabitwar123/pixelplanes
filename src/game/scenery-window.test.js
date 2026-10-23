import test from 'node:test';
import assert from 'node:assert/strict';
import { sceneryWindow, treeWorldX, createSceneryCamera } from './scenery-window.js';

test('camera windows cover every visible tree including forest offset and overhang', () => {
  for (const width of [375, 780, 1440, 2560]) {
    for (let camera = 0; camera <= 600; camera += 1) {
      const window = sceneryWindow({x:camera,y:0},false);
      for (let index=0;index<980;index++) {
        const x=treeWorldX(index,700);
        const halfWidth=40/width*100;
        // Forest starts at -2% of the 700vw world, or -14vw.
        if(x-14+halfWidth>=camera && x-14-halfWidth<=camera+100) {
          assert.ok(x>=window.left && x<=window.right, `${width}px camera ${camera}, tree ${index}`);
        }
      }
    }
  }
});
test('star windows cover the entire viewport across tile boundaries and map edges',()=>{
  for(let x=0;x<=600;x++) for(let y=0;y<=300;y+=17){
    const window=sceneryWindow({x,y});
    assert.ok(window.left<=x && window.right>=x+100);
    assert.ok(window.bottom<=y && window.top>=y+100);
  }
});
test('forest windows ignore altitude and stay stable within a tile',()=>{
  assert.deepEqual(sceneryWindow({x:300,y:0},false),sceneryWindow({x:349.99,y:299},false));
  assert.notDeepEqual(sceneryWindow({x:350,y:0},false),sceneryWindow({x:349.99,y:0},false));
});

test('camera jumps publish synchronously, without notifying on every flight frame', () => {
  const camera = createSceneryCamera({x:300,y:0});
  const seen = [];
  const unsubscribe = camera.subscribe(() => seen.push(camera.getSnapshot()));
  const initial = camera.getSnapshot();
  camera.set({x:320,y:10});
  assert.equal(camera.getSnapshot(), initial);
  assert.equal(seen.length, 0);
  camera.set({x:20,y:220});
  assert.equal(seen.length, 1);
  assert.equal(seen[0].x, 0);
  assert.equal(seen[0].y, 200);
  camera.set({x:300,y:0});
  assert.equal(seen.length, 2);
  unsubscribe();
  camera.set({x:500,y:0});
  assert.equal(seen.length, 2);
});
