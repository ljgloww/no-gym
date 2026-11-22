// app.js — state, UI and the rules of the day.
import { Sfx } from './audio.js';

/* The routine: ten bodyweight tasks. min = "done", max = the stretch target. */
const EX = [
  { id: 'pushups', name: 'Push-ups', muscle: 'Chest', type: 'reps', min: 50, max: 100, pace: 2.0,
    cue: 'Split them into sets through the day.', hard: 'Too easy? Put your feet up on a step.' },
  { id: 'squats', name: 'Squats', muscle: 'Quads', type: 'reps', min: 100, max: 100, pace: 2.2,
    cue: 'Sit back, chest tall, all the way down.', hard: 'Too easy? Slow down: three seconds on the way down.' },
  { id: 'lunges', name: 'Lunges', muscle: 'Legs & glutes', type: 'reps', min: 50, max: 50, pace: 2.4,
    cue: 'Alternate legs. Back knee just above the floor.', hard: 'Too easy? Stay on one leg at a time.' },
  { id: 'pullups', name: 'Pull-ups', muscle: 'Back', type: 'reps', min: 20, max: 20, pace: 2.8,
    cue: 'Full hang to chin over the bar.', hard: 'Too easy? Pause for two seconds at the top.' },
  { id: 'dips', name: 'Dips', muscle: 'Triceps', type: 'reps', min: 30, max: 30, pace: 2.2,
    cue: 'Parallel bars, or two sturdy chairs.', hard: 'Too easy? Take three seconds on the way down.' },
  { id: 'plank', name: 'Plank', muscle: 'Core', type: 'time', min: 120, max: 180, ready: 5,
    cue: 'Elbows under shoulders. Squeeze everything.', hard: 'Too easy? Lift one foot off the floor.' },
  { id: 'burpees', name: 'Burpees', muscle: 'Heart', type: 'reps', min: 20, max: 30, pace: 3.6,
    cue: 'Chest to the floor, jump at the top.', hard: 'Too easy? Add a push-up at the bottom.' },
  { id: 'hang', name: 'Dead hang', muscle: 'Grip', type: 'time', min: 60, max: 60, ready: 5,
    cue: 'Just hang. Let your shoulders open up.', hard: 'Too easy? Hang from one arm at a time.' },
  { id: 'walk', name: 'Walk', muscle: 'Whole body', type: 'steps', min: 8000, max: 10000,
    cue: 'Add steps as you go, or type the total from your Health app.', hard: 'Keep moving. Every step counts.' },
  { id: 'stretch', name: 'Stretch', muscle: 'Hamstrings', type: 'time', min: 600, max: 600, ready: 0,
    cue: 'Slow breaths. Ease into each stretch.', hard: 'Hold each position a little longer.' },
];
const COACH = [
  'Ten moves. Zero machines. Start anywhere.',
  'One down. That was the hard part.', 'Two done. You are moving now.', 'Three done. Keep stacking.',
  'Four done. Nearly halfway.', 'Halfway. No gym in sight.', 'Six done. Downhill from here.',
  'Seven done. Close it out.', 'Eight done. Two to go.', 'Nine done. One left. Finish it.',
  'All ten. No gym needed.',
];
const TEMPOS = [1.6, 1.3, 1, .8, .65];
const ICON = {
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="fill" d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  vol2: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z"/><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11"/></svg>',
  vol1: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z"/><path d="M15.5 9a4 4 0 010 6"/></svg>',
  vol0: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
};

const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const nf = new Intl.NumberFormat('en-US');
const mmss = s => { s = Math.floor(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const ranged = e => e.max > e.min;

/* ------------------------------------------------------------- storage -- */
const KEY = 'nogym.v1';
const store = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })();
store.days ||= {}; store.set ||= {};
let saveT = 0;
const save = () => { clearTimeout(saveT); saveT = 0; try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* storage full or blocked */ } };
const dirty = () => { if (!saveT) saveT = setTimeout(save, 500); };
const dkey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
let today = dkey();
const day = () => (store.days[today] ||= {});
const val = id => day()[id] || 0;
const doneCount = rec => rec ? EX.reduce((n, e) => n + ((rec[e.id] || 0) >= e.min ? 1 : 0), 0) : 0;

