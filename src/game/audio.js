import { clamp } from './mechanics.js';

export function createRainAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  const context = new AudioContextClass();
  context.resume?.();
  const duration = 2.4;
  const bufferLength = Math.floor(context.sampleRate * duration);
  const buffer = context.createBuffer(1, bufferLength, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < bufferLength; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }

  const source = context.createBufferSource();
  const highpass = context.createBiquadFilter();
  const lowpass = context.createBiquadFilter();
  const textureFilter = context.createBiquadFilter();
  const master = context.createGain();

  source.buffer = buffer;
  source.loop = true;
  highpass.type = 'highpass';
  highpass.frequency.value = 420;
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 3600;
  textureFilter.type = 'peaking';
  textureFilter.frequency.value = 1450;
  textureFilter.Q.value = 0.72;
  textureFilter.gain.value = 2.1;
  master.gain.value = 0.0001;

  source.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(textureFilter);
  textureFilter.connect(master);
  master.connect(context.destination);
  source.start();
  let stopped = false;

  return {
    context,
    gain: master.gain,
    stop: () => {
      if (stopped) return;
      stopped = true;
      const t = context.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), t);
      master.gain.exponentialRampToValueAtTime(0.0001, t + 0.52);
      try {
        source.stop(t + 0.58);
      } catch {
        // The rain source may already be stopped during rapid weather toggles.
      }
      window.setTimeout(() => {
        master.disconnect();
        textureFilter.disconnect();
        lowpass.disconnect();
        highpass.disconnect();
        context.close?.();
      }, 700);
    },
  };
}

export function playPlaneBulletHitSound(existingContext = null, muted = false) {
  if (muted) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const context = existingContext && existingContext.state !== 'closed' ? existingContext : AudioContextClass ? new AudioContextClass() : null;
  if (!context) return;
  context.resume?.();

  const t = context.currentTime;
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-11, t);
  limiter.knee.setValueAtTime(10, t);
  limiter.ratio.setValueAtTime(7, t);
  limiter.attack.setValueAtTime(0.002, t);
  limiter.release.setValueAtTime(0.12, t);
  limiter.connect(context.destination);

  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, t);
  master.gain.exponentialRampToValueAtTime(1.45, t + 0.006);
  master.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
  master.connect(limiter);

  const makeNoise = (seconds, power = 2.4) => {
    const bufferLength = Math.floor(context.sampleRate * seconds);
    const buffer = context.createBuffer(1, bufferLength, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < bufferLength; index += 1) {
      const fade = 1 - index / bufferLength;
      data[index] = (Math.random() * 2 - 1) * Math.pow(fade, power);
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    return source;
  };

  const metalPing = context.createOscillator();
  const pingGain = context.createGain();
  const pingFilter = context.createBiquadFilter();
  metalPing.type = 'triangle';
  metalPing.frequency.setValueAtTime(980, t);
  metalPing.frequency.exponentialRampToValueAtTime(420, t + 0.1);
  pingFilter.type = 'bandpass';
  pingFilter.frequency.setValueAtTime(1240, t);
  pingFilter.Q.value = 4.4;
  pingGain.gain.setValueAtTime(0.32, t);
  pingGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  metalPing.connect(pingFilter);
  pingFilter.connect(pingGain);
  pingGain.connect(master);

  const punch = context.createOscillator();
  const punchGain = context.createGain();
  const punchFilter = context.createBiquadFilter();
  punch.type = 'sawtooth';
  punch.frequency.setValueAtTime(210, t);
  punch.frequency.exponentialRampToValueAtTime(54, t + 0.14);
  punchFilter.type = 'lowpass';
  punchFilter.frequency.setValueAtTime(740, t);
  punchFilter.frequency.exponentialRampToValueAtTime(130, t + 0.16);
  punchGain.gain.setValueAtTime(0.82, t);
  punchGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  punch.connect(punchFilter);
  punchFilter.connect(punchGain);
  punchGain.connect(master);

  const grit = makeNoise(0.16, 2.9);
  const gritFilter = context.createBiquadFilter();
  const gritGain = context.createGain();
  gritFilter.type = 'bandpass';
  gritFilter.frequency.setValueAtTime(2100, t);
  gritFilter.frequency.exponentialRampToValueAtTime(760, t + 0.09);
  gritFilter.Q.value = 1.3;
  gritGain.gain.setValueAtTime(1.05, t);
  gritGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  grit.connect(gritFilter);
  gritFilter.connect(gritGain);
  gritGain.connect(master);

  metalPing.start(t);
  punch.start(t);
  grit.start(t);
  metalPing.stop(t + 0.2);
  punch.stop(t + 0.13);
  grit.stop(t + 0.2);

  window.setTimeout(() => {
    master.disconnect();
    limiter.disconnect();
    if (context !== existingContext) context.close?.();
  }, 430);
}

