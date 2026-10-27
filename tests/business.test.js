// ADHD Winner Business — end-to-end tests (real browser, real index.html, real localStorage).
// Covers the 14 acceptance scenarios of the Business brief. Run with the rest:  npm test
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
async function newTask(page, { title, subs = [], urgent, imp, deadline, est, day, time, rem }) {
  await goBiz(page, 'tasks');
  await page.click('#bzBody [data-bza="new"]');
  await page.fill('#bzT', title);
  if (urgent !== undefined) await page.click(`#bzForm [data-f="urgent"] [data-v="${urgent ? 1 : 0}"]`);
  if (imp) await page.click(`#bzForm [data-f="imp"] [data-v="${imp}"]`);
  if (deadline) await page.fill('#bzDl', deadline);
  if (est) await page.click(`#bzForm [data-f="est"] [data-v="${est}"]`);
  for (const s of subs) { await page.click('#bzForm [data-be="addsub"]'); const ins = await page.$$('#bzSubs input'); await ins[ins.length - 1].fill(s); }
  if (day) await page.fill('#bzD', day);
  if (time) await page.fill('#bzS', time);
  if (rem) await page.selectOption('#bzRem', rem);
  await page.click('#bzSave');
  if (await page.isVisible('#bzWarn')) await page.click('#bzSave'); // "Save anyway" after a heads-up
  await page.waitForSelector('#bzSheet', { state: 'hidden' });
  await clearPop(page);
}

test('Business is a dedicated page in the menu; without the plan it explains and offers the free trial', async () => {
  const p = await open({ plan: 'free' });
  await p.click('#menuBtn');
  assert.ok(await p.isVisible('.mitem.mbiz'), 'Business entry in the menu');
  await p.click('.mitem.mbiz'); await hush(p);
  assert.ok(await p.isVisible('#v-biz'));
  assert.ok(await p.isHidden('#v-today'), 'own page, Today is hidden');
  assert.match(await p.textContent('#bzBody'), /Try Business free/);
  assert.ok(await p.isHidden('#bzTabs'));
  await p.click('#bzBody [data-plan="business"]'); await p.waitForTimeout(100);
  assert.ok(await p.isVisible('#bzTabs'), 'workspace opens after the trial starts');
  for (const t of ['dash', 'tasks', 'prio', 'cal', 'coach', 'pend', 'review']) assert.ok(await p.isVisible(`#bzTabs [data-bz="${t}"]`), t);
  assert.deepEqual(p.errors, []);
});

test('1–2, 11: a task with five subtasks; two ticked show “2 of 5”; everything survives a refresh', async () => {
  const p = await open();
  await newTask(p, { title: 'Follow up with suppliers', subs: ['Email supplier 1', 'Email supplier 2', 'Request missing quotations', 'Compare offers', 'Choose the best offer'], imp: 'high', est: 60 });
  let s = await state(p);
  const t = s.tasks.find(x => x.text === 'Follow up with suppliers');
  assert.ok(t && t.biz, 'saved as a business task');
  assert.equal(t.cat, 'work');
  assert.equal(t.steps.length, 5);
  assert.equal(new Set(t.steps.map(x => x.id)).size, 5, 'stable subtask ids');
  await p.click(`details.bzt[data-tid="${t.id}"] summary .grow`);
  await p.click(`details.bzt[data-tid="${t.id}"] [data-bza="sub"][data-i="0"]`);
  await p.click(`details.bzt[data-tid="${t.id}"] [data-bza="sub"][data-i="1"]`);
  assert.match(await p.textContent(`details.bzt[data-tid="${t.id}"] .bzprog`), /2 of 5 subtasks completed/);
  await reload(p); await goBiz(p, 'tasks');
  assert.match(await p.textContent(`details.bzt[data-tid="${t.id}"] .bzprog`), /2 of 5 subtasks completed/, 'after refresh');
  s = await state(p);
  const t2 = s.tasks.find(x => x.id === t.id);
  assert.equal(t2.steps.filter(x => x.done).length, 2);
  assert.equal(t2.done, false, 'task not completed by two subtasks');
  assert.equal(t2.biz.status, 'doing', 'in progress once a subtask is done');
  assert.deepEqual(p.errors, []);
});

