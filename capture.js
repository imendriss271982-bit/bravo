// ADHD Winner Business — Capture engine: "speak or type → tasks".
// Pure functions, no DOM, no network: the same code runs in the app (window.Capture) and in Node tests (require('./capture.js')).
// Rule: nothing is invented. A date or a time is only set when the person said it; anything unclear is flagged for review.
// The AI (Noor) may split and title tasks, but every date/time it returns is checked against what was actually said (verify()).
(function (root) {
  'use strict';

  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const at = k => new Date(k + 'T12:00');
  const plus = (k, n) => { const d = at(k); d.setDate(d.getDate() + n); return ymd(d); };
  const okDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && ymd(at(s)) === s;
  const okTime = s => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const norm = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

  const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const NUM = { one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
  // verbs that start an action: used to split "send X, call Y and prepare Z" without splitting "salt and pepper"
  const VERBS = ('send email e-mail mail call phone ring text message whatsapp prepare finish complete write draft review check follow ' +
    'book schedule meet pay buy order update create make fix submit share post plan organize organise contact ask reply respond ' +
    'confirm approve design test deliver launch publish print sign file clean read research find get go visit collect pick upload ' +
    'download set invite remind discuss present finalize finalise edit translate calculate quote negotiate chase transfer renew ' +
    'register apply record film prepare start continue close open hire train analyse analyze compare list sort archive backup ' +
    'install setup arrange cancel move return deposit withdraw print scan photograph shoot design').split(' ');
  const VSET = new Set(VERBS);
  const LEAD = /^(?:(?:so|ok|okay|well|um|uh|oh)[,\s]+|(?:and\s+)?(?:then|also|next|after\s+that|afterwards|finally|lastly|first(?:ly)?|second(?:ly)?|third(?:ly)?)[,\s]+|i\s+(?:also\s+|really\s+|still\s+)?(?:need|have|want|must|should|got|ought)\s+to\s+|i(?:'|’)?ll\s+|i\s+will\s+|i\s+must\s+|(?:please\s+)?(?:remember|don'?t\s+forget)\s+to\s+|(?:we\s+)?(?:need|have)\s+to\s+|please\s+|let'?s\s+|to\s+)/i;
  const URGENT = /\b(urgent(?:ly)?|asap|a\.s\.a\.p|right away|immediately|as soon as possible|top priority|critical)\b/i;
  const PARTS = { morning: 'morning', afternoon: 'afternoon', evening: 'evening', tonight: 'evening', noon: 'noon', lunchtime: 'noon' };

  function stripLead(s) { let p; do { p = s; s = s.replace(LEAD, ''); } while (s !== p); return s.trim(); }
  const firstWord = s => (stripLead(s).toLowerCase().match(/^[a-z-]+/) || [''])[0];
  const isAction = s => VSET.has(firstWord(s));

  // ---- dates ----
  function nextDow(today, dow, allowToday) { const d0 = at(today).getDay(); let n = (dow - d0 + 7) % 7; if (n === 0 && !allowToday) n = 7; return plus(today, n); }
  function monthDay(today, m, d) { // the next time this day comes (this year, else next year)
    const y = +today.slice(0, 4); let k = y + '-' + pad(m + 1) + '-' + pad(d);
    if (!okDate(k)) return null; if (k < today) { k = (y + 1) + '-' + pad(m + 1) + '-' + pad(d); if (!okDate(k)) return null; }
    return k;
  }
  // every date expression in a piece of text: [{k:'YYYY-MM-DD', dl:bool (by/before/due), raw, flag}]
  function findDates(s, today) {
    const out = [], low = s.toLowerCase();
    const DL = '(by|before|due|until|no later than|deadline(?: is)?|latest)';
    const push = (k, raw, i, flag) => { if (!k) return; const pre = low.slice(Math.max(0, i - 20), i); out.push({ k, raw, dl: new RegExp('\\b' + DL + '\\s*(?:the\\s+|this\\s+|next\\s+|on\\s+)?$').test(pre), flag, i }); };
    let m;
    const re1 = /\b(today|tonight|this (?:morning|afternoon|evening))\b/g; while ((m = re1.exec(low))) push(today, m[0], m.index);
    const re2 = /\b(tomorrow|tmrw)\b/g; while ((m = re2.exec(low))) push(plus(today, 1), m[0], m.index);
    const re3 = /\bday after tomorrow\b/g; while ((m = re3.exec(low))) push(plus(today, 2), m[0], m.index);
    const re4 = new RegExp('\\b(next |this |on )?(' + DAYS.join('|') + ')\\b', 'g');
    while ((m = re4.exec(low))) {
      const dow = DAYS.indexOf(m[2]), same = at(today).getDay() === dow;
      let k = nextDow(today, dow, m[1] !== 'next ' && true);
      if (m[1] === 'next ' && !same && dayDiff(today, k) < 7) { /* "next Monday" = the coming Monday: keep, but flag */ }
      push(k, m[0].trim(), m.index, same || m[1] === 'next ' ? 'day-check' : undefined);
    }
    const re5 = new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+(' + MONTHS.join('|') + '|' + MONTHS.map(x => x.slice(0, 3)).join('|') + ')\\b', 'g');
    while ((m = re5.exec(low))) { const mi = MONTHS.findIndex(x => x.startsWith(m[2].slice(0, 3))); push(monthDay(today, mi, +m[1]), m[0], m.index); }
    const re6 = new RegExp('\\b(' + MONTHS.join('|') + '|' + MONTHS.map(x => x.slice(0, 3)).join('|') + ')\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b', 'g');
    while ((m = re6.exec(low))) { const mi = MONTHS.findIndex(x => x.startsWith(m[1].slice(0, 3))); push(monthDay(today, mi, +m[2]), m[0], m.index); }
    const re7 = /\b(\d{4})-(\d{2})-(\d{2})\b/g; while ((m = re7.exec(low))) if (okDate(m[0])) push(m[0], m[0], m.index);
    // 5/11 is ambiguous (5 Nov or May 11): day/month (Gulf & Europe), flagged for review
    const re8 = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g;
    while ((m = re8.exec(low))) { const d = +m[1], mo = +m[2] - 1; if (mo >= 0 && mo < 12) push(monthDay(today, mo, d), m[0], m.index, d <= 12 ? 'day-check' : undefined); }
    const re9 = /\bin (\d+|one|two|three|four|five|six|seven|eight|nine|ten|a|an) (day|days|week|weeks)\b/g;
    while ((m = re9.exec(low))) { const n = NUM[m[1]] || +m[1]; push(plus(today, n * (m[2].startsWith('week') ? 7 : 1)), m[0], m.index); }
    return out.sort((a, b) => a.i - b.i);
  }
  function dayDiff(a, b) { return Math.round((at(b) - at(a)) / 864e5); }

  // ---- times ----  [{t:'HH:MM'|null, raw, flag, dl}]
  function findTimes(s) {
    const out = [], low = s.toLowerCase().replace(/\ba\.m\.?/g, 'am').replace(/\bp\.m\.?/g, 'pm');
    let m;
    const reA = /\b(?:at|@|around|by|before|from)?\s*(\d{1,2})(?:[:.h](\d{2}))?\s*(am|pm)\b/g;
    while ((m = reA.exec(low))) { let h = +m[1] % 12; if (m[3] === 'pm') h += 12; const mi = m[2] ? +m[2] : 0; if (+m[1] <= 12 && mi < 60) out.push({ t: pad(h) + ':' + pad(mi), raw: m[0].trim(), dl: /^(by|before)\b/.test(m[0].trim()), i: m.index }); }
    const reB = /\b(?:at|@|around|by|before|from)?\s*([01]?\d|2[0-3])[:h]([0-5]\d)\b(?!\s*(?:am|pm))/g;
    while ((m = reB.exec(low))) { if (out.some(x => Math.abs(x.i - m.index) < 3)) continue; out.push({ t: pad(+m[1]) + ':' + m[2], raw: m[0].trim(), dl: /^(by|before)\b/.test(m[0].trim()), i: m.index }); }
    const reC = /\bat (\d{1,2})\b(?![:.h]?\d|\s*(?:am|pm|%|percent|people|items|clients|emails|calls))/g;
    while ((m = reC.exec(low))) { if (out.some(x => Math.abs(x.i - m.index) < 4)) continue; const h = +m[1]; if (h >= 13 && h <= 23) out.push({ t: pad(h) + ':00', raw: m[0], i: m.index }); else if (h >= 1 && h <= 12) out.push({ t: null, raw: m[0], flag: 'ampm', i: m.index }); }
    const reD = /\b(?:at\s+)?(noon|midday)\b/g; while ((m = reD.exec(low))) out.push({ t: '12:00', raw: m[0], i: m.index });
    return out.sort((a, b) => a.i - b.i);
  }
  const findPart = s => { const m = s.toLowerCase().match(/\b(morning|afternoon|evening|tonight|lunchtime)\b/); return m ? PARTS[m[1]] : null; };

  // remove the date/time words from a title ("Email the client at 5 PM today" → "Email the client")
  function cleanTitle(s) {
    let t = ' ' + s + ' ';
    const kill = [
      /\b(?:by|before|due|until|no later than|on|for|this|next)?\s*(?:the\s+)?(?:today|tonight|tomorrow|tmrw|day after tomorrow)(?:\s+(?:morning|afternoon|evening|night))?\b/gi,
      new RegExp('\\b(?:by|before|due|until|no later than|on|this|next)?\\s*(?:' + DAYS.join('|') + ')(?:\\s+(?:morning|afternoon|evening))?\\b', 'gi'),
      new RegExp('\\b(?:by|before|due|until|on)?\\s*(?:the\\s+)?\\d{1,2}(?:st|nd|rd|th)?(?:\\s+of)?\\s+(?:' + MONTHS.join('|') + '|' + MONTHS.map(x => x.slice(0, 3)).join('|') + ')\\b', 'gi'),
      new RegExp('\\b(?:by|before|due|until|on)?\\s*(?:' + MONTHS.join('|') + '|' + MONTHS.map(x => x.slice(0, 3)).join('|') + ')\\s+\\d{1,2}(?:st|nd|rd|th)?\\b', 'gi'),
      /\b(?:by|before|due|until|on)?\s*\d{4}-\d{2}-\d{2}\b/gi, /\b(?:by|before|due|until|on)?\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/gi,
      /\b(?:at|@|around|by|before|from)?\s*\d{1,2}(?:[:.h]\d{2})?\s*(?:am|pm|a\.m\.?|p\.m\.?)/gi, /\b(?:at|@|around|by|before|from)\s*\d{1,2}[:h]\d{2}\b/gi,
      /\bat \d{1,2}\b/gi, /\b(?:at\s+)?(?:noon|midday)\b/gi, /\bin (?:the\s+)?(?:morning|afternoon|evening)\b/gi,
      /\bin (?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|a|an) (?:day|days|week|weeks)\b/gi,
      /[,\s]*\b(?:it'?s\s+|this is\s+)?(?:very\s+)?(?:urgent(?:ly)?|asap|a\.s\.a\.p|right away|immediately|as soon as possible)\b/gi
    ];
    kill.forEach(r => { t = t.replace(r, ' '); });
    t = t.replace(/\s{2,}/g, ' ').replace(/\s+([,.;!?])/g, '$1').replace(/^[\s,;:\-–—]+|[\s,;:\-–—]+$/g, '').replace(/\s+(?:and|then|at|on|by|for|in)$/i, '').trim();
    return cap(t).slice(0, 120);
  }

  function matchProject(s, projects) {
    const low = ' ' + norm(s) + ' ';
    let best = null;
    (projects || []).forEach(p => { const n = norm(p.name); if (n.length >= 3 && low.includes(' ' + n + ' ') && (!best || n.length > norm(best.name).length)) best = p; });
    return best ? best.id : null;
  }

  // split the whole message into clauses: sentences first, then "A, B and C" when each part starts with a verb
  function clauses(text) {
    const src = String(text || '').replace(/\ba\.m\./gi, 'am').replace(/\bp\.m\./gi, 'pm').replace(/\r/g, '');
    const sents = src.split(/(?:[.!?;]+(?=\s|$)|\n+|\s+[-•*]\s+|^\s*[-•*]\s+)/).map(x => (x || '').trim()).filter(Boolean);
    const out = [];
    sents.forEach(sn => {
      const s = sn.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, '');
      // pieces between commas / "and" / "then"
      const parts = s.split(/\s*,\s*(?:and\s+|then\s+|and then\s+)?|\s+(?:and then|then|and also|and|also|plus)\s+/i);
      let cur = '';
      parts.forEach((p, i) => {
        if (!p) return;
        if (i && cur && isAction(p)) { out.push(cur); cur = p; }
        else cur = cur ? cur + (/^\s*$/.test(cur) ? '' : (s.includes(cur + ', ' + p) ? ', ' : ' and ')) + p : p;
      });
      if (cur) out.push(cur);
    });
    return out.map(x => x.trim()).filter(x => x.length > 1);
  }

  // main entry: text → tasks. ctx: { today:'YYYY-MM-DD', projects:[{id,name}] }
  function parse(text, ctx) {
    ctx = ctx || {}; const today = ctx.today || ymd(new Date());
    const tasks = [];
    clauses(text).forEach(cl => {
      const body = stripLead(cl), urgent = URGENT.test(cl);
      const action = isAction(cl) || /^(urgent|asap)\b[:\s-]*/i.test(body);
      if (!action && tasks.length) { // context for the task just before it ("This is urgent. The client is waiting for the proposal.")
        const prev = tasks[tasks.length - 1];
        if (urgent) prev.urgent = true;
        const c = body.replace(URGENT, '').replace(/^\s*(?:it'?s|this is|that'?s)\s*(?:very\s+)?[.!,]?\s*$/i, '').trim();
        if (c && !/^(?:it'?s|this is|that'?s)?\s*(?:very\s+)?$/i.test(c)) prev.ctx = (prev.ctx ? prev.ctx + ' ' : '') + cap(c.replace(/[.!]+$/, '')) + '.';
        return;
      }
      const t = { text: '', date: null, time: null, deadline: null, urgent, proj: matchProject(cl, ctx.projects), ctx: '', part: null, flags: [] };
      const ds = findDates(cl, today), ts = findTimes(cl);
      ds.forEach(d => {
        if (d.flag) t.flags.push('day');
        if (d.dl) { if (!t.deadline || d.k < t.deadline) t.deadline = d.k; } else if (!t.date) t.date = d.k; else if (d.k !== t.date) t.flags.push('two-dates');
      });
      ts.forEach(x => {
        if (!x.t) { t.flags.push('ampm'); t.ctx = (t.ctx ? t.ctx + ' ' : '') + 'You said “' + x.raw.trim() + '”: AM or PM?'; return; }
        if (x.dl) { t.ctx = (t.ctx ? t.ctx + ' ' : '') + 'Needed by ' + x.t + '.'; if (!t.deadline) t.deadline = t.date || today; return; }
        if (!t.time) t.time = x.t; else if (x.t !== t.time) t.flags.push('two-times');
      });
      if (t.time && !t.date) t.date = t.deadline && !ts.some(x => x.dl) ? t.deadline : today; // "call at 5 pm" with no day = today (said time, shown for review)
      if (t.time && !ds.length) t.flags.push('day-assumed');
      t.part = findPart(cl);
      if (t.part && !t.time) t.ctx = (t.ctx ? t.ctx + ' ' : '') + 'In the ' + (t.part === 'noon' ? 'middle of the day' : t.part) + '.';
      t.text = cleanTitle(stripLead(cl).replace(/^(?:urgent|asap)\b[:\s-]*/i, ''));
      if (!t.text || t.text.length < 2) return;
      if (!action) t.flags.push('check');
      tasks.push(t);
    });
    // same task said twice in one message → once
    const seen = new Set();
    return tasks.filter(t => { const k = norm(t.text); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 15);
  }

  // every date and time the person actually said, used to check what an AI answer claims
  function mentions(text, today) {
    const cl = clauses(text), dates = new Set(), times = new Set();
    cl.forEach(c => { findDates(c, today).forEach(d => dates.add(d.k)); findTimes(c).forEach(x => { if (x.t) times.add(x.t); }); });
    return { dates, times };
  }

  // clean an AI answer: keep only fields that are valid AND said by the person; flag the rest
  function verify(ai, text, ctx) {
    ctx = ctx || {}; const today = ctx.today || ymd(new Date()), M = mentions(text, today), ids = new Set((ctx.projects || []).map(p => p.id));
    const list = Array.isArray(ai) ? ai : ai && Array.isArray(ai.tasks) ? ai.tasks : null;
    if (!list) return null;
    const seen = new Set(), out = [];
    list.slice(0, 15).forEach(x => {
      if (!x || typeof x !== 'object') return;
      const title = cap(String(x.title || x.text || '').replace(/\s+/g, ' ').trim()).slice(0, 120);
      if (title.length < 2 || seen.has(norm(title))) return; seen.add(norm(title));
      const t = { text: title, date: null, time: null, deadline: null, urgent: !!x.urgent && URGENT.test(text), proj: null, ctx: String(x.context || x.ctx || '').trim().slice(0, 300), part: null, flags: [] };
      const chk = (v, set, f) => { if (v == null || v === '') return null; if (set.has(v)) return v; t.flags.push('removed-' + f); return null; };
      t.date = okDate(x.date) ? chk(x.date, M.dates, 'date') : (x.date ? (t.flags.push('removed-date'), null) : null);
      t.deadline = okDate(x.deadline) ? chk(x.deadline, M.dates, 'date') : (x.deadline ? (t.flags.push('removed-date'), null) : null);
      t.time = okTime(x.time) ? chk(x.time, M.times, 'time') : (x.time ? (t.flags.push('removed-time'), null) : null);
      if (t.time && !t.date) { if (M.dates.size <= 1) { t.date = M.dates.size ? [...M.dates][0] : today; t.flags.push('day-assumed'); } else { t.time = null; t.flags.push('removed-time'); } }
      if (x.project && ids.has(x.project)) t.proj = x.project; else if (x.project) t.proj = matchProject(String(x.project), ctx.projects);
      if (x.uncertain) t.flags.push('check');
      out.push(t);
    });
    return out;
  }

  // a spoken project: "Launch a new website in four weeks. First finalize the design, then approve the content, then test, and finally deliver."
  function parseProject(text, ctx) {
    ctx = ctx || {}; const today = ctx.today || ymd(new Date());
    const src = String(text || '').trim(); if (!src) return null;
    const first = src.split(/(?:[.!?;]+(?=\s|$)|\n+|\b(?:first(?:ly)?|to start)\b[,:]?)/i)[0] || src;
    let deadline = null, dlRaw = '';
    const mIn = src.toLowerCase().match(/\b(?:in|within) (\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve|a|an) (day|days|week|weeks|month|months)\b/);
    if (mIn) { const n = NUM[mIn[1]] || +mIn[1]; deadline = mIn[2].startsWith('month') ? (() => { const d = at(today); d.setMonth(d.getMonth() + n); return ymd(d); })() : plus(today, n * (mIn[2].startsWith('week') ? 7 : 1)); dlRaw = mIn[0]; }
    const dls = findDates(first, today).filter(d => d.dl); if (dls.length) { deadline = dls[dls.length - 1].k; dlRaw = dls[dls.length - 1].raw; }
    let name = cleanTitle(stripLead(first).replace(/\b(?:in|within) (?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve|a|an) (?:day|days|week|weeks|month|months)\b/i, ''));
    name = name.replace(/^(?:a |the )?(?:new )?project (?:to |called |named )?/i, '').trim();
    name = cap(name).slice(0, 80);
    // milestones: the steps after "first", in order
    const rest = src.slice(first.length);
    const steps = rest.split(/(?:[.!?;]+(?=\s|$)|\n+|,\s*|\b(?:first(?:ly)?|then|next|after that|afterwards|and finally|finally|lastly|and)\b)/i)
      .map(x => (x || '').trim()).filter(x => x && x.length > 2 && isAction(x));
    const seen = new Set(), ms = [];
    steps.forEach(s => {
      const ds = findDates(s, today), title = cleanTitle(stripLead(s)); const k = norm(title);
      if (!title || seen.has(k)) return; seen.add(k);
      ms.push({ title: title.slice(0, 80), date: ds.length ? ds[0].k : null, said: !!ds.length, suggested: false });
    });
    // dates the person did not say: spread between today and the deadline, clearly marked "suggested" (to check before saving)
    if (deadline && ms.length) {
      const span = Math.max(ms.length, dayDiff(today, deadline)), free = ms.filter(m => !m.date);
      ms.forEach((m, i) => { if (!m.date) { m.date = i === ms.length - 1 ? deadline : plus(today, Math.max(1, Math.round(span * (i + 1) / ms.length))); m.suggested = true; } });
      if (!free.length) { /* every date was said */ }
    }
    return { name, deadline, dlRaw, ms: ms.slice(0, 12) };
  }

  const api = { parse, verify, mentions, parseProject, clauses, findDates, findTimes, cleanTitle, isAction, okDate, okTime };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Capture = api;
})(typeof window !== 'undefined' ? window : this);