export function playPlaneBlastSound(existingContext = null, impact = 1, muted = false, volume = 1) {
  const level = clamp(volume, 0, 1);
  if (muted || level <= 0) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const context = existingContext && existingContext.state !== 'closed' ? existingContext : AudioContextClass ? new AudioContextClass() : null;
  if (!context) return;
  context.resume?.();

  const t = context.currentTime;
  const amount = clamp(impact, 0.75, 1.8);
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-9, t);
  limiter.knee.setValueAtTime(16, t);
  limiter.ratio.setValueAtTime(8, t);
  limiter.attack.setValueAtTime(0.003, t);
  limiter.release.setValueAtTime(0.22, t);
  limiter.connect(context.destination);

  const distortion = context.createWaveShaper();
  const curve = new Float32Array(384);
  for (let index = 0; index < curve.length; index += 1) {
    const x = (index * 2) / (curve.length - 1) - 1;
    curve[index] = Math.tanh(x * 4.2);
  }
  distortion.curve = curve;
  distortion.oversample = '4x';
  distortion.connect(limiter);

  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, t);
  master.gain.exponentialRampToValueAtTime(1.32 * amount * level, t + 0.012);
  master.gain.exponentialRampToValueAtTime(0.0001, t + 1.06);
  master.connect(distortion);

  const makeNoise = (seconds, power = 2.2) => {
    const bufferLength = Math.floor(context.sampleRate * seconds);
    const buffer = context.createBuffer(1, bufferLength, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < bufferLength; index += 1) {
      const fade = 1 - index / bufferLength;
      data[index] = (Math.random() * 2 - 1) * Math.pow(fade, power);
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    return source;
  };

  const boom = context.createOscillator();
  const boomGain = context.createGain();
  const boomFilter = context.createBiquadFilter();
  boom.type = 'triangle';
  boom.frequency.setValueAtTime(96 * amount, t);
  boom.frequency.exponentialRampToValueAtTime(26, t + 0.48);
  boomFilter.type = 'lowpass';
  boomFilter.frequency.setValueAtTime(520, t);
  boomFilter.frequency.exponentialRampToValueAtTime(96, t + 0.54);
  boomGain.gain.setValueAtTime(1.1, t);
  boomGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.58);
  boom.connect(boomFilter);
  boomFilter.connect(boomGain);
  boomGain.connect(master);

  const crack = makeNoise(0.2, 4.1);
  const crackFilter = context.createBiquadFilter();
  const crackGain = context.createGain();
  crackFilter.type = 'bandpass';
  crackFilter.frequency.setValueAtTime(2400, t);
  crackFilter.frequency.exponentialRampToValueAtTime(640, t + 0.16);
  crackFilter.Q.value = 1.7;
  crackGain.gain.setValueAtTime(1.35, t);
  crackGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
  crack.connect(crackFilter);
  crackFilter.connect(crackGain);
  crackGain.connect(master);

  const rumble = makeNoise(0.78, 1.7);
  const rumbleFilter = context.createBiquadFilter();
  const rumbleGain = context.createGain();
  rumbleFilter.type = 'lowpass';
  rumbleFilter.frequency.setValueAtTime(820, t + 0.04);
  rumbleFilter.frequency.exponentialRampToValueAtTime(135, t + 0.82);
  rumbleGain.gain.setValueAtTime(0.72, t + 0.04);
  rumbleGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
  rumble.connect(rumbleFilter);
  rumbleFilter.connect(rumbleGain);
  rumbleGain.connect(master);

  const metalFrequencies = [840, 1320, 1960];
  const metalNodes = metalFrequencies.map((frequency, index) => {
    const clang = context.createOscillator();
    const clangGain = context.createGain();
    clang.type = index % 2 ? 'square' : 'sawtooth';
    clang.frequency.setValueAtTime(frequency * amount, t + 0.008 * index);
    clang.frequency.exponentialRampToValueAtTime(frequency * 0.36, t + 0.24 + index * 0.03);
    clangGain.gain.setValueAtTime(0.22 / (index + 1), t + 0.008 * index);
    clangGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28 + index * 0.04);
    clang.connect(clangGain);
    clangGain.connect(master);
    return clang;
  });

  boom.start(t);
  crack.start(t);
  rumble.start(t + 0.04);
  metalNodes.forEach((node, index) => {
    node.start(t + 0.008 * index);
    node.stop(t + 0.32 + index * 0.04);
  });
  boom.stop(t + 0.62);
  crack.stop(t + 0.22);
  rumble.stop(t + 0.94);

  window.setTimeout(() => {
    master.disconnect();
    distortion.disconnect();
    limiter.disconnect();
    if (context !== existingContext) context.close?.();
  }, 1180);
}