function stats() {
  let streak = 0, full = 0;
  const d = new Date();
  if (!doneCount(store.days[dkey(d)])) d.setDate(d.getDate() - 1);
  while (doneCount(store.days[dkey(d)])) { streak++; d.setDate(d.getDate() - 1); }
  for (const k in store.days) if (doneCount(store.days[k]) === EX.length) full++;
  return { streak, full };
}

/* ---------------------------------------------------------- formatting -- */
const fmtVal = (e, v) => e.type === 'time' ? mmss(v) : nf.format(Math.floor(v));
function fmtGoal(e) {
  if (e.type === 'time') return ranged(e) ? `${e.min / 60}–${e.max / 60} min` : e.min <= 90 ? `${e.min} sec` : `${e.min / 60} min`;
  return ranged(e) ? `${nf.format(e.min)}–${nf.format(e.max)}` : nf.format(e.min);
}
const goalLine = e => e.type === 'reps' ? `${fmtGoal(e)} a day` : e.type === 'steps' ? `${fmtGoal(e)} steps` : fmtGoal(e);
const left = (e, v, to) => e.type === 'time' ? mmss(Math.ceil(to - v)) : nf.format(to - v);
function statusLine(e, v) {
  if (v < e.min) return `${left(e, v, e.min)} to go`;
  if (ranged(e) && v < e.max) return `Target hit · ${left(e, v, e.max)} more to max`;
  return ranged(e) ? 'Maxed out' : 'Done for today';
}
function spokenTime(s) {
  const m = Math.floor(s / 60), r = s % 60, mm = `${m} minute${m > 1 ? 's' : ''}`;
  return m && r ? `${mm} ${r}` : m ? mm : `${r} seconds`;
}

/* ------------------------------------------------------------ elements -- */
const app = $('#app'), hero = $('#hero'), panel = $('#panel'), list = $('#list');
const el = {
  doneN: $('#doneN'), coach: $('#coach'), cta: $('#cta'), ctaText: $('#ctaText'), ctaMeta: $('#ctaMeta'),
  muscle: $('#muscle'), count: $('#count'), goal: $('#goal'), status: $('#status'), taphint: $('#taphint'),
  exName: $('#exName'), exGoal: $('#exGoal'), bar: $('#bar'), barFill: $('#barFill'), barMark: $('#barMark'),
  chips: $('#chips'), big: $('#big'), stepsForm: $('#stepsForm'), stepsInput: $('#stepsInput'), foot: $('#foot'),
  week: $('#week'), fullDays: $('#fullDays'), streakN: $('#streakN'), date: $('#date'), audioBtn: $('#audioBtn'),
  toast: $('#toast'), finale: $('#finale'), finaleStats: $('#finaleStats'), a2hs: $('#a2hs'),
};

const sfx = new Sfx();
sfx.level = store.set.audio ?? 2;
let stage = null;
const S = new Proxy({}, { get: (_, k) => (...a) => stage?.[k]?.(...a) });   // safe calls if 3D is unavailable

let mode = 'home', cur = EX[0], homeScroll = 0;
let auto = false, autoT = 0, timer = null, cd = null, wl = null;

/* ---------------------------------------------------------------- home -- */
function nextUp() {
  return EX.find(e => val(e.id) < e.min) || EX.find(e => val(e.id) < e.max) || EX[0];
}
const dayStates = () => EX.map(e => val(e.id) >= e.min ? 1 : 0);

function buildList() {
  list.innerHTML = EX.map((e, i) => `
    <li><button class="row" data-id="${e.id}">
      <span class="ring"><span class="ix">${i + 1}</span><span class="ok">${ICON.check}</span><span class="star">${ICON.star}</span></span>
      <span class="meta"><b>${e.name}</b><span>${e.muscle} · ${goalLine(e)}</span></span>
      <span class="val"></span>
    </button></li>`).join('');
}

function updateRow(e) {
  const row = list.querySelector(`[data-id="${e.id}"]`), v = val(e.id);
  if (!row) return;
  const done = v >= e.min, max = ranged(e) && v >= e.max;
  row.classList.toggle('done', done); row.classList.toggle('gold', max);
  row.style.setProperty('--p', clamp(v / e.min, 0, 1) * 100);
  row.querySelector('.val').textContent = fmtVal(e, v);
  row.setAttribute('aria-label', `${e.name}: ${fmtVal(e, v)} of ${goalLine(e)}${done ? ', done' : ''}`);
}

