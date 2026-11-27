import { setupFeedback } from './feedback.mjs';

const $ = id => document.getElementById(id);
const main = document.querySelector('main');
const welcome = $('landing');
const play = $('play');
const apiBase = location.origin === 'https://emh.io'
    ? 'https://shooting-blanks.emh.workers.dev/api/' : './api/';
const localDay = () => {
    const d = new Date();
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
};
const lesson = 'piece of cake';
const dayMs = 86400000;
const daysSinceLaunch = date => Math.round((Date.parse(date) - Date.parse(dayZero)) / dayMs);
let dayZero;
let screen = 'landing';
let kind = 'daily';
let requestGroup = 0;
let practiceId;
let historyRows;
let nextHistoryDay;
const visit = crypto.randomUUID();
let day = localDay();
let game = null;
let mode = 'ready';
let busy = false;
let retry = null;
let timer;
let draft = '';
let message = '';
let player;

function identity() {
    if (player) return player;
    const key = 'shooting-blanks.player.v1';
    try {
        player = localStorage.getItem(key) || crypto.randomUUID();
        localStorage.setItem(key, player);
    } catch { player = crypto.randomUUID(); }
    return player;
}

async function api(action, body = {}) {
    const res = await fetch(apiBase + action, {
        method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + identity()},
        body: JSON.stringify({day: localDay(), ...body})
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const error = new Error(body.error || 'Game request failed');
        error.status = res.status;
        throw error;
    }
    return res.json();
}

function draw(mask, answer, lastMask) {
    const tiles = $('tiles');
    const words = mask.split(' ');
    tiles.style.setProperty('--longest', Math.max(...words.map(word => word.length)));
    const fragment = document.createDocumentFragment();
    let index = 0;
    let blank = 0;
    const spoken = [];
    for (const text of words) {
        const word = document.createElement('span');
        word.className = 'word';
        for (const char of text) {
            const missing = char === '_';
            const typed = missing && (answer?.[index] || (mode === 'solve' && draft[blank]));
            const tile = document.createElement('span');
            tile.className = 'cell ' + (missing ? typed ? 'typed' : 'empty' : 'lit');
            if (!missing && lastMask?.[index] === '_') tile.classList.add('new');
            if (missing && mode === 'solve' && blank === draft.length) tile.classList.add('cursor');
            tile.textContent = typed || (missing ? '' : char);
            spoken.push(tile.textContent || 'blank');
            word.append(tile);
            if (missing) blank++;
            index++;
        }
        fragment.append(word);
        spoken.push(',');
        index++;
    }
    tiles.replaceChildren(fragment);
    const label = spoken.join(' ');
    tiles.setAttribute('aria-label', label);
    if (lastMask && mask !== lastMask) $('live').textContent = 'Board now reads ' + label;
}

function showScreen(name, content) {
    clearTimeout(timer);
    requestGroup++;
    busy = false;
    retry = null;
    screen = name;
    main.replaceChildren(content);
    main.scrollTop = 0;
    $('home').hidden = name === 'landing';
    $('restart').hidden = true;
    $('controls').hidden = name !== 'round';
    $('controls').replaceChildren();
}

function render(lastMask) {
    if (screen !== 'round') return;
    const solving = mode === 'solve';
    const done = mode === 'done';
    if (done && kind !== 'tutorial') {
        renderFinish(lastMask);
        return;
    }
    $('restart').hidden = kind !== 'practice';
    $('round-name').textContent = kind === 'tutorial' ? 'Tutorial' : '';
    if (kind === 'tutorial') {
        $('intro').textContent = done ? 'You filled the blanks!'
            : 'The phrase is “piece of cake.” Type ' + lessonLetters().toUpperCase().split('').join(', then ') + ' and press Enter.';
    } else {
        $('intro').textContent = '';
    }
    if (game) draw(game.mask, game.answer, lastMask);
    else {
        $('tiles').replaceChildren();
        $('tiles').setAttribute('aria-label','Loading phrase');
    }
    $('controls').hidden = done;
    $('tutorial-finish').hidden = !done;
    $('tutorial-play').disabled = play.disabled;
    const locked = busy || !!retry || !game;
    for (const key of $('keyboard').querySelectorAll('button')) key.disabled = locked;
    $('enter').disabled = locked || !solving || draft.length !== game.total - game.revealed;
    $('secondary').hidden = !solving || kind === 'tutorial';
    $('secondary').disabled = locked;
    $('retry-request').hidden = !retry;
    $('notice').textContent = message || (done ? 'Score ' + game.score + ' / 100' : !game ? 'Loading phrase…' : '');
}

