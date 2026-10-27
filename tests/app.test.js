// ADHD Winner — end-to-end tests (real browser, real index.html, real localStorage).
// Run:  npm test        (needs Node 18+ and Playwright: npm i -D playwright && npx playwright install chromium)
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }

let URL, server; // set in test.before (local http server)
const KEY = 'bravo-v1';
const AI = 'https://mon-style.imendriss271982.workers.dev/';
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const plus = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const TODAY = plus(0), TOMORROW = plus(1), IN2 = plus(2);

let browser;
test.before(async () => {
  const opts = {};
  const local = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
  try { require('fs').accessSync(local); opts.executablePath = local; } catch (e) {}
  browser = await chromium.launch(opts);
  server = await require('./serve')(); URL = server.base + 'index.html';
});
test.after(async () => { await browser.close(); server.close(); });

// a fresh phone with an onboarded user and an empty list (or the given saved state)
async function open({ state, width = 390, ai, noNotif } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 } });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  const seed = state || { v: 2, name: 'Tester', onboarded: true, date: TODAY, tasks: [], voice: false, sound: false };
  await page.addInitScript(([k, s, nn]) => {
    if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(s));
    try { speechSynthesis.speak = () => {}; } catch (e) {}
    HTMLMediaElement.prototype.play = function () { return Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })); };
    if (nn) { delete window.Notification; }
  }, [KEY, seed, !!noNotif]);
  await page.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith(server.base)) return u.endsWith('sw.js') ? r.abort() : r.continue();
    if (ai && u.startsWith(AI)) return ai(r);
    return r.abort();
  });
  await page.goto(URL);
  await boot(page);
  return page;
}
async function boot(page) {
  await page.waitForSelector('#affGo', { state: 'visible', timeout: 5000 }).catch(() => {});
  if (await page.isVisible('#affGo')) await page.click('#affGo');
  await page.waitForTimeout(150);
  if (await page.isVisible('#nClose')) await page.click('#nClose');
}
async function reload(page) { await page.reload(); await boot(page); }
const state = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const byText = async (page, text) => (await state(page)).tasks.filter(t => t.text === text);
async function goCalendar(page) {
  if (await page.isVisible('#v-agenda')) return;
  await page.click('#menuBtn'); await page.click('.mitem[data-view="v-agenda"]');
  await page.waitForTimeout(150); if (await page.isVisible('#nClose')) await page.click('#nClose');
}
async function goToday(page) { await page.click('nav button[data-view="v-today"]'); await page.waitForTimeout(150); if (await page.isVisible('#nClose')) await page.click('#nClose'); }
// show one day in the calendar (through the month grid, like a person would)
async function showDay(page, k, view = 'day') {
  await goCalendar(page);
  await page.click('#cvTabs [data-cv="month"]');
  for (let i = 0; i < 3 && !(await page.$(`.mday[data-k="${k}"]`)); i++) await page.click('#wkNext');
  await page.click(`.mday[data-k="${k}"]`);
  if (view !== 'day') await page.click(`#cvTabs [data-cv="${view}"]`);
}
async function fillEditor(page, { text, when, date, start, end, kind, prio, cat }) {
  if (text !== undefined) await page.fill('#teText', text);
  if (kind) await page.click(`#teKind [data-v="${kind}"]`);
  if (cat) await page.click(`#teCat [data-v="${cat}"]`);
  if (when) await page.click(`#teWhen [data-w="${when}"]`);
  if (date) await page.fill('#teDate', date);
  if (start !== undefined) await page.fill('#teStart', start);
  if (end !== undefined) await page.fill('#teEnd', end);
  if (prio) await page.click(`#tePrio [data-v="${prio}"]`);
}
// the full editor for a new item (on screen it opens from the calendar's "+ Add" or from "Plan it" after Add)
const openNewEditor = page => page.evaluate(() => window.adhdwNewItem());
async function newTask(page, o) {
  await goToday(page);
  await openNewEditor(page);
  await fillEditor(page, Object.assign({ cat: o.kind === 'event' ? undefined : 'personal' }, o));
  await page.click('#teSave');
  if (await page.isVisible('#teWarn') && o.confirmOverlap) await page.click('#teSave');
  await page.waitForTimeout(150);
}
// quick add on Today: type → Add → Personal or Work (required before anything is saved)
async function quickAdd(page, text, cat = 'personal') {
  await goToday(page); await page.fill('#newTask', text); await page.click('#addForm button[type=submit]');
  await page.click(`#qaBox [data-qa="${cat}"]`); await page.waitForTimeout(100);
}
const blocks = (page, text) => page.$$eval('#events .blk', (els, t) => els.filter(e => e.textContent.includes(t)).map(e => ({ label: e.getAttribute('aria-label'), top: parseFloat(e.style.top), left: e.style.left })), text);
const rows = (page, sel, text) => page.$$eval(sel + ' li[data-tid]', (els, t) => els.filter(e => e.textContent.includes(t)).map(e => ({ id: e.dataset.tid, cls: e.className })), text);

