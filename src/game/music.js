export const DEFAULT_MUSIC_VOLUME = 0.2;
export const DEFAULT_MUSIC_TRACK_ID = 15;

export function createMusicPlayer({ createAudio = () => new Audio(), onChange = () => {} } = {}) {
  let audio = null;
  let volume = DEFAULT_MUSIC_VOLUME;
  let duck = 1;
  let muted = false;
  let duckTimer = null;
  const applyVolume = () => { if (audio) audio.volume = muted ? 0 : volume * duck; };
  let chosen = false;
  let currentTrackId = null;
  let request = 0;

  const play = (track, automatic = false) => {
    audio ??= createAudio();
    audio.loop = true;
    audio.volume = muted ? 0 : volume * duck;
    if (currentTrackId !== track.id) audio.src = track.src;
    currentTrackId = track.id;
    const attempt = ++request;
    return audio.play().then(() => {
      if (attempt === request) onChange(track.id);
    }).catch(() => {
      if (attempt !== request) return;
      onChange(null);
      // A browser may block playback without a user gesture. Retry on a later
      // game-start gesture, but never override a deliberate selection or stop.
      if (automatic) chosen = false;
    });
  };

  return {
    startDefault(track) {
      if (chosen || !track) return;
      chosen = true;
      return play(track, true);
    },
    toggle(track) {
      chosen = true;
      if (audio && currentTrackId === track.id && !audio.paused) {
        ++request;
        audio.pause();
        onChange(null);
        return;
      }
      return play(track);
    },
    setMuted(value) {
      muted = Boolean(value);
      applyVolume();
    },
    setVolume(value) {
      volume = Math.min(1, Math.max(0, value));
      if (audio) audio.volume = muted ? 0 : volume * duck;
    },
    setDucked(active, duration = active ? 180 : 600) {
      clearInterval(duckTimer);
      const target = active ? 0.3 : 1;
      if (duration <= 0) { duck = target; applyVolume(); return; }
      const start = duck, started = Date.now();
      duckTimer = setInterval(() => {
        const t = Math.min(1, (Date.now() - started) / duration);
        duck = start + (target - start) * t; applyVolume();
        if (t === 1) { clearInterval(duckTimer); duckTimer = null; }
      }, 30);
    },
    dispose() {
      clearInterval(duckTimer);
      ++request;
      audio?.pause();
      if (audio) audio.src = '';
      audio = null;
    },
  };
}
