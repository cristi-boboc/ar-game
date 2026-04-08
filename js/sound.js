/**
 * SoundManager - Web Audio API synthesized sound effects and procedural background music.
 * No external audio files needed.
 */
class SoundManager {
    constructor() {
        this.ctx = null;
        this.initialized = false;
        this.musicGain = null;
        this.musicPlaying = false;
        this.musicNodes = [];
    }

    init() {
        if (this.initialized) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 1.0;
            this.masterGain.connect(this.ctx.destination);
            this.musicGain = this.ctx.createGain();
            this.musicGain.gain.value = 0.18;
            this.musicGain.connect(this.masterGain);
            this.initialized = true;
        } catch (e) {
            console.warn('Web Audio API not available');
        }
    }

    unlock() {
        if (!this.ctx) this.init();
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    /* ==================== SFX ==================== */

    /** Initial squeeze-pop: short satisfying pop */
    playPop() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;

        // Sine sweep down
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(700, t);
        osc.frequency.exponentialRampToValueAtTime(120, t + 0.14);
        g.gain.setValueAtTime(0.35, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        osc.connect(g);
        g.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.15);

        // Short noise burst
        this._noise(t, 0.07, 1400, 0.2);
    }

    /** Bounce thud */
    playBounce() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, t);
        osc.frequency.exponentialRampToValueAtTime(80, t + 0.07);
        g.gain.setValueAtTime(0.18, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
        osc.connect(g);
        g.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.08);
    }

    /** Final explosion pop */
    playExplode() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;

        // Low thump
        const osc = this.ctx.createOscillator();
        const og = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(120, t);
        osc.frequency.exponentialRampToValueAtTime(35, t + 0.22);
        og.gain.setValueAtTime(0.35, t);
        og.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        osc.connect(og);
        og.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.26);

        // Wide noise
        this._noise(t, 0.22, 900, 0.3);
        this._noise(t + 0.02, 0.15, 2200, 0.15);
    }

    /** Magic sparkle trail sound */
    playSparkle() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        for (let i = 0; i < 3; i++) {
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            const s = t + i * 0.035;
            osc.type = 'sine';
            osc.frequency.setValueAtTime(2500 + Math.random() * 3500, s);
            osc.frequency.exponentialRampToValueAtTime(1500, s + 0.09);
            g.gain.setValueAtTime(0.07, s);
            g.gain.exponentialRampToValueAtTime(0.001, s + 0.09);
            osc.connect(g);
            g.connect(this.masterGain);
            osc.start(s);
            osc.stop(s + 0.1);
        }
    }

    /** Score point jingle */
    playScore() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const notes = [523, 659, 784]; // C5 E5 G5
        notes.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            const s = t + i * 0.08;
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, s);
            g.gain.setValueAtTime(0.12, s);
            g.gain.exponentialRampToValueAtTime(0.001, s + 0.15);
            osc.connect(g);
            g.connect(this.masterGain);
            osc.start(s);
            osc.stop(s + 0.16);
        });
    }

    _noise(time, duration, freq, volume) {
        const len = Math.floor(this.ctx.sampleRate * duration);
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const flt = this.ctx.createBiquadFilter();
        flt.type = 'bandpass';
        flt.frequency.value = freq;
        flt.Q.value = 1.5;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(volume, time);
        g.gain.exponentialRampToValueAtTime(0.001, time + duration);
        src.connect(flt);
        flt.connect(g);
        g.connect(this.masterGain);
        src.start(time);
        src.stop(time + duration);
    }

    /* ==================== BACKGROUND MUSIC ==================== */

    /**
     * Procedural upbeat background music using layered oscillators.
     * Generates an endless loop of arpeggiated chords with a bassline and beat.
     */
    startMusic() {
        if (!this.ctx || this.musicPlaying) return;
        this.musicPlaying = true;

        // Chord progression: C - Am - F - G (loop)
        const chords = [
            [261.6, 329.6, 392.0],  // C major
            [220.0, 261.6, 329.6],  // A minor
            [174.6, 220.0, 261.6],  // F major
            [196.0, 246.9, 293.7],  // G major
        ];

        const bpm = 128;
        const beatLen = 60 / bpm;
        const barLen = beatLen * 4;

        this._musicScheduler = { chords, bpm, beatLen, barLen, bar: 0, running: true };
        this._scheduleBar();
    }

    _scheduleBar() {
        if (!this._musicScheduler || !this._musicScheduler.running) return;
        const s = this._musicScheduler;
        const t0 = this.ctx.currentTime + 0.05;

        const chordIdx = s.bar % s.chords.length;
        const chord = s.chords[chordIdx];

        // Pad (sustained chord)
        chord.forEach(freq => {
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = freq;
            g.gain.setValueAtTime(0.06, t0);
            g.gain.setValueAtTime(0.06, t0 + s.barLen - 0.05);
            g.gain.linearRampToValueAtTime(0, t0 + s.barLen);
            osc.connect(g);
            g.connect(this.musicGain);
            osc.start(t0);
            osc.stop(t0 + s.barLen + 0.01);
            this.musicNodes.push(osc);
        });

        // Arpeggio pattern
        const arpNotes = [chord[0], chord[1], chord[2], chord[1]];
        for (let i = 0; i < 8; i++) {
            const freq = arpNotes[i % 4] * 2; // octave up
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            const noteT = t0 + i * s.beatLen * 0.5;
            osc.type = 'square';
            osc.frequency.value = freq;
            g.gain.setValueAtTime(0, noteT);
            g.gain.linearRampToValueAtTime(0.04, noteT + 0.01);
            g.gain.exponentialRampToValueAtTime(0.001, noteT + s.beatLen * 0.45);
            osc.connect(g);
            g.connect(this.musicGain);
            osc.start(noteT);
            osc.stop(noteT + s.beatLen * 0.5);
            this.musicNodes.push(osc);
        }

        // Bass
        const bassFreq = chord[0] / 2;
        for (let i = 0; i < 4; i++) {
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            const noteT = t0 + i * s.beatLen;
            osc.type = 'sawtooth';
            osc.frequency.value = bassFreq;
            const flt = this.ctx.createBiquadFilter();
            flt.type = 'lowpass';
            flt.frequency.value = 300;
            g.gain.setValueAtTime(0, noteT);
            g.gain.linearRampToValueAtTime(0.08, noteT + 0.01);
            g.gain.exponentialRampToValueAtTime(0.001, noteT + s.beatLen * 0.85);
            osc.connect(flt);
            flt.connect(g);
            g.connect(this.musicGain);
            osc.start(noteT);
            osc.stop(noteT + s.beatLen);
            this.musicNodes.push(osc);
        }

        // Kick drum (noise thump on beats 1 and 3)
        for (const beat of [0, 2]) {
            const noteT = t0 + beat * s.beatLen;
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(150, noteT);
            osc.frequency.exponentialRampToValueAtTime(40, noteT + 0.08);
            g.gain.setValueAtTime(0.2, noteT);
            g.gain.exponentialRampToValueAtTime(0.001, noteT + 0.1);
            osc.connect(g);
            g.connect(this.musicGain);
            osc.start(noteT);
            osc.stop(noteT + 0.11);
            this.musicNodes.push(osc);
        }

        // Hi-hat (noise on every 8th)
        for (let i = 0; i < 8; i++) {
            const noteT = t0 + i * s.beatLen * 0.5;
            const len = 0.03;
            const bufLen = Math.floor(this.ctx.sampleRate * len);
            const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let j = 0; j < bufLen; j++) d[j] = Math.random() * 2 - 1;
            const src = this.ctx.createBufferSource();
            src.buffer = buf;
            const flt = this.ctx.createBiquadFilter();
            flt.type = 'highpass';
            flt.frequency.value = 7000;
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0.06, noteT);
            g.gain.exponentialRampToValueAtTime(0.001, noteT + len);
            src.connect(flt);
            flt.connect(g);
            g.connect(this.musicGain);
            src.start(noteT);
            src.stop(noteT + len + 0.01);
            this.musicNodes.push(src);
        }

        s.bar++;

        // Clean up old nodes
        this.musicNodes = this.musicNodes.filter(n => {
            try { return n.context.currentTime < t0 + s.barLen + 1; } catch { return false; }
        });

        // Schedule next bar
        const nextBarTime = (s.barLen - 0.1) * 1000;
        this._musicTimeout = setTimeout(() => this._scheduleBar(), nextBarTime);
    }

    stopMusic() {
        this.musicPlaying = false;
        if (this._musicScheduler) this._musicScheduler.running = false;
        if (this._musicTimeout) clearTimeout(this._musicTimeout);
        this.musicNodes.forEach(n => { try { n.stop(); } catch {} });
        this.musicNodes = [];
    }

    destroy() {
        this.stopMusic();
        if (this.ctx) {
            this.ctx.close();
            this.ctx = null;
        }
        this.initialized = false;
    }
}
