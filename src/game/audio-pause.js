// All gameplay Web Audio contexts share the same pause state, including
// long-running rotors and effects that were already playing when paused.
const contexts = new Set();
let paused = false;
function sync(context) {
  if (context.state === 'closed') { contexts.delete(context); return; }
  const operation = paused ? context.suspend?.() : context.resume?.();
  operation?.catch?.(() => {});
}
export function resumeGameAudio(context) {
  if (!context) return;
  contexts.add(context);
  for (const item of contexts) if (item.state === 'closed') contexts.delete(item);
  sync(context);
  return context;
}
export function setGameAudioPaused(value) {
  paused = Boolean(value);
  for (const context of contexts) sync(context);
}
