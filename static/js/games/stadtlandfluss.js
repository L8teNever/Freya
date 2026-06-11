/**
 * Stadt Land Fluss Game Controller
 */
class StadtLandFlussController {
    constructor(app, container) {
        this.app = app;
        this.container = container;
        this.type = 'stadtlandfluss';
        
        this.localAnswers = {};
        this.currentLetter = "";
        this.currentStatus = "";
        this.timerInterval = null;
    }

    render(state) {
        // Stop timer if status changed
        if (state.status !== this.currentStatus || state.letter !== this.currentLetter) {
            this.clearIntervals();
            this.currentStatus = state.status;
            this.currentLetter = state.letter;
            
            // Re-render full DOM container when state transitions
            this.container.innerHTML = '';
            
            if (state.status === "setup") {
                this.renderSetup(state);
            } else if (state.status === "playing") {
                this.renderPlaying(state);
            } else if (state.status === "voting") {
                this.renderVoting(state);
            } else if (state.status === "finished") {
                this.renderFinished(state);
            }
        } else {
            // State is the same status, only update dynamic parts (like timer or live votes)
            if (state.status === "playing") {
                this.updateTimer(state.time_left);
            } else if (state.status === "voting") {
                this.updateVotingDisplay(state);
            }
        }
    }

    clearIntervals() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    // --- SETUP PHASE ---
    renderSetup(state) {
        const isCreator = (state.creator_id === this.app.sessionId);
        
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
            <h3 style="font-size: 22px; font-weight: 700; color: var(--primary);">Stadt Land Fluss Setup</h3>
            <p style="font-size: 13px; color: var(--on-surface-variant);">
                ${isCreator ? 'Konfiguriere das Spiel für deine Gruppe' : 'Warte auf den Host, um das Spiel zu starten...'}
            </p>
        `;
        wrapper.appendChild(header);

        // Predefined categories lists
        const defaultCategories = ["Stadt", "Land", "Fluss", "Name", "Tier", "Beruf", "Pflanze", "Lebensmittel", "Automarke"];

        const categoriesCard = document.createElement('div');
        categoriesCard.className = 'card';
        categoriesCard.innerHTML = `
            <div class="card-header">
                <span class="material-symbols-rounded card-icon">category</span>
                <h3>Kategorien</h3>
            </div>
            <div id="setup-categories-list" style="display: flex; flex-wrap: wrap; gap: 8px;"></div>
        `;
        wrapper.appendChild(categoriesCard);

        const listDiv = categoriesCard.querySelector('#setup-categories-list');
        
        defaultCategories.forEach(cat => {
            const isChecked = state.categories.includes(cat);
            const badge = document.createElement('div');
            badge.style.padding = '8px 16px';
            badge.style.borderRadius = '100px';
            badge.style.border = '1px solid var(--outline)';
            badge.style.cursor = isCreator ? 'pointer' : 'default';
            badge.style.fontSize = '14px';
            badge.style.fontWeight = '500';
            
            if (isChecked) {
                badge.style.backgroundColor = 'var(--primary-container)';
                badge.style.color = 'var(--on-primary-container)';
                badge.style.borderColor = 'var(--primary)';
            } else {
                badge.style.backgroundColor = 'transparent';
                badge.style.color = 'var(--on-surface-variant)';
            }

            if (isCreator) {
                badge.addEventListener('click', () => {
                    let newCats = [...state.categories];
                    if (isChecked) {
                        newCats = newCats.filter(c => c !== cat);
                    } else {
                        newCats.push(cat);
                    }
                    this.sendConfiguration(newCats, state.duration);
                });
            }

            badge.textContent = cat;
            listDiv.appendChild(badge);
        });

        // Add custom category field for creator
        if (isCreator) {
            const customInputWrapper = document.createElement('div');
            customInputWrapper.style.display = 'flex';
            customInputWrapper.style.gap = '8px';
            customInputWrapper.style.marginTop = '12px';
            
            customInputWrapper.innerHTML = `
                <input id="custom-cat-input" type="text" placeholder="Eigene Kategorie..." style="flex-grow: 1; padding: 10px 14px; border-radius: 12px; border: 1px solid var(--outline); background: transparent; color: var(--on-background); font-size: 14px; outline: none;">
                <button class="btn btn-tonal" id="add-custom-cat-btn" style="padding: 0 16px;">Hinzufügen</button>
            `;
            categoriesCard.appendChild(customInputWrapper);

            const input = customInputWrapper.querySelector('#custom-cat-input');
            const btn = customInputWrapper.querySelector('#add-custom-cat-btn');

            const handleAdd = () => {
                const val = input.value.trim();
                if (val && !state.categories.includes(val)) {
                    const newCats = [...state.categories, val];
                    this.sendConfiguration(newCats, state.duration);
                    input.value = '';
                }
            };
            btn.addEventListener('click', handleAdd);
            input.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleAdd(); });
        }

        // Duration selector
        const durationCard = document.createElement('div');
        durationCard.className = 'card';
        durationCard.innerHTML = `
            <div class="card-header">
                <span class="material-symbols-rounded card-icon">timer</span>
                <h3>Rundenzeit</h3>
            </div>
            <div style="display: flex; gap: 12px; align-items: center;">
                <select id="duration-select" ${isCreator ? '' : 'disabled'} style="flex-grow: 1; padding: 12px; border-radius: 12px; border: 1px solid var(--outline); background: var(--surface); color: var(--on-background); outline: none;">
                    <option value="30">30 Sekunden</option>
                    <option value="60">60 Sekunden</option>
                    <option value="90">90 Sekunden</option>
                    <option value="120">120 Sekunden</option>
                    <option value="180">3 Minuten</option>
                </select>
            </div>
        `;
        wrapper.appendChild(durationCard);

        const select = durationCard.querySelector('#duration-select');
        select.value = state.duration.toString();
        if (isCreator) {
            select.addEventListener('change', (e) => {
                this.sendConfiguration(state.categories, parseInt(e.target.value));
            });
        }

        // Creator start button
        if (isCreator) {
            const startBtn = document.createElement('button');
            startBtn.className = 'btn btn-primary btn-large';
            startBtn.style.width = '100%';
            startBtn.innerHTML = '<span class="material-symbols-rounded">play_arrow</span> Spiel starten';
            startBtn.addEventListener('click', () => {
                this.app.sendGameAction({ type: "start_round" });
            });
            wrapper.appendChild(startBtn);
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

    sendConfiguration(categories, duration) {
        this.app.sendGameAction({
            type: 'configure',
            categories: categories,
            duration: duration
        });
    }

    // --- GAMEPLAY PHASE ---
    renderPlaying(state) {
        this.localAnswers = {};
        
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.gap = '20px';
        wrapper.style.width = '100%';
        wrapper.style.maxWidth = '480px';
        wrapper.style.padding = '12px';

        // Header showing chosen letter and timer
        const statusRow = document.createElement('div');
        statusRow.style.display = 'flex';
        statusRow.style.justifyContent = 'space-between';
        statusRow.style.alignItems = 'center';
        statusRow.style.backgroundColor = 'var(--surface)';
        statusRow.style.padding = '14px 20px';
        statusRow.style.borderRadius = '20px';
        statusRow.style.border = '1px solid var(--outline-variant)';
        
        statusRow.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <span style="font-size: 13px; font-weight: bold; text-transform: uppercase; color: var(--on-surface-variant);">Buchstabe:</span>
                <span id="playing-letter" style="font-size: 36px; font-weight: 900; color: var(--primary);">${state.letter}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span class="material-symbols-rounded" style="color: var(--primary);">timer</span>
                <span id="playing-timer" style="font-size: 20px; font-weight: 700; font-family: monospace;">--:--</span>
            </div>
        `;
        wrapper.appendChild(statusRow);

        // Inputs for each category
        const inputsCard = document.createElement('div');
        inputsCard.className = 'card';
        inputsCard.style.gap = '14px';
        
        state.categories.forEach((cat, idx) => {
            const field = document.createElement('div');
            field.className = 'text-field';
            field.innerHTML = `
                <input class="stadtlandfluss-input" type="text" tabindex="${idx + 1}" id="input-cat-${idx}" placeholder="Begriff mit ${state.letter}..." style="font-size: 15px; padding: 12px;">
                <label for="input-cat-${idx}">${cat}</label>
            `;
            
            const input = field.querySelector('input');
            input.addEventListener('input', (e) => {
                this.localAnswers[cat] = e.target.value.trim();
            });

            inputsCard.appendChild(field);
        });

        wrapper.appendChild(inputsCard);

        // Stop early button
        const stopBtn = document.createElement('button');
        stopBtn.className = 'btn btn-primary';
        stopBtn.style.backgroundColor = 'var(--error)';
        stopBtn.style.color = '#FFFFFF';
        stopBtn.style.width = '100%';
        stopBtn.innerHTML = '<span class="material-symbols-rounded">stop</span> Runde stoppen!';
        stopBtn.addEventListener('click', () => {
            this.app.sendGameAction({
                type: 'stop_round',
                answers: this.localAnswers
            });
        });
        wrapper.appendChild(stopBtn);

        this.container.appendChild(wrapper);

        // Initial timer setup
        this.updateTimer(state.time_left);
    }

