// ADHD Winner — tests for the October 28 brief:
// Personal / Work at creation, table view, one shared calendar, overlap note, Help me start in Arabic,
// Start Rate in Profile, XP only for real wins, delete needs two taps.
// Run with the rest:  npm test
const test = require('node:test');
const assert = require('node:assert/strict');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }

let URL, server, browser;
const KEY = 'bravo-v1';
const AI = 'https://mon-style.imendriss271982.workers.dev/';
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const plus = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const TODAY = plus(0), TOMORROW = plus(1), IN2 = plus(2), YESTERDAY = plus(-1);
const ok = body => r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
const down = r => r.fulfill({ status: 500, contentType: 'application/json', body: '{"erreur":"down"}' });

test.before(async () => {
  const opts = {};
  const local = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
  try { require('fs').accessSync(local); opts.executablePath = local; } catch (e) {}
  browser = await chromium.launch(opts);
  server = await require('./serve')(); URL = server.base + 'index.html';
});
test.after(async () => { await browser.close(); server.close(); });

const task = (id, text, extra) => Object.assign({ id, text, done: false, steps: [], date: TODAY, time: null, dur: null }, extra || {});
async function open({ tasks = [], width = 390, ai = down, extra = {} } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.errors = []; page.prompts = [];
  page.on('pageerror', e => page.errors.push(e.message));
  const seed = Object.assign({ v: 2, name: 'Tester', onboarded: true, date: TODAY, tasks, voice: false, sound: false }, extra);
  await page.addInitScript(([k, s]) => {
    if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(s));
    try { speechSynthesis.speak = () => {}; } catch (e) {}
    HTMLMediaElement.prototype.play = function () { return Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })); };
  }, [KEY, seed]);
  page.ai = ai;
  await page.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith(server.base)) return u.endsWith('sw.js') ? r.abort() : r.continue();
    if (u.startsWith(AI)) { try { page.prompts.push(JSON.parse(r.request().postData()).prompt); } catch (e) {} return page.ai(r); }
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
  await hush(page);
}
async function reload(page) { await page.reload(); await boot(page); }
const state = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const byText = async (page, text) => (await state(page)).tasks.filter(t => t.text === text);
async function goToday(page) { await page.click('nav button[data-view="v-today"]'); await page.waitForTimeout(150); await hush(page); }
// Noor's speech bubble can be mid-animation: close it if it is there, never wait on it
async function hush(page) { if (await page.isVisible('#nClose')) await page.click('#nClose', { timeout: 1500 }).catch(() => page.evaluate(() => { try { nourHush(); } catch (e) {} })); }
async function goView(page, v) { await page.click('#menuBtn'); await page.click(`.mitem[data-view="${v}"]`); await page.waitForTimeout(150); await hush(page); }
async function showDay(page, k) {
  if (!(await page.isVisible('#v-agenda'))) await goView(page, 'v-agenda');
  await page.click('#cvTabs [data-cv="month"]');
  for (let i = 0; i < 3 && !(await page.$(`.mday[data-k="${k}"]`)); i++) await page.click('#wkNext');
  await page.click(`.mday[data-k="${k}"]`);
}
const tableRows = page => page.$$eval('#tblBox tbody tr', trs => trs.map(tr => [...tr.children].map(c => c.textContent.trim())));
const fits = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const h = (page, act, extra = '') => page.click(`#hmsBody [data-h="${act}"]${extra}`);

