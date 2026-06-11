/**
 * Wortkette Game Controller
 */
class WortketteController {
    constructor(app, container) {
        this.app = app;
        this.container = container;
        this.type = 'wortkette';

        this.currentStatus = "";
        this.currentTurnCount = -1;
        this.timerInterval = null;
        this.localWord = "";
    }

    render(state) {
        const turnChanged = state.turn_count !== this.currentTurnCount;

        if (state.status !== this.currentStatus || turnChanged) {
            this.clearIntervals();
            this.currentStatus = state.status;
            this.currentTurnCount = state.turn_count;
            this.localWord = "";

            this.container.innerHTML = '';
            if (state.status === "setup") {
                this.renderSetup(state);
            } else if (state.status === "playing") {
                this.renderPlaying(state);
            } else if (state.status === "finished") {
                this.renderFinished(state);
            }
        } else {
            if (state.status === "playing") {
                this.updateTimer(state);
                this.updateError(state);
            }
        }
    }

    clearIntervals() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    isParticipant(state) {
        return state.players.some(p => p.session_id === this.app.sessionId);
    }

    // --- SETUP PHASE ---
    renderSetup(state) {
        const isCreator = (state.creator_id === this.app.sessionId);
        const amIn = this.isParticipant(state);

        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.gap = '20px';
        wrapper.style.width = '100%';
        wrapper.style.maxWidth = '500px';
        wrapper.style.padding = '12px';

        const header = document.createElement('div');
        header.style.textAlign = 'center';
        header.innerHTML = `
            <h3 style="font-size: 22px; font-weight: 700; color: var(--primary);">Wortkette</h3>
            <p style="font-size: 13px; color: var(--on-surface-variant);">
                ${isCreator ? 'Konfiguriere das Spiel und warte auf weitere Mitspieler.' : 'Warte auf den Host, um das Spiel zu starten...'}
            </p>
        `;
        wrapper.appendChild(header);

        // Players in lobby
        const lobbyCard = document.createElement('div');
        lobbyCard.className = 'card';
        let playersHtml = '';
        state.players.forEach(p => {
            playersHtml += `
                <div style="display:flex; align-items:center; gap:8px; padding:8px 12px; border-radius:12px; background-color: var(--surface-variant);">
                    <span class="material-symbols-rounded" style="font-size:18px; color:var(--primary);">person</span>
                    <span style="font-weight:600;">${p.nickname} ${p.session_id === this.app.sessionId ? '(Du)' : ''}</span>
                    ${p.session_id === state.creator_id ? '<span style="font-size:11px; color:var(--on-surface-variant);">Host</span>' : ''}
                </div>
            `;
        });
        lobbyCard.innerHTML = `
            <div class="card-header">
                <span class="material-symbols-rounded card-icon">groups</span>
                <h3>Mitspieler (${state.players.length})</h3>
            </div>
            <div style="display:flex; flex-direction:column; gap:8px;">${playersHtml}</div>
        `;
        wrapper.appendChild(lobbyCard);

        // Join button for non-participants (spectators of the lobby)
        if (!amIn) {
            const joinBtn = document.createElement('button');
            joinBtn.className = 'btn btn-primary btn-large';
            joinBtn.style.width = '100%';
            joinBtn.innerHTML = '<span class="material-symbols-rounded">person_add</span> Mitspielen';
            joinBtn.addEventListener('click', () => {
                this.app.sendGameJoin(state.game_session_id);
            });
            wrapper.appendChild(joinBtn);
        }

        // Config (creator only)
        const turnCard = document.createElement('div');
        turnCard.className = 'card';
        turnCard.innerHTML = `
            <div class="card-header">
                <span class="material-symbols-rounded card-icon">timer</span>
                <h3>Zeit pro Zug</h3>
            </div>
            <select id="wk-turn-select" ${isCreator ? '' : 'disabled'} style="width:100%; padding: 12px; border-radius: 12px; border: 1px solid var(--outline); background: var(--surface); color: var(--on-background); outline: none;">
                <option value="10">10 Sekunden</option>
                <option value="15">15 Sekunden</option>
                <option value="20">20 Sekunden</option>
                <option value="30">30 Sekunden</option>
                <option value="45">45 Sekunden</option>
            </select>
            <div class="card-header" style="margin-top:8px;">
                <span class="material-symbols-rounded card-icon">text_fields</span>
                <h3>Mindestlänge</h3>
            </div>
            <select id="wk-minlen-select" ${isCreator ? '' : 'disabled'} style="width:100%; padding: 12px; border-radius: 12px; border: 1px solid var(--outline); background: var(--surface); color: var(--on-background); outline: none;">
                <option value="2">2 Buchstaben</option>
                <option value="3">3 Buchstaben</option>
                <option value="4">4 Buchstaben</option>
                <option value="5">5 Buchstaben</option>
            </select>
        `;
        wrapper.appendChild(turnCard);

        const turnSelect = turnCard.querySelector('#wk-turn-select');
        const minlenSelect = turnCard.querySelector('#wk-minlen-select');
        turnSelect.value = state.turn_seconds.toString();
        minlenSelect.value = state.min_length.toString();

        if (isCreator) {
            const pushConfig = () => {
                this.app.sendGameAction({
                    type: 'configure',
                    turn_seconds: parseInt(turnSelect.value),
                    min_length: parseInt(minlenSelect.value)
                });
            };
            turnSelect.addEventListener('change', pushConfig);
            minlenSelect.addEventListener('change', pushConfig);
        }

        // Start button
        if (isCreator) {
            const startBtn = document.createElement('button');
            startBtn.className = 'btn btn-primary btn-large';
            startBtn.style.width = '100%';
            const canStart = state.players.filter(p => p.is_active).length >= 2;
            startBtn.disabled = !canStart;
            if (!canStart) startBtn.style.opacity = '0.5';
            startBtn.innerHTML = '<span class="material-symbols-rounded">play_arrow</span> Spiel starten';
            startBtn.addEventListener('click', () => {
                this.app.sendGameAction({ type: "start_game" });
            });
            wrapper.appendChild(startBtn);
            if (!canStart) {
                const hint = document.createElement('p');
                hint.style.cssText = 'text-align:center; font-size:13px; color:var(--on-surface-variant);';
                hint.textContent = 'Mindestens 2 Spieler benötigt.';
                wrapper.appendChild(hint);
            }
        } else {
            const loader = document.createElement('div');
            loader.style.textAlign = 'center';
            loader.style.padding = '12px';
            loader.innerHTML = `
                <div style="font-size: 14px; font-weight: 500; color: var(--on-surface-variant); display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <span class="material-symbols-rounded" style="animation: spin 2s infinite linear;">autorenew</span>
                    Warte auf den Start...
                </div>
            `;
            wrapper.appendChild(loader);
        }

        this.container.appendChild(wrapper);
    }