// ---------- 1–9: create, show, move, re-date, complete, delete, persist ----------
test('1-6 + 9: scheduled task appears in the calendar, moves without duplicates, survives refresh', async () => {
  const p = await open();
  await newTask(p, { text: 'Doctor call', when: 'tomorrow', start: '10:00', end: '10:30' });
  let saved = await byText(p, 'Doctor call');
  assert.equal(saved.length, 1);
  assert.deepEqual([saved[0].date, saved[0].time, saved[0].dur], [TOMORROW, '10:00', 30]);
  const id = saved[0].id;

  await showDay(p, TOMORROW);                                              // 2: at 10:00 on the right date
  let b = await blocks(p, 'Doctor call');
  assert.equal(b.length, 1); assert.match(b[0].label, /10:00–10:30/);
  const top10 = b[0].top;

  await p.click('#events .blk'); await fillEditor(p, { start: '14:00', end: '14:30' }); await p.click('#teSave'); // 3
  await showDay(p, TOMORROW);
  b = await blocks(p, 'Doctor call');
  assert.equal(b.length, 1, 'moved, not duplicated');                    // 4
  assert.match(b[0].label, /14:00–14:30/); assert.ok(b[0].top > top10);
  saved = await byText(p, 'Doctor call'); assert.equal(saved.length, 1); assert.equal(saved[0].id, id);

  await p.click('#events .blk'); await fillEditor(p, { date: IN2 }); await p.click('#teSave'); // 5
  await showDay(p, TOMORROW); assert.equal((await blocks(p, 'Doctor call')).length, 0);       // 6
  await showDay(p, IN2); assert.equal((await blocks(p, 'Doctor call')).length, 1);

  await reload(p);                                                        // 9
  saved = await byText(p, 'Doctor call');
  assert.deepEqual([saved.length, saved[0].id, saved[0].date, saved[0].time, saved[0].dur], [1, id, IN2, '14:00', 30]);
  await showDay(p, IN2); assert.equal((await blocks(p, 'Doctor call')).length, 1);
  assert.deepEqual(p.errors, []);
});

test('7: completing a task updates it everywhere', async () => {
  const p = await open();
  await newTask(p, { text: 'Pay rent', when: 'today', start: '09:00', end: '09:15' });
  const [t] = await byText(p, 'Pay rent');
  await p.click(`#tasks li[data-tid="${t.id}"] [data-act="task"]`);       // tick in the Today list
  await p.waitForTimeout(200);
  assert.equal((await byText(p, 'Pay rent'))[0].done, true);
  assert.match((await rows(p, '#tasks', 'Pay rent'))[0].cls, /\bdone\b/);
  assert.match((await rows(p, '#dayEvents', 'Pay rent'))[0].cls, /\bdone\b/);  // Today's schedule
  await showDay(p, TODAY, 'week');
  assert.match((await rows(p, '#events', 'Pay rent'))[0].cls, /\bdone\b/);     // calendar
  await p.click('#cvTabs [data-cv="day"]');
  assert.match((await blocks(p, 'Pay rent'))[0].label, /done/);
  // un-check from the calendar → back to "to do" in the list too
  await p.click('#cvTabs [data-cv="week"]');
  await p.click(`#events li[data-tid="${t.id}"] [data-act="toggle"]`);
  await goToday(p);
  assert.doesNotMatch((await rows(p, '#tasks', 'Pay rent'))[0].cls, /\bdone\b/);
});

test('8: deleting a task removes it from the calendar', async () => {
  const p = await open();
  await newTask(p, { text: 'Gym class', when: 'tomorrow', start: '18:00', end: '19:00' });
  await showDay(p, TOMORROW);
  await p.click('#events .blk');
  await p.click('#teDel'); assert.equal(await p.textContent('#teDel'), 'Tap again to delete');
  await p.click('#teDel');
  assert.equal((await byText(p, 'Gym class')).length, 0);
  await showDay(p, TOMORROW); assert.equal((await blocks(p, 'Gym class')).length, 0);
  await reload(p); assert.equal((await byText(p, 'Gym class')).length, 0);
});

