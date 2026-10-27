// ADHD Winner — phone app layer: backup export/import, missed alarms, notification ask, phone calendar, PWA files.
// Run with the rest:  npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }

const ROOT = path.resolve(__dirname, '..');
const KEY = 'bravo-v1';
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const plus = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const TODAY = plus(0), TOMORROW = plus(1), YESTERDAY = plus(-1);
const task = (id, text, extra) => Object.assign({ id, text, done: false, steps: [], date: TODAY, time: null, dur: null }, extra || {});
const base = extra => Object.assign({ v: 2, name: 'Tester', onboarded: true, date: TODAY, tasks: [], voice: false, sound: false }, extra || {});

let browser, server, URL;
test.before(async () => {
  const opts = {};
  const local = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
  try { fs.accessSync(local); opts.executablePath = local; } catch (e) {}
  browser = await chromium.launch(opts);
  server = await require('./serve')(); URL = server.base + 'index.html';
});
const ctxs = [];
test.afterEach(async () => { while (ctxs.length) await ctxs.pop().close().catch(() => {}); });
test.after(async () => { await browser.close(); server.close(); });

async function open({ state, width = 390, query = '', perms } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, acceptDownloads: true });
  ctxs.push(ctx);
  if (perms) await ctx.grantPermissions(perms, { origin: server.base });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  await page.addInitScript(([k, s]) => {
    if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(s));
    try { speechSynthesis.speak = () => {}; } catch (e) {}
    HTMLMediaElement.prototype.play = function () { return Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })); };
  }, [KEY, state || base()]);
  await page.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith(server.base)) return u.endsWith('sw.js') ? r.abort() : r.continue();
    return r.abort();
  });
  await page.goto(URL + query);
  await page.waitForSelector('#affGo', { state: 'visible', timeout: 5000 }).catch(() => {});
  if (await page.isVisible('#affGo')) await page.click('#affGo');
  await page.waitForTimeout(500);
  if (await page.isVisible('#nClose')) await page.click('#nClose');
  return page;
}
const state = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
async function goProfile(page) {
  await page.click('#menuBtn'); await page.click('.mitem[data-view="v-profile"]');
  await page.waitForTimeout(150); if (await page.isVisible('#nClose')) await page.click('#nClose');
}
async function exportFile(page) {
  await goProfile(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bkExport')]);
  const p = await dl.path();
  return { name: dl.suggestedFilename(), json: JSON.parse(fs.readFileSync(p, 'utf8')) };
}
async function importFile(page, obj, name = 'backup.json') {
  await goProfile(page);
  const buffer = Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj));
  await page.setInputFiles('#bkFile', { name, mimeType: 'application/json', buffer });
  await page.waitForSelector('#bkSheet:not([hidden])');
}
const backupOf = (data, extra) => Object.assign({ format: 'adhd-winner-backup', version: 1, exportedAt: new Date().toISOString(), data, audio: {} }, extra || {});

test('export: one JSON file with tasks, categories, times, reminders, preferences and XP', async () => {
  const page = await open({ state: base({
    xp: 120, wins: 9, streak: 3, badges: ['first'], hist: { [TODAY]: 2 },
    tasks: [task('a', 'Call the bank', { cat: 'work', prio: 'high' }), task('b', 'Dentist', { kind: 'event', time: '10:30', dur: 45, alarm: true, date: TOMORROW })],
    nudges: [{ id: 'water', emo: '💧', text: 'Drink a glass of water', every: 60, on: true, next: 0 }, { id: 'cx1', emo: '🔔', text: 'Stretch', every: 120, on: true, next: 0 }],
    hp: { mins: 5 }
  }) });
  const { name, json } = await exportFile(page);
  assert.match(name, /^adhd-winner-backup-\d{4}-\d{2}-\d{2}\.json$/);
  assert.equal(json.format, 'adhd-winner-backup');
  assert.equal(json.version, 1);
  const d = json.data;
  assert.equal(d.xp, 120); assert.equal(d.streak, 3); assert.deepEqual(d.badges, ['first']);
  const bank = d.tasks.find(t => t.id === 'a'), dent = d.tasks.find(t => t.id === 'b');
  assert.equal(bank.cat, 'work'); assert.equal(bank.prio, 'high');
  assert.equal(dent.time, '10:30'); assert.equal(dent.dur, 45); assert.equal(dent.alarm, true); assert.equal(dent.date, TOMORROW);
  assert.ok(d.nudges.some(n => n.text === 'Stretch' && n.every === 120));
  assert.equal(d.hp.mins, 5);
  assert.ok('cat' in json.prefs);
  assert.ok((await state(page)).lastBackup > 0, 'last backup date is remembered');
  assert.equal(await page.textContent('#bkLast'), 'Today');
  assert.match(await page.textContent('#bkMsg'), /Backup ready/);
  assert.deepEqual(page.errors, []);
});

