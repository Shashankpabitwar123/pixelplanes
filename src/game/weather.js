export const WEATHER_LABELS = ['Clear', 'Normal', 'Harsh'];
export const WEATHER_PROFILES = [
  null,
  { fog: { first: [4500,11000], on: [13000,22000], off: [22000,50000] }, rain: { first: [15000,32000], on: [14000,25000], off: [36000,88000] } },
  { fog: { first: [1100,2900], on: [18000,27000], off: [5000,12000] }, rain: { first: [2200,5800], on: [24000,36000], off: [7000,17000] } },
];
// A simulation clock, not wall-clock time: callers advance only during play.
export function createWeatherCycle(mode, random = Math.random) {
  const profile = WEATHER_PROFILES[mode] ?? null;
  const pick = range => range[0] + random() * (range[1] - range[0]);
  const effects = Object.fromEntries(['fog','rain'].map(key => [key, { active: false, remaining: profile ? pick(profile[key].first) : Infinity }]));
  return {
    advance(ms) {
      for (const key of ['fog','rain']) {
        const effect = effects[key]; effect.remaining -= Math.max(0, ms);
        while (effect.remaining <= 0 && profile) {
          effect.active = !effect.active;
          effect.remaining += pick(profile[key][effect.active ? 'on' : 'off']);
        }
      }
      return { fog: effects.fog.active, rain: effects.rain.active };
    },
  };
}