test('10: an unscheduled task stays accessible (Today, Calendar, after refresh)', async () => {
  const p = await open();
  await newTask(p, { text: 'Learn Spanish', when: 'none' });
  const [t] = await byText(p, 'Learn Spanish');
  assert.equal(t.date, null); assert.equal(t.time, null);
  assert.equal((await rows(p, '#someday', 'Learn Spanish')).length, 1);
  assert.equal(await p.textContent('#sdCount'), '1');
  await goCalendar(p); assert.equal((await rows(p, '#somedayCal', 'Learn Spanish')).length, 1);
  await reload(p); assert.equal((await byText(p, 'Learn Spanish')).length, 1);
  // "Plan it" gives it a day without creating a copy
  await goCalendar(p); await p.click('#somedayCal [data-act="plan"]');
  await fillEditor(p, { start: '11:00', end: '11:30' }); await p.click('#teSave');
  const after = await byText(p, 'Learn Spanish');
  assert.deepEqual([after.length, after[0].id, after[0].date, after[0].time], [1, t.id, TODAY, '11:00']);
});

test('11: overlapping tasks are warned about, both kept, shown side by side', async () => {
  const p = await open();
  await newTask(p, { text: 'Team meeting', when: 'tomorrow', start: '10:00', end: '11:00' });
  await goToday(p); await openNewEditor(p);
  await fillEditor(p, { text: 'Dentist', when: 'tomorrow', start: '10:30', end: '11:30', cat: 'personal' });
  await p.click('#teSave');
  assert.ok(await p.isVisible('#teWarn'), 'warning shown');
  assert.match(await p.textContent('#teWarn'), /Team meeting/);
  assert.equal((await byText(p, 'Dentist')).length, 0, 'not saved before confirming');
  await p.click('#teSave');                                              // "Save anyway"
  const s = await state(p);
  const a = s.tasks.find(t => t.text === 'Team meeting'), d = s.tasks.find(t => t.text === 'Dentist');
  assert.deepEqual([a.time, a.dur, d.time, d.dur], ['10:00', 60, '10:30', 60], 'nothing overwritten');
  await showDay(p, TOMORROW);
  const ba = (await blocks(p, 'Team meeting'))[0], bd = (await blocks(p, 'Dentist'))[0];
  assert.ok(ba && bd); assert.notEqual(ba.left, bd.left, 'side by side');
});

test('12: Day, Week and Month views all show the same task once', async () => {
  const p = await open();
  await newTask(p, { text: 'Haircut', when: 'tomorrow', start: '16:00', end: '17:00' });
  await showDay(p, TOMORROW, 'day'); assert.equal((await blocks(p, 'Haircut')).length, 1);
  await p.click('#cvTabs [data-cv="week"]');
  assert.equal((await rows(p, '#events', 'Haircut')).length, 1);
  assert.equal(await p.$eval(`#week .day[data-k="${TOMORROW}"] i`, e => e.className), 'has');
  await p.click('#cvTabs [data-cv="month"]');
  assert.equal(await p.$$eval(`.mday[data-k="${TOMORROW}"] .dots i`, e => e.length), 1);
  for (const v of ['day', 'week', 'month', 'week', 'day']) await p.click(`#cvTabs [data-cv="${v}"]`);
  assert.equal((await blocks(p, 'Haircut')).length, 1, 'switching views never duplicates');
  assert.equal((await byText(p, 'Haircut')).length, 1);
});

// ---------- 13–17 ----------
test('13: focus timer start, pause, resume, reset, survives page change and refresh', async () => {
  const p = await open();
  await p.click('#menuBtn'); await p.click('.mitem[data-view="v-focus"]');
  await p.click('.durs [data-min="5"]'); assert.equal(await p.textContent('#tTxt'), '5:00');
  await p.click('#tStart'); await p.waitForTimeout(2300);
  const run1 = await p.textContent('#tTxt'); assert.ok(run1 < '5:00', run1);
  await goToday(p); await p.click('#menuBtn'); await p.click('.mitem[data-view="v-focus"]');
  assert.equal(await p.textContent('#tStart'), 'Pause', 'still running after changing page');
  await p.click('#tStart'); const paused = await p.textContent('#tTxt');
  await p.waitForTimeout(1600); assert.equal(await p.textContent('#tTxt'), paused, 'pause holds');
  assert.equal(await p.textContent('#tStart'), 'Resume');
  await p.click('#tStart'); await p.waitForTimeout(1600);
  assert.ok(await p.textContent('#tTxt') < paused, 'resume counts down');
  await reload(p); await p.click('#menuBtn'); await p.click('.mitem[data-view="v-focus"]');
  assert.equal(await p.textContent('#tStart'), 'Pause', 'still running after refresh');
  await p.click('#tReset'); assert.equal(await p.textContent('#tTxt'), '5:00');
});

