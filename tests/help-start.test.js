// ADHD Winner — "Help me start" end-to-end tests (real browser, real index.html, real localStorage).
// Run with the rest:  npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }

let URL, server; // set in test.before (local http server)
const KEY = 'bravo-v1', HKEY = 'adhdwStart';
const AI = 'https://mon-style.imendriss271982.workers.dev/';
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const plus = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const TODAY = plus(0), TOMORROW = plus(1);
const ok = body => r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
const down = r => r.fulfill({ status: 500, contentType: 'application/json', body: '{"erreur":"down"}' });

let browser;
test.before(async () => {
  const opts = {};
  const local = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
  try { require('fs').accessSync(local); opts.executablePath = local; } catch (e) {}
  browser = await chromium.launch(opts);
  server = await require('./serve')(); URL = server.base + 'index.html';
});
test.after(async () => { await browser.close(); server.close(); });

const task = (id, text, extra) => Object.assign({ id, text, done: false, steps: [], date: TODAY, time: null, dur: null }, extra || {});
async function open({ tasks = [], width = 390, ai = down } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 } });
  const page = await ctx.newPage();
  page.errors = []; page.prompts = [];
  page.on('pageerror', e => page.errors.push(e.message));
  const seed = { v: 2, name: 'Tester', onboarded: true, date: TODAY, tasks, voice: false, sound: false };
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
  if (await page.isVisible('#nClose')) await page.click('#nClose');
}
const state = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const H = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), HKEY);
const h = (page, act, extra = '') => page.click(`#hmsBody [data-h="${act}"]${extra}`);
const stepText = page => page.textContent('#hmsBody .hstep');
async function toSuggestion(page, blocker, taskId) {
  await page.click('#hmsToday');
  await h(page, 'b', `[data-b="${blocker}"]`);
  if (taskId) await h(page, 'task', `[data-id="${taskId}"]`);
  await page.waitForSelector('#hmsBody .hstep');
}

