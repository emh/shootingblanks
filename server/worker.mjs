import { board, streak } from './game.mjs';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const json = (body, status = 200) => Response.json(body, {status, headers: {'Cache-Control': 'no-store'}});

function validDay(day) {
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
    const date = new Date(day + 'T00:00:00Z');
    return Number.isFinite(+date) && date.toISOString().startsWith(day);
}

function referrerHost(referrer) {
    try {
        const url = new URL(referrer);
        return ['https:', 'http:'].includes(url.protocol) ? url.hostname.slice(0, 253) : null;
    } catch { return null; }
}

function campaignLabel(value) {
    return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 100) || null : null;
}

const gameQuery = `SELECT g.*, p.phrase, f.heard_before,
    unixepoch(g.finished_at) - unixepoch(g.started_at) AS elapsed_seconds
    FROM games g
    JOIN puzzles p ON p.id = g.puzzle_id
    LEFT JOIN feedback f ON f.game_id = g.id
    WHERE g.player_id = ? AND g.day = ? AND g.slot = ?`;

async function saveFeedback(db, player, data, getGame) {
    const {id, heardBefore = null, comment, screen} = data;
    if (!uuid.test(id) || !['landing','round','tutorial','finish','history'].includes(screen) ||
        typeof comment !== 'string' || comment.length > 1000) return json({error: 'Please check your feedback.'}, 400);
    const message = comment.trim();
    if (heardBefore !== null) {
        if (!['yes','no'].includes(heardBefore) || screen !== 'finish') return json({error: 'Choose Yes or No.'}, 400);
        const game = await getGame();
        if (!game?.finished_at) return json({error: 'Finish the phrase before sending a response.'}, 400);
        const [, saved] = await db.batch([
            db.prepare(`INSERT INTO feedback(id,player_id,game_id,heard_before,comment,screen)
                VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING`).bind(id, player, game.id, heardBefore, message, screen),
            db.prepare('SELECT heard_before FROM feedback WHERE game_id = ? AND player_id = ?').bind(game.id, player)
        ]);
        return saved.results.length ? json({heardBefore: saved.results[0].heard_before})
            : json({error: 'Reopen feedback and try again.'}, 409);
    }
    if (!message) return json({error: 'Write a comment before sending.'}, 400);
    // Keep comment retries idempotent, including when two requests arrive together.
    const [,, receipt] = await db.batch([
        db.prepare('INSERT OR IGNORE INTO players(id) VALUES (?)').bind(player),
        db.prepare(`INSERT INTO feedback(id,player_id,comment,screen)
            SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM feedback WHERE player_id = ? AND game_id IS NULL
                AND created_at > datetime('now','-1 day')) < 3 ON CONFLICT DO NOTHING`)
            .bind(id, player, message, screen, player),
        db.prepare('SELECT id FROM feedback WHERE id = ? AND player_id = ? AND game_id IS NULL').bind(id, player)
    ]);
    return receipt.results.length ? json({ok: true}) : json({error: 'Please wait a day before sending more comments.'}, 429);
}

async function stats(db, player, day) {
    const totals = await db.prepare(`SELECT COUNT(*) AS played,
        COUNT(CASE WHEN status = 'solved' THEN 1 END) AS solved, MAX(score) AS best
        FROM games WHERE slot = 'daily' AND player_id = ?`).bind(player).first();
    const days = await db.prepare("SELECT day FROM games WHERE slot = 'daily' AND player_id = ? AND status <> 'playing' AND day <= ?")
        .bind(player, day).all();
    return {...totals, streak: streak(days.results.map(row => row.day), day)};
}

