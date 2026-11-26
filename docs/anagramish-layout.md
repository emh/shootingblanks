# Anagramish layout notes

Walkthrough of the live site on November 26, 2026. The game switches screens at the homepage URL. The rules guide has its own URL. [Live game](https://anagramish.com/) · [Rules guide](https://anagramish.com/how-to-play.html)

## Header and keyboard

At a 390 px viewport, Home starts 12 px from the left edge. In practice, Reset follows at 56 px. Both are 38 px square, with a 6 px gap. The lowercase wordmark stays centered. Feedback is 75 px wide and 10 px from the right edge, including on the landing screen.

During play, the board is near the top of a narrow centered column. The keyboard occupies a separate footer. Enter leads the bottom row and Delete ends it. The white space between the board and keyboard grows on taller screens.

## Screens

| Screen | Layout observed |
| --- | --- |
| Landing | A one-line description sits above a two-column menu. Play and Tutorial share the first row, Practice and History the second. The mode setting, rules, example boards, and guide link follow. |
| Daily | Difficulty stars above the floating letter tiles. Home on the left, Feedback on the right, keyboard below. |
| Practice | Same play layout, with Reset immediately after Home. |
| Tutorial | Lesson progress and instructions above a smaller board. The current task, hint, and skip controls sit below it. The keyboard uses the usual footer. |
| Tutorial finish | The completed board stays visible. The keyboard disappears. A blue daily-play button leads the action row, followed by neutral replay and home buttons. |
| Daily result | Completion and save status, finished board, puzzle number, and stats. Share, Copy, Practice, and History precede a short difficulty rating and comment action. |
| Practice result | Finished board and stats, then Practice and History. A practice-specific rating appears below. |
| History | A heading followed by a newest-first list. Played rows include results, and missed days use a short status. |
| Past puzzle | Date, board, puzzle details, and a continuation action for an unfinished game. Older, History, and Newer sit together beneath it. |
| Feedback | A dedicated panel with a return action and comment field replaces the game content. Ratings are available in puzzle contexts. |
| Rules guide | A standalone reading page with a wordmark, play link, rules, and a worked example. |

## Shooting Blanks

Use the same left-to-right order for Home and Retry. Reserve a matching right-hand column for the future Feedback button. The longer Shooting Blanks wordmark scales within the middle column on small phones. Place the tutorial-finish actions directly below the result, with a 10 px gap. At a 440 px viewport, daily play and replay share the first row and Home centers below them. Hide the keyboard footer and its divider when the lesson ends.

## Code structure

Both frontends use native HTML templates and a single stylesheet. Anagramish keeps its browser files at the repository root. Shooting Blanks serves the equivalent files from `public/`.

| Area | Pattern used in both games |
| --- | --- |
| App shell | `#app` contains the persistent header, one scrollable `main`, and a keyboard footer. The initial welcome section is readable before JavaScript runs. |
| Navigation | The active screen occupies `main`. History and keyboard markup live in named HTML templates. Shooting Blanks uses a single round template for daily, practice, and tutorial because all three use the same phrase layout. |
| Controls | `.buttons.welcome-actions` is the menu grid. `.tutorial-actions` wraps below the result. Buttons get their face, text, and shadow colors from `--button-bg`, `--button-ink`, and `--button-depth`. |
| Keyboard | `#keyboard` contains three `.row` elements. Keys use `.key` and `data-key`, including Enter and Backspace. A single click handler dispatches the selected key. |
| Game board | Both use `.board` and `.cell`. Anagramish lays cells out in fixed-length ladder rows. Shooting Blanks groups them by word so a phrase wraps at word boundaries and each cell can reveal independently. |
