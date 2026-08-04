/* HOOD RUN — audio.js
   All-synth WebAudio: layered upbeat street track + pooled SFX.
   Layers: 1 kick/bass (always) · 2 hats/chords (speed) · 3 melody chops (Block Party). */

const A = {
  ctx: null, master: null, musicBus: null, sfxBus: null,
  beatOn: false, next: 0, step: 0, timer: null,
  layer2: 0, layer3: 0,          // 0..1 target mix
  musicVol: 0.7, sfxVol: 0.8,
  siren: null,
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
  if (AMB.bus) AMB.bus.gain.value = sfx * 0.5;   // the city rides the sfx slider
}

/* ---- city ambience bed ----
   A quiet layer of the city itself under the music: traffic rumble, crowd
   murmur where there are crowds, a far-off horn or siren now and then.
   EVERY continuous node and every timer is tracked in AMB and torn down on
   ambientSet/ambientStop — untracked beds stack forever across district
   changes and turn into an awful drone (a lesson paid for elsewhere). */
const AMB = { bus: null, nodes: [], timers: [], kind: null };
function ambBus() {
  if (!AMB.bus && A.ctx) {
    AMB.bus = A.ctx.createGain();
    AMB.bus.gain.value = A.sfxVol * 0.5;
    AMB.bus.connect(A.master);
  }
  return AMB.bus;
}
/* endless looped noise -> filter -> gain, with a slow LFO breathing the level
   so the rumble swells and fades like passing traffic instead of hissing flat */
function ambLoop(freq, type, vol, lfoRate, lfoDepth, Q = 0.8) {
  const c = A.ctx;
  const len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
  let v = 0;
  for (let i = 0; i < len; i++) { v = v * 0.97 + (Math.random() * 2 - 1) * 0.14; d[i] = v * 3; } // brownish
  const src = c.createBufferSource(); src.buffer = b; src.loop = true;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = Q;
  const g = c.createGain(); g.gain.value = vol;
  const lfo = c.createOscillator(); lfo.frequency.value = lfoRate;
  const lg = c.createGain(); lg.gain.value = vol * lfoDepth;
  lfo.connect(lg); lg.connect(g.gain);
  src.connect(f); f.connect(g); g.connect(ambBus());
  src.start(); lfo.start();
  AMB.nodes.push(src, lfo, g, f, lg);
}
function hornDistant() {
  if (!A.ctx) return; const c = A.ctx, t = c.currentTime;
  const two = Math.random() < 0.5;                 // some drivers lean on it twice
  for (let k = 0; k < (two ? 2 : 1); k++) {
    const t0 = t + k * 0.5;
    for (const fr of [292, 365]) {                 // a slightly sour two-tone
      const o = c.createOscillator(); o.type = 'square'; o.frequency.value = fr * (1 + Math.random() * 0.02);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 520;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.028, t0 + 0.05);
      g.gain.setValueAtTime(0.028, t0 + 0.22); g.gain.linearRampToValueAtTime(0, t0 + 0.34);
      o.connect(f); f.connect(g); g.connect(ambBus()); o.start(t0); o.stop(t0 + 0.4);
    }
  }
}
function sirenDistant() {
  if (!A.ctx) return; const c = A.ctx, t = c.currentTime;
  const o = c.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(700, t);
  o.frequency.linearRampToValueAtTime(950, t + 0.8);
  o.frequency.linearRampToValueAtTime(680, t + 1.7);
  o.frequency.linearRampToValueAtTime(880, t + 2.4);
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 760;  // blocks away
  const g = c.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03, t + 0.9);
  g.gain.linearRampToValueAtTime(0, t + 2.6);
  o.connect(f); f.connect(g); g.connect(ambBus()); o.start(t); o.stop(t + 2.7);
}
export function ambientSet(kind) {
  if (!A.ctx || AMB.kind === kind) return;
  ambientStop();
  AMB.kind = kind;
  ambBus();
  // traffic rumble everywhere, weighted per district
  const rumble = { block: 0.05, market: 0.038, downtown: 0.07, nightmarket: 0.032 }[kind] ?? 0.045;
  ambLoop(230, 'lowpass', rumble, 0.07, 0.5);
  // crowd murmur where there are crowds
  if (kind === 'market' || kind === 'nightmarket')
    ambLoop(520, 'bandpass', kind === 'nightmarket' ? 0.035 : 0.024, 0.4, 0.55, 1.6);
  // drizzle hiss under downtown's rain
  if (kind === 'downtown')
    ambLoop(2600, 'highpass', 0.02, 0.22, 0.35);
  // a far-off horn or siren now and then
  const tick = () => {
    if (AMB.kind !== kind) return;
    const roll = Math.random();
    if (kind === 'nightmarket' && roll < 0.4) sirenDistant();
    else if (roll < (kind === 'downtown' ? 0.6 : 0.35)) hornDistant();
    AMB.timers.push(setTimeout(tick, 5000 + Math.random() * 9000));
  };
  AMB.timers.push(setTimeout(tick, 2500 + Math.random() * 4000));
}
/* ---- news chopper rotor ----
   Whump-whump: lowpassed noise gated by a ~13Hz square LFO (the blade chop)
   over a soft rotor hum. Own tracked node set, same teardown discipline as
   the ambience bed. */
