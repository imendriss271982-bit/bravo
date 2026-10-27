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

## Tests
`npm install && npx playwright install chromium && npm test` runs the end-to-end tests in `tests/` (app + Help me start), served over a local http server (`tests/serve.js`).
