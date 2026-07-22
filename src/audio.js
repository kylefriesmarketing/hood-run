/* HOOD RUN — audio.js
   All-synth WebAudio: layered upbeat street track + pooled SFX.
   Layers: 1 kick/bass (always) · 2 hats/chords (speed) · 3 melody chops (Block Party). */

const A = {
  ctx: null, master: null, musicBus: null, sfxBus: null,
  beatOn: false, next: 0, step: 0, timer: null,
  layer2: 0, layer3: 0,          // 0..1 target mix
  musicVol: 0.7, sfxVol: 0.8,
};

export function audioInit() {
  if (A.ctx) return;
  A.ctx = new (window.AudioContext || window.webkitAudioContext)();
  A.master = A.ctx.createGain(); A.master.gain.value = 1; A.master.connect(A.ctx.destination);
  A.musicBus = A.ctx.createGain(); A.musicBus.gain.value = A.musicVol * 0.55; A.musicBus.connect(A.master);
  A.sfxBus = A.ctx.createGain(); A.sfxBus.gain.value = A.sfxVol * 0.6; A.sfxBus.connect(A.master);
  A.timer = setInterval(beatTick, 25);
}
export function audioResume() { if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume(); }
export function setVolumes(music, sfx) {
  A.musicVol = music; A.sfxVol = sfx;
  if (A.musicBus) A.musicBus.gain.value = music * 0.55;
  if (A.sfxBus) A.sfxBus.gain.value = sfx * 0.6;
}
export function musicStart() { A.beatOn = true; if (A.ctx) { A.next = A.ctx.currentTime + 0.05; } }
export function musicStop() { A.beatOn = false; }
export function musicLayers(l2, l3) { A.layer2 = l2; A.layer3 = l3; }

/* duck the music under important warnings so cues cut through (bible §13) */
export function duck(amount = 0.45, hold = 0.18, release = 0.35) {
  if (!A.musicBus || !A.ctx) return;
  const g = A.musicBus.gain, t = A.ctx.currentTime, full = A.musicVol * 0.55;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(full * (1 - amount), t + 0.05);
  g.setValueAtTime(full * (1 - amount), t + 0.05 + hold);
  g.linearRampToValueAtTime(full, t + 0.05 + hold + release);
}

const BPM = 96, STEP = 60 / BPM / 4;
const KICK  = [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,0,0];
const SNARE = [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1];
const HAT   = [1,0,1,1, 1,0,1,0, 1,1,0,1, 1,0,1,0];
const BASSN = [65.4,0,0,65.4, 0,0,73.4,0, 82.4,0,0,65.4, 0,98,0,87.3];
const CHORDS = [[261.6,329.6,392,493.9],[293.7,349.2,440,523.3]];
const MELODY = [523.3,0,587.3,659.3, 0,784,0,659.3, 587.3,0,523.3,0, 659.3,0,587.3,0];