// ---------- 1. Personal / Work right after typing ----------
test('quick add: Personal or Work is asked before saving; Cancel saves nothing; the time step is optional', async () => {
  const p = await open();
  await goToday(p);
  await p.fill('#newTask', 'Buy groceries'); await p.click('#addForm button[type=submit]');
  assert.ok(await p.isVisible('#qaBox [data-qa="personal"]')); assert.ok(await p.isVisible('#qaBox [data-qa="work"]'));
  assert.equal((await state(p)).tasks.length, 0, 'nothing saved before the choice');
  await p.click('#qaBox [data-qa="cancel"]');
  assert.equal((await state(p)).tasks.length, 0);
  assert.equal(await p.inputValue('#newTask'), 'Buy groceries', 'text is given back, not lost');

  await p.click('#addForm button[type=submit]'); await p.click('#qaBox [data-qa="personal"]');
  let [t] = await byText(p, 'Buy groceries');
  assert.deepEqual([t.cat, t.date, t.time], ['personal', TODAY, null], 'personal, today, unscheduled');
  assert.match(await p.textContent('#qaBox'), /Added to Personal/);
  // optional date & time: same task, no duplicate, the chosen day — not the day it was typed
  await p.click('#qaBox [data-qa="time"]');
  await p.click('#teWhen [data-w="tomorrow"]'); await p.fill('#teStart', '14:00'); await p.click('#teDurs [data-d="60"]');
  await p.click('#teSave');
  const all = await byText(p, 'Buy groceries');
  assert.equal(all.length, 1);
  assert.deepEqual([all[0].id, all[0].date, all[0].time, all[0].dur, all[0].cat], [t.id, TOMORROW, '14:00', 60, 'personal']);

  // planning from the "Tomorrow" tab files it under tomorrow
  await p.click('.dtabs [data-rel="1"]');
  await p.fill('#newTask', 'Finish a report'); await p.click('#addForm button[type=submit]'); await p.click('#qaBox [data-qa="work"]');
  [t] = await byText(p, 'Finish a report');
  assert.deepEqual([t.cat, t.date], ['work', TOMORROW]);
  // category can be changed later from the list
  await p.click(`#tasks li[data-tid="${t.id}"] [data-act="cat"]`);
  assert.equal((await byText(p, 'Finish a report'))[0].cat, 'personal');
  assert.deepEqual(p.errors, []);
});

// ---------- 2. Table view ----------
test('table view: toggle is remembered, shows every task with type/date/start/duration/status, same data as the list', async () => {
  const p = await open({ tasks: [
    task('a', 'Send an email', { cat: 'work', date: TOMORROW, time: '09:00', dur: 15 }),
    task('b', 'Buy groceries', { cat: 'personal', date: TOMORROW, time: '17:00', dur: 30 }),
    task('c', 'Prepare a report', { cat: 'work', date: IN2, time: '10:00', dur: 60 }),
    task('d', 'Old bill', { cat: 'personal', date: YESTERDAY }),
    task('e', 'Learn Spanish', { date: null })] });
  await goToday(p);
  assert.equal(await p.isVisible('#tblBox'), false, 'list is the default');
  await p.click('#vTog [data-lv="table"]');
  assert.ok(await p.isVisible('#tblBox')); assert.equal(await p.isVisible('#tasks'), false);
  let rows = await tableRows(p);
  assert.equal(rows.length, 5, 'tasks from every day, plus someday');
  const email = rows.find(r => r[0].includes('Send an email'));
  assert.equal(email[1], 'Work'); assert.equal(email[3], '09:00'); assert.equal(email[4], '15 min'); assert.equal(email[5], 'To do');
  assert.equal(rows.find(r => r[0].includes('Prepare a report'))[4], '1 h');
  assert.equal(rows[0][5], 'Late', 'sorted by status: late first');
  assert.equal(rows.find(r => r[0].includes('Learn Spanish'))[5], 'Someday');

  // sort by date, then filter Work
  await p.click('#tblBox [data-ts="date"]');
  rows = await tableRows(p); assert.match(rows[0][0], /Old bill/); assert.match(rows[rows.length - 1][0], /Learn Spanish/);
  await p.click('.cats [data-cat="work"]');
  rows = await tableRows(p); assert.deepEqual(rows.map(r => r[1]), ['Work', 'Work']);
  await p.click('.cats [data-cat="all"]');

  // remembered after closing the app
  await reload(p);
  assert.ok(await p.isVisible('#tblBox'), 'table view remembered');
  assert.equal(await p.getAttribute('#vTog [data-lv="table"]', 'aria-pressed'), 'true');

  // mark done from the table → done everywhere; un-tick gives the XP back
  await p.click('#tblBox tr[data-tid="a"] [data-act="toggle"]');
  await p.click('#overlay', { position: { x: 5, y: 5 } }).catch(() => {});
  let s = await state(p); assert.equal(s.tasks.find(t => t.id === 'a').done, true); const xp = s.xp; assert.ok(xp >= 10);
  assert.match(await p.textContent('#tblBox tr[data-tid="a"]'), /Done/);

  // postpone: next day, same time, no XP change
  await p.click('#tblBox tr[data-tid="b"] [data-act="later"]');
  s = await state(p); const b = s.tasks.find(t => t.id === 'b');
  assert.deepEqual([b.date, b.time, b.dur], [IN2, '17:00', 30]); assert.equal(s.xp, xp, 'postponing never costs XP');
  await p.click('#tblBox tr[data-tid="d"] [data-act="later"]');
  assert.equal((await state(p)).tasks.find(t => t.id === 'd').date, TOMORROW, 'a late task moves to tomorrow, not to the day after its old date');

  // change type from the table
  await p.click('#tblBox tr[data-tid="c"] [data-act="tcat"]');
  assert.equal((await state(p)).tasks.find(t => t.id === 'c').cat, 'personal');

  // open from the table → editor → the change shows in the calendar
  await p.click('#tblBox tr[data-tid="c"] .tname');
  await p.fill('#teStart', '15:00'); await p.click('#teDurs [data-d="30"]'); await p.click('#teSave');
  await showDay(p, IN2);
  assert.ok(await p.$$eval('#events .blk', els => els.some(e => /Prepare a report, 15:00–15:30/.test(e.getAttribute('aria-label')))));
  // back to list view
  await goToday(p); await p.click('#vTog [data-lv="list"]');
  assert.ok(await p.isVisible('#tasks')); assert.equal(await p.isVisible('#tblBox'), false);
  assert.deepEqual(p.errors, []);
});