test('import "Add to my data": new items added, existing ones skipped, no duplicates, XP not doubled', async () => {
  const page = await open({ state: base({ xp: 50, tasks: [task('a', 'Call the bank'), task('z', 'Water plants')] }) });
  const file = backupOf(base({ xp: 80, tasks: [task('a', 'Call the bank'), task('q', 'Water plants'), task('n1', 'Book flights'), task('n2', 'Gym', { kind: 'event', time: '18:00', date: TOMORROW })] }));
  await importFile(page, file);
  assert.match(await page.textContent('#bkBody'), /In the file/);
  await page.click('[data-bk="merge"]');
  await page.waitForSelector('.bkok');
  assert.match(await page.textContent('.bkok'), /2 items added, 2 already here/);
  const s = await state(page);
  assert.equal(s.tasks.length, 4);
  assert.equal(s.tasks.filter(t => t.text === 'Water plants').length, 1, 'same task with another id is not doubled');
  assert.equal(s.xp, 80, 'XP keeps the best value, never the sum');
  // the same file a second time adds nothing
  await page.click('[data-bk="close"]');
  await importFile(page, file);
  await page.click('[data-bk="merge"]');
  await page.waitForTimeout(300);
  assert.match(await page.textContent('#bkBody'), /Nothing new/);
  assert.equal((await state(page)).tasks.length, 4);
  assert.deepEqual(page.errors, []);
});

test('import "Replace": asks for a second tap, keeps the plan, and Undo brings the old data back', async () => {
  const page = await open({ state: base({ plan: 'free', name: 'Imen', xp: 10, tasks: [task('mine', 'My own task')] }) });
  await importFile(page, backupOf(base({ plan: 'business', name: 'Old', xp: 300, tasks: [task('f1', 'From the file')] })));
  await page.click('[data-bk="replace"]');
  assert.equal((await state(page)).tasks[0].text, 'My own task', 'first tap changes nothing');
  assert.match(await page.textContent('#bkReplace'), /Tap again/);
  await page.click('[data-bk="replace"]');
  await page.waitForSelector('.bkok');
  let s = await state(page);
  assert.deepEqual(s.tasks.map(t => t.text), ['From the file']);
  assert.equal(s.xp, 300);
  assert.equal(s.plan, 'free', 'a paid plan is never unlocked by a file');
  await page.click('[data-bk="undo"]');
  await page.waitForTimeout(200);
  s = await state(page);
  assert.deepEqual(s.tasks.map(t => t.text), ['My own task']);
  assert.equal(s.name, 'Imen'); assert.equal(s.xp, 10);
  assert.deepEqual(page.errors, []);
});

