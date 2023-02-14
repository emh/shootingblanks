'use strict';

import idiomsFile from './idioms.txt';

import { VirtualKeyboard } from './virtual-keyboard.mjs';
import { GameBoard } from './game-board.mjs';
import { PopupMessage } from './popup-message.mjs';

let timeoutId = null;

export const loadFile = (file) => fetch(file).then((response) => response.text()).then((text) => text.split('\n'));

export const isLetter = (s) => s.length === 1 && ((s >= 'a' && s <= 'z') || (s >= 'A' && s <= 'Z') || s === ' ');

function renderKeyboard() {
    const container = document.getElementById('keyboard');

    const control = (value) => ({ value, control: true });
    const letter = (value) => ({ value });
    const keys = [
        ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'].map(letter),
        ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'].map(letter),
        [...['z', 'x', 'c', 'v', 'b', 'n', 'm'].map(letter), control('⌫')],
    ];

    const keyboard = new VirtualKeyboard(keys);

    container.innerHTML = '';
    container.append(keyboard);
}

function renderBoard(state) {
    const container = document.getElementById('board');
    const gameBoard = new GameBoard(state);

    container.innerHTML = '';
    container.append(gameBoard);

    if (state.finished) {
        showMessage(`You got it after ${state.revealed.length} letter${state.revealed.length === 1 ? '' : 's'}.`);

        clearTimeout(timeoutId);
    }
}

function render(state) {
    renderBoard(state);
    renderKeyboard();
}

function moveToPreviousGuessLetter(state) {
    let i = state.position;

    do {
        i -= 1;
    } while (
        (state.idiom[i] === ' ' ||
            state.revealed.includes(i)) &&
        i > 0
    )

    state.position = i;
}

function moveToNextBlank(state) {
    let i = state.position;

    do {
        i += 1;
    } while (
        (state.idiom[i] === ' ' ||
            state.guess[i] !== ' ' ||
            state.revealed.includes(i)) &&
        i < state.idiom.length
    )

    state.position = i;
}

function startClock(state) {
    const fn = () => {
        console.log('tick');
        const letterCount = state.idiom.replaceAll(' ', '').length;

        let i = null;
        do {
            i = Math.floor(Math.random() * state.idiom.length);
        } while (state.idiom[i] === ' ' || state.revealed.includes(i));

        if (i === state.position) {
            console.log('moving');
            moveToNextBlank(state);
        }

        state.revealed.push(i);
        state.seconds += 1;

        if (state.revealed.length < letterCount) {
            timeoutId = setTimeout(fn, (state.seconds + 1) * 1000);
        }

        console.log(state);

        renderBoard(state);
    };

    timeoutId = setTimeout(fn, 1000);
}

function showMessage(message) {
    const app = document.getElementById('app');
    const pm = new PopupMessage();

    const content = document.createElement('div');
    content.setAttribute('slot', 'content');
    content.innerHTML = `${message}<br/><br/><div class="buttons"><button>OK</button>`;

    pm.append(content);
    app.append(pm);

    pm.addEventListener('buttonClick', (e) => {
        app.removeChild(pm);
    });
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
    state.guess = ' '.repeat(state.idiom.length);
    state.position = 0;
}

function setupKeyboardHandler(state) {
    const keyboard = document.querySelector('virtual-keyboard');

    keyboard.addEventListener('keypress', (event) => {
        clearPopup();

        const key = event.detail.key;

        if (key === '⌫') {
            handleBackspace(state);
        } else if (key.length === 1) {
            handleLetterInput(state, key);
        }

        renderBoard(state);
    });

    document.addEventListener('keydown', (e) => {
        console.log(e);
        clearPopup();
        switch (e.key) {
            case 'Backspace':
                handleBackspace(state);
                break;
            case 'Escape':
                handleEscape(state);
                break;
            default:
                if (isLetter(e.key)) {
                    handleLetterInput(state, e.key);
                } else {
                    console.log(e.key);
                }
        }

        renderBoard(state);
    });
}

async function main() {
    const idioms = await loadFile(idiomsFile);

    const idiom = idioms[Math.floor(Math.random() * idioms.length)];

    const state = {
        idiom,
        revealed: [],
        guess: ' '.repeat(idiom.length),
        position: 0,
        seconds: 0
    };

    render(state);
    startClock(state);
    setupKeyboardHandler(state);
};

main();