function renderHome() {
  const n = doneCount(day()), st = stats(), nx = nextUp(), all = n === EX.length;
  EX.forEach(updateRow);
  el.doneN.textContent = n;
  el.coach.textContent = COACH[n];
  el.streakN.textContent = st.streak;
  $('#streak').setAttribute('aria-label', `${st.streak} day streak`);
  el.fullDays.textContent = `${st.full} full day${st.full === 1 ? '' : 's'}`;
  el.date.textContent = new Date().toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
  el.ctaText.textContent = all ? `More ${nx.name.toLowerCase()}` : `${val(nx.id) ? 'Continue' : 'Start'} ${nx.name.toLowerCase()}`;
  el.ctaMeta.textContent = `${fmtVal(nx, val(nx.id))} / ${fmtGoal(nx)}`;
  // last seven days
  let html = '';
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const c = doneCount(store.days[dkey(d)]);
    html += `<div class="wd${i ? '' : ' now'}${c === EX.length ? ' full' : ''}" title="${c} of 10"><i style="--p:${c * 10}"></i><span>${d.toLocaleDateString('en-US', { weekday: 'narrow' })}</span></div>`;
  }
  el.week.innerHTML = html;
  if (mode === 'home') { S.setDay(dayStates(), -1); }
}

/* --------------------------------------------------------------- focus -- */
function renderControls() {
  const e = cur;
  let chips = [], big = '', stop = false;
  if (e.type === 'reps') {
    if (auto || cd) {
      chips = [['slower', 'Slower'], ['', `${(e.pace * TEMPOS[tempo()]).toFixed(1)}s a rep`], ['faster', 'Faster']];
      big = cd ? `Get ready · ${cd.n}` : 'Stop'; stop = true;
    } else { chips = [['add:-1', '−1'], ['add:5', '+5'], ['add:10', '+10'], ['auto', 'Auto']]; big = 'Tap · +1'; }
  } else if (e.type === 'time') {
    chips = [['add:-5', '−5s'], ['add:10', '+10s'], ['add:30', '+30s'], ['add:60', '+1 min']];
    big = cd ? `Get ready · ${cd.n}` : timer ? 'Pause' : val(e.id) ? 'Resume' : 'Start'; stop = !!(cd || timer);
  } else chips = [['add:-500', '−500'], ['add:500', '+500'], ['add:1000', '+1,000'], ['add:2500', '+2,500']];
  el.chips.innerHTML = chips.map(([act, label]) => act
    ? `<button class="chip" data-act="${act}">${label}</button>` : `<span class="chip static">${label}</span>`).join('');
  el.big.textContent = big; el.big.classList.toggle('stop', stop);
  el.big.hidden = e.type === 'steps'; el.stepsForm.hidden = e.type !== 'steps';
  el.taphint.hidden = !(e.type === 'reps' && !auto && !cd && val(e.id) === 0);
}

function updateCount(bump) {
  const e = cur, v = val(e.id), txt = fmtVal(e, v), done = v >= e.min, max = ranged(e) && v >= e.max;
  if (el.count.textContent !== txt) {
    el.count.textContent = txt;
    if (bump) { el.count.classList.remove('bump'); void el.count.offsetWidth; el.count.classList.add('bump'); }
  }
  el.status.textContent = statusLine(e, v);
  el.barFill.style.transform = `scaleX(${clamp(v / e.max, 0, 1)})`;
  el.bar.classList.toggle('gold', max);
  app.dataset.state = max ? 'gold' : done ? 'done' : '';
  S.setProgress(v / e.min, ranged(e) ? (v - e.min) / (e.max - e.min) : 0);
  // footer: a cue while working, the way onward once done
  const key = done ? 'next' : 'cue';
  if (el.foot.dataset.key !== key + e.id) {
    el.foot.dataset.key = key + e.id;
    const nx = EX.find(x => val(x.id) < x.min);
    el.foot.innerHTML = !done ? `<p>${e.cue}</p>`
      : nx ? `<button class="next" data-act="go:${nx.id}"><span>Next up: ${nx.name}</span>${ICON.arrow}</button><p>${e.hard}</p>`
        : `<p>All ten done. ${e.hard}</p>`;
    layout();
  }
}

