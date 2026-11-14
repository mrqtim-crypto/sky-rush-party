// Procedural Web Audio API Sound Effects for Taiwan Chameleon: Landmark Hide & Seek 3D
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
      this.ctx.resume().catch(() => {});
    }
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
    gain.gain.linearRampToValueAtTime(gainVal, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  // 一鍵周邊吸色同化音效
  paintBlend() {
    const notes = [440, 554, 659, 880];
    notes.forEach((n, i) => {
      this.playTone(n, n * 1.15, 0.12, 'sine', 0.14, i * 0.045);
    });
  }

  // 點擊單一物件吸色
  colorPick() {
    this.playTone(587, 880, 0.12, 'triangle', 0.15);
  }

  // 切換偽裝動作 (Pose)
  poseChange() {
    this.playTone(240, 480, 0.1, 'triangle', 0.16);
    this.playTone(520, 380, 0.08, 'sine', 0.12, 0.06);
  }

  // 藍白拖揮空
  slipperSwing() {
    this.playTone(320, 110, 0.16, 'sine', 0.18);
  }

  // 藍白拖成功敲中變色龍（「啪！」清脆聲＋感染警報）
  slipperHitPlayer() {
    this.playTone(900, 180, 0.12, 'sawtooth', 0.28);
    this.playTone(523, 784, 0.22, 'square', 0.18, 0.08);
    this.playTone(784, 1046, 0.28, 'square', 0.2, 0.22);
  }

  // 敲錯真物件！觸發 4 秒手麻掉拖鞋懲罰
  slipperPenalty() {
    this.playTone(150, 55, 0.35, 'sawtooth', 0.28);
    this.playTone(110, 95, 0.25, 'square', 0.2, 0.2);
    this.playTone(95, 70, 0.35, 'square', 0.2, 0.45);
  }

  // 台灣特色嘲諷音效 1：巴哺冰淇淋喇叭
  tauntBabu() {
    this.playTone(493.88, 493.88, 0.18, 'sawtooth', 0.18, 0);
    this.playTone(392.00, 392.00, 0.26, 'sawtooth', 0.18, 0.21);
  }

  // 台灣特色嘲諷音效 2：垃圾車《少女的祈禱》短音
  tauntGarbageTruck() {
    const melody = [
      { f: 659.25, d: 0.16, t: 0 },
      { f: 783.99, d: 0.16, t: 0.18 },
      { f: 1046.5, d: 0.22, t: 0.36 },
      { f: 987.77, d: 0.16, t: 0.60 },
      { f: 783.99, d: 0.26, t: 0.78 }
    ];
    melody.forEach((m) => this.playTone(m.f, m.f, m.d, 'triangle', 0.16, m.t));
  }

  // 珍奶煙霧彈逃脫
  bobaSmoke() {
    this.playTone(220, 680, 0.24, 'sine', 0.2);
    this.playTone(180, 90, 0.3, 'triangle', 0.18, 0.08);
  }

  jump() {
    this.playTone(260, 580, 0.15, 'sine', 0.14);
  }

  readyBeep(isReady = true) {
    if (isReady) {
      this.playTone(523, 784, 0.15, 'triangle', 0.15);
    } else {
      this.playTone(440, 330, 0.15, 'triangle', 0.12);
    }
  }

  countdown(go = false) {
    if (go) {
      this.playTone(587.33, 1174.66, 0.38, 'triangle', 0.22);
    } else {
      this.playTone(440, 440, 0.14, 'sine', 0.15);
    }
  }

  win() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, idx) => {
      this.playTone(n, n * 1.02, 0.24, 'triangle', 0.18, idx * 0.11);
    });
  }
}

export const sfx = new SoundFX();
