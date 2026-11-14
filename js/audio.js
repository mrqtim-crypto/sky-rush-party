// Procedural Web Audio API Sound Effects for NS-Shaft 3D Party (小朋友下樓梯 3D：深淵大亂鬥)
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
    gain.gain.linearRampToValueAtTime(gainVal, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  // 一般踏板落地聲 (經典懷舊音效)
  stepNormal() {
    this.playTone(220, 310, 0.07, 'triangle', 0.14);
  }

  // 踩到尖刺踏板 / 天花板刺傷
  stepSpike() {
    this.playTone(580, 120, 0.18, 'sawtooth', 0.26);
    this.playTone(320, 90, 0.22, 'square', 0.2, 0.05);
  }

  // 彈簧踏板彈起
  stepSpring() {
    this.playTone(180, 760, 0.24, 'sine', 0.22);
    this.playTone(340, 880, 0.18, 'triangle', 0.15, 0.05);
  }

  // 翻轉/碎裂踏板破裂
  stepCracked() {
    this.playTone(420, 140, 0.12, 'square', 0.16);
    this.playTone(260, 80, 0.15, 'sawtooth', 0.14, 0.06);
  }

  // 結冰踏板滑動
  stepIce() {
    this.playTone(880, 1320, 0.1, 'sine', 0.1);
  }

  // 岩漿燙傷跳起
  stepLava() {
    this.playTone(450, 820, 0.14, 'sawtooth', 0.2);
    this.playTone(620, 220, 0.16, 'square', 0.16, 0.07);
  }

  // 彈射板發射
  stepCatapult() {
    this.playTone(150, 920, 0.26, 'sawtooth', 0.24);
  }

  // 角色跳躍
  jump() {
    this.playTone(260, 560, 0.13, 'sine', 0.14);
  }

  // 踩別人頭二段跳！
  stompHead() {
    this.playTone(480, 160, 0.1, 'square', 0.22);
    this.playTone(320, 840, 0.2, 'triangle', 0.22, 0.06);
  }

  // 肘擊推人 / 彈簧拳套
  shovePunch() {
    this.playTone(280, 85, 0.14, 'sawtooth', 0.24);
    this.playTone(520, 180, 0.1, 'square', 0.18, 0.02);
  }

  // 撿到害人道具箱
  itemPickup() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => {
      this.playTone(n, n * 1.05, 0.09, 'triangle', 0.15, i * 0.045);
    });
  }

  // 踩到香蕉皮滑倒
  bananaSlip() {
    this.playTone(720, 240, 0.14, 'sine', 0.22);
    this.playTone(240, 880, 0.18, 'sine', 0.22, 0.12);
  }

  // 炸彈爆炸
  explosion() {
    this.playTone(140, 32, 0.42, 'sawtooth', 0.32);
    this.playTone(95, 28, 0.38, 'square', 0.26, 0.04);
  }

  // 冰凍光線
  freezeRay() {
    this.playTone(1046, 523, 0.2, 'sine', 0.2);
    this.playTone(1318, 659, 0.22, 'triangle', 0.18, 0.06);
  }

  // 抓交替換位符
  swapTeleport() {
    this.playTone(330, 990, 0.15, 'sine', 0.2);
    this.playTone(990, 440, 0.15, 'triangle', 0.2, 0.12);
  }

  // 觸發場地心機開關
  switchTrigger() {
    this.playTone(440, 880, 0.16, 'square', 0.2);
    this.playTone(440, 880, 0.16, 'square', 0.2, 0.18);
  }

  // 背後靈詛咒
  ghostCurse() {
    this.playTone(380, 190, 0.28, 'sine', 0.2);
    this.playTone(290, 145, 0.3, 'triangle', 0.16, 0.1);
  }

  // 墜落深淵慘叫
  fallEliminated() {
    this.playTone(660, 110, 0.55, 'sawtooth', 0.24);
  }

  // 換裝按鈕音效
  customizePop() {
    this.playTone(420, 680, 0.08, 'triangle', 0.13);
  }

  readyBeep(isReady = true) {
    if (isReady) {
      this.playTone(523, 784, 0.14, 'triangle', 0.15);
    } else {
      this.playTone(440, 330, 0.14, 'triangle', 0.12);
    }
  }

  countdown(go = false) {
    if (go) {
      this.playTone(587.33, 1174.66, 0.35, 'triangle', 0.22);
    } else {
      this.playTone(440, 440, 0.12, 'sine', 0.15);
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