function renderFocus() {
  const e = cur;
  el.muscle.textContent = e.muscle;
  el.exName.textContent = e.name;
  el.exGoal.textContent = goalLine(e);
  el.goal.textContent = `/ ${fmtGoal(e)}`;
  el.count.dataset.kind = e.type;
  el.barMark.hidden = !ranged(e);
  el.barMark.style.left = `${e.min / e.max * 100}%`;
  el.stepsInput.value = '';
  el.foot.dataset.key = '';
  updateCount(false);
  renderControls();
  S.setDay(dayStates(), EX.indexOf(e));
}

function stageFor(e) {
  S.show(e.id);
  if (mode === 'home') { S.setLoop(true); S.setIntensity(.3); return; }
  S.setIntensity(0);
  S.setLoop(e.type === 'steps');           // the walker keeps walking; everything else waits for you
}

function enterFocus(id) {
  halt();
  if (mode === 'home') homeScroll = window.scrollY;
  cur = EX.find(e => e.id === id) || EX[0];
  mode = 'focus'; app.dataset.mode = 'focus'; document.documentElement.classList.add('focus');
  document.documentElement.classList.remove('scrolled');
  window.scrollTo(0, 0);
  stageFor(cur); renderFocus(); layout();
}

function exitFocus() {
  halt(); save();
  mode = 'home'; app.dataset.mode = 'home'; app.dataset.state = ''; document.documentElement.classList.remove('focus');
  renderHome(); stageFor(nextUp()); S.setProgress(0, 0);
  window.scrollTo(0, homeScroll); layout();
}

/** Tell the stage which part of the screen the athlete may occupy. */
function layout() {
  const top = $('#top').getBoundingClientRect().bottom, w = Math.min(window.innerWidth, 520);
  const bottom = mode === 'focus' ? window.innerHeight - panel.offsetHeight : hero.offsetHeight - 108;
  app.style.setProperty('--panel-h', `${panel.offsetHeight}px`);
  S.setHero(top + 4, bottom - 10, w);
}

/* ------------------------------------------------------------- logging -- */
function add(e, delta, o = {}) {
  const prev = val(e.id);
  let now = Math.max(0, prev + delta);
  if (e.type !== 'time') now = Math.round(now);
  now = Math.min(now, e.type === 'steps' ? 99999 : e.type === 'time' ? 5999 : 9999);
  if (now === prev) return;
  day()[e.id] = now; dirty();
  const up = now > prev;
  if (mode === 'focus' && cur === e) { updateCount(up && !o.timer); if (!el.taphint.hidden) el.taphint.hidden = true; }

  if (o.timer) { if (Math.floor(now) > Math.floor(prev)) onSecond(e, Math.floor(now)); }
  else if (up) { delta === 1 ? sfx.rep(now) : sfx.multi(); S.pulse(); if (delta === 1 && !o.auto) S.tap(); }
  else sfx.undo();

  const was = prev >= e.min, is = now >= e.min;
  if (!was && is) complete(e);
  else if (ranged(e) && prev < e.max && now >= e.max) maxed(e);
  else if (up && !o.timer) milestone(e, prev, now, o);
  if (was !== is) { S.setDay(dayStates(), mode === 'focus' ? EX.indexOf(cur) : -1); if (mode === 'focus') renderControls(); }
}

function milestone(e, prev, now, o) {
  if (e.type !== 'reps') return;
  if (o.auto) return sfx.say(now);
  if (now - prev !== 1) return;
  const half = Math.ceil(e.min / 2);
  if (e.min >= 20 && now === half) sfx.say('Halfway.');
  else if (e.min - now === 5) sfx.say('Five more.');
  else if (now % 10 === 0) sfx.say(now);
}

function onSecond(e, s) {
  const toGo = e.min - s;
  if (toGo > 0 && toGo <= 3) sfx.beep(false); else sfx.second();
  const every = e.min >= 300 ? 60 : 30;
  if (s % every === 0 && s !== e.min && s !== e.max) sfx.say(spokenTime(s));
}

function complete(e) {
  const n = doneCount(day()), all = n === EX.length;
  if (auto) stopAuto(true);
  S.celebrate(all);
  if (all && store.set.finale !== today) {
    store.set.finale = today; save();
    sfx.fullDay(); sfx.say('All ten done. No gym needed.');
    setTimeout(showFinale, 900);
  } else {
    sfx.done(); toast(`${e.name} done · ${n}/10`, 'ok');
    sfx.say(ranged(e) ? `${e.name} done. Now go for ${e.type === 'time' ? spokenTime(e.max) : e.max}.` : `${e.name} done.`);
  }
}

