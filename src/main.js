'use strict';

import idiomsFile from './idioms.txt';

import { VirtualKeyboard } from './virtual-keyboard.mjs';
import { GameBoard } from './game-board.mjs';
import { PopupMessage } from './popup-message.mjs';

let timeoutId = null;

import { loadFile, key, getHistory, putHistory, isEmpty, isFinished } from './utils.mjs';

const isLetter = (s) => s.length === 1 && ((s >= 'a' && s <= 'z') || (s >= 'A' && s <= 'Z'));

const countLetters = (idiom) => idiom.replaceAll(' ', '').length;

function goal(name) {
    try {
        clicky.goal('shootingblanks.' + name);
    } catch (e) {
        console.error('Error logging goal', name, e);
    }
}

function loadGame() {
    const history = getHistory();

    return history[key()];
}

function saveGame(game) {
    const history = getHistory();

    history[key()] = game;

    putHistory(history);
}

function renderKeyboard(state) {
    const container = document.getElementById('keyboard');
    container.innerHTML = '';

    const control = (value) => ({ value, control: true });
    const letter = (value) => ({ value });

    const keys = state.isSolving ? [
        ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'].map(letter),
        ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'].map(letter),
        [control('⏎'), ...['z', 'x', 'c', 'v', 'b', 'n', 'm'].map(letter), control('⌫')],
    ] : [
        [ control('Solve')]
    ];

    const keyboard = new VirtualKeyboard(keys);

    container.append(keyboard);

    setupVirtualKeyboardHandler(state);
}

function renderBoard(state) {
    const container = document.getElementById('board');
    const gameBoard = new GameBoard(state);

    container.innerHTML = '';
    container.append(gameBoard);

    if (state.game.over) {
        showSuccess(state);
        clearTimeout(timeoutId);
    }

    saveGame(state.game);
}

function render(state) {
    renderBoard(state);

    if (!state.game.over) renderKeyboard(state);
}

function moveToPreviousGuessLetter(state) {
    let i = state.position;

    do {
        i -= 1;
    } while (
        (state.game.idiom[i] === ' ' ||
            state.game.revealed.includes(i)) &&
        i > 0
    )

    state.position = i;
}

function moveToNextBlank(state) {
    let i = state.position;

    do {
        i += 1;
    } while (
        (state.game.idiom[i] === ' ' ||
            state.guess[i] !== ' ' ||
            state.game.revealed.includes(i)) &&
        i < state.game.idiom.length
    )

    state.position = i;
}

function startClock(state) {
    const { game } = state;

    const fn = () => {
        const letterCount = countLetters(game.idiom);

        let i = null;
        let m = 0;
        do {
            i = calcIndex(key(), game.idiom.length, game.revealed.length + m);
            m++;
        } while (m < 1000 && (game.idiom[i] === ' ' || game.revealed.includes(i)));

        if (i === state.position) {
            moveToNextBlank(state);
        }

        game.revealed.push(i);
        game.ticks += 1;

        console.log(game.revealed.length, letterCount);

        if (game.revealed.length === letterCount) {
            game.over = true;
            state.streak++;
        }

        if (!game.over) {
            timeoutId = setTimeout(fn, (game.ticks + 1) * 1000);
        }

        render(state);
    };

    timeoutId = setTimeout(fn, (game.ticks + 1) * 1000);
}

function clearPopup() {
    const app = document.getElementById('app');
    const popup = app.querySelector('popup-message');

    if (popup) {
        app.removeChild(popup);

        return true;
    }

    return false;
}

function handleBackspace(state) {
    const temp = state.guess.split('');

    moveToPreviousGuessLetter(state);

    temp.splice(state.position, 1, ' ');

    state.guess = temp.join('');
}

function handleLetterInput(state, letter) {
    const temp = state.guess.split('');

    temp.splice(state.position, 1, letter);

    state.guess = temp.join('');

    moveToNextBlank(state);
}

function handleEscape(state) {
    state.guess = ' '.repeat(state.game.idiom.length);
    state.position = 0;
}

function handleEnter(state) {
    if (isFinished(state)) {
        state.streak++;
        state.game.over = true;
    } else {
        showFailure(state);
        state.guess = ' '.repeat(state.game.idiom.length);
        state.position = 0;
        state.isSolving = false;
        startClock(state);
    }

    render(state);
}

function handleSolve(state) {
    clearTimeout(timeoutId);

    state.isSolving = true;

    render(state);
}

function setupVirtualKeyboardHandler(state) {
    const keyboard = document.querySelector('virtual-keyboard');

    const game = state.game;

    keyboard.addEventListener('keypress', (event) => {
        if (game.over) return;

        clearPopup();

        const key = event.detail.key;

        if (key === '⌫') {
            handleBackspace(state);
        } else if (key === '⏎') {
            handleEnter(state);
        } else if (key.length === 1 && state.position < game.idiom.length) {
            handleLetterInput(state, key);
        } else if (key === 'Solve') {
            handleSolve(state);
        }

        render(state);
    });

}

function setupKeyboardHandler(state) {
    const game = state.game;

    document.addEventListener('keydown', (e) => {
        if (game.over || !state.isSolving) return;

        clearPopup();

        switch (e.key) {
            case 'Backspace':
                handleBackspace(state);
                break;
            case 'Escape':
                handleEscape(state);
                break;
            case 'Enter':
                handleEnter(state);
                break;
            default:
                if (isLetter(e.key) && state.position < game.idiom.length) {
                    handleLetterInput(state, e.key);
                } else {
                    console.log(e.key);
                }
        }

        render(state);
    });
}

