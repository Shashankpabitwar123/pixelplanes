import assert from 'node:assert/strict';
import test from 'node:test';
import { createMusicPlayer } from './music.js';
const song = (id) => ({ id, src: `/assets/music/${id}.mp3` });
function setup() {
  const changes = [];
  const audio = { paused: true, plays: 0, play() { this.paused = false; this.plays++; return Promise.resolve(); }, pause() { this.paused = true; } };
  const player = createMusicPlayer({ createAudio: () => audio, onChange: (id) => changes.push(id) });
  return { player, audio, changes };
}
test('default starts once at 20%, loops, and does not override a deliberate stop', async () => {
  const { player, audio, changes } = setup();
  await player.startDefault(song(15));
  assert.equal(audio.src, song(15).src);
  assert.equal(audio.volume, 0.2);
  assert.equal(audio.loop, true);
  await player.startDefault(song(15));
  assert.equal(audio.plays, 1);
  player.toggle(song(15));
  await player.startDefault(song(15));
  assert.equal(audio.paused, true);
  assert.deepEqual(changes, [15, null]);
});
test('manual choice survives game start; volume and looping apply to later songs', async () => {
  const { player, audio, changes } = setup();
  player.setVolume(0.37);
  await player.toggle(song(10));
  await player.startDefault(song(15));
  assert.equal(audio.src, song(10).src);
  await player.toggle(song(11));
  assert.equal(audio.volume, 0.37);
  assert.equal(audio.loop, true);
  assert.deepEqual(changes, [10, 11]);
  player.dispose();
  assert.equal(audio.paused, true);
  assert.equal(audio.src, '');
});
test('blocked automatic playback is not shown as playing and can retry on next start gesture', async () => {
  const { player, audio, changes } = setup();
  audio.play = () => Promise.reject(new Error('NotAllowedError'));
  await player.startDefault(song(15));
  assert.deepEqual(changes, [null]);
  audio.play = () => { audio.paused = false; return Promise.resolve(); };
  await player.startDefault(song(15));
  assert.deepEqual(changes, [null, 15]);
});
test('late playback promises cannot overwrite a more recent selection', async () => {
  const { player, audio, changes } = setup();
  let finish;
  audio.play = () => new Promise((resolve) => { finish = resolve; });
  const first = player.startDefault(song(15));
  audio.play = () => Promise.resolve();
  await player.toggle(song(10));
  finish();
  await first;
  assert.deepEqual(changes, [10]);
});
