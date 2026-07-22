/* HOOD RUN — ui.js
   Screens + HUD. Owns the DOM only; game rules stay in game.js. */

import { COSMETICS, POWERUPS, TUNE, DISTRICTS, DISTRICT_ORDER, DISTRICT_LEN, STORE, dateKey } from './data.js';
import { loadSave, commitSave, resetSave } from './save.js';
import { activeMissions, buyCosmetic, equipCosmetic, onToast, initMissions,
         buyConsumable, buyUpgrade, upgradeLevel, stockOf } from './progression.js';
import { setVolumes, sfx } from './audio.js';

const $ = id => document.getElementById(id);
let hooks = null;   // { startRun, toHome, resume, skipTutorial, rebuildRunner, replayTutorial }
let lastWasDaily = false;

export function initUI(h) {
  hooks = h;
  onToast(showToast);
  bindTap('play-btn', () => hooks.startRun());
  bindTap('daily-btn', () => hooks.startRun(true));
  bindTap('retry-btn', () => hooks.startRun(lastWasDaily));
  bindTap('home-btn', () => { showScreen('home'); hooks.toHome(); });
  bindTap('resume-btn', () => hooks.resume());
  bindTap('pause-home-btn', () => { showScreen('home'); hooks.toHome(); });
  bindTap('runner-btn', () => { renderRunner(); showScreen('runner'); hooks.refreshPreview && hooks.refreshPreview(); });
  bindTap('store-btn', () => { renderStore(); showScreen('store'); });
  bindTap('missions-btn', () => { renderMissions(); showScreen('missions'); });
  bindTap('settings-btn', () => { renderSettings(); showScreen('settings'); });
  for (const id of ['runner-back', 'store-back', 'missions-back', 'settings-back']) bindTap(id, () => { refreshHome(); showScreen('home'); });
  bindTap('pause-btn', () => hooks.pause());
  bindTap('tut-skip', () => hooks.skipTutorial());
  bindScrollFades();
  refreshHome();
  applySettings();
  requestAnimationFrame(() => syncScrollFade($('home').querySelector('.sheet-body')));
}
/* short haptic tick where supported — silently ignored elsewhere */
export function haptic(ms) {
  if (loadSave().settings.reducedMotion) return;
  try { navigator.vibrate && navigator.vibrate(ms); } catch { /* unsupported */ }
}
function bindTap(id, fn) {
  const el = $(id); if (!el) return;
  el.onclick = () => { sfx.ui(); haptic(10); fn(); };
  el.addEventListener('touchend', e => { e.preventDefault(); e.stopPropagation(); sfx.ui(); haptic(10); fn(); }, { passive: false });
}

const SCREENS = ['home', 'runner', 'store', 'missions', 'settings', 'over', 'paused'];
export function showScreen(name) {
  for (const s of SCREENS) $(s)?.classList.toggle('show', s === name);
  $('hud').classList.toggle('show', name === null);
  if (name) requestAnimationFrame(() => syncScrollFade($(name)?.querySelector('.sheet-body')));
}
/* mark scrollable bodies so the bottom edge fades instead of hard-clipping */
function syncScrollFade(body) {
  if (!body) return;
  const scrollable = body.scrollHeight > body.clientHeight + 2;
  body.classList.toggle('can-scroll', scrollable);
  body.classList.toggle('at-end', scrollable && body.scrollTop + body.clientHeight >= body.scrollHeight - 3);
}
function bindScrollFades() {
  for (const s of SCREENS) {
    const body = $(s)?.querySelector('.sheet-body');
    if (body) body.addEventListener('scroll', () => syncScrollFade(body), { passive: true });
  }
  addEventListener('resize', () => { for (const s of SCREENS) syncScrollFade($(s)?.querySelector('.sheet-body')); });
}
export function hideScreens() { for (const s of SCREENS) $(s)?.classList.remove('show'); $('hud').classList.add('show'); }

