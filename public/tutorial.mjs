import { board, playTurn } from './game-rules.mjs';

// The tutorial can be played and replayed offline. Its round lives in memory.
export function createTutorial(day) {
    const started = Date.now();
    let round = {day, phrase: 'piece of cake', revealed: 8, version: 0, status: 'playing', score: null};
    return (action, body) => {
        if (action === 'start') return {game: board(round)};
        const turn = playTurn(round, action, body);
        if (turn.error) throw new Error(turn.error);
        round = turn.game;
        if (round.status !== 'playing' && !turn.stale) {
            round.finished_at = Date.now();
            round.elapsed_seconds = Math.floor((round.finished_at - started) / 1000);
        }
        return {game: board(round), correct: turn.correct, stale: turn.stale};
    };
}