test('table view stays readable on a 320 px phone (the table scrolls inside its box, the page does not)', async () => {
  const p = await open({ width: 320, tasks: [task('a', 'A rather long task name that should wrap', { cat: 'work', date: TODAY, time: '08:00', dur: 90 })] });
  await goToday(p); await p.click('#vTog [data-lv="table"]');
  assert.ok(await fits(p), 'no sideways page scroll');
  const box = await p.$eval('.tscroll', e => ({ sw: e.scrollWidth, cw: e.clientWidth }));
  assert.ok(box.sw > box.cw, 'the table itself can be swiped');
  const name = await p.$eval('#tblBox tbody th', e => getComputedStyle(e).position);
  assert.equal(name, 'sticky', 'task names stay visible while swiping');
});

// ---------- 3. Calendar uses the same data + overlap note ----------
test('calendar: a scheduled task shows at its time, editing from the calendar updates list and table, overlaps get a gentle note', async () => {
  const p = await open({ tasks: [task('r', 'Prepare a report', { cat: 'work', date: TOMORROW, time: '10:00', dur: 60 })] });
  await showDay(p, TOMORROW);
  assert.ok(await p.$$eval('#events .blk', els => els.some(e => /10:00–11:00/.test(e.getAttribute('aria-label')))));
  assert.equal(await p.isVisible('#calOvl .ovl'), false, 'no note without overlap');
  // add an overlapping item from the calendar
  await p.click('#calAdd'); await p.fill('#teText', 'Dentist'); await p.fill('#teDate', TOMORROW); await p.fill('#teStart', '10:30'); await p.fill('#teEnd', '11:00');
  await p.click('#teSave'); assert.ok(await p.isVisible('#teWarn')); await p.click('#teSave');
  assert.ok(await p.isVisible('#calOvl .ovl'), 'note in the calendar');
  assert.match(await p.textContent('#calOvl'), /These tasks overlap\. Would you like to adjust the schedule\?/);
  let s = await state(p);
  assert.deepEqual(s.tasks.map(t => t.time).sort(), ['10:00', '10:30'], 'nothing moved by itself');
  // the "Change" button opens the later item; moving it removes the note
  await p.click('#calOvl .ovl [data-act="edit"]');
  assert.equal(await p.inputValue('#teText'), 'Dentist');
  await p.fill('#teStart', '12:00'); await p.fill('#teEnd', '12:30'); await p.click('#teSave');
  await showDay(p, TOMORROW);
  assert.equal(await p.isVisible('#calOvl .ovl'), false);
  // the same edit is visible in the table
  await goToday(p);
  await p.waitForTimeout(1300); if (await p.isVisible('[data-nask="no"]')) await p.click('[data-nask="no"]'); // the alarm's one-time "lock screen?" question
  await p.click('#vTog [data-lv="table"]');
  const dent = (await tableRows(p)).find(r => r[0].includes('Dentist'));
  assert.equal(dent[3], '12:00');
  // "Keep both" hides the note for that exact overlap
  await p.click('#tblBox tr[data-tid="r"] .tname'); await p.fill('#teStart', '12:00'); await p.fill('#teEnd', '13:00'); await p.click('#teSave');
  if (await p.isVisible('#teWarn')) await p.click('#teSave');
  await showDay(p, TOMORROW);
  assert.ok(await p.isVisible('#calOvl .ovl'));
  await p.click('#calOvl [data-act="ovlok"]');
  assert.equal(await p.isVisible('#calOvl .ovl'), false);
  await reload(p); await showDay(p, TOMORROW);
  assert.equal(await p.isVisible('#calOvl .ovl'), false, '"Keep both" is remembered');
  assert.deepEqual(p.errors, []);
});

