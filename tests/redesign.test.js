// Business redesign (Oct 28) — end-to-end tests: dashboard, add by voice or text, projects & milestones, Pending, weekly review.
// Covers the 18 acceptance scenarios of the AI Business Brain brief. Run with the rest:  npm test
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
const TODAY = plus(0), TOMORROW = plus(1), YESTERDAY = plus(-1), IN5 = plus(5);
const ok = body => r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
const down = r => r.fulfill({ status: 500, contentType: 'application/json', body: '{"erreur":"down"}' });
// every day, almost all day: slot tests don't depend on the hour the tests run
const CFG = { from: '00:00', to: '23:45', days: [0, 1, 2, 3, 4, 5, 6], rem: 10, set: true };
const biz = (id, text, b, extra) => Object.assign({ id, text, done: false, steps: [], date: null, time: null, dur: null, cat: 'work',
  biz: Object.assign({ urgent: false, imp: 'med', conseq: 'med', deadline: null, est: 30, status: 'todo', deps: [], notes: [], hist: [], created: Date.now() - 864e5, ord: 0 }, b || {}) }, extra || {});

test.before(async () => {
  const opts = {};
  const local = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
  try { require('fs').accessSync(local); opts.executablePath = local; } catch (e) {}
  browser = await chromium.launch(opts);
  server = await require('./serve')(); URL = server.base + 'index.html';
});
const ctxs = [];
test.afterEach(async () => { while (ctxs.length) await ctxs.pop().close().catch(() => {}); });
test.after(async () => { await browser.close(); server.close(); });

async function open({ tasks = [], width = 390, ai = down, extra = {}, plan = 'business', noNotif = false, perms } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, acceptDownloads: true });
  ctxs.push(ctx);
  if (perms) await ctx.grantPermissions(perms, { origin: server.base });
  const page = await ctx.newPage();
  page.errors = []; page.prompts = [];
  page.on('pageerror', e => page.errors.push(e.message));
  const seed = Object.assign({ v: 2, name: 'Tester', onboarded: true, date: TODAY, tasks, voice: false, sound: false, plan, bizCfg: CFG }, extra);
  await page.addInitScript(([k, s, nn]) => {
    if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(s));
    try { speechSynthesis.speak = () => {}; } catch (e) {}
    HTMLMediaElement.prototype.play = function () { return Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })); };
    if (nn) { delete window.Notification; }
  }, [KEY, seed, noNotif]);
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
async function hush(page) { if (await page.isVisible('#nClose')) await page.click('#nClose', { timeout: 1500 }).catch(() => page.evaluate(() => { try { nourHush(); } catch (e) {} })); }
// the app may ask about lock-screen alerts after a first reminder, or ring a reminder that is already due: answer it like a person would
async function clearPop(page) {
  await page.waitForTimeout(1500);
  if (await page.isVisible('#pop [data-nask="no"]')) await page.click('#pop [data-nask="no"]');
  if (await page.isVisible('#pop [data-act="snooze"]')) await page.click('#pop [data-act="snooze"]');
}
async function reload(page) { await page.reload(); await boot(page); }
const state = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
async function goBiz(page, tab) {
  if (!(await page.isVisible('#v-biz'))) { await page.click('#menuBtn'); await page.click('.mitem.mbiz'); await page.waitForTimeout(150); await hush(page); }
  if (tab) { await page.click(`#bzTabs [data-bz="${tab}"]`); await page.waitForTimeout(100); }
}
const fits = page => page.evaluate(() => {
  if (document.documentElement.scrollWidth > innerWidth + 1) return false;
  for (const e of document.querySelectorAll('body *')) {
    if (e.closest('.tscroll,.nfx,.ndock,.bztabs,[hidden]') || !e.getClientRects().length) continue;
    const st = getComputedStyle(e); if (st.position === 'fixed' || st.visibility === 'hidden') continue;
    const r = e.getBoundingClientRect(); if (r.width && r.right > innerWidth + 1) return false;
  }
  return true;
});

