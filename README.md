# Shooting Blanks

One daily phrase, revealed a letter at a time. Type a letter to pause the reveals, fill the remaining blanks in order, and press **Enter**. A wrong guess resumes reveals. The score is the percentage of letters still hidden when you solve, rounded to the nearest point. Watching the whole phrase appear scores zero. Finishing on consecutive local calendar days builds a streak.

## Run locally

Use Node.js 22.13 or newer and npm.

```sh
npm ci
npm start
```

Open the local URL printed by Wrangler (normally http://localhost:8787). Startup creates and seeds a local D1 database in `.wrangler/state/`; subsequent runs keep the data. Run `npm test` for the Worker/D1 integration and game-rule checks. Tests use a separate disposable database.

## Structure

- `public/` contains the HTML, CSS, favicon, and native JavaScript module. Wrangler serves these files directly with no frontend build step.
- `server/worker.mjs` serves the same-origin game API. The browser keeps an anonymous player credential in local storage. Clearing it starts a new player identity. The server stores only its digest.
- `server/schema.sql` creates the database. `server/puzzles.sql` defines the active phrase list for daily and practice draws. Edit its alphabetized entries and reapply the seed to refresh the list. Saved games keep their assigned answers.
- The board wraps at spaces. Each entry has at least two words and seven guessable letters, with a maximum of 32 characters overall and 10 per word. Spaces and visible punctuation count toward the overall limit. Use lowercase letters and straight apostrophes, and double each apostrophe inside a SQL string.
- Each local calendar date has one shared phrase and reveal order. The Worker picks unused phrases first, then the least recently assigned. Only the board mask goes to the client during play. The server checks guesses, records progress, and supplies the final answer when the round ends.

## Play modes and launch day

Play opens today’s daily board. Practice opens an extra phrase and resumes it when you return that day. The upper-left retry button starts a fresh practice phrase. Tutorial walks through an example on the same keyboard. History lists daily boards from Day 0 and lets you play a missed puzzle or continue a saved one.

Set the Worker variable `LAUNCH_DAY` to the public launch date in `YYYY-MM-DD` format before opening the production database to visitors. Each new database stores its own Day 0 on first visit. For local previews, omitting the variable uses the first visitor’s local date. History counts calendar days from launch, including days without plays. The number on a result and in shared text is the selected phrase’s permanent library ID.

## Tracking

`players` identifies returning browsers. `visits` records a page load even if the visitor never starts. It retains the referring hostname, when available. `daily_puzzles` maps dates to the library. `games` stores one daily round per player and date plus individual practice rounds, including reveal count, status, score, and start/finish times. `attempts` stores each submitted phrase, correctness, time, and reveal count. Resume and network retries use the existing game. Times in the database are UTC.

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

## Deploy to Cloudflare

Serve the static assets and API from one Worker. From an authenticated Wrangler session, create a dedicated database with `npx wrangler d1 create shooting-blanks`. Put its returned `database_id` in the existing `DB` binding in `wrangler.jsonc`, then initialize the database before publishing.

```sh
npx wrangler d1 execute DB --remote --file server/schema.sql
npx wrangler d1 execute DB --remote --file server/puzzles.sql
npx wrangler deploy
```