test('bad files are refused with a clear message and nothing changes', async () => {
  const page = await open({ state: base({ tasks: [task('a', 'Keep me')] }) });
  const cases = [
    ['not json at all', /can’t be read/],
    [JSON.stringify({ hello: 1 }), /not an ADHD Winner backup/],
    [JSON.stringify({ format: 'adhd-winner-backup', version: 99, data: base() }), /newer version/],
    [JSON.stringify({ format: 'adhd-winner-backup', version: 1, data: { tasks: 'oops' } }), /damaged/]
  ];
  for (const [txt, re] of cases) {
    await importFile(page, txt);
    assert.match(await page.textContent('.bkerr'), re);
    await page.click('[data-bk="close"]');
  }
  const s = await state(page);
  assert.deepEqual(s.tasks.map(t => t.text), ['Keep me']);
  assert.deepEqual(page.errors, []);
});

test('a hand-edited file cannot break the app (bad values are cleaned, text is never run as code)', async () => {
  const page = await open();
  await importFile(page, backupOf(base({
    name: '<img src=x onerror=alert(1)>', xp: -5, wins: 'many',
    tasks: [task('t1', '<b>bold</b>', { date: 'not-a-date', time: '99:99' }), task('t2', '   '), { nope: true }],
    nudges: [{ id: 'cx', text: 'Ok', every: 7 }, 'junk'], exps: [{ id: 'e', what: 'Taxi', amt: -3, date: TODAY }], projs: [{ id: 'p', name: 'Shop', ms: [{ id: 'm', title: 'Logo', date: 'x' }] }]
  })));
  await page.click('[data-bk="replace"]'); await page.click('[data-bk="replace"]');
  await page.waitForSelector('.bkok');
  const s = await state(page);
  assert.equal(s.xp, 0); assert.equal(s.wins, 0);
  assert.equal(s.tasks.length, 1); assert.equal(s.tasks[0].date, null); assert.equal(s.tasks[0].time, null);
  assert.equal(s.nudges.find(n => n.id === 'cx').every, 60);
  assert.equal(s.exps.length, 0); assert.equal(s.projs[0].ms.length, 0);
  await page.click('[data-bk="close"]');
  await page.click('nav button[data-view="v-today"]');
  assert.equal(await page.$('img[src="x"]'), null, 'the name is shown as text');
  assert.deepEqual(page.errors, []);
});

test('missed alarms are shown honestly on return, never marked done, no XP', async () => {
  const two = new Date(Date.now() - 2 * 3600e3);
  const t = pad(two.getHours()) + ':' + pad(two.getMinutes());
  const day = ymd(two);
  const page = await open({ state: base({ xp: 0, tasks: [task('m', 'Doctor call', { kind: 'event', date: day, time: t, dur: 30, alarm: true })] }) });
  await page.waitForSelector('.misspop', { timeout: 4000 });
  assert.match(await page.textContent('#pop'), /While you were away/);
  assert.match(await page.textContent('#pop'), /Doctor call/);
  await page.click('[data-miss="ok"]');
  const s = await state(page);
  const ev = s.tasks.find(x => x.id === 'm');
  assert.equal(ev.fired, true); assert.equal(ev.done, false); assert.equal(s.xp, 0);
  assert.ok(await page.isHidden('#overlay'));
  // not shown again after a refresh
  await page.reload(); await page.waitForTimeout(2000);
  if (await page.isVisible('#affGo')) await page.click('#affGo');
  await page.waitForTimeout(1800);
  assert.equal(await page.$('.misspop'), null);
  assert.deepEqual(page.errors, []);
});

test('notifications are asked for when an alarm is turned on, with an honest note, only after "Allow"', async () => {
  const page = await open({ state: base({ tasks: [task('e', 'Gym', { kind: 'event', date: TODAY, time: '23:58', dur: 1 })] }) });
  await page.click('#dayEvents [data-act="bell"][data-id="e"]');
  await page.waitForSelector('.askpop', { timeout: 4000 });
  assert.match(await page.textContent('#pop'), /Honest note/);
  await page.click('[data-nask="no"]');
  assert.ok(await page.isHidden('#overlay'));
  assert.ok((await state(page)).nAsk > 0);
  // not asked again for a few days
  await page.click('#dayEvents [data-act="bell"][data-id="e"]'); await page.click('#dayEvents [data-act="bell"][data-id="e"]');
  await page.waitForTimeout(1600);
  assert.equal(await page.$('.askpop'), null);
  assert.deepEqual(page.errors, []);
});

