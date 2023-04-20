export const numStars = (s) => Math.max(0, 5 - Math.floor(s / 60));

export const loadFile = (file) => fetch(file).then((response) => response.text()).then((text) => text.split('\n'));

export const key = () => {
    const d = new Date(); // local time

    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const getHistory = () => JSON.parse(localStorage.getItem('shootingblanks')) ?? {};

export const putHistory = (history) => localStorage.setItem('shootingblanks', JSON.stringify(history));

export const isEmpty = (obj) => Object.keys(obj).length === 0;

export const isFinished = (state) => {
    let board = '';

    state.game.idiom.split('').forEach((l, i) => {
        if (l === ' ') {
            board += ' ';
        } else {
            const cellLetter = state.game.revealed.includes(i) ? l : state.guess[i];

            board += cellLetter;
        }
    });

    return state.game.idiom === board;
}




// TODO copy prng from pokeer squares!