/**
 * Mensch ärgere dich nicht (Ludo) Game Controller
 */
const AERGER_DICE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

class AergerController {
    constructor(app, container) {
        this.app = app;
        this.container = container;
        this.type = 'aerger';
        this.lastMsg = '';
    }

    render(state) {
        this.container.innerHTML = '';
        if (state.status === 'setup') this.renderSetup(state);
        else if (state.status === 'playing') this.renderPlaying(state);
        else if (state.status === 'finished') this.renderFinished(state);
    }

    isParticipant(state) { return state.players.some(p => p.session_id === this.app.sessionId); }

    renderSetup(state) {
        const isCreator = (state.creator_id === this.app.sessionId);
        const amIn = this.isParticipant(state);
        const full = state.players.filter(p => p.is_active).length >= 4;
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex; flex-direction:column; gap:18px; width:100%; max-width:480px; padding:12px;';
        wrapper.innerHTML = `<div style="text-align:center;"><h3 style="font-size:22px; font-weight:700; color:var(--primary);">Mensch ärgere dich nicht</h3>
            <p style="font-size:13px; color:var(--on-surface-variant);">${isCreator ? '2–4 Spieler. Starte, wenn alle da sind.' : 'Warte auf den Host...'}</p></div>
            <div class="card"><div class="card-header"><span class="material-symbols-rounded card-icon">groups</span><h3>Mitspieler (${state.players.length}/4)</h3></div>
            <div style="display:flex; flex-direction:column; gap:8px;">${state.players.map(p => `<div style="padding:8px 12px; border-radius:12px; background:var(--surface-variant); font-weight:600;">${p.nickname} ${p.session_id === this.app.sessionId ? '(Du)' : ''}</div>`).join('')}</div></div>`;
        if (!amIn && !full) {
            const j = document.createElement('button');
            j.className = 'btn btn-primary btn-large'; j.style.width = '100%';
            j.innerHTML = '<span class="material-symbols-rounded">person_add</span> Mitspielen';
            j.addEventListener('click', () => this.app.sendGameJoin(state.game_session_id));
            wrapper.appendChild(j);
        }
        if (isCreator) {
            const cfg = document.createElement('div');
            cfg.className = 'card';
            cfg.innerHTML = `
                <label style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
                    <span><strong>Rauskommen nur mit 6</strong><br><span style="font-size:12px; color:var(--on-surface-variant);">Aus, um auch mit 1 zu starten.</span></span>
                    <input type="checkbox" id="ae-six" ${state.exit_only_six ? 'checked' : ''} style="width:20px; height:20px;">
                </label>
                <label style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; margin-top:8px;">
                    <span><strong>Extra-Wurf bei 6</strong></span>
                    <input type="checkbox" id="ae-reroll" ${state.reroll_on_six ? 'checked' : ''} style="width:20px; height:20px;">
                </label>`;
            wrapper.appendChild(cfg);
            const six = cfg.querySelector('#ae-six'); const rr = cfg.querySelector('#ae-reroll');
            const push = () => this.app.sendGameAction({ type: 'configure', exit_only_six: six.checked, reroll_on_six: rr.checked });
            six.addEventListener('change', push); rr.addEventListener('change', push);

            const b = document.createElement('button');
            b.className = 'btn btn-primary btn-large'; b.style.width = '100%';
            const can = state.players.filter(p => p.is_active).length >= 2;
            b.disabled = !can; if (!can) b.style.opacity = '0.5';
            b.innerHTML = '<span class="material-symbols-rounded">play_arrow</span> Spiel starten';
            b.addEventListener('click', () => this.app.sendGameAction({ type: 'start_game' }));
            wrapper.appendChild(b);
            if (!can) { const h = document.createElement('p'); h.style.cssText = 'text-align:center;font-size:13px;color:var(--on-surface-variant);'; h.textContent = 'Mindestens 2 Spieler benötigt.'; wrapper.appendChild(h); }
        }
        this.container.appendChild(wrapper);
    }