    updateTimer(secondsLeft) {
        const timerEl = document.getElementById('playing-timer');
        if (!timerEl) return;
        
        const m = Math.floor(secondsLeft / 60);
        const s = secondsLeft % 60;
        timerEl.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

        if (secondsLeft <= 0) {
            // Automatically submit answers when timer expires
            this.clearIntervals();
            this.app.sendGameAction({
                type: 'submit_answers',
                answers: this.localAnswers
            });
        }
    }

    // --- VOTING PHASE ---
    renderVoting(state) {
        const isCreator = (state.creator_id === this.app.sessionId);
        
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.gap = '20px';
        wrapper.style.width = '100%';
        wrapper.style.maxWidth = '600px';
        wrapper.style.padding = '12px';

        const header = document.createElement('div');
        header.style.textAlign = 'center';
        header.innerHTML = `
            <h3 style="font-size: 20px; font-weight: 700; color: var(--primary);">Abstimmungs-Phase</h3>
            <p style="font-size: 13px; color: var(--on-surface-variant);">
                Klicke auf den roten Daumen, wenn ein Begriff ungültig ist. Standardmäßig gilt alles als richtig.
            </p>
            <div style="font-size: 24px; font-weight: 900; margin-top: 8px; color: var(--primary);">Buchstabe: ${state.letter}</div>
        `;
        wrapper.appendChild(header);

        // Build list of voting items grouped by category
        const votingContainer = document.createElement('div');
        votingContainer.id = 'voting-entries-list';
        votingContainer.style.display = 'flex';
        votingContainer.style.flexDirection = 'column';
        votingContainer.style.gap = '16px';
        wrapper.appendChild(votingContainer);

        this.container.appendChild(wrapper);

        // Render detailed votes
        this.updateVotingDisplay(state);

        // End voting button for Host/Creator
        if (isCreator) {
            const endBtn = document.createElement('button');
            endBtn.className = 'btn btn-primary btn-large';
            endBtn.style.width = '100%';
            endBtn.innerHTML = '<span class="material-symbols-rounded">check</span> Abstimmung beenden & auswerten';
            endBtn.addEventListener('click', () => {
                this.app.sendGameAction({ type: 'finish_voting' });
            });
            wrapper.appendChild(endBtn);
        } else {
            const waitingText = document.createElement('div');
            waitingText.style.textAlign = 'center';
            waitingText.style.padding = '16px 0';
            waitingText.style.fontSize = '14px';
            waitingText.style.color = 'var(--on-surface-variant)';
            waitingText.style.fontWeight = '500';
            waitingText.textContent = 'Warte darauf, dass der Host die Abstimmung beendet...';
            wrapper.appendChild(waitingText);
        }
    }

