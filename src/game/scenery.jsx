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

const Star = memo(function Star({ star, clock }) {
  const element = useRef(null);
  useLayoutEffect(() => {
    // A returning star resumes its original twinkle phase, rather than starting
    // over when the camera brings its section back into view.
    const animation = element.current?.getAnimations()[0];
    if (animation) animation.currentTime = clock.current.elapsed;
  }, [clock]);
  return <i ref={element} style={{ left: `${star.x}vw`, bottom: `${star.y}vh`, width: `${star.size}px`, height: `${star.size}px`, animationDelay: star.delay }} />;
});

export const WorldStars = memo(function WorldStars({ cameraRef, registerFrame, paused }) {
  const window = useSceneryWindow(cameraRef);
  const clock = useRef({ elapsed: 0, last: null, paused });
  useLayoutEffect(() => {
    const now = document.timeline.currentTime ?? performance.now();
    if (clock.current.last !== null && !clock.current.paused) clock.current.elapsed += now - clock.current.last;
    clock.current.last = now;
    clock.current.paused = paused;
  }, [paused]);
  useLayoutEffect(() => registerFrame(0, now => {
    if (clock.current.last !== null && !clock.current.paused) clock.current.elapsed += now - clock.current.last;
    clock.current.last = now;
  }), [registerFrame]);
  return <div className="stars world-stars" aria-hidden="true">
    {stars.filter(star => star.x >= window.left && star.x <= window.right && star.y >= window.bottom && star.y <= window.top)
      .map(star => <Star key={star.id} star={star} clock={clock} />)}
  </div>;
});