// ---------- 4. Help me start in Arabic ----------
test('Help me start in Arabic: right-to-left, Arabic buttons and steps, Noor asked to answer in Arabic, choice remembered', async () => {
  const p = await open({ tasks: [task('t1', 'كتابة التقرير الشهري', { cat: 'work' }), task('t2', 'Prepare my presentation', { cat: 'work' })] });
  await p.click('#hmsToday');
  await p.click('#hmsLang');
  assert.equal(await p.$eval('#hms .spanel', e => e.dir), 'rtl');
  assert.equal(await p.$eval('#hms .spanel', e => e.lang), 'ar');
  assert.equal(await p.textContent('#hmsTitle'), 'ساعدني أبدأ');
  assert.match(await p.textContent('#hmsBody'), /لا أستطيع البدء/);
  assert.equal(await p.textContent('#hmsLang'), 'English');
  await h(p, 'b', '[data-b="cant"]'); await h(p, 'task', '[data-id="t1"]');
  await p.waitForSelector('#hmsBody .hstep');
  assert.equal((await p.textContent('#hmsBody .hstep')).trim(), 'فتح المستند وكتابة عنوان مؤقت.', 'offline step in Arabic, matched from an Arabic task name');
  assert.match(p.prompts[0], /Modern Standard Arabic/);
  assert.match(await p.textContent('#hmsBody'), /تعذّر الوصول إلى نور/, 'honest offline label, in Arabic');
  await h(p, 'accept');
  assert.match(await p.textContent('#hmsBody'), /أنهيتُ هذه الخطوة/);
  assert.equal(await p.$eval('#hClock', e => e.dir), 'ltr', 'the clock stays readable');
  assert.ok(await fits(p));
  // the Today button follows the language
  await h(p, 'exit'); await h(p, 'o_stop'); await h(p, 'rs_keep');
  assert.equal(await p.textContent('#hmsToday b'), 'ساعدني أبدأ');
  assert.equal(await p.$eval('#hmsToday', e => e.dir), 'rtl');
  // remembered, and an English task name also gets an Arabic step
  await reload(p);
  await p.click('#hmsToday'); assert.equal(await p.$eval('#hms .spanel', e => e.dir), 'rtl');
  await h(p, 'skip'); await h(p, 'task', '[data-id="t2"]'); await p.waitForSelector('#hmsBody .hstep');
  assert.equal((await p.textContent('#hmsBody .hstep')).trim(), 'فتح ملف العرض وكتابة عنوان مؤقت.');
  // back to English from Profile; the rest of the app was never translated
  await p.click('#hms .shead .x');
  await goView(p, 'v-profile');
  assert.equal(await p.textContent('#v-profile .sechead h3'), 'Profile');
  await p.click('#hpBox [data-hp="lang"][data-v="en"]');
  assert.equal((await state(p)).hp.lang, 'en');
  await goToday(p); assert.equal(await p.textContent('#hmsToday b'), 'HELP ME START');
  assert.equal(await p.$eval('#hmsToday', e => e.dir), 'ltr');
  assert.deepEqual(p.errors, []);
});