test('Profile shows the real state of the phone; with alerts allowed, the test button works', async () => {
  const page = await open({ perms: ['notifications'] });
  await goProfile(page);
  const txt = await page.textContent('#devBox');
  assert.match(txt, /App on home screen/); assert.match(txt, /Lock-screen alerts/);
  assert.match(txt, /On ✓/);
  assert.match(txt, /App closed: a web app cannot ring/);
  await page.click('[data-dev="test"]');
  assert.match(await page.textContent('#toast'), /Test sent|Could not/);
  assert.deepEqual(page.errors, []);
});

test('phone calendar: a timed item gives a valid .ics file with an alarm', async () => {
  const page = await open({ state: base({ tasks: [task('d', 'Dentist; check-up', { kind: 'event', date: TOMORROW, time: '09:15', dur: 45, alarm: true })] }) });
  await page.click('#menuBtn'); await page.click('.mitem[data-view="v-agenda"]');
  await page.waitForTimeout(150); if (await page.isVisible('#nClose')) await page.click('#nClose');
  await page.click('#cvTabs [data-cv="month"]'); await page.click(`.mday[data-k="${TOMORROW}"]`);
  await page.click('#events [data-act="edit"][data-id="d"]');
  assert.ok(await page.isVisible('#teIcs'));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#teIcs')]);
  const ics = fs.readFileSync(await dl.path(), 'utf8');
  const d = TOMORROW.replace(/-/g, '');
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.ok(ics.includes('DTSTART:' + d + 'T091500'));
  assert.ok(ics.includes('DTEND:' + d + 'T100000'));
  assert.ok(ics.includes('SUMMARY:Dentist\\; check-up'));
  assert.ok(ics.includes('BEGIN:VALARM'));
  // a new item has no button (nothing saved yet)
  await page.click('#tEd .x'); await page.click('#calAdd');
  assert.ok(await page.isHidden('#teIcs'));
  assert.deepEqual(page.errors, []);
});

test('home-screen shortcut opens the right page after the morning screen', async () => {
  const page = await open({ query: '?go=calendar' });
  await page.waitForTimeout(500);
  assert.ok(await page.isVisible('#v-agenda'));
  assert.ok(!(await page.evaluate(() => location.search)), 'the address is cleaned');
  assert.deepEqual(page.errors, []);
});

test('Profile fits a small phone without sideways scrolling', async () => {
  const page = await open({ width: 320 });
  await goProfile(page);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(over <= 0, 'sideways scroll: ' + over);
  await importFile(page, backupOf(base({ tasks: [task('x', 'A long task name that should wrap nicely on a small screen')] })));
  const over2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(over2 <= 0, 'sheet sideways scroll: ' + over2);
});

test('PWA files: manifest is complete, every icon and cached file exists', () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  for (const k of ['id', 'name', 'short_name', 'start_url', 'scope', 'display', 'background_color', 'theme_color']) assert.ok(m[k], k);
  assert.equal(m.display, 'standalone');
  assert.ok(m.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable'));
  assert.ok(m.icons.some(i => i.sizes === '192x192' && i.purpose === 'any'));
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(ROOT, i.src)), i.src);
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const shell = JSON.parse(sw.match(/const SHELL = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
  for (const f of shell) if (f !== './') assert.ok(fs.existsSync(path.join(ROOT, f)), 'cached file missing: ' + f);
  assert.match(sw, /notificationclick/);
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const s of html.matchAll(/apple-touch-startup-image[^>]*href="([^"]+)"/g)) assert.ok(fs.existsSync(path.join(ROOT, s[1])), s[1]);
});