test('3: urgent is not automatically P1 — deadline, importance and consequences decide, with reasons; override works', async () => {
  const p = await open({ tasks: [
    biz('a', 'Send VAT return', { urgent: true, imp: 'high', conseq: 'high', deadline: TOMORROW }),
    biz('b', 'Order new business cards', { urgent: true, imp: 'low', conseq: 'low' }),
    biz('c', 'Update the price list', { urgent: false, imp: null, conseq: null }),
  ] });
  const a = await p.evaluate(() => adhdwBiz.prio('a')), b = await p.evaluate(() => adhdwBiz.prio('b')), c = await p.evaluate(() => adhdwBiz.prio('c'));
  assert.equal(a.p, 1); assert.ok(a.reasons.includes('Due tomorrow') && a.reasons.includes('You marked it urgent'), a.reasons.join('|'));
  assert.equal(b.p, 3, 'urgent but low impact, no deadline'); assert.ok(b.reasons.some(r => /it can wait/.test(r)));
  assert.equal(c.p, null, 'missing importance: no invented priority'); assert.match(c.ask.q, /How important/);
  await goBiz(p, 'prio');
  assert.match(await p.textContent('#bzBody'), /Update the price list: How important is this for your business\?/);
  await p.click('#bzBody [data-bza="answer"][data-id="c"][data-v="high"]');
  assert.equal((await p.evaluate(() => adhdwBiz.prio('c'))).p, 2);
  // override
  await p.click('#bzBody [data-bza="over"][data-id="b"][data-v="1"]');
  const b2 = await p.evaluate(() => adhdwBiz.prio('b'));
  assert.equal(b2.p, 1); assert.equal(b2.auto, 3); assert.match(b2.reasons[0], /You chose P1 \(recommended: P3\)/);
  // the normal list shows the business priority too
  await p.click('nav button[data-view="v-today"]');
  assert.equal((await state(p)).tasks.find(x => x.id === 'a').prio, 'high');
  assert.deepEqual(p.errors, []);
});

test('4–6: scheduling puts ONE entry in the calendar with a default reminder; editing the time moves it, no duplicate', async () => {
  const p = await open();
  await newTask(p, { title: 'Call the bank about the loan', imp: 'high', est: 30, day: TODAY, time: '07:00' });
  let s = await state(p), L = s.tasks.filter(x => x.text === 'Call the bank about the loan');
  assert.equal(L.length, 1);
  const t = L[0];
  assert.equal(t.date, TODAY); assert.equal(t.time, '07:00'); assert.equal(t.dur, 30);
  assert.equal(t.alarm, true, 'reminder on by default'); assert.equal(t.remBefore, 10, 'default 10 min before');
  // the main app (Today schedule = same as the calendar) shows it
  await p.click('nav button[data-view="v-today"]'); await p.waitForTimeout(100);
  assert.match(await p.textContent('#dayEvents'), /Call the bank about the loan/);
  // the business calendar too, with priority, duration and status
  await goBiz(p, 'cal');
  const cal = await p.textContent('#bzBody');
  assert.match(cal, /Call the bank about the loan/); assert.match(cal, /P2/); assert.match(cal, /30 min/); assert.match(cal, /Not started/); assert.match(cal, /10 min before/);
  // edit the time
  await p.click(`#bzBody [data-bza="edit"][data-id="${t.id}"]`);
  await p.fill('#bzS', '08:15'); await p.selectOption('#bzRem', '15');
  await p.click('#bzSave'); if (await p.isVisible('#bzWarn')) await p.click('#bzSave');
  s = await state(p); L = s.tasks.filter(x => x.text === 'Call the bank about the loan');
  assert.equal(L.length, 1, 'no duplicate after editing');
  assert.equal(L[0].id, t.id, 'same id = same calendar entry');
  assert.equal(L[0].time, '08:15'); assert.equal(L[0].remBefore, 15); assert.equal(L[0].fired, false);
  assert.ok(L[0].biz.hist.some(h => h.ev === 'moved' && h.from === TODAY + ' 07:00' && h.to === TODAY + ' 08:15'), 'history keeps the change');
  await p.click('nav button[data-view="v-today"]'); await p.waitForTimeout(100);
  const ev = await p.textContent('#dayEvents');
  assert.match(ev, /08:15/); assert.equal((ev.match(/Call the bank about the loan/g) || []).length, 1);
  assert.deepEqual(p.errors, []);
});

