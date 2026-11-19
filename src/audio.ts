/**
 * 程序化音效：不依赖任何音频文件，全部用振荡器 + 噪声实时合成。
 * Web 端用 AudioContext，微信小游戏用 wx.createWebAudioContext；
 * 两者都拿不到时静默降级，不影响游戏逻辑。
 */
// 微信小游戏的 WebAudioContext 与标准 API 不完全一致，统一按 any 处理
type Ctx = any;

const MASTER_GAIN = 0.3;

export type SfxKind = 'shield' | 'magnet' | 'life';

/** 背景音乐：112BPM，C 大调五声音阶，32 个八分音符一循环 */
const BPM = 112;
const STEP_SEC = 60 / BPM / 2;
const STEPS = 32;

/** 主旋律 MIDI 音高，0 表示休止 */
const LEAD: number[] = [
  64, 62, 60, 62, 67, 69, 67, 64,
  69, 67, 64, 62, 60, 62, 64, 67,
  72, 69, 67, 64, 62, 64, 67, 69,
  72, 67, 64, 62, 60, 0, 0, 0,
];

/** 低音：每小节两个音，走 C - Am - F - G */
const BASS: Record<number, number> = {
  0: 48,
  4: 48,
  8: 45,
  12: 45,
  16: 41,
  20: 41,
  24: 43,
  28: 43,
};

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export class Sfx {
  private ctx: Ctx = null;
  private master: any = null;
  private enabled = true;
  private failed = false;

  private musicGain: any = null;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private nextNoteTime = 0;
  private step = 0;

  get muted(): boolean {
    return !this.enabled;
  }

  /** 必须在用户手势里调用一次，否则浏览器会把音频上下文挂起到静音 */
  resume(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      void ctx.resume();
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? MASTER_GAIN : 0;
  }

  private ensure(): Ctx {
    if (this.ctx || this.failed) return this.ctx;
    const g = globalThis as any;
    const AC = g.AudioContext || g.webkitAudioContext;
    try {
      if (AC) this.ctx = new AC();
      else if (g.wx && typeof g.wx.createWebAudioContext === 'function') {
        this.ctx = g.wx.createWebAudioContext();
      }
    } catch {
      this.ctx = null;
    }
    if (!this.ctx) {
      this.failed = true;
      return null;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? MASTER_GAIN : 0;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  /** 一个带包络的音符；to 存在时做频率滑音 */
  private blip(freq: number, dur: number, type: string, gain: number, delay = 0, to?: number): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  /** 衰减白噪声，用于撞击 */
  private noise(dur: number, gain: number, cutoff: number): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || typeof ctx.createBuffer !== 'function') return;
    const rate = ctx.sampleRate || 44100;
    const len = Math.floor(rate * dur);
    const buf = ctx.createBuffer(1, len, rate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = gain;
    if (typeof ctx.createBiquadFilter === 'function') {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      src.connect(filter);
      filter.connect(g);
    } else {
      src.connect(g);
    }
    g.connect(this.master);
    src.start();
  }

  /** 吃金币 */
  coin(): void {
    this.blip(988, 0.05, 'square', 0.16);
    this.blip(1319, 0.09, 'square', 0.14, 0.05);
  }

  /** 撞障碍 */
  crash(): void {
    this.noise(0.22, 0.3, 1100);
    this.blip(180, 0.26, 'sawtooth', 0.2, 0, 55);
  }

  /** 吃道具，按类型给不同音高 */
  pickup(kind: SfxKind): void {
    const base = kind === 'life' ? 784 : kind === 'magnet' ? 587 : 659;
    this.blip(base, 0.08, 'triangle', 0.18);
    this.blip(base * 1.26, 0.1, 'triangle', 0.18, 0.07);
    this.blip(base * 1.5, 0.16, 'triangle', 0.18, 0.15);
  }

  /** 通关 */
  clear(): void {
    [523, 659, 784, 1046].forEach((f, i) => this.blip(f, 0.2, 'triangle', 0.18, i * 0.11));
  }

  /** 生命耗尽 */
  over(): void {
    [392, 330, 262].forEach((f, i) => this.blip(f, 0.3, 'sawtooth', 0.16, i * 0.16));
  }

  // ---------------------------------------------------------------- 背景音乐

  /** 开始循环播放背景音乐（重复调用无副作用） */
  startMusic(): void {
    if (this.musicTimer !== null) return;
    const ctx = this.ensure();
    if (!ctx) return;
    if (!this.musicGain) {
      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = 0.42;
      this.musicGain.connect(this.master);
    }
    this.step = 0;
    this.nextNoteTime = ctx.currentTime + 0.2;
    this.musicTimer = setInterval(() => this.schedule(), 90);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  /** 提前 0.4s 排程，避免 setInterval 抖动导致节奏不稳 */
  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;
    // 上下文被挂起时 currentTime 不走，继续排程会堆积成一次性爆发，直接跳过
    if (ctx.state === 'suspended') return;
    if (this.nextNoteTime < ctx.currentTime) this.nextNoteTime = ctx.currentTime + 0.05;
    while (this.nextNoteTime < ctx.currentTime + 0.4) {
      const lead = LEAD[this.step];
      if (lead > 0) this.voice(this.nextNoteTime, midiToFreq(lead), 0.22, 'triangle', 0.1);
      const bass = BASS[this.step];
      if (bass) this.voice(this.nextNoteTime, midiToFreq(bass), 0.34, 'sine', 0.15);
      this.step = (this.step + 1) % STEPS;
      this.nextNoteTime += STEP_SEC;
    }
  }

  /** 排到指定时刻的音符，走音乐总线 */
  private voice(t0: number, freq: number, dur: number, type: string, gain: number): void {
    const ctx = this.ctx;
    const dest = this.musicGain;
    if (!ctx || !dest) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }
}
