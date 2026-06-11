/**
 * Wer bin ich? — Game Controller
 */
class WerBinIchController {
    constructor(app, container) {
        this.app = app;
        this.container = container;
        this.type = 'werbinich';
        this.currentStatus = "";
        this.localQuestion = "";
        this.localGuess = "";
    }

    render(state) {
        const statusChanged = state.status !== this.currentStatus;
        this.currentStatus = state.status;
        this.container.innerHTML = '';
        if (state.status === "setup") this.renderSetup(state);
        else if (state.status === "suggest") this.renderSuggest(state);
        else if (state.status === "vote") this.renderVote(state);
        else if (state.status === "playing") this.renderPlaying(state);
        else if (state.status === "finished") this.renderFinished(state);
    }

    isParticipant(state) { return state.players.some(p => p.session_id === this.app.sessionId); }
    others(state) { return state.players.filter(p => p.is_active && p.session_id !== this.app.sessionId); }

    renderSetup(state) {
        const isCreator = (state.creator_id === this.app.sessionId);
        const amIn = this.isParticipant(state);
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex; flex-direction:column; gap:18px; width:100%; max-width:480px; padding:12px;';
        wrapper.innerHTML = `<div style="text-align:center;"><h3 style="font-size:22px; font-weight:700; color:var(--primary);">Wer bin ich?</h3>
            <p style="font-size:13px; color:var(--on-surface-variant);">${isCreator ? 'Mind. 3 Spieler. Starte, wenn alle da sind.' : 'Warte auf den Host...'}</p></div>
            <div class="card"><div class="card-header"><span class="material-symbols-rounded card-icon">groups</span><h3>Mitspieler (${state.players.length})</h3></div>
            <div style="display:flex; flex-direction:column; gap:8px;">${state.players.map(p => `<div style="padding:8px 12px; border-radius:12px; background:var(--surface-variant); font-weight:600;">${p.nickname} ${p.session_id === this.app.sessionId ? '(Du)' : ''}</div>`).join('')}</div></div>`;
        if (!amIn) {
            const j = document.createElement('button');
            j.className = 'btn btn-primary btn-large'; j.style.width = '100%';
            j.innerHTML = '<span class="material-symbols-rounded">person_add</span> Mitspielen';
            j.addEventListener('click', () => this.app.sendGameJoin(state.game_session_id));
            wrapper.appendChild(j);
        }
        if (isCreator) {
            const b = document.createElement('button');
            b.className = 'btn btn-primary btn-large'; b.style.width = '100%';
            const can = state.players.filter(p => p.is_active).length >= 3;
            b.disabled = !can; if (!can) b.style.opacity = '0.5';
            b.innerHTML = '<span class="material-symbols-rounded">play_arrow</span> Vorschläge sammeln';
            b.addEventListener('click', () => this.app.sendGameAction({ type: 'start_suggest' }));
            wrapper.appendChild(b);
            if (!can) { const h = document.createElement('p'); h.style.cssText = 'text-align:center;font-size:13px;color:var(--on-surface-variant);'; h.textContent = 'Mindestens 3 Spieler benötigt.'; wrapper.appendChild(h); }
        }
        this.container.appendChild(wrapper);
    }

    renderSuggest(state) {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex; flex-direction:column; gap:16px; width:100%; max-width:520px; padding:12px;';
        wrapper.innerHTML = `<div style="text-align:center;"><h3 style="font-size:20px; font-weight:700; color:var(--primary);">Vorschläge machen</h3>
            <p style="font-size:13px; color:var(--on-surface-variant);">Schlage für jede:n eine geheime Identität vor (Person, Figur, ...).</p></div>`;

        this.others(state).forEach(p => {
            const mySugg = (state.suggestions[p.session_id] || []).find(s => s.by_id === this.app.sessionId);
            const card = document.createElement('div');
            card.className = 'card'; card.style.gap = '8px';
            card.innerHTML = `<h4 style="font-weight:700; color:var(--primary);">${p.nickname}</h4>`;
            const row = document.createElement('div');
            row.style.cssText = 'display:flex; gap:8px;';
            row.innerHTML = `<input id="wbi-${p.session_id}" type="text" value="${mySugg ? mySugg.text.replace(/"/g, '&quot;') : ''}" placeholder="z.B. Batman" style="flex-grow:1; padding:10px 14px; border-radius:12px; border:1px solid var(--outline); background:transparent; color:var(--on-background);">
                <button class="btn btn-tonal" style="padding:0 16px;">${mySugg ? '✓' : 'OK'}</button>`;
            const inp = row.querySelector('input'); const btn = row.querySelector('button');
            const send = () => { const v = inp.value.trim(); if (v) { this.app.sendGameAction({ type: 'submit_suggestion', target_id: p.session_id, text: v }); btn.textContent = '✓'; } };
            btn.addEventListener('click', send);
            inp.addEventListener('keypress', e => { if (e.key === 'Enter') send(); });
            card.appendChild(row);
            wrapper.appendChild(card);
        });

        if (state.creator_id === this.app.sessionId) {
            const next = document.createElement('button');
            next.className = 'btn btn-primary btn-large'; next.style.width = '100%';
            next.innerHTML = '<span class="material-symbols-rounded">how_to_vote</span> Weiter zum Abstimmen';
            next.addEventListener('click', () => this.app.sendGameAction({ type: 'start_vote' }));
            wrapper.appendChild(next);
        } else {
            const w = document.createElement('div');
            w.style.cssText = 'text-align:center; font-size:14px; color:var(--on-surface-variant);';
            w.textContent = 'Warte auf den Host...';
            wrapper.appendChild(w);
        }
        this.container.appendChild(wrapper);
    }

