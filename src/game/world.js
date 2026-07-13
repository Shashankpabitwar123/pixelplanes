import { WORLD_HEIGHT, WORLD_WIDTH } from './config.js';

export function seededRandom(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

export const clouds = Array.from({ length: 56 }, (_, index) => ({
  x: 4 + index * (WORLD_WIDTH - 10) / 56 + (seededRandom(index + 11) - 0.5) * 9,
  y: 34 + seededRandom(index + 101) * 260,
  s: 0.72 + seededRandom(index + 211) * 0.62,
  speed: 86 + Math.floor(seededRandom(index + 307) * 44),
  variant: Math.floor(seededRandom(index + 409) * 3),
})).sort((a, b) => a.x - b.x);

export const fogBanks = Array.from({ length: 68 }, (_, index) => ({
  x: 2 + index * (WORLD_WIDTH - 4) / 68 + (seededRandom(index + 801) - 0.5) * 8,
  y: 9 + seededRandom(index + 1801) * 145,
  s: 0.75 + seededRandom(index + 2801) * 1.2,
  opacity: 0.28 + seededRandom(index + 3801) * 0.36,
  speed: 10 + seededRandom(index + 4801) * 12,
  delay: `${-(seededRandom(index + 5801) * 9).toFixed(2)}s`,
})).sort((a, b) => a.x - b.x);

export const rainDrops = Array.from({ length: 150 }, (_, index) => ({
  id: index,
  left: seededRandom(index + 6101) * 100,
  top: seededRandom(index + 7101) * 108 - 8,
  length: 14 + seededRandom(index + 8101) * 26,
  opacity: 0.28 + seededRandom(index + 9101) * 0.44,
  duration: 420 + seededRandom(index + 10101) * 340,
  delay: `${-(seededRandom(index + 11101) * 1.2).toFixed(2)}s`,
}));

export const stars = Array.from({ length: 720 }, (_, index) => ({
  id: index,
  x: 3 + seededRandom(index + 701) * (WORLD_WIDTH - 6),
  y: 52 + seededRandom(index + 1701) * (WORLD_HEIGHT - 68),
  size: 0.8 + seededRandom(index + 2701) * 1.35,
  delay: `${-(seededRandom(index + 3701) * 4).toFixed(2)}s`,
}));

export const cows = [
  { delay: -1.8, duration: 44, graze: 'early' },
  { delay: -1.1, duration: 49, graze: 'late' },
  { delay: -0.4, duration: 55 },
  { delay: -23.5, duration: 62, graze: 'mid' },
  { delay: -42, duration: 52, graze: 'late' },
  { delay: -41.2, duration: 59, graze: 'early' },
  { delay: -59, duration: 64 },
  { delay: -68, duration: 58 },
  { delay: -78, duration: 61, graze: 'mid' },
  { delay: -79, duration: 63 },
];

const grassPlants = [
  { x: 4.8, s: 0.95 },
  { x: 5.7, s: 0.64 },
  { x: 16.3, s: 0.74 },
  { x: 16.9, s: 0.48 },
  { x: 22.4, s: 0.5 },
  { x: 36.2, s: 0.42 },
  { x: 50.2, s: 0.92 },
  { x: 50.8, s: 0.56 },
  { x: 51.4, s: 0.38 },
  { x: 63.1, s: 0.46 },
  { x: 76.2, s: 0.82 },
  { x: 76.8, s: 0.5 },
  { x: 96.7, s: 0.9 },
  { x: 97.4, s: 0.44 },
];

const grassPlantOffsets = Array.from({ length: 13 }, (_, index) => index * 55);

export const mapGrassPlants = grassPlantOffsets.flatMap((offset) =>
  grassPlants
    .map((plant) => ({ ...plant, x: plant.x + offset }))
    .filter((plant) => plant.x < WORLD_WIDTH - 4),
);

export const cowOffsets = Array.from({ length: 18 }, (_, index) => index * 34);

export const hutPlacements = Array.from({ length: 20 }, (_, index) => ({
  x: 28 + index * 34 + (index % 3) * 4,
  variant: ['low', 'small', 'tall', 'small', 'low'][index % 5],
}));

export const hayPlacements = Array.from({ length: 14 }, (_, index) => ({
  x: 18 + index * 49 + (index % 2) * 8,
  type: index % 2 === 0 ? 'bale' : 'roll',
  width: 4,
}));

export const fuelTankPlacements = [52, 148, 286, 394, 520, 650];

export const fuelStationZones = fuelTankPlacements.map((x) => ({ x: x - 0.4, width: 4.8, height: 9.2 }));

export const hayObstacles = hayPlacements.map(({ x, type }) => ({ x, type }));
