// 方波芯片音效（技术文档 §14；WebAudio 零素材）
// 原型 beep/sfx 全量迁移（click/coin/good/bad/kp/levelup/win/lose），S6 新增：
//   alarm     双低音 2 声循环感（疲劳 level2 出现时）
//   heartbeat 心悸事件弹窗（lub-dub 两下低频）
//   tinnitus  s1-deep 进入时 1.2s 高频耳鸣
//   hum       幽灵公司常驻低鸣（可持续开关的 drone）
// AudioContext 遵守浏览器自动播放策略：首次用户交互（pointerdown/keydown）后才创建。
// 音符全部集中在 SFX_SCORES 纯数据表（可单测），播放器只负责按表发声。

export interface SfxNote {
  f: number;            // 频率 Hz
  d: number;            // 时长 s
  t?: number;           // 起始偏移 s（默认 0）
  type?: OscillatorType; // 波形（默认 square）
  v?: number;           // 音量 0-1（默认 0.06）
}

/** 具名音效乐谱（纯数据，tests/s6.test.ts 校验每个名字有音符） */
export const SFX_SCORES: Record<string, SfxNote[]> = {
  click: [{ f: 880, d: 0.06 }],
  coin: [{ f: 990, d: 0.07 }, { f: 1320, d: 0.1, t: 0.07 }],
  good: [{ f: 660, d: 0.08 }, { f: 880, d: 0.08, t: 0.08 }, { f: 1100, d: 0.12, t: 0.16 }],
  bad: [{ f: 220, d: 0.15 }, { f: 165, d: 0.25, t: 0.12, type: 'sawtooth' }],
  kp: [{ f: 523, d: 0.07 }, { f: 784, d: 0.12, t: 0.08, type: 'triangle' }],
  levelup: [523, 659, 784, 1046].map((f, i) => ({ f, d: 0.1, t: i * 0.1, type: 'triangle' as const, v: 0.08 })),
  win: [523, 659, 784, 1046, 1318, 1568].map((f, i) => ({ f, d: 0.15, t: i * 0.1, type: 'triangle' as const, v: 0.08 })),
  lose: [392, 330, 262, 196, 165].map((f, i) => ({ f, d: 0.22, t: i * 0.15, type: 'sawtooth' as const, v: 0.07 })),
  // ---- S6 新增 ----
  alarm: [
    { f: 165, d: 0.18, v: 0.09 }, { f: 123, d: 0.18, t: 0.2, v: 0.09 },
    { f: 165, d: 0.18, t: 0.44, v: 0.09 }, { f: 123, d: 0.22, t: 0.64, v: 0.09 }
  ],
  heartbeat: [
    { f: 72, d: 0.09, type: 'sine', v: 0.14 },
    { f: 60, d: 0.12, t: 0.18, type: 'sine', v: 0.11 }
  ],
  tinnitus: [{ f: 3200, d: 1.2, type: 'sine', v: 0.022 }]
};

/** 必备音效名（8 迁移 + 3 新增乐谱；hum 是持续 drone 不入乐谱表，单独测） */
export const REQUIRED_SFX: string[] = [
  'click', 'coin', 'good', 'bad', 'kp', 'levelup', 'win', 'lose',
  'alarm', 'heartbeat', 'tinnitus'
];

let ac: AudioContext | null = null;
let unlocked = false;
let listenersBound = false;

function ensureAc(): AudioContext | null {
  if (!unlocked) return null; // 自动播放策略：未交互不出声
  if (!ac) {
    try {
      const Ctor = globalThis.AudioContext;
      if (typeof Ctor !== 'function') return null;
      ac = new Ctor();
    } catch {
      return null;
    }
  }
  return ac;
}

function beep(n: SfxNote): void {
  if (SFX.muted) return;
  const c = ensureAc();
  if (!c) return;
  try {
    const t0 = c.currentTime + (n.t ?? 0);
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = n.type ?? 'square';
    o.frequency.value = n.f;
    g.gain.setValueAtTime(n.v ?? 0.06, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + n.d);
    o.connect(g).connect(c.destination);
    o.start(t0);
    o.stop(t0 + n.d);
  } catch {
    /* 音频失败静默（游戏不因声音挂掉） */
  }
}

// ---- hum：幽灵公司常驻低鸣（可开关的持续 drone） ----
let humNodes: { oscNode: OscillatorNode; gain: GainNode } | null = null;

function setHum(on: boolean): void {
  if (SFX.muted) on = false;
  const c = on ? ensureAc() : ac;
  if (on) {
    if (!c || humNodes) return;
    try {
      const oscNode = c.createOscillator();
      const gain = c.createGain();
      oscNode.type = 'sine';
      oscNode.frequency.value = 55;
      gain.gain.setValueAtTime(0.0001, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.03, c.currentTime + 0.8); // 缓起不惊
      oscNode.connect(gain).connect(c.destination);
      oscNode.start();
      humNodes = { oscNode, gain };
    } catch {
      /* 静默 */
    }
  } else if (humNodes && c) {
    try {
      humNodes.gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.5);
      humNodes.oscNode.stop(c.currentTime + 0.6);
    } catch {
      /* 静默 */
    }
    humNodes = null;
  }
}

/** 首次用户交互解锁（main.ts 在启动时调用一次） */
function init(): void {
  if (listenersBound) return;
  listenersBound = true;
  const unlock = (): void => {
    unlocked = true;
    ensureAc();
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}

export const SFX = {
  muted: false,
  init,
  play(name: string): void {
    for (const n of SFX_SCORES[name] ?? []) beep(n);
  },
  // 迁移的 8 个 + 新增 3 个（具名方法，规格签名）
  click(): void { SFX.play('click'); },
  coin(): void { SFX.play('coin'); },
  good(): void { SFX.play('good'); },
  bad(): void { SFX.play('bad'); },
  kp(): void { SFX.play('kp'); },
  levelup(): void { SFX.play('levelup'); },
  win(): void { SFX.play('win'); },
  lose(): void { SFX.play('lose'); },
  alarm(): void { SFX.play('alarm'); },
  heartbeat(): void { SFX.play('heartbeat'); },
  tinnitus(): void { SFX.play('tinnitus'); },
  /** 幽灵公司低鸣开关 */
  hum(on: boolean): void { setHum(on); },
  /** 静音开关（顶栏按钮挂载点）；开启静音时同步关掉 hum */
  setMuted(m: boolean): void {
    SFX.muted = m;
    if (m) setHum(false);
  },
  toggleMuted(): boolean {
    SFX.setMuted(!SFX.muted);
    return SFX.muted;
  }
};