    renderPlaying(state) {
        const isMyTurn = state.current_turn === this.app.sessionId;
        if (isMyTurn && state.message !== this.lastMsg) this.app.sound('turn');
        this.lastMsg = state.message;

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex; flex-direction:column; gap:14px; width:100%; max-width:560px; padding:12px;';

        // Turn + die
        const top = document.createElement('div');
        top.style.cssText = 'display:flex; align-items:center; justify-content:space-between; background:var(--surface); padding:12px 18px; border-radius:18px; border:1px solid var(--outline-variant);';
        const turnColor = state.colors[state.current_turn] || 'var(--primary)';
        top.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <span style="width:18px; height:18px; border-radius:50%; background:${turnColor}; display:inline-block;"></span>
                <span style="font-weight:700;">${isMyTurn ? 'Du bist dran' : (state.current_turn_name || '...') + ' ist dran'}</span>
            </div>
            <span style="font-size:40px; line-height:1;">${state.die ? AERGER_DICE[state.die] : '🎲'}</span>
        `;
        wrapper.appendChild(top);

        if (state.message) {
            const msg = document.createElement('div');
            msg.style.cssText = 'text-align:center; font-size:13px; font-weight:600; color:var(--primary);';
            msg.textContent = state.message;
            wrapper.appendChild(msg);
        }

        // Board track
        wrapper.appendChild(this.buildBoard(state));

        // Player progress panels
        const panels = document.createElement('div');
        panels.style.cssText = 'display:flex; flex-wrap:wrap; gap:8px;';
        state.players.filter(p => state.tokens[p.session_id]).forEach(p => {
            const toks = state.tokens[p.session_id];
            const yard = toks.filter(t => t.state === 'yard').length;
            const goal = toks.filter(t => t.state === 'goal').length;
            const panel = document.createElement('div');
            panel.style.cssText = `flex:1; min-width:120px; padding:8px 12px; border-radius:12px; background:var(--surface-variant); border-left:4px solid ${p.color};`;
            panel.innerHTML = `<div style="font-weight:700; font-size:13px;">${p.nickname}</div>
                <div style="font-size:12px; color:var(--on-surface-variant);">🏠 ${yard} · 🎯 ${goal}/4</div>`;
            panels.appendChild(panel);
        });
        wrapper.appendChild(panels);

        // Controls
        if (isMyTurn && state.phase === 'roll') {
            const roll = document.createElement('button');
            roll.className = 'btn btn-primary btn-large'; roll.style.width = '100%';
            roll.innerHTML = '<span class="material-symbols-rounded">casino</span> Würfeln';
            roll.addEventListener('click', () => this.app.sendGameAction({ type: 'roll' }));
            wrapper.appendChild(roll);
        } else if (isMyTurn && state.phase === 'move') {
            const label = document.createElement('p');
            label.style.cssText = 'text-align:center; font-size:13px; color:var(--on-surface-variant);';
            label.textContent = 'Wähle eine Figur zum Ziehen:';
            wrapper.appendChild(label);
            const tokRow = document.createElement('div');
            tokRow.style.cssText = 'display:flex; gap:8px; flex-wrap:wrap; justify-content:center;';
            const myToks = state.tokens[this.app.sessionId] || [];
            myToks.forEach((tk, i) => {
                const legal = state.legal.includes(i);
                const btn = document.createElement('button');
                btn.className = 'btn ' + (legal ? 'btn-primary' : 'btn-tonal');
                btn.disabled = !legal;
                if (!legal) btn.style.opacity = '0.4';
                let pos = tk.state === 'yard' ? '🏠 Haus' : (tk.state === 'goal' ? `🎯 Ziel ${tk.goal + 1}` : `Feld ${tk.abs}`);
                btn.textContent = `Figur ${i + 1}: ${pos}`;
                if (legal) btn.addEventListener('click', () => this.app.sendGameAction({ type: 'move', token: i }));
                tokRow.appendChild(btn);
            });
            wrapper.appendChild(tokRow);
        }

        this.container.appendChild(wrapper);
    }

    buildBoard(state) {
        const board = document.createElement('div');
        board.className = 'card';
        board.style.padding = '12px';

        // Map abs field -> list of {color, isStart}
        const occ = {};
        const startFields = {};
        Object.keys(state.offsets).forEach(sid => { startFields[state.offsets[sid]] = state.colors[sid]; });
        state.players.forEach(p => {
            const toks = state.tokens[p.session_id];
            if (!toks) return;
            toks.forEach(tk => {
                if (tk.state === 'track') {
                    (occ[tk.abs] = occ[tk.abs] || []).push(p.color);
                }
            });
        });

        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid; grid-template-columns:repeat(10, 1fr); gap:3px;';
        for (let i = 0; i < state.track_len; i++) {
            const cell = document.createElement('div');
            const isStart = startFields[i];
            cell.style.cssText = `aspect-ratio:1; display:flex; align-items:center; justify-content:center; border-radius:6px; font-size:9px; position:relative; background:var(--surface-variant); border:1px solid ${isStart ? isStart : 'var(--outline-variant)'};`;
            const dots = occ[i] || [];
            if (dots.length) {
                const wrap = document.createElement('div');
                wrap.style.cssText = 'display:flex; gap:1px; flex-wrap:wrap; justify-content:center;';
                dots.forEach(c => {
                    const dot = document.createElement('span');
                    dot.style.cssText = `width:9px; height:9px; border-radius:50%; background:${c}; border:1px solid rgba(0,0,0,0.3);`;
                    wrap.appendChild(dot);
                });
                cell.appendChild(wrap);
            } else {
                const idx = document.createElement('span');
                idx.style.color = 'var(--on-surface-variant)';
                idx.style.opacity = '0.4';
                idx.textContent = i;
                cell.appendChild(idx);
            }
            grid.appendChild(cell);
        }
        board.appendChild(grid);

        // Goal lanes per player
        const goals = document.createElement('div');
        goals.style.cssText = 'display:flex; flex-wrap:wrap; gap:8px; margin-top:10px;';
        state.players.forEach(p => {
            const toks = state.tokens[p.session_id];
            if (!toks) return;
            const lane = document.createElement('div');
            lane.style.cssText = 'display:flex; align-items:center; gap:4px;';
            const lbl = document.createElement('span');
            lbl.style.cssText = `font-size:11px; font-weight:700; color:${p.color};`;
            lbl.textContent = '🎯';
            lane.appendChild(lbl);
            for (let g = 0; g < state.goal_len; g++) {
                const slot = document.createElement('span');
                const filled = toks.some(tk => tk.state === 'goal' && tk.goal === g);
                slot.style.cssText = `width:14px; height:14px; border-radius:50%; border:1px solid ${p.color}; background:${filled ? p.color : 'transparent'};`;
                lane.appendChild(slot);
            }
            goals.appendChild(lane);
        });
        board.appendChild(goals);
        return board;
    }

    renderFinished(state) {
        const isCreator = (state.creator_id === this.app.sessionId);
        const iWon = state.winner === this.app.sessionId;
        if (iWon) this.app.sound('win');
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex; flex-direction:column; gap:16px; width:100%; max-width:440px; padding:12px; align-items:center;';
        const overlay = document.createElement('div');
        overlay.className = 'game-info-overlay';
        overlay.innerHTML = `<div class="game-info-overlay-title" style="${iWon ? 'color:#4CAF50;' : ''}">${iWon ? '🎉 Gewonnen!' : 'Vorbei!'}</div>
            <div class="game-info-overlay-subtitle">${iWon ? 'Alle Figuren im Ziel!' : (state.winner_name || '') + ' hat gewonnen.'}</div>`;
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

window.AergerController = AergerController;
