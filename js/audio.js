// Procedural Web Audio API Sound Effects & Fast-Paced Arcade Rhythm BGM
// For NS-Shaft 3D Party (小朋友下樓梯 3D：深淵大亂鬥)

const BASS_LINE = [130.81, 164.81, 196.00, 220.00, 196.00, 164.81, 146.83, 196.00];
const LEAD_NOTES = [523.25, 659.25, 783.99, 880.00, 783.99, 659.25, 587.33, 783.99];

class SoundFX {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.bgmRunning = false;
    this.bgmStep = 0;
    this.bgmTempoMult = 1.0;
    this.bgmTimer = null;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  toggleMute() {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      this.stopBgm();
    }
    return this.enabled;
  }

  startBgm() {
    if (!this.enabled) return;
    this.init();
    if (this.bgmRunning) return;
    this.bgmRunning = true;
    this.bgmStep = 0;
    this.scheduleNextBeat();
  }

  stopBgm() {
    this.bgmRunning = false;
    if (this.bgmTimer) {
      clearTimeout(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  setBgmIntensity(mult = 1.0) {
    this.bgmTempoMult = Math.max(0.85, Math.min(1.85, mult));
  }

  scheduleNextBeat() {
    if (!this.bgmRunning || !this.enabled) return;
    const idx = this.bgmStep % BASS_LINE.length;
    const bassFreq = BASS_LINE[idx];
    const leadFreq = LEAD_NOTES[idx];

    // Driving arcade bass pulse
    this.playTone(bassFreq, bassFreq * 0.98, 0.09, 'triangle', 0.065, 0);

    // Snappy chiptune arpeggio on off-beats
    if (this.bgmStep % 2 === 0) {
      this.playTone(leadFreq, leadFreq * 1.01, 0.065, 'square', 0.032, 0);
    } else {
      this.playTone(leadFreq * 1.25, leadFreq, 0.05, 'sine', 0.03, 0);
    }

    this.bgmStep++;
    const intervalMs = Math.max(85, Math.round(145 / this.bgmTempoMult));
    this.bgmTimer = setTimeout(() => this.scheduleNextBeat(), intervalMs);
  }

  playTone(freq, endFreq, duration, type = 'sine', gainVal = 0.16, delay = 0) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const start = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), start);
    if (endFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), start + duration);
    }

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(gainVal, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  stepNormal(combo = 1) {
    const pitchBoost = Math.min(240, (combo - 1) * 28);
    this.playTone(250 + pitchBoost, 370 + pitchBoost, 0.065, 'triangle', 0.15);
  }

  stepSpike() {
    this.playTone(620, 110, 0.16, 'sawtooth', 0.26);
    this.playTone(340, 85, 0.2, 'square', 0.2, 0.04);
  }

  stepSpring() {
    this.playTone(200, 820, 0.22, 'sine', 0.22);
    this.playTone(380, 960, 0.16, 'triangle', 0.15, 0.04);
  }

  stepCracked() {
    this.playTone(460, 140, 0.1, 'square', 0.16);
    this.playTone(280, 80, 0.13, 'sawtooth', 0.14, 0.05);
  }

  stepIce() {
    this.playTone(920, 1380, 0.09, 'sine', 0.11);
  }

  stepLava() {
    this.playTone(480, 860, 0.12, 'sawtooth', 0.2);
    this.playTone(640, 220, 0.14, 'square', 0.16, 0.06);
  }

  stepCatapult() {
    this.playTone(160, 960, 0.22, 'sawtooth', 0.24);
  }

  jump() {
    this.playTone(290, 620, 0.11, 'sine', 0.14);
  }

  stompHead() {
    this.playTone(520, 160, 0.09, 'square', 0.22);
    this.playTone(360, 920, 0.18, 'triangle', 0.22, 0.05);
  }

  shovePunch() {
    this.playTone(310, 85, 0.12, 'sawtooth', 0.24);
    this.playTone(560, 180, 0.09, 'square', 0.18, 0.02);
  }

  itemPickup() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => {
      this.playTone(n, n * 1.05, 0.08, 'triangle', 0.15, i * 0.038);
    });
  }

  bananaSlip() {
    this.playTone(760, 240, 0.12, 'sine', 0.22);
    this.playTone(240, 920, 0.16, 'sine', 0.22, 0.1);
  }

  explosion() {
    this.playTone(150, 32, 0.38, 'sawtooth', 0.32);
    this.playTone(95, 28, 0.34, 'square', 0.26, 0.04);
  }

  freezeRay() {
    this.playTone(1046, 523, 0.18, 'sine', 0.2);
    this.playTone(1318, 659, 0.2, 'triangle', 0.18, 0.05);
  }

  swapTeleport() {
    this.playTone(330, 990, 0.13, 'sine', 0.2);
    this.playTone(990, 440, 0.13, 'triangle', 0.2, 0.1);
  }

  switchTrigger() {
    this.playTone(480, 920, 0.14, 'square', 0.2);
    this.playTone(480, 920, 0.14, 'square', 0.2, 0.15);
  }

  ghostCurse() {
    this.playTone(380, 190, 0.24, 'sine', 0.2);
    this.playTone(290, 145, 0.26, 'triangle', 0.16, 0.08);
  }

  fallEliminated() {
    this.playTone(680, 110, 0.48, 'sawtooth', 0.24);
  }

  customizePop() {
    this.playTone(460, 720, 0.07, 'triangle', 0.13);
  }

  readyBeep(isReady = true) {
    if (isReady) {
      this.playTone(523, 784, 0.12, 'triangle', 0.15);
    } else {
      this.playTone(440, 330, 0.12, 'triangle', 0.12);
    }
  }

  countdown(go = false) {
    if (go) {
      this.playTone(587.33, 1174.66, 0.3, 'triangle', 0.22);
    } else {
      this.playTone(440, 440, 0.1, 'sine', 0.15);
    }
  }

  win() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, idx) => {
      this.playTone(n, n * 1.02, 0.22, 'triangle', 0.18, idx * 0.1);
    });
  }
}

export const sfx = new SoundFX();