    renderVote(state) {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex; flex-direction:column; gap:16px; width:100%; max-width:520px; padding:12px;';
        wrapper.innerHTML = `<div style="text-align:center;"><h3 style="font-size:20px; font-weight:700; color:var(--primary);">Abstimmen</h3>
            <p style="font-size:13px; color:var(--on-surface-variant);">Welche Identität soll jede Person bekommen? (Nicht deine eigene — die bleibt geheim.)</p></div>`;

        this.others(state).forEach(p => {
            const suggs = state.suggestions[p.session_id] || [];
            const myVote = (state.votes[p.session_id] || {})[this.app.sessionId];
            const card = document.createElement('div');
            card.className = 'card'; card.style.gap = '8px';
            card.innerHTML = `<h4 style="font-weight:700; color:var(--primary);">${p.nickname}</h4>`;
            suggs.forEach(s => {
                const opt = document.createElement('button');
                const picked = myVote === s.id;
                opt.style.cssText = `text-align:left; padding:10px 14px; border-radius:12px; border:1px solid ${picked ? 'var(--primary)' : 'var(--outline-variant)'}; background:${picked ? 'var(--primary-container)' : 'var(--surface-variant)'}; color:${picked ? 'var(--on-primary-container)' : 'var(--on-surface)'}; font-size:14px; font-weight:500; cursor:pointer;`;
                opt.innerHTML = `${picked ? '✓ ' : ''}<strong>${s.text}</strong> <span style="font-size:11px; opacity:0.7;">— ${s.by_name}</span>`;
                opt.addEventListener('click', () => this.app.sendGameAction({ type: 'submit_vote', target_id: p.session_id, suggestion_id: s.id }));
                card.appendChild(opt);
            });
            wrapper.appendChild(card);
        });

        if (state.creator_id === this.app.sessionId) {
            const next = document.createElement('button');
            next.className = 'btn btn-primary btn-large'; next.style.width = '100%';
            next.innerHTML = '<span class="material-symbols-rounded">play_arrow</span> Spiel starten';
            next.addEventListener('click', () => this.app.sendGameAction({ type: 'start_play' }));
            wrapper.appendChild(next);
        }
        this.container.appendChild(wrapper);
    }

