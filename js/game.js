/**
 * Game - Core game engine managing balloons, physics, collisions, and rendering.
 *
 * When a balloon is popped it flies off in a random direction, leaving a magic
 * sparkle trail, bouncing off screen edges, then finally exploding.
 */

class Balloon {
    constructor(id, x, speed, color, size) {
        this.id = id;
        this.x = x;
        this.y = -0.1;
        this.speed = speed;
        this.color = color;
        this.size = size;
        this.alive = true;
        this.poppedBy = null;
        this.wobbleOffset = Math.random() * Math.PI * 2;
        this.wobbleSpeed = 1.5 + Math.random();
        this.wobbleAmount = 0.008 + Math.random() * 0.006;
    }
}

/** A popped balloon that flies away with a trail before its final explosion */
class FlyingBalloon {
    constructor(x, y, color, size) {
        this.x = x;
        this.y = y;
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
        const spd = 0.5 + Math.random() * 0.4;
        this.vx = Math.cos(angle) * spd;
        this.vy = Math.sin(angle) * spd;
        this.color = color;
        this.size = size;
        this.originalSize = size;
        this.bounces = 0;
        this.maxBounces = 3;
        this.time = 0;
        this.maxTime = 1.6;
        this.trail = [];
        this.alive = true;
        this.trailTimer = 0;
        this.sparkleTimer = 0;
        this.rotation = 0;
        this.rotationSpeed = (Math.random() - 0.5) * 12;
    }

    update(dt) {
        this.time += dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vy += 0.15 * dt; // gravity
        this.rotation += this.rotationSpeed * dt;

        // Shrink over time
        const lifeProgress = this.time / this.maxTime;
        this.size = this.originalSize * (1 - lifeProgress * 0.6);

        // Spawn trail particles
        this.trailTimer += dt;
        if (this.trailTimer > 0.02) {
            this.trailTimer = 0;
            const hueShift = (this.time * 200) % 360;
            this.trail.push({
                x: this.x + (Math.random() - 0.5) * this.size * 0.5,
                y: this.y + (Math.random() - 0.5) * this.size * 0.5,
                color: this.color,
                hue: hueShift,
                time: 0,
                duration: 0.5 + Math.random() * 0.3,
                size: this.size * (0.2 + Math.random() * 0.3),
                isStar: Math.random() < 0.4,
                angle: Math.random() * Math.PI * 2
            });
        }

        // Update trail
        this.trail = this.trail.filter(p => { p.time += dt; return p.time < p.duration; });

        // Bounce off edges
        let bounced = false;
        if (this.x < 0.03) { this.vx = Math.abs(this.vx) * 0.75; this.x = 0.03; bounced = true; }
        if (this.x > 0.97) { this.vx = -Math.abs(this.vx) * 0.75; this.x = 0.97; bounced = true; }
        if (this.y < 0.03) { this.vy = Math.abs(this.vy) * 0.75; this.y = 0.03; bounced = true; }
        if (this.y > 0.97) { this.vy = -Math.abs(this.vy) * 0.75; this.y = 0.97; bounced = true; }

        if (bounced) this.bounces++;

        // Check if done
        if (this.time >= this.maxTime || this.bounces > this.maxBounces) {
            this.alive = false;
        }

        // Check sparkle sound timer
        this.sparkleTimer += dt;
        const shouldSparkle = this.sparkleTimer > 0.25;
        if (shouldSparkle) this.sparkleTimer = 0;

        return { bounced, shouldSparkle };
    }
}