test('Help me start in Arabic fits a 320 px phone in every screen of the journey', async () => {
  const p = await open({ width: 320, tasks: [task('t1', 'Reply to emails', { cat: 'work' })], extra: { hp: { lang: 'ar' } } });
  await p.click('#hmsToday'); assert.ok(await fits(p), 'blockers');
  await h(p, 'b', '[data-b="distracted"]'); assert.ok(await fits(p), 'pick');
  await h(p, 'task', '[data-id="t1"]'); await p.waitForSelector('#hmsBody .hstep'); assert.ok(await fits(p), 'step');
  await h(p, 'accept'); await h(p, 'go'); assert.ok(await fits(p), 'session');
  await h(p, 'hard'); assert.ok(await fits(p), 'adjust');
  await h(p, 'why'); assert.ok(await fits(p), 'why');
  await h(p, 'whychip', ':first-child');
  assert.ok((await p.inputValue('#hWhy')).length > 3);
  assert.deepEqual(p.errors, []);
});

// ---------- 5. Start Rate ----------
test('Start Rate: only real starts count, once per session, never task names in the export', async () => {
  const p = await open({ tasks: [task('t1', 'Secret medical letter', { cat: 'personal' }), task('t2', 'Pay rent', { cat: 'personal' })] });
  const goProfile = () => goView(p, 'v-profile');
  await goProfile();
  assert.match(await p.textContent('#srBox'), /No starts counted yet/);

  // 1) opened and closed without a step: not eligible
  await goToday(p); await p.click('#hmsToday'); await p.click('#hms .shead .x');
  // 2) step shown, "Start this step" tapped, but no real start, then stop → eligible, not started
  await p.click('#hmsToday'); await h(p, 'skip'); await h(p, 'task', '[data-id="t2"]'); await p.waitForSelector('#hmsBody .hstep');
  await h(p, 'accept'); await h(p, 'exit'); await h(p, 'o_stop'); await h(p, 'rs_keep');
  // 3) step shown, Start pressed twice (pause/resume) + refresh → one start
  await p.click('#hmsToday'); await h(p, 'skip'); await h(p, 'task', '[data-id="t1"]'); await p.waitForSelector('#hmsBody .hstep');
  await h(p, 'accept'); await h(p, 'go'); await h(p, 'go'); await h(p, 'go');
  await reload(p);
  await p.click('#hmsPill'); await h(p, 'did'); await h(p, 'finish');
  // 4) "I started" from the outcome screen counts too
  await p.click('#hmsToday'); await h(p, 'skip'); await h(p, 'task', '[data-id="t2"]'); await p.waitForSelector('#hmsBody .hstep');
  await h(p, 'accept'); await h(p, 'exit'); await h(p, 'o_started');

  const ss = Object.values((await state(p)).hl.ss);
  assert.equal(ss.length, 4);
  assert.equal(ss.filter(r => r.shown).length, 3, 'eligible = a step was shown');
  assert.equal(ss.filter(r => r.started).length, 2, 'started = Start / I started / step done, once each');
  assert.deepEqual(ss.map(r => r.res).sort(), ['abandoned', 'completed_step', 'started', 'stopped']);

  await goProfile();
  assert.match(await p.textContent('#srBox .srbig'), /67%/);
  assert.match(await p.textContent('#srBox'), /2 of 3 sessions/);
  assert.match(await p.textContent('#srBox .srrow'), /2\s*different tasks started/);

  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#srExport')]);
  const txt = require('fs').readFileSync(await dl.path(), 'utf8');
  const out = JSON.parse(txt);
  assert.equal(out.summary.rate, 67); assert.equal(out.sessions.length, 4);
  assert.doesNotMatch(txt, /Secret|medical|Pay rent|Tester/, 'no task names, no first name');
  assert.deepEqual(p.errors, []);
});

