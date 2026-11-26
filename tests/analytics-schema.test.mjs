import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

test('analytics queues changed 500-row blocks and bootstraps historical data once', async t => {
    const db = new DatabaseSync(':memory:');
    t.after(() => db.close());
    const schema = await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8');
    db.exec(schema);
    const queue = () => db.prepare('SELECT kind, part, revision FROM analytics_dirty_parts ORDER BY kind, part')
        .all().map(row => [row.kind, row.part, row.revision]);
    const clearQueue = () => db.exec('DELETE FROM analytics_dirty_parts');
    assert.deepEqual(queue(), []);
    db.exec(`
        INSERT INTO players(id) VALUES ('p');
        INSERT INTO visits(rowid,id,player_id) VALUES (500,'first','p'),(501,'second','p');
        INSERT INTO puzzles(id,phrase) VALUES (1,'old phrase');
        INSERT INTO games(id,player_id,day,slot,puzzle_id) VALUES (1,'p','2026-11-25','daily',1);
        INSERT INTO attempts(id,game_id,version,guess,revealed,correct) VALUES (1,1,0,'bad guess',0,0);
        INSERT INTO feedback(id,player_id,comment,screen) VALUES ('general','p','Hello','landing');
    `);
    assert.deepEqual(queue(), [
        ['attempts',0,1], ['feedback',0,1], ['games',0,1], ['visits',0,1], ['visits',1,1]
    ]);
    clearQueue();
    // Simulate an existing deployment with raw data but no previous cache state.
    db.exec('DELETE FROM analytics_summary_state');
    db.exec(schema);
    assert.deepEqual(queue(), [
        ['attempts',0,1], ['feedback',0,1], ['games',0,1], ['visits',0,1], ['visits',1,1]
    ]);
    clearQueue();
    db.exec(`
        UPDATE games SET revealed=1, version=1, status='playing', score=NULL, finished_at=NULL WHERE id=1;
        INSERT OR IGNORE INTO visits(id,player_id) VALUES ('first','p');
        INSERT INTO feedback(id,player_id,comment,screen) VALUES ('general','p','Hello','landing') ON CONFLICT DO NOTHING;
    `);
    assert.deepEqual(queue(), []);
    db.exec(`
        INSERT INTO visit_attribution(player_id,visit_id,source) VALUES ('p','second','newsletter');
        UPDATE visit_attribution SET source='another' WHERE visit_id='second';
        INSERT OR IGNORE INTO visit_attribution(player_id,visit_id,source) VALUES ('p','second','ignore');
        UPDATE games SET status='solved', score=50, finished_at='2026-11-26 01:00:00' WHERE id=1;
        UPDATE games SET score=75 WHERE id=1;
        INSERT INTO attempts(game_id,version,guess,revealed,correct) VALUES (1,1,'old phrase',1,1);
        INSERT INTO feedback(id,player_id,game_id,heard_before,comment,screen) VALUES ('vote','p',1,'yes','','finish');
    `);
    const changed = [['attempts',0,1], ['feedback',0,1], ['games',0,2], ['visits',1,2]];
    assert.deepEqual(queue(), changed);
    db.exec(`
        UPDATE analytics_summary_state SET generation=7, initial_ready=1;
        INSERT INTO analytics_daily_summaries(kind,part,day,piece,payload) VALUES ('games',0,'2026-11-26',0,'[]');
        INSERT INTO analytics_report_cache(days,day,generation,expires_at,payload) VALUES (7,'2026-11-26',7,100,'{}');
    `);
    db.exec(schema);
    assert.deepEqual(queue(), changed);
    assert.equal(db.prepare('SELECT generation FROM analytics_summary_state').get().generation, 7);
    assert.equal(db.prepare('SELECT count(*) AS n FROM analytics_daily_summaries').get().n, 1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM analytics_report_cache').get().n, 1);
});
