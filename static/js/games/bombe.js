/**
 * Bombe (Bomb Party) Game Controller
 */
class BombeController {
    constructor(app, container) {
        this.app = app;
        this.container = container;
        this.type = 'bombe';
        this.currentStatus = "";
        this.currentTurnCount = -1;
        this.timerInterval = null;
        this.localTerm = "";
        this.lastTimeLeft = 999;
    }

    render(state) {
        const turnChanged = state.turn_count !== this.currentTurnCount;
        if (state.status !== this.currentStatus || turnChanged) {
            this.clearIntervals();
            this.currentStatus = state.status;
            this.currentTurnCount = state.turn_count;
            this.localTerm = "";
            this.container.innerHTML = '';
            if (state.status === "setup") this.renderSetup(state);
            else if (state.status === "playing") this.renderPlaying(state);
            else if (state.status === "finished") this.renderFinished(state);
        } else if (state.status === "playing") {
            this.syncTimer(state);
            this.updateError(state);
        }
    }

    clearIntervals() {
        if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
    }

    isParticipant(state) {
        return state.players.some(p => p.session_id === this.app.sessionId);
    }

    // --- SETUP ---
    renderSetup(state) {
        const isCreator = (state.creator_id === this.app.sessionId);
        const amIn = this.isParticipant(state);

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex; flex-direction:column; gap:18px; width:100%; max-width:520px; padding:12px;';
        wrapper.innerHTML = `
            <div style="text-align:center;">
                <h3 style="font-size:22px; font-weight:700; color:var(--primary);">💣 Bombe</h3>
                <p style="font-size:13px; color:var(--on-surface-variant);">
                    ${isCreator ? 'Stelle das Spiel ein und warte auf Mitspieler.' : 'Warte auf den Host...'}
                </p>
            </div>
        `;

        // Players
        const lobby = document.createElement('div');
        lobby.className = 'card';
        let ph = '';
        state.players.forEach(p => {
            ph += `<div style="display:flex; align-items:center; gap:8px; padding:8px 12px; border-radius:12px; background:var(--surface-variant);">
                <span class="material-symbols-rounded" style="font-size:18px; color:var(--primary);">person</span>
                <span style="font-weight:600;">${p.nickname} ${p.session_id === this.app.sessionId ? '(Du)' : ''}</span>
                ${p.session_id === state.creator_id ? '<span style="font-size:11px; color:var(--on-surface-variant);">Host</span>' : ''}
            </div>`;
        });
        lobby.innerHTML = `<div class="card-header"><span class="material-symbols-rounded card-icon">groups</span><h3>Mitspieler (${state.players.length})</h3></div>
            <div style="display:flex; flex-direction:column; gap:8px;">${ph}</div>`;
        wrapper.appendChild(lobby);

        if (!amIn) {
            const joinBtn = document.createElement('button');
            joinBtn.className = 'btn btn-primary btn-large';
            joinBtn.style.width = '100%';
            joinBtn.innerHTML = '<span class="material-symbols-rounded">person_add</span> Mitspielen';
            joinBtn.addEventListener('click', () => this.app.sendGameJoin(state.game_session_id));
            wrapper.appendChild(joinBtn);
        }

        // Config
        const cfg = document.createElement('div');
        cfg.className = 'card';
        cfg.innerHTML = `
            <div class="card-header"><span class="material-symbols-rounded card-icon">timer</span><h3>Bomben-Zeit</h3></div>
            <select id="b-secs" ${isCreator ? '' : 'disabled'} style="width:100%; padding:12px; border-radius:12px; border:1px solid var(--outline); background:var(--surface); color:var(--on-background);">
                ${[15,20,30,45,60].map(v => `<option value="${v}">${v} Sekunden</option>`).join('')}
            </select>
            <div class="card-header" style="margin-top:8px;"><span class="material-symbols-rounded card-icon">bolt</span><h3>Bonus pro Begriff</h3></div>
            <select id="b-bonus" ${isCreator ? '' : 'disabled'} style="width:100%; padding:12px; border-radius:12px; border:1px solid var(--outline); background:var(--surface); color:var(--on-background);">
                ${[0,3,5,8].map(v => `<option value="${v}">+${v} Sek.</option>`).join('')}
            </select>
            <div class="card-header" style="margin-top:8px;"><span class="material-symbols-rounded card-icon">text_fields</span><h3>Mindestlänge (Fairness)</h3></div>
            <select id="b-minlen" ${isCreator ? '' : 'disabled'} style="width:100%; padding:12px; border-radius:12px; border:1px solid var(--outline); background:var(--surface); color:var(--on-background);">
                ${[2,3,4,5].map(v => `<option value="${v}">${v} Zeichen</option>`).join('')}
            </select>
        `;
        wrapper.appendChild(cfg);

        const secs = cfg.querySelector('#b-secs');
        const bonus = cfg.querySelector('#b-bonus');
        const minlen = cfg.querySelector('#b-minlen');
        secs.value = state.bomb_seconds; bonus.value = state.type_bonus; minlen.value = state.min_length;

        // Categories editor
        const catCard = document.createElement('div');
        catCard.className = 'card';
        catCard.innerHTML = `<div class="card-header"><span class="material-symbols-rounded card-icon">category</span><h3>Kategorien</h3></div>
            <div id="b-cats" style="display:flex; flex-wrap:wrap; gap:8px;"></div>`;
        const catsDiv = catCard.querySelector('#b-cats');
        state.categories.forEach(c => {
            const chip = document.createElement('span');
            chip.style.cssText = 'padding:6px 12px; border-radius:100px; background:var(--primary-container); color:var(--on-primary-container); font-size:13px; font-weight:500; display:flex; align-items:center; gap:6px;';
            chip.textContent = c;
            if (isCreator) {
                const x = document.createElement('span');
                x.className = 'material-symbols-rounded';
                x.style.cssText = 'font-size:16px; cursor:pointer;';
                x.textContent = 'close';
                x.addEventListener('click', () => {
                    const next = state.categories.filter(k => k !== c);
                    this.app.sendGameAction({ type: 'configure', categories: next });
                });
                chip.appendChild(x);
            }
            catsDiv.appendChild(chip);
        });
        if (isCreator) {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex; gap:8px; margin-top:12px;';
            row.innerHTML = `<input id="b-newcat" type="text" placeholder="Eigene Kategorie..." style="flex-grow:1; padding:10px 14px; border-radius:12px; border:1px solid var(--outline); background:transparent; color:var(--on-background);">
                <button class="btn btn-tonal" id="b-addcat" style="padding:0 16px;">Hinzufügen</button>`;
            catCard.appendChild(row);
            const inp = row.querySelector('#b-newcat');
            const add = () => { const v = inp.value.trim(); if (v) { this.app.sendGameAction({ type: 'add_category', category: v }); inp.value = ''; } };
            row.querySelector('#b-addcat').addEventListener('click', add);
            inp.addEventListener('keypress', e => { if (e.key === 'Enter') add(); });
        }
        wrapper.appendChild(catCard);

        if (isCreator) {
            const push = () => this.app.sendGameAction({ type: 'configure', bomb_seconds: parseInt(secs.value), type_bonus: parseInt(bonus.value), min_length: parseInt(minlen.value) });
            [secs, bonus, minlen].forEach(el => el.addEventListener('change', push));

            const startBtn = document.createElement('button');
            startBtn.className = 'btn btn-primary btn-large';
            startBtn.style.width = '100%';
            const canStart = state.players.filter(p => p.is_active).length >= 2;
            startBtn.disabled = !canStart;
            if (!canStart) startBtn.style.opacity = '0.5';
            startBtn.innerHTML = '<span class="material-symbols-rounded">play_arrow</span> Bombe scharf machen';
            startBtn.addEventListener('click', () => this.app.sendGameAction({ type: 'start_game' }));
            wrapper.appendChild(startBtn);
            if (!canStart) {
                const h = document.createElement('p');
                h.style.cssText = 'text-align:center; font-size:13px; color:var(--on-surface-variant);';
                h.textContent = 'Mindestens 2 Spieler benötigt.';
                wrapper.appendChild(h);
            }
        }
        this.container.appendChild(wrapper);
    }