const PROJS = [{ id: 'pA', name: 'Website launch', imp: 'high', plan: {}, ms: [] }, { id: 'pB', name: 'Client acquisition', imp: 'high', plan: {}, ms: [] }, { id: 'pC', name: 'New product', imp: 'med', plan: {}, ms: [] }];
// the brief's example: 3 projects, 7 tasks; listed in a mixed order on purpose (project C first)
const SIX = () => [
  biz('c1', 'Research competitors', { proj: 'pC', imp: 'low', conseq: 'low', est: 60, ord: 0 }),
  biz('c2', "Confirm the supplier's price", { proj: 'pC', imp: 'high', conseq: 'med', est: 15, ord: 1 }),
  biz('c3', 'Finalise the launch budget', { proj: 'pC', imp: 'high', conseq: 'high', est: 60, deadline: IN5, deps: ['c2'], ord: 2 }),
  biz('b1', 'Send a proposal to a potential client', { proj: 'pB', imp: 'high', conseq: 'high', est: 20, deadline: TODAY, ord: 3 }),
  biz('b2', 'Prepare a marketing strategy', { proj: 'pB', imp: 'med', conseq: 'med', est: 180, ord: 4 }),
  biz('a1', 'Fix the payment problem', { proj: 'pA', urgent: true, imp: 'high', conseq: 'high', est: 30, deadline: TOMORROW, ord: 5 }),
  biz('a2', 'Improve homepage design', { proj: 'pA', imp: 'med', conseq: 'low', est: 120, ord: 6 }),
];
const brain = p => p.textContent('#bzBody .brain');
const topTitle = p => p.textContent('#bzBody .brtop h3');
const nextTitles = p => p.$$eval('#bzBody .brnext .grow > b', els => els.map(e => e.textContent));


const ROOT = '#bzBody';
const tile = (p, v) => p.textContent(`${ROOT} .bztile[data-bza="tile"][data-v="${v}"] b`);
const FAKE_SR = () => {
  // a fake speech recogniser: says what the test put in window.__say, with a confidence
  window.SpeechRecognition = window.webkitSpeechRecognition = class { start() { setTimeout(() => { const r = [{ transcript: window.__say, confidence: window.__conf || 0.9 }]; r.isFinal = true; this.onresult && this.onresult({ resultIndex: 0, results: [r] }); setTimeout(() => this.onend && this.onend(), 20); }, 30); } stop() { this.onend && this.onend(); } };
};

