/**
 * Freya Sound Manager
 *
 * Tiny WebAudio beep generator for game events. Respects two switches:
 *   - Schulmodus (freya_school_mode): unterdrückt ALLE Töne, damit im
 *     Unterricht garantiert nichts aus dem Gerät kommt.
 *   - Stummschaltung (freya_muted): normaler Mute-Schalter.
 */
class SoundManager {
    constructor() {
        this.ctx = null;
        this.schoolMode = localStorage.getItem('freya_school_mode') === 'true';
        this.muted = localStorage.getItem('freya_muted') === 'true';
    }

    setSchoolMode(on) {
        this.schoolMode = !!on;
        localStorage.setItem('freya_school_mode', this.schoolMode ? 'true' : 'false');
    }

    setMuted(on) {
        this.muted = !!on;
        localStorage.setItem('freya_muted', this.muted ? 'true' : 'false');
    }

    isSilenced() {
        return this.schoolMode || this.muted;
    }

    _ensureCtx() {
        if (this.isSilenced()) return null;
        if (!this.ctx) {
            try {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) {
                return null;
            }
        }
        return this.ctx;
    }

    _tone(freq, durationMs, type = 'sine', gain = 0.06) {
        const ctx = this._ensureCtx();
        if (!ctx) return; // silenced -> nothing comes out
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        g.gain.value = gain;
        osc.connect(g);
        g.connect(ctx.destination);
        const now = ctx.currentTime;
        osc.start(now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
        osc.stop(now + durationMs / 1000);
    }

    play(name) {
        if (this.isSilenced()) return;
        switch (name) {
            case 'turn':     this._tone(660, 120, 'sine'); break;
            case 'valid':    this._tone(880, 90, 'triangle'); break;
            case 'win':      this._tone(523, 120); setTimeout(() => this._tone(784, 200), 130); break;
            case 'lose':     this._tone(330, 250, 'sawtooth', 0.05); break;
            case 'explode':  this._tone(120, 350, 'sawtooth', 0.09); break;
            case 'tick':     this._tone(440, 40, 'square', 0.03); break;
            case 'notify':   this._tone(720, 100, 'sine'); break;
            default: break;
        }
    }
}

window.Sound = new SoundManager();
