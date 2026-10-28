// Capture engine — unit tests (capture.js). No browser needed.
// "Speak or type → tasks": splitting, dates, times, deadlines, urgency, projects — and nothing invented.
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../capture.js');

const TODAY = '2026-10-28'; // a Wednesday
const P = [{ id: 'p1', name: 'Website launch' }, { id: 'p2', name: 'Client acquisition' }];
const parse = s => C.parse(s, { today: TODAY, projects: P });

test('brief examples: explicit time kept exactly, morning is not turned into a time, "before Friday" is a deadline', () => {
  const [a] = parse('Email the client at 5 PM today.');
  assert.equal(a.text, 'Email the client'); assert.equal(a.date, TODAY); assert.equal(a.time, '17:00'); assert.equal(a.deadline, null);
  const [b] = parse('Call the supplier tomorrow morning.');
  assert.equal(b.text, 'Call the supplier'); assert.equal(b.date, '2026-10-29'); assert.equal(b.time, null, 'no time invented for "morning"');
  assert.match(b.ctx, /morning/);
  const [c] = parse('Finish the quotation before Friday.');
  assert.equal(c.text, 'Finish the quotation'); assert.equal(c.deadline, '2026-10-30'); assert.equal(c.date, null);
});

test('several tasks in one message are separated; numbers stay as said', () => {
  const r = parse('I need to send three client emails, prepare the presentation, and follow up with the factory.');
  assert.deepEqual(r.map(x => x.text), ['Send three client emails', 'Prepare the presentation', 'Follow up with the factory']);
  r.forEach(x => { assert.equal(x.date, null); assert.equal(x.time, null); assert.equal(x.deadline, null); });
});

test('context sentences attach to the task before; urgency comes only from what was said', () => {
  const r = parse('Prepare the proposal. This is urgent. The client is waiting for the proposal.');
  assert.equal(r.length, 1); assert.equal(r[0].urgent, true); assert.match(r[0].ctx, /client is waiting/);
  assert.equal(parse('Prepare the proposal')[0].urgent, false);
});

test('"and" only splits between actions ("salt and pepper" stays one task)', () => {
  assert.equal(parse('Buy salt and pepper for the office').length, 1);
  assert.equal(parse('Call Ali and send the invoice').length, 2);
});

test('ambiguous "at 5" is flagged, never guessed; 24h time kept; project matched by name', () => {
  const r = parse('Call Ahmed at 5 and book the meeting room for the website launch on 5 November at 10:30');
  assert.equal(r[0].time, null); assert.ok(r[0].flags.includes('ampm'));
  assert.equal(r[1].date, '2026-11-05'); assert.equal(r[1].time, '10:30'); assert.equal(r[1].proj, 'p1');
});

test('a time without a day is flagged as "set to today", not hidden', () => {
  const [a] = parse('Call the bank at 3 pm');
  assert.equal(a.time, '15:00'); assert.equal(a.date, TODAY); assert.ok(a.flags.includes('day-assumed'));
});

test('same task said twice → once', () => {
  assert.equal(parse('Call the supplier. Call the supplier.').length, 1);
});

test('AI answers are checked: dates and times the person did not say are removed and flagged', () => {
  const text = 'Email the client at 5 PM today. Call the supplier tomorrow morning.';
  const r = C.verify({ tasks: [
    { title: 'Email the client', date: TODAY, time: '17:00' },
    { title: 'Call the supplier', date: '2026-10-29', time: '09:00' },            // 09:00 was never said
    { title: 'Send invoice', deadline: '2026-11-15', urgent: true },             // date and urgency never said
    { title: 'Bad', date: 'next week', time: '25:99' },                           // malformed
    { title: 'Email the client' }                                                // duplicate
  ] }, text, { today: TODAY, projects: P });
  assert.equal(r.length, 4);
  assert.equal(r[0].time, '17:00');
  assert.equal(r[1].date, '2026-10-29'); assert.equal(r[1].time, null); assert.ok(r[1].flags.includes('removed-time'));
  assert.equal(r[2].deadline, null); assert.equal(r[2].urgent, false); assert.ok(r[2].flags.includes('removed-date'));
  assert.equal(r[3].date, null); assert.equal(r[3].time, null);
  assert.equal(C.verify('garbage', text, { today: TODAY }), null, 'malformed AI answer → null (rules engine takes over)');
});

test('spoken project: name, deadline from "in four weeks", milestones in order, unsaid dates marked suggested', () => {
  const p = C.parseProject('I need to launch a new website in four weeks. First, finalize the design, then approve the content, then test everything, and finally deliver the website.', { today: TODAY });
  assert.equal(p.name, 'Launch a new website');
  assert.equal(p.deadline, '2026-11-25');
  assert.deepEqual(p.ms.map(m => m.title), ['Finalize the design', 'Approve the content', 'Test everything', 'Deliver the website']);
  assert.ok(p.ms.every(m => m.suggested), 'none of these dates were said');
  assert.equal(p.ms[3].date, p.deadline, 'last milestone = the project deadline');
  const dates = p.ms.map(m => m.date); assert.deepEqual([...dates].sort(), dates, 'in order');
  const q = C.parseProject('Open the shop. First get the licence by 5 November, then hire staff.', { today: TODAY });
  assert.equal(q.ms[0].date, '2026-11-05'); assert.equal(q.ms[0].suggested, false);
  assert.equal(q.ms[1].date, null, 'no deadline and no date said → no date invented');
});
