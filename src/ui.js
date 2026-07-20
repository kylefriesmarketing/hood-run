/* HOOD RUN — ui.js
   Screens + HUD. Owns the DOM only; game rules stay in game.js. */

import { COSMETICS, POWERUPS, TUNE, DISTRICTS } from './data.js';
import { loadSave, commitSave, resetSave } from './save.js';
import { activeMissions, buyCosmetic, equipCosmetic, onToast } from './progression.js';
import { setVolumes, sfx } from './audio.js';

const $ = id => document.getElementById(id);
let hooks = null;   // { startRun, toHome, resume, skipTutorial, rebuildRunner, replayTutorial }

export function initUI(h) {
  hooks = h;
  onToast(showToast);
  bindTap('play-btn', () => hooks.startRun());
  bindTap('retry-btn', () => hooks.startRun());
  bindTap('home-btn', () => { showScreen('home'); hooks.toHome(); });
  bindTap('resume-btn', () => hooks.resume());
  bindTap('pause-home-btn', () => { showScreen('home'); hooks.toHome(); });
  bindTap('runner-btn', () => { renderRunner(); showScreen('runner'); });
  bindTap('missions-btn', () => { renderMissions(); showScreen('missions'); });
  bindTap('settings-btn', () => { renderSettings(); showScreen('settings'); });
  for (const id of ['runner-back', 'missions-back', 'settings-back']) bindTap(id, () => { refreshHome(); showScreen('home'); });
  bindTap('pause-btn', () => hooks.pause());
  bindTap('tut-skip', () => hooks.skipTutorial());
  refreshHome();
  applySettings();
}
function bindTap(id, fn) {
  const el = $(id); if (!el) return;
  el.onclick = () => { sfx.ui(); fn(); };
  el.addEventListener('touchend', e => { e.preventDefault(); e.stopPropagation(); sfx.ui(); fn(); }, { passive: false });
}

const SCREENS = ['home', 'runner', 'missions', 'settings', 'over', 'paused'];
export function showScreen(name) {
  for (const s of SCREENS) $(s)?.classList.toggle('show', s === name);
  $('hud').classList.toggle('show', name === null);
}
export function hideScreens() { for (const s of SCREENS) $(s)?.classList.remove('show'); $('hud').classList.add('show'); }

export function refreshHome() {
  const s = loadSave();
  $('beststrip').innerHTML = s.high
    ? `Best: <b>${s.high.toLocaleString()}</b> · Farthest: <b>${s.bestDist}m</b> · <span class="coin">●</span> ${s.coins} · 🔷 ${s.tokens}`
    : 'First run — the block is waiting.';
  const discovered = Math.min(3, 1 + Math.floor(s.lifetime.dist / 850));
  $('district-strip').textContent = ['block', 'market', 'downtown'].slice(0, discovered)
    .map(d => DISTRICTS[d].icon + ' ' + DISTRICTS[d].label).join('  ·  ');
}

/* ---------------- HUD ---------------- */
let lastHud = 0;
export function updateHud(G, force, mult, total) {
  const now = performance.now();
  if (!force && now - lastHud < 100) return;
  lastHud = now;
  $('hud-score').textContent = total.toLocaleString();
  $('hud-mult').textContent = '×' + mult;
  $('hud-dist').textContent = Math.floor(G.dist) + 'm';
  $('hud-coins').textContent = G.run.coins;
  // meter
  $('meter-fill').style.width = Math.round(G.meter * 100) + '%';
  $('meter').classList.toggle('party', G.partyT > 0);
  // power-ups
  let html = '';
  for (const k of ['boost', 'magnet', 'doublestyle']) {
    if (G.pows[k] > 0) {
      const def = POWERUPS[k];
      html += `<div class="pow" style="border-color:${def.color}"><span>${def.icon}</span><i style="width:${(G.pows[k] / TUNE.powDur[k]) * 100}%;background:${def.color}"></i></div>`;
    }
  }
  if (G.pows.shield > 0) html += `<div class="pow" style="border-color:${POWERUPS.shield.color}"><span>${POWERUPS.shield.icon}</span><i style="width:100%;background:${POWERUPS.shield.color}"></i></div>`;
  $('pows').innerHTML = html;
  // letters
  $('letters').textContent = G.lettersGot.length ? 'HOOD'.split('').map((ch, i) => G.lettersGot.includes(i) ? ch : '·').join('') : '';
}

let calloutT = null;
export function showCallout(text, kind) {
  const el = $('callout');
  el.textContent = text;
  el.className = 'show ' + (kind || '');
  clearTimeout(calloutT);
  calloutT = setTimeout(() => el.className = '', kind === 'party' || kind === 'hood' ? 1600 : 950);
}
export function showCountdown(n) {
  const el = $('countdown');
  if (n === null) { el.classList.remove('show'); return; }
  el.textContent = n; el.classList.add('show');
}
export function showTutorial(msg, doneMsg) {
  const el = $('tut');
  if (doneMsg) { el.textContent = doneMsg; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 1500); $('tut-skip').classList.remove('show'); return; }
  if (!msg) { el.classList.remove('show'); return; }
  el.textContent = msg; el.classList.add('show');
  $('tut-skip').classList.add('show');
}
export function showDistrictBanner(label, icon) {
  const el = $('district-banner');
  el.innerHTML = `${icon}<br>${label}`;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}
