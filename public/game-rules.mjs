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

// Evaluate one move before the caller persists it or displays the new board.
export function playTurn(game, action, {version, guess}) {
    if (version !== game.version || game.status !== 'playing') return {game, stale: true};
    const current = board(game);
    const next = {...game, version: game.version + 1};
    if (action === 'reveal') {
        next.revealed++;
        if (next.revealed === current.total) {
            next.status = 'revealed';
            next.score = 0;
        }
        return {game: next};
    }
    if (action !== 'attempt') throw new Error('Unknown game action');
    if (typeof guess !== 'string') return {error: 'Enter a phrase.'};
    guess = guess.trim().toLowerCase();
    if (guess.length !== current.mask.length || !Array.from(current.mask).every((c, i) =>
        c === '_' ? /^[a-z]$/.test(guess[i]) : c === guess[i])) return {error: 'Fill every blank.'};
    const correct = guess === game.phrase;
    if (correct) {
        next.status = 'solved';
        next.score = Math.round(100 * (1 - game.revealed / current.total));
    }
    return {game: next, guess, correct};
}
