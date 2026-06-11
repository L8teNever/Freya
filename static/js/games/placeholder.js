class PlaceholderGame {
    constructor(containerId, appInstance) {
        this.container = document.getElementById(containerId);
        this.app = appInstance;
    }

    render(gameState, currentUserSessionId) {
        const gameName = this.getGameName(gameState.game_type);
        const icon = this.getGameIcon(gameState.game_type);
        
        let actionsHtml = "";
        const isPlayer = gameState.players.some(p => p.session_id === currentUserSessionId);
        
        if (isPlayer) {
            actionsHtml = `
                <button class="btn btn-primary" onclick="app.sendGameAction({type: 'restart'})">
                    Simulator neu starten
                </button>
            `;
        }

        // Render visual simulation of gameplay
        this.container.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 20px; padding: 24px; max-width: 420px; width: 100%;">
                <span class="material-symbols-rounded" style="font-size: 72px; color: var(--primary); background: var(--primary-container); padding: 24px; border-radius: 28px; box-shadow: 0 8px 16px rgba(0,0,0,0.1);">
                    ${icon}
                </span>
                
                <div>
                    <h3 style="font-size: 22px; font-weight: 700; margin-bottom: 4px;">${gameName}</h3>
                    <p style="font-size: 13px; color: var(--on-surface-variant);">Entwicklungs-Vorschau</p>
                </div>

                <div style="background: var(--surface); padding: 18px; border-radius: 20px; width: 100%; border: 1px solid var(--outline-variant); display: flex; flex-direction: column; gap: 8px;">
                    <span style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--primary); letter-spacing: 0.5px;">Herausforderung Bestanden</span>
                    <p style="font-size: 13px; color: var(--on-surface-variant); line-height: 1.5;">
                        Du hast erfolgreich eine Spiel-Session gestartet! Sobald die Engine für <strong>${gameName}</strong> fertiggestellt ist, kannst du hier in Echtzeit spielen.
                    </p>
                </div>

                <div style="font-size: 14px; font-weight: 600; color: var(--on-surface); display: flex; align-items: center; gap: 8px;">
                    <span class="material-symbols-rounded" style="color: green;">check_circle</span>
                    Session: ${gameState.players.map(p => p.nickname).join(" vs. ")}
                </div>

                <div style="margin-top: 10px;">
                    ${actionsHtml}
                </div>
            </div>
        `;
    }

    getGameIcon(gameType) {
        const icons = {
            "connectfour": "filter_hdr",
            "battleship": "directions_boat",
            "chess": "explore",
            "checkers": "blur_on",
            "backgammon": "casino",
            "snake": "gesture",
            "pong": "sports_tennis",
            "memory": "style",
            "wordsearch": "search",
            "yahtzee": "filter_5",
            "sudoku": "grid_on",
            "uno": "layers",
            "ludo": "table_rows",
            "tetris": "dashboard_customize",
            "minesweeper": "brightness_high",
            "tictactoe3d": "view_in_ar",
            "hangman": "face",
            "trivia": "quiz",
            "carddraw": "content_paste_search"
        };
        return icons[gameType] || "casino";
    }

    getGameName(gameType) {
        const names = {
            "connectfour": "Vier gewinnt",
            "battleship": "Schiffe versenken",
            "chess": "Schach",
            "checkers": "Dame",
            "backgammon": "Backgammon",
            "snake": "Snake Versus",
            "pong": "Retro Pong",
            "memory": "Memory",
            "wordsearch": "Wortsuche",
            "yahtzee": "Kniffel",
            "sudoku": "Sudoku Coop",
            "uno": "Duo (UNO)",
            "ludo": "Ludo",
            "tetris": "Tetris Versus",
            "minesweeper": "Minesweeper Coop",
            "tictactoe3d": "Tic-Tac-Toe 3D",
            "hangman": "Galgenmännchen",
            "trivia": "Quiz Arena",
            "carddraw": "Karten ziehen"
        };
        return names[gameType] || gameType;
    }
}

window.PlaceholderGame = PlaceholderGame;