test('dashboard: Your Priority first, four real numbers, add (speak / write), projects, weekly ring, coach; Pending is the last tab', async () => {
  const p = await open({ tasks: SIX().concat([
    biz('d1', 'Old done', { proj: 'pA' }, { done: true, doneAt: Date.now() - 3600e3 }),
    biz('o1', 'Overdue quote', { deadline: YESTERDAY, imp: 'high', conseq: 'high' })]), extra: { projs: PROJS } });
  await goBiz(p, 'dash');
  const order = await p.$$eval(`${ROOT} > *`, els => els.map(e => e.className.split(' ').find(c => /^(bzask|bzmain|bztiles|bzadd|bzsec|bzring|bzrow)$/.test(c)) || e.className));
  assert.deepEqual(order.slice(0, 3), ['bzmain', 'bztiles', 'bzadd']);
  assert.match(await p.textContent(`${ROOT} .yp`), /Your priority/);
  assert.ok(await p.isVisible(`${ROOT} .yp [data-bza="start"]`)); assert.match(await p.textContent(`${ROOT} .yp [data-bza="start"]`), /Help Me Start/);
  assert.equal(await tile(p, 'overdue'), '1'); assert.equal(await tile(p, 'done'), '1');
  assert.equal(await tile(p, 'blocked'), '1', 'Finalise the launch budget waits for the supplier price');
  assert.equal(await tile(p, 'today'), '1', 'the proposal is due today');
  await p.click(`${ROOT} .bztile[data-v="blocked"]`);
  assert.match(await p.textContent('#bzSheet'), /Finalise the launch budget[\s\S]*waiting for “Confirm the supplier's price”/);
  await p.click('#bzSheet [data-bzclose].x');
  assert.ok(await p.isVisible(`${ROOT} [data-bza="cap"][data-v="voice"]`)); assert.ok(await p.isVisible(`${ROOT} [data-bza="cap"][data-v="write"]`));
  assert.match(await p.textContent(`${ROOT} .bzring`), /This week/);
  assert.ok(await p.isVisible(`${ROOT} [data-bza="tab"][data-v="coach"]`));
  const tabs = await p.$$eval('#bzTabs [data-bz]', b => b.map(x => x.dataset.bz));
  assert.equal(tabs[tabs.length - 1], 'pend');
  assert.ok(await p.isVisible('#bzTabs [data-bz="projects"]'));
  assert.deepEqual(p.errors, []);
});

test('override: "Not this one" → pick another; it wins for today; back to the AI pick', async () => {
  const p = await open({ tasks: SIX(), extra: { projs: PROJS } });
  await goBiz(p, 'dash');
  const ai = await p.textContent(`${ROOT} .yp h3`);
  await p.click(`${ROOT} .yp [data-bza="pick"]`);
  await p.click(`#bzSheet [data-bza="pickset"][data-id="b2"]`);
  assert.equal(await p.textContent(`${ROOT} .yp h3`), 'Prepare a marketing strategy');
  assert.match(await p.textContent(`${ROOT} .yp`), new RegExp('your choice[\\s\\S]*The AI would pick “' + ai));
  await reload(p); await goBiz(p, 'dash');
  assert.equal(await p.textContent(`${ROOT} .yp h3`), 'Prepare a marketing strategy', 'kept after refresh');
  await p.click(`${ROOT} [data-bza="pickclear"]`);
  assert.equal(await p.textContent(`${ROOT} .yp h3`), ai);
  assert.deepEqual(p.errors, []);
});

test('write several tasks → review → add: exact time in calendar with reminder, deadline kept, nothing invented, no duplicates', async () => {
  const p = await open({ tasks: [biz('x', 'Follow up with the factory')], extra: { projs: PROJS } });
  await goBiz(p, 'dash');
  await p.click(`${ROOT} [data-bza="cap"][data-v="write"]`);
  await p.fill('#capTxt', 'Email the client at 5 PM today, call the supplier tomorrow morning and follow up with the factory. Finish the quotation for client acquisition before Friday. This is urgent.');
  await p.click('#bzSheet [data-bza="caprun"]');
  await p.waitForSelector('#bzSheet .capl');
  const sheet = await p.textContent('#bzSheet');
  assert.match(sheet, /rules engine \(Noor's AI is offline\)/);
  assert.equal((await p.$$('#bzSheet .capi')).length, 4);
  assert.match(sheet, /Already in your list/);
  assert.equal(await p.inputValue('#bzSheet [data-cp="time"][data-i="0"]'), '17:00');
  assert.equal(await p.inputValue('#bzSheet [data-cp="time"][data-i="1"]'), '', 'morning ≠ an invented time');
  // the person corrects one title before adding
  await p.fill('#bzSheet [data-cp="text"][data-i="1"]', 'Call the supplier about prices');
  await p.click('#bzSheet [data-bza="capadd"]');
  await p.click('#bzSheet [data-bza="capadd"]').catch(() => {}); // a second tap must not duplicate
  await clearPop(p);
  const s = await state(p), bt = s.tasks.filter(t => t.biz);
  assert.equal(bt.length, 4, '3 new + the existing one, no duplicate');
  const em = bt.find(t => t.text === 'Email the client');
  assert.equal(em.date, TODAY); assert.equal(em.time, '17:00'); assert.equal(em.alarm, true); assert.equal(em.remBefore, 10); assert.equal(em.cat, 'work');
  assert.equal(em.biz.imp, null, 'importance not guessed: the Brain will ask');
  const cs = bt.find(t => t.text === 'Call the supplier about prices');
  assert.equal(cs.time, null); assert.ok(cs.date > TODAY);
  const q = bt.find(t => /quotation/.test(t.text));
  assert.equal(q.biz.urgent, true); assert.equal(q.biz.proj, 'pB'); assert.ok(q.biz.deadline); assert.equal(q.date, null);
  assert.deepEqual(p.errors, []);
});

test('AI organizes, but a time it adds that was not said is removed; AI garbage → rules engine', async () => {
  const p = await open({ ai: r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tasks: [{ title: 'Call the supplier', date: TOMORROW, time: '09:00' }] }) }) });
  await goBiz(p, 'dash');
  await p.click(`${ROOT} [data-bza="cap"][data-v="write"]`);
  await p.fill('#capTxt', 'Call the supplier tomorrow morning');
  await p.click('#bzSheet [data-bza="caprun"]');
  await p.waitForSelector('#bzSheet .capl');
  assert.match(await p.textContent('#bzSheet'), /Organized by Noor \(AI\)[\s\S]*A time the AI added was removed/);
  assert.equal(await p.inputValue('#bzSheet [data-cp="time"][data-i="0"]'), '');
  assert.equal(await p.inputValue('#bzSheet [data-cp="date"][data-i="0"]'), TOMORROW);
  assert.match(p.prompts[0], /Use ONLY dates and times the person said/);
  // malformed answer
  p.ai = r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"nope":1}' });
  await p.click('#bzSheet [data-bza="capback"]');
  await p.click('#bzSheet [data-bza="caprun"]');
  await p.waitForSelector('#bzSheet .capl');
  assert.match(await p.textContent('#bzSheet'), /rules engine/);
  assert.deepEqual(p.errors, []);
});