function lessonLetters() {
    return Array.from(lesson).filter((_, i) => game.mask[i] === '_').join('');
}

function schedule() {
    clearTimeout(timer);
    if (screen !== 'round' || busy || retry || mode !== 'watch' || document.hidden || $('dialog').open || $('feedback-dialog').open) return;
    if (kind === 'tutorial') {
        if (game.mask.endsWith('_')) timer = setTimeout(() => {
            const previous = game.mask;
            game.mask = 'p_ece of ca_e';
            game.revealed++;
            render(previous);
        }, 1000);
    } else timer = setTimeout(() => update('reveal', {version: game.version}), (game.revealed + 1) * 1000);
}

async function update(action, body = {}) {
    if (busy) return;
    const group = requestGroup;
    busy = true;
    retry = null;
    clearTimeout(timer);
    message = '';
    render();
    const previous = game?.mask;
    try {
        const result = await api(action, {puzzleDay: day, practice: kind === 'practice' ? practiceId : undefined, ...body});
        if (group !== requestGroup) return;
        game = result.game;
        draft = '';
        mode = game.status !== 'playing' ? 'done' : 'watch';
        if (result.correct === false) message = 'That’s not the phrase. Watch for another letter and try again.';
        if (result.stale && mode === 'watch') message = 'Your latest board is loaded.';
    } catch {
        if (group !== requestGroup) return;
        retry = () => update(action, body);
        message = 'Couldn’t reach the game. Check your connection and try again.';
    } finally {
        if (group === requestGroup) {
            busy = false;
            render(previous);
            schedule();
        }
    }
}

function updatePlayAvailability() {
    play.disabled = !dayZero || localDay() < dayZero;
    if (screen === 'round') $('tutorial-play').disabled = play.disabled;
}

async function connect() {
    const reconnect = welcome.querySelector('#reconnect');
    const status = welcome.querySelector('#connection');
    reconnect.hidden = true;
    try {
        const tags = new URLSearchParams(location.search);
        let referrer;
        if (document.referrer) {
            const from = new URL(document.referrer);
            const gamePath = new URL('./', location.href).pathname;
            if (from.origin !== location.origin || !from.pathname.startsWith(gamePath)) referrer = from.origin;
        }
        const result = await api('visit', {
            visit, referrer, source: tags.get('utm_source'), medium: tags.get('utm_medium'), campaign: tags.get('utm_campaign')
        });
        dayZero = result.dayZero;
        updatePlayAvailability();
        welcome.querySelector('#practice').disabled = false;
        welcome.querySelector('#history').disabled = false;
        status.hidden = !play.disabled;
        status.textContent = 'The daily puzzle opens on launch day.';
    } catch {
        status.hidden = reconnect.hidden = false;
        status.textContent = 'Couldn’t connect to the puzzle library.';
    }
}

