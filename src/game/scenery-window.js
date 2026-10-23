// World coordinates use viewport widths/heights. Keep a full tile outside the
// view so camera movement, tree overhang and shadows cannot reveal a seam.
export const SCENERY_TILE_SIZE = 50;
export function sceneryWindow(camera, vertical = true) {
  const x = Math.floor(camera.x / SCENERY_TILE_SIZE) * SCENERY_TILE_SIZE;
  const y = vertical ? Math.floor(camera.y / SCENERY_TILE_SIZE) * SCENERY_TILE_SIZE : 0;
  return { x, y, left: x - 50, right: x + 200, bottom: y - 50, top: y + 200 };
}
export function treeWorldX(index, worldWidth) {
  return (index * 0.72 + (index % 7) * 0.22 + (index % 3) * 0.16) % worldWidth;
}

// Publish only tile changes. Synchronous external-store subscriptions also
// cover instant camera jumps on respawn/restart, without a frame of empty sky.
export function createSceneryCamera(camera) {
  let snapshot = sceneryWindow(camera);
  const listeners = new Set();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    set(camera) {
      const next = sceneryWindow(camera);
      if (next.x === snapshot.x && next.y === snapshot.y) return;
      snapshot = next;
      listeners.forEach(listener => listener());
    },
  };
}