let toastQ = [];
export function showToast(msg) {
  toastQ.push(msg);
  if (toastQ.length === 1) nextToast();
}
function nextToast() {
  if (!toastQ.length) return;
  const el = $('toast');
  el.textContent = toastQ[0]; el.classList.add('show');
  sfx.mission();
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => { toastQ.shift(); nextToast(); }, 300); }, 2200);
}

/* ---------------- results ---------------- */
export function showResults(r) {
  $('ov-total').textContent = r.total.toLocaleString();
  $('ov-cause').textContent = r.cause;
  $('ov-breakdown').innerHTML = [
    ['Distance', Math.floor(r.parts.dist)], ['Coins', Math.floor(r.parts.coins)],
    ['Style', Math.floor(r.parts.style)], ['Route', Math.floor(r.parts.route)],
    ['Letters', Math.floor(r.parts.letters)],
  ].filter(x => x[1] > 0).map(x => `<div class="br"><span>${x[0]}</span><b>${x[1].toLocaleString()}</b></div>`).join('');
  $('ov-stats').innerHTML =
    `<div class="res"><div class="v">${r.dist}m</div><div class="l">Distance</div></div>` +
    `<div class="res"><div class="v coin-v">●${r.coins}</div><div class="l">Coins</div></div>` +
    `<div class="res"><div class="v">×${r.styleMax}</div><div class="l">Best Chain</div></div>`;
  $('newbest').style.display = r.newHigh ? 'block' : 'none';
  if (r.newHigh) sfx.highscore();
  showScreen('over');
}

/* ---------------- missions screen ---------------- */
function renderMissions() {
  const s = loadSave();
  const list = activeMissions();
  $('missions-list').innerHTML = list.map(m => {
    const pct = Math.round((m.progress / m.target) * 100);
    return `<div class="mission"><div class="m-label">${m.label}</div>
      <div class="m-bar"><i style="width:${pct}%"></i></div>
      <div class="m-num">${Math.floor(m.progress)} / ${m.target}</div></div>`;
  }).join('') || '<p class="muted">All missions complete — legend status.</p>';
  $('missions-done').textContent = `${s.missions.done.length} completed · 🔷 ${s.tokens} tokens`;
}

/* ---------------- runner screen (cosmetics) ---------------- */
function renderRunner() {
  const s = loadSave();
  const slots = [['skin', 'Appearance'], ['outfit', 'Outfit'], ['shoes', 'Shoes'], ['hat', 'Hat'], ['trail', 'Trail']];
  $('runner-coins').innerHTML = `<span class="coin">●</span> ${s.coins}`;
  $('runner-slots').innerHTML = slots.map(([slot, label]) => {
    const items = COSMETICS[slot].map(c => {
      const owned = s.unlocks.owned.includes(c.id);
      const eq = s.unlocks.equipped[slot] === c.id;
      const swatch = c.color !== undefined && c.color !== 0 ? `<i class="sw" style="background:#${c.color.toString(16).padStart(6, '0')}"></i>` : '';
      return `<button class="cos ${eq ? 'eq' : ''} ${owned ? '' : 'locked'}" data-slot="${slot}" data-id="${c.id}">
        ${swatch}${c.label}${owned ? (eq ? ' ✓' : '') : ` <span class="price">●${c.price}</span>`}</button>`;
    }).join('');
    return `<div class="slot"><h3>${label}</h3><div class="cos-row">${items}</div></div>`;
  }).join('');
  for (const btn of $('runner-slots').querySelectorAll('.cos')) {
    const fn = () => {
      const r = buyCosmetic(btn.dataset.slot, btn.dataset.id);
      if (r.ok) { if (r.bought) sfx.buy(); else sfx.ui(); hooks.rebuildRunner(); renderRunner(); }
      else showToast(r.msg);
    };
    btn.onclick = fn;
    btn.addEventListener('touchend', e => { e.preventDefault(); e.stopPropagation(); fn(); }, { passive: false });
  }
}

/* ---------------- settings ---------------- */
function renderSettings() {
  const s = loadSave();
  $('set-music').value = s.settings.music;
  $('set-sfx').value = s.settings.sfx;
  $('set-rm').checked = s.settings.reducedMotion;
  $('set-hc').checked = s.settings.contrast;
  $('set-music').oninput = e => { s.settings.music = +e.target.value; applySettings(); commitSave(); };
  $('set-sfx').oninput = e => { s.settings.sfx = +e.target.value; applySettings(); commitSave(); sfx.coin(1); };
  $('set-rm').onchange = e => { s.settings.reducedMotion = e.target.checked; applySettings(); commitSave(); };
  $('set-hc').onchange = e => { s.settings.contrast = e.target.checked; applySettings(); commitSave(); };
  bindTap('set-tut', () => { hooks.replayTutorial(); });
  bindTap('set-reset', () => {
    if ($('set-reset').dataset.arm) { resetSave(); refreshHome(); renderSettings(); showToast('Progress reset.'); delete $('set-reset').dataset.arm; $('set-reset').textContent = 'Reset progress'; }
    else { $('set-reset').dataset.arm = '1'; $('set-reset').textContent = 'Tap again to confirm'; setTimeout(() => { delete $('set-reset').dataset.arm; $('set-reset').textContent = 'Reset progress'; }, 3000); }
  });
}
export function applySettings() {
  const s = loadSave();
  setVolumes(s.settings.music, s.settings.sfx);
  document.body.classList.toggle('reduced-motion', s.settings.reducedMotion);
  document.body.classList.toggle('high-contrast', s.settings.contrast);
}
export function reducedMotion() { return loadSave().settings.reducedMotion; }
export function highContrast() { return loadSave().settings.contrast; }
