// AI Business Brain — unit tests of the pure priority engine (brain.js). No browser needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../brain.js');
const TODAY = '2026-10-28';
const t = (id, text, b, steps) => ({ id, text, steps: steps || [], biz: Object.assign({ urgent: false, imp: 'med', conseq: 'med', deadline: null, est: 30, status: 'todo', deps: [], ord: 0, over: null }, b) });
const ctx = (o) => Object.assign({ today: TODAY, left: 30, freeUntil: () => 600, blockers: [], dependents: [], project: null }, o);
const E = (task, c) => ({ t: task, pr: B.prio(task, ctx(c)), left: (c && c.left) || task.biz.est });

test('four levels: P1 critical, P2, P3, P4 later — and urgent+low impact stays P3, not P4', () => {
  assert.equal(B.prio(t('a', 'VAT', { urgent: true, imp: 'high', conseq: 'high', deadline: '2026-10-29' }), ctx()).p, 1);
  assert.equal(B.prio(t('b', 'Plan Q1', { imp: 'high', conseq: 'med' }), ctx()).p, 2);
  assert.equal(B.prio(t('c', 'Homepage', { imp: 'med', conseq: 'low' }), ctx()).p, 3);
  const d = B.prio(t('d', 'Competitors', { imp: 'low', conseq: 'low' }), ctx());
  assert.equal(d.p, 4); assert.match(d.reasons[0], /it can wait/);
  assert.equal(B.prio(t('e', 'Cards', { urgent: true, imp: 'low', conseq: 'low' }), ctx()).p, 3);
});

test('deadline alone does not decide: a low-impact task due tomorrow does not beat an important one', () => {
  const low = B.prio(t('x', 'Order pens', { imp: 'low', conseq: 'low', deadline: '2026-10-29' }), ctx());
  const imp = B.prio(t('y', 'Client proposal', { imp: 'high', conseq: 'high' }), ctx());
  assert.ok(imp.score > low.score); assert.ok(imp.p <= low.p);
});

test('unblocking other work and project importance raise the score, with the reason written down', () => {
  const base = B.prio(t('s', 'Confirm supplier price', { imp: 'high', conseq: 'med' }), ctx());
  const unb = B.prio(t('s', 'Confirm supplier price', { imp: 'high', conseq: 'med' }), ctx({ dependents: [{ text: 'Finalise budget', imp: 'high' }], project: { name: 'Product', imp: 'high' } }));
  assert.equal(base.p, 2); assert.equal(unb.p, 1);
  assert.ok(unb.reasons.some(r => /Unblocks “Finalise budget”/.test(r)));
  assert.ok(unb.reasons.some(r => /high-importance project \(Product\)/.test(r)));
  assert.match(unb.delay, /“Finalise budget” stays blocked until it is done/);
});

test('blocked task is capped and flagged; missing facts are not invented (provisional + ask)', () => {
  const b = B.prio(t('b', 'Budget', { imp: 'high', conseq: 'high', deadline: '2026-10-29' }), ctx({ blockers: ['waiting for “Supplier price”'] }));
  assert.equal(b.blocked, true); assert.equal(b.p, 2); assert.match(b.reasons[0], /^Blocked: waiting for “Supplier price”/);
  const m = B.prio(t('m', 'Price list', { imp: null, conseq: null, est: null }), ctx({ left: null }));
  assert.equal(m.p, null); assert.equal(m.ask.k, 'imp'); assert.equal(m.provisional, true);
  assert.deepEqual(m.missing, ['imp', 'conseq', 'est']); assert.equal(m.delay, null);
  assert.ok(!m.reasons.some(r => /deadline|consequence/i.test(r)), 'nothing about unknown fields');
});

test('manual priority wins and the difference is explained; P4 can be chosen', () => {
  const r = B.prio(t('o', 'Competitors', { imp: 'low', conseq: 'low', over: 1 }), ctx());
  assert.equal(r.p, 1); assert.equal(r.auto, 4); assert.match(r.reasons[0], /You chose P1 \(recommended: P4\)/);
});

test('select: compares across projects, one top, next three, groups, conflict for several P1', () => {
  const tasks = [
    E(t('c1', 'Research competitors', { imp: 'low', conseq: 'low', est: 60, ord: 0 })),
    E(t('a1', 'Fix the payment problem', { urgent: true, imp: 'high', conseq: 'high', deadline: '2026-10-29', est: 30, ord: 1 })),
    E(t('b1', 'Send proposal', { imp: 'high', conseq: 'high', deadline: '2026-10-28', est: 20, ord: 2 })),
    E(t('a2', 'Improve homepage', { imp: 'med', conseq: 'low', est: 120, ord: 3 })),
    E(t('c3', 'Finalise budget', { imp: 'high', conseq: 'high', est: 60, ord: 4 }), { blockers: ['waiting for “Confirm price”'] }),
    E(t('o1', 'Renew domain', { imp: 'low', conseq: 'low', deadline: '2026-10-20', ord: 5 })),
    E(t('z1', 'Snoozed P1', { urgent: true, imp: 'high', conseq: 'high', deadline: '2026-10-28', snooze: Date.now() + 36e5, ord: 6 })),
  ];
  const S = B.select(tasks, { today: TODAY });
  assert.equal(S.top.t.id, 'a1');
  assert.deepEqual(S.next.map(x => x.t.id), ['b1', 'o1', 'a2']);
  const o1 = tasks.find(x => x.t.id === 'o1').pr;
  assert.equal(o1.p, 3, 'overdue, but the person said low impact and minor consequences: not P1/P2');
  assert.ok(o1.reasons.some(r => /Deadline passed 8 days ago \(low impact, so the date counts less\)/.test(r)), o1.reasons.join('|'));
  assert.ok(S.conflict && S.conflict.n === 2, 'two ready P1 → conflict explained');
  assert.deepEqual(S.groups.waiting.map(x => x.t.id), ['c3']);
  assert.deepEqual(S.groups.overdue.map(x => x.t.id), []);
  assert.deepEqual(S.groups.later.map(x => x.t.id).sort(), ['c1', 'z1']);
});

test('time available now only breaks ties inside the same level, it never lifts an easy task over an important one', () => {
  const big = E(t('big', 'Write the offer', { imp: 'high', conseq: 'high', est: 120 }));
  const small = E(t('small', 'Reply to accountant', { imp: 'high', conseq: 'med', est: 15 }));
  const easy = E(t('easy', 'Tidy desktop', { imp: 'low', conseq: 'low', est: 5 }));
  assert.equal(B.select([big, small, easy], { today: TODAY }).top.t.id, 'big');
  assert.equal(big.pr.p, small.pr.p === 1 ? 1 : big.pr.p);
  const s15 = B.select([big, small, easy], { today: TODAY, avail: 15 });
  assert.notEqual(s15.top.t.id, 'easy');
});

test('an overdue task that matters goes first; the same overdue date on a trivial task does not', () => {
  const big = E(t('v', 'Send signed contract', { imp: 'high', conseq: 'high', deadline: '2026-10-26' }));
  const small = E(t('w', 'Water office plant', { imp: 'low', conseq: 'low', deadline: '2026-10-26' }));
  const mid = E(t('m', 'Client follow-up', { imp: 'high', conseq: 'med' }));
  const S = B.select([small, mid, big], { today: TODAY });
  assert.equal(S.top.t.id, 'v'); assert.equal(big.pr.p, 1);
  assert.ok(small.pr.p >= 3);
});