const calcIndex = (k, n, o = 0) => {
    var d = Date.parse(k) + (o * 3331);

    const f = Math.PI - 3; // need a number > 0 and < 1
    const s = d.valueOf() / 1000;
    const r = (s * f) - Math.floor(s * f);
    const i = Math.floor(n * r);

    return i;
}

function calculateStreak(history) {
    let streak = 0;
    const keys = Object.keys(history);
    let pk = null;

    keys.sort().forEach((k) => {
        const game = history[k];

        if ((!game.over && k !== key()) || (pk && new Date(k) - new Date(pk) > 86400000)) {
            streak = 0;
        }

        if (game.over) {
            streak++;
        }

        pk = k;
    });

    if (pk && new Date(key()) - new Date(pk) > 86400000) {
        streak = 0;
    }

    return streak;
}

function emojiIdiom(idiom, revealed) {
    return idiom.split('').map((l, i) => {
        if (l === ' ') return l;

        return revealed.includes(i) ? '🟨' : '⬛';
    }).join('');
}

function showSuccess(state) {
    const revealed = state.game.revealed.length;
    const letterCount = countLetters(state.game.idiom);

    const message = `
        <p>You're done!</p>
        <p>${revealed < letterCount ? `You needed ${revealed} of ${letterCount} letters.` : 'You just watched it play out huh?'}</p>
        <div>
        ${emojiIdiom(state.game.idiom, state.game.revealed)}
        </div>
        <p>Your streak is ${state.streak}, come back tomorrow to extend it.</p>
        <p id="copied">Copied to clipboard.</p>
        <div class="buttons">
        <button>Share</button>
        <button>Copy</button>
        <button>OK</button>
        </div>
    `;

    const app = document.getElementById('app');
    const popup = new PopupMessage('success');
    const div = document.createElement('div');

    div.setAttribute('id', 'popup');
    div.setAttribute('slot', 'content');
    div.innerHTML = message;

    popup.addEventListener('buttonClick', (e) => {
        const { name } = e.detail;

        if (name === 'Share' || name === 'Copy') {
            goal('Shared');

            const share = [
                'Shooting Blanks',
                'by @emh',
                emojiIdiom(state.game.idiom, state.game.revealed),
                `Streak: ${state.streak}`,
                '',
                'https://emh.io/shootingblanks'
            ];

            const data = {
                title: 'Shooting Blanks',
                text: share.join('\n')
            };

            if (name === 'Share' && navigator.canShare && navigator.canShare(data)) {
                navigator.share(data);
            } else {
                const div = document.querySelector('#copied');
                div.style.visibility = "visible";

                navigator.clipboard.writeText(data.text);
            }
        } else if (name === '*') {
            navigator.clipboard.writeText(localStorage.getItem('history'));
        } else {
            app.removeChild(popup);
        }
    });

    popup.append(div);
    app.appendChild(popup);
}

function init(idioms) {
    const history = getHistory();
    const newUser = isEmpty(history);
    const streak = calculateStreak(history);
    const idiom = idioms[calcIndex(key(), idioms.length)];

    let game = loadGame();

    if (!game) {
        game = {
            idiom,
            revealed: [],
            ticks: 0
        };

        saveGame(game);
    }

    return {
        streak,
        newUser,
        game,
        isSolving: false,
        guess: ' '.repeat(idiom.length),
        position: 0
    };
}

function showFailure(state) {
    const app = document.getElementById('app');
    const error = new PopupMessage('error');

    const message = "That's not it, try again!";

    const content = document.createElement('div');
    content.setAttribute('slot', 'content');
    content.innerHTML = `${message}<br/><br/><div class="buttons"><button>OK</button>`;

    error.append(content);
    app.append(error);

    error.addEventListener('buttonClick', (e) => {
        app.removeChild(error);
    });
}

function showPopup(state) {
    return new Promise((resolve) => {
        const app = document.getElementById('app');
        const popup = new PopupMessage();

        const div = document.createElement('div');
        div.setAttribute('slot', 'content');
        let message = '';

        if (state.newUser) {
            message = `
                <p>Welcome to Shooting Blanks.</p>
                <p>Try to guess the phrase before all of the letters are revealed to you.</p>
                <p>Click Solve when you think you got it and then enter your guess with the keyboard.</p>
            `;
        } else {
            message = `
                <p>Welcome back!</p>
                <p>Click Solve when you think you got it and then enter your guess with the keyboard.</p>
                ${state.streak > 0 ?
                    `<p>Your streak is currently ${state.streak}.</p>` :
                    '<p>Starting a new streak today - come back daily to keep it going.'
                }
            `;
        }

        div.innerHTML = `
            ${message}
            <p>Ready?</p>
            <div class="buttons">
                <button>Help</button>
                <button>Start</button>
            </div>
        `;

        popup.append(div);

        popup.addEventListener('buttonClick', (event) => {
            const { name } = event.detail;

            if (name === 'Start') {
                app.removeChild(popup);
                state.started = true;
                resolve();
            } else {
                showHelp();
            }
        });

        app.appendChild(popup);
    });
}

async function main() {
    const idioms = await loadFile(idiomsFile);
    const state = init(idioms);

    render(state);

    if (!state.game.over) {
        showPopup(state).then(() => {
            startClock(state);
            setupKeyboardHandler(state);
        });
    }
};

main();