function beatTick() {
  if (!A.beatOn || !A.ctx) return;
  const t = A.ctx.currentTime;
  while (A.next < t + 0.12) { scheduleStep(A.step, A.next); A.next += STEP; A.step = (A.step + 1) % 32; }
}
function scheduleStep(step, t) {
  const s = step % 16, c = A.ctx;
  if (KICK[s]) { const o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(52, t + 0.12);
    g.gain.setValueAtTime(0.8, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g); g.connect(A.musicBus); o.start(t); o.stop(t + 0.24); }
  if (SNARE[s]) { noiseTo(A.musicBus, t, 0.14, 2000, 'bandpass', 0.32); }
  const bn = BASSN[s];
  if (bn) { const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = 'square'; o.frequency.value = bn; f.type = 'lowpass'; f.frequency.value = 460;
    g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    o.connect(f); f.connect(g); g.connect(A.musicBus); o.start(t); o.stop(t + 0.3); }
  // layer 2: hats + chords
  if (A.layer2 > 0.05) {
    if (HAT[s]) noiseTo(A.musicBus, t, s % 4 === 3 ? 0.1 : 0.04, 8500, 'highpass', 0.12 * A.layer2);
    if (step === 0 || step === 16) {
      for (const n of CHORDS[(step / 16) | 0]) {
        const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
        o.type = 'triangle'; o.frequency.value = n; f.type = 'lowpass'; f.frequency.value = 1300;
        g.gain.setValueAtTime(0.05 * A.layer2, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
        o.connect(f); f.connect(g); g.connect(A.musicBus); o.start(t); o.stop(t + 1.5);
      }
    }
  }
  // layer 3: melody chops (Block Party)
  if (A.layer3 > 0.05) {
    const m = MELODY[s];
    if (m) { const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
      o.type = 'square'; o.frequency.value = m; f.type = 'lowpass'; f.frequency.value = 2400;
      g.gain.setValueAtTime(0.09 * A.layer3, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.connect(f); f.connect(g); g.connect(A.musicBus); o.start(t); o.stop(t + 0.18); }
  }
}
function noiseTo(bus, t, dur, freq, type, vol) {
  const c = A.ctx, len = Math.max(16, c.sampleRate * dur), b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(); src.buffer = b;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(bus); src.start(t); src.stop(t + dur);
}
function blip(freq, dur, type = 'sine', vol = 0.3, slide = 0) {
  if (!A.ctx) return; const c = A.ctx, t = c.currentTime;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(A.sfxBus); o.start(t); o.stop(t + dur + 0.02);
}

let coinVoices = 0;      // limit simultaneous coin pings
export const sfx = {
  jump() { blip(330, 0.16, 'sine', 0.22, 240); if (A.ctx) noiseTo(A.sfxBus, A.ctx.currentTime, 0.08, 3200, 'highpass', 0.05); },
  land() { if (A.ctx) noiseTo(A.sfxBus, A.ctx.currentTime, 0.07, 900, 'lowpass', 0.12); },
  lane() { if (A.ctx) noiseTo(A.sfxBus, A.ctx.currentTime, 0.06, 2600, 'bandpass', 0.08); },
  slide() { if (A.ctx) noiseTo(A.sfxBus, A.ctx.currentTime, 0.2, 1300, 'bandpass', 0.14); },
  turn() { if (A.ctx) noiseTo(A.sfxBus, A.ctx.currentTime, 0.14, 2400, 'bandpass', 0.11); },
  coin(n) { if (coinVoices > 4) return; coinVoices++; setTimeout(() => coinVoices--, 90);
    blip(700 * Math.pow(1.059, Math.min(n, 14)), 0.12, 'square', 0.12, 90); },
  token() { [660, 880, 1100].forEach((f, i) => setTimeout(() => blip(f, 0.14, 'triangle', 0.16), i * 60)); },
  letter() { blip(880, 0.2, 'triangle', 0.18, 160); },
  hood() { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => blip(f, 0.18, 'square', 0.15), i * 80)); },
  pow() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.15, 'square', 0.15), i * 65)); },
  shieldSave() { duck(0.55, 0.25, 0.45); blip(392, 0.3, 'triangle', 0.3, 200); blip(784, 0.4, 'sine', 0.2, 100); },
  stumble() { blip(150, 0.18, 'sine', 0.38, -70); if (A.ctx) noiseTo(A.sfxBus, A.ctx.currentTime, 0.12, 900, 'lowpass', 0.26); },
  crash() { blip(95, 0.45, 'sine', 0.5, -50); if (A.ctx) noiseTo(A.sfxBus, A.ctx.currentTime, 0.35, 650, 'lowpass', 0.45); },
  splash() { if (A.ctx) noiseTo(A.sfxBus, A.ctx.currentTime, 0.22, 1600, 'bandpass', 0.2); },
  bell() { duck(0.4, 0.15, 0.3); blip(1320, 0.3, 'triangle', 0.22, -60); setTimeout(() => blip(1320, 0.25, 'triangle', 0.16, -60), 180); },
  party() { [523, 659, 784, 880, 1046, 1318].forEach((f, i) => setTimeout(() => blip(f, 0.2, 'square', 0.14), i * 55)); },
  mission() { [784, 988, 1175].forEach((f, i) => setTimeout(() => blip(f, 0.2, 'triangle', 0.18), i * 90)); },
  highscore() { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'square', 0.13), i * 90)); },
  ui() { blip(600, 0.07, 'sine', 0.12, 60); },
  buy() { [740, 988].forEach((f, i) => setTimeout(() => blip(f, 0.12, 'triangle', 0.16), i * 70)); },
  countdown(final) { blip(final ? 880 : 440, 0.16, 'square', 0.2); },
  alarm() { // playful bank-alarm klaxon at run start
    for (let i = 0; i < 3; i++) {
      setTimeout(() => { blip(720, 0.18, 'square', 0.1, 0); }, i * 360);
      setTimeout(() => { blip(560, 0.18, 'square', 0.1, 0); }, i * 360 + 180);
    }
  },
  whistle() { blip(1450, 0.12, 'sine', 0.16, 320); setTimeout(() => blip(1450, 0.2, 'sine', 0.16, 380), 150); },
  bounce() { duck(0.35, 0.12, 0.3); blip(180, 0.14, 'sine', 0.24, 260); setTimeout(() => blip(240, 0.12, 'sine', 0.18, 200), 130); },
};
