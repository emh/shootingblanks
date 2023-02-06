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
        [control('⏎'), ...['z', 'x', 'c', 'v', 'b', 'n', 'm'].map(letter), control('⌫')],
        [{ value: ' ', space: true }]
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
}

function renderGuess(state) {
    const div = document.getElementById('guess');

    div.textContent = state.guess;
}

function render(state) {
    renderBoard(state);
    renderKeyboard();
}

function startClock(state) {
    const fn = () => {
        console.log('tick');
        const letterCount = state.idiom.replaceAll(' ', '').length;

        let i = null;
        console.log('before');
        do {
            i = Math.floor(Math.random() * state.idiom.length);
            console.log(i);
        } while (state.idiom[i] === ' ' || state.revealed.includes(i));
        console.log('after');

        state.revealed.push(i);
        state.seconds += 1;

        console.log(state.revealed.length, letterCount);
        if (state.revealed.length < letterCount) {
            console.log('again');
            timeoutId = setTimeout(fn, (state.seconds + 1) * 1000);
        } else {
            console.log('done');
        }

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
    if (state.guess.length > 0) state.guess = state.guess.substring(0, state.guess.length - 1);
}

function handleLetterInput(state, letter) {
    state.guess = state.guess + letter;
}

function handleEnter(state) {
    if (state.guess === state.idiom) {
        showMessage(`You got it after ${state.revealed.length} letter${state.revealed.length === 1 ? '' : 's'}.`);

        clearTimeout(timeoutId);
    } else {
        showMessage('nope.');
    }
}

function handleEscape(state) {
    state.guess = '';
}

function setupKeyboardHandler(state) {
    const keyboard = document.querySelector('virtual-keyboard');

    keyboard.addEventListener('keypress', (event) => {
        clearPopup();

        const key = event.detail.key;

        if (key === '⌫') {
            handleBackspace(state);
        } else if (key === '⏎') {
            handleEnter(state);
        } else if (key.length === 1) {
            handleLetterInput(state, key);
        }

        renderGuess(state);
    });

    document.addEventListener('keydown', (e) => {
        clearPopup(); 
        switch (e.key) {
            case 'Backspace':
                handleBackspace(state);
                break;
            case 'Enter':
                handleEnter(state);
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

        renderGuess(state);
    });
}

async function main() {
    const idioms = await loadFile(idiomsFile);

    const idiom = idioms[Math.floor(Math.random() * idioms.length)];

    const state = {
        idiom,
        revealed: [],
        guess: '',
        seconds: 0
    };

    console.log(state);

    render(state);
    startClock(state);
    setupKeyboardHandler(state);
};

main();