test('14: XP is never awarded twice for the same task', async () => {
  const p = await open();
  await quickAdd(p, 'Water plants');
  const [t] = await byText(p, 'Water plants'); const box = `#tasks li[data-tid="${t.id}"] [data-act="task"]`;
  await p.click(box); await p.waitForTimeout(100);
  let s = await state(p); const xp1 = s.xp; assert.ok(xp1 >= 10); assert.equal(s.wins, 1);
  await p.click('#overlay', { position: { x: 5, y: 5 } }).catch(() => {});
  await p.click(box); s = await state(p);
  assert.deepEqual([s.xp, s.wins, s.hist[TODAY]], [0, 0, 0], 'un-check takes back exactly what was given');
  await p.click(box); await p.click('#overlay', { position: { x: 5, y: 5 } }).catch(() => {});
  await p.click(box); await p.click(box); s = await state(p);
  assert.equal(s.wins, 1, 'check / uncheck / check = one win'); assert.ok(s.xp >= 10 && s.xp <= 40);
  await reload(p); assert.equal((await state(p)).wins, 1);
});

test('15: empty and invalid input is refused with a clear message', async () => {
  const p = await open();
  await goToday(p); await p.click('#addForm button[type=submit]');
  assert.equal((await state(p)).tasks.length, 0);
  assert.match(await p.textContent('#toast'), /Type what you want/);
  await openNewEditor(p); await p.click('#teSave');
  assert.match(await p.textContent('#teErr'), /name/); assert.equal(await p.getAttribute('#teText', 'aria-invalid'), 'true');
  await fillEditor(p, { text: 'Backwards', when: 'today', start: '15:00', end: '14:00' }); await p.click('#teSave');
  assert.match(await p.textContent('#teErr'), /end must be after the start/i);
  await fillEditor(p, { start: '', end: '10:00' }); await p.click('#teSave');
  assert.match(await p.textContent('#teErr'), /start time/i);
  assert.equal((await state(p)).tasks.length, 0, 'nothing invalid was saved');
  // a simple task needs only a title + Personal or Work
  await fillEditor(p, { text: 'Just this', end: '' }); await p.click('#teSave');
  assert.match(await p.textContent('#teErr'), /personal or work/i);
  assert.equal((await byText(p, 'Just this')).length, 0, 'not saved without a type');
  await fillEditor(p, { cat: 'work' }); await p.click('#teSave');
  assert.equal((await byText(p, 'Just this')).length, 1);
  assert.equal((await byText(p, 'Just this'))[0].cat, 'work');
  // damaged saved data is repaired instead of crashing or being deleted
  const q = await open({ state: { v: 2, name: 'T', onboarded: true, date: TODAY, tasks: [
    { id: 'a', text: 'Bad time', date: TODAY, time: '25:99', dur: 30 },
    { id: 'a', text: 'Same id', date: 'nope', time: '10:00' }] } });
  const s = await state(q);
  assert.equal(s.tasks.length, 2); assert.equal(s.tasks[0].time, null);
  assert.notEqual(s.tasks[0].id, s.tasks[1].id); assert.equal(s.tasks[1].date, null);
  assert.deepEqual(q.errors, []);
});

test('16: layouts fit small screens without sideways scrolling', async () => {
  const p = await open({ width: 320 });
  await newTask(p, { text: 'A rather long task name that should wrap nicely on a small phone', when: 'today', start: '08:00', end: '09:00', prio: 'high' });
  const fits = () => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  assert.ok(await fits(), 'today');
  await goCalendar(p);
  for (const v of ['day', 'week', 'month']) { await p.click(`#cvTabs [data-cv="${v}"]`); assert.ok(await fits(), v); }
  await p.click('#calAdd'); assert.ok(await p.isVisible('#teForm'));
  assert.ok(await p.evaluate(() => { const f = document.getElementById('teForm'); return f.scrollWidth <= f.clientWidth + 1; }), 'editor');
});