function maxed(e) {
  if (auto) stopAuto(true);
  sfx.gold(); S.celebrate(false); toast(`${e.name} maxed out`, 'gold'); sfx.say(`${e.name} maxed out.`);
}

/* ---------------------------------------------------- auto-pace + timer -- */
const tempo = () => clamp(store.set.tempo ?? 2, 0, TEMPOS.length - 1);

function countdown(n, fn) {
  if (n <= 0) return fn();
  const step = () => {
    if (!cd) return;
    if (cd.n <= 0) { cd = null; sfx.beep(true); fn(); renderControls(); return; }
    sfx.beep(false); renderControls(); cd.n--; cd.t = setTimeout(step, 1000);
  };
  cd = { n, t: 0 }; step();
}
function cancelCountdown() { if (cd) { clearTimeout(cd.t); cd = null; } }

function startAuto() {
  countdown(3, () => {
    auto = true; wake(true); paceAuto();
  });
}
/** Drive the auto count from the athlete's rep loop (or a plain timer when there is no 3D view). */
function paceAuto() {
  const period = cur.pace * TEMPOS[tempo()], tick = () => add(cur, 1, { auto: true });
  clearInterval(autoT); autoT = 0;
  if (stage) stage.setLoop(true, period, tick); else autoT = setInterval(tick, period * 1000);
}
function stopAuto(silent) {
  cancelCountdown();
  if (auto) { auto = false; clearInterval(autoT); autoT = 0; S.setLoop(false); wake(false); if (!silent) sfx.stop(); }
  renderControls();
}
function setTempo(dir) {
  store.set.tempo = clamp(tempo() + dir, 0, TEMPOS.length - 1); dirty(); sfx.click();
  if (auto) paceAuto();
  renderControls();
}

function startTimer() {
  countdown(cur.ready ?? 3, () => {
    timer = { last: performance.now(), h: setInterval(tickTimer, 100) };
    S.setIntensity(1); if (cur.id === 'stretch') S.setLoop(true);
    wake(true); renderControls();
  });
}
function tickTimer() {
  const now = performance.now(), dt = Math.min(1, (now - timer.last) / 1000);
  timer.last = now; add(cur, dt, { timer: true });
}
function stopTimer(silent) {
  cancelCountdown();
  if (timer) { clearInterval(timer.h); timer = null; S.setIntensity(0); if (cur.id === 'stretch') S.setLoop(false); wake(false); if (!silent) sfx.stop(); save(); }
  renderControls();
}
/** Stop anything that is running (auto-pace, timer, countdown). */
function halt() { if (auto || cd && cur.type === 'reps') stopAuto(true); if (timer || cd) stopTimer(true); sfx.hush(); }

