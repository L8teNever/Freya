/**
 * Freya Core Web Application Orchestrator
 */
class FreyaApp {
    constructor() {
        this.sessionId = this.getOrCreateSessionId();
        this.nickname = localStorage.getItem('freya_nickname') || '';
        this.currentGroupId = null;
        this.socket = null;
        
        // Active Game Session variables
        this.activeGameSessionId = null;
        this.gameController = null;
        this.gameState = null; // Last received group state
        this.selectedGameForChallenge = null;
        this.activeReceivedChallenge = null;
        this.isReconnecting = false;
        
        // Bind UI Elements
        this.initializeUIElements();
        
        // Listeners for routing
        window.addEventListener('popstate', (e) => this.handleRouting());
    }

    initializeUIElements() {
        // Theme init
        const savedTheme = localStorage.getItem('freya_theme') || 'dark';
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-theme');
            document.getElementById('theme-icon').textContent = 'light_mode';
        } else {
            document.body.classList.remove('dark-theme');
            document.getElementById('theme-icon').textContent = 'dark_mode';
        }
    }

    init() {
        this.handleRouting();
        this.checkRecentGroups();
    }

    getOrCreateSessionId() {
        let sid = localStorage.getItem('freya_session_id');
        if (!sid) {
            sid = 'user_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            localStorage.setItem('freya_session_id', sid);
        }
        return sid;
    }

    // --- Theme Control ---
    toggleTheme() {
        const isDark = document.body.classList.toggle('dark-theme');
        localStorage.setItem('freya_theme', isDark ? 'dark' : 'light');
        document.getElementById('theme-icon').textContent = isDark ? 'light_mode' : 'dark_mode';
        this.showToast(isDark ? 'Dunkles Design aktiviert' : 'Helles Design aktiviert');
    }

    // --- Routing ---
    handleRouting() {
        const path = window.location.pathname;
        const groupMatch = path.match(/^\/group\/([a-zA-Z0-9_-]+)$/);
        
        if (groupMatch) {
            const groupId = groupMatch[1];
            this.currentGroupId = groupId;
            this.enterGroupRoom();
        } else {
            this.currentGroupId = null;
            this.activeGameSessionId = null;
            this.disconnectWebSocket();
            this.showScreen('screen-lobby');
            document.getElementById('page-title').textContent = 'Freya Games';
            document.getElementById('mobile-back-btn').style.display = 'none';
            
            // Disable navigation to group tab
            document.getElementById('nav-group-btn').disabled = true;
            document.getElementById('bottom-group-btn').disabled = true;
            document.getElementById('nav-group-btn').classList.remove('active');
            document.getElementById('bottom-group-btn').classList.remove('active');
            
            document.querySelector('.nav-destination:first-child').classList.add('active');
            document.querySelector('.bottom-nav-item:first-child').classList.add('active');
            this.checkRecentGroups();
        }
    }

    navigate(path) {
        window.history.pushState({}, '', path);
        this.handleRouting();
    }

    handleBack() {
        this.navigate('/');
    }

    navigateToLobby() {
        this.navigate('/');
    }

    navigateToGroup() {
        if (this.currentGroupId) {
            this.navigate(`/group/${this.currentGroupId}`);
        }
    }

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
    }

    // --- Local Persistence & Group Recovery ---
    saveGroupToCache(groupId) {
        let groups = [];
        try {
            groups = JSON.parse(localStorage.getItem('freya_recent_groups')) || [];
        } catch (e) {
            groups = [];
        }
        if (!groups.includes(groupId)) {
            groups.unshift(groupId);
        }
        groups = groups.slice(0, 5); // Cache last 5 groups
        localStorage.setItem('freya_recent_groups', JSON.stringify(groups));
    }

    removeGroupFromCache(groupId) {
        let groups = [];
        try {
            groups = JSON.parse(localStorage.getItem('freya_recent_groups')) || [];
        } catch (e) {
            groups = [];
        }
        groups = groups.filter(g => g !== groupId);
        localStorage.setItem('freya_recent_groups', JSON.stringify(groups));
        this.checkRecentGroups();
    }

    async checkRecentGroups() {
        let groups = [];
        try {
            groups = JSON.parse(localStorage.getItem('freya_recent_groups')) || [];
        } catch (e) {
            groups = [];
        }

        const recentCard = document.getElementById('recent-groups-card');
        const recentList = document.getElementById('recent-groups-list');
        
        if (groups.length === 0) {
            recentCard.style.display = 'none';
            return;
        }

        recentList.innerHTML = '';
        let hasActiveGroups = false;

        for (const gid of groups) {
            try {
                const res = await fetch(`/api/group/${gid}/info`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.exists) {
                        hasActiveGroups = true;
                        
                        const item = document.createElement('div');
                        item.className = 'recent-group-item';
                        
                        const membersStr = data.players.map(p => p.nickname).join(', ') || 'Keine Mitglieder';
                        
                        item.innerHTML = `
                            <div class="recent-group-info">
                                <span class="recent-group-id">${gid}</span>
                                <span class="recent-group-players">${membersStr}</span>
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <button class="icon-btn text-primary" style="color: var(--error) !important;" onclick="event.stopPropagation(); app.removeGroupFromCache('${gid}')">
                                    <span class="material-symbols-rounded">delete</span>
                                </button>
                                <button class="btn btn-tonal" onclick="app.navigate('/group/${gid}')">
                                    Beitreten
                                </button>
                            </div>
                        `;
                        recentList.appendChild(item);
                    }
                }
            } catch (err) {
                console.error("Error verifying recent group:", err);
            }
        }

        recentCard.style.display = hasActiveGroups ? 'flex' : 'none';
    }

    // --- Group Creation & Joining Flow ---
    generateSecureGroupId() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        const randomValues = new Uint32Array(256);
        window.crypto.getRandomValues(randomValues);
        for (let i = 0; i < 256; i++) {
            result += chars[randomValues[i] % chars.length];
        }
        return result;
    }

    createNewGroup() {
        const randomId = this.generateSecureGroupId();
        this.navigate(`/group/${randomId}`);
    }

    enterGroupRoom() {
        // Show Navigation tabs
        const navGroupBtn = document.getElementById('nav-group-btn');
        const bottomGroupBtn = document.getElementById('bottom-group-btn');
        navGroupBtn.disabled = false;
        bottomGroupBtn.disabled = false;
        
        // Toggle Active styles
        document.querySelectorAll('.nav-destination').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.bottom-nav-item').forEach(b => b.classList.remove('active'));
        navGroupBtn.classList.add('active');
        bottomGroupBtn.classList.add('active');
        
        document.getElementById('page-title').textContent = `Gruppe: ${this.currentGroupId}`;
        document.getElementById('mobile-back-btn').style.display = 'flex';
        
        this.showScreen('screen-group');
        this.saveGroupToCache(this.currentGroupId);
        
        // Reset active workspace state
        this.activeGameSessionId = null;
        document.getElementById('group-lobby-workspace').style.display = 'block';
        document.getElementById('group-active-game-workspace').style.display = 'none';

        // Make sure user has nickname
        if (!this.nickname) {
            this.showNicknameModal(false);
        } else {
            this.setupUserChip();
            this.connectWebSocket();
        }

        this.setupShareInformation();
    }

    setupShareInformation() {
        const shareUrl = window.location.href;
        document.getElementById('share-link-input').value = shareUrl;
        
        // Load QR code from dynamic QR API
        const qrImg = document.getElementById('qr-code-image');
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareUrl)}`;
    }

    copyShareLink() {
        const copyText = document.getElementById('share-link-input');
        copyText.select();
        copyText.setSelectionRange(0, 99999);
        navigator.clipboard.writeText(copyText.value)
            .then(() => this.showToast('Link kopiert!'))
            .catch(() => this.showToast('Kopieren fehlgeschlagen'));
    }

    // --- Nickname Modal ---
    showNicknameModal(isCancelable) {
        const modal = document.getElementById('nickname-modal');
        const cancelBtn = document.getElementById('nickname-cancel-btn');
        const input = document.getElementById('nickname-input');
        
        document.getElementById('nickname-modal-title').textContent = this.nickname ? 'Spitznamen ändern' : 'Spitznamen wählen';
        input.value = this.nickname;
        
        if (isCancelable) {
            cancelBtn.style.display = 'block';
        } else {
            cancelBtn.style.display = 'none';
        }
        
        modal.classList.add('active');
        input.focus();
    }

    closeNicknameModal() {
        document.getElementById('nickname-modal').classList.remove('active');
    }

    submitNickname() {
        const input = document.getElementById('nickname-input');
        const val = input.value.trim();
        if (!val) {
            this.showToast('Bitte gib einen gültigen Spitznamen ein.');
            return;
        }
        
        this.nickname = val;
        localStorage.setItem('freya_nickname', val);
        this.setupUserChip();
        this.closeNicknameModal();
        
        // Connect/Reconnect WebSocket to propagate new nickname
        this.connectWebSocket();
    }

    setupUserChip() {
        const chip = document.getElementById('user-profile-chip');
        const nameText = document.getElementById('user-chip-name');
        
        if (this.nickname) {
            nameText.textContent = this.nickname;
            chip.style.display = 'flex';
        } else {
            chip.style.display = 'none';
        }
    }

    // --- WebSocket Connection ---
    connectWebSocket() {
        if (!this.currentGroupId || !this.nickname) return;
        
        this.disconnectWebSocket();

        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const url = `${protocol}://${window.location.host}/ws/group/${this.currentGroupId}/${this.sessionId}/${encodeURIComponent(this.nickname)}`;
        
        this.socket = new WebSocket(url);
        
        this.socket.onopen = () => {
            console.log('WebSocket connected');
            this.isReconnecting = false;
        };
        
        this.socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'state_update') {
                this.handleStateUpdate(data.state);
            }
        };
        
        this.socket.onclose = (e) => {
            console.log('WebSocket closed', e.reason);
            if (this.currentGroupId && !this.isReconnecting) {
                this.isReconnecting = true;
                setTimeout(() => this.connectWebSocket(), 3000);
            }
        };
        
        this.socket.onerror = (err) => {
            console.error('WebSocket error:', err);
        };
    }

    disconnectWebSocket() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }

    // --- Game Action Senders ---
    sendGameAction(action) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN && this.activeGameSessionId) {
            const payload = {
                type: "game_action",
                game_session_id: this.activeGameSessionId,
                action: action
            };
            this.socket.send(JSON.stringify(payload));
        }
    }

    sendGameJoin(gameSessionId) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: "game_join",
                game_session_id: gameSessionId
            }));
            // Make sure we are viewing the game we just joined
            if (this.activeGameSessionId !== gameSessionId) {
                this.enterActiveGameView(gameSessionId);
            }
        }
    }

    // --- State Handler ---
    handleStateUpdate(state) {
        this.gameState = state;

        // 1. Update Group Members list
        const playersList = document.getElementById('group-player-list');
        playersList.innerHTML = '';
        state.players.forEach(p => {
            const li = document.createElement('li');
            li.className = `player-item ${p.is_active ? 'active' : 'inactive'}`;
            li.innerHTML = `
                <div class="player-item-info">
                    <span class="player-status-dot"></span>
                    <span>${p.nickname} ${p.session_id === this.sessionId ? '(Du)' : ''}</span>
                </div>
            `;
            playersList.appendChild(li);
        });

        // Update alone guidance banner if user is alone
        const aloneGuideContainer = document.getElementById('alone-guide-container');
        const activePlayersCount = state.players.filter(p => p.is_active).length;
        if (activePlayersCount === 1) {
            aloneGuideContainer.innerHTML = `
                <div class="alone-guide-banner" style="background-color: var(--primary-container); color: var(--on-primary-container); padding: 16px; border-radius: 20px; display: flex; align-items: center; gap: 12px; margin-bottom: 20px; border: 1px solid var(--outline-variant);">
                    <span class="material-symbols-rounded" style="font-size: 32px; color: var(--primary);">info</span>
                    <div>
                        <strong style="display: block; font-size: 15px; margin-bottom: 2px;">Du bist noch allein in der Gruppe</strong>
                        <span style="font-size: 13px; opacity: 0.9;">Scanne den QR-Code links oder kopiere den Einladungs-Link, um deine Freunde einzuladen. Sobald sie beitreten, kannst du sie hier herausfordern!</span>
                    </div>
                </div>
            `;
        } else {
            aloneGuideContainer.innerHTML = '';
        }

        // 2. Render Catalog Grid (if not empty/already filled)
        const catalogGrid = document.getElementById('games-catalog-grid');
        catalogGrid.innerHTML = '';
        state.games_catalog.forEach(game => {
            const card = document.createElement('div');
            card.className = 'game-catalog-card';
            card.innerHTML = `
                <div class="game-catalog-card-header">
                    <span class="material-symbols-rounded game-catalog-icon">${game.icon}</span>
                    <span class="game-catalog-title">${game.name}</span>
                </div>
                <p class="game-catalog-desc">${game.description}</p>
                <div style="display:flex; justify-content: space-between; align-items:center;">
                    <span class="game-catalog-badge ${game.is_playable ? 'playable' : 'placeholder'}">
                        ${game.is_playable ? 'Spielbar' : 'In Kürze'}
                    </span>
                    <button class="btn btn-primary btn-small" onclick="app.openChallengeSendModal('${game.id}')">
                        Einladen
                    </button>
                </div>
            `;
            catalogGrid.appendChild(card);
        });

        // 3. Update active concurrent games list in sidebar
        const activeGamesList = document.getElementById('group-active-games-list');
        activeGamesList.innerHTML = '';
        
        const sessions = Object.keys(state.active_games);
        if (sessions.length === 0) {
            activeGamesList.innerHTML = '<li class="no-games-placeholder">Keine laufenden Matches</li>';
        } else {
            sessions.forEach(sessId => {
                const gState = state.active_games[sessId];
                const li = document.createElement('li');
                li.className = 'active-game-item';
                
                const playersStr = gState.players.map(p => p.nickname).join(' vs ');
                const isUserInGame = gState.players.some(p => p.session_id === this.sessionId);
                
                const actionLabel = isUserInGame ? 'Spielen' : 'Zuschauen';
                const actionIcon = isUserInGame ? 'play_arrow' : 'visibility';
                const canJoin = !isUserInGame && gState.joinable;

                li.innerHTML = `
                    <div class="active-game-meta">
                        <span>${this.getGameDisplayName(gState.game_type)}</span>
                        <span style="font-size: 11px; text-transform: uppercase;">${gState.status}</span>
                    </div>
                    <div class="active-game-players">${playersStr}</div>
                    <div class="active-game-actions">
                        ${isUserInGame && gState.status === 'finished' ? `
                            <button class="btn btn-text" style="color: var(--error);" onclick="app.triggerCloseGame('${sessId}')">
                                Schließen
                            </button>
                        ` : ''}
                        ${canJoin ? `
                            <button class="btn btn-primary" onclick="app.sendGameJoin('${sessId}')">
                                <span class="material-symbols-rounded" style="font-size: 16px;">person_add</span>
                                Mitspielen
                            </button>
                        ` : ''}
                        <button class="btn btn-tonal" onclick="app.enterActiveGameView('${sessId}')">
                            <span class="material-symbols-rounded" style="font-size: 16px;">${actionIcon}</span>
                            ${actionLabel}
                        </button>
                    </div>
                `;
                activeGamesList.appendChild(li);
            });
        }

        // 4. Update the Active Game workspace if currently showing a game
        if (this.activeGameSessionId) {
            const activeSessionState = state.active_games[this.activeGameSessionId];
            if (!activeSessionState) {
                // The game was closed or disappeared
                this.exitActiveGameView();
                this.showToast('Das Spiel wurde geschlossen.');
            } else {
                this.renderGameSession(activeSessionState);
                this.renderDisputeFor(activeSessionState);
            }
        }

        // 5. Handle incoming/pending challenges
        this.checkPendingChallenges(state.challenges);
    }

    getGameDisplayName(gameType) {
        const names = {
            "tictactoe": "Tic-Tac-Toe",
            "carddraw": "Karten ziehen",
            "stadtlandfluss": "Stadt Land Fluss",
            "wortkette": "Wortkette",
            "bombe": "Bombe",
            "bingo": "Bingo",
            "zweiwahrheiten": "2 Wahrheiten, 1 Lüge",
            "werbinich": "Wer bin ich?",
            "kniffel": "Kniffel",
            "aerger": "Mensch ärgere dich nicht"
        };
        return names[gameType] || gameType;
    }

    // --- Challenge System ---
    openChallengeSendModal(gameId) {
        this.selectedGameForChallenge = gameId;
        const modal = document.getElementById('challenge-send-modal');
        const list = document.getElementById('challenge-player-select-list');
        list.innerHTML = '';

        // Filter active group members that are not the current user
        const otherPlayers = this.gameState.players.filter(p => p.session_id !== this.sessionId && p.is_active);
        
        if (otherPlayers.length === 0) {
            list.innerHTML = '<p class="no-players-text">Keine anderen Spieler online.<br>Teile den QR-Code, um Freunde einzuladen!</p>';
        } else {
            otherPlayers.forEach(p => {
                const item = document.createElement('div');
                item.className = 'player-select-item';
                item.innerHTML = `
                    <span class="player-select-name">${p.nickname}</span>
                    <button class="btn btn-primary" onclick="app.sendChallengeInvitation('${p.session_id}')">
                        Einladen
                    </button>
                `;
                list.appendChild(item);
            });
        }

        modal.classList.add('active');
    }

    closeChallengeSendModal() {
        document.getElementById('challenge-send-modal').classList.remove('active');
        this.selectedGameForChallenge = null;
    }

    sendChallengeInvitation(targetSessionId) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN && this.selectedGameForChallenge) {
            this.socket.send(JSON.stringify({
                type: 'challenge_send',
                target_id: targetSessionId,
                game_type: this.selectedGameForChallenge
            }));
            this.showToast('Einladung gesendet!');
        }
        this.closeChallengeSendModal();
    }

    checkPendingChallenges(challenges) {
        // Check if there is a pending challenge targeting this user
        const myChallenge = challenges.find(ch => ch.target_id === this.sessionId && ch.status === 'pending');
        
        const modal = document.getElementById('challenge-received-modal');
        
        if (myChallenge) {
            this.activeReceivedChallenge = myChallenge;
            const text = document.getElementById('challenge-received-text');
            text.innerHTML = `<strong>${myChallenge.challenger_name}</strong> lädt dich zu einer Runde <strong>${this.getGameDisplayName(myChallenge.game_type)}</strong> ein.`;
            modal.classList.add('active');
        } else {
            this.activeReceivedChallenge = null;
            modal.classList.remove('active');
        }
    }

    respondToChallenge(response) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN && this.activeReceivedChallenge) {
            this.socket.send(JSON.stringify({
                type: 'challenge_respond',
                challenge_id: this.activeReceivedChallenge.challenge_id,
                response: response
            }));
            
            document.getElementById('challenge-received-modal').classList.remove('active');
            
            if (response === 'accept') {
                const gameSessionId = `game_${this.activeReceivedChallenge.challenge_id}`;
                // Small delay to let server set up game state before entering view
                setTimeout(() => {
                    this.enterActiveGameView(gameSessionId);
                }, 150);
            }
            
            this.activeReceivedChallenge = null;
        }
    }

    // --- Game Workspace Switcher ---
    enterActiveGameView(gameSessionId) {
        this.activeGameSessionId = gameSessionId;
        
        document.getElementById('group-lobby-workspace').style.display = 'none';
        
        const workspaceCard = document.getElementById('group-active-game-workspace');
        workspaceCard.style.display = 'flex';
        
        // Read game state
        if (this.gameState && this.gameState.active_games[gameSessionId]) {
            const gState = this.gameState.active_games[gameSessionId];
            document.getElementById('game-title').textContent = this.getGameDisplayName(gState.game_type);
            this.renderGameSession(gState);
        }
    }

    exitActiveGameView() {
        this.activeGameSessionId = null;
        document.getElementById('group-lobby-workspace').style.display = 'block';
        document.getElementById('group-active-game-workspace').style.display = 'none';
    }

    triggerCloseGame(gameSessionId) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'game_close',
                game_session_id: gameSessionId
            }));
        }
    }

    renderGameSession(gState) {
        const gameContainer = document.getElementById('game-container');
        
        if (gState.game_type === 'tictactoe') {
            if (!this.gameController || this.gameController.type !== 'tictactoe') {
                this.gameController = new TicTacToeController(this, gameContainer);
            }
            this.gameController.render(gState);
        } else if (gState.game_type === 'stadtlandfluss') {
            if (!this.gameController || this.gameController.type !== 'stadtlandfluss') {
                this.gameController = new StadtLandFlussController(this, gameContainer);
            }
            this.gameController.render(gState);
        } else if (gState.game_type === 'wortkette') {
            if (!this.gameController || this.gameController.type !== 'wortkette') {
                this.gameController = new WortketteController(this, gameContainer);
            }
            this.gameController.render(gState);
        } else if (gState.game_type === 'bombe') {
            if (!this.gameController || this.gameController.type !== 'bombe') {
                this.gameController = new BombeController(this, gameContainer);
            }
            this.gameController.render(gState);
        } else if (gState.game_type === 'bingo') {
            if (!this.gameController || this.gameController.type !== 'bingo') {
                this.gameController = new BingoController(this, gameContainer);
            }
            this.gameController.render(gState);
        } else if (gState.game_type === 'zweiwahrheiten') {
            if (!this.gameController || this.gameController.type !== 'zweiwahrheiten') {
                this.gameController = new ZweiWahrheitenController(this, gameContainer);
            }
            this.gameController.render(gState);
        } else if (gState.game_type === 'werbinich') {
            if (!this.gameController || this.gameController.type !== 'werbinich') {
                this.gameController = new WerBinIchController(this, gameContainer);
            }
            this.gameController.render(gState);
        } else if (gState.game_type === 'kniffel') {
            if (!this.gameController || this.gameController.type !== 'kniffel') {
                this.gameController = new KniffelController(this, gameContainer);
            }
            this.gameController.render(gState);
        } else if (gState.game_type === 'aerger') {
            if (!this.gameController || this.gameController.type !== 'aerger') {
                this.gameController = new AergerController(this, gameContainer);
            }
            this.gameController.render(gState);
        } else if (gState.game_type === 'carddraw') {
            this.renderCardDrawGame(gState);
        } else {
            // Placeholder simulation
            if (!this.gameController || this.gameController.constructor.name !== 'PlaceholderGame') {
                this.gameController = new PlaceholderGame('game-container', this);
            }
            this.gameController.render(gState, this.sessionId);
        }
    }

    renderCardDrawGame(gState) {
        const container = document.getElementById('game-container');
        container.innerHTML = '';
        
        const isMyTurn = gState.status === 'playing'; // Card draw is instant
        
        const board = document.createElement('div');
        board.className = 'carddraw-board';
        
        let headerHtml = `<h4 style="font-weight:600; color:var(--primary);">Karten gezinkt!</h4>`;
        if (gState.status === 'finished') {
            if (gState.winner === 'draw') {
                headerHtml = `<h4 style="font-weight:700; color:var(--primary);">Unentschieden!</h4>`;
            } else if (gState.winner === this.sessionId) {
                headerHtml = `<h4 style="font-weight:700; color:#4CAF50;">Gewonnen! Du hast die höchste Karte.</h4>`;
            } else {
                headerHtml = `<h4 style="font-weight:700; color:var(--error);">${gState.winner_name} hat gewonnen!</h4>`;
            }
        }
        
        let scoresHtml = '';
        Object.keys(gState.scores).forEach(name => {
            scoresHtml += `
                <div class="carddraw-score-row">
                    <span>${name}</span>
                    <span class="carddraw-score-val">${gState.scores[name]}</span>
                </div>
            `;
        });

        const isPlayer = gState.players.some(p => p.session_id === this.sessionId);
        let actionBtnHtml = '';
        if (isPlayer) {
            actionBtnHtml = `
                <button class="btn btn-primary" onclick="app.sendGameAction({type: 'restart'})">
                    Nochmal ziehen
                </button>
            `;
        }
        
        board.innerHTML = `
            ${headerHtml}
            <div class="carddraw-scores-list">
                ${scoresHtml}
            </div>
            <div style="margin-top:10px;">
                ${actionBtnHtml}
            </div>
        `;
        container.appendChild(board);
    }

    // --- Sound (respects Schulmodus) ---
    sound(name) {
        if (window.Sound) window.Sound.play(name);
    }

    // --- Dispute / Anfechten (shared across all games) ---
    startDispute(targetId, subject) {
        const reason = window.prompt(`"${subject}" anfechten — kurze Begründung (optional):`, '');
        if (reason === null) return; // cancelled
        if (this.socket && this.socket.readyState === WebSocket.OPEN && this.activeGameSessionId) {
            this.socket.send(JSON.stringify({
                type: 'game_action',
                game_session_id: this.activeGameSessionId,
                action: { type: 'dispute_open', target_id: targetId, subject: subject || '', reason: reason || '' }
            }));
            this.showToast('Anfechtung gestartet – die Gruppe stimmt ab.');
        }
    }

    openDisputePicker() {
        if (!this.activeGameSessionId || !this.gameState) return;
        const gState = this.gameState.active_games[this.activeGameSessionId];
        if (!gState || !gState.players) return;
        const others = gState.players.filter(p => p.session_id !== this.sessionId);
        if (others.length === 0) { this.showToast('Niemand zum Anfechten da.'); return; }
        const modal = document.getElementById('dispute-picker-modal');
        const list = document.getElementById('dispute-picker-list');
        list.innerHTML = '';
        others.forEach(p => {
            const item = document.createElement('div');
            item.className = 'player-select-item';
            item.innerHTML = `<span class="player-select-name">${p.nickname}</span>`;
            const btn = document.createElement('button');
            btn.className = 'btn btn-primary';
            btn.textContent = 'Anfechten';
            btn.addEventListener('click', () => {
                document.getElementById('dispute-picker-modal').classList.remove('active');
                this.startDispute(p.session_id, p.nickname);
            });
            item.appendChild(btn);
            list.appendChild(item);
        });
        modal.classList.add('active');
    }

    closeDisputePicker() {
        document.getElementById('dispute-picker-modal').classList.remove('active');
    }

    sendDisputeAction(action) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN && this.activeGameSessionId) {
            this.socket.send(JSON.stringify({
                type: 'game_action',
                game_session_id: this.activeGameSessionId,
                action: action
            }));
        }
    }

    renderDisputeFor(gState) {
        const modal = document.getElementById('dispute-modal');
        const dispute = gState.dispute;

        if (!dispute) {
            modal.classList.remove('active');
            this._lastResolvedDispute = null;
            return;
        }

        if (dispute.status === 'resolved') {
            modal.classList.remove('active');
            // Show verdict once
            if (this._lastResolvedDispute !== dispute.id) {
                this._lastResolvedDispute = dispute.id;
                const verdict = dispute.upheld
                    ? `Angefochten bestätigt: "${dispute.subject}" von ${dispute.target_name} war ungültig.`
                    : `Abstimmung: "${dispute.subject}" von ${dispute.target_name} bleibt gültig.`;
                this.showToast(verdict);
                this.sound('notify');
            }
            return;
        }

        // status open
        const iAmParticipant = gState.players.some(p => p.session_id === this.sessionId && p.is_active);
        const iAmTarget = dispute.target_id === this.sessionId;
        const alreadyVoted = (dispute.voter_ids || []).includes(this.sessionId);

        document.getElementById('dispute-text').innerHTML =
            `<strong>${dispute.opener_name}</strong> ficht an: <strong>"${dispute.subject}"</strong> von <strong>${dispute.target_name}</strong> sei ungültig.` +
            (dispute.reason ? `<br><span style="font-size:13px; color:var(--on-surface-variant);">Grund: ${dispute.reason}</span>` : '') +
            `<br><span style="font-size:13px; margin-top:8px; display:inline-block;">👍 gültig: ${dispute.valid_count} · 👎 ungültig: ${dispute.invalid_count} (von ${dispute.eligible_count})</span>`;

        const actions = document.getElementById('dispute-actions');
        actions.innerHTML = '';
        if (iAmParticipant && !iAmTarget && !alreadyVoted) {
            const yes = document.createElement('button');
            yes.className = 'btn btn-tonal'; yes.style.color = '#4CAF50';
            yes.innerHTML = '👍 Ist gültig';
            yes.addEventListener('click', () => this.sendDisputeAction({ type: 'dispute_vote', value: true }));
            const no = document.createElement('button');
            no.className = 'btn btn-primary'; no.style.background = 'var(--error)';
            no.innerHTML = '👎 Ist ungültig';
            no.addEventListener('click', () => this.sendDisputeAction({ type: 'dispute_vote', value: false }));
            actions.appendChild(yes); actions.appendChild(no);
        } else {
            const note = document.createElement('p');
            note.style.cssText = 'font-size:13px; color:var(--on-surface-variant); text-align:center; width:100%;';
            note.textContent = iAmTarget ? 'Über dich wird gerade abgestimmt...' : (alreadyVoted ? 'Deine Stimme ist abgegeben. Warte auf die anderen...' : 'Die Mitspieler stimmen ab...');
            actions.appendChild(note);
        }
        // Opener/host can cancel
        if (dispute.opener_id === this.sessionId) {
            const cancel = document.createElement('button');
            cancel.className = 'btn btn-text';
            cancel.textContent = 'Zurückziehen';
            cancel.addEventListener('click', () => this.sendDisputeAction({ type: 'dispute_dismiss' }));
            actions.appendChild(cancel);
        }
        modal.classList.add('active');
    }

    // --- Settings & Schulmodus ---
    openSettings() {
        const modal = document.getElementById('settings-modal');
        document.getElementById('settings-name-input').value = this.nickname || '';
        document.getElementById('settings-school-toggle').checked = (localStorage.getItem('freya_school_mode') === 'true');
        document.getElementById('settings-mute-toggle').checked = (localStorage.getItem('freya_muted') === 'true');
        modal.classList.add('active');
    }

    closeSettings() {
        document.getElementById('settings-modal').classList.remove('active');
    }

    saveSettings() {
        const newName = document.getElementById('settings-name-input').value.trim();
        const school = document.getElementById('settings-school-toggle').checked;
        const muted = document.getElementById('settings-mute-toggle').checked;

        if (window.Sound) { window.Sound.setSchoolMode(school); window.Sound.setMuted(muted); }

        let nameChanged = false;
        if (newName && newName !== this.nickname) {
            this.nickname = newName;
            localStorage.setItem('freya_nickname', newName);
            this.setupUserChip();
            nameChanged = true;
        }
        this.closeSettings();
        this.showToast(school ? 'Gespeichert · Schulmodus an (kein Ton)' : 'Einstellungen gespeichert');
        if (nameChanged && this.currentGroupId) this.connectWebSocket();
    }

    // --- Toast Alert ---
    showToast(message) {
        const toast = document.getElementById('toast');
        document.getElementById('toast-text').textContent = message;
        toast.classList.add('active');
        
        setTimeout(() => {
            toast.classList.remove('active');
        }, 3000);
    }
}

// Instantiate Global Application
const app = new FreyaApp();
window.onload = () => app.init();