test('17: AI and notification failures are handled honestly', async () => {
  const p = await open({ ai: r => r.fulfill({ status: 500, contentType: 'application/json', body: '{"erreur":"down"}' }), noNotif: true });
  await p.click('nav button[data-view="v-coach"]');
  await p.fill('#coachInput', 'Add a task: buy milk'); await p.click('#coachSend');
  await p.waitForFunction(() => !document.getElementById('coachSend').disabled);
  assert.match(await p.textContent('#chat'), /nothing was changed/);
  assert.equal((await state(p)).tasks.length, 0);
  await quickAdd(p, 'Clean desk', 'work');
  await p.click('#tasks [data-act="split"]'); await p.waitForTimeout(400);
  assert.match(await p.textContent('#toast'), /couldn't be reached/);
  assert.equal((await byText(p, 'Clean desk'))[0].steps.length, 3);
  await goCalendar(p);
  assert.ok(await p.isVisible('#nPermNote')); assert.match(await p.textContent('#nPermNote'), /can't show lock-screen/);
});

// ---------- data safety + Noor ----------
test('old saved data (separate appointments list) is migrated, nothing lost', async () => {
  const p = await open({ state: { name: 'Old', onboarded: true, date: TODAY, xp: 120,
    tasks: [{ id: 't1', text: 'Old task', done: false, steps: [] }],
    events: [{ id: 'e1', title: 'Lawyer', date: TOMORROW, time: '9:30', alarm: true, fired: false },
             { id: 't1', title: 'Clashing id', date: TOMORROW, time: '12:00', alarm: false, fired: false }],
    projs: [{ id: 'p', name: 'Shop', plan: {}, ms: [{ id: 'm', title: 'Logo', date: TOMORROW, ev: 't1' }] }] } });
  const s = await state(p);
  assert.equal(s.v, 2); assert.equal(s.xp, 120); assert.equal(s.events.length, 0);
  const law = s.tasks.find(t => t.text === 'Lawyer');
  assert.deepEqual([law.id, law.kind, law.time, law.alarm], ['e1', 'event', '09:30', true]);
  assert.equal(s.tasks.find(t => t.text === 'Old task').date, TODAY);
  const clash = s.tasks.find(t => t.text === 'Clashing id');
  assert.notEqual(clash.id, 't1'); assert.equal(s.projs[0].ms[0].ev, clash.id, 'milestone still points at its appointment');
  await showDay(p, TOMORROW); assert.equal((await blocks(p, 'Lawyer')).length, 1);
  assert.deepEqual(p.errors, []);
});

test('alarm snooze delays the ring but never moves the appointment', async () => {
  const d = new Date(Date.now() - 60e3), hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
  const p = await open({ state: { v: 2, name: 'T', onboarded: true, date: ymd(d), voice: false, sound: false,
    tasks: [{ id: 'x', kind: 'event', text: 'Call bank', date: ymd(d), time: hm, dur: 30, alarm: true }] } });
  await p.waitForSelector('.pop.alarm', { timeout: 15000 });
  await p.click('[data-act="snooze"]');
  const t = (await state(p)).tasks[0];
  assert.deepEqual([t.date, t.time], [ymd(d), hm]); assert.ok(t.snoozeUntil > Date.now());
});

test('Noor: no duplicates, no invented success, schedule moves need a tap', async () => {
  const reply = { reponse: 'Done!', actions: [
    { type: 'ajouter_tache', texte: 'Buy milk', date: TODAY },
    { type: 'ajouter_tache', texte: 'Buy milk', date: TODAY },
    { type: 'proposer_horaire', texte: 'Buy milk', date: TOMORROW, heure: '17:00', duree: 20 },
    { type: 'cocher_tache', texte: 'Something that does not exist' }] };
  const p = await open({ ai: r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reply) }) });
  await p.click('nav button[data-view="v-coach"]');
  await p.fill('#coachInput', 'add buy milk'); await p.click('#coachSend');
  await p.waitForSelector('.msg.prop');
  let milk = await byText(p, 'Buy milk');
  assert.equal(milk.length, 1, 'added once'); assert.equal(milk[0].date, TODAY, 'not moved before confirming');
  const chat = await p.textContent('#chat');
  assert.match(chat, /already on the list/); assert.match(chat, /Couldn't do it: I couldn't find/);
  await p.click('.msg.prop [data-yes]');
  milk = await byText(p, 'Buy milk');
  assert.deepEqual([milk.length, milk[0].date, milk[0].time, milk[0].dur], [1, TOMORROW, '17:00', 20]);
  assert.match(await p.textContent('.msg.prop'), /Moved/);
});
