/**
 * Bingo Game Controller
 */
class BingoController {
    constructor(app, container) {
        this.app = app;
        this.container = container;
        this.type = 'bingo';
        this.currentStatus = "";
        this.autoInterval = null;
        this.lastDrawnCount = -1;
    }

    render(state) {
        if (state.status !== this.currentStatus) {
            this.currentStatus = state.status;
            this.stopAuto();
        }
        this.container.innerHTML = '';
        if (state.status === "setup") this.renderSetup(state);
        else if (state.status === "playing") this.renderPlaying(state);
        else if (state.status === "finished") this.renderFinished(state);
    }

    stopAuto() {
        if (this.autoInterval) { clearInterval(this.autoInterval); this.autoInterval = null; }
    }

    isParticipant(state) {
        return state.players.some(p => p.session_id === this.app.sessionId);
    }

    // --- SETUP ---
    renderSetup(state) {
        const isCreator = (state.creator_id === this.app.sessionId);
        const amIn = this.isParticipant(state);
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex; flex-direction:column; gap:18px; width:100%; max-width:480px; padding:12px;';
        wrapper.innerHTML = `<div style="text-align:center;"><h3 style="font-size:22px; font-weight:700; color:var(--primary);">Bingo</h3>
            <p style="font-size:13px; color:var(--on-surface-variant);">${isCreator ? 'Stelle das Spiel ein.' : 'Warte auf den Host...'}</p></div>`;

        const lobby = document.createElement('div');
        lobby.className = 'card';
        lobby.innerHTML = `<div class="card-header"><span class="material-symbols-rounded card-icon">groups</span><h3>Mitspieler (${state.players.length})</h3></div>
            <div style="display:flex; flex-direction:column; gap:8px;">${state.players.map(p => `<div style="padding:8px 12px; border-radius:12px; background:var(--surface-variant); font-weight:600;">${p.nickname} ${p.session_id === this.app.sessionId ? '(Du)' : ''}</div>`).join('')}</div>`;
        wrapper.appendChild(lobby);

        if (!amIn) {
            const joinBtn = document.createElement('button');
            joinBtn.className = 'btn btn-primary btn-large'; joinBtn.style.width = '100%';
            joinBtn.innerHTML = '<span class="material-symbols-rounded">person_add</span> Mitspielen';
            joinBtn.addEventListener('click', () => this.app.sendGameJoin(state.game_session_id));
            wrapper.appendChild(joinBtn);
        }

        const cfg = document.createElement('div');
        cfg.className = 'card';
        cfg.innerHTML = `
            <div class="card-header"><span class="material-symbols-rounded card-icon">tune</span><h3>Gewinn-Muster</h3></div>
            <select id="bg-mode" ${isCreator ? '' : 'disabled'} style="width:100%; padding:12px; border-radius:12px; border:1px solid var(--outline); background:var(--surface); color:var(--on-background);">
                <option value="line">Eine Reihe / Spalte / Diagonale</option>
                <option value="full">Volle Karte</option>
            </select>
            <div class="card-header" style="margin-top:8px;"><span class="material-symbols-rounded card-icon">bolt</span><h3>Ziehen</h3></div>
            <select id="bg-auto" ${isCreator ? '' : 'disabled'} style="width:100%; padding:12px; border-radius:12px; border:1px solid var(--outline); background:var(--surface); color:var(--on-background);">
                <option value="false">Host zieht manuell</option>
                <option value="true">Automatisch</option>
            </select>
        `;
        wrapper.appendChild(cfg);
        const modeSel = cfg.querySelector('#bg-mode'); const autoSel = cfg.querySelector('#bg-auto');
        modeSel.value = state.mode; autoSel.value = String(state.auto_draw);
        if (isCreator) {
            const push = () => this.app.sendGameAction({ type: 'configure', mode: modeSel.value, auto_draw: autoSel.value === 'true' });
            modeSel.addEventListener('change', push); autoSel.addEventListener('change', push);
            const startBtn = document.createElement('button');
            startBtn.className = 'btn btn-primary btn-large'; startBtn.style.width = '100%';
            startBtn.innerHTML = '<span class="material-symbols-rounded">play_arrow</span> Karten austeilen';
            startBtn.addEventListener('click', () => this.app.sendGameAction({ type: 'start_game' }));
            wrapper.appendChild(startBtn);
        }
        this.container.appendChild(wrapper);
    }