class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // State
        this.balloons = new Map();
        this.players = new Map();
        this.flyingBalloons = [];
        this.popEffects = [];
        this.squeezeEffects = [];
        this.isRunning = false;
        this.isHost = false;

        // Timing
        this.gameDuration = 60;
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
        this.onBounce = null;
        this.onFinalPop = null;
        this.onSparkle = null;

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
        this.flyingBalloons = [];
        this.popEffects = [];
        this.squeezeEffects = [];
        this.balloonIdCounter = 0;

        for (const [, p] of this.players) p.score = 0;

        this._gameLoop();
    }

    stop() {
        this.isRunning = false;
    }

    _gameLoop() {
        if (!this.isRunning) return;

        const now = performance.now();
        const dt = Math.min((now - this.lastFrameTime) / 1000, 0.1);
        this.lastFrameTime = now;
        this.gameTime = (now - this.startTime) / 1000;
        this.timeRemaining = Math.max(0, this.gameDuration - this.gameTime);

        if (this.onTimeUpdate) this.onTimeUpdate(Math.ceil(this.timeRemaining));

        if (this.timeRemaining <= 0) {
            this.isRunning = false;
            if (this.onGameOver) this.onGameOver(this.getScores());
            this._render(dt);
            return;
        }

        if (this.isHost) {
            const spawnInterval = Math.max(0.4, 1.5 - (this.gameTime / this.gameDuration) * 1.1);
            if (this.gameTime - this.lastSpawnTime >= spawnInterval) {
                this._spawnBalloon();
                this.lastSpawnTime = this.gameTime;
            }
        }

        this._updateBalloons(dt);
        this._updateFlyingBalloons(dt);
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

    addBalloon(data) {
        const balloon = new Balloon(data.id, data.x, data.speed, data.color, data.size);
        this.balloons.set(data.id, balloon);
    }

    _updateBalloons(dt) {
        for (const [id, b] of this.balloons) {
            if (!b.alive) continue;
            b.y += b.speed * dt;
            b.x += Math.sin(this.gameTime * b.wobbleSpeed + b.wobbleOffset) * b.wobbleAmount * dt;
            if (b.y > 1.3) this.balloons.delete(id);
        }
    }

    /* ==================== FLYING BALLOONS ==================== */

    _updateFlyingBalloons(dt) {
        this.flyingBalloons = this.flyingBalloons.filter(fb => {
            const result = fb.update(dt);

            if (result.bounced && this.onBounce) this.onBounce();
            if (result.shouldSparkle && this.onSparkle) this.onSparkle();

            if (!fb.alive) {
                // Final explosion
                this.popEffects.push({
                    x: fb.x, y: fb.y,
                    color: fb.color,
                    size: fb.originalSize * 1.5,
                    time: 0, duration: 0.55
                });
                if (this.onFinalPop) this.onFinalPop();
                return false;
            }
            return true;
        });
    }

    /* ==================== POP LOGIC ==================== */

    checkPop(px, py) {
        const hitRadius = 0.08;
        const hits = [];
        for (const [id, b] of this.balloons) {
            if (!b.alive) continue;
            const dx = px - b.x;
            const dy = py - b.y;
            if (Math.sqrt(dx * dx + dy * dy) < hitRadius + b.size) {
                hits.push(id);
            }
        }
        return hits;
    }

    /**
     * Pop a balloon: removes it from the field, creates a FlyingBalloon,
     * and credits the player.
     */
    popBalloon(balloonId, playerId) {
        const b = this.balloons.get(balloonId);
        if (!b || !b.alive) return false;

        b.alive = false;

        // Create flying balloon
        this.flyingBalloons.push(new FlyingBalloon(b.x, b.y, b.color, b.size));

        // Remove from map
        this.balloons.delete(balloonId);

        // Update score
        const player = this.players.get(playerId);
        if (player) {
            player.score++;
            if (this.onScoreUpdate) this.onScoreUpdate(this.getScores());
        }

        return true;
    }

    /** Visual feedback for a squeeze attempt */
    addSqueezeEffect(x, y, hit) {
        this.squeezeEffects.push({
            x, y, hit,
            time: 0, duration: 0.4
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
        this.squeezeEffects = this.squeezeEffects.filter(e => { e.time += dt; return e.time < e.duration; });
    }

    /* ==================== RENDERING ==================== */

    _render(dt) {
        const ctx = this.ctx;
        const W = this.canvas.width;
        const H = this.canvas.height;
        ctx.clearRect(0, 0, W, H);

        // 1. Hands
        if (this.handData) this._drawHands(this.handData);

        // 2. Falling balloons
        for (const [, b] of this.balloons) {
            if (b.alive) this._drawBalloon(b.x, b.y, b.size, b.color, 1, 0);
        }

        // 3. Flying balloon trails
        for (const fb of this.flyingBalloons) {
            for (const p of fb.trail) this._drawTrailParticle(p);
        }

        // 4. Flying balloons
        for (const fb of this.flyingBalloons) {
            const alpha = 1 - (fb.time / fb.maxTime) * 0.4;
            this._drawBalloon(fb.x, fb.y, fb.size, fb.color, alpha, fb.rotation);
        }

        // 5. Pop explosions
        for (const e of this.popEffects) this._drawPopEffect(e);

        // 6. Squeeze feedback
        for (const e of this.squeezeEffects) this._drawSqueezeEffect(e);
    }

    _drawBalloon(bx, by, bsize, bcolor, alpha, rotation) {
        const ctx = this.ctx;
        const W = this.canvas.width;
        const H = this.canvas.height;
        const x = bx * W;
        const y = by * H;
        const r = bsize * W;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x, y);
        ctx.rotate(rotation);

        // Shadow
        ctx.shadowColor = 'rgba(0,0,0,0.25)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 6;

        // Oval body
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.85, r, 0, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.05, 0, 0, r);
        grad.addColorStop(0, this._lighten(bcolor, 50));
        grad.addColorStop(0.6, bcolor);
        grad.addColorStop(1, this._darken(bcolor, 30));
        ctx.fillStyle = grad;
        ctx.fill();

        // Shine
        ctx.shadowColor = 'transparent';
        ctx.beginPath();
        ctx.ellipse(-r * 0.25, -r * 0.35, r * 0.14, r * 0.24, -0.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fill();

        // Knot
        ctx.beginPath();
        ctx.moveTo(-3, r);
        ctx.lineTo(0, r + 7);
        ctx.lineTo(3, r);
        ctx.closePath();
        ctx.fillStyle = this._darken(bcolor, 40);
        ctx.fill();

        // String
        ctx.beginPath();
        ctx.moveTo(0, r + 7);
        ctx.quadraticCurveTo(8, r + 28, -4, r + 48);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore();
    }

    _drawTrailParticle(p) {
        const ctx = this.ctx;
        const W = this.canvas.width;
        const H = this.canvas.height;
        const x = p.x * W;
        const y = p.y * H;
        const progress = p.time / p.duration;
        const alpha = (1 - progress) * 0.9;
        const sz = p.size * W * (1 - progress * 0.6);

        ctx.save();
        ctx.globalAlpha = alpha;

        if (p.isStar) {
            // 4-pointed star sparkle
            ctx.translate(x, y);
            ctx.rotate(p.angle + p.time * 5);
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 12;
            ctx.beginPath();
            for (let i = 0; i < 4; i++) {
                const a = (i / 4) * Math.PI * 2;
                ctx.moveTo(0, 0);
                ctx.lineTo(Math.cos(a) * sz * 1.5, Math.sin(a) * sz * 1.5);
            }
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Center dot
            ctx.beginPath();
            ctx.arc(0, 0, sz * 0.3, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
        } else {
            // Glowing circle
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 15;
            ctx.beginPath();
            ctx.arc(x, y, sz, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();

            // Bright center
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.arc(x, y, sz * 0.35, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            ctx.fill();
        }

        ctx.restore();
    }

    _drawPopEffect(e) {
        const ctx = this.ctx;
        const x = e.x * this.canvas.width;
        const y = e.y * this.canvas.height;
        const p = e.time / e.duration;
        const r = e.size * this.canvas.width;

        ctx.save();
        ctx.globalAlpha = 1 - p;

        // Particle burst
        const n = 14;
        for (let i = 0; i < n; i++) {
            const angle = (i / n) * Math.PI * 2 + e.time * 3;
            const dist = r * (1 + p * 4);
            const px = x + Math.cos(angle) * dist;
            const py = y + Math.sin(angle) * dist;
            const sz = (1 - p) * 8;

            ctx.shadowColor = e.color;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(px, py, sz, 0, Math.PI * 2);
            ctx.fillStyle = i % 2 === 0 ? e.color : '#fff';
            ctx.fill();
        }

        // Expanding ring
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(x, y, r * (1 + p * 4), 0, Math.PI * 2);
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 4 * (1 - p);
        ctx.stroke();

        // Inner flash
        if (p < 0.3) {
            ctx.globalAlpha = (0.3 - p) / 0.3;
            ctx.beginPath();
            ctx.arc(x, y, r * (1 + p * 2), 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.fill();
        }

        ctx.restore();
    }

    _drawSqueezeEffect(e) {
        const ctx = this.ctx;
        const x = e.x * this.canvas.width;
        const y = e.y * this.canvas.height;
        const p = e.time / e.duration;

        ctx.save();
        ctx.globalAlpha = 1 - p;

        if (e.hit) {
            // Hit flash: expanding green ring with glow
            ctx.shadowColor = '#6bcb77';
            ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.arc(x, y, 15 + p * 50, 0, Math.PI * 2);
            ctx.strokeStyle = '#6bcb77';
            ctx.lineWidth = 4 * (1 - p);
            ctx.stroke();
        } else {
            // Miss: subtle white ring
            ctx.beginPath();
            ctx.arc(x, y, 15 + p * 40, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,255,255,0.5)';
            ctx.lineWidth = 2 * (1 - p);
            ctx.stroke();
        }

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
            for (const lm of hand) {
                ctx.beginPath();
                ctx.arc((1 - lm.x) * W, lm.y * H, 3.5, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,0.75)';
                ctx.fill();
            }
        }

        // Draw squeeze indicators for each hand
        if (data.squeezeInfo) {
            for (const side of ['left', 'right']) {
                const hand = data.squeezeInfo[side];
                if (!hand) continue;

                const px = (1 - hand.palm.x) * W;
                const py = hand.palm.y * H;

                ctx.save();
                if (!hand.open) {
                    // Fist: glowing red circle
                    ctx.shadowColor = '#ff6b6b';
                    ctx.shadowBlur = 25;
                    ctx.beginPath();
                    ctx.arc(px, py, 22, 0, Math.PI * 2);
                    ctx.strokeStyle = 'rgba(255, 100, 100, 0.8)';
                    ctx.lineWidth = 3;
                    ctx.stroke();

                    ctx.shadowBlur = 0;
                    ctx.beginPath();
                    ctx.arc(px, py, 6, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(255, 100, 100, 0.6)';
                    ctx.fill();
                } else {
                    // Open: subtle circle
                    ctx.beginPath();
                    ctx.arc(px, py, 18, 0, Math.PI * 2);
                    ctx.strokeStyle = 'rgba(255, 255, 100, 0.25)';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                }
                ctx.restore();
            }
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