    updateVotingDisplay(state) {
        const container = document.getElementById('voting-entries-list');
        if (!container) return;
        container.innerHTML = '';

        state.categories.forEach(cat => {
            const catCard = document.createElement('div');
            catCard.className = 'card';
            catCard.style.padding = '16px';
            catCard.style.gap = '12px';

            catCard.innerHTML = `
                <h4 style="font-weight: 700; color: var(--primary); font-size: 16px; border-bottom: 1px solid var(--outline-variant); padding-bottom: 6px;">${cat}</h4>
                <div class="voting-rows-container" style="display: flex; flex-direction: column; gap: 8px;"></div>
            `;
            
            const rowsContainer = catCard.querySelector('.voting-rows-container');

            state.players.forEach(p => {
                const playerAns = state.answers[p.session_id]?.[cat] || '';
                
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.justifyContent = 'space-between';
                row.style.alignItems = 'center';
                row.style.padding = '8px 12px';
                row.style.borderRadius = '12px';
                row.style.backgroundColor = 'var(--surface-variant)';

                const left = document.createElement('div');
                left.style.display = 'flex';
                left.style.flexDirection = 'column';
                left.innerHTML = `
                    <span style="font-size: 11px; color: var(--on-surface-variant); font-weight: 500;">${p.nickname}</span>
                    <span style="font-size: 14px; font-weight: 600; font-family: monospace;">${playerAns ? playerAns : '— (Keine Antwort)'}</span>
                `;
                row.appendChild(left);

                // If this is the current player's own answer, we don't let them vote on it
                if (playerAns && p.session_id !== this.app.sessionId) {
                    const right = document.createElement('div');
                    right.style.display = 'flex';
                    right.style.gap = '8px';

                    // Get current vote cast by this client
                    const currentVoteMap = state.votes[p.session_id]?.[cat] || {};
                    const myVote = currentVoteMap[this.app.sessionId];

                    const yesBtn = document.createElement('button');
                    yesBtn.className = 'icon-btn';
                    yesBtn.innerHTML = '<span class="material-symbols-rounded">thumb_up</span>';
                    yesBtn.style.color = (myVote === true) ? '#4CAF50' : 'var(--on-surface-variant)';
                    yesBtn.style.backgroundColor = (myVote === true) ? 'rgba(76, 175, 80, 0.15)' : 'transparent';
                    yesBtn.addEventListener('click', () => {
                        this.app.sendGameAction({
                            type: 'cast_vote',
                            target_id: p.session_id,
                            category: cat,
                            value: true
                        });
                    });

                    const noBtn = document.createElement('button');
                    noBtn.className = 'icon-btn';
                    noBtn.innerHTML = '<span class="material-symbols-rounded">thumb_down</span>';
                    noBtn.style.color = (myVote === false) ? 'var(--error)' : 'var(--on-surface-variant)';
                    noBtn.style.backgroundColor = (myVote === false) ? 'rgba(242, 184, 181, 0.15)' : 'transparent';
                    noBtn.addEventListener('click', () => {
                        this.app.sendGameAction({
                            type: 'cast_vote',
                            target_id: p.session_id,
                            category: cat,
                            value: false
                        });
                    });

                    right.appendChild(yesBtn);
                    right.appendChild(noBtn);
                    row.appendChild(right);
                } else if (playerAns) {
                    // Own answer or observer: show live vote counts
                    const right = document.createElement('div');
                    right.style.fontSize = '12px';
                    right.style.color = 'var(--on-surface-variant)';
                    
                    const catVotes = state.votes[p.session_id]?.[cat] || {};
                    const yesCount = Object.values(catVotes).filter(v => v === true).length;
                    const noCount = Object.values(catVotes).filter(v => v === false).length;

                    right.innerHTML = `
                        <span style="color:#4CAF50; margin-right:8px;">👍 ${yesCount}</span>
                        <span style="color:var(--error);">👎 ${noCount}</span>
                    `;
                    row.appendChild(right);
                }

                rowsContainer.appendChild(row);
            });

            container.appendChild(catCard);
        });
    }