test('speak: several tasks in one recording; low confidence is flagged; nothing saved before the review', async () => {
  const p = await open({});
  await p.evaluate(FAKE_SR);
  await p.evaluate(() => { window.__say = 'send the invoice to Ali at 10:30 tomorrow and prepare the presentation'; window.__conf = 0.4; });
  await goBiz(p, 'dash');
  await p.click(`${ROOT} [data-bza="cap"][data-v="voice"]`);
  await p.waitForFunction(() => (document.querySelector('#capTxt') || {}).value && /presentation/.test(document.querySelector('#capTxt').value));
  assert.equal((await state(p)).tasks.length, 0, 'nothing saved yet');
  await p.click('#bzSheet [data-bza="caprun"]');
  await p.waitForSelector('#bzSheet .capl');
  assert.equal((await p.$$('#bzSheet .capi')).length, 2);
  assert.match(await p.textContent('#bzSheet'), /Check what I heard/);
  assert.equal(await p.inputValue('#bzSheet [data-cp="time"][data-i="0"]'), '10:30');
  // no speech API: told plainly, typing still works
  const q = await open({});
  await q.evaluate(() => { delete window.webkitSpeechRecognition; delete window.SpeechRecognition; });
  await goBiz(q, 'dash');
  await q.click(`${ROOT} [data-bza="cap"][data-v="voice"]`);
  assert.match(await q.textContent('#capSt'), /not available in this browser/);
  assert.ok(await q.isVisible('#capTxt'));
  assert.deepEqual(p.errors.concat(q.errors), []);
});