test('5: the reminder rings BEFORE the start (in-app), as set; a completed task never rings', async () => {
  const soon = new Date(Date.now() + 12 * 60e3), d = ymd(soon), tm = pad(soon.getHours()) + ':' + pad(soon.getMinutes());
  const p = await open({ tasks: [biz('r', 'Prepare the client deck', { est: 15 }, { date: d, time: tm, dur: 15, alarm: true, remBefore: 15 })] });
  await p.waitForSelector('#pop.alarm', { timeout: 15000 });
  assert.match(await p.textContent('#pop'), /Starts in 1[12] min/);
  assert.match(await p.textContent('#pop'), /Prepare the client deck/);
  const q = await open({ tasks: [biz('r2', 'Already finished', { est: 15 }, { date: d, time: tm, dur: 15, alarm: true, remBefore: 15, done: true, doneAt: Date.now() })] });
  await q.waitForTimeout(2500);
  assert.equal(await q.isVisible('#pop.alarm'), false, 'completed: no reminder');
});

test('7: completing keeps it in the calendar as completed; deleting removes the task, its calendar entry and its reminder', async () => {
  const p = await open({ tasks: [biz('k', 'Sign the contract', { est: 30 }, { date: TOMORROW, time: '10:00', dur: 30, alarm: true, remBefore: 10 }),
    biz('z', 'Old idea', { est: 30, deps: [] }, { date: TOMORROW, time: '12:00', dur: 30, alarm: true, remBefore: 10 }),
    biz('y', 'Needs the old idea', { deps: ['z'] })] });
  await goBiz(p, 'tasks');
  await p.click('details.bzt[data-tid="k"] summary [data-bza="done"]');
  let s = await state(p), k = s.tasks.find(x => x.id === 'k');
  assert.equal(k.done, true); assert.equal(k.date, TOMORROW, 'stays in the calendar');
  assert.ok(k.biz.hist.some(h => h.ev === 'done'));
  await goBiz(p, 'cal');
  assert.match(await p.textContent('#bzBody'), /Sign the contract[\s\S]*Completed/);
  await goBiz(p, 'tasks');
  await p.click('details.bzt[data-tid="z"] summary .grow');
  await p.click('details.bzt[data-tid="z"] [data-bza="del"]');
  assert.ok((await state(p)).tasks.some(x => x.id === 'z'), 'first tap only arms');
  await p.click('details.bzt[data-tid="z"] [data-bza="del"]');
  s = await state(p);
  assert.equal(s.tasks.some(x => x.id === 'z'), false);
  assert.deepEqual(s.tasks.find(x => x.id === 'y').biz.deps, [], 'removed from dependencies');
  assert.deepEqual(p.errors, []);
});

