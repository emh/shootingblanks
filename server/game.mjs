// Prefer words with the most blanks, as on the original board. The same daily
// seed gives every player the same clues, including after a refresh.
export function revealOrder(phrase, day) {
    let seed = Number(day.replaceAll('-', ''));
    const words = [];
    let word = [];
    for (let i = 0; i < phrase.length; i++) {
        if (phrase[i] === ' ') {
            words.push(word);
            word = [];
        } else if (/[a-z]/i.test(phrase[i])) word.push(i);
    }
    words.push(word);
    const order = [];
    while (words.some(word => word.length)) {
        const longest = Math.max(...words.map(word => word.length));
        const choices = words.filter(word => word.length === longest).flat();
        seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
        const index = choices[Math.floor(seed / 2 ** 32 * choices.length)];
        const owner = words.find(word => word.includes(index));
        owner.splice(owner.indexOf(index), 1);
        order.push(index);
    }
    return order;
}

export function board(game) {
    if (!game) return null;
    const order = revealOrder(game.phrase, game.day);
    const shown = new Set(order.slice(0, game.revealed));
    const mask = Array.from(game.phrase, (c, i) => /[a-z]/i.test(c) && !shown.has(i) ? '_' : c).join('');
    return {
        day: game.day, status: game.status, version: game.version, mask,
        revealed: game.revealed, total: order.length, score: game.score,
        answer: game.status === 'playing' ? null : game.phrase,
        ...(game.heard_before ? {heardBefore: game.heard_before} : {}),
        ...(game.finished_at ? {elapsedSeconds: game.elapsed_seconds, puzzleId: game.puzzle_id} : {})
    };
}

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
