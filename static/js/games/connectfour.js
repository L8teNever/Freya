/**
 * Vier gewinnt (Connect Four) Game Controller
 */
class ConnectFourController {
    constructor(app, container) {
        this.app = app;
        this.container = container;
        this.type = 'connectfour';
    }

    render(state) {
        this.container.innerHTML = '';
        const cols = state.cols, rows = state.rows;

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:18px; width:100%;';

        const myRole = state.players.find(p => p.session_id === this.app.sessionId)?.role || 'spectator';
        const isMyTurn = state.current_turn === this.app.sessionId;

        // Turn banner
        const banner = document.createElement('div');
        banner.style.cssText = 'font-size:16px; font-weight:600; padding:8px 16px; border-radius:100px; background:var(--surface); border:1px solid var(--outline-variant);';
        const colorName = r => (r === 'R' ? 'Rot' : 'Gelb');
        if (state.status === 'playing') {
            if (isMyTurn) { banner.textContent = `Du bist am Zug (${colorName(myRole)})`; banner.style.color = 'var(--primary)'; banner.style.borderColor = 'var(--primary)'; }
            else { banner.textContent = `${state.current_turn_name || 'Gegner'} ist am Zug...`; banner.style.color = 'var(--on-surface-variant)'; }
        }
        wrapper.appendChild(banner);

        const canPlay = state.status === 'playing' && isMyTurn && myRole !== 'spectator';

        // Column drop buttons
        const dropRow = document.createElement('div');
        dropRow.style.cssText = `display:grid; grid-template-columns:repeat(${cols}, 1fr); gap:6px; width:100%; max-width:380px;`;
        for (let c = 0; c < cols; c++) {
            const colFull = state.board[c] !== null; // top cell of column filled
            const btn = document.createElement('button');
            btn.style.cssText = `padding:4px; border:none; background:transparent; color:var(--primary); cursor:${canPlay && !colFull ? 'pointer' : 'default'};`;
            btn.innerHTML = '<span class="material-symbols-rounded">arrow_drop_down</span>';
            btn.style.opacity = (canPlay && !colFull) ? '1' : '0.25';
            if (canPlay && !colFull) btn.addEventListener('click', () => this.app.sendGameAction({ type: 'drop', column: c }));
            dropRow.appendChild(btn);
        }
        wrapper.appendChild(dropRow);

        // Board
        const board = document.createElement('div');
        board.style.cssText = `display:grid; grid-template-columns:repeat(${cols}, 1fr); gap:6px; width:100%; max-width:380px; background:var(--primary); padding:8px; border-radius:14px;`;
        state.board.forEach((cell, idx) => {
            const slot = document.createElement('div');
            const isWin = state.winning_line && state.winning_line.includes(idx);
            let color = 'var(--surface)';
            if (cell === 'R') color = '#E53935';
            else if (cell === 'Y') color = '#FDD835';
            slot.style.cssText = `aspect-ratio:1; border-radius:50%; background:${color}; ${isWin ? 'box-shadow:0 0 0 3px #4CAF50; transform:scale(1.05);' : ''}`;
            board.appendChild(slot);
        });
        wrapper.appendChild(board);
        this.container.appendChild(wrapper);

        // Finished overlay
        if (state.status === 'finished') {
            const overlay = document.createElement('div');
            overlay.className = 'game-info-overlay';
            const title = document.createElement('div'); title.className = 'game-info-overlay-title';
            const sub = document.createElement('div'); sub.className = 'game-info-overlay-subtitle';
            if (state.winner === 'draw') { title.textContent = 'Unentschieden!'; sub.textContent = 'Brett voll.'; }
            else if (state.winner === this.app.sessionId) { title.textContent = 'Sieg!'; title.style.color = '#4CAF50'; sub.textContent = '4 in einer Reihe!'; this.app.sound('win'); }
            else { title.textContent = 'Verloren'; title.style.color = 'var(--error)'; sub.textContent = `${state.winner_name || 'Gegner'} hat gewonnen.`; this.app.sound('lose'); }
            overlay.appendChild(title); overlay.appendChild(sub);

            const restart = document.createElement('button');
            restart.className = 'btn btn-primary';
            restart.innerHTML = '<span class="material-symbols-rounded">replay</span> Nochmal spielen';
            restart.addEventListener('click', () => this.app.sendGameAction({ type: 'restart' }));
            if (myRole === 'spectator') { restart.disabled = true; restart.style.opacity = '0.5'; }
            overlay.appendChild(restart);
            this.container.appendChild(overlay);
        }
    }
}

window.ConnectFourController = ConnectFourController;