export function refreshHome() {
  const s = loadSave();
  $('hs-best').textContent = s.high.toLocaleString();
  $('hs-far').textContent = s.bestDist + 'm';
  $('hs-coins').textContent = s.coins.toLocaleString();
  const discovered = Math.min(DISTRICT_ORDER.length, 1 + Math.floor(s.lifetime.dist / DISTRICT_LEN));
  $('district-strip').textContent = DISTRICT_ORDER.slice(0, discovered)
    .map(d => DISTRICTS[d].icon + ' ' + DISTRICTS[d].label).join('  ·  ')
    + (discovered < DISTRICT_ORDER.length ? '  ·  ???' : '');
  const dailyDone = s.daily.date === dateKey();
  const streak = s.daily.streak > 1 ? ` · 🔥${s.daily.streak}-day streak` : '';
  $('daily-strip').innerHTML = dailyDone
    ? `Today's Daily best: <b>${s.daily.best.toLocaleString()}</b>${streak} — same city for everyone today`
    : `🗓️ Today's Daily Challenge is fresh — one seeded city, chase the best.`;
}

/* ---------------- HUD ---------------- */
let lastHud = 0, multPopT = null, lastLetters = null;
export function updateHud(G, force, mult, total) {
  const now = performance.now();
  if (!force && now - lastHud < 100) return;
  lastHud = now;
  $('hud-score').textContent = total.toLocaleString();
  const multEl = $('hud-mult');
  const multTxt = '×' + mult;
  if (multEl.textContent !== multTxt) {            // pop the badge when it changes
    multEl.textContent = multTxt;
    multEl.classList.add('pop');
    clearTimeout(multPopT); multPopT = setTimeout(() => multEl.classList.remove('pop'), 180);
  }
  $('hud-dist').textContent = Math.floor(G.dist) + 'm';
  $('hud-coins').lastElementChild.textContent = G.run.coins;
  // meter
  $('meter-fill').style.width = Math.round(G.meter * 100) + '%';
  $('meter').classList.toggle('party', G.partyT > 0);
  // power-ups
  let html = '';
  for (const k of ['boost', 'magnet', 'doublestyle']) {
    if (G.pows[k] > 0) {
      const def = POWERUPS[k];
      const max = (G.powDur && G.powDur[k]) || TUNE.powDur[k];
      html += `<div class="pow" style="border-color:${def.color}"><span>${def.icon}</span><i style="width:${Math.min(100, (G.pows[k] / max) * 100)}%;background:${def.color}"></i></div>`;
    }
  }
  if (G.pows.shield > 0) html += `<div class="pow" style="border-color:${POWERUPS.shield.color}"><span>${POWERUPS.shield.icon}</span><i style="width:100%;background:${POWERUPS.shield.color}"></i></div>`;
  $('pows').innerHTML = html;
  // letters — four slots that light up as you spell H-O-O-D
  const lettersHtml = G.lettersGot.length
    ? 'HOOD'.split('').map((ch, i) => `<span class="${G.lettersGot.includes(i) ? 'on' : ''}">${ch}</span>`).join('')
    : '';
  if (lastLetters !== lettersHtml) { $('letters').innerHTML = lettersHtml; lastLetters = lettersHtml; }
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
  lastWasDaily = !!r.daily;
  $('ov-title').textContent = r.daily ? 'DAILY DONE' : 'BUSTED!';
  $('ov-daily').innerHTML = r.daily
    ? (r.dailyBest ? `🗓️ New Daily best! <b>${r.dailyToday.toLocaleString()}</b>${r.dailyStreak > 1 ? ` · 🔥${r.dailyStreak}-day streak` : ''}`
                   : `🗓️ Today's Daily best stands at <b>${r.dailyToday.toLocaleString()}</b>`)
    : '';
  $('ov-daily').style.display = r.daily ? 'block' : 'none';
  $('ov-total').textContent = r.total.toLocaleString();
  $('ov-cause').textContent = r.cause;
  $('ov-breakdown').innerHTML = [
    ['Distance', Math.floor(r.parts.dist)], ['Cash', Math.floor(r.parts.coins)],
    ['Style', Math.floor(r.parts.style)], ['Route', Math.floor(r.parts.route)],
    ['Letters', Math.floor(r.parts.letters)],
  ].filter(x => x[1] > 0).map(x => `<div class="br"><span>${x[0]}</span><b>${x[1].toLocaleString()}</b></div>`).join('');
  $('ov-stats').innerHTML =
    `<div class="res"><div class="v">${r.dist}m</div><div class="l">Distance</div></div>` +
    `<div class="res"><div class="v">${r.coins.toLocaleString()}</div><div class="l">Cash</div></div>` +
    `<div class="res"><div class="v">×${r.styleMax}</div><div class="l">Best Chain</div></div>`;
  $('newbest').style.display = r.newHigh ? 'block' : 'none';
  if (r.newHigh) sfx.highscore();
  haptic(r.newHigh ? [18, 60, 18, 60, 30] : 26);
  showScreen('over');
}

