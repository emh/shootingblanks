export class GameBoard extends HTMLElement {
    constructor(state) {
        const { game } = state;
        super();

        const shadowRoot = this.attachShadow({ mode: 'open' });
        const style = document.createElement('style');

        style.textContent = `
            :host {
                display: flex;
                flex-wrap: wrap;
                gap: 20px;
                user-select: none;
                max-width: 450px;
                justify-content: center;
            }

            .word {
                display: flex;
                gap: 5px;
                flex-wrap: nowrap;
            }

            .cell {
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: var(--letter-border-radius);
                height: 32px;
                width: 32px;
                font-size: 24px;
                text-transform: uppercase;
                box-sizing: border-box;
                cursor: pointer;
                box-shadow: var(--letter-box-shadow);
                background-color: var(--letter-background-color);
                border: solid 1px var(--border-color);
                color: var(--letter-color);
            }

            .active {
                border: solid 2px var(--letter-border-color-active);
                background-color: var(--letter-background-color-active);
            }

            .revealed {
                background-color: var(--letter-background-color-start);
                border-color: var(--letter-border-color-start);
                color: var(--letter-color-start);
                box-shadow: var(--letter-box-shadow-start);
            }
        `;

        shadowRoot.append(style);

        let word = document.createElement('div');
        word.className = 'word';

        let board = '';

        game.idiom.split('').forEach((l, i) => {
            if (l === ' ') {
                shadowRoot.append(word);

                word = document.createElement('div');
                word.className = 'word';

                board += ' ';
            } else {
                const cell = document.createElement('div');
                cell.classList.add('cell');
                if (game.position === i) cell.classList.add('active');
                if (game.revealed.includes(i)) cell.classList.add('revealed');

                const cellLetter = game.revealed.includes(i) ? l : game.guess[i];

                board += cellLetter;

                cell.textContent = cellLetter;

                word.append(cell);
            }
        });

        shadowRoot.append(word);
    }
}

customElements.define('game-board', GameBoard);
