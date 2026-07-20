/* HOOD RUN — input.js
   Keyboard + touch gestures → abstract actions with buffering.
   Emits: left, right, up, down, pause. Game decides turn-vs-lane. */

const listeners = [];
export function onAction(fn) { listeners.push(fn); }
function emit(a) { for (const fn of listeners) fn(a); }

let attached = false;
export function attachInput() {
  if (attached) return; attached = true;

  addEventListener('keydown', e => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') emit('left');
    else if (k === 'arrowright' || k === 'd') emit('right');
    else if (k === 'arrowup' || k === 'w' || k === ' ') { emit('up'); if (k === ' ') e.preventDefault?.(); }
    else if (k === 'arrowdown' || k === 's') emit('down');
    else if (k === 'escape' || k === 'p') emit('pause');
    else if (k === 'enter') emit('confirm');
  });

  let tS = null;
  addEventListener('touchstart', e => {
    const t = e.changedTouches[0];
    tS = { x: t.clientX, y: t.clientY, t: performance.now() };
  }, { passive: true });
  addEventListener('touchend', e => {
    if (!tS) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - tS.x, dy = t.clientY - tS.y; tS = null;
    if (Math.abs(dx) < 26 && Math.abs(dy) < 26) { emit('tap'); return; }
    if (Math.abs(dx) > Math.abs(dy)) emit(dx < 0 ? 'left' : 'right');
    else emit(dy < 0 ? 'up' : 'down');
  }, { passive: true });

  // block page scroll / pull-to-refresh only during play (game sets this flag)
  document.addEventListener('touchmove', e => { if (window.__hrPlaying) e.preventDefault(); }, { passive: false });
  addEventListener('contextmenu', e => { if (window.__hrPlaying) e.preventDefault(); });
}
