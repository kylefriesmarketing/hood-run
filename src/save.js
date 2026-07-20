/* HOOD RUN — save.js
   Versioned local persistence with migration + storage-less fallback. */

const KEY = 'hr-save';
const VERSION = 1;

function freshSave() {
  return {
    v: VERSION,
    high: 0, bestDist: 0,
    coins: 0, tokens: 0,
    lifetime: { dist: 0, coins: 0, runs: 0, pslide: 0, pjump: 0, nearmiss: 0, shortcut: 0, party: 0, hood: 0, tokens: 0 },
    settings: { music: 0.7, sfx: 0.8, reducedMotion: false, contrast: false, leftHud: false },
    missions: { active: [], progress: {}, done: [], cursor: 0 },
    unlocks: { owned: ['o_coral', 's_white', 'h_cap', 't_none', 'k_1', 'k_2', 'k_3', 'k_4'],
               equipped: { outfit: 'o_coral', shoes: 's_white', hat: 'h_cap', trail: 't_none', skin: 'k_1' } },
    tutorialDone: false,
  };
}

let mem = null;           // in-memory fallback when storage unavailable
let storageOk = true;
function readRaw() {
  try { return localStorage.getItem(KEY); } catch { storageOk = false; return null; }
}
function writeRaw(str) {
  try { localStorage.setItem(KEY, str); } catch { storageOk = false; }
}

export function loadSave() {
  if (mem) return mem;
  let s = null;
  const raw = readRaw();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && typeof parsed.v === 'number') s = migrate(parsed);
    } catch { /* corrupted — fall through to fresh */ }
  }
  if (!s) {
    s = freshSave();
    // migrate v0 legacy keys (pre-bible build)
    try {
      const legacyHigh = +(localStorage.getItem('hr-best') || 0);
      const legacyDist = +(localStorage.getItem('hr-bestd') || 0);
      if (legacyHigh > 0) s.high = legacyHigh;
      if (legacyDist > 0) { s.bestDist = legacyDist; s.lifetime.dist = legacyDist; }
    } catch { /* no storage */ }
  }
  // deep-fill any missing fields against the fresh schema (forward safety)
  s = fill(freshSave(), s);
  mem = s;
  return s;
}

function fill(base, over) {
  if (Array.isArray(base)) return Array.isArray(over) ? over : base;
  if (base && typeof base === 'object') {
    const out = {};
    for (const k in base) out[k] = (over && k in over) ? fill(base[k], over[k]) : base[k];
    for (const k in over) if (!(k in out)) out[k] = over[k];
    return out;
  }
  return over === undefined ? base : over;
}

function migrate(s) {
  // future schema bumps chain here: if (s.v === 1) { ...; s.v = 2; }
  if (s.v > VERSION) return null;          // newer than us: refuse & start fresh (never crash)
  return s;
}

export function commitSave() {
  if (!mem) return;
  writeRaw(JSON.stringify(mem));
}

export function saveAvailable() { return storageOk; }

/* test hook: wipe (used by settings "reset progress" too) */
export function resetSave() {
  mem = freshSave();
  try { localStorage.removeItem(KEY); localStorage.removeItem('hr-best'); localStorage.removeItem('hr-bestd'); } catch {}
  commitSave();
  return mem;
}