function startRound(type, date = localDay(), fresh = false) {
    showScreen('round', $('round-template').content.cloneNode(true));
    $('controls').append($('keyboard-template').content.cloneNode(true));
    $('secondary').onclick = watch;
    $('retry-request').onclick = () => retry();
    $('tutorial-play').onclick = () => startRound('daily');
    $('tutorial-replay').onclick = () => startRound('tutorial');
    $('tutorial-home').onclick = home;
    kind = type;
    day = date;
    game = null;
    draft = message = '';
    mode = 'ready';
    if (kind === 'tutorial') {
        const mask = 'p_ece of ca__';
        const total = lesson.replaceAll(' ', '').length;
        game = {mask, total, revealed: total - 3, status:'playing'};
        mode = 'watch';
        render();
        schedule();
        return;
    }
    if (kind === 'practice') {
        const key = 'shooting-blanks.practice.' + day;
        try {
            practiceId = (!fresh && localStorage.getItem(key)) || crypto.randomUUID();
            localStorage.setItem(key, practiceId);
        } catch { practiceId = crypto.randomUUID(); }
    }
    update('start');
}

function addHistoryPage() {
    const last = Math.max(0, nextHistoryDay - 29);
    for (; nextHistoryDay >= last; nextHistoryDay--) {
        const date = new Date(Date.parse(dayZero) + nextHistoryDay * dayMs).toISOString().slice(0,10);
        const row = historyRows.get(date);
        const button = document.createElement('button');
        button.className = 'history-entry';
        button.textContent = 'Day ' + nextHistoryDay;
        const status = document.createElement('span');
        status.textContent = !row ? 'Not played' : row.status === 'playing' ? 'Continue' : row.score + ' / 100';
        button.append(status);
        button.onclick = () => startRound('daily', date);
        $('history-list').append(button);
    }
    $('older').hidden = nextHistoryDay < 0;
}

async function openHistory() {
    showScreen('history', $('history-template').content.cloneNode(true));
    $('older').onclick = addHistoryPage;
    const group = requestGroup;
    $('history-status').textContent = 'Loading history…';
    try {
        const history = await api('history');
        if (group !== requestGroup) return;
        historyRows = new Map(history.games.map(row => [row.day, row]));
        nextHistoryDay = daysSinceLaunch(localDay());
        $('history-status').textContent = '';
        addHistoryPage();
    } catch {
        if (group !== requestGroup) return;
        $('history-status').textContent = 'Couldn’t load your history.';
        const button = document.createElement('button');
        button.textContent = 'Try again';
        button.onclick = openHistory;
        $('history-list').append(button);
    }
}

function solve() {
    clearTimeout(timer);
    mode = 'solve';
    draft = '';
    message = '';
    render();
}

function watch() {
    mode = 'watch';
    draft = '';
    message = '';
    render();
    schedule();
    $('tiles').focus();
}

function type(key) {
    if (screen !== 'round' || !game || busy || retry) return;
    if (mode === 'watch' && key !== 'Backspace') solve();
    if (mode !== 'solve') return;
    if (key === 'Backspace') draft = draft.slice(0, -1);
    else if (/^[a-z]$/i.test(key) && draft.length < game.total - game.revealed) draft += key.toLowerCase();
    render();
}

function openDialog(title) {
    $('dialog-title').textContent = title;
    $('dialog-body').replaceChildren();
    clearTimeout(timer);
    $('dialog').showModal();
}

function showPhraseResponse(answer) {
    const choices = $('phrase-choices');
    choices.hidden = Boolean(answer);
    $('phrase-receipt').textContent = answer ? 'Your answer: ' + (answer === 'yes' ? 'Yes' : 'No') + '. Thanks for your feedback.' : '';
}

const openFeedback = setupFeedback({
    api,
    onOpen: () => clearTimeout(timer),
    onClose: savedPhrase => {
        if (savedPhrase && screen === 'finish') $('phrase-receipt').focus();
        schedule();
    },
    onPhraseSaved: answer => {
        game.heardBefore = answer;
        showPhraseResponse(answer);
    }
});

