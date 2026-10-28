// ADHD Winner Business — AI Business Brain: the priority engine.
// Pure functions, no DOM, no network: the same code runs in the app (window.Brain) and in Node tests (require('./brain.js')).
// It only uses what the person saved. Missing facts are reported as missing (and the result is marked provisional), never guessed.
// The AI (Noor) never sets a priority: it may only rephrase the reasons this engine produced.
(function (root) {
  'use strict';

  // ---- weights: one table, easy to read and tune. A score is a sum of these; it is NOT an objective truth. ----
  const W = {
    urgent: 2,                                   // the person marked it urgent
    imp: { high: 3.5, med: 1.5, low: 0 },        // importance for the business
    conseq: { high: 3, med: 1, low: 0 },         // what happens if it is late
    deadline: { overdue: 5, today: 4.5, tomorrow: 4, d3: 2.5, d7: 1, far: 0 },
    noTime: 2, tight: 1,                         // free work time before the deadline vs work left
    started: 0.5,                                // some subtasks already done
    projHigh: 1,                                 // part of a project the person rated high
    unblocks: 1.5, unblocksImportant: 1,         // other open tasks wait for this one
    fitsNow: 1.5,                                // tie-break only: fits the time the person said they have now
    p1: 7, p2: 3.5,                              // score thresholds: >= p1 → P1, >= p2 → P2, else P3
    lowStakes: 0.5,                              // deadline weight when importance AND consequences are low
    laterDays: 14                                // P4 only if no deadline in the next 14 days
  };
  const LEVELS = {
    1: { short: 'Do first', name: 'P1 — Do first', desc: 'Critical, a real commitment, or a blocker' },
    2: { short: 'Do next', name: 'P2 — Do next', desc: 'Important, soon, after P1' },
    3: { short: 'Plan', name: 'P3 — Plan', desc: 'Useful: schedule it after higher-priority work' },
    4: { short: 'Later', name: 'P4 — Later', desc: 'Low impact, does not need attention now' }
  };
  const dDiff = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 864e5);
  const durTxt = m => m == null ? '—' : m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + String(m % 60).padStart(2, '0') : '');
  const q = s => '“' + s + '”';

  // ctx: { today:'YYYY-MM-DD', left: minutes of work left|null, freeUntil:(deadline)=>minutes, blockers:[text],
  //        dependents:[{text, imp}] (open tasks waiting for this one), project:{name, imp, hold}|null, dur:(m)=>text }
  function prio(t, ctx) {
    const b = t && t.biz; if (!b) return { p: null, reasons: [], score: 0, missing: [] };
    ctx = ctx || {};
    const today = ctx.today, fmt = ctx.dur || durTxt, r = [];
    let s = 0, dl = null;
    const add = (w, txt) => { s += w; r.push([w, txt]); };
    const ask = b.imp == null ? { k: 'imp', q: 'How important is this for your business?' }
      : (b.conseq == null && (b.urgent || b.deadline)) ? { k: 'conseq', q: 'What happens if it is late?' } : null;
    if (b.urgent) add(W.urgent, 'You marked it urgent');
    if (b.imp === 'high') add(W.imp.high, 'High importance for the business'); else if (b.imp === 'med') add(W.imp.med, 'Medium importance for the business'); else if (b.imp === 'low') add(W.imp.low, 'Low importance for the business');
    if (b.conseq === 'high') add(W.conseq.high, 'Serious consequences if it is late'); else if (b.conseq === 'med') add(W.conseq.med, 'Some consequences if it is late'); else if (b.conseq === 'low') add(W.conseq.low, 'Few consequences if it is late');
    if (b.deadline && today) {
      dl = dDiff(today, b.deadline);
      // a date matters less when the person said the task has low impact AND minor consequences
      const k = b.imp === 'low' && b.conseq === 'low' ? W.lowStakes : 1, sfx = k < 1 && dl <= 3 ? ' (low impact, so the date counts less)' : '';
      const addD = (w, txt) => add(w * k, txt + (w ? sfx : ''));
      if (dl < 0) addD(W.deadline.overdue, 'Deadline passed ' + (-dl) + ' day' + (dl === -1 ? '' : 's') + ' ago');
      else if (dl === 0) addD(W.deadline.today, 'Due today'); else if (dl === 1) addD(W.deadline.tomorrow, 'Due tomorrow');
      else if (dl <= 3) addD(W.deadline.d3, 'Due in ' + dl + ' days'); else if (dl <= 7) addD(W.deadline.d7, 'Due in ' + dl + ' days'); else addD(W.deadline.far, 'Deadline in ' + dl + ' days: there is time');
      const left = ctx.left;
      if (left && dl >= 0 && ctx.freeUntil) {
        const free = ctx.freeUntil(b.deadline);
        if (free < left) add(W.noTime, 'Only ' + fmt(free) + ' of free work time before the deadline, for about ' + fmt(left) + ' of work');
        else if (free < left * 2) add(W.tight, 'Tight: ' + fmt(free) + ' free before the deadline for about ' + fmt(left) + ' of work');
      }
    }
    const steps = t.steps || [], n = steps.length, d = steps.filter(x => x.done).length;
    if (d && d < n) add(W.started, 'Already started (' + d + ' of ' + n + ' subtasks)');
    const proj = ctx.project || null;
    if (proj && proj.imp === 'high') add(W.projHigh, 'Part of a high-importance project (' + proj.name + ')');
    const deps = ctx.dependents || [];
    if (deps.length) add(W.unblocks + (deps.some(x => x.imp === 'high') ? W.unblocksImportant : 0),
      'Unblocks ' + (deps.length === 1 ? q(deps[0].text) : deps.length + ' other tasks (' + deps.slice(0, 2).map(x => q(x.text)).join(', ') + ')'));
    if (b.urgent && b.imp === 'low' && b.conseq !== 'high' && (dl == null || dl > 3)) r.push([9, 'Urgent, but low impact and no close deadline: it can wait']);
    let auto = s >= W.p1 ? 1 : s >= W.p2 ? 2 : 3;
    // P4: only when everything the person said points to "later" — never when a field is unknown
    if (auto === 3 && !b.urgent && b.imp === 'low' && (b.conseq === 'low' || (b.conseq == null && !b.deadline)) && (dl == null || dl > W.laterDays) && !deps.length && !(proj && proj.imp === 'high')) {
      auto = 4; r.push([9, 'Low impact, no close deadline and nothing waits for it: it can wait']);
    }
    r.sort((x, y) => y[0] - x[0]);
    const reasons = r.map(x => x[1]); // strongest reasons first
    const blk = ctx.blockers || [];
    if (blk.length) { const cap = dl != null && dl <= 3 ? 2 : 3; if (auto < cap) auto = cap; reasons.unshift('Blocked: ' + blk[0] + '. It cannot move forward yet'); }
    const missing = [];
    if (b.imp == null) missing.push('imp');
    if (b.conseq == null) missing.push('conseq');
    if (b.est == null) missing.push('est');
    const out = { auto, reasons, ask, blocked: !!blk.length, score: s, missing, unblocks: deps.length, hold: !!(proj && proj.hold), dl,
      provisional: !!ask || b.est == null, delay: delayText(b, dl, deps) };
    if (ask && !b.over) return Object.assign(out, { p: null, auto: null });
    const p = b.over || auto;
    if (b.over && b.over !== auto) reasons.unshift('You chose P' + b.over + ' (recommended: P' + auto + ')');
    return Object.assign(out, { p });
  }

  // "What could happen if it is delayed" — only from what the person entered; null when nothing supports it
  function delayText(b, dl, deps) {
    const parts = [];
    if (b.conseq === 'high') parts.push('You said being late has serious consequences');
    else if (b.conseq === 'med') parts.push('You said being late has some consequences');
    if (dl != null && dl < 0) parts.push('the deadline has already passed');
    else if (dl != null && dl <= 1 && b.conseq && b.conseq !== 'low') parts.push(dl === 0 ? 'it is due today' : 'it is due tomorrow');
    if (deps && deps.length) parts.push((deps.length === 1 ? q(deps[0].text) + ' stays' : deps.length + ' other tasks stay') + ' blocked until it is done');
    if (!parts.length) return null;
    const s = parts.join('; ');
    return s.charAt(0).toUpperCase() + s.slice(1) + '.';
  }

  // order a list of {t, pr}: priority level first; inside the same level, the score (+ a small bonus if it fits the time available now)
  function rank(entries, opt) {
    opt = opt || {};
    const avail = opt.avail || 0;
    const key = x => x.pr.score + (avail && x.left != null && x.left <= avail ? W.fitsNow : 0);
    return entries.slice().sort((a, b) => (a.pr.p || 2.5) - (b.pr.p || 2.5) || key(b) - key(a)
      || (a.t.biz.deadline || '9999').localeCompare(b.t.biz.deadline || '9999') || (a.t.biz.ord || 0) - (b.t.biz.ord || 0));
  }

  // pick ONE main task, the next three, and group the rest. entries: [{t, pr, left}] for every open, active business task.
  function select(entries, opt) {
    opt = opt || {};
    const now = opt.now || Date.now(), today = opt.today;
    const snoozed = x => x.t.biz.snooze && x.t.biz.snooze > now;
    const R = rank(entries, opt);
    const ready = R.filter(x => !x.pr.blocked && !x.pr.hold && !snoozed(x));
    const top = ready.find(x => x.pr.p) || ready[0] || null;
    const next = ready.filter(x => x !== top && x.pr.p !== 4).slice(0, 3);
    const used = new Set([top, ...next].filter(Boolean));
    const groups = { overdue: [], important: [], later: [], waiting: [] };
    R.forEach(x => {
      if (used.has(x)) return;
      if (x.t.biz.deadline && today && x.t.biz.deadline < today) groups.overdue.push(x);
      else if (x.pr.blocked) groups.waiting.push(x);
      else if (snoozed(x) || x.pr.hold || x.pr.p === 3 || x.pr.p === 4) groups.later.push(x);
      else groups.important.push(x);
    });
    const p1 = ready.filter(x => x.pr.p === 1);
    const conflict = p1.length >= 2 ? { n: p1.length, order: p1.slice(0, 3) } : null;
    return { top, next, groups, conflict, ranked: R, ready };
  }

  const api = { W, LEVELS, prio, rank, select, delayText, dur: durTxt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Brain = api;
})(typeof window !== 'undefined' ? window : this);