    // --- FINISHED RESULTS PHASE ---
    renderFinished(state) {
        const isCreator = (state.creator_id === this.app.sessionId);

        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.gap = '20px';
        wrapper.style.width = '100%';
        wrapper.style.maxWidth = '600px';
        wrapper.style.padding = '12px';

        const header = document.createElement('div');
        header.style.textAlign = 'center';
        header.innerHTML = `
            <h3 style="font-size: 22px; font-weight: 700; color: var(--primary);">Ergebnisse</h3>
            <p style="font-size: 13px; color: var(--on-surface-variant);">
                Punkteauswertung für Buchstabe: <strong style="font-size: 16px;">${state.letter}</strong>
            </p>
        `;
        wrapper.appendChild(header);

        // Round points summary table
        const scoresCard = document.createElement('div');
        scoresCard.className = 'card';
        scoresCard.innerHTML = `
            <div class="card-header">
                <span class="material-symbols-rounded card-icon">emoji_events</span>
                <h3>Punktestand</h3>
            </div>
            <div id="finished-scores-list" style="display: flex; flex-direction: column; gap: 8px;"></div>
        `;
        wrapper.appendChild(scoresCard);

        const scoresList = scoresCard.querySelector('#finished-scores-list');
        
        // Sort players by total score
        const sortedPlayers = [...state.players].sort((a,b) => {
            const sa = state.scores[a.nickname] || 0;
            const sb = state.scores[b.nickname] || 0;
            return sb - sa;
        });

        sortedPlayers.forEach(p => {
            const total = state.scores[p.nickname] || 0;
            const round = state.round_scores[p.nickname] || 0;

            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.alignItems = 'center';
            row.style.padding = '10px 16px';
            row.style.borderRadius = '12px';
            row.style.backgroundColor = 'var(--surface-variant)';

            row.innerHTML = `
                <div style="font-weight: 600;">${p.nickname} ${p.session_id === this.app.sessionId ? '(Du)' : ''}</div>
                <div style="font-size: 14px; font-weight: 700;">
                    <span style="color: var(--primary); margin-right: 12px;">+${round} Pkt.</span>
                    <span>Gesamt: ${total} Pkt.</span>
                </div>
            `;
            scoresList.appendChild(row);
        });

        // Detailed Answers matrix
        const detailsCard = document.createElement('div');
        detailsCard.className = 'card';
        detailsCard.innerHTML = `
            <div class="card-header">
                <span class="material-symbols-rounded card-icon">list_alt</span>
                <h3>Antworten Details</h3>
            </div>
            <div id="finished-details-container" style="display: flex; flex-direction: column; gap: 14px; overflow-x: auto;"></div>
        `;
        wrapper.appendChild(detailsCard);

        const detailsContainer = detailsCard.querySelector('#finished-details-container');
        
        state.categories.forEach(cat => {
            const catSection = document.createElement('div');
            catSection.style.display = 'flex';
            catSection.style.flexDirection = 'column';
            catSection.style.gap = '6px';
            
            catSection.innerHTML = `
                <div style="font-size: 14px; font-weight: 700; color: var(--primary);">${cat}</div>
                <div class="cat-rows" style="display: flex; flex-direction: column; gap: 6px; padding-left: 8px;"></div>
            `;
            const catRows = catSection.querySelector('.cat-rows');

            state.players.forEach(p => {
                const res = state.results[p.nickname]?.[cat] || { answer: '—', valid: false, points: 0 };
                
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.justifyContent = 'space-between';
                row.style.fontSize = '13px';
                
                const badgeColor = res.valid ? '#2E7D32' : 'var(--error)';
                const badgeText = res.valid ? 'Gültig' : 'Ungültig';

                row.innerHTML = `
                    <span style="color: var(--on-surface-variant); font-weight: 500;">
                        ${p.nickname}: <strong style="font-family: monospace; color: var(--on-surface); font-size:14px;">"${res.answer ? res.answer : '—'}"</strong>
                    </span>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 4px; background-color: ${badgeColor}22; color: ${badgeColor}; border: 1px solid ${badgeColor}44;">
                            ${badgeText}
                        </span>
                        <span style="font-weight: 700; min-width: 50px; text-align: right;">+${res.points} Pkt.</span>
                    </div>
                `;
                catRows.appendChild(row);
            });

            detailsContainer.appendChild(catSection);
        });

        // Creator restart/next round button
        if (isCreator) {
            const nextRoundBtn = document.createElement('button');
            nextRoundBtn.className = 'btn btn-primary';
            nextRoundBtn.style.width = '100%';
            nextRoundBtn.innerHTML = '<span class="material-symbols-rounded">replay</span> Neue Runde konfigurieren';
            nextRoundBtn.addEventListener('click', () => {
                this.app.sendGameAction({ type: "restart" });
            });
            wrapper.appendChild(nextRoundBtn);
        } else {
            const waitingText = document.createElement('div');
            waitingText.style.textAlign = 'center';
            waitingText.style.padding = '16px 0';
            waitingText.style.fontSize = '14px';
            waitingText.style.color = 'var(--on-surface-variant)';
            waitingText.style.fontWeight = '500';
            waitingText.textContent = 'Warte auf den Host, um eine neue Runde zu starten...';
            wrapper.appendChild(waitingText);
        }

        this.container.appendChild(wrapper);
    }
}

window.StadtLandFlussController = StadtLandFlussController;
