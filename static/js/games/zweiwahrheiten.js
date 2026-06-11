/**
 * 2 Wahrheiten, 1 Lüge — Game Controller
 */
class ZweiWahrheitenController {
    constructor(app, container) {
        this.app = app;
        this.container = container;
        this.type = 'zweiwahrheiten';
        this.currentStatus = "";
        this.localStatements = ["", "", ""];
        this.localLie = 0;
        this.localGuesses = {};
    }

    render(state) {
        const statusChanged = state.status !== this.currentStatus;
        this.currentStatus = state.status;
        // Collect/guessing forms keep local input; only re-render on status change
        if (statusChanged) {
            this.container.innerHTML = '';
            if (state.status === "setup") this.renderSetup(state);
            else if (state.status === "collect") this.renderCollect(state);
            else if (state.status === "guessing") this.renderGuessing(state);
            else if (state.status === "finished") this.renderFinished(state);
        } else if (state.status === "collect") {
            this.updateSubmittedList(state);
        } else if (state.status === "guessing") {
            this.updateGuessProgress(state);
        }
    }

    isParticipant(state) { return state.players.some(p => p.session_id === this.app.sessionId); }

    renderSetup(state) {
        const isCreator = (state.creator_id === this.app.sessionId);
        const amIn = this.isParticipant(state);
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex; flex-direction:column; gap:18px; width:100%; max-width:480px; padding:12px;';
        wrapper.innerHTML = `<div style="text-align:center;"><h3 style="font-size:22px; font-weight:700; color:var(--primary);">2 Wahrheiten, 1 Lüge</h3>
            <p style="font-size:13px; color:var(--on-surface-variant);">${isCreator ? 'Starte, wenn alle da sind.' : 'Warte auf den Host...'}</p></div>
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
            const can = state.players.filter(p => p.is_active).length >= 2;
            b.disabled = !can; if (!can) b.style.opacity = '0.5';
            b.innerHTML = '<span class="material-symbols-rounded">play_arrow</span> Aussagen sammeln';
            b.addEventListener('click', () => this.app.sendGameAction({ type: 'start_collect' }));
            wrapper.appendChild(b);
        }
        this.container.appendChild(wrapper);
    }

    renderCollect(state) {
        this.localStatements = ["", "", ""]; this.localLie = 0;
        const mine = state.players.find(p => p.session_id === this.app.sessionId);
        const amIn = !!mine;
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex; flex-direction:column; gap:16px; width:100%; max-width:500px; padding:12px;';
        wrapper.innerHTML = `<div style="text-align:center;"><h3 style="font-size:20px; font-weight:700; color:var(--primary);">Deine 3 Aussagen</h3>
            <p style="font-size:13px; color:var(--on-surface-variant);">Zwei wahr, eine erfunden. Markiere die Lüge.</p></div>`;

        if (amIn && !mine.submitted) {
            const card = document.createElement('div');
            card.className = 'card'; card.style.gap = '12px';
            [0, 1, 2].forEach(i => {
                const fieldRow = document.createElement('div');
                fieldRow.style.cssText = 'display:flex; align-items:center; gap:10px;';
                const lieRadio = document.createElement('button');
                lieRadio.type = 'button';
                lieRadio.className = 'wk-lie-radio';
                lieRadio.style.cssText = 'min-width:70px; padding:8px; border-radius:10px; border:1px solid var(--outline); background:transparent; color:var(--on-surface-variant); font-size:12px; font-weight:600; cursor:pointer;';
                lieRadio.textContent = 'Lüge?';
                lieRadio.addEventListener('click', () => {
                    this.localLie = i;
                    card.querySelectorAll('.wk-lie-radio').forEach((r, ri) => {
                        const on = ri === i;
                        r.style.background = on ? 'var(--error)' : 'transparent';
                        r.style.color = on ? '#fff' : 'var(--on-surface-variant)';
                        r.style.borderColor = on ? 'var(--error)' : 'var(--outline)';
                        r.textContent = on ? '✓ Lüge' : 'Lüge?';
                    });
                });
                const field = document.createElement('div');
                field.className = 'text-field'; field.style.flexGrow = '1';
                field.innerHTML = `<input id="zw-s${i}" type="text" placeholder="Aussage ${i + 1}"><label for="zw-s${i}">Aussage ${i + 1}</label>`;
                field.querySelector('input').addEventListener('input', e => { this.localStatements[i] = e.target.value; });
                fieldRow.appendChild(lieRadio); fieldRow.appendChild(field);
                card.appendChild(fieldRow);
            });
            wrapper.appendChild(card);
            const submit = document.createElement('button');
            submit.className = 'btn btn-primary'; submit.style.width = '100%';
            submit.innerHTML = '<span class="material-symbols-rounded">check</span> Aussagen absenden';
            submit.addEventListener('click', () => {
                if (this.localStatements.some(s => !s.trim())) { this.app.showToast('Bitte alle 3 Aussagen ausfüllen.'); return; }
                this.app.sendGameAction({ type: 'submit_entry', statements: this.localStatements, lie_index: this.localLie });
            });
            wrapper.appendChild(submit);
        }

        const statusCard = document.createElement('div');
        statusCard.className = 'card';
        statusCard.innerHTML = `<div class="card-header"><span class="material-symbols-rounded card-icon">how_to_reg</span><h3>Status</h3></div><div id="zw-submitted"></div>`;
        wrapper.appendChild(statusCard);
        this.container.appendChild(wrapper);
        this.updateSubmittedList(state);

        if (state.creator_id === this.app.sessionId) {
            const force = document.createElement('button');
            force.className = 'btn btn-text'; force.style.width = '100%';
            force.textContent = 'Weiter zum Raten (auch ohne alle)';
            force.addEventListener('click', () => this.app.sendGameAction({ type: 'force_guessing' }));
            wrapper.appendChild(force);
        }
    }

    updateSubmittedList(state) {
        const el = document.getElementById('zw-submitted');
        if (!el) return;
        el.innerHTML = state.players.map(p => `<div style="display:flex; justify-content:space-between; padding:6px 4px;">
            <span>${p.nickname}</span>
            <span style="color:${p.submitted ? '#4CAF50' : 'var(--on-surface-variant)'};">${p.submitted ? '✓ fertig' : '… tippt'}</span></div>`).join('');
    }

    renderGuessing(state) {
        this.localGuesses = {};
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex; flex-direction:column; gap:16px; width:100%; max-width:560px; padding:12px;';
        wrapper.innerHTML = `<div style="text-align:center;"><h3 style="font-size:20px; font-weight:700; color:var(--primary);">Finde die Lüge!</h3>
            <p style="font-size:13px; color:var(--on-surface-variant);">Tippe bei jeder Person auf die Aussage, die du für gelogen hältst.</p></div>`;

        const myGuesses = state.guesses[this.app.sessionId] || {};
        Object.keys(state.entries).forEach(authorId => {
            if (authorId === this.app.sessionId) return; // can't guess own
            const entry = state.entries[authorId];
            const card = document.createElement('div');
            card.className = 'card'; card.style.gap = '8px';
            card.innerHTML = `<h4 style="font-weight:700; color:var(--primary);">${entry.nickname}</h4>`;
            entry.statements.forEach((s, idx) => {
                const opt = document.createElement('button');
                const picked = myGuesses[authorId] === idx;
                opt.style.cssText = `text-align:left; padding:12px 14px; border-radius:12px; border:1px solid ${picked ? 'var(--error)' : 'var(--outline-variant)'}; background:${picked ? 'rgba(242,184,181,0.15)' : 'var(--surface-variant)'}; color:var(--on-surface); font-size:14px; cursor:pointer; font-weight:500;`;
                opt.textContent = (picked ? '🤥 ' : '') + s;
                opt.addEventListener('click', () => this.app.sendGameAction({ type: 'submit_guess', author_id: authorId, index: idx }));
                card.appendChild(opt);
            });
            wrapper.appendChild(card);
        });

        const prog = document.createElement('div');
        prog.id = 'zw-progress';
        prog.style.cssText = 'text-align:center; font-size:13px; color:var(--on-surface-variant);';
        wrapper.appendChild(prog);

        if (state.creator_id === this.app.sessionId) {
            const reveal = document.createElement('button');
            reveal.className = 'btn btn-primary btn-large'; reveal.style.width = '100%';
            reveal.innerHTML = '<span class="material-symbols-rounded">visibility</span> Auflösen & punkten';
            reveal.addEventListener('click', () => this.app.sendGameAction({ type: 'reveal' }));
            wrapper.appendChild(reveal);
        } else {
            const w = document.createElement('div');
            w.style.cssText = 'text-align:center; font-size:14px; color:var(--on-surface-variant);';
            w.textContent = 'Warte auf den Host zum Auflösen...';
            wrapper.appendChild(w);
        }
        this.container.appendChild(wrapper);
        this.updateGuessProgress(state);
    }

    updateGuessProgress(state) {
        const el = document.getElementById('zw-progress');
        if (!el) return;
        const total = Object.keys(state.entries).length;
        let done = 0;
        Object.keys(state.guesses).forEach(g => { if (Object.keys(state.guesses[g]).length >= (total - 1)) done++; });
        el.textContent = `${done} von ${state.players.filter(p => p.is_active).length} Spielern fertig`;
    }

    renderFinished(state) {
        const isCreator = (state.creator_id === this.app.sessionId);
        this.app.sound('win');
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex; flex-direction:column; gap:16px; width:100%; max-width:560px; padding:12px;';
        wrapper.innerHTML = `<div style="text-align:center;"><h3 style="font-size:22px; font-weight:700; color:var(--primary);">Auflösung</h3></div>`;

        // Scores
        const scoreCard = document.createElement('div');
        scoreCard.className = 'card';
        const sorted = Object.entries(state.scores).sort((a, b) => b[1] - a[1]);
        scoreCard.innerHTML = `<div class="card-header"><span class="material-symbols-rounded card-icon">emoji_events</span><h3>Punkte</h3></div>
            ${sorted.map(([n, v]) => `<div style="display:flex; justify-content:space-between; padding:8px 12px; border-radius:12px; background:var(--surface-variant); margin-bottom:6px;"><span style="font-weight:600;">${n}</span><span style="font-weight:700; color:var(--primary);">${v} Pkt.</span></div>`).join('')}`;
        wrapper.appendChild(scoreCard);

        // Reveal each entry's lie
        Object.keys(state.entries).forEach(authorId => {
            const e = state.entries[authorId];
            const card = document.createElement('div');
            card.className = 'card'; card.style.gap = '6px';
            card.innerHTML = `<h4 style="font-weight:700; color:var(--primary);">${e.nickname}</h4>` +
                e.statements.map((s, idx) => {
                    const isLie = idx === e.lie_index;
                    return `<div style="padding:10px 12px; border-radius:10px; background:${isLie ? 'rgba(242,184,181,0.18)' : 'var(--surface-variant)'}; font-size:14px; ${isLie ? 'font-weight:700;' : ''}">${isLie ? '🤥 ' : '✓ '}${s}</div>`;
                }).join('');
            wrapper.appendChild(card);
        });

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

window.ZweiWahrheitenController = ZweiWahrheitenController;
