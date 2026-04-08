/**
 * App - Main controller tying together HandTracker, Network, Game, and SoundManager.
 *
 * Uses squeeze (fist) gesture to pop balloons. Popped balloons fly away with
 * magic trails, bounce off edges, then explode with sound effects.
 * Background music plays during the game.
 */
class App {
    constructor() {
        this.handTracker = new HandTracker();
        this.network = new Network();
        this.game = new Game(document.getElementById('gameCanvas'));
        this.sound = new SoundManager();

        // Screens
        this.screens = {
            menu: document.getElementById('menuScreen'),
            lobby: document.getElementById('lobbyScreen'),
            game: document.getElementById('gameHUD'),
            results: document.getElementById('resultsScreen')
        };

        // Elements
        this.el = {
            nameInput:         document.getElementById('nameInput'),
            hostBtn:           document.getElementById('hostBtn'),
            joinBtn:           document.getElementById('joinBtn'),
            joinForm:          document.getElementById('joinForm'),
            codeInput:         document.getElementById('codeInput'),
            connectBtn:        document.getElementById('connectBtn'),
            roomCode:          document.getElementById('roomCode'),
            playerList:        document.getElementById('playerList'),
            startBtn:          document.getElementById('startBtn'),
            waitingText:       document.getElementById('waitingText'),
            timer:             document.getElementById('timer'),
            scores:            document.getElementById('scores'),
            handStatus:        document.getElementById('handStatus'),
            countdownOverlay:  document.getElementById('countdownOverlay'),
            countdownNumber:   document.getElementById('countdownNumber'),
            winner:            document.getElementById('winner'),
            finalScores:       document.getElementById('finalScores'),
            playAgainBtn:      document.getElementById('playAgainBtn'),
            loadingOverlay:    document.getElementById('loadingOverlay'),
            loadingText:       document.getElementById('loadingText'),
            camera:            document.getElementById('camera')
        };

        this.currentScreen = 'menu';
        this.playerName = '';
        this.players = new Map();
        this.cameraInitialized = false;

        this.el.nameInput.value = 'Player' + Math.floor(Math.random() * 9000 + 1000);

        this._bindEvents();
    }

    /* ==================== EVENT BINDING ==================== */

