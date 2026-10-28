// AI Business Brain — end-to-end tests (real browser, real index.html, real localStorage).
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

test('1-2, 5-6: three projects compared together; #1 with project, level, why, first action, START; next three in order; conflict explained', async () => {
  const p = await open({ tasks: SIX(), extra: { projs: PROJS } });
  await goBiz(p, 'prio');
  const txt = await brain(p);
  assert.match(txt, /AI Business Brain[\s\S]*Your priorities/);
  assert.match(txt, /Compared: 7 open tasks across 3 projects/);
  assert.equal(await topTitle(p), 'Fix the payment problem', 'not the first project listed (C)');
  const top = await p.textContent('#bzBody .brtop');
  assert.match(top, /Your number one priority/); assert.match(top, /📁 Website launch/); assert.match(top, /P1 — Do first/);
  assert.match(top, /Why it matters:.*Due tomorrow/); assert.match(top, /If it waits: You said being late has serious consequences; it is due tomorrow\./);
  assert.match(top, /Your first action:/); assert.match(top, /⏱ 30 min/);
  assert.ok(await p.isVisible('#bzBody .brtop [data-bza="start"]'));
  assert.match(top, /START THIS TASK/);
  // a short, important task (supplier price, 15 min, unblocks the budget) is in the next three
  const nx = await nextTitles(p);
  assert.equal(nx.length, 3);
  assert.deepEqual(nx.slice(0, 2), ['Send a proposal to a potential client', "Confirm the supplier's price"]);
  assert.match(await p.textContent('#bzBody .brnext'), /#2 because:/);
  await p.click(`#bzBody .brnext:has-text("Confirm the supplier") [data-bza="brp"][data-p="why"]`);
  assert.match(await p.textContent('#bzBody .brnext .brpanel'), /Unblocks “Finalise the launch budget”/);
  // several P1 → one realistic order, not three number ones
  assert.match(txt, /3 tasks are P1 right now\. Not everything can be first\. Start with “Fix the payment problem”/);
  // 4. the blocked task is never recommended, it waits in its own group with the reason
  assert.ok(!nx.includes('Finalise the launch budget'));
  await p.click('#bzBody .brgrp[data-g="waiting"] summary');
  assert.match(await p.textContent('#bzBody .brgrp[data-g="waiting"]'), /Finalise the launch budget[\s\S]*waiting for “Confirm the supplier's price”/);
  assert.match(await p.textContent('#bzBody .brgrp[data-g="later"]'), /Research competitors[\s\S]*P4 — Later/);
  // why panel: real reasons (one panel open at a time)
  await p.click('#bzBody .brtop [data-bza="brp"][data-p="why"]');
  assert.equal((await p.$$('#bzBody .brpanel')).length, 1);
  const why = await p.textContent('#bzBody .brtop .brpanel');
  assert.match(why, /You marked it urgent/); assert.match(why, /High importance for the business/); assert.match(why, /Part of a high-importance project \(Website launch\)/);
  assert.deepEqual(p.errors, []);
});

test('7, 14: completing the #1 updates the SAME task everywhere (no duplicate), the Brain moves on', async () => {
  const p = await open({ tasks: SIX(), extra: { projs: PROJS } });
  await goBiz(p, 'prio');
  const n0 = (await state(p)).tasks.length;
  await p.click('#bzBody .brtop [data-bza="done"]');
  const s = await state(p);
  assert.equal(s.tasks.length, n0, 'no task created or deleted');
  assert.equal(s.tasks.filter(t => t.id === 'a1').length, 1);
  assert.equal(s.tasks.find(t => t.id === 'a1').done, true);
  assert.equal(await topTitle(p), 'Send a proposal to a potential client');
  await goBiz(p, 'tasks');
  await p.click('#bzBody [data-bza="filter"][data-v="done"]');
  assert.match(await p.textContent('#bzBody'), /Fix the payment problem/);
  // completing the dependency unblocks the budget, which now appears in the recommendations
  await goBiz(p, 'prio');
  await p.click(`#bzBody .brnext:has-text("Confirm the supplier") [data-bza="done"]`);
  assert.ok((await nextTitles(p)).concat([await topTitle(p)]).includes('Finalise the launch budget'));
  assert.deepEqual(p.errors, []);
});

test('8: changing a deadline in the editor re-ranks right away', async () => {
  const p = await open({ tasks: SIX(), extra: { projs: PROJS } });
  await goBiz(p, 'prio');
  assert.equal(await topTitle(p), 'Fix the payment problem');
  await p.click('#bzBody .brtop [data-bza="brp"][data-p="more"]');
  await p.click('#bzBody .brtop [data-bza="edit"]');
  await p.fill('#bzDl', plus(30));
  await p.click('#bzSave');
  if (await p.isVisible('#bzWarn')) await p.click('#bzSave');
  assert.equal(await topTitle(p), 'Send a proposal to a potential client');
  assert.deepEqual(p.errors, []);
});

test('9: a manual priority is respected; the app says once when it would recommend another one', async () => {
  const p = await open({ tasks: SIX(), extra: { projs: PROJS } });
  await goBiz(p, 'prio');
  await p.click('#bzBody .brgrp[data-g="later"] summary');
  // set Research competitors (auto P4) to P1 from the Priorities tab
  await goBiz(p, 'prio');
  await p.click('#bzBody .bzmore summary');
  await p.click('#bzBody [data-bza="over"][data-id="c1"][data-v="1"]');
  await goBiz(p, 'prio');
  const all = (await nextTitles(p)).concat([await topTitle(p)]);
  assert.ok(all.includes('Research competitors'), 'P1 by choice → among the recommendations');
  assert.match(await brain(p), /You set P1\. Based on your data the app would now recommend P4\./);
  await p.click('#bzBody [data-bza="reckeep"][data-id="c1"]');
  assert.doesNotMatch(await brain(p), /would now recommend P4/);
  assert.equal((await state(p)).tasks.find(t => t.id === 'c1').biz.over, 1, 'never silently replaced');
  assert.deepEqual(p.errors, []);
});

test('10: missing information → provisional, nothing invented; Add missing information fills only empty fields', async () => {
  const p = await open({ tasks: [biz('m', 'Update the price list', { imp: null, conseq: null, est: null })] });
  await goBiz(p, 'prio');
  const top = await p.textContent('#bzBody .brtop');
  assert.match(top, /Priority: 1 question/);
  assert.match(top, /Provisional: importance, consequences if late, time estimate not set yet/);
  assert.match(top, /Time not set/);
  assert.doesNotMatch(top, /If it waits/, 'no invented consequence');
  await p.click('#bzBody .brtop [data-bza="missing"]');
  await p.click('#msForm [data-f="imp"] [data-v="high"]');
  await p.click('#msForm [data-f="est"] [data-v="30"]');
  await p.click('#msForm button[type="submit"]');
  const b = (await state(p)).tasks.find(t => t.id === 'm').biz;
  assert.equal(b.imp, 'high'); assert.equal(b.est, 30); assert.equal(b.conseq, null, 'skipped stays unknown');
  assert.match(await p.textContent('#bzBody .brtop'), /P2 — Do next/);
  assert.deepEqual(p.errors, []);
});

test('11-12: AI down → rules engine says so and still works; AI up → only the #1 facts are sent, once', async () => {
  const p = await open({ tasks: SIX(), extra: { projs: PROJS } });
  await goBiz(p, 'prio');
  await p.waitForSelector('#brAiTxt:has-text("Rules engine (Noor\'s AI is offline")');
  assert.equal(await topTitle(p), 'Fix the payment problem');
  const q = await open({ tasks: SIX(), extra: { projs: PROJS }, ai: ok({ say: 'Fixing payments first protects every sale.' }) });
  await goBiz(q, 'prio');
  await q.waitForSelector('#brAiTxt:has-text("Fixing payments first")');
  const sent = q.prompts.filter(x => /should be done first/.test(x));
  assert.equal(sent.length, 1, 'one call for the #1, not one per render');
  assert.match(sent[0], /Task: Fix the payment problem/); assert.match(sent[0], /Do not invent/);
  assert.doesNotMatch(sent[0], /proposal|competitors|supplier/i, 'no other task is sent');
  await q.click('#bzBody [data-bza="avail"][data-v="30"]'); // a minor tap re-renders but does not call the AI again
  assert.equal(q.prompts.filter(x => /should be done first/.test(x)).length, 1);
  assert.deepEqual(p.errors, []); assert.deepEqual(q.errors, []);
});

test('snooze: the task is kept (same date), leaves the recommendations, comes back with Wake up', async () => {
  const p = await open({ tasks: SIX(), extra: { projs: PROJS } });
  await goBiz(p, 'prio');
  await p.click('#bzBody .brtop [data-bza="brp"][data-p="snooze"]');
  await p.click('#bzBody [data-bza="snooze"][data-v="2h"]');
  let t = (await state(p)).tasks.find(x => x.id === 'a1');
  assert.ok(t.biz.snooze > Date.now()); assert.equal(t.done, false); assert.equal(t.date, null);
  assert.notEqual(await topTitle(p), 'Fix the payment problem');
  await p.click('#bzBody .brgrp[data-g="later"] summary');
  assert.match(await p.textContent('#bzBody .brgrp[data-g="later"]'), /Fix the payment problem[\s\S]*Snoozed/);
  await p.click('#bzBody [data-bza="unsnooze"][data-id="a1"]');
  assert.equal(await topTitle(p), 'Fix the payment problem');
  assert.deepEqual(p.errors, []);
});

test('break into smaller steps: proposed, editable, saved only on yes, regenerate adds no duplicates; offline = labelled template', async () => {
  const steps = { etapes: ['Open the payment logs', 'Find the failing request', 'Fix and test checkout'] };
  const p = await open({ tasks: SIX(), extra: { projs: PROJS }, ai: r => (/Break this business task/.test(r.request().postData()) ? ok(steps) : down)(r) });
  await goBiz(p, 'prio');
  await p.click('#bzBody .brtop [data-bza="bd"]');
  await p.waitForSelector('#bdBox [data-bdi]');
  assert.match(await p.textContent('#bdBox'), /Suggested by Noor \(AI\)\. Edit freely: nothing is saved until you say yes\./);
  assert.equal((await state(p)).tasks.find(t => t.id === 'a1').steps.length, 0, 'nothing saved yet');
  await p.fill('#bdBox [data-bdi="0"]', 'Open the Stripe payment logs');
  await p.click('#bdBox [data-bd="save"]');
  let a1 = (await state(p)).tasks.find(t => t.id === 'a1');
  assert.deepEqual(a1.steps.map(s => s.t), ['Open the Stripe payment logs', 'Find the failing request', 'Fix and test checkout']);
  assert.match(await p.textContent('#bzBody .brtop'), /Your first action: Open the Stripe payment logs/);
  // regenerate + save again: the same steps are not added twice
  await p.click('#bzBody .brtop [data-bza="bd"]');
  await p.waitForSelector('#bdBox [data-bd="regen"]');
  await p.click('#bdBox [data-bd="regen"]');
  await p.waitForSelector('#bdBox [data-bd="save"]');
  await p.click('#bdBox [data-bd="save"]');
  a1 = (await state(p)).tasks.find(t => t.id === 'a1');
  assert.equal(a1.steps.length, 4, 'only the one new step (the original wording) was added');
  assert.equal(new Set(a1.steps.map(s => s.t.toLowerCase())).size, a1.steps.length);
  // reject
  await p.click('#bzBody .brtop [data-bza="bd"]'); await p.waitForSelector('#bdBox [data-bd="no"]'); await p.click('#bdBox [data-bd="no"]');
  assert.equal((await state(p)).tasks.find(t => t.id === 'a1').steps.length, 4);
  // offline
  const q = await open({ tasks: SIX(), extra: { projs: PROJS } });
  await goBiz(q, 'prio'); await q.click('#bzBody .brtop [data-bza="bd"]'); await q.waitForSelector('#bdBox [data-bd="save"]');
  assert.match(await q.textContent('#bdBox'), /Simple template: Noor's AI can't be reached right now/);
  assert.deepEqual(p.errors, []); assert.deepEqual(q.errors, []);
});

test('view project, project on hold, project importance', async () => {
  const p = await open({ tasks: SIX(), extra: { projs: PROJS } });
  await goBiz(p, 'prio');
  await p.click('#bzBody .brtop [data-bza="brp"][data-p="more"]');
  await p.click('#bzBody .brtop [data-bza="viewproj"]');
  const tx = await p.textContent('#bzBody');
  assert.match(tx, /Project: Website launch · 2 open, 0 done/);
  assert.doesNotMatch(tx, /Send a proposal/);
  await p.click('#bzBody [data-bza="projclear"]');
  assert.match(await p.textContent('#bzBody'), /Send a proposal/);
  // put Website launch on hold → its tasks are kept but no longer suggested
  // the project workspace opens from the dashboard (Projects → Manage)
  await goBiz(p, 'dash');
  await p.click('#bzBody [data-bza="projs"]');
  await p.click('#projs details[data-id="pA"] summary');
  await p.click('#projs [data-pro="phold"][data-id="pA"]');
  await goBiz(p, 'prio');
  assert.equal(await topTitle(p), 'Send a proposal to a potential client');
  await goBiz(p, 'dash');
  await p.click('#bzBody [data-bza="projs"]');
  assert.equal((await state(p)).tasks.filter(t => t.biz && t.biz.proj === 'pA').length, 2);
  await p.click('#projs details[data-id="pC"] summary');
  await p.click('#projs [data-pro="pimp"][data-id="pC"][data-v="high"]');
  assert.equal((await state(p)).projs.find(x => x.id === 'pC').imp, 'high');
  assert.deepEqual(p.errors, []);
});

test('15, 17: Brain is Business-only (page and actions); data stays when the plan is Free', async () => {
  const p = await open({ tasks: SIX(), extra: { projs: PROJS }, plan: 'free' });
  await goBiz(p);
  assert.equal(await p.$('#bzBody .brain'), null);
  assert.match(await p.textContent('#bzBody'), /Try Business free/);
  // a forged button press does nothing while on Free
  await p.evaluate(() => { const b = document.createElement('button'); b.dataset.bza = 'snooze'; b.dataset.id = 'a1'; b.dataset.v = '2h'; document.body.appendChild(b); b.click(); });
  const s = await state(p);
  assert.equal(s.tasks.find(t => t.id === 'a1').biz.snooze, null);
  assert.equal(s.tasks.filter(t => t.biz).length, 7, 'business data kept on Free');
  assert.deepEqual(p.errors, []);
});

test('16, 18: older saved data loads unchanged (no P4/snooze fields yet) and the Brain fits a phone and a desktop', async () => {
  const old = SIX().map(t => { delete t.biz.over; return t; });
  const p = await open({ tasks: old, extra: { projs: PROJS.map(({ imp, ...x }) => x) } });
  await goBiz(p, 'prio');
  assert.equal(await topTitle(p), 'Fix the payment problem');
  assert.ok(await fits(p), 'no sideways scroll at 390 px');
  for (const tab of ['tasks', 'prio', 'cal', 'coach', 'pend', 'review']) { await goBiz(p, tab); assert.ok((await p.textContent('#bzBody')).length > 20, tab); }
  const d = await open({ tasks: SIX(), extra: { projs: PROJS }, width: 1280 });
  await goBiz(d, 'dash');
  assert.ok(await fits(d));
  assert.deepEqual(p.errors, []); assert.deepEqual(d.errors, []);
});
