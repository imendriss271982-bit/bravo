# ADHD Winner

(Anciennement « Bravo ».)

To-do list en jeu pour les personnes TDAH : récompenses immédiates, défis du jour, agenda avec alarmes, minuteur focus, coach IA Noor et bilan de la semaine.

Application distincte de My Style.

## Noor's gestures
Noor reacts on every page: waves hello (Today, Coach), turns a page when you change tab, points at the Calendar, breathes calmly on Focus, cheers when you win, and puts a finger on her chin with a thought bubble while she thinks.
To use real animated clips later, add the video files (e.g. `nour-think.mp4`) and list them in `NOUR_CLIPS` in `index.html`.

## Tasks & calendar (Oct 27)
One list (`S.tasks`) feeds the task list, the calendar (Day / Week / Month), alarms and Noor. A task can have a date and a start/end time, or no date at all ("Someday"). Appointments are the same objects with `kind:'event'`. Older saved data is migrated automatically on first open; nothing is deleted.

## Tests
`npm install && npx playwright install chromium && npm test` runs the end-to-end tests in `tests/app.test.js` against `index.html`.