    // --- PLAYING ---
    renderPlaying(state) {
        const me = state.players.find(p => p.session_id === this.app.sessionId);
        const amIn = !!me, amOut = me ? me.eliminated : false;
        const isMyTurn = state.current_turn === this.app.sessionId;
        if (isMyTurn) this.app.sound('turn');

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex; flex-direction:column; gap:16px; width:100%; max-width:520px; padding:12px;';

        // Bomb header
        const bombRow = document.createElement('div');
        bombRow.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:6px; background:var(--surface); padding:16px; border-radius:20px; border:1px solid var(--outline-variant);';
        bombRow.innerHTML = `
            <div style="font-size:13px; text-transform:uppercase; font-weight:bold; color:var(--on-surface-variant);">Kategorie</div>
            <div style="font-size:22px; font-weight:800; color:var(--primary); text-align:center;">${state.current_category}</div>
            <div style="display:flex; align-items:center; gap:8px; margin-top:4px;">
                <span style="font-size:34px;">💣</span>
                <span id="b-timer" style="font-size:30px; font-weight:900; font-family:monospace;">${state.time_left}</span>
            </div>
        `;
        wrapper.appendChild(bombRow);

        // Turn banner
        const banner = document.createElement('div');
        banner.style.cssText = 'text-align:center; font-size:16px; font-weight:600; padding:10px 16px; border-radius:100px; background:var(--surface); border:1px solid var(--outline-variant);';
        if (isMyTurn) { banner.textContent = '🔥 Du hältst die Bombe!'; banner.style.color = 'var(--primary)'; banner.style.borderColor = 'var(--primary)'; }
        else { banner.textContent = `${state.current_turn_name || '...'} ist dran...`; banner.style.color = 'var(--on-surface-variant)'; }
        wrapper.appendChild(banner);

        // Players strip
        const strip = document.createElement('div');
        strip.style.cssText = 'display:flex; flex-wrap:wrap; gap:8px; justify-content:center;';
        state.players.forEach(p => {
            const chip = document.createElement('span');
            const isTurn = p.session_id === state.current_turn;
            chip.style.cssText = 'font-size:13px; font-weight:600; padding:5px 12px; border-radius:100px; border:1px solid var(--outline-variant);';
            if (p.eliminated) { chip.style.opacity = '0.45'; chip.style.textDecoration = 'line-through'; chip.style.color = 'var(--error)'; chip.textContent = p.nickname; }
            else if (isTurn) { chip.style.background = 'var(--primary-container)'; chip.style.color = 'var(--on-primary-container)'; chip.style.borderColor = 'var(--primary)'; chip.textContent = '💣 ' + p.nickname; }
            else { chip.textContent = p.nickname; }
            strip.appendChild(chip);
        });
        wrapper.appendChild(strip);

        // Recent answers (with dispute buttons)
        if (state.recent && state.recent.length) {
            const recentCard = document.createElement('div');
            recentCard.className = 'card';
            recentCard.style.maxHeight = '150px';
            recentCard.style.overflowY = 'auto';
            let rh = '<div class="card-header"><span class="material-symbols-rounded card-icon">history</span><h3>Zuletzt genannt</h3></div>';
            recentCard.innerHTML = rh;
            state.recent.slice().reverse().forEach(item => {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:6px 4px; border-bottom:1px solid var(--outline-variant);';
                const left = document.createElement('div');
                left.innerHTML = `<strong>${item.term}</strong> <span style="font-size:11px; color:var(--on-surface-variant);">— ${item.nickname}</span>`;
                row.appendChild(left);
                // Anfechten if it's someone else's answer and I'm a participant
                if (amIn && item.session_id !== this.app.sessionId) {
                    const btn = document.createElement('button');
                    btn.className = 'btn btn-text';
                    btn.style.cssText = 'font-size:12px; padding:2px 8px;';
                    btn.innerHTML = '⚖ Anfechten';
                    btn.addEventListener('click', () => this.app.startDispute(item.session_id, item.term));
                    row.appendChild(btn);
                }
                recentCard.appendChild(row);
            });
            wrapper.appendChild(recentCard);
        }

        // Input for current player
        if (amIn && !amOut && isMyTurn) {
            const field = document.createElement('div');
            field.className = 'text-field';
            field.innerHTML = `<input id="b-input" type="text" autocomplete="off" placeholder="Begriff..." style="font-size:16px; padding:14px;"><label for="b-input">Dein Begriff</label>`;
            wrapper.appendChild(field);

            const err = document.createElement('div');
            err.id = 'b-error';
            err.style.cssText = 'min-height:18px; font-size:13px; font-weight:600; color:var(--error); text-align:center;';
            wrapper.appendChild(err);

            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'display:flex; gap:10px;';
            const submit = document.createElement('button');
            submit.className = 'btn btn-primary'; submit.style.flexGrow = '1';
            submit.innerHTML = '<span class="material-symbols-rounded">send</span> Absenden';
            const input = field.querySelector('input');
            input.addEventListener('input', e => { this.localTerm = e.target.value; });
            const doSubmit = () => { const v = (this.localTerm || '').trim(); if (!v) return; this.app.sendGameAction({ type: 'submit_term', term: v }); this.localTerm = ''; input.value = ''; };
            submit.addEventListener('click', doSubmit);
            input.addEventListener('keypress', e => { if (e.key === 'Enter') doSubmit(); });
            const giveUp = document.createElement('button');
            giveUp.className = 'btn btn-tonal'; giveUp.style.color = 'var(--error)';
            giveUp.innerHTML = '<span class="material-symbols-rounded">flag</span> Aufgeben';
            giveUp.addEventListener('click', () => this.app.sendGameAction({ type: 'give_up' }));
            btnRow.appendChild(submit); btnRow.appendChild(giveUp);
            wrapper.appendChild(btnRow);
            setTimeout(() => input.focus(), 50);
        } else {
            const note = document.createElement('div');
            note.style.cssText = 'text-align:center; font-size:14px; font-weight:500; color:var(--on-surface-variant); padding:8px;';
            if (amOut) note.innerHTML = '<span class="material-symbols-rounded" style="vertical-align:middle; color:var(--error);">visibility</span> Du bist raus – du kannst weiter zuschauen.';
            else if (!amIn) note.innerHTML = '<span class="material-symbols-rounded" style="vertical-align:middle;">visibility</span> Du schaust zu.';
            else note.textContent = 'Warte, bis du die Bombe bekommst...';
            wrapper.appendChild(note);
        }

        this.container.appendChild(wrapper);
        this.updateError(state);
        this.startTimerLoop(state);
    }