function renderFinish(lastMask) {
    showScreen('finish', $('finish-template').content.cloneNode(true));
    $('restart').hidden = kind !== 'practice';
    draw(game.mask, game.answer, lastMask);
    const number = (kind === 'practice' ? 'Practice #' : '#') + game.puzzleId;
    const minutes = Math.floor(game.elapsedSeconds / 60);
    const time = [minutes, game.elapsedSeconds % 60].map(n => String(n).padStart(2, '0')).join(':');
    $('puzzle-number').textContent = number;
    $('time').textContent = time;
    $('score').textContent = game.score + ' / 100';

    const squares = Array.from(game.mask, c => c === '_' ? '🟨' : /[a-z]/.test(c) ? '⬜' : c).join('');
    const text = ['Shooting Blanks · ' + number, squares, 'Time ' + time, 'Score ' + game.score + '/100'].join('\n');
    const status = $('result-status');
    $('share').onclick = () => shareResult(text, status);
    $('copy').onclick = () => copyResult(text, status);
    $('practice').onclick = () => startRound('practice', localDay(), true);
    $('history').onclick = openHistory;
    showPhraseResponse(game.heardBefore);
    $('phrase-choices').onclick = event => {
        const answer = event.target.closest('button')?.dataset.heard;
        if (answer) openFeedback({screen, puzzleDay: day, practice: kind === 'practice' ? practiceId : undefined}, answer);
    };
}

async function shareResult(text, status) {
    try {
        if (navigator.share && (!navigator.canShare || navigator.canShare({text}))) {
            await navigator.share({text});
            return;
        }
    } catch (error) {
        if (error.name === 'AbortError') return;
    }
    if (status.isConnected) await copyResult(text, status);
}

async function copyResult(text, status) {
    try {
        await navigator.clipboard.writeText(text);
        status.textContent = 'Result copied to clipboard.';
    } catch {
        if (!status.isConnected) return;
        openDialog('Copy result');
        const area = document.createElement('textarea');
        area.readOnly = true;
        area.rows = 6;
        area.setAttribute('aria-label', 'Result to copy');
        area.value = text;
        $('dialog-body').append(area);
        area.select();
    }
}

function submitGuess() {
    if (busy || retry || mode !== 'solve' || !game || draft.length !== game.total - game.revealed) return;
    if (kind === 'tutorial') {
        if (draft === lessonLetters()) {
            game.status = 'solved';
            game.answer = lesson;
            game.score = Math.round(100 * draft.length / game.total);
            mode = 'done';
            message = '';
        } else {
            draft = '';
            message = 'Try again. Read the missing letters from left to right.';
        }
        render();
        return;
    }
    let i = 0;
    const guess = game.mask.replaceAll('_', () => draft[i++]);
    return update('attempt', {version: game.version, guess});
}

$('controls').addEventListener('click', event => {
    const key = event.target.closest('button[data-key]')?.dataset.key;
    if (key === 'Enter') submitGuess();
    else if (key) type(key);
});
$('restart').onclick = () => startRound('practice', localDay(), true);
document.addEventListener('keydown', e => {
    if (screen !== 'round' || !game || $('dialog').open || $('feedback-dialog').open || e.altKey || e.ctrlKey || e.metaKey || busy || retry || mode === 'done') return;
    if (/^[a-z]$/i.test(e.key) || e.key === 'Backspace') {
        type(e.key);
        $('tiles').focus({preventScroll: true});
    }
    else if (e.key === 'Escape' && mode === 'solve' && kind !== 'tutorial') watch();
    else if (e.key === 'Enter' && (!e.target.closest('button,a') || e.target.closest('#keyboard'))) submitGuess();
    else return;
    e.preventDefault();
});

function home() {
    showScreen('landing', welcome);
    updatePlayAvailability();
    play.focus();
}
play.onclick = () => startRound('daily');
$('practice').onclick = () => startRound('practice');
$('tutorial').onclick = () => startRound('tutorial');
$('history').onclick = openHistory;
$('home').onclick = home;
$('reconnect').onclick = connect;
$('feedback-button').onclick = () => openFeedback({screen: screen === 'round' && kind === 'tutorial' ? 'tutorial' : screen});
$('close').onclick = () => $('dialog').close();
$('dialog').addEventListener('close', schedule);
document.addEventListener('visibilitychange', () => {
    updatePlayAvailability();
    schedule();
});
connect();