    _bindEvents() {
        this.el.hostBtn.addEventListener('click', () => this._onHost());
        this.el.joinBtn.addEventListener('click', () => this._toggleJoinForm());
        this.el.connectBtn.addEventListener('click', () => this._onJoin());
        this.el.startBtn.addEventListener('click', () => this._onStartGame());
        this.el.playAgainBtn.addEventListener('click', () => this._backToMenu());

        this.el.codeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this._onJoin();
        });
        this.el.codeInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
        });

        // Unlock audio on first user interaction
        const unlockAudio = () => {
            this.sound.init();
            this.sound.unlock();
        };
        document.addEventListener('click', unlockAudio, { once: true });
        document.addEventListener('touchstart', unlockAudio, { once: true });
    }

    /* ==================== SCREEN MANAGEMENT ==================== */

    _showScreen(name) {
        for (const s of Object.values(this.screens)) s.classList.remove('active');
        this.screens[name].classList.add('active');
        this.currentScreen = name;
    }

    _showLoading(text) {
        this.el.loadingText.textContent = text;
        this.el.loadingOverlay.classList.remove('hidden');
    }

    _hideLoading() {
        this.el.loadingOverlay.classList.add('hidden');
    }

    /* ==================== CAMERA INIT ==================== */

    async _initCamera() {
        if (this.cameraInitialized) return true;

        this._showLoading('Starting camera & hand tracking...');

        try {
            await this.handTracker.init(this.el.camera);

            this.handTracker.onSqueeze = (pt) => this._handleSqueeze(pt);
            this.handTracker.onHandsUpdate = (landmarks, squeezeInfo) => {
                this.game.handData = { landmarks, squeezeInfo };
                if (this.currentScreen === 'game') {
                    this._updateHandStatus(landmarks.length, squeezeInfo);
                }
            };

            this.cameraInitialized = true;
            this._hideLoading();
            return true;
        } catch (err) {
            console.error('Camera init failed:', err);
            this.el.loadingText.textContent =
                'Camera access required. Please allow camera access and reload the page.';
            return false;
        }
    }

    /* ==================== MENU ACTIONS ==================== */

    _getPlayerName() {
        const v = this.el.nameInput.value.trim();
        this.playerName = v || 'Player' + Math.floor(Math.random() * 9000 + 1000);
        return this.playerName;
    }

    async _onHost() {
        this._getPlayerName();
        this.sound.init();
        this.sound.unlock();
        if (!(await this._initCamera())) return;

        this._showLoading('Creating room...');

        try {
            const code = await this.network.hostGame(this.playerName);
            this._setupHostCallbacks();

            this.game.addPlayer('host', this.playerName);
            this.players.set('host', { name: this.playerName });

            this.el.roomCode.textContent = code;
            this.el.startBtn.classList.remove('hidden');
            this.el.waitingText.classList.add('hidden');
            this._renderPlayerList();

            this._hideLoading();
            this._showScreen('lobby');
        } catch (err) {
            console.error('Host failed:', err);
            this.el.loadingText.textContent = 'Failed to create room. Try again.';
            setTimeout(() => this._hideLoading(), 2500);
        }
    }

    _toggleJoinForm() {
        this.el.joinForm.classList.toggle('hidden');
        if (!this.el.joinForm.classList.contains('hidden')) {
            this.el.codeInput.focus();
        }
    }

    async _onJoin() {
        const code = this.el.codeInput.value.trim();
        if (code.length !== 5) {
            alert('Please enter a valid 5-digit room code.');
            return;
        }

        this._getPlayerName();
        this.sound.init();
        this.sound.unlock();
        if (!(await this._initCamera())) return;

        this._showLoading('Joining room ' + code + '...');

        try {
            await this.network.joinGame(code, this.playerName);
            this._setupClientCallbacks();

            this.el.roomCode.textContent = code;
            this.el.startBtn.classList.add('hidden');
            this.el.waitingText.classList.remove('hidden');
            this.el.waitingText.textContent = 'Waiting for host to start...';

            this._hideLoading();
            this._showScreen('lobby');
        } catch (err) {
            console.error('Join failed:', err);
            this.el.loadingText.textContent = 'Could not join. Check the code and try again.';
            setTimeout(() => this._hideLoading(), 2500);
        }
    }

    /* ==================== NETWORK CALLBACKS (HOST) ==================== */

    _setupHostCallbacks() {
        this.network.onPlayerJoined = (id, name) => {
            this.game.addPlayer(id, name);
            this.players.set(id, { name });
            this._renderPlayerList();
            this._broadcastPlayerList();
        };

        this.network.onPlayerLeft = (id) => {
            this.game.removePlayer(id);
            this.players.delete(id);
            this._renderPlayerList();
            this._broadcastPlayerList();
        };

        this.network.onMessage = (data) => this._handleHostMessage(data);
    }

    _broadcastPlayerList() {
        const list = [];
        for (const [id] of this.players) {
            const gp = this.game.players.get(id);
            list.push({ id, name: gp ? gp.name : '?', color: gp ? gp.color : '#fff' });
        }
        this.network.broadcast({ type: 'player-list', players: list });
    }

    _handleHostMessage(data) {
        if (data.type === 'pop-attempt') {
            const ok = this.game.popBalloon(data.balloonId, data.playerId);
            if (ok) {
                this.sound.playPop();
                this.network.broadcast({
                    type: 'balloon-popped',
                    balloonId: data.balloonId,
                    playerId: data.playerId,
                    scores: this.game.getScores()
                });
                this._renderScores();
            }
        }
    }

    /* ==================== NETWORK CALLBACKS (CLIENT) ==================== */

    _setupClientCallbacks() {
        this.network.onMessage = (data) => this._handleClientMessage(data);
        this.network.onDisconnected = () => {
            alert('Disconnected from host.');
            this._backToMenu();
        };
    }

    _handleClientMessage(data) {
        switch (data.type) {
            case 'player-list':
                this.players.clear();
                this.game.players.clear();
                for (const p of data.players) {
                    this.players.set(p.id, { name: p.name });
                    this.game.addPlayer(p.id, p.name);
                }
                this._renderPlayerList();
                break;

            case 'game-start':
                this.game.players.clear();
                for (const p of data.players) {
                    this.game.addPlayer(p.id, p.name);
                }
                if (!this.game.players.has(this.network.playerId)) {
                    this.game.addPlayer(this.network.playerId, this.playerName);
                }
                this._runCountdownThenStart();
                break;

            case 'balloon-spawn':
                this.game.addBalloon(data.balloon);
                break;

            case 'balloon-popped':
                this.game.popBalloon(data.balloonId, data.playerId);
                this.sound.playPop();
                if (data.scores) this.game.setScores(data.scores);
                this._renderScores();
                break;

            case 'score-update':
                this.game.setScores(data.scores);
                this._renderScores();
                break;

            case 'game-over':
                this._endGame(data.scores);
                break;
        }
    }

    /* ==================== GAME START ==================== */

    _onStartGame() {
        const playerList = [];
        for (const [id] of this.players) {
            const gp = this.game.players.get(id);
            playerList.push({ id, name: gp ? gp.name : '?', color: gp ? gp.color : '#fff' });
        }
        this.network.broadcast({ type: 'game-start', players: playerList });
        this._runCountdownThenStart();
    }

    _runCountdownThenStart() {
        this._showScreen('game');
        this.el.countdownOverlay.classList.remove('hidden');

        let count = 3;
        this.el.countdownNumber.textContent = count;

        const tick = () => {
            count--;
            if (count > 0) {
                this.el.countdownNumber.textContent = count;
                this.el.countdownNumber.style.animation = 'none';
                void this.el.countdownNumber.offsetHeight;
                this.el.countdownNumber.style.animation = '';
                setTimeout(tick, 800);
            } else {
                this.el.countdownNumber.textContent = 'GO!';
                this.el.countdownNumber.style.animation = 'none';
                void this.el.countdownNumber.offsetHeight;
                this.el.countdownNumber.style.animation = '';
                setTimeout(() => {
                    this.el.countdownOverlay.classList.add('hidden');
                    this._beginGame();
                }, 600);
            }
        };

        setTimeout(tick, 800);
    }

    _beginGame() {
        // Balloon spawn
        this.game.onBalloonSpawn = (d) => {
            if (this.network.isHost) {
                this.network.broadcast({ type: 'balloon-spawn', balloon: d });
            }
        };

        // Game over
        this.game.onGameOver = (scores) => {
            this.sound.stopMusic();
            if (this.network.isHost) {
                this.network.broadcast({ type: 'game-over', scores });
            }
            this._endGame(scores);
        };

        // Timer
        this.game.onTimeUpdate = (t) => {
            this.el.timer.textContent = t;
            if (t <= 10) {
                this.el.timer.classList.add('warning');
            } else {
                this.el.timer.classList.remove('warning');
            }
        };

        // Scores
        this.game.onScoreUpdate = () => this._renderScores();

        // Sound callbacks from game engine
        this.game.onBounce = () => this.sound.playBounce();
        this.game.onFinalPop = () => this.sound.playExplode();
        this.game.onSparkle = () => this.sound.playSparkle();

        this._renderScores();

        // Start background music
        this.sound.init();
        this.sound.unlock();
        this.sound.startMusic();

        this.game.start(this.network.isHost);
    }

    /* ==================== SQUEEZE HANDLING ==================== */

    _handleSqueeze(squeezePoint) {
        if (this.currentScreen !== 'game' || !this.game.isRunning) return;

        // Mirror x because camera CSS is flipped
        const mx = 1 - squeezePoint.x;
        const my = squeezePoint.y;

        const hits = this.game.checkPop(mx, my);

        // Visual feedback
        this.game.addSqueezeEffect(mx, my, hits.length > 0);

        if (this.network.isHost) {
            for (const id of hits) {
                const ok = this.game.popBalloon(id, 'host');
                if (ok) {
                    this.sound.playPop();
                    this.sound.playScore();
                    this.network.broadcast({
                        type: 'balloon-popped',
                        balloonId: id,
                        playerId: 'host',
                        scores: this.game.getScores()
                    });
                    this._renderScores();
                }
            }
        } else {
            for (const id of hits) {
                this.network.sendToHost({
                    type: 'pop-attempt',
                    balloonId: id,
                    playerId: this.network.playerId
                });
                // Optimistic local pop for responsiveness
                this.sound.playPop();
            }
        }
    }

    /* ==================== UI HELPERS ==================== */

    _updateHandStatus(count, squeezeInfo) {
        const el = this.el.handStatus;
        if (count === 0) {
            el.textContent = 'Show your hands to the camera!';
            el.style.opacity = '1';
        } else {
            // Check if any hand is making a fist
            const anyFist = squeezeInfo && Object.values(squeezeInfo).some(h => !h.open);
            if (anyFist) {
                el.textContent = 'Move your fist near a balloon!';
                el.style.opacity = '0.7';
            } else {
                el.textContent = 'Make a fist near a balloon to pop it!';
                el.style.opacity = '0.4';
            }
        }
    }

    _renderPlayerList() {
        let html = '';
        for (const [id, p] of this.players) {
            const gp = this.game.players.get(id);
            const color = gp ? gp.color : '#888';
            html += `<div class="player-item">
                <div class="player-dot" style="background:${color}"></div>
                <span class="player-name">${this._esc(p.name)}</span>
                ${id === 'host' ? '<span class="player-host">HOST</span>' : ''}
            </div>`;
        }
        this.el.playerList.innerHTML = html;
    }

    _renderScores() {
        const scores = this.game.getScores();
        let html = '';
        for (const s of scores) {
            html += `<div class="score-item">
                <div class="score-dot" style="background:${s.color}"></div>
                <span>${this._esc(s.name)}: ${s.score}</span>
            </div>`;
        }
        this.el.scores.innerHTML = html;
    }

    _endGame(scores) {
        this.game.stop();
        this.sound.stopMusic();

        if (scores && scores.length > 0) {
            if (scores.length > 1 && scores[0].score === scores[1].score) {
                this.el.winner.textContent = "It's a tie!";
            } else {
                this.el.winner.textContent = scores[0].name + ' wins!';
            }
            this.el.winner.style.borderColor = scores[0].color;
        } else {
            this.el.winner.textContent = 'No scores';
        }

        let html = '';
        const medals = ['#ffd93d', '#c0c0c0', '#cd7f32'];
        (scores || []).forEach((s, i) => {
            html += `<div class="final-score-item">
                <span class="final-score-rank" style="color:${medals[i] || '#fff'}">#${i + 1}</span>
                <span class="final-score-name">${this._esc(s.name)}</span>
                <span class="final-score-value">${s.score}</span>
            </div>`;
        });
        this.el.finalScores.innerHTML = html;

        this._showScreen('results');
    }

    _backToMenu() {
        this.game.stop();
        this.sound.stopMusic();
        this.network.destroy();
        this.players.clear();
        this.game.players.clear();
        this.game.balloons.clear();
        this.game.flyingBalloons = [];
        this.network = new Network();
        this.el.joinForm.classList.add('hidden');
        this.el.timer.classList.remove('warning');
        this._showScreen('menu');
    }

    _esc(text) {
        const d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }
}

/* ==================== BOOTSTRAP ==================== */
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