const CHOP = { nodes: [], on: false };
export function chopperStart() {
  if (!A.ctx || CHOP.on) return;
  CHOP.on = true;
  const c = A.ctx, t = c.currentTime;
  const len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
  let v = 0;
  for (let i = 0; i < len; i++) { v = v * 0.96 + (Math.random() * 2 - 1) * 0.18; d[i] = v * 2.6; }
  const src = c.createBufferSource(); src.buffer = b; src.loop = true;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 340;
  const g = c.createGain(); g.gain.value = 0;                 // chopped by the LFO
  const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 12.5;
  const lg = c.createGain(); lg.gain.value = 0.045;
  const bias = c.createConstantSource(); bias.offset.value = 0.05;
  lfo.connect(lg); lg.connect(g.gain); bias.connect(g.gain);
  const hum = c.createOscillator(); hum.type = 'triangle'; hum.frequency.value = 52;
  const hg = c.createGain(); hg.gain.setValueAtTime(0, t); hg.gain.linearRampToValueAtTime(0.03, t + 1.2);
  const master = c.createGain(); master.gain.setValueAtTime(0, t);
  master.gain.linearRampToValueAtTime(1, t + 1.5);            // flies in, fades in
  src.connect(f); f.connect(g); g.connect(master);
  hum.connect(hg); hg.connect(master);
  master.connect(ambBus());
  src.start(); lfo.start(); bias.start(); hum.start();
  CHOP.nodes.push(src, f, g, lfo, lg, bias, hum, hg, master);
}
export function chopperStop(fade = 1.0) {
  if (!A.ctx || !CHOP.on) return;
  CHOP.on = false;
  const master = CHOP.nodes[CHOP.nodes.length - 1], t = A.ctx.currentTime;
  const nodes = CHOP.nodes; CHOP.nodes = [];
  try { master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(0, t + fade); } catch { /* ctx gone */ }
  setTimeout(() => { for (const n of nodes) { try { n.stop && n.stop(); } catch { /* stopped */ } try { n.disconnect(); } catch { /* detached */ } } }, fade * 1000 + 80);
}
export function chopperOn() { return CHOP.on; }

/* test hook: the bed's node graph is otherwise invisible from outside */
export function ambientDebug() { return { kind: AMB.kind, nodes: AMB.nodes.length, timers: AMB.timers.length, chopper: CHOP.on }; }
export function ambientStop() {
  for (const n of AMB.nodes) { try { n.stop && n.stop(); } catch { /* already stopped */ } try { n.disconnect(); } catch { /* detached */ } }
  AMB.nodes = [];
  for (const t of AMB.timers) clearTimeout(t);
  AMB.timers = [];
  AMB.kind = null;
}
export function musicStart() { A.beatOn = true; if (A.ctx) { A.next = A.ctx.currentTime + 0.05; } }
export function musicStop() { A.beatOn = false; }
export function musicLayers(l2, l3) { A.layer2 = l2; A.layer3 = l3; }

/* ---- police siren ----
   A classic wail: a horn oscillator whose pitch is swept up and down by a slow
   LFO, run through a bandpass for the "cardboard cone" character. Held as a
   node graph on A.siren so it can be started, faded and stopped cleanly. */
