# ADHD Winner

(Anciennement « Bravo ».)

To-do list en jeu pour les personnes TDAH : récompenses immédiates, défis du jour, agenda avec alarmes, minuteur focus, coach IA Noor et bilan de la semaine.

Application distincte de My Style.

## Noor's gestures
Noor reacts on every page: waves hello (Today, Coach), turns a page when you change tab, points at the Calendar, breathes calmly on Focus, cheers when you win, and puts a finger on her chin with a thought bubble while she thinks.
To use real animated clips later, add the video files (e.g. `nour-think.mp4`) and list them in `NOUR_CLIPS` in `index.html`.

## Tasks & calendar (Oct 27)
One list (`S.tasks`) feeds the task list, the calendar (Day / Week / Month), alarms and Noor. A task can have a date and a start/end time, or no date at all ("Someday"). Appointments are the same objects with `kind:'event'`. Older saved data is migrated automatically on first open; nothing is deleted.

## Help me start (Oct 27)
The old "I'm stuck" chip is now a full flow: **Help me start** (big button on Today, chip in Coach, "Start this task" in the task/appointment editor, chip in Noor's bubble).
Blocker (6 choices, or skip) → pick a real task → ONE next step (Noor via the Cloudflare worker; if she can't be reached, an offline rules engine gives a step and says so honestly) → "Start with me" session with an optional 2/5/10 min timer → "How did it go?".
- Never marks a task done, moves it or creates it without the person's tap. Postponing offers Later today / Tomorrow / Keep.
- Session kept in `localStorage['adhdwStart']` (survives page change and refresh; a pill "▶ your step" brings it back).
- XP via the existing `win()`: +5 start, +10 step done, +3 back after a distraction — each at most once per session, quiet toast (no pop-up during focus).
- Preferences (Profile → Help me start): step size, timer, one step at a time. "Tinier steps" is only saved after the person says yes. Reset button.
- Usage counts stay on the phone (`S.hl`): event names only, never task text or what the person wrote.

## Phone app & backup (Oct 28)
- **Installable PWA**: complete manifest (separate maskable icon so Android doesn't crop the brain, home-screen shortcuts Add / Calendar / Focus), iPhone launch screens in `splash/`, service worker that cleans old caches, works offline and brings the app forward when a notification is tapped.
- **Reminders**: notifications always go through the service worker; permission is asked when the person turns an alarm on (explained first, never on first open); missed alarms are listed on return ("While you were away", nothing marked done); "Add to my phone calendar" (.ics) for alarms that must ring even when the app is closed.
- **Profile → This phone**: honest status (installed? alerts?) and what can and cannot ring.
- **Profile → Backup**: export / import JSON with validation, no duplicates, double confirmation before replacing, Undo. The plan is never read from a file.
- Security fix: the first name is now escaped in Noor's bubble.
- Details, limits and the native-app plan: `docs/MOBILE-PLAN.md`.

## Personal / Work, table view, Arabic, Start Rate (Oct 28)
- **Add a task**: type it → **Add** → two big cards **PERSONAL / WORK** (nothing is saved before the choice; Cancel gives the text back) → optional **⏰ Add a date & time**. The task is filed under the day being viewed (Tomorrow tab = tomorrow), never the day it was typed. The full editor also asks Personal or Work for new tasks.
- **Table view**: grid button next to the list title (choice remembered). Every task and appointment, all days: Task · Type · Date · Start · Duration · Status, sortable (type, date, start, status), filtered by the Work / Personal chips. Tick, **Later** (next day, same time, no XP lost), tap the type to switch it, tap the name to edit or delete. On a phone the table scrolls sideways inside its box, task names stay visible.
- **Calendar**: same `S.tasks` as the list and table. When two open items cross, a gentle note says *These tasks overlap. Would you like to adjust the schedule?* with **Change** (opens the later one) or **Keep both** (remembered until the times change). Nothing is ever moved automatically.
- **Help me start in Arabic**: `عربي / English` button in the sheet and in Profile. Every button, message and offline step is in Arabic, right to left (`dir="rtl"` on the sheet, its pill and the Today button only). Noor is asked to answer in simple Modern Standard Arabic; Arabic task names are matched by Arabic keywords. The rest of the app stays in English for now.
- **Profile → My starts**: Start Rate = sessions where Help me start showed a step **and** the person pressed Start / said “I started” / finished a step, ÷ sessions where a step was shown. Once per session, refresh-proof. Also: different tasks started, starts in the last 7 days. “Share my numbers” exports a JSON file without task names (for the user test).
- **XP**: micro-steps give a quiet toast (no full-screen pop-up); a daily challenge can't be credited twice (un-ticking takes the XP back); “Move to today” goes through `updateTask` (alarms reset correctly).
- **Delete** from a list: first tap shows “Delete?”, second tap deletes (disarms after 3.5 s).
- User test with 5 people: `docs/USER-TEST-PLAN.md` (set-up ready, results still to collect).

## ADHD Winner Business (Oct 28)
A dedicated work workspace: ☰ menu → **Business** (also Pro → Business). Needs the Business plan (free trial for now).
- **One list, no duplicates**: a business task is a normal task in `S.tasks` with `cat:'work'` and a `biz` object (project, urgency, importance, consequences, deadline, estimate, status, priority override, dependencies, notes, history). Its calendar entry and its reminder are the same object, so editing moves it, completing marks it done in the calendar, deleting removes the reminder.
- **Tabs**: Dashboard · Tasks (subtasks with progress “3 of 6”, reorder, start, schedule) · Priorities (P1/P2/P3 with reasons, override, one question when info is missing) · Calendar (next 7 days with free time, overlaps, proposals to approve) · Coach · Pending (missed-task review, blocked/waiting, paused/delegated, notes) · Review (weekly, from saved data only).
- **Priority**: urgency + deadline + importance + consequences + free work time before the deadline + blockers. Urgent alone is not P1. Missing importance → the app asks instead of guessing.
- **Reminders**: on by default for scheduled business tasks, 0–60 min before the start (`remBefore`, also in the .ics export). Same in-app/notification limits as the rest of the app (a closed web app cannot ring; use the phone-calendar export).
- **Coach**: an offline planner picks ONE next action (+ max 2), a first step and a free slot, and asks before scheduling. Noor's AI (Cloudflare worker) only rephrases those facts; if it's unreachable the page says “Offline planner”. Facts and assumptions are shown separately.
- **Missed tasks**: never moved or marked failed automatically; “What happened?” with 7 reasons + note, then reschedule / choose a time / pause until they reply / delegate / pause / remove.
- **Work hours** (⚙ Hours): days, hours, default reminder; Gulf time zones default to Sun–Thu.
- Tests: `tests/business.test.js` (the 14 acceptance scenarios).

## AI Business Brain (Oct 28)
Top of **Business → Dashboard**, Business plan only. Answers: what first, why, what can wait, what is blocking, the smallest first step.
- **Engine in `brain.js`** (pure JS, no DOM, no network; tested alone in `tests/brain-engine.test.js`). Weights are in one table (`Brain.W`). Inputs: urgency, deadline (overdue / today / tomorrow / ≤3 / ≤7 days), importance, consequences, free work time before the deadline, subtasks started, **tasks it unblocks**, **project importance**, blockers. A date counts half when the person said low impact *and* minor consequences.
- **4 levels**: P1 Do first · P2 Do next · P3 Plan · P4 Later (P4 only when everything entered says “later”; urgent stays at least P3). Manual choice always wins; when the app would now recommend something else it says so once (**Use P… / Keep mine**).
- **All projects compared together**: one #1 (project, level, deadline, time, why, *if it waits* — only from what was entered —, first action, **START THIS TASK**), the **next three** with “#2 because…”, then Overdue / Important / Plan for later / Waiting or blocked (collapsed). Several P1 → one realistic order. Blocked, snoozed and on-hold tasks are never #1.
- **Missing facts** are never guessed: the task is marked *Provisional* and **Add missing information** asks only the empty fields.
- **Actions**: Start (Help me start + timer) · Mark completed · Smaller steps (AI proposal or labelled template, edited and saved only on yes, no duplicates on regenerate) · Why this priority · Snooze (kept in lists and calendar) · Change priority (Auto, P1–P4) · View project · Schedule (free slot, asks first) · Reanalyze · “Time I have now” (tie-break inside a level only).
- **Projects**: importance High / Medium / Low and **On hold** in Goals & projects.
- **AI**: Noor (Cloudflare worker) only rephrases the #1 reasons, one call per change of #1 (title + reasons + first step are sent, nothing else). Offline → “Rules engine”, everything still works.
- **Same task objects** as the list, calendar and reminders: nothing is copied. New fields (`biz.snooze`, `biz.overKeep`, `projs[].imp`, `projs[].hold`) are optional; old data loads as is.
- Plan check: the page and every Business action check `hasPlan('business')`. There is no payment or server yet, so this is a client-side check (see the PR / report).
- Tests: `tests/brain.test.js` (browser, the 18 acceptance scenarios).

## Tests
`npm install && npx playwright install chromium && npm test` runs the end-to-end tests in `tests/` (app, Help me start, phone & backup, Oct 28 features), served over a local http server (`tests/serve.js`).

## Intro video (Oct 29)
The opening screens (first-open name + daily affirmation) play `splash/intro.mp4` behind the content: a 12 s neon particle loop, recoloured to the app palette (violet, neon pink, cyan) and blended into the night-violet gradient (`mix-blend-mode: screen`, so its black becomes the app background). Silent, plays only while the opening screen is visible, hidden with "reduce motion". Not cached by the service worker (iPhone needs byte-range answers for video).
