// Small sound effects made in code with the Web Audio API: no sound files to download.
import { getMuted, setMuted } from './scores.js';

let ctx = null;
let master = null;
let muted = getMuted();
let noiseBuffer = null;

/** Browsers only allow sound after a tap or key press, so call this from one. */
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  setMuted(muted);
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}

function ready() {
  return ctx && !muted && ctx.state === 'running';
}

// One note: an oscillator through a gain envelope, optionally sliding in pitch.
function tone({ type = 'sine', from, to = from, start = 0, dur = 0.15, vol = 0.3, filter }) {
  const t = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let out = osc;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filter;
    osc.connect(f);
    out = f;
  }
  out.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// A burst of filtered noise, for splashes, thumps and whooshes.
function noise({ dur = 0.3, vol = 0.3, freq = 1000, q = 1, type = 'bandpass', start = 0, sweepTo }) {
  const t = ctx.currentTime + start;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  f.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(gain).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

export const sfx = {
  hop() {
    if (!ready()) return;
    tone({ type: 'sine', from: 320, to: 620, dur: 0.11, vol: 0.18 });
  },
  bump() {
    if (!ready()) return;
    tone({ type: 'triangle', from: 160, to: 90, dur: 0.1, vol: 0.2 });
  },
  coin(gold = false) {
    if (!ready()) return;
    tone({ type: 'triangle', from: gold ? 1320 : 988, dur: 0.08, vol: 0.2 });
    tone({ type: 'triangle', from: gold ? 1760 : 1319, start: 0.07, dur: gold ? 0.3 : 0.18, vol: 0.2 });
  },
  horn(pan = 0) {
    if (!ready()) return;
    // a danfo horn: two buzzy notes a little apart
    tone({ type: 'square', from: 370, dur: 0.32, vol: 0.06 * (1 - Math.abs(pan) * 0.5), filter: 1400 });
    tone({ type: 'square', from: 466, dur: 0.32, vol: 0.05 * (1 - Math.abs(pan) * 0.5), filter: 1400 });
  },
  splash() {
    if (!ready()) return;
    noise({ dur: 0.6, vol: 0.5, freq: 1800, q: 0.6, sweepTo: 300 });
    tone({ type: 'sine', from: 500, to: 120, dur: 0.25, vol: 0.2 });
  },
  hit() {
    if (!ready()) return;
    noise({ dur: 0.25, vol: 0.6, freq: 300, q: 0.8, type: 'lowpass' });
    tone({ type: 'sawtooth', from: 220, to: 60, dur: 0.35, vol: 0.15, filter: 800 });
  },
  bell() {
    if (!ready()) return;
    for (let i = 0; i < 4; i++) tone({ type: 'triangle', from: 1568, start: i * 0.2, dur: 0.16, vol: 0.12 });
  },
  train() {
    if (!ready()) return;
    noise({ dur: 1.4, vol: 0.35, freq: 400, q: 0.5, sweepTo: 1200 });
    tone({ type: 'sawtooth', from: 196, dur: 0.5, vol: 0.05, filter: 900 });
    tone({ type: 'sawtooth', from: 247, dur: 0.5, vol: 0.05, filter: 900 });
  },
  caught() {
    if (!ready()) return;
    tone({ type: 'square', from: 523, to: 262, dur: 0.5, vol: 0.08, filter: 1800 });
  },
  start() {
    if (!ready()) return;
    [523, 659, 784].forEach((f, i) => tone({ type: 'triangle', from: f, start: i * 0.08, dur: 0.14, vol: 0.18 }));
  },
  best() {
    if (!ready()) return;
    [659, 784, 988, 1319].forEach((f, i) => tone({ type: 'triangle', from: f, start: i * 0.1, dur: 0.2, vol: 0.18 }));
  },
};