    startTimerLoop(state) {
        this.clearIntervals();
        this.lastTimeLeft = state.time_left;
        this.timerInterval = setInterval(() => {
            const el = document.getElementById('b-timer');
            if (!el) { this.clearIntervals(); return; }
            let v = parseInt(el.textContent) || 0;
            v = Math.max(0, v - 1);
            el.textContent = v;
            if (v <= 5) { el.style.color = 'var(--error)'; this.app.sound('tick'); }
            if (v <= 0) {
                this.clearIntervals();
                this.app.sound('explode');
                this.app.sendGameAction({ type: 'timeout', turn_count: state.turn_count });
            }
        }, 1000);
    }

    syncTimer(state) {
        const el = document.getElementById('b-timer');
        if (el) el.textContent = state.time_left;
    }

    updateError(state) {
        const el = document.getElementById('b-error');
        if (!el) return;
        el.textContent = (state.turn_error && state.turn_error.session_id === this.app.sessionId && state.current_turn === this.app.sessionId) ? state.turn_error.reason : '';
    }

    // --- FINISHED ---
    renderFinished(state) {
        const isCreator = (state.creator_id === this.app.sessionId);
        const iWon = state.winner === this.app.sessionId;
        if (iWon) this.app.sound('win'); else this.app.sound('lose');

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex; flex-direction:column; gap:20px; width:100%; max-width:480px; padding:12px; align-items:center;';
        const overlay = document.createElement('div');
        overlay.className = 'game-info-overlay';
        const title = document.createElement('div'); title.className = 'game-info-overlay-title';
        const sub = document.createElement('div'); sub.className = 'game-info-overlay-subtitle';
        if (!state.winner || state.winner === 'draw') { title.textContent = 'Vorbei!'; sub.textContent = 'Kein Sieger.'; }
        else if (iWon) { title.textContent = '🎉 Überlebt!'; title.style.color = '#4CAF50'; sub.textContent = 'Du bist als Letzte:r übrig!'; }
        else { title.textContent = '💥 Vorbei!'; sub.textContent = `${state.winner_name} hat überlebt.`; }
        overlay.appendChild(title); overlay.appendChild(sub);
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

window.BombeController = BombeController;