test('8: a missed task is not moved or failed; the review keeps the note and history, and the coach stops scheduling it while waiting', async () => {
  const p = await open({ tasks: [biz('m', 'Compare supplier offers', { imp: 'high', conseq: 'high', deadline: IN5 }, { date: YESTERDAY, time: '10:00', dur: 30, alarm: true, remBefore: 10 }),
    biz('n', 'Write the newsletter', { imp: 'med' })] });
  // the personal Today page does not bring it over in bulk
  assert.equal(await p.isVisible('[data-act="moveall"]'), false);
  await goBiz(p, 'dash');
  assert.match(await p.textContent('#bzBody'), /1 task wasn't finished on its day/);
  assert.equal(await p.textContent('#bzPendCnt'), '1');
  await goBiz(p, 'pend');
  assert.match(await p.textContent('#bzBody'), /You didn't complete this task yesterday\. What happened\?/);
  for (const r of ['Not enough time', 'Unexpected work', 'Task was too difficult to start', 'Waiting for someone else', 'Task took longer than expected', 'No longer a priority', 'Other'])
    assert.match(await p.textContent('#bzBody .bzopts'), new RegExp(r));
  let s = await state(p);
  assert.equal(s.tasks.find(x => x.id === 'm').date, YESTERDAY, 'not moved before the review');
  await p.click('#bzBody [data-bza="why"][data-v="waiting"]');
  await p.fill('#bzRvNote', 'Waiting for supplier to send the quotation');
  await p.click('#bzBody [data-bza="rvnext"]');
  s = await state(p);
  const note = s.tasks.find(x => x.id === 'm').biz.notes[0];
  assert.equal(note.text, 'Waiting for supplier to send the quotation'); assert.equal(note.reason, 'waiting'); assert.equal(note.date, YESTERDAY);
  // the note survives a refresh and the review resumes at the decision (no duplicate note)
  await reload(p); await goBiz(p, 'pend');
  assert.match(await p.textContent('#bzBody'), /Pause until they reply/);
  await p.click('#bzBody [data-bza="rvdo"][data-v="wait"]');
  s = await state(p);
  const m = s.tasks.find(x => x.id === 'm');
  assert.equal(m.biz.notes.length, 1);
  assert.equal(m.biz.status, 'blocked'); assert.equal(m.date, null); assert.equal(m.alarm, false); assert.ok(m.biz.waitSince);
  assert.ok(m.biz.hist.some(h => h.ev === 'missed'));
  const plan = await p.evaluate(() => adhdwBiz.plan());
  assert.equal(plan.main, 'n', 'the coach does not pick a task that cannot move');
  assert.equal(await p.isVisible('#bzPendCnt'), false, 'nothing left to review');
  assert.deepEqual(p.errors, []);
});

test('8b: reschedule from the review proposes a free slot and updates calendar + reminder together', async () => {
  const p = await open({ tasks: [biz('m', 'Send the quotation', { imp: 'high', conseq: 'med' }, { date: YESTERDAY, time: '10:00', dur: 30, alarm: true, remBefore: 10, fired: true })] });
  await goBiz(p, 'pend');
  await p.click('#bzBody [data-bza="why"][data-v="time"]');
  await p.click('#bzBody [data-bza="rvnext"]');
  await p.click('#bzBody [data-bza="rvdo"][data-v="resched"]');
  const m = (await state(p)).tasks.find(x => x.id === 'm');
  assert.ok(m.date >= TODAY, 'moved to a future slot'); assert.equal(m.alarm, true); assert.equal(m.fired, false, 'reminder re-armed');
  assert.equal(m.biz.status, 'resched');
  assert.equal(m.biz.notes[0].reason, 'time');
});

test('9: Speak with Coach picks ONE priority from real tasks and calendar, gives a first step, asks before scheduling, and is honest about the AI', async () => {
  const p = await open({ tasks: [
    biz('a', 'Finish the investor email', { urgent: true, imp: 'high', conseq: 'high', deadline: TODAY, est: 30 }, { steps: [{ id: 's1', t: 'Open last week\'s draft', done: false }] }),
    biz('b', 'Tidy the shared drive', { imp: 'low', conseq: 'low' }),
    biz('c', 'Plan the Q1 campaign', { imp: 'high', conseq: 'med', deadline: IN5, est: 60 }),
    biz('d', 'Approve the invoice', { imp: 'high', conseq: 'high', deadline: TOMORROW, status: 'blocked' }, { }),
    { id: 'meet', kind: 'event', text: 'Team meeting', date: TODAY, time: '00:00', dur: 60, done: false, steps: [] },
  ] });
  await goBiz(p, 'dash');
  await p.click('#bzBody [data-bza="tab"][data-v="coach"]');
  await p.waitForSelector('text=Offline planner');
  const txt = await p.textContent('#bzBody');
  assert.match(txt, /Do this next[\s\S]*Finish the investor email/);
  assert.match(txt, /First step: Open last week's draft/);
  assert.match(txt, /Due today/);
  assert.match(txt, /4 open business tasks/);
  assert.match(txt, /Noor's AI can't be reached right now/);
  const plan = await p.evaluate(() => adhdwBiz.plan());
  assert.equal(plan.main, 'a'); assert.ok(plan.sec.length <= 2); assert.ok(!plan.sec.includes('d'), 'blocked task not suggested');
  assert.ok(!plan.sec.includes('b'), 'P3 not pushed as a secondary priority');
  // proposing a slot asks first, then schedules on yes (and never on top of the meeting)
  await p.click('#bzBody [data-bza="propose"]');
  assert.match(await p.textContent('#bzBody'), /Put “Finish the investor email” in your calendar/);
  assert.equal((await state(p)).tasks.find(x => x.id === 'a').time, null, 'nothing scheduled before yes');
  await p.click('#bzBody [data-bza="place"]');
  await clearPop(p);
  const a = (await state(p)).tasks.find(x => x.id === 'a');
  assert.ok(a.time && a.alarm, 'scheduled with a reminder');
  assert.ok(!(a.date === TODAY && a.time < '01:00'), 'not on top of the meeting');
  // Start now opens Help me start on that task
  await p.click('#bzBody [data-bza="start"][data-id="a"]');
  assert.ok(await p.isVisible('#hms'));
  assert.equal((await state(p)).tasks.find(x => x.id === 'a').biz.status, 'doing');
  assert.deepEqual(p.errors, []);
});

test('9b: with the AI reachable, Noor rephrases ONLY the facts (labelled), and the prompt carries no invented data', async () => {
  const p = await open({ ai: ok({ say: 'Start with the draft, it is due today.' }), tasks: [biz('a', 'Finish the investor email', { urgent: true, imp: 'high', conseq: 'high', deadline: TODAY })] });
  await goBiz(p, 'coach');
  await p.waitForSelector('text=Noor (AI), based only on the facts below');
  assert.match(await p.textContent('#bzBody'), /Start with the draft, it is due today\./);
  assert.ok(p.prompts.some(x => /Main priority: Finish the investor email/.test(x) && /Do not invent/.test(x)));
});

test('10: the weekly review is calculated from saved data only', async () => {
  const now = Date.now();
  const tasks = [
    biz('d1', 'Done on time', { deadline: TODAY, est: 30, actual: 45, created: now - 3e5 }, { done: true, doneAt: now - 60e3, steps: [{ id: 'x', t: 'a', done: true }, { id: 'y', t: 'b', done: true }] }),
    biz('d2', 'Done too', { est: 60, actual: 60, created: now - 3e5 }, { done: true, doneAt: now - 120e3 }),
    biz('o1', 'Still open', { deadline: TODAY, created: now - 3e5, notes: [{ id: 'n1', at: now - 5e3, text: 'Waiting', reason: 'waiting' }, { id: 'n2', at: now - 4e3, text: '', reason: 'time' }],
      hist: [{ at: now - 3e3, ev: 'moved' }, { at: now - 2e3, ev: 'moved' }] }, { date: TODAY, steps: [{ id: 'z', t: 'c', done: false }] }),
  ];
  const p = await open({ tasks });
  const w = await p.evaluate(() => adhdwBiz.week());
  assert.equal(w.done, 2); assert.equal(w.open, 1); assert.equal(w.met, 1);
  assert.equal(w.sT, 3); assert.equal(w.sD, 2);
  assert.deepEqual(w.reasons, { waiting: 1, time: 1 });
  assert.equal(w.est, 90); assert.equal(w.actual, 105);
  await goBiz(p, 'review');
  const t = await p.textContent('#bzBody');
  assert.match(t, /2\s*tasks completed/); assert.match(t, /1\s*still open/); assert.match(t, /67%/);
  assert.match(t, /What went well[\s\S]*Done on time/);
  assert.match(t, /Waiting for someone else: 1/);
  assert.match(t, /“Still open” was moved 2 times/);
  assert.match(t, /estimated 1 h 30, actual 1 h 45/);
  assert.doesNotMatch(t, /fail(ure)? (you|are)/i);
  // previous week: nothing invented
  await p.click('#bzBody [data-bza="wk"][data-v="-1"]');
  const t2 = await p.textContent('#bzBody');
  assert.match(t2, /0\s*tasks completed/); assert.match(t2, /information, not failure/);
  assert.deepEqual(p.errors, []);
});

test('12: personal Today, table, calendar and backups still work with business tasks around', async () => {
  const p = await open({ tasks: [{ id: 'p1', text: 'Buy milk', done: false, steps: [], date: TODAY, time: null, dur: null, cat: 'personal' },
    biz('b1', 'Quote for Ali', { imp: 'high', conseq: 'high', deadline: TOMORROW }, { date: TODAY }),
    biz('b2', 'Someday business idea', { imp: 'low' })] });
  const list = await p.textContent('#tasks');
  assert.match(list, /Buy milk/); assert.match(list, /Quote for Ali/); assert.match(list, /P1/);
  assert.equal(await p.isVisible('#somedaySec'), false, 'business backlog is not mixed into personal Someday');
  // the normal editor hands business tasks to the business editor
  await p.click('#tasks [data-act="edit"][data-id="b1"]');
  assert.ok(await p.isVisible('#bzSheet')); assert.equal(await p.inputValue('#bzT'), 'Quote for Ali');
  await p.click('#bzSheet [data-bzclose].x');
  // personal task still completes the old way
  await p.click('#tasks [data-act="task"][data-id="p1"]');
  assert.equal((await state(p)).tasks.find(x => x.id === 'p1').done, true);
  // backup round-trip keeps business data
  const raw = await p.evaluate(k => localStorage.getItem(k), KEY);
  const back = await p.evaluate(r => { const s = JSON.parse(r); return s.tasks.find(t => t.id === 'b1').biz.imp; }, raw);
  assert.equal(back, 'high');
  assert.deepEqual(p.errors, []);
});

test('13: every Business tab fits a phone (390 px) and a desktop (1280 px) without sideways scroll', async () => {
  const tasks = [biz('a', 'A rather long business task title that should wrap nicely on a small phone screen', { urgent: true, imp: 'high', conseq: 'high', deadline: TOMORROW }, { date: YESTERDAY, time: '09:00', dur: 30, steps: [{ id: 's', t: 'Step one with a long label too', done: false }] }),
    biz('b', 'Second', { imp: 'med' }, { date: TODAY, time: '11:00', dur: 60 })];
  for (const width of [390, 1280]) {
    const p = await open({ tasks, width });
    for (const tab of ['dash', 'tasks', 'prio', 'cal', 'coach', 'pend', 'review']) {
      await goBiz(p, tab);
      if (tab === 'tasks') await p.click('details.bzt[data-tid="a"] summary .grow');
      assert.ok(await fits(p), tab + ' fits at ' + width);
    }
    await p.click('#bzTabs [data-bz="tasks"]'); await p.click('#bzBody [data-bza="new"]');
    assert.ok(await fits(p), 'editor fits at ' + width);
    const tb = await p.$eval('#bzTabs [data-bz="dash"]', e => e.getBoundingClientRect().height);
    assert.ok(tb >= 44, 'touch target');
    assert.deepEqual(p.errors, []);
  }
});

test('14: missing permissions and integrations are reported honestly', async () => {
  const p = await open({ noNotif: true });
  await goBiz(p, 'cal');
  const t = await p.textContent('#bzBody');
  assert.match(t, /can't show alerts outside the app/);
  assert.match(t, /cannot ring when it is fully closed/);
  assert.equal(await p.isVisible('#bzBody [data-bza="allow"]'), false);
  const q = await open({});
  await goBiz(q, 'cal');
  const st = await q.evaluate(() => Notification.permission);
  if (st === 'default') assert.ok(await q.isVisible('#bzBody [data-bza="allow"]'), 'asks only on tap');
  const r = await open({ perms: ['notifications'] });
  await goBiz(r, 'cal');
  assert.match(await r.textContent('#bzBody'), /Alerts are allowed on this device/);
  // no free time: says so and suggests alternatives instead of inventing a slot
  const s = await open({ extra: { bizCfg: { from: '09:00', to: '09:30', days: [0, 1, 2, 3, 4, 5, 6], rem: 10, set: true } }, tasks: [biz('big', 'Write the full business plan', { imp: 'high', est: 180 })] });
  await goBiz(s, 'cal');
  await s.click('#bzBody [data-bza="sched"][data-id="big"]');
  assert.match(await s.textContent('#bzBody'), /No free 3 h block[\s\S]*split it/);
  assert.equal((await state(s)).tasks.find(x => x.id === 'big').time, null);
});

test('conflicts: saving over another item warns first and never moves it', async () => {
  const p = await open({ tasks: [{ id: 'e1', kind: 'event', text: 'Dentist', date: TOMORROW, time: '10:00', dur: 60, done: false, steps: [] }] });
  await goBiz(p, 'tasks');
  await p.click('#bzBody [data-bza="new"]');
  await p.fill('#bzT', 'Client call'); await p.click('#bzForm [data-f="imp"] [data-v="med"]'); await p.click('#bzForm [data-f="est"] [data-v="30"]');
  await p.fill('#bzD', TOMORROW); await p.fill('#bzS', '10:30');
  await p.click('#bzSave');
  assert.ok(await p.isVisible('#bzWarn')); assert.match(await p.textContent('#bzWarn'), /overlaps with[\s\S]*Dentist/);
  assert.equal((await state(p)).tasks.filter(x => x.text === 'Client call').length, 0, 'not saved yet');
  await p.click('#bzSave');
  const s = await state(p);
  assert.equal(s.tasks.find(x => x.id === 'e1').time, '10:00', 'the other event is untouched');
  assert.equal(s.tasks.filter(x => x.text === 'Client call').length, 1);
  // the slot finder never proposes an occupied time
  const sl = await p.evaluate(d => adhdwBiz.slot(60, { after: d }), TOMORROW);
  assert.ok(sl.date !== TOMORROW || sl.time >= '11:00' || sl.time <= '09:00', JSON.stringify(sl));
  assert.deepEqual(p.errors, []);
});
