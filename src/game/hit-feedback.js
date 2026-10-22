const flashes = new WeakMap();
export function flashPlaneHit(element) {
  if (!element) return;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  element.querySelectorAll('.plane-sprite').forEach(sprite => {
    flashes.get(sprite)?.cancel();
    const original = getComputedStyle(sprite).filter;
    const flash = reduced ? `${original === 'none' ? '' : original} brightness(1.5)` : 'brightness(0) invert(1)';
    const animation = sprite.animate([
      {filter:flash,offset:0}, {filter:flash,offset:0.3}, {filter:original,offset:1},
    ], {duration:120,easing:'ease-out'});
    flashes.set(sprite,animation);
  });
}