    // --- PLAYING ---
    renderPlaying(state) {
        const isCreator = (state.creator_id === this.app.sessionId);
        if (state.drawn_count !== this.lastDrawnCount && state.last_number) { this.app.sound('tick'); }
        this.lastDrawnCount = state.drawn_count;

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex; flex-direction:column; gap:16px; width:100%; max-width:520px; padding:12px;';

        // Caller display
        const caller = document.createElement('div');
        caller.style.cssText = 'display:flex; align-items:center; justify-content:space-between; background:var(--surface); padding:14px 20px; border-radius:20px; border:1px solid var(--outline-variant);';
        caller.innerHTML = `
            <div style="display:flex; flex-direction:column;">
                <span style="font-size:12px; text-transform:uppercase; color:var(--on-surface-variant); font-weight:bold;">Letzte Zahl</span>
                <span style="font-size:40px; font-weight:900; color:var(--primary);">${state.last_number || '—'}</span>
            </div>
            <div style="text-align:right; font-size:13px; color:var(--on-surface-variant);">${state.drawn_count} / 75 gezogen<br>Muster: ${state.mode === 'full' ? 'Volle Karte' : 'Reihe'}</div>
        `;
        wrapper.appendChild(caller);

        // Drawn numbers strip
        if (state.drawn.length) {
            const strip = document.createElement('div');
            strip.style.cssText = 'display:flex; flex-wrap:wrap; gap:4px; max-height:60px; overflow-y:auto; justify-content:center;';
            state.drawn.forEach(n => {
                const b = document.createElement('span');
                b.style.cssText = 'font-size:11px; font-weight:600; padding:2px 6px; border-radius:6px; background:var(--surface-variant);';
                b.textContent = n;
                strip.appendChild(b);
            });
            wrapper.appendChild(strip);
        }

        // Host draw button
        if (isCreator) {
            const drawBtn = document.createElement('button');
            drawBtn.className = 'btn btn-primary'; drawBtn.style.width = '100%';
            drawBtn.innerHTML = '<span class="material-symbols-rounded">casino</span> Nächste Zahl ziehen';
            drawBtn.addEventListener('click', () => this.app.sendGameAction({ type: 'draw' }));
            wrapper.appendChild(drawBtn);
        }
        // Auto-draw: host client ticks the draws
        this.stopAuto();
        if (isCreator && state.auto_draw) {
            this.autoInterval = setInterval(() => this.app.sendGameAction({ type: 'draw' }), (state.auto_interval || 5) * 1000);
        }

        // My card
        const myCard = state.cards[this.app.sessionId];
        const drawnSet = new Set(state.drawn);
        if (myCard) {
            const grid = document.createElement('div');
            grid.style.cssText = 'display:grid; grid-template-columns:repeat(5,1fr); gap:6px;';
            const header = ['B', 'I', 'N', 'G', 'O'];
            header.forEach(h => {
                const hd = document.createElement('div');
                hd.style.cssText = 'text-align:center; font-weight:900; color:var(--primary); font-size:18px;';
                hd.textContent = h;
                grid.appendChild(hd);
            });
            myCard.forEach((cell, idx) => {
                const c = document.createElement('div');
                const playable = !cell.free && drawnSet.has(cell.n);
                c.style.cssText = `aspect-ratio:1; display:flex; align-items:center; justify-content:center; border-radius:10px; font-weight:700; font-size:16px; border:1px solid var(--outline-variant); cursor:${playable ? 'pointer' : 'default'};`;
                if (cell.free) { c.style.background = 'var(--primary)'; c.style.color = '#fff'; c.innerHTML = '<span class="material-symbols-rounded">star</span>'; }
                else {
                    c.textContent = cell.n;
                    if (cell.marked) { c.style.background = 'var(--primary-container)'; c.style.color = 'var(--on-primary-container)'; c.style.borderColor = 'var(--primary)'; }
                    else if (playable) { c.style.background = 'var(--surface)'; }
                    else { c.style.opacity = '0.6'; }
                    if (playable) c.addEventListener('click', () => this.app.sendGameAction({ type: 'mark', index: idx }));
                }
                grid.appendChild(c);
            });
            wrapper.appendChild(grid);

            const bingoBtn = document.createElement('button');
            bingoBtn.className = 'btn btn-primary btn-large'; bingoBtn.style.width = '100%';
            bingoBtn.style.background = 'var(--error)'; bingoBtn.style.color = '#fff';
            bingoBtn.innerHTML = '🎉 BINGO!';
            bingoBtn.addEventListener('click', () => this.app.sendGameAction({ type: 'claim_bingo' }));
            wrapper.appendChild(bingoBtn);
        } else {
            const note = document.createElement('div');
            note.style.cssText = 'text-align:center; font-size:14px; color:var(--on-surface-variant); padding:8px;';
            note.innerHTML = '<span class="material-symbols-rounded" style="vertical-align:middle;">visibility</span> Du schaust zu.';
            wrapper.appendChild(note);
        }

        this.container.appendChild(wrapper);
    }

    // --- FINISHED ---
    renderFinished(state) {
        this.stopAuto();
        const isCreator = (state.creator_id === this.app.sessionId);
        const iWon = state.winner === this.app.sessionId;
        if (iWon) this.app.sound('win');

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex; flex-direction:column; gap:20px; width:100%; max-width:440px; padding:12px; align-items:center;';
        const overlay = document.createElement('div');
        overlay.className = 'game-info-overlay';
        overlay.innerHTML = `<div class="game-info-overlay-title" style="${iWon ? 'color:#4CAF50;' : ''}">${iWon ? '🎉 BINGO!' : 'Bingo!'}</div>
            <div class="game-info-overlay-subtitle">${iWon ? 'Du hast gewonnen!' : (state.winner_name || '') + ' hat Bingo!'}</div>`;
        wrapper.appendChild(overlay);
        if (isCreator) {
            const btn = document.createElement('button');
            btn.className = 'btn btn-primary'; btn.style.width = '100%';
            btn.innerHTML = '<span class="material-symbols-rounded">replay</span> Neue Runde';
            btn.addEventListener('click', () => this.app.sendGameAction({ type: 'restart' }));
            wrapper.appendChild(btn);
        }
        this.container.appendChild(wrapper);
    }
}

window.BingoController = BingoController;
