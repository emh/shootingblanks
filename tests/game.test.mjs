import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createTestHarness } from 'wrangler';
import { revealOrder, streak } from '../server/game.mjs';

test('punctuation stays visible and streaks use consecutive calendar days', () => {
    const order = revealOrder('ill-gotten gains', '2026-11-25');
    assert.equal(new Set(order).size, 14);
    assert.ok(!order.includes(3) && !order.includes(10));
    assert.deepEqual(order, revealOrder('ill-gotten gains', '2026-11-25'));
    const days = ['2026-10-31','2026-11-01'];
    assert.equal(streak(days, '2026-11-02'), 2);
    assert.equal(streak(days, '2026-11-03'), 0);
});

test('daily games and tracking persist through retries and simultaneous requests', async t => {
    const server = createTestHarness({workers: [{configPath: './wrangler.jsonc'}]});
    t.after(() => server.close());
    await server.listen();
    const {DB: db} = await server.getWorker().getEnv();
    const sql = async name => (await readFile(new URL('../server/' + name, import.meta.url), 'utf8')).trim();
    for (const statement of (await sql('schema.sql')).split(';').filter(s => s.trim())) {
        await db.prepare(statement).run();
    }
    const seedStatements = (await sql('puzzles.sql')).split(';').filter(s => s.trim());
    const seed = () => db.batch(seedStatements.map(s => db.prepare(s)));
    const day = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.parse(day) - 86400000).toISOString().slice(0, 10);
    await db.prepare("INSERT INTO puzzles (id, phrase) VALUES (1, 'piece of cake')").run();
    await db.prepare('INSERT INTO daily_puzzles (day, puzzle_id) VALUES (?, 1)').bind(yesterday).run();
    await seed();
    const countPuzzles = () => db.prepare('SELECT COUNT(*) FROM puzzles').first('COUNT(*)');
    const count = await countPuzzles();
    const phrases = (await db.prepare('SELECT phrase FROM current_phrases').all()).results.map(row => row.phrase);
    assert.ok(phrases.length > 1000);
    assert.equal(count, phrases.length + 1);
    const letters = phrase => phrase.replace(/[^a-z]/g, '');
    assert.equal(new Set(phrases.map(letters)).size, phrases.length);
    for (const phrase of phrases) {
        assert.match(phrase, /^[a-z',?!-]+(?: [a-z',?!-]+)+$/);
        assert.ok(letters(phrase).length >= 7 && phrase.length <= 32, phrase);
        assert.ok(phrase.split(' ').every(word => word.length <= 10), phrase);
    }
    await seed();
    assert.equal(await countPuzzles(), count);
    const token = crypto.randomUUID();
    const visit = crypto.randomUUID();
    const request = (route, data = {}, key = token) => server.fetch('/api/' + route, {
        method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({day, ...data})
    });
    const post = async (...args) => {
        const response = await request(...args);
        assert.equal(response.status, 200);
        return response.json();
    };
    assert.equal((await request('stats', {}, 'invalid')).status, 401);
    const recordVisit = () => post('visit', {visit, referrer:'https://example.com/private-path?q=abc'});
    assert.deepEqual(await recordVisit(), {game:null, dayZero:day});
    await recordVisit();
    assert.equal(await db.prepare('SELECT COUNT(*) FROM visits').first('COUNT(*)'), 1);
    assert.equal(await db.prepare('SELECT referrer_host FROM visits').first('referrer_host'), 'example.com');
    const [first, replay] = await Promise.all([post('start'),post('start')]);
    assert.deepEqual(first, replay);
    assert.equal(first.game.answer, null);
    assert.doesNotMatch(first.game.mask, /[a-z]/);
    const phrase = await db.prepare('SELECT phrase FROM puzzles JOIN daily_puzzles ON puzzle_id = id WHERE day = ?').bind(day).first('phrase');
    assert.ok(phrases.includes(phrase));
    const revealed = await post('reveal', {version:0});
    assert.equal(revealed.game.revealed, 1);
    assert.deepEqual((await post('reveal', {version:0})).game, revealed.game);
    assert.deepEqual((await recordVisit()).game, revealed.game);
    assert.equal((await request('attempt', {version:1,guess:''})).status, 400);
    const miss = revealed.game.mask.replaceAll('_','z');
    const attempt = () => post('attempt', {version:1,guess:miss});
    await Promise.all([attempt(), attempt()]);
    const resumed = (await recordVisit()).game;
    assert.equal(resumed.version, 2);
    assert.equal(resumed.revealed, 1);
    assert.equal(resumed.answer, null);
    const win = (await post('attempt', {version:2,guess:phrase})).game;
    assert.equal(win.answer, phrase);
    assert.equal(win.score, Math.round(100 * (1 - 1 / win.total)));
    assert.equal(win.status, 'solved');
    assert.ok(Number.isInteger(win.elapsedSeconds) && win.elapsedSeconds >= 0);
    assert.deepEqual((await post('start')).game, win);
    assert.deepEqual((await post('attempt', {version:2,guess:phrase})).game, win);
    assert.equal(await db.prepare('SELECT COUNT(*) FROM attempts').first('COUNT(*)'), 2);
    assert.deepEqual(await post('stats'), {played:1, solved:1, best:win.score, streak:1});

    const other = crypto.randomUUID();
    await post('visit', {visit:crypto.randomUUID()}, other);
    let game = (await post('start', {}, other)).game;
    assert.deepEqual(game, first.game);
    while (game.status === 'playing') {
        game = (await post('reveal', {version:game.version}, other)).game;
    }
    assert.equal(game.answer, phrase);
    assert.equal(game.status, 'revealed');
    assert.equal(game.score, 0);
    assert.deepEqual(await post('stats', {}, other), {played:1, solved:0, best:0, streak:1});
    assert.equal((await request('start', {puzzleDay:yesterday})).status, 400);
    const practice = crypto.randomUUID();
    const extra = (await post('start', {practice})).game;
    assert.deepEqual((await post('start', {practice})).game, extra);
    const practiceAnswer = await db.prepare('SELECT phrase FROM puzzles p JOIN games g ON g.puzzle_id = p.id WHERE g.slot = ?').bind(practice).first('phrase');
    assert.notEqual(practiceAnswer, phrase);
    const practiceWin = await post('attempt', {practice, version:0, guess:practiceAnswer});
    assert.equal(practiceWin.game.status, 'solved');
    assert.equal(practiceWin.game.puzzleId, await db.prepare('SELECT id FROM puzzles WHERE phrase = ?').bind(practiceAnswer).first('id'));
    assert.deepEqual(await post('stats'), {played:1, solved:1, best:win.score, streak:1});
    assert.deepEqual(await post('history'), {games:[{day, status:'solved', score:win.score}]});
    const next = crypto.randomUUID();
    await post('start', {practice:next});
    const nextAnswer = await db.prepare('SELECT phrase FROM puzzles p JOIN games g ON g.puzzle_id = p.id WHERE g.slot = ?').bind(next).first('phrase');
    assert.notEqual(nextAnswer, practiceAnswer);
    await db.prepare('UPDATE calendar SET day_zero = ? WHERE id = 1').bind(yesterday).run();
    const archived = await post('start', {puzzleDay:yesterday});
    assert.equal(archived.game.mask, '_____ __ ____');
    assert.equal((await post('attempt', {puzzleDay:yesterday, version:0, guess:'piece of cake'})).game.status, 'solved');
    assert.equal((await post('history')).games.length, 2);

    // A retired puzzle can still be finished, but fresh draws use the current pool.
    await db.prepare("DELETE FROM current_phrases WHERE phrase NOT IN ('cat got your tongue?', 'beginner''s luck')").run();
    const earlier = new Date(Date.parse(yesterday) - 86400000).toISOString().slice(0, 10);
    await db.prepare('UPDATE calendar SET day_zero = ? WHERE id = 1').bind(earlier).run();
    const dailyDraw = await post('start', {puzzleDay:earlier});
    const practiceDraw = await post('start', {puzzleDay:earlier, practice:crypto.randomUUID()});
    assert.deepEqual(new Set([dailyDraw.game.mask, practiceDraw.game.mask]), new Set(["___ ___ ____ ______?", "________'_ ____"]));
});
