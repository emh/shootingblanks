export { board, playTurn, revealOrder } from '../public/game-rules.mjs';

export function streak(days, today) {
    const completed = new Set(days);
    const cursor = new Date(today + 'T00:00:00Z');
    const previous = () => cursor.setUTCDate(cursor.getUTCDate() - 1);
    const date = () => cursor.toISOString().slice(0, 10);
    if (!completed.has(date())) previous();
    let count = 0;
    while (completed.has(date())) {
        count++;
        previous();
    }
    return count;
}
