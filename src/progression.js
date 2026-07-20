/* HOOD RUN — progression.js
   Missions (3 active, rotating, persistent), coins/tokens economy, unlocks. */

import { MISSIONS, MISSION_TOKEN_REWARD, COSMETICS } from './data.js';
import { loadSave, commitSave } from './save.js';

let toastCb = null;
export function onToast(fn) { toastCb = fn; }
function toast(msg) { toastCb && toastCb(msg); }

export function initMissions() {
  const s = loadSave();
  const m = s.missions;
  while (m.active.length < 3) {
    const next = MISSIONS[m.cursor % MISSIONS.length];
    m.cursor++;
    if (m.active.includes(next.id) || m.done.includes(next.id)) {
      if (m.done.length >= MISSIONS.length) break;
      continue;
    }
    m.active.push(next.id);
    if (!(next.id in m.progress)) m.progress[next.id] = 0;
  }
  commitSave();
}

/* run-scoped stats that missions read; call flushRunStats at run end.
   Per-run "once" stats (stylemax, rundist, nopow) report absolute values. */
export function missionEvent(stat, amount) {
  const s = loadSave();
  let changed = false;
  for (const id of [...s.missions.active]) {
    const def = MISSIONS.find(x => x.id === id);
    if (!def || def.stat !== stat) continue;
    let p = s.missions.progress[id] || 0;
    p = def.once ? Math.max(p, amount) : p + amount;
    s.missions.progress[id] = p;
    if (p >= def.target) {
      s.missions.active = s.missions.active.filter(x => x !== id);
      s.missions.done.push(id);
      s.tokens += MISSION_TOKEN_REWARD;
      s.lifetime.tokens += MISSION_TOKEN_REWARD;
      toast(`✔ Mission: ${def.label} (+${MISSION_TOKEN_REWARD}🔷)`);
      changed = true;
    }
  }
  if (changed) { initMissions(); }
}

export function activeMissions() {
  const s = loadSave();
  return s.missions.active.map(id => {
    const def = MISSIONS.find(x => x.id === id);
    return { ...def, progress: Math.min(s.missions.progress[id] || 0, def.target) };
  });
}

export function addCoins(n) { const s = loadSave(); s.coins += n; s.lifetime.coins += n; }
export function addTokens(n) { const s = loadSave(); s.tokens += n; s.lifetime.tokens += n; }

export function buyCosmetic(slot, id) {
  const s = loadSave();
  const def = COSMETICS[slot].find(c => c.id === id);
  if (!def) return { ok: false, msg: 'Unknown item' };
  if (s.unlocks.owned.includes(id)) { s.unlocks.equipped[slot] = id; commitSave(); return { ok: true, equipped: true }; }
  if (s.coins < def.price) return { ok: false, msg: 'Not enough coins' };
  s.coins -= def.price;
  s.unlocks.owned.push(id);
  s.unlocks.equipped[slot] = id;
  commitSave();
  return { ok: true, bought: true };
}
export function equipCosmetic(slot, id) {
  const s = loadSave();
  if (!s.unlocks.owned.includes(id)) return false;
  s.unlocks.equipped[slot] = id; commitSave(); return true;
}