test('New project → AI organizes milestones WITH tasks inside → created in the project; add a task straight into a milestone; progress; Extra Notes', async () => {
  const plan = { name: 'Launch a new website', milestones: [
    { title: 'Finalize the design', deliverable: 'Approved mock-ups', date: null, tasks: [{ title: 'Draw the home page', minutes: 60 }, { title: 'Choose the colors', minutes: 30 }] },
    { title: 'Approve the content', deliverable: 'Final texts', date: null, tasks: [{ title: 'Write the About page' }] },
    { title: 'Deliver the website', deliverable: 'Live site', date: null, tasks: [] }] };
  const p = await open({ ai: ok(plan) });
  await goBiz(p, 'dash');
  await p.click(`${ROOT} [data-bza="newproj"]`);
  await p.fill('#capTxt', 'Launch a new website in four weeks.');
  await p.click('#bzSheet [data-bza="caprun"]');
  await p.waitForSelector('#cpName');
  assert.match(p.prompts[0], /project manager[\s\S]*2 to 5 concrete tasks/);
  assert.equal(await p.inputValue('#cpDl'), plus(28));
  assert.equal(await p.inputValue('#bzSheet [data-cpm="tasks"][data-i="0"]'), 'Draw the home page\nChoose the colors');
  assert.match(await p.textContent('#bzSheet'), /suggested[\s\S]*proposed by the AI/);
  await p.fill('#bzSheet [data-cpm="tasks"][data-i="2"]', 'Test on phones');
  await p.click('#bzSheet [data-bza="cpsave"]');
  await clearPop(p);
  let s = await state(p); const pr = s.projs[0];
  assert.equal(pr.ms.length, 3); assert.equal(pr.ms[2].date, plus(28), 'last milestone = final deadline');
  const pt = s.tasks.filter(t => t.biz && t.biz.proj === pr.id);
  assert.equal(pt.length, 4);
  const draw = pt.find(t => t.text === 'Draw the home page');
  assert.equal(draw.biz.ms, pr.ms[0].id); assert.equal(draw.biz.deadline, pr.ms[0].date, 'task due by its milestone');
  assert.equal(pt.find(t => t.text === 'Test on phones').biz.ms, pr.ms[2].id);
  // the project page is open: milestones with their tasks inside
  assert.equal(await p.getAttribute('#bzTabs [data-bz="projects"]', 'aria-selected'), 'true');
  const page = await p.textContent(ROOT);
  assert.match(page, /1\. Finalize the design[\s\S]*Draw the home page[\s\S]*Choose the colors[\s\S]*2\. Approve the content[\s\S]*Write the About page/);
  assert.match(page, /Next task: Draw the home page/);
  // add a task directly into milestone 2, with a day and time said
  await p.fill(`${ROOT} [data-pjadd="${pr.id}|${pr.ms[1].id}"] input`, 'Call the printer tomorrow at 10:30');
  await p.press(`${ROOT} [data-pjadd="${pr.id}|${pr.ms[1].id}"] input`, 'Enter');
  await clearPop(p);
  s = await state(p); const call = s.tasks.find(t => t.text === 'Call the printer');
  assert.equal(call.biz.ms, pr.ms[1].id); assert.equal(call.date, TOMORROW); assert.equal(call.time, '10:30'); assert.equal(call.alarm, true);
  // done in the project → progress from real data (3 milestones + 5 tasks = 8 units)
  await p.click(`${ROOT} .pjt [data-bza="done"][data-id="${draw.id}"]`);
  await clearPop(p);
  await goBiz(p, 'dash');
  assert.match(await p.textContent(`${ROOT} .bzproj`), /13%[\s\S]*Next: Finalize the design/);
  // Extra Notes kept after refresh
  await p.click(`${ROOT} .bzproj`);
  await p.fill(`${ROOT} textarea[data-pf="extra"]`, 'Client wants a dark theme');
  await reload(p);
  s = await state(p); assert.equal(s.projs[0].plan.extra, 'Client wants a dark theme');
  assert.deepEqual(p.errors, []);
});