// ---------- 6. XP for real wins only ----------
test('XP: a small step gives a quiet toast (no pop-up); a challenge is never credited twice in a day', async () => {
  const p = await open({ tasks: [task('t1', 'Tidy desk', { cat: 'personal', steps: [{ t: 'Clear one corner', done: false }, { t: 'Wipe it', done: false }] })],
    extra: { xp: 40, wins: 3, badges: ['first'] } }); // the very first win unlocks a trophy, which is a real milestone with its pop-up
  await goToday(p);
  await p.click('#tasks li[data-tid="t1"] [data-act="step"][data-i="0"]');
  await p.waitForTimeout(150);
  assert.equal(await p.isVisible('#overlay'), false, 'no full-screen pop-up for a micro-step');
  assert.match(await p.textContent('#toast'), /XP · Small step done/);
  let s = await state(p); const afterStep = s.xp; assert.ok(afterStep >= 5);

  // water challenge: 8 → win, untick → XP back, re-tick → win once again (net: one win)
  const water = '#chal [data-act="cplus"]';
  for (let i = 0; i < 8; i++) { await p.click(water); }
  await p.click('#overlay', { position: { x: 5, y: 5 } }).catch(() => {});
  s = await state(p); const xp1 = s.xp, w1 = s.wins; assert.ok(xp1 >= afterStep + 15);
  await p.click('#chal [data-act="cminus"]');
  s = await state(p); assert.equal(s.xp, afterStep, 'untick takes back exactly what was given'); assert.equal(s.wins, w1 - 1);
  await p.click(water); await p.click('#overlay', { position: { x: 5, y: 5 } }).catch(() => {});
  s = await state(p); assert.equal(s.wins, w1, 'tick / untick / tick = one win');
  await reload(p); assert.equal((await state(p)).wins, w1);
  assert.deepEqual(p.errors, []);
});

// ---------- 7. Delete needs two taps ----------
test('delete from a list asks for a second tap; nothing is deleted by one tap', async () => {
  const p = await open({ tasks: [task('t1', 'Keep me', { cat: 'personal', time: '09:00', dur: 30 })] });
  await goToday(p);
  await p.click('#tasks li[data-tid="t1"] [data-act="del"]');
  assert.equal((await state(p)).tasks.length, 1, 'one tap: still there');
  assert.equal(await p.textContent('#tasks li[data-tid="t1"] [data-act="del"]'), 'Delete?');
  await p.waitForTimeout(3700);
  assert.equal(await p.textContent('#tasks li[data-tid="t1"] [data-act="del"]'), '×', 'disarms by itself');
  await p.click('#tasks li[data-tid="t1"] [data-act="del"]'); await p.click('#tasks li[data-tid="t1"] [data-act="del"]');
  assert.equal((await state(p)).tasks.length, 0);
  assert.match(await p.textContent('#toast'), /Deleted: Keep me/);
  assert.deepEqual(p.errors, []);
});

// ---------- 8. Home page without Noor ----------
test('Today (home page) shows no Noor and no Noor bubble; she is back on other pages', async () => {
  const p = await open({ tasks: [task('t1', 'Pay rent', { cat: 'personal' })] });
  await p.waitForTimeout(600);
  assert.equal(await p.isVisible('#fab'), false, 'no Noor on Today after opening');
  assert.equal(await p.isVisible('#nBubble'), false, 'no Noor message on Today');
  await goView(p, 'v-agenda');
  assert.ok(await p.isVisible('#fab'), 'Noor is on the calendar');
  await goToday(p);
  assert.equal(await p.isVisible('#fab'), false); assert.equal(await p.isVisible('#nBubble'), false);
  assert.deepEqual(p.errors, []);
});
