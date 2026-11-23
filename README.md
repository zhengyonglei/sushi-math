# Sushi Math

[Play Sushi Math](https://zhengyonglei.github.io/sushi-math/)

A calm multiplication practice game with a moving sushi conveyor. Every session contains exactly 20 questions, with no lives or game-over threshold. Correct first attempts divided by 20 gives the session accuracy. Wrong answers and unanswered plates show the correct equation immediately, and count as incorrect for accuracy.

## Learning and controls

- Default 15 seconds per plate; Settings offers 8–30 seconds for the next session.
- Tap a plate, enter an answer with the on-screen keypad or keyboard, and Grab plate.
- Pause freezes plate motion; resuming gives a three-second countdown. Leaving the tab pauses automatically.
- Start fresh asks before discarding unfinished work. Completed history is kept.
- Regular sessions combine familiar facts, harder facts, and up to six previously missed facts. Missed facts return until answered correctly twice after the most recent miss.
- Animated chopsticks, eating reactions, rolling belt, collected plates, and a celebration for every completed session. Reduced-motion preferences are respected.

## Saving progress

One learner history per browser. IndexedDB stores settings, completed sessions, individual answers, and the unfinished session. Answers save immediately, with moving-plate positions checkpointed approximately every two seconds. If IndexedDB is unavailable, the app tries localStorage; if saving fails, it shows a visible warning. Old point-based scores are not converted into fictional learning history.

My progress contains first-attempt accuracy over the last 20 sessions, a recent average, exact results, and facts still being learned. Export backup downloads JSON including unfinished progress. Import validates and merges completed sessions by ID and preserves an existing unfinished session. Keep a backup: browser data can be cleared or evicted. There is no automatic cross-device sync and no player data is uploaded to GitHub or another server.

## Hosting

Static HTML/CSS/JavaScript with no dependencies or build. GitHub Pages publishes `main` from the repository root; the root index redirects to `dist/`. Netlify is also supported by `netlify.toml`. The game UI can be opened from `dist/index.html`; reliable browser storage is best tested on its HTTPS hosted origin.
