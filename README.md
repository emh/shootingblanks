# Shooting Blanks

One daily phrase, revealed a letter at a time. Press **Enter** or choose **Solve** to pause the reveals and show the keyboard. Fill the remaining blanks in order and press **Enter** to guess. Choose **More letters** to clear your draft and resume reveals. A wrong guess also resumes reveals. The score is the percentage of letters still hidden when you solve, rounded to the nearest point. Watching the whole phrase appear scores zero. Finishing on consecutive local calendar days builds a streak.

## Run locally

Use Node.js 22.13 or newer and npm.

```sh
npm ci
npm start
```

Open the local URL printed by Wrangler (normally http://localhost:8787). Startup creates and seeds a local D1 database in `.wrangler/state/`; subsequent runs keep the data. Run `npm test` for the Worker/D1 integration and game-rule checks. Tests use a separate disposable database.

## Structure

- `public/` contains the HTML, CSS, favicon, and native JavaScript module. Wrangler serves these files directly with no frontend build step.
- `server/worker.mjs` serves the game API. Local development uses the same origin. In production, the Worker accepts browser requests from `https://emh.io`. The browser keeps an anonymous player credential in local storage. Clearing it starts a new player identity. The server stores only its digest.
- `server/schema.sql` creates the database. `server/puzzles.sql` defines the active phrase list for daily and practice draws. Edit its alphabetized entries and reapply the seed to refresh the list. Saved games keep their assigned answers.
- The board wraps at spaces. Each entry has at least two words and seven guessable letters, with a maximum of 32 characters overall and 10 per word. Spaces and visible punctuation count toward the overall limit. Use lowercase letters and straight apostrophes, and double each apostrophe inside a SQL string.
- Each local calendar date has one shared phrase and reveal order. The Worker picks unused phrases first, then the least recently assigned. Only the board mask goes to the client during play. The server checks guesses, records progress, and supplies the final answer when the round ends.

## Play modes and launch day

Play opens today’s daily board. Practice opens an extra phrase and resumes it when you return that day. The upper-left retry button starts a fresh practice phrase. Tutorial starts with three letters hidden and uses the same reveal timing, guessing rules, and scoring as a regular round. It runs locally and can be replayed. History lists daily boards from Day 0 and lets you play a missed puzzle or continue a saved one.

Production Day 0 is November 26, 2026. The deploy command sets `LAUNCH_DAY`, and the production database records that date on first visit. Local previews use the first visitor’s local date. History counts calendar days from launch, including days without plays. The number on a result and in shared text is the selected phrase’s permanent library ID.

## Tracking

`players` identifies returning browsers. `visits` records a page load even if the visitor never starts. It retains the referring hostname, when available. `daily_puzzles` maps dates to the library. `games` stores one daily round per player and date plus individual practice rounds, including reveal count, status, score, and start/finish times. `attempts` stores each submitted phrase, correctness, time, and reveal count. Resume and network retries use the existing game. Times in the database are UTC.

The private [analytics overview](https://analytics.emh.workers.dev/) shows today's visitors, starts, finishes and feedback for Shooting Blanks and Anagramish. The [Shooting Blanks report](https://analytics.emh.workers.dev/shootingblanks) includes page loads, distinct visitors, guesses, scores, elapsed times, sources and phrase familiarity. Its date filters use each action's UTC timestamp, including when someone plays an older puzzle. Both a solve and a full reveal count as a finish. Elapsed time runs from the original start to the finish, including any time away.

Tagged visits store `utm_source`, `utm_medium` and `utm_campaign` in `visit_attribution`. Earlier visits retain their original referring hostname.

The shared analytics Worker caches daily summaries and 1-, 7-, 28- and 90-day reports in this game's D1 database. Today's report also supplies the overview. When visits, games, guesses or feedback change, database triggers mark the affected 500-row blocks for the next five-minute refresh. Opening the dashboard can also advance a due refresh. A repeat view of a current report reads its cached result. Written comments load separately on request. The [shared dashboard source](https://github.com/emh/anagramish/tree/main/workers/analytics) and deployment live in the Anagramish repository.

After a daily or practice round, players can answer “Have you heard this phrase before?” with Yes or No and add an optional comment. The header Feedback button accepts general comments. Responses are sent explicitly. A finished game can receive one familiarity response, including when a submission is retried or the result is reopened. The owner can load written feedback separately in the detail report.

For a daily game report, run the following query in the D1 console or with `npx wrangler d1 execute DB --local --command "<SQL>"`. Use `--remote` for the deployed database.

```sql
SELECT g.day, p.phrase, COUNT(*) AS started,
       SUM(g.status = 'solved') AS solved, SUM(g.status = 'revealed') AS fully_revealed,
       ROUND(AVG(g.score), 1) AS average_finished_score,
       (SELECT COUNT(*) FROM attempts a JOIN games ag ON ag.id = a.game_id
        WHERE ag.day = g.day AND ag.slot = 'daily') AS guesses
FROM games g JOIN daily_puzzles d ON d.day = g.day JOIN puzzles p ON p.id = d.puzzle_id
WHERE g.slot = 'daily'
GROUP BY g.day, p.phrase ORDER BY g.day DESC;
```

## Production deployment

GitHub Pages serves the game at [emh.io/shootingblanks](https://emh.io/shootingblanks/). The game API runs on `shooting-blanks.emh.workers.dev` and uses the dedicated `shooting-blanks` D1 database configured in `wrangler.jsonc`.

Push to `main` to run the tests and deploy. The production workflow checks the live Worker revision, applies the schema and puzzle library and deploys the Worker when its inputs change, then publishes `public/` to Pages. The read-only `/api/health` check verifies the deployed revision and that the library contains puzzles before Pages switches over.

GitHub Pages uses the GitHub Actions source. Worker deployments use the repository variable `CLOUDFLARE_ACCOUNT_ID` and the Actions secret `CLOUDFLARE_API_TOKEN`. Give the token **Workers Scripts · Edit** and **D1 · Edit** on the production Cloudflare account. To publish the backend from an authenticated local Wrangler session, run `npm ci`, `npm test`, and `npm run deploy`.
