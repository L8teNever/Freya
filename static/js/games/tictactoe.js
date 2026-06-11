/**
 * TicTacToe Game Controller
 */
class TicTacToeController {
    constructor(app, container) {
        this.app = app;
        this.container = container;
        this.type = 'tictactoe';
    }

    render(state) {
        this.container.innerHTML = '';

        // Create main layout: wrapper containing turn indicator and the board
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.alignItems = 'center';
        wrapper.style.gap = '20px';
        wrapper.style.width = '100%';

        // Turn indicator banner
        const turnBanner = document.createElement('div');
        turnBanner.style.fontSize = '16px';
        turnBanner.style.fontWeight = '600';
        turnBanner.style.padding = '8px 16px';
        turnBanner.style.borderRadius = '100px';
        turnBanner.style.backgroundColor = 'var(--surface)';
        turnBanner.style.border = '1px solid var(--outline-variant)';
        
        const isMyTurn = state.current_turn === this.app.sessionId;
        const myRole = state.players.find(p => p.session_id === this.app.sessionId)?.role || 'spectator';
        
        if (state.status === 'playing') {
            if (isMyTurn) {
                turnBanner.textContent = `Du bist am Zug (${myRole})`;
                turnBanner.style.color = 'var(--primary)';
                turnBanner.style.borderColor = 'var(--primary)';
            } else {
                const turnName = state.current_turn_name || 'Gegner';
                turnBanner.textContent = `${turnName} ist am Zug...`;
                turnBanner.style.color = 'var(--on-surface-variant)';
            }
        }
        wrapper.appendChild(turnBanner);

        // Build Board grid
        const boardGrid = document.createElement('div');
        boardGrid.className = 'tictactoe-board';

        state.board.forEach((cell, idx) => {
            const cellDiv = document.createElement('div');
            cellDiv.className = 'tictactoe-cell';
            
            // Check if winning cell
            const isWinningCell = state.winning_line && state.winning_line.includes(idx);
            if (isWinningCell) {
                cellDiv.classList.add('winning');
            }

            if (cell) {
                cellDiv.classList.add('filled');
                const span = document.createElement('span');
                span.className = cell === 'X' ? 'symbol-x' : 'symbol-o';
                span.textContent = cell;
                cellDiv.appendChild(span);
            } else {
                // Empty cell: make clickable if playing and it's player's turn
                if (state.status === 'playing' && isMyTurn && myRole !== 'spectator') {
                    cellDiv.addEventListener('click', () => {
                        this.app.sendGameAction({ type: 'make_move', position: idx });
                    });
                } else {
                    cellDiv.style.cursor = 'default';
                }
            }
            
            boardGrid.appendChild(cellDiv);
        });

        wrapper.appendChild(boardGrid);
        this.container.appendChild(wrapper);

        // Game Finished Overlay
        if (state.status === 'finished') {
            const overlay = document.createElement('div');
            overlay.className = 'game-info-overlay';

            const title = document.createElement('div');
            title.className = 'game-info-overlay-title';
            
            const subtitle = document.createElement('div');
            subtitle.className = 'game-info-overlay-subtitle';

            if (state.winner === 'draw') {
                title.textContent = 'Unentschieden!';
                subtitle.textContent = 'Keiner hat gewonnen.';
            } else if (state.winner === this.app.sessionId) {
                title.textContent = 'Sieg!';
                subtitle.textContent = 'Gut gespielt, du hast gewonnen!';
                title.style.color = '#4CAF50'; // Green winner tint
            } else {
                const winnerName = state.winner_name || 'Gegner';
                title.textContent = 'Verloren';
                subtitle.textContent = `${winnerName} hat gewonnen.`;
                title.style.color = 'var(--error)';
            }

            const restartBtn = document.createElement('button');
            restartBtn.className = 'btn btn-primary';
            restartBtn.innerHTML = '<span class="material-symbols-rounded">replay</span> Nochmal spielen';
            restartBtn.addEventListener('click', () => {
                this.app.sendGameAction({ type: 'restart' });
            });

            overlay.appendChild(title);
            overlay.appendChild(subtitle);
            overlay.appendChild(restartBtn);
            
            // Add observer note if user is spectator
            if (myRole === 'spectator') {
                const specNote = document.createElement('p');
                specNote.style.fontSize = '12px';
                specNote.style.color = 'var(--on-surface-variant)';
                specNote.style.marginTop = '10px';
                specNote.textContent = '(Als Zuschauer kannst du das Spiel nicht neu starten)';
                overlay.appendChild(specNote);
                // Disable restart for observers
                restartBtn.disabled = true;
                restartBtn.style.opacity = '0.5';
            }

            this.container.appendChild(overlay);
        }
    }
}
