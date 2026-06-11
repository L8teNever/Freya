/**
 * Kniffel (Yahtzee) Game Controller
 */
const DICE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

class KniffelController {
    constructor(app, container) {
        this.app = app;
        this.container = container;
        this.type = 'kniffel';
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
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex; flex-direction:column; gap:18px; width:100%; max-width:480px; padding:12px;';
        wrapper.innerHTML = `<div style="text-align:center;"><h3 style="font-size:22px; font-weight:700; color:var(--primary);">🎲 Kniffel</h3>
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
            b.innerHTML = '<span class="material-symbols-rounded">play_arrow</span> Spiel starten';
            b.addEventListener('click', () => this.app.sendGameAction({ type: 'start_game' }));
            wrapper.appendChild(b);
        }
        this.container.appendChild(wrapper);
    }

    renderPlaying(state) {
        const isMyTurn = state.current_turn === this.app.sessionId;
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex; flex-direction:column; gap:16px; width:100%; max-width:560px; padding:12px;';

        // Turn banner
        const banner = document.createElement('div');
        banner.style.cssText = 'text-align:center; font-size:16px; font-weight:600; padding:8px 16px; border-radius:100px; background:var(--surface); border:1px solid var(--outline-variant);';
        banner.textContent = isMyTurn ? `Du bist dran · Würfe übrig: ${state.rolls_left}` : `${state.current_turn_name || '...'} ist dran...`;
        banner.style.color = isMyTurn ? 'var(--primary)' : 'var(--on-surface-variant)';
        wrapper.appendChild(banner);

        // Dice row
        const diceRow = document.createElement('div');
        diceRow.style.cssText = 'display:flex; gap:10px; justify-content:center;';
        state.dice.forEach((d, i) => {
            const die = document.createElement('div');
            const held = state.held[i];
            const canHold = isMyTurn && state.rolled_this_turn;
            die.style.cssText = `width:54px; height:54px; display:flex; align-items:center; justify-content:center; font-size:38px; line-height:1; border-radius:12px; border:2px solid ${held ? 'var(--primary)' : 'var(--outline-variant)'}; background:${held ? 'var(--primary-container)' : 'var(--surface)'}; cursor:${canHold ? 'pointer' : 'default'};`;
            die.textContent = d ? DICE_FACES[d] : '·';
            if (canHold) die.addEventListener('click', () => this.app.sendGameAction({ type: 'toggle_hold', index: i }));
            diceRow.appendChild(die);
        });
        wrapper.appendChild(diceRow);
        if (state.rolled_this_turn) {
            const hint = document.createElement('p');
            hint.style.cssText = 'text-align:center; font-size:12px; color:var(--on-surface-variant); margin-top:-6px;';
            hint.textContent = 'Tippe Würfel an, um sie zu halten.';
            wrapper.appendChild(hint);
        }

        // Roll button
        if (isMyTurn && state.rolls_left > 0) {
            const roll = document.createElement('button');
            roll.className = 'btn btn-primary'; roll.style.width = '100%';
            roll.innerHTML = `<span class="material-symbols-rounded">casino</span> Würfeln (${state.rolls_left})`;
            roll.addEventListener('click', () => this.app.sendGameAction({ type: 'roll' }));
            wrapper.appendChild(roll);
        }

        // Scorecard
        wrapper.appendChild(this.buildScorecard(state, isMyTurn));
        this.container.appendChild(wrapper);
    }

    buildScorecard(state, isMyTurn) {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.overflowX = 'auto';

        const players = state.players.filter(p => p.is_active || state.cards_by_id[p.session_id]);
        const order = state.players.filter(p => state.cards_by_id[p.session_id] !== undefined);

        const table = document.createElement('table');
        table.style.cssText = 'width:100%; border-collapse:collapse; font-size:13px;';

        // Header
        let head = '<tr><th style="text-align:left; padding:6px;">Kategorie</th>';
        order.forEach(p => { head += `<th style="padding:6px; text-align:center;">${p.nickname}${p.session_id === this.app.sessionId ? ' (Du)' : ''}</th>`; });
        head += '</tr>';
        table.innerHTML = head;

        const myId = this.app.sessionId;
        const myOpen = (cat) => !(state.cards_by_id[myId] && cat in state.cards_by_id[myId]);

        const addRow = (cat, label) => {
            const tr = document.createElement('tr');
            tr.style.borderTop = '1px solid var(--outline-variant)';
            const tdName = document.createElement('td');
            tdName.style.cssText = 'padding:6px; font-weight:500;';
            tdName.textContent = label;
            tr.appendChild(tdName);
            order.forEach(p => {
                const td = document.createElement('td');
                td.style.cssText = 'padding:6px; text-align:center;';
                const val = state.cards_by_id[p.session_id]?.[cat];
                if (val !== undefined) {
                    td.textContent = val;
                } else if (p.session_id === myId && isMyTurn && state.rolled_this_turn && cat in state.preview) {
                    const btn = document.createElement('button');
                    btn.style.cssText = 'padding:3px 8px; border-radius:8px; border:1px solid var(--primary); background:var(--primary-container); color:var(--on-primary-container); font-weight:700; cursor:pointer; font-size:13px;';
                    btn.textContent = state.preview[cat];
                    btn.addEventListener('click', () => this.app.sendGameAction({ type: 'score', category: cat }));
                    td.appendChild(btn);
                } else {
                    td.textContent = '–';
                    td.style.color = 'var(--on-surface-variant)';
                }
                tr.appendChild(td);
            });
            table.appendChild(tr);
        };

        state.upper_ids.forEach(c => addRow(c, state.category_names[c]));
        // Upper sum / bonus row
        const bonusTr = document.createElement('tr');
        bonusTr.style.cssText = 'border-top:1px solid var(--outline-variant); background:var(--surface-variant);';
        bonusTr.innerHTML = `<td style="padding:6px; font-style:italic;">Oben (Bonus ≥63 → +35)</td>` +
            order.map(p => `<td style="padding:6px; text-align:center; font-style:italic;">${state.upper_sums[p.nickname] ?? 0}</td>`).join('');
        table.appendChild(bonusTr);

        state.lower_ids.forEach(c => addRow(c, state.category_names[c]));

        // Total row
        const totalTr = document.createElement('tr');
        totalTr.style.cssText = 'border-top:2px solid var(--primary); font-weight:800;';
        totalTr.innerHTML = `<td style="padding:6px; color:var(--primary);">Gesamt</td>` +
            order.map(p => `<td style="padding:6px; text-align:center; color:var(--primary);">${state.totals[p.nickname] ?? 0}</td>`).join('');
        table.appendChild(totalTr);

        card.appendChild(table);
        return card;
    }

    renderFinished(state) {
        const isCreator = (state.creator_id === this.app.sessionId);
        const iWon = state.winner === this.app.sessionId;
        if (iWon) this.app.sound('win');
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex; flex-direction:column; gap:16px; width:100%; max-width:480px; padding:12px; align-items:center;';
        const overlay = document.createElement('div');
        overlay.className = 'game-info-overlay';
        let title = 'Vorbei!', sub = '';
        if (state.winner === 'draw') { sub = 'Unentschieden!'; }
        else if (iWon) { title = '🎉 Gewonnen!'; sub = 'Höchste Punktzahl!'; }
        else { sub = `${state.winner_name} hat gewonnen.`; }
        overlay.innerHTML = `<div class="game-info-overlay-title" style="${iWon ? 'color:#4CAF50;' : ''}">${title}</div><div class="game-info-overlay-subtitle">${sub}</div>`;
        wrapper.appendChild(overlay);
        wrapper.appendChild(this.buildScorecard(state, false));
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

window.KniffelController = KniffelController;
