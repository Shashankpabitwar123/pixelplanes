import React, { memo, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { WORLD_WIDTH } from './config.js';
import { stars } from './world.js';
import { treeWorldX } from './scenery-window.js';

function useSceneryWindow(cameraRef) {
  const camera = cameraRef.current;
  return useSyncExternalStore(camera.subscribe, camera.getSnapshot);
}

export const ForestLayer = memo(function ForestLayer({ className, rows, cameraRef }) {
  const window = useSceneryWindow(cameraRef);
  const depth = className.includes('front') ? 'front' : 'back';
  return <div className={className} aria-hidden="true">
    {Array.from({ length: rows }, (_, index) => index)
      .filter(index => {
        const x = treeWorldX(index, WORLD_WIDTH);
        return x >= window.left && x <= window.right;
      })
      .map(index => <Pine key={index} index={index} depth={depth} />)}
  </div>;
});

export function Pine({ index, depth, style, className = '' }) {
  const left = treeWorldX(index, WORLD_WIDTH);
  const sizeNoise = ((index * 23) % 100) / 100;
  const height = depth === 'front' ? 94 + sizeNoise * 82 : 72 + sizeNoise * 60;
  const width = depth === 'front' ? 54 + sizeNoise * 26 : 44 + sizeNoise * 18;
  return <svg className={`pine${className ? ` ${className}` : ''}`} style={{ left: `${left}vw`, width: `${width}px`, height: `${height}px`, ...style }} viewBox="0 0 70 160">
    <path d="M35 2 13 48h14L8 84h18L3 126h26v30h12v-30h26L44 84h18L43 48h14L35 2z" />
  </svg>;
}

function syncTwinkle(animation, clock) {
  if (!animation) return;
  if (clock.paused) {
    animation.pause();
    animation.currentTime = clock.elapsed;
  } else {
    animation.play();
    animation.startTime = clock.origin;
  }
}

const Star = memo(function Star({ star, clock }) {
  const element = useRef(null);
  useLayoutEffect(() => {
    // All stars share one animation clock, while their original individual
    // CSS delays remain intact. Returning stars never restart their twinkle.
    syncTwinkle(element.current?.getAnimations()[0], clock.current);
  }, [clock]);
  return <i ref={element} style={{ left: `${star.x}vw`, bottom: `${star.y}vh`, width: `${star.size}px`, height: `${star.size}px`, animationDelay: star.delay }} />;
});

export const WorldStars = memo(function WorldStars({ cameraRef, paused }) {
  const window = useSceneryWindow(cameraRef);
  const element = useRef(null);
  const clock = useRef(null);
  if (!clock.current) clock.current = { origin: document.timeline.currentTime ?? performance.now(), elapsed: 0, paused };
  useLayoutEffect(() => {
    const now = document.timeline.currentTime ?? performance.now();
    if (paused && !clock.current.paused) clock.current.elapsed = now - clock.current.origin;
    if (!paused && clock.current.paused) clock.current.origin = now - clock.current.elapsed;
    clock.current.paused = paused;
    for (const animation of element.current.getAnimations({ subtree: true })) {
      if (animation.animationName === 'twinkle') syncTwinkle(animation, clock.current);
    }
  }, [paused]);
  return <div ref={element} className="stars world-stars" aria-hidden="true">
    {stars.filter(star => star.x >= window.left && star.x <= window.right && star.y >= window.bottom && star.y <= window.top)
      .map(star => <Star key={star.id} star={star} clock={clock} />)}
  </div>;
});
