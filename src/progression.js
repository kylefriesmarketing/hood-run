/* HOOD RUN — progression.js
   Missions (3 active, rotating, persistent), coins/tokens economy, unlocks. */

import { MISSIONS, MISSION_TOKEN_REWARD, COSMETICS, STORE, TUNE } from './data.js';
import { loadSave, commitSave } from './save.js';

let toastCb = null;
export function onToast(fn) { toastCb = fn; }
function toast(msg) { toastCb && toastCb(msg); }

export function initMissions() {
  const s = loadSave();
  const m = s.missions;
  // Bounded scan: once every mission is active-or-done there is nothing left to
  // slot in, and an unbounded loop here would spin forever (active never fills).
  while (m.active.length < 3) {
    let picked = false;
    for (let tries = 0; tries < MISSIONS.length; tries++) {
      const next = MISSIONS[m.cursor % MISSIONS.length];
      m.cursor = (m.cursor + 1) % MISSIONS.length;
      if (m.active.includes(next.id) || m.done.includes(next.id)) continue;
      m.active.push(next.id);
      if (!(next.id in m.progress)) m.progress[next.id] = 0;
      picked = true;
      break;
    }
    if (!picked) break;                     // pool exhausted — run with what we have
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
    if (!def) return null;                  // id from an older build — skip, don't crash
    return { ...def, progress: Math.min(s.missions.progress[id] || 0, def.target) };
  }).filter(Boolean);
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
/* ---------------- the Corner Store ---------------- */
export function upgradeLevel(id) { return loadSave().store.upgrades[id] || 0; }
export function stockOf(id) { return loadSave().store.stock[id] || 0; }

export function upgradePrice(id) {
  const def = STORE.upgrades.find(u => u.id === id);
  const lvl = upgradeLevel(id);
  return (def && lvl < def.max) ? def.price[lvl] : null;
}

export function buyConsumable(id) {
  const s = loadSave();
  const def = STORE.consumables.find(c => c.id === id);
  if (!def) return { ok: false, msg: 'Unknown item' };
  if (s.coins < def.price) return { ok: false, msg: 'Not enough cash' };
  s.coins -= def.price;
  s.store.stock[id] = (s.store.stock[id] || 0) + 1;
  commitSave();
  return { ok: true, stock: s.store.stock[id] };
}

export function buyUpgrade(id) {
  const s = loadSave();
  const def = STORE.upgrades.find(u => u.id === id);
  if (!def) return { ok: false, msg: 'Unknown item' };
  const lvl = s.store.upgrades[id] || 0;
  if (lvl >= def.max) return { ok: false, msg: 'Already maxed' };
  const price = def.price[lvl];
  if (s.coins < price) return { ok: false, msg: 'Not enough cash' };
  s.coins -= price;
  s.store.upgrades[id] = lvl + 1;
  commitSave();
  return { ok: true, level: lvl + 1 };
}

/* per-run power-up durations with purchased upgrades folded in */
export function powDurations() {
  const s = loadSave();
  const out = { ...TUNE.powDur };
  for (const def of STORE.upgrades) {
    const lvl = s.store.upgrades[def.id] || 0;
    if (lvl && out[def.id] !== undefined) out[def.id] += def.bonus * lvl;
  }
  return out;
}

/* spend one of each stocked consumable; Daily runs never consume (fair board) */
export function takeConsumables(isDaily) {
  const s = loadSave();
  const use = { headstart: false, shield: false, doubler: false };
  if (isDaily) return use;
  for (const k of Object.keys(use)) {
    if ((s.store.stock[k] || 0) > 0) { s.store.stock[k]--; use[k] = true; }
  }
  commitSave();
  return use;
}

export function equipCosmetic(slot, id) {
  const s = loadSave();
  if (!s.unlocks.owned.includes(id)) return false;
  s.unlocks.equipped[slot] = id; commitSave(); return true;
}