/* ---------------- missions screen ---------------- */
function renderMissions() {
  initMissions();                 // refill after a progress reset so the page is never blank
  const s = loadSave();
  const list = activeMissions();
  $('missions-list').innerHTML = list.map(m => {
    const pct = Math.round((m.progress / m.target) * 100);
    return `<div class="mission"><div class="m-label">${m.label}</div>
      <div class="m-bar"><i style="width:${pct}%"></i></div>
      <div class="m-num">${Math.floor(m.progress)} / ${m.target}</div></div>`;
  }).join('') || '<p class="muted">All missions complete — legend status.</p>';
  $('missions-done').textContent = `${s.missions.done.length} completed · 🔷 ${s.tokens} tokens`;
  const lt = s.lifetime;
  const stats = [
    ['Runs', lt.runs], ['Total distance', (lt.dist || 0).toLocaleString() + 'm'],
    ['Cash collected', (lt.coins || 0).toLocaleString()], ['Close calls', lt.nearmiss || 0],
    ['Perfect jumps', lt.pjump || 0], ['Perfect slides', lt.pslide || 0],
    ['Shortcuts taken', lt.shortcut || 0], ['Block Parties', lt.party || 0],
    ['H-O-O-D spelled', lt.hood || 0],
  ];
  $('lifetime-stats').innerHTML = '<h3 class="lt-h">LIFETIME</h3>' +
    stats.map(([k, v]) => `<div class="br"><span>${k}</span><b>${v}</b></div>`).join('');
}

/* ---------------- the Corner Store ---------------- */
function renderStore() {
  const s = loadSave();
  $('store-cash').textContent = s.coins.toLocaleString();
  const coin = '<i class="dot-coin"></i>';

  const consumables = STORE.consumables.map(c => {
    const held = stockOf(c.id);
    const afford = s.coins >= c.price;
    return `<div class="item">
      <div class="ic">${c.icon}</div>
      <div class="txt"><div class="nm">${c.label}${held ? `<span class="own">${held} ready</span>` : ''}</div>
        <div class="ds">${c.desc}</div></div>
      <button class="buy" data-kind="c" data-id="${c.id}" ${afford ? '' : 'disabled'}>${coin}${c.price}</button>
    </div>`;
  }).join('');

  const upgrades = STORE.upgrades.map(u => {
    const lvl = upgradeLevel(u.id);
    const maxed = lvl >= u.max;
    const price = maxed ? null : u.price[lvl];
    const afford = !maxed && s.coins >= price;
    const pips = Array.from({ length: u.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
    return `<div class="item">
      <div class="ic">${u.icon}</div>
      <div class="txt"><div class="nm">${u.label}</div>
        <div class="ds">${u.desc}</div><div class="pips">${pips}</div></div>
      <button class="buy" data-kind="u" data-id="${u.id}" ${maxed || !afford ? 'disabled' : ''}>${maxed ? 'MAX' : coin + price}</button>
    </div>`;
  }).join('');

  $('store-body').innerHTML =
    `<div class="store-sec"><h3>Supplies</h3>
       <p class="hint">One-run items, spent automatically on your next run. Daily Challenge runs never spend them, so that board stays fair.</p>
       ${consumables}</div>
     <div class="store-sec"><h3>Upgrades</h3>
       <p class="hint">Permanent. Makes the power-ups you find out on the street last longer.</p>
       ${upgrades}</div>`;

  for (const btn of $('store-body').querySelectorAll('.buy')) {
    if (btn.disabled) continue;
    const act = () => {
      const r = btn.dataset.kind === 'c' ? buyConsumable(btn.dataset.id) : buyUpgrade(btn.dataset.id);
      if (r.ok) { sfx.buy(); haptic(12); renderStore(); refreshHome(); }
      else showToast(r.msg);
    };
    btn.onclick = act;
    btn.addEventListener('touchend', e => { e.preventDefault(); e.stopPropagation(); act(); }, { passive: false });
  }
}

/* ---------------- runner screen (cosmetics) ---------------- */
function renderRunner() {
  const s = loadSave();
  const slots = [['skin', 'Appearance'], ['outfit', 'Outfit'], ['shoes', 'Shoes'], ['hat', 'Hat'], ['trail', 'Trail'], ['pose', 'Victory Pose']];
  $('runner-coins').textContent = s.coins.toLocaleString();
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