test('A: a vague task gets ONE concrete first action (AI, then offline rules)', async () => {
  const p = await open({ tasks: [task('t1', 'Prepare my project')], ai: ok({ step: 'Open the project folder and write a temporary title.', next: ['List 3 parts of the project.'] }) });
  await toSuggestion(p, 'cant', 't1');
  assert.equal((await stepText(p)).trim(), 'Open the project folder and write a temporary title.');
  assert.match(await p.textContent('#hmsBody'), /Suggested by Noor/);
  assert.match(p.prompts[0], /Task: Prepare my project/);
  assert.doesNotMatch(p.prompts[0], /Tester/, 'first name is not sent');
  assert.equal(await p.isVisible('.hnext ol'), false, 'next steps stay hidden until asked');
  // offline: deterministic rule-based step, labelled honestly
  const q = await open({ tasks: [task('t1', 'Prepare my presentation')] });
  await toSuggestion(q, 'cant', 't1');
  assert.equal((await stepText(q)).trim(), 'Open the presentation file and type a temporary title.');
  assert.match(await q.textContent('#hmsBody'), /couldn't be reached/);
  assert.deepEqual([p.errors, q.errors], [[], []]);
});

test('B: too much to do → choose one (or let the app choose) → one step', async () => {
  const p = await open({ tasks: [task('a', 'Tidy the kitchen'), task('b', 'Pay the electricity bill', { prio: 'high' }), task('c', 'Reply to emails')] });
  await p.click('#hmsToday');
  await h(p, 'b', '[data-b="many"]');
  assert.match(await p.textContent('#hmsBody'), /Pick just one/);
  assert.equal(await p.locator('#hmsBody .htaskopt').count(), 3);
  await h(p, 'choose');
  await p.waitForSelector('#hmsBody .hstep');
  assert.match(await p.textContent('#hmsBody .htask'), /Pay the electricity bill/, 'priority task chosen');
  assert.equal(await p.locator('#hmsBody .hstep').count(), 1, 'exactly one step shown');
});

test('C: when the step does not work, the next one is smaller or different, never the same', async () => {
  const p = await open({ tasks: [task('t1', 'Write my report')] });
  await toSuggestion(p, 'cant', 't1');
  const first = (await stepText(p)).trim();
  await h(p, 'easier'); await p.waitForSelector('#hmsBody .hstep');
  const smaller = (await stepText(p)).trim();
  assert.notEqual(smaller, first);
  await h(p, 'other'); await p.waitForSelector('#hmsBody .hstep');
  const other = (await stepText(p)).trim();
  assert.ok(![first, smaller].includes(other), 'different approach');
  // inside a session: "too difficult" → adjust → "I don't have the information" → help find the missing info
  await h(p, 'accept'); await h(p, 'hard'); await h(p, 'why');
  await p.fill('#hWhy', "I don't have the information I need");
  await h(p, 'whyok'); await p.waitForSelector('#hmsBody .hstep');
  assert.match(await stepText(p), /information you are missing/);
  // "I am exhausted" offers pause / tiny step / stop, not more pushing
  await h(p, 'accept'); await h(p, 'hard'); await h(p, 'why');
  await p.fill('#hWhy', 'I am exhausted'); await h(p, 'whyok');
  const t = await p.textContent('#hmsBody');
  assert.match(t, /Pause and come back/); assert.match(t, /tiny step/); assert.match(t, /Stop for today/);
  assert.deepEqual(p.errors, []);
});

test('D: "I\'m distracted" brings back the same task and step, session kept', async () => {
  const p = await open({ tasks: [task('t1', 'Study chapter 3')] });
  await toSuggestion(p, 'cant', 't1');
  const step = (await stepText(p)).trim();
  await h(p, 'accept'); await h(p, 'go');
  await p.waitForTimeout(1200);
  await h(p, 'distracted');
  const body = await p.textContent('#hmsBody');
  assert.match(body, /Study chapter 3/); assert.ok(body.includes(step));
  const saved = await H(p);
  assert.equal(saved.tm.since, null, 'timer paused');
  assert.ok(saved.tm.acc >= 1000, 'time already spent is kept');
  await h(p, 'back');
  assert.equal((await stepText(p)).trim(), step);
  assert.ok((await H(p)).tm.since, 'timer running again');
  // XP for coming back is given once, even if it happens twice
  const xp1 = (await state(p)).xp;
  await h(p, 'distracted'); await h(p, 'back');
  assert.equal((await state(p)).xp, xp1);
});

test('E: timer start / pause / resume / finish — never claims the task is done', async () => {
  const p = await open({ tasks: [task('t1', 'Clean my room')] });
  await toSuggestion(p, 'cant', 't1');
  await h(p, 'accept');
  await h(p, 'mins', '[data-m="2"]');
  await h(p, 'go');
  await p.waitForTimeout(1500);
  await h(p, 'go'); // pause
  const a = (await H(p)).tm.acc;
  assert.ok(a >= 1300 && a < 2500, 'elapsed counted: ' + a);
  await p.waitForTimeout(1200);
  assert.equal((await H(p)).tm.acc, a, 'nothing counted while paused');
  assert.match(await p.textContent('#hmsBody [data-h="go"]'), /Resume/);
  // jump to the end of the 2 minutes
  await p.evaluate(k => { const s = JSON.parse(localStorage.getItem(k)); s.tm.acc = 119500; localStorage.setItem(k, JSON.stringify(s)); }, HKEY);
  await p.reload(); await boot(p);
  await p.click('#hmsPill'); await h(p, 'go');
  await p.waitForSelector('#hmsBody [data-h="o_started"]', { timeout: 4000 });
  assert.match(await p.textContent('#hmsBody'), /How did it go\?/);
  const t = (await state(p)).tasks.find(x => x.id === 't1');
  assert.equal(t.done, false, 'timer ending does not complete the task');
  await h(p, 'o_started');
  const s = await state(p);
  assert.equal(s.tasks.find(x => x.id === 't1').done, false);
  assert.equal(s.hl.o.at(-1).o, 'started');
  assert.equal(await H(p), null, 'session closed');
  assert.deepEqual(p.errors, []);
});

test('F: a task from the list is used as is, nothing duplicated; "whole task done" only on tap', async () => {
  const p = await open({ tasks: [task('t1', 'Reply to emails', { desc: 'the two from the school' })], ai: ok({ step: 'Open your inbox and find the school email.', next: [] }) });
  await toSuggestion(p, 'later', 't1');
  assert.match(p.prompts[0], /Details: the two from the school/);
  await h(p, 'accept'); await h(p, 'did');
  let s = await state(p);
  assert.equal(s.tasks.length, 1, 'no task added');
  assert.equal(s.tasks[0].done, false, 'step done ≠ task done');
  const xp = s.xp;
  await h(p, 'taskdone');
  await p.waitForTimeout(300);
  s = await state(p);
  assert.equal(s.tasks.length, 1); assert.equal(s.tasks[0].id, 't1'); assert.equal(s.tasks[0].done, true);
  assert.ok(s.xp > xp);
  // typing a task that already exists reuses it
  const q = await open({ tasks: [task('t9', 'Call the bank')] });
  await q.click('#hmsToday'); await h(q, 'skip'); await h(q, 'typenew');
  await q.fill('#hNew', 'call the bank'); await h(q, 'newadd');
  await q.waitForSelector('#hmsBody .hstep');
  assert.equal((await state(q)).tasks.length, 1);
});

test('G: starting from the calendar keeps the appointment exactly where it was', async () => {
  const ev = task('e1', 'Dentist', { kind: 'event', time: '15:00', dur: 30, alarm: true, date: TOMORROW });
  const p = await open({ tasks: [ev] });
  await p.click('#menuBtn'); await p.click('.mitem[data-view="v-agenda"]');
  await p.waitForTimeout(150); if (await p.isVisible('#nClose')) await p.click('#nClose');
  await p.click('#cvTabs [data-cv="month"]');
  for (let i = 0; i < 2 && !(await p.$(`.mday[data-k="${TOMORROW}"]`)); i++) await p.click('#wkNext');
  await p.click(`.mday[data-k="${TOMORROW}"]`);
  await p.click('#events [data-act="edit"][data-id="e1"]');
  await p.click('#teGo');
  await h(p, 'b', '[data-b="cant"]');
  await p.waitForSelector('#hmsBody .hstep');
  await h(p, 'accept'); await h(p, 'go'); await h(p, 'exit'); await h(p, 'o_stop');
  await h(p, 'rs_keep');
  const s = await state(p);
  assert.equal(s.tasks.length, 1);
  assert.deepEqual([s.tasks[0].date, s.tasks[0].time, s.tasks[0].dur, s.tasks[0].done, s.tasks[0].alarm], [TOMORROW, '15:00', 30, false, true]);
  // postponing moves it only after the tap, once
  const q = await open({ tasks: [task('t1', 'Pack the bag', { time: '10:00', dur: 30 })] });
  await toSuggestion(q, 'later', 't1');
  await h(q, 'accept'); await h(q, 'exit'); await h(q, 'o_stop');
  assert.equal((await state(q)).tasks[0].date, TODAY, 'not moved before choosing');
  await h(q, 'rs_tomorrow');
  const t = (await state(q)).tasks;
  assert.deepEqual([t.length, t[0].date, t[0].time], [1, TOMORROW, '10:00']);
});

test('H: AI failure and timeout are shown honestly, with a useful step', async () => {
  const p = await open({ tasks: [task('t1', 'Do my taxes')], ai: r => r.abort('failed') });
  await toSuggestion(p, 'cant', 't1');
  assert.match(await p.textContent('#hmsBody'), /couldn't be reached/);
  assert.match(await stepText(p), /bill|banking|form/i);
  assert.doesNotMatch(await p.textContent('#hmsBody'), /Suggested by Noor/);
  // a broken answer from the AI is not shown as if it were Noor's
  const q = await open({ tasks: [task('t1', 'Do my taxes')], ai: ok({ nonsense: true }) });
  await toSuggestion(q, 'cant', 't1');
  assert.doesNotMatch(await q.textContent('#hmsBody'), /Suggested by Noor/);
  assert.deepEqual([p.errors, q.errors], [[], []]);
});

test('I: refresh during a session keeps task, step, time; XP is not given twice', async () => {
  const p = await open({ tasks: [task('t1', 'Read the contract')] });
  await toSuggestion(p, 'cant', 't1');
  const step = (await stepText(p)).trim();
  await h(p, 'accept'); await h(p, 'go');
  await p.waitForTimeout(1100);
  const xp = (await state(p)).xp;
  assert.ok(xp >= 5, 'start rewarded');
  await p.reload(); await boot(p);
  assert.ok(await p.isVisible('#hmsPill'), 'pill offers to go back');
  await p.click('#hmsPill');
  assert.equal((await stepText(p)).trim(), step);
  assert.match(await p.textContent('#hmsBody .htask'), /Read the contract/);
  await h(p, 'go'); // pause
  assert.ok((await H(p)).tm.acc >= 1000, 'time before refresh kept');
  await h(p, 'go'); // resume: no second "start" reward
  assert.equal((await state(p)).xp, xp);
  // an unstarted flow is dropped on refresh and counted as abandoned
  const q = await open({ tasks: [task('t1', 'Read')] });
  await toSuggestion(q, 'cant', 't1');
  await q.reload(); await boot(q);
  assert.equal(await q.isVisible('#hmsPill'), false);
  assert.equal((await state(q)).hl.c.session_abandoned, 1);
});

test('J: the whole journey works on a small phone without sideways scrolling', async () => {
  const p = await open({ width: 320, tasks: [task('t1', 'Prepare my presentation for the quarterly business review meeting')] });
  const wide = async () => p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || [...document.querySelectorAll('#hms .spanel *')].some(e => e.getBoundingClientRect().right > innerWidth + 1));
  await p.click('#hmsToday'); assert.equal(await wide(), false, 'blockers');
  await h(p, 'b', '[data-b="cant"]'); assert.equal(await wide(), false, 'pick');
  await h(p, 'task', '[data-id="t1"]'); await p.waitForSelector('#hmsBody .hstep'); assert.equal(await wide(), false, 'step');
  await h(p, 'accept'); assert.equal(await wide(), false, 'session');
  await h(p, 'go'); await h(p, 'did'); assert.equal(await wide(), false, 'done');
  await h(p, 'finish');
  const sizes = await p.evaluate(() => { document.querySelector('#hmsToday').scrollIntoView(); const r = document.querySelector('#hmsToday').getBoundingClientRect(); return [r.width, r.height]; });
  assert.ok(sizes[1] >= 44, 'big tap target');
  // keyboard: options are real buttons, Escape closes
  await p.click('#hmsToday'); await p.keyboard.press('Tab'); await p.keyboard.press('Escape');
  assert.equal(await p.isVisible('#hms'), false);
  assert.deepEqual(p.errors, []);
});

test('preferences: shown in Profile, editable, used, resettable; "tinier" is saved only after yes', async () => {
  const p = await open({ tasks: [task('t1', 'Write my report')] });
  await toSuggestion(p, 'cant', 't1');
  await h(p, 'easier'); await p.waitForSelector('#hmsBody .hstep');
  await h(p, 'easier'); await p.waitForSelector('#hmsBody .hoffer');
  assert.deepEqual((await state(p)).hp, {}, 'nothing saved before asking');
  await h(p, 'rememberyes');
  assert.equal((await state(p)).hp.detail, 'tiny');
  await p.click('#hmsBody [data-h="accept"]'); await p.click('#hms .shead .x'); // minimise
  await p.click('#menuBtn'); await p.click('.mitem[data-view="v-profile"]');
  assert.equal(await p.getAttribute('#hpBox [data-hp="detail"][data-v="tiny"]', 'aria-pressed'), 'true');
  await p.click('#hpBox [data-hp="mins"][data-v="10"]');
  assert.equal((await state(p)).hp.mins, 10);
  await p.click('#hpBox [data-hp="reset"]');
  assert.deepEqual((await state(p)).hp, {});
  const L = (await state(p)).hl;
  assert.ok(L.c.help_start_opened >= 1 && L.c.suggested_action_shown >= 3 && L.c.alternative_requested >= 2 && L.c.suggested_action_accepted === 1);
  assert.doesNotMatch(JSON.stringify(L), /Write my report/, 'no task text in the usage log');
});
