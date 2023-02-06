export class GameBoard extends HTMLElement {
    constructor(state) {
        super();

        const shadowRoot = this.attachShadow({ mode: 'open' });
        const style = document.createElement('style');

        style.textContent = `
            :host { 
                display: flex;
                flex-wrap: wrap;
                gap: 55px;
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
                height: 50px;
                width: 50px;
                font-size: 40px;
                text-transform: uppercase;
                box-sizing: border-box;
                cursor: pointer;
                box-shadow: var(--letter-box-shadow);
            }

            .cell {
                background-color: var(--letter-background-color);
                border: solid 1px var(--border-color);
                color: var(--letter-color);
            }
        `;

        shadowRoot.append(style);

        let word = document.createElement('div');
        word.className = 'word';

        state.idiom.split('').forEach((l, i) => {
            if (l === ' ') {
                shadowRoot.append(word);    

                word = document.createElement('div');
                word.className = 'word';
            } else {
                const cell = document.createElement('div');
                cell.classList.add('cell');

                cell.textContent = state.revealed.includes(i) ? l : ' ';

                word.append(cell);
            }
        });

        shadowRoot.append(word);
    }
}

customElements.define('game-board', GameBoard);
