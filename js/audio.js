// Procedural Web Audio API Sound Effects
class SoundFX {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playTone(freq, endFreq, duration, type = 'sine', gainVal = 0.16) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    }

    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  }

  jump() {
    this.playTone(260, 620, 0.16, 'sine', 0.15);
  }

  spring() {
    this.playTone(220, 980, 0.32, 'triangle', 0.2);
  }

  stomp() {
    this.playTone(180, 760, 0.22, 'square', 0.18);
  }

  slam() {
    this.playTone(160, 38, 0.32, 'sawtooth', 0.25);
  }

  bump() {
    this.playTone(140, 55, 0.18, 'triangle', 0.24);
  }

  itemPickup() {
    this.playTone(523, 1046, 0.18, 'sine', 0.14);
  }

  boost() {
    this.playTone(300, 880, 0.38, 'sawtooth', 0.14);
  }

  glassCrack() {
    this.playTone(920, 320, 0.12, 'square', 0.1);
  }

  countdown(go = false) {
    if (go) {
      this.playTone(880, 1174, 0.35, 'triangle', 0.2);
    } else {
      this.playTone(440, 440, 0.15, 'sine', 0.15);
    }
  }

  win() {
    if (!this.enabled) return;
    this.init();
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, idx) => {
      setTimeout(() => this.playTone(n, n * 1.02, 0.22, 'triangle', 0.18), idx * 110);
    });
  }
}

export const sfx = new SoundFX();