test('Organize with AI on an existing project adds milestones and tasks without duplicates; offline = steps you said', async () => {
  const proj = { id: 'pX', name: 'Open a shop', plan: { goal: 'Sell abayas online' }, deadline: plus(30), ms: [{ id: 'mA', title: 'Register the company', date: plus(5), done: false }] };
  const p = await open({ tasks: [biz('k1', 'Fill the form', { proj: 'pX', ms: 'mA' })], extra: { projs: [proj] }, ai: ok({ milestones: [
    { title: 'Register the company', tasks: [{ title: 'Fill the form' }, { title: 'Pay the fee' }] }, { title: 'Build the store', tasks: [{ title: 'Choose a platform' }] }] }) });
  await goBiz(p, 'projects');
  await p.click(`${ROOT} [data-bza="proj"][data-id="pX"]`);
  await p.click(`${ROOT} [data-bza="pjorg"]`);
  assert.match(await p.inputValue('#capTxt'), /Project: Open a shop\. Goal: Sell abayas online/);
  await p.click('#bzSheet [data-bza="caprun"]'); await p.waitForSelector('#bzSheet [data-cpm="tasks"]');
  await p.click('#bzSheet [data-bza="cpsave"]');
  const s = await state(p), pp = s.projs[0];
  assert.equal(pp.ms.length, 2, 'existing milestone reused, one added');
  const ts = s.tasks.filter(t => t.biz && t.biz.proj === 'pX').map(t => t.text).sort();
  assert.deepEqual(ts, ['Choose a platform', 'Fill the form', 'Pay the fee'], 'no duplicate task');
  assert.equal(s.tasks.find(t => t.text === 'Pay the fee').biz.ms, 'mA');
  // offline: the steps the person said become milestones, nothing else invented
  const q = await open({});
  await goBiz(q, 'projects');
  await q.click(`${ROOT} [data-bza="newproj"][data-v="write"]`);
  await q.fill('#capTxt', 'Open the shop. First get the licence by 5 December, then hire staff.');
  await q.click('#bzSheet [data-bza="caprun"]'); await q.waitForSelector('#cpName');
  assert.match(await q.textContent('#bzSheet'), /rules engine/);
  assert.equal((await q.$$('#bzSheet [data-cpm="title"]')).length, 2);
  assert.equal(await q.inputValue('#bzSheet [data-cpm="tasks"][data-i="0"]'), '');
  assert.deepEqual(p.errors.concat(q.errors), []);
});

test('milestone at risk / overdue: a warning only when real dates say so', async () => {
  const proj = { id: 'pR', name: 'Fair stand', imp: 'high', plan: {}, deadline: plus(20), ms: [{ id: 'm1', title: 'Book the stand', date: YESTERDAY, done: false }, { id: 'm2', title: 'Print banners', date: plus(10), done: false }] };
  const ok = { id: 'pO', name: 'Calm project', plan: {}, ms: [{ id: 'm3', title: 'Write brief', date: plus(30), done: false }] };
  const p = await open({ tasks: [biz('r1', 'Call the venue', { proj: 'pR', ms: 'm1' }), biz('r2', 'Brief writer', { proj: 'pO' })], extra: { projs: [proj, ok] } });
  await goBiz(p, 'dash');
  const cards = await p.$$eval(`${ROOT} .bzproj`, els => els.map(e => ({ t: e.textContent, risk: e.classList.contains('risk') })));
  assert.equal(cards.length, 2);
  assert.ok(cards[0].risk); assert.match(cards[0].t, /Milestone “Book the stand” was due/);
  assert.ok(!cards[1].risk); assert.doesNotMatch(cards[1].t, /⚠/);
  assert.deepEqual(p.errors, []);
});