    // --- GAMEPLAY PHASE ---
    renderPlaying(state) {
        const me = state.players.find(p => p.session_id === this.app.sessionId);
        const amIn = !!me;
        const amEliminated = me ? me.eliminated : false;
        const isMyTurn = state.current_turn === this.app.sessionId;

        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.gap = '18px';
        wrapper.style.width = '100%';
        wrapper.style.maxWidth = '520px';
        wrapper.style.padding = '12px';

        // Status row: required letter + timer
        const statusRow = document.createElement('div');
        statusRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; background-color: var(--surface); padding:14px 20px; border-radius:20px; border:1px solid var(--outline-variant);';
        statusRow.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px;">
                <span style="font-size:13px; font-weight:bold; text-transform:uppercase; color:var(--on-surface-variant);">Buchstabe:</span>
                <span style="font-size:40px; font-weight:900; color:var(--primary);">${state.required_letter}</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <span class="material-symbols-rounded" style="color:var(--primary);">timer</span>
                <span id="wk-timer" style="font-size:24px; font-weight:700; font-family:monospace;">${state.time_left}</span>
            </div>
        `;
        wrapper.appendChild(statusRow);

        // Turn indicator
        const turnBanner = document.createElement('div');
        turnBanner.style.cssText = 'text-align:center; font-size:16px; font-weight:600; padding:10px 16px; border-radius:100px; background-color:var(--surface); border:1px solid var(--outline-variant);';
        if (isMyTurn) {
            turnBanner.textContent = 'Du bist am Zug!';
            turnBanner.style.color = 'var(--primary)';
            turnBanner.style.borderColor = 'var(--primary)';
        } else {
            turnBanner.textContent = `${state.current_turn_name || '...'} ist am Zug...`;
            turnBanner.style.color = 'var(--on-surface-variant)';
        }
        wrapper.appendChild(turnBanner);

        // Players strip (alive / out)
        const playersStrip = document.createElement('div');
        playersStrip.style.cssText = 'display:flex; flex-wrap:wrap; gap:8px; justify-content:center;';
        state.players.forEach(p => {
            const chip = document.createElement('span');
            const isTurn = p.session_id === state.current_turn;
            chip.style.cssText = `font-size:13px; font-weight:600; padding:5px 12px; border-radius:100px; border:1px solid var(--outline-variant);`;
            if (p.eliminated) {
                chip.style.opacity = '0.45';
                chip.style.textDecoration = 'line-through';
                chip.style.color = 'var(--error)';
                chip.textContent = p.nickname;
            } else if (isTurn) {
                chip.style.backgroundColor = 'var(--primary-container)';
                chip.style.color = 'var(--on-primary-container)';
                chip.style.borderColor = 'var(--primary)';
                chip.textContent = '▶ ' + p.nickname;
            } else {
                chip.style.color = 'var(--on-surface)';
                chip.textContent = p.nickname;
            }
            playersStrip.appendChild(chip);
        });
        wrapper.appendChild(playersStrip);

        // Word chain history
        const chainCard = document.createElement('div');
        chainCard.className = 'card';
        chainCard.style.maxHeight = '180px';
        chainCard.style.overflowY = 'auto';
        let chainHtml = '';
        if (state.chain.length === 0) {
            chainHtml = '<p style="font-size:13px; color:var(--on-surface-variant); text-align:center;">Noch keine Wörter. Mach den Anfang!</p>';
        } else {
            state.chain.slice().reverse().forEach(item => {
                chainHtml += `
                    <div style="display:flex; justify-content:space-between; align-items:baseline; padding:6px 4px; border-bottom:1px solid var(--outline-variant);">
                        <span style="font-weight:700; font-size:15px;">${item.word}</span>
                        <span style="font-size:11px; color:var(--on-surface-variant);">${item.nickname}</span>
                    </div>
                `;
            });
        }
        chainCard.innerHTML = `
            <div class="card-header">
                <span class="material-symbols-rounded card-icon">link</span>
                <h3>Wortkette (${state.chain.length})</h3>
            </div>
            <div>${chainHtml}</div>
        `;
        wrapper.appendChild(chainCard);

        // Input area (only for the current player)
        if (amIn && !amEliminated && isMyTurn) {
            const inputWrap = document.createElement('div');
            inputWrap.style.cssText = 'display:flex; flex-direction:column; gap:10px;';

            const field = document.createElement('div');
            field.className = 'text-field';
            field.innerHTML = `
                <input id="wk-word-input" type="text" autocomplete="off" placeholder="Wort mit ${state.required_letter}..." style="font-size:16px; padding:14px;">
                <label for="wk-word-input">Dein Wort</label>
            `;
            inputWrap.appendChild(field);

            const errEl = document.createElement('div');
            errEl.id = 'wk-error';
            errEl.style.cssText = 'min-height:18px; font-size:13px; font-weight:600; color:var(--error); text-align:center;';
            inputWrap.appendChild(errEl);

            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'display:flex; gap:10px;';

            const submitBtn = document.createElement('button');
            submitBtn.className = 'btn btn-primary';
            submitBtn.style.flexGrow = '1';
            submitBtn.innerHTML = '<span class="material-symbols-rounded">send</span> Absenden';

            const input = field.querySelector('input');
            input.addEventListener('input', (e) => { this.localWord = e.target.value; });
            const doSubmit = () => {
                const word = (this.localWord || '').trim();
                if (!word) return;
                this.app.sendGameAction({ type: 'submit_word', word: word });
                this.localWord = '';
                input.value = '';
            };
            submitBtn.addEventListener('click', doSubmit);
            input.addEventListener('keypress', (e) => { if (e.key === 'Enter') doSubmit(); });

            const giveUpBtn = document.createElement('button');
            giveUpBtn.className = 'btn btn-tonal';
            giveUpBtn.style.color = 'var(--error)';
            giveUpBtn.innerHTML = '<span class="material-symbols-rounded">flag</span> Aufgeben';
            giveUpBtn.addEventListener('click', () => {
                this.app.sendGameAction({ type: 'give_up' });
            });

            btnRow.appendChild(submitBtn);
            btnRow.appendChild(giveUpBtn);
            inputWrap.appendChild(btnRow);
            wrapper.appendChild(inputWrap);

            setTimeout(() => input.focus(), 50);
        } else {
            // Spectator / eliminated / waiting note
            const note = document.createElement('div');
            note.style.cssText = 'text-align:center; font-size:14px; font-weight:500; color:var(--on-surface-variant); padding:8px;';
            if (amEliminated) {
                note.innerHTML = '<span class="material-symbols-rounded" style="vertical-align:middle; color:var(--error);">visibility</span> Du bist raus – du kannst weiter zuschauen.';
            } else if (!amIn) {
                note.innerHTML = '<span class="material-symbols-rounded" style="vertical-align:middle;">visibility</span> Du schaust zu.';
            } else {
                note.textContent = 'Warte, bis du an der Reihe bist...';
            }
            wrapper.appendChild(note);
        }

        this.container.appendChild(wrapper);
        this.updateError(state);
        this.startTimerLoop(state);
    }

    startTimerLoop(state) {
        this.clearIntervals();
        this.timerInterval = setInterval(() => {
            const el = document.getElementById('wk-timer');
            if (!el) { this.clearIntervals(); return; }
            let val = parseInt(el.textContent) || 0;
            val = Math.max(0, val - 1);
            el.textContent = val;
            if (val <= 5) el.style.color = 'var(--error)';
            if (val <= 0) {
                this.clearIntervals();
                // Any connected client reports the timeout; server validates end_time
                this.app.sendGameAction({ type: 'timeout', turn_count: state.turn_count });
            }
        }, 1000);
    }

    updateTimer(state) {
        const el = document.getElementById('wk-timer');
        if (el) el.textContent = state.time_left;
    }

    updateError(state) {
        const errEl = document.getElementById('wk-error');
        if (!errEl) return;
        if (state.turn_error && state.turn_error.session_id === this.app.sessionId
            && state.current_turn === this.app.sessionId) {
            errEl.textContent = state.turn_error.reason;
        } else {
            errEl.textContent = '';
        }
    }

    // --- FINISHED PHASE ---
    renderFinished(state) {
        const isCreator = (state.creator_id === this.app.sessionId);
        const iWon = state.winner === this.app.sessionId;

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex; flex-direction:column; gap:20px; width:100%; max-width:520px; padding:12px; align-items:center;';

        const overlay = document.createElement('div');
        overlay.className = 'game-info-overlay';
        const title = document.createElement('div');
        title.className = 'game-info-overlay-title';
        const subtitle = document.createElement('div');
        subtitle.className = 'game-info-overlay-subtitle';

        if (state.winner === 'draw' || !state.winner) {
            title.textContent = 'Vorbei!';
            subtitle.textContent = 'Kein Sieger.';
        } else if (iWon) {
            title.textContent = 'Gewonnen!';
            title.style.color = '#4CAF50';
            subtitle.textContent = 'Du bist der letzte Übriggebliebene!';
        } else {
            title.textContent = 'Vorbei!';
            subtitle.textContent = `${state.winner_name} hat gewonnen.`;
        }
        overlay.appendChild(title);
        overlay.appendChild(subtitle);
        wrapper.appendChild(overlay);

        // Final chain summary
        const chainCard = document.createElement('div');
        chainCard.className = 'card';
        chainCard.style.width = '100%';
        chainCard.style.maxHeight = '240px';
        chainCard.style.overflowY = 'auto';
        let chainHtml = '';
        state.chain.forEach((item, idx) => {
            chainHtml += `
                <div style="display:flex; justify-content:space-between; align-items:baseline; padding:6px 4px; border-bottom:1px solid var(--outline-variant);">
                    <span><span style="color:var(--on-surface-variant); font-size:12px;">${idx + 1}.</span> <strong style="font-size:15px;">${item.word}</strong></span>
                    <span style="font-size:11px; color:var(--on-surface-variant);">${item.nickname}</span>
                </div>
            `;
        });
        chainCard.innerHTML = `
            <div class="card-header">
                <span class="material-symbols-rounded card-icon">link</span>
                <h3>Die Kette (${state.chain.length} Wörter)</h3>
            </div>
            <div>${chainHtml || '<p style="font-size:13px; color:var(--on-surface-variant);">Keine Wörter.</p>'}</div>
        `;
        wrapper.appendChild(chainCard);

        if (isCreator) {
            const restartBtn = document.createElement('button');
            restartBtn.className = 'btn btn-primary';
            restartBtn.style.width = '100%';
            restartBtn.innerHTML = '<span class="material-symbols-rounded">replay</span> Neue Runde';
            restartBtn.addEventListener('click', () => {
                this.app.sendGameAction({ type: 'restart' });
            });
            wrapper.appendChild(restartBtn);
        } else {
            const waitingText = document.createElement('div');
            waitingText.style.cssText = 'text-align:center; padding:8px 0; font-size:14px; color:var(--on-surface-variant); font-weight:500;';
            waitingText.textContent = 'Warte auf den Host für eine neue Runde...';
            wrapper.appendChild(waitingText);
        }

        this.container.appendChild(wrapper);
    }
}

window.WortketteController = WortketteController;