export function sirenStart(vol = 0.14) {
  if (!A.ctx || A.siren) return;
  const c = A.ctx, t = c.currentTime;
  const carrier = c.createOscillator(); carrier.type = 'sawtooth'; carrier.frequency.value = 760;
  const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.7;   // wail rate
  const lfoGain = c.createGain(); lfoGain.gain.value = 300;                          // ±300 Hz sweep
  lfo.connect(lfoGain); lfoGain.connect(carrier.frequency);
  const band = c.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 1100; band.Q.value = 3;
  const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.25);
  carrier.connect(band); band.connect(g); g.connect(A.sfxBus);
  carrier.start(t); lfo.start(t);
  A.siren = { carrier, lfo, g };
}
export function sirenStop(fade = 0.6) {
  if (!A.ctx || !A.siren) return;
  const { carrier, lfo, g } = A.siren; const t = A.ctx.currentTime;
  g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t);
  g.gain.linearRampToValueAtTime(0, t + fade);
  carrier.stop(t + fade + 0.05); lfo.stop(t + fade + 0.05);
  A.siren = null;
}
/* a single distant wail that sweeps past — tension beat during the chase */
export function sirenPass() {
  if (!A.ctx) return; const c = A.ctx, t = c.currentTime;
  const o = c.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(900, t);
  o.frequency.linearRampToValueAtTime(1150, t + 0.35);
  o.frequency.linearRampToValueAtTime(760, t + 0.9);
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 4;
  const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09, t + 0.3);
  g.gain.linearRampToValueAtTime(0, t + 1.1);
  o.connect(f); f.connect(g); g.connect(A.sfxBus); o.start(t); o.stop(t + 1.15);
}

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
let flapVoices = 0;      // a whole flock is ONE flap, not five
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
  flap(vol = 1) {                       // a flock bursting off the sidewalk
    if (flapVoices > 1 || !A.ctx) return;
    flapVoices++; setTimeout(() => flapVoices--, 400);
    const t = A.ctx.currentTime;
    for (let i = 0; i < 6; i++)
      noiseTo(A.sfxBus, t + i * 0.028, 0.035, 1700 - i * 90, 'bandpass', 0.11 * vol * (1 - i * 0.1));
  },
  steam(vol = 1) {                      // passing a breathing grate
    if (A.ctx) noiseTo(A.sfxBus, A.ctx.currentTime, 0.5, 2800, 'highpass', 0.055 * vol);
  },
  train(vol = 1) {                      // the El crossing overhead
    if (!A.ctx) return;
    const c = A.ctx, t = c.currentTime;
    // long low rumble swelling through the crossing
    const len = c.sampleRate * 3.4, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    let v = 0;
    for (let i = 0; i < len; i++) { v = v * 0.985 + (Math.random() * 2 - 1) * 0.09; d[i] = v * 4; }
    const src = c.createBufferSource(); src.buffer = b;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 150;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16 * vol, t + 0.7);
    g.gain.setValueAtTime(0.16 * vol, t + 2.2); g.gain.linearRampToValueAtTime(0, t + 3.4);
    src.connect(f); f.connect(g); g.connect(A.sfxBus); src.start(t); src.stop(t + 3.4);
    // two-tone horn as it enters
    for (const [fr, dt2] of [[311, 0], [370, 0.02]]) {
      const o = c.createOscillator(); o.type = 'square'; o.frequency.value = fr;
      const f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 900;
      const hg = c.createGain();
      hg.gain.setValueAtTime(0, t + dt2); hg.gain.linearRampToValueAtTime(0.05 * vol, t + dt2 + 0.06);
      hg.gain.setValueAtTime(0.05 * vol, t + dt2 + 0.5); hg.gain.linearRampToValueAtTime(0, t + dt2 + 0.7);
      o.connect(f2); f2.connect(hg); hg.connect(A.sfxBus); o.start(t + dt2); o.stop(t + dt2 + 0.75);
    }
  },
  bounce() { duck(0.35, 0.12, 0.3); blip(180, 0.14, 'sine', 0.24, 260); setTimeout(() => blip(240, 0.12, 'sine', 0.18, 200), 130); },
};