test('Pending: waiting on someone (with follow-up reminder) is separate from Blocked and Overdue; reply came → back in the ranking', async () => {
  const p = await open({ tasks: SIX(), extra: { projs: PROJS } });
  await goBiz(p, 'tasks');
  await p.click(`${ROOT} details[data-tid="b1"] summary`);
  await p.click(`${ROOT} [data-bza="waitask"][data-id="b1"]`);
  await p.fill('#bzWho', 'Client approval of the proposal');
  await p.fill('#bzFup', plus(2));
  await p.click('#bzSheet button[type="submit"]');
  let t = (await state(p)).tasks.find(x => x.id === 'b1');
  assert.equal(t.biz.ext, 'Client approval of the proposal'); assert.equal(t.biz.fup, plus(2));
  assert.equal(t.date, plus(2)); assert.equal(t.alarm, true, 'follow-up reminder');
  await goBiz(p, 'dash');
  assert.equal(await tile(p, 'blocked'), '1', 'Pending is not counted as Blocked');
  assert.equal(await tile(p, 'today'), '0', 'it left today');
  await goBiz(p, 'pend');
  assert.match(await p.textContent(ROOT), /Waiting for a reply[\s\S]*Send a proposal[\s\S]*Waiting for Client approval of the proposal/);
  await p.click(`${ROOT} [data-bza="reply"][data-id="b1"]`);
  t = (await state(p)).tasks.find(x => x.id === 'b1');
  assert.equal(t.biz.status, 'todo'); assert.equal(t.biz.ext, null);
  await goBiz(p, 'prio');
  const all = (await nextTitles(p)).concat([await topTitle(p)]);
  assert.ok(all.includes('Send a proposal to a potential client'), 're-evaluated');
  assert.deepEqual(p.errors, []);
});

test('weekly review: four short blocks from real data; not enough data is said; recurring delays need real history', async () => {
  const wk = Date.now() - 3600e3;
  const moved = n => Array.from({ length: n }, () => ({ at: wk, ev: 'moved', from: YESTERDAY, to: TODAY }));
  const p = await open({ tasks: [biz('f1', 'Follow up with Ali', { hist: moved(2) }), biz('f2', 'Follow up with Sara', { hist: moved(2) }), biz('f3', 'Call bank', {}, { done: true, doneAt: wk })] });
  await goBiz(p, 'review');
  const t = await p.textContent(ROOT);
  assert.match(t, /What went well[\s\S]*What needs attention[\s\S]*Recurring obstacle[\s\S]*Client follow-ups were delayed 4 times[\s\S]*One thing for next week[\s\S]*daily client follow-ups block/);
  await p.click(`${ROOT} [data-bza="fublock"]`);
  await clearPop(p);
  const s = await state(p); const blk = s.tasks.find(x => /Daily block/.test(x.text));
  assert.ok(blk && blk.date === TOMORROW && blk.alarm);
  // little data → said plainly, no pattern invented
  const q = await open({ tasks: [biz('a', 'Write brief')] });
  await goBiz(q, 'review');
  const t2 = await q.textContent(ROOT);
  assert.match(t2, /Not enough data yet/); assert.match(t2, /No clear pattern yet/);
  assert.doesNotMatch(t2, /lazy|fail(ure)? (you|are)/i);
  assert.deepEqual(p.errors.concat(q.errors), []);
});

test('fits phones (320, 360, 390, 430) and desktop: dashboard, add sheet, projects, review', async () => {
  for (const w of [320, 360, 390, 430, 1280]) {
    const p = await open({ tasks: SIX(), width: w, extra: { projs: PROJS.map(x => Object.assign({}, x, { deadline: plus(9), ms: [{ id: 'mx' + x.id, title: 'A milestone with a rather long name', date: plus(4), done: false }] })) } });
    await goBiz(p, 'dash');
    assert.ok(await fits(p), 'dashboard fits at ' + w);
    await p.click(`${ROOT} [data-bza="cap"][data-v="write"]`);
    await p.fill('#capTxt', 'Email the client at 5 PM today and call the supplier tomorrow');
    await p.click('#bzSheet [data-bza="caprun"]'); await p.waitForSelector('#bzSheet .capl');
    assert.ok(await fits(p), 'add sheet fits at ' + w);
    await p.click('#bzSheet [data-bzclose].x');
    await p.click(`${ROOT} .bzproj`);
    assert.ok(await fits(p), 'project page fits at ' + w);
    await goBiz(p, 'review'); assert.ok(await fits(p), 'review fits at ' + w);
    assert.deepEqual(p.errors, []);
    await p.context().close();
  }
});
