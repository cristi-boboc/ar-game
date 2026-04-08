/**
 * SoundManager - Plays actual audio files for sound effects and background music.
 * Uses HTML5 Audio with a pool of pre-loaded elements for concurrent playback.
 */
class SoundManager {
    constructor() {
        this.loaded = false;
        this.sfx = {};       // name -> Audio[]
        this.music = null;    // Audio element for background music
        this.musicPlaying = false;
        this.poolSize = 4;    // how many concurrent instances of each SFX
    }

    /**
     * Preload all audio files. Call this early (e.g. on Host/Join click).
     */
    init() {
        if (this.loaded) return;

        const basePath = 'audio/';
        const effects = ['pop', 'bounce', 'explode', 'sparkle', 'score'];

        for (const name of effects) {
            this.sfx[name] = [];
            for (let i = 0; i < this.poolSize; i++) {
                const audio = new Audio(basePath + name + '.wav');
                audio.preload = 'auto';
                audio.volume = 0.7;
                this.sfx[name].push(audio);
            }
        }

        // Background music (CC0 "Comic Game Loop - Mischief" from FreePD.com)
        this.music = new Audio(basePath + 'music.mp3');
        this.music.preload = 'auto';
        this.music.loop = true;
        this.music.volume = 0.3;

        this.loaded = true;
    }

    /** No-op kept for API compatibility */
    unlock() {
        if (!this.loaded) this.init();
    }

    /* ==================== SFX PLAYBACK ==================== */

    _play(name, volume) {
        if (!this.loaded) this.init();
        const pool = this.sfx[name];
        if (!pool) return;

        // Find an audio element that isn't currently playing (or rewind the oldest)
        for (const audio of pool) {
            if (audio.paused || audio.ended) {
                audio.volume = volume;
                audio.currentTime = 0;
                audio.play().catch(() => {});
                return;
            }
        }
        // All busy — clone and play (browser will garbage collect)
        const clone = pool[0].cloneNode();
        clone.volume = volume;
        clone.play().catch(() => {});
    }

    playPop()     { this._play('pop', 0.8); }
    playBounce()  { this._play('bounce', 0.5); }
    playExplode() { this._play('explode', 0.9); }
    playSparkle() { this._play('sparkle', 0.4); }
    playScore()   { this._play('score', 0.6); }

    /* ==================== BACKGROUND MUSIC ==================== */

    startMusic() {
        if (!this.loaded) this.init();
        if (this.musicPlaying || !this.music) return;
        this.musicPlaying = true;
        this.music.currentTime = 0;
        this.music.play().catch(() => {});
    }

    stopMusic() {
        this.musicPlaying = false;
        if (this.music) {
            this.music.pause();
            this.music.currentTime = 0;
        }
    }

    destroy() {
        this.stopMusic();
        this.sfx = {};
        this.music = null;
        this.loaded = false;
    }
}