    renderPlaying(state) {
        const isMyTurn = state.current_turn === this.app.sessionId;
        if (isMyTurn) this.app.sound('turn');
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex; flex-direction:column; gap:16px; width:100%; max-width:520px; padding:12px;';

        // Identity board (hide my own)
        const board = document.createElement('div');
        board.className = 'card'; board.style.gap = '8px';
        let bh = '<div class="card-header"><span class="material-symbols-rounded card-icon">badge</span><h3>Identitäten</h3></div>';
        (state.identity_board || []).forEach(b => {
            const mine = b.session_id === this.app.sessionId;
            const isTurn = b.session_id === state.current_turn;
            const solved = (state.solved_ids || []).includes(b.session_id);
            bh += `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-radius:12px; background:${isTurn ? 'var(--primary-container)' : 'var(--surface-variant)'};">
                <span style="font-weight:600;">${isTurn ? '▶ ' : ''}${b.nickname} ${mine ? '(Du)' : ''}</span>
                <span style="font-weight:700; color:${mine ? 'var(--on-surface-variant)' : 'var(--primary)'};">${mine ? (solved ? '✓ erraten' : '❓ geheim') : b.identity}</span></div>`;
        });
        board.innerHTML = bh;
        wrapper.appendChild(board);

        // Turn banner
        const banner = document.createElement('div');
        banner.style.cssText = 'text-align:center; font-size:15px; font-weight:600; padding:8px 16px; border-radius:100px; background:var(--surface); border:1px solid var(--outline-variant);';
        banner.textContent = isMyTurn ? 'Du bist dran — stelle eine Ja/Nein-Frage!' : `${state.current_turn_name || '...'} ist dran...`;
        banner.style.color = isMyTurn ? 'var(--primary)' : 'var(--on-surface-variant)';
        wrapper.appendChild(banner);

        // Current question + answers
        if (state.current_question) {
            const qCard = document.createElement('div');
            qCard.className = 'card';
            const answersHtml = Object.entries(state.answers || {}).map(([n, v]) => {
                const color = v === 'ja' ? '#4CAF50' : (v === 'nein' ? 'var(--error)' : 'var(--on-surface-variant)');
                return `<span style="font-size:12px; padding:3px 8px; border-radius:8px; background:var(--surface-variant); color:${color};">${n}: ${v}</span>`;
            }).join(' ');
            qCard.innerHTML = `<div style="font-size:16px; font-weight:700; margin-bottom:8px;">❓ ${state.current_question}</div><div style="display:flex; flex-wrap:wrap; gap:6px;">${answersHtml || '<span style="font-size:12px; color:var(--on-surface-variant);">Noch keine Antworten</span>'}</div>`;
            wrapper.appendChild(qCard);

            // Non-asker answers Ja/Nein/Vielleicht
            if (!isMyTurn && this.isParticipant(state)) {
                const ansRow = document.createElement('div');
                ansRow.style.cssText = 'display:flex; gap:8px;';
                [['ja', 'Ja', '#4CAF50'], ['nein', 'Nein', 'var(--error)'], ['vielleicht', 'Vielleicht', 'var(--on-surface-variant)']].forEach(([val, label, col]) => {
                    const b = document.createElement('button');
                    b.className = 'btn btn-tonal'; b.style.flexGrow = '1'; b.style.color = col;
                    b.textContent = label;
                    b.addEventListener('click', () => this.app.sendGameAction({ type: 'answer', value: val }));
                    ansRow.appendChild(b);
                });
                wrapper.appendChild(ansRow);
            }
        }

        // Asker controls: ask / guess / pass
        if (isMyTurn) {
            const askField = document.createElement('div');
            askField.className = 'text-field';
            askField.innerHTML = `<input id="wbi-q" type="text" placeholder="z.B. Bin ich eine echte Person?"><label for="wbi-q">Deine Frage</label>`;
            askField.querySelector('input').addEventListener('input', e => { this.localQuestion = e.target.value; });
            wrapper.appendChild(askField);
            const askBtn = document.createElement('button');
            askBtn.className = 'btn btn-primary'; askBtn.style.width = '100%';
            askBtn.innerHTML = '<span class="material-symbols-rounded">help</span> Frage stellen';
            askBtn.addEventListener('click', () => { const q = (this.localQuestion || '').trim(); if (q) { this.app.sendGameAction({ type: 'ask', question: q }); this.localQuestion = ''; } });
            wrapper.appendChild(askBtn);

            const guessRow = document.createElement('div');
            guessRow.style.cssText = 'display:flex; gap:8px;';
            const guessInput = document.createElement('input');
            guessInput.type = 'text'; guessInput.placeholder = 'Wer bist du? (raten)';
            guessInput.style.cssText = 'flex-grow:1; padding:10px 14px; border-radius:12px; border:1px solid var(--outline); background:transparent; color:var(--on-background);';
            guessInput.addEventListener('input', e => { this.localGuess = e.target.value; });
            const guessBtn = document.createElement('button');
            guessBtn.className = 'btn btn-primary'; guessBtn.style.background = '#4CAF50';
            guessBtn.textContent = 'Raten';
            guessBtn.addEventListener('click', () => { const g = (this.localGuess || '').trim(); if (g) this.app.sendGameAction({ type: 'guess', text: g }); });
            guessRow.appendChild(guessInput); guessRow.appendChild(guessBtn);
            wrapper.appendChild(guessRow);

            const passBtn = document.createElement('button');
            passBtn.className = 'btn btn-text'; passBtn.style.width = '100%';
            passBtn.textContent = 'Weitergeben →';
            passBtn.addEventListener('click', () => this.app.sendGameAction({ type: 'pass' }));
            wrapper.appendChild(passBtn);
        }

        if (state.creator_id === this.app.sessionId) {
            const end = document.createElement('button');
            end.className = 'btn btn-text'; end.style.cssText = 'width:100%; color:var(--error);';
            end.textContent = 'Spiel beenden';
            end.addEventListener('click', () => this.app.sendGameAction({ type: 'end' }));
            wrapper.appendChild(end);
        }
        this.container.appendChild(wrapper);
    }

    renderFinished(state) {
        const isCreator = (state.creator_id === this.app.sessionId);
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex; flex-direction:column; gap:16px; width:100%; max-width:480px; padding:12px;';
        wrapper.innerHTML = `<div style="text-align:center;"><h3 style="font-size:22px; font-weight:700; color:var(--primary);">Auflösung</h3></div>`;
        const card = document.createElement('div');
        card.className = 'card'; card.style.gap = '8px';
        (state.identity_board || []).forEach(b => {
            const solved = (state.solved_ids || []).includes(b.session_id);
            card.innerHTML += `<div style="display:flex; justify-content:space-between; padding:8px 12px; border-radius:12px; background:var(--surface-variant);">
                <span style="font-weight:600;">${b.nickname} ${solved ? '✓' : ''}</span>
                <span style="font-weight:700; color:var(--primary);">${b.identity}</span></div>`;
        });
        wrapper.appendChild(card);
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

window.WerBinIchController = WerBinIchController;