async function wake(on) {
  try {
    if (on && !wl && 'wakeLock' in navigator) { wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', () => { wl = null; }); }
    else if (!on && wl) { const w = wl; wl = null; await w.release(); }
  } catch { /* the screen may dim; nothing else breaks */ }
}

/* ------------------------------------------------------------ feedback -- */
let toastT = 0;
function toast(msg, kind = '') {
  el.toast.textContent = msg; el.toast.className = `toast show ${kind}`;
  clearTimeout(toastT); toastT = setTimeout(() => el.toast.classList.remove('show'), 2200);
}
function showFinale() {
  const st = stats();
  el.finaleStats.textContent = `${st.streak} day streak · ${st.full} full day${st.full === 1 ? '' : 's'}`;
  el.finale.hidden = false; requestAnimationFrame(() => el.finale.classList.add('show'));
  S.celebrate(true);
}
function hideFinale() { el.finale.classList.remove('show'); setTimeout(() => { el.finale.hidden = true; }, 300); }

function renderAudio() {
  const l = sfx.level;
  el.audioBtn.innerHTML = l === 2 ? ICON.vol2 : l === 1 ? ICON.vol1 : ICON.vol0;
  el.audioBtn.classList.toggle('off', l === 0);
  el.audioBtn.setAttribute('aria-label', ['Sound off', 'Sound effects on', 'Sound and coach voice on'][l]);
}

/* -------------------------------------------------------------- events -- */
function bigPress() {
  const e = cur;
  if (e.type === 'reps') { if (auto || cd) stopAuto(); else add(e, 1); }
  else if (e.type === 'time') { if (timer || cd) stopTimer(); else { sfx.click(); startTimer(); } }
}

/** Act on touch-down for instant response; fall back to click for keyboards and browsers without pointer events. */
function onPress(node, fn) {
  let handled = false;
  node.addEventListener('pointerdown', ev => { handled = true; fn(ev); });
  node.addEventListener('click', ev => { if (handled) handled = false; else fn(ev); });
}

function bind() {
  // Safari only starts audio from a finished tap, so listen on every kind of gesture.
  for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
    document.addEventListener(type, () => { sfx.unlock(); if (type !== 'pointerdown') sfx.primeVoice(); }, { capture: true, passive: true });
  }

  list.addEventListener('click', ev => { const b = ev.target.closest('.row'); if (b) { sfx.click(); enterFocus(b.dataset.id); } });
  el.cta.addEventListener('click', () => { sfx.click(); enterFocus(nextUp().id); });
  $('#backBtn').addEventListener('click', () => { sfx.click(); exitFocus(); });
  const stepTo = dir => { sfx.click(); enterFocus(EX[(EX.indexOf(cur) + dir + EX.length) % EX.length].id); };
  $('#prevBtn').addEventListener('click', () => stepTo(-1));
  $('#nextBtn').addEventListener('click', () => stepTo(1));

  // The big button and the whole 3D area log on touch-down, so fast reps never miss.
  onPress(el.big, bigPress);
  onPress(hero, ev => {
    if (mode !== 'focus' || cur.type !== 'reps' || auto || cd || ev.target.closest('button')) return;
    add(cur, 1);
  });

  panel.addEventListener('click', ev => {
    const b = ev.target.closest('[data-act]'); if (!b) return;
    const [act, arg] = b.dataset.act.split(':');
    if (act === 'add') add(cur, Number(arg));
    else if (act === 'auto') { sfx.click(); startAuto(); }
    else if (act === 'slower') setTempo(-1);
    else if (act === 'faster') setTempo(1);
    else if (act === 'go') { sfx.click(); enterFocus(arg); }
  });
  el.stepsForm.addEventListener('submit', ev => {
    ev.preventDefault();
    const n = parseInt(el.stepsInput.value.replace(/\D/g, ''), 10);
    if (Number.isFinite(n)) { add(cur, n - val(cur.id)); el.stepsInput.value = ''; el.stepsInput.blur(); }
  });

  el.audioBtn.addEventListener('click', () => {
    sfx.level = (sfx.level + 2) % 3; store.set.audio = sfx.level; dirty(); renderAudio();
    if (sfx.level < 2) sfx.hush();
    sfx.click(); toast(['Muted', 'Sound on, coach voice off', 'Sound and coach voice on'][sfx.level]);
  });
  $('#finaleBtn').addEventListener('click', () => { hideFinale(); if (mode === 'focus') exitFocus(); });
  $('#a2hsClose').addEventListener('click', () => { store.set.a2hs = 1; dirty(); el.a2hs.hidden = true; });

  window.addEventListener('resize', layout);
  // once the list slides under the top bar, give the bar a solid back so text never collides
  window.addEventListener('scroll', () => {
    const under = mode === 'home' && window.scrollY > hero.offsetHeight - $('#top').offsetHeight - 6;
    document.documentElement.classList.toggle('scrolled', under);
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { halt(); save(); } else rollover();
  });
  window.addEventListener('pagehide', save);
  setInterval(rollover, 60000);
}

/** A new day starts a clean sheet. */
function rollover() {
  if (dkey() === today) return;
  halt(); today = dkey();
  if (mode === 'focus') exitFocus(); else { renderHome(); stageFor(nextUp()); }
}

/* ---------------------------------------------------------------- init -- */
async function init() {
  buildList(); bind(); renderAudio(); renderHome();
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  el.a2hs.hidden = !!(standalone || store.set.a2hs);

  try {
    const { Stage } = await import('./scene.js');
    stage = new Stage($('#stage'));
  } catch (err) {
    console.warn('3D view unavailable:', err);
    document.documentElement.classList.add('no3d');
  }
  stageFor(nextUp()); S.setDay(dayStates(), -1); layout();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