async function api(request, db, route, launchDay) {
    if (request.method !== 'POST') return json({error: 'Use POST.'}, 405);
    const token = request.headers.get('Authorization')?.replace(/^Bearer /, '');
    if (!uuid.test(token)) return json({error: 'Player identity required.'}, 401);
    // Store only the digest of the anonymous browser credential.
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    const player = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    let data;
    try { data = await request.json(); } catch { return json({error: 'Invalid request.'}, 400); }
    const today = data?.day;
    const day = data?.puzzleDay ?? today;
    const slot = data?.practice ?? 'daily';
    if (!validDay(today) || !validDay(day) || day > today || (slot !== 'daily' && !uuid.test(slot)))
        return json({error: 'Invalid puzzle.'}, 400);
    const utcToday = new Date().toISOString().slice(0,10);
    if (Math.abs(Date.parse(today) - Date.parse(utcToday)) > 86400000)
        return json({error: 'Check the date on your device.'}, 400);
    const getGame = () => db.prepare(gameQuery).bind(player, day, slot).first();
    if (route === 'visit') {
        if (launchDay !== undefined && !validDay(launchDay)) throw new Error('Invalid LAUNCH_DAY');
        if (!uuid.test(data.visit)) return json({error: 'Invalid visit.'}, 400);
        const writes = [
            db.prepare('INSERT OR IGNORE INTO calendar(id,day_zero) VALUES (1,?)').bind(launchDay ?? today),
            db.prepare('INSERT OR IGNORE INTO players(id) VALUES (?)').bind(player),
            db.prepare('INSERT OR IGNORE INTO visits(player_id,id,referrer_host) VALUES (?,?,?)')
                .bind(player, data.visit, referrerHost(data.referrer))
        ];
        const tags = [data.source, data.medium, data.campaign].map(campaignLabel);
        if (tags.some(Boolean)) writes.push(db.prepare(`INSERT OR IGNORE INTO visit_attribution
            (player_id,visit_id,source,medium,campaign) VALUES (?,?,?,?,?)`).bind(player, data.visit, ...tags));
        await db.batch(writes);
        return json({dayZero: await db.prepare('SELECT day_zero FROM calendar').first('day_zero'), game: board(await getGame())});
    }
    if (route === 'feedback') return saveFeedback(db, player, data, getGame);
    if (route === 'history') {
        const rows = await db.prepare("SELECT day,status,score FROM games WHERE player_id = ? AND slot = 'daily' AND day <= ? ORDER BY day DESC").bind(player, today).all();
        return json({games: rows.results});
    }
    if (route === 'stats') return json(await stats(db, player, day));
    if (route === 'start') {
        // Freeze the assignment once per local calendar date. Cycle through
        // unused phrases before reusing the least recently played ones.
        const firstDay = await db.prepare('SELECT day_zero FROM calendar').first('day_zero');
        if (!firstDay || (slot === 'daily' && day < firstDay)) return json({error:'This puzzle is before launch.'}, 400);
        const daily = db.prepare(`INSERT OR IGNORE INTO games(player_id,day,slot,puzzle_id)
            SELECT ?,day,'daily',puzzle_id FROM daily_puzzles WHERE day = ?`).bind(player, day);
        const practice = db.prepare(`INSERT OR IGNORE INTO games(player_id,day,slot,puzzle_id)
            SELECT ?,?,?,p.id FROM current_phrases JOIN puzzles p USING (phrase)
            LEFT JOIN games g ON g.puzzle_id = p.id AND g.player_id = ?
            WHERE p.id <> (SELECT puzzle_id FROM daily_puzzles WHERE day = ?)
            GROUP BY p.id ORDER BY MAX(g.id), random() LIMIT 1`).bind(player, day, slot, player, day);
        await db.batch([
            db.prepare(`INSERT OR IGNORE INTO daily_puzzles(day,puzzle_id)
                SELECT ?, p.id FROM current_phrases JOIN puzzles p USING (phrase)
                LEFT JOIN daily_puzzles d ON d.puzzle_id = p.id
                GROUP BY p.id ORDER BY MAX(d.day), random() LIMIT 1`).bind(day),
            slot === 'daily' ? daily : practice
        ]);
        return json({game: board(await getGame())});
    }
    if (!['attempt','reveal'].includes(route)) return json({error: 'Unknown action.'}, 404);

    const game = await getGame();
    if (!game) return json({error: 'Start the puzzle first.'}, 404);
    const current = board(game);
    // A retry or a second tab receives the latest board without counting twice.
    if (data.version !== game.version || game.status !== 'playing') return json({game: current, stale: true});
    const guard = "WHERE id = ? AND version = ? AND status = 'playing'";
    if (route === 'reveal') {
        const done = game.revealed + 1 === current.total;
        await db.prepare(`UPDATE games SET revealed = revealed + 1, version = version + 1,
            status = ?, score = ?, finished_at = CASE WHEN ? THEN CURRENT_TIMESTAMP END ${guard}`)
            .bind(done ? 'revealed' : 'playing', done ? 0 : null, +done, game.id, game.version).run();
    } else {
        if (typeof data.guess !== 'string') return json({error: 'Enter a phrase.'}, 400);
        const guess = data.guess.trim().toLowerCase();
        if (guess.length !== current.mask.length || !Array.from(current.mask).every((c,i) =>
            c === '_' ? /^[a-z]$/.test(guess[i]) : c === guess[i])) return json({error: 'Fill every blank.'}, 400);
        const correct = guess === game.phrase;
        const score = correct ? Math.round(100 * (1 - game.revealed / current.total)) : null;
        const [attempt] = await db.batch([
            db.prepare(`INSERT INTO attempts(game_id,version,guess,revealed,correct)
                SELECT id,version,?,revealed,? FROM games ${guard}`).bind(guess, +correct, game.id, game.version),
            db.prepare(`UPDATE games SET version = version + 1, status = ?, score = ?,
                finished_at = CASE WHEN ? THEN CURRENT_TIMESTAMP END ${guard}`)
                .bind(correct ? 'solved' : 'playing', score, +correct, game.id, game.version)
        ]);
        return json({game: board(await getGame()), correct: attempt.meta.changes ? correct : null});
    }
    return json({game: board(await getGame())});
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
        const origin = request.headers.get('Origin');
        if (origin && origin !== url.origin && origin !== 'https://emh.io')
            return json({error: 'Origin is not allowed.'}, 403);
        let response;
        try {
            if (url.pathname === '/api/health' && request.method === 'GET') {
                const ready = await env.DB.prepare('SELECT 1 FROM current_phrases LIMIT 1').first();
                response = json({ready: !!ready, revision: env.VERSION.tag}, ready ? 200 : 503);
            } else if (request.method === 'OPTIONS') {
                response = new Response(null, {status: 204, headers: {
                    'Access-Control-Allow-Methods': 'POST',
                    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
                    'Access-Control-Max-Age': '86400'
                }});
            } else {
                response = await api(request, env.DB, url.pathname.slice(5), env.LAUNCH_DAY);
            }
        } catch (error) {
            console.error('Game API error', error.message);
            response = json({error: 'The game could not be saved. Please try again.'}, 503);
        }
        response.headers.set('Vary', 'Origin');
        if (origin) response.headers.set('Access-Control-Allow-Origin', origin);
        return response;
    }
};
