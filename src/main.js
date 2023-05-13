'use strict';

import idiomsFile from './idioms.txt';

import { VirtualKeyboard } from './virtual-keyboard.mjs';
import { GameBoard } from './game-board.mjs';
import { PopupMessage } from './popup-message.mjs';
import { loadFile, key, getHistory, putHistory, isEmpty, isFinished } from './utils.mjs';
import { prng } from './prng.mjs';

let timeoutId = null;

const seed = Date.parse(key());
const random = prng(seed);
const randInt = (n) => {
    const v = Math.floor(random() * n);
    console.log(v);
    return v;
};

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

function getLetters(game) {
    let wordIndex = 0;

    return game.idiom.split('').map((letter, i) => {
        if (letter === ' ') wordIndex++;

        return {
            letter,
            i,
            wordIndex,
            revealed: game.revealed.includes(i)
        };
    }).filter((l) => l.letter !== ' ');
}

function countUnrevealed(letters) {
    return letters.reduce((acc, letter) => {
        const { wordIndex, revealed } = letter;

        acc[wordIndex] ||= 0;

        if (!revealed) acc[wordIndex]++;

        return acc;
    }, {});
}

function nextLetter(game) {
    const letters = getLetters(game);
    const unrevealedByWord = countUnrevealed(letters);
    const maxUnrevealed = Math.max(...Object.values(unrevealedByWord));

    const nextLetters = letters.filter((letter) => {
        return unrevealedByWord[letter.wordIndex] === maxUnrevealed;
    }).filter((letter) => {
        return !letter.revealed;
    })

    let i = randInt(nextLetters.length);

    return nextLetters[i].i;
}


function startClock(state) {
    const { game } = state;

    const fn = () => {
        const letterCount = countLetters(game.idiom);

        let i = nextLetter(game);

        if (i === state.position) {
            moveToNextBlank(state);
        }

        game.revealed.push(i);
        game.ticks += 1;

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
        clearPopup();

        if (game.over) return;

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
        clearPopup();

        if (game.over) return;

        switch (e.key) {
            case 'Backspace':
                if (state.isSolving) handleBackspace(state);
                break;
            case 'Escape':
                if (state.isSolving) handleEscape(state);
                break;
            case 'Enter':
                if (state.isSolving) {
                    handleEnter(state);
                } else {
                    handleSolve(state);
                }
                break;
            case ' ':
                if (!state.solving) handleSolve(state);
                break;
            default:
                if (state.isSolving && isLetter(e.key) && state.position < game.idiom.length) {
                    handleLetterInput(state, e.key);
                } else {
                    console.log(e.key);
                }
        }

        render(state);
    });
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

const calcScore = (revealed, letterCount) => Math.round((1 - (revealed / letterCount)) * 100);

function emojiIdiom(idiom, revealed) {
    return idiom.split('').map((l, i) => {
        if (l === ' ') return l;

        return revealed.includes(i) ? '⬜' : '🟨';
    }).join('');
}

function showSuccess(state) {
    const revealed = state.game.revealed.length;
    const letterCount = countLetters(state.game.idiom);

    const message = `
        <p>You're done!</p>
        <p>${revealed < letterCount ? `You solved it after ${revealed} letters.` : 'You just watched it play out huh?'}</p>
        <p>Your score is ${calcScore(revealed, letterCount)}</p>
        <div>
        ${emojiIdiom(state.game.idiom, state.game.revealed)}
        </div>
        <p>Your streak is ${state.streak}, come back tomorrow to extend it.</p>
        <p id="copied">Copied to clipboard.</p>
        <div class="buttons">
        <button>Share</button>
        <button>Copy</button>
        <button>OK</button>
        <button>*</button>
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
                'Shooting Blanks by @emh',
                emojiIdiom(state.game.idiom, state.game.revealed),
                `Score: ${calcScore(state.game.revealed.length, countLetters(state.game.idiom))}`,
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
            navigator.clipboard.writeText(localStorage.getItem('shootingblanks'));
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
    const idiom = idioms[randInt(idioms.length)];

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
    const div = document.getElementById('message');

    div.innerHTML = "NOPE";

    setTimeout(() => div.innerHTML = '', 1000);
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
                <button autofocus>Start</button>
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
