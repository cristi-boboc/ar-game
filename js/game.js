/**
 * Game - Core game engine managing balloons, physics, collisions, and rendering.
 *
 * The host is authoritative: it spawns balloons and validates pops.
 * All players share the same balloon set (synced via Network).
 */

class Balloon {
    constructor(id, x, speed, color, size) {
        this.id = id;
        this.x = x;          // 0-1 normalised
        this.y = -0.1;        // starts above screen
        this.speed = speed;    // normalised units / second
        this.color = color;
        this.size = size;      // normalised radius
        this.alive = true;
        this.poppedBy = null;
        this.wobbleOffset = Math.random() * Math.PI * 2;
        this.wobbleSpeed = 1.5 + Math.random();
        this.wobbleAmount = 0.008 + Math.random() * 0.006;
    }
}

class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // State
        this.balloons = new Map();
        this.players = new Map();       // playerId -> { name, score, color }
        this.popEffects = [];
        this.clapEffects = [];
        this.isRunning = false;
        this.isHost = false;

        // Timing
        this.gameDuration = 60;         // seconds
        this.timeRemaining = this.gameDuration;
        this.gameTime = 0;
        this.startTime = 0;
        this.lastFrameTime = 0;
        this.lastSpawnTime = 0;
        this.balloonIdCounter = 0;

        // Hand overlay data (set externally by App)
        this.handData = null;

        // Callbacks
        this.onBalloonSpawn = null;
        this.onGameOver = null;
        this.onTimeUpdate = null;
        this.onScoreUpdate = null;

        // Palette
        this.playerColors = [
            '#ff6b6b', '#4d96ff', '#6bcb77', '#ffd93d',
            '#a855f7', '#f97316', '#06b6d4', '#ec4899'
        ];
        this.balloonColors = [
            '#ff6b6b', '#ff8e8e', '#ffd93d', '#ffe66d',
            '#6bcb77', '#95d5b2', '#4d96ff', '#74b9ff',
            '#a855f7', '#c084fc', '#f97316', '#fb923c',
            '#ec4899', '#f472b6', '#06b6d4', '#22d3ee'
        ];

        this._resizeCanvas();
        this._boundResize = () => this._resizeCanvas();
        window.addEventListener('resize', this._boundResize);
    }

    /* ==================== SETUP ==================== */

    _resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    addPlayer(playerId, playerName) {
        if (this.players.has(playerId)) return;
        const idx = this.players.size % this.playerColors.length;
        this.players.set(playerId, {
            name: playerName,
            score: 0,
            color: this.playerColors[idx]
        });
    }

    removePlayer(playerId) {
        this.players.delete(playerId);
    }

    /* ==================== GAME LIFECYCLE ==================== */

    start(isHost) {
        this.isHost = isHost;
        this.isRunning = true;
        this.startTime = performance.now();
        this.lastFrameTime = this.startTime;
        this.lastSpawnTime = 0;
        this.gameTime = 0;
        this.timeRemaining = this.gameDuration;
        this.balloons.clear();
        this.popEffects = [];
        this.clapEffects = [];
        this.balloonIdCounter = 0;

        for (const [, player] of this.players) {
            player.score = 0;
        }

        this._gameLoop();
    }

    stop() {
        this.isRunning = false;
    }

    _gameLoop() {
        if (!this.isRunning) return;

        const now = performance.now();
        const dt = Math.min((now - this.lastFrameTime) / 1000, 0.1); // cap to avoid jumps
        this.lastFrameTime = now;
        this.gameTime = (now - this.startTime) / 1000;
        this.timeRemaining = Math.max(0, this.gameDuration - this.gameTime);

        if (this.onTimeUpdate) this.onTimeUpdate(Math.ceil(this.timeRemaining));

        if (this.timeRemaining <= 0) {
            this.isRunning = false;
            if (this.onGameOver) this.onGameOver(this.getScores());
            // Final render
            this._render(dt);
            return;
        }

        // Spawn (host only)
        if (this.isHost) {
            // Gradually increase spawn rate from every 1.5s down to 0.4s
            const spawnInterval = Math.max(0.4, 1.5 - (this.gameTime / this.gameDuration) * 1.1);
            if (this.gameTime - this.lastSpawnTime >= spawnInterval) {
                this._spawnBalloon();
                this.lastSpawnTime = this.gameTime;
            }
        }

        this._updateBalloons(dt);
        this._updateEffects(dt);
        this._render(dt);

        requestAnimationFrame(() => this._gameLoop());
    }

    /* ==================== BALLOONS ==================== */

    _spawnBalloon() {
        const id = ++this.balloonIdCounter;
        const x = 0.1 + Math.random() * 0.8;
        const speed = 0.08 + Math.random() * 0.08;
        const color = this.balloonColors[Math.floor(Math.random() * this.balloonColors.length)];
        const size = 0.035 + Math.random() * 0.02;

        const balloon = new Balloon(id, x, speed, color, size);
        this.balloons.set(id, balloon);

        if (this.onBalloonSpawn) {
            this.onBalloonSpawn({ id, x, speed, color, size });
        }
    }

    /** Called on clients when the host broadcasts a new balloon */
    addBalloon(data) {
        const balloon = new Balloon(data.id, data.x, data.speed, data.color, data.size);
        this.balloons.set(data.id, balloon);
    }

    _updateBalloons(dt) {
        for (const [id, b] of this.balloons) {
            if (!b.alive) continue;
            b.y += b.speed * dt;
            // Gentle sideways wobble
            b.x += Math.sin(this.gameTime * b.wobbleSpeed + b.wobbleOffset) * b.wobbleAmount * dt;
            // Remove if fallen off screen
            if (b.y > 1.3) {
                this.balloons.delete(id);
            }
        }
    }

    /**
     * Check which alive balloons are near the given normalised (x, y) clap point.
     * Returns an array of balloon IDs hit.
     */
    checkPop(clapX, clapY) {
        const hitRadius = 0.08;
        const hits = [];
        for (const [id, b] of this.balloons) {
            if (!b.alive) continue;
            const dx = clapX - b.x;
            const dy = clapY - b.y;
            if (Math.sqrt(dx * dx + dy * dy) < hitRadius + b.size) {
                hits.push(id);
            }
        }
        return hits;
    }

    /**
     * Pop a balloon and credit a player. Returns true if the balloon was still alive.
     */
    popBalloon(balloonId, playerId) {
        const b = this.balloons.get(balloonId);
        if (!b || !b.alive) return false;

        b.alive = false;
        b.poppedBy = playerId;

        this.popEffects.push({
            x: b.x, y: b.y,
            color: b.color,
            size: b.size,
            time: 0, duration: 0.45
        });

        const player = this.players.get(playerId);
        if (player) {
            player.score++;
            if (this.onScoreUpdate) this.onScoreUpdate(this.getScores());
        }

        // Clean up after animation
        setTimeout(() => this.balloons.delete(balloonId), 500);
        return true;
    }

    /** Visual feedback for a clap (whether or not it hit a balloon) */
    addClapEffect(x, y, hit) {
        this.clapEffects.push({
            x, y, hit,
            time: 0, duration: 0.35
        });
    }

    /* ==================== SCORES ==================== */

    getScores() {
        const list = [];
        for (const [id, p] of this.players) {
            list.push({ playerId: id, name: p.name, score: p.score, color: p.color });
        }
        return list.sort((a, b) => b.score - a.score);
    }

    setScores(scores) {
        for (const s of scores) {
            const p = this.players.get(s.playerId);
            if (p) p.score = s.score;
        }
    }

    /* ==================== EFFECTS ==================== */

    _updateEffects(dt) {
        this.popEffects = this.popEffects.filter(e => { e.time += dt; return e.time < e.duration; });
        this.clapEffects = this.clapEffects.filter(e => { e.time += dt; return e.time < e.duration; });
    }

    /* ==================== RENDERING ==================== */

    _render(dt) {
        const ctx = this.ctx;
        const W = this.canvas.width;
        const H = this.canvas.height;
        ctx.clearRect(0, 0, W, H);

        // 1. Draw hand skeleton
        if (this.handData) {
            this._drawHands(this.handData);
        }

        // 2. Draw balloons
        for (const [, b] of this.balloons) {
            if (b.alive) this._drawBalloon(b);
        }

        // 3. Draw pop effects
        for (const e of this.popEffects) this._drawPopEffect(e);

        // 4. Draw clap effects
        for (const e of this.clapEffects) this._drawClapEffect(e);
    }

    _drawBalloon(b) {
        const ctx = this.ctx;
        const W = this.canvas.width;
        const H = this.canvas.height;
        const x = b.x * W;
        const y = b.y * H;
        const r = b.size * W;

        ctx.save();

        // Soft shadow
        ctx.shadowColor = 'rgba(0,0,0,0.25)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 6;

        // Oval body
        ctx.beginPath();
        ctx.ellipse(x, y, r * 0.85, r, 0, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.05, x, y, r);
        grad.addColorStop(0, this._lighten(b.color, 50));
        grad.addColorStop(0.6, b.color);
        grad.addColorStop(1, this._darken(b.color, 30));
        ctx.fillStyle = grad;
        ctx.fill();

        // Shine
        ctx.shadowColor = 'transparent';
        ctx.beginPath();
        ctx.ellipse(x - r * 0.25, y - r * 0.35, r * 0.14, r * 0.24, -0.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fill();

        // Knot
        ctx.beginPath();
        ctx.moveTo(x - 3, y + r);
        ctx.lineTo(x, y + r + 7);
        ctx.lineTo(x + 3, y + r);
        ctx.closePath();
        ctx.fillStyle = this._darken(b.color, 40);
        ctx.fill();

        // String
        ctx.beginPath();
        ctx.moveTo(x, y + r + 7);
        ctx.quadraticCurveTo(x + 8, y + r + 28, x - 4, y + r + 48);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore();
    }

    _drawPopEffect(e) {
        const ctx = this.ctx;
        const x = e.x * this.canvas.width;
        const y = e.y * this.canvas.height;
        const p = e.time / e.duration; // 0 → 1
        const r = e.size * this.canvas.width;

        ctx.save();
        ctx.globalAlpha = 1 - p;

        // Particles
        const n = 10;
        for (let i = 0; i < n; i++) {
            const angle = (i / n) * Math.PI * 2 + e.time * 4;
            const dist = r * (1 + p * 3);
            const px = x + Math.cos(angle) * dist;
            const py = y + Math.sin(angle) * dist;
            const sz = (1 - p) * 7;
            ctx.beginPath();
            ctx.arc(px, py, sz, 0, Math.PI * 2);
            ctx.fillStyle = e.color;
            ctx.fill();
        }

        // Expanding ring
        ctx.beginPath();
        ctx.arc(x, y, r * (1 + p * 3.5), 0, Math.PI * 2);
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 3 * (1 - p);
        ctx.stroke();

        ctx.restore();
    }

    _drawClapEffect(e) {
        const ctx = this.ctx;
        const x = e.x * this.canvas.width;
        const y = e.y * this.canvas.height;
        const p = e.time / e.duration;

        ctx.save();
        ctx.globalAlpha = 1 - p;
        ctx.beginPath();
        ctx.arc(x, y, 20 + p * 60, 0, Math.PI * 2);
        ctx.strokeStyle = e.hit ? '#6bcb77' : 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 3 * (1 - p);
        ctx.stroke();
        ctx.restore();
    }

    _drawHands(data) {
        const ctx = this.ctx;
        const W = this.canvas.width;
        const H = this.canvas.height;

        const CONNECTIONS = [
            [0,1],[1,2],[2,3],[3,4],
            [0,5],[5,6],[6,7],[7,8],
            [5,9],[9,10],[10,11],[11,12],
            [9,13],[13,14],[14,15],[15,16],
            [13,17],[17,18],[18,19],[19,20],
            [0,17]
        ];

        for (const hand of data.landmarks) {
            // Bones
            ctx.strokeStyle = 'rgba(0, 255, 128, 0.45)';
            ctx.lineWidth = 2;
            for (const [a, b] of CONNECTIONS) {
                const ax = (1 - hand[a].x) * W, ay = hand[a].y * H;
                const bx = (1 - hand[b].x) * W, by = hand[b].y * H;
                ctx.beginPath();
                ctx.moveTo(ax, ay);
                ctx.lineTo(bx, by);
                ctx.stroke();
            }

            // Joints
            for (const lm of hand) {
                ctx.beginPath();
                ctx.arc((1 - lm.x) * W, lm.y * H, 3.5, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,0.75)';
                ctx.fill();
            }
        }

        // Draw guide line between palms when both visible
        if (data.leftPalm && data.rightPalm) {
            const lx = (1 - data.leftPalm.x) * W, ly = data.leftPalm.y * H;
            const rx = (1 - data.rightPalm.x) * W, ry = data.rightPalm.y * H;
            const dist = Math.sqrt((lx - rx) ** 2 + (ly - ry) ** 2);
            const close = dist < W * 0.08;

            ctx.save();
            ctx.setLineDash([6, 6]);
            ctx.strokeStyle = close ? 'rgba(255, 80, 80, 0.8)' : 'rgba(255, 255, 100, 0.4)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(lx, ly);
            ctx.lineTo(rx, ry);
            ctx.stroke();
            ctx.setLineDash([]);

            // Midpoint indicator
            const mx = (lx + rx) / 2, my = (ly + ry) / 2;
            ctx.beginPath();
            ctx.arc(mx, my, close ? 18 : 12, 0, Math.PI * 2);
            ctx.strokeStyle = close ? 'rgba(255, 80, 80, 0.7)' : 'rgba(255, 255, 100, 0.35)';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
        }
    }

    /* ==================== COLOUR HELPERS ==================== */

    _lighten(hex, pct) {
        const n = parseInt(hex.slice(1), 16);
        const a = Math.round(2.55 * pct);
        const R = Math.min(255, (n >> 16) + a);
        const G = Math.min(255, ((n >> 8) & 0xff) + a);
        const B = Math.min(255, (n & 0xff) + a);
        return '#' + ((1 << 24) | (R << 16) | (G << 8) | B).toString(16).slice(1);
    }

    _darken(hex, pct) {
        const n = parseInt(hex.slice(1), 16);
        const a = Math.round(2.55 * pct);
        const R = Math.max(0, (n >> 16) - a);
        const G = Math.max(0, ((n >> 8) & 0xff) - a);
        const B = Math.max(0, (n & 0xff) - a);
        return '#' + ((1 << 24) | (R << 16) | (G << 8) | B).toString(16).slice(1);
    }
}
