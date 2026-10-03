// 循环 BGM（音乐工坊产出：tools/音乐工坊/output/opc/*.mp3，真·无缝循环渲染，
// 三遍取中段+接缝自检见 scripts/render_opc.py）。技术纪律：
// - 与 sfx 共用 AudioContext（同一时钟），遵守自动播放策略：首次交互后才出声
// - WebAudio bufferSource.loop：采样级精确循环，不依赖 MP3 gapless 的浏览器差异
// - 切曲=交叉淡入淡出；昼夜相=白天曲/夜曲；结局=好/坏两首
// - 游戏不因声音挂掉：fetch/decode 任何失败静默降级为无声
import { onMuteChange, sharedCtx } from './sfx';

export type BgmTrack = 'title' | 'day' | 'night' | 'good' | 'bad';

const SRC: Record<BgmTrack, string> = {
  title: 'bgm/opc_title.mp3',
  day: 'bgm/opc_day.mp3',
  night: 'bgm/opc_night.mp3',
  good: 'bgm/opc_ending_good.mp3',
  bad: 'bgm/opc_ending_bad.mp3'
};

const GAIN = 0.45;        // 垫底音量：-18 LUFS 母带 ×0.45 ≈ 落在芯片音效之下
const FADE = 1.2;         // 切曲交叉淡入淡出（秒）
const SOFT_IN = 0.8;      // 无声起步/静音恢复的缓起（秒）

interface Layer {
  track: BgmTrack;
  src: AudioBufferSourceNode;
  gain: GainNode;
}

let ctx: AudioContext | null = null;
let want: BgmTrack | null = null;   // 期望曲目（未解锁/静音/加载中也记账，恢复后即起）
let layer: Layer | null = null;
let muted = false;
const buffers = new Map<BgmTrack, AudioBuffer>();
const pending = new Map<BgmTrack, Promise<AudioBuffer | null>>();

function fetchBuffer(track: BgmTrack): Promise<AudioBuffer | null> {
  const hit = buffers.get(track);
  if (hit) return Promise.resolve(hit);
  const p = pending.get(track);
  if (p) return p;
  const job = (async (): Promise<AudioBuffer | null> => {
    try {
      const c = ctx;
      if (!c) return null;
      const res = await fetch(SRC[track]);
      if (!res.ok) return null;
      const buf = await c.decodeAudioData(await res.arrayBuffer());
      buffers.set(track, buf);
      return buf;
    } catch {
      return null; // 声音失败静默（游戏不因声音挂掉）
    }
  })();
  pending.set(track, job);
  return job;
}

function fadeOutAndStop(l: Layer, sec: number): void {
  const c = ctx;
  if (!c) return;
  try {
    const t = c.currentTime;
    l.gain.gain.cancelScheduledValues(t);
    l.gain.gain.setValueAtTime(l.gain.gain.value, t);
    l.gain.gain.linearRampToValueAtTime(0.0001, t + sec);
    l.src.stop(t + sec + 0.05);
    l.src.onended = () => { try { l.src.disconnect(); } catch { /* 静默 */ } };
  } catch {
    /* 静默 */
  }
}

function startTrack(track: BgmTrack): void {
  const c = ctx;
  if (!c || muted || want !== track) return;
  if (layer?.track === track) return;
  if (layer) {
    fadeOutAndStop(layer, FADE);
    layer = null;
  }
  void fetchBuffer(track).then(buf => {
    // 竞态保险：加载期间曲目可能又被切走/静音
    if (!buf || !ctx || muted || want !== track || layer?.track === track) return;
    try {
      const src = c.createBufferSource();
      const gain = c.createGain();
      src.buffer = buf;
      src.loop = true;
      const t = c.currentTime;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(GAIN, t + (layer ? FADE : SOFT_IN));
      src.connect(gain).connect(c.destination);
      src.start();
      layer = { track, src, gain };
    } catch {
      /* 静默 */
    }
  });
}

function unlock(): void {
  if (ctx) return;
  ctx = sharedCtx();
  if (ctx && want && !muted) startTrack(want);
}

export const BGM = {
  /** main.ts 启动时调用一次：绑定解锁监听 + 静音联动 */
  init(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    onMuteChange(m => BGM.setMuted(m));
  },
  play(track: BgmTrack): void {
    want = track;
    startTrack(track);
  },
  stop(): void {
    want = null;
    if (layer) {
      fadeOutAndStop(layer, FADE);
      layer = null;
    }
  },
  setMuted(m: boolean): void {
    muted = m;
    if (m) {
      if (layer) {
        fadeOutAndStop(layer, SOFT_IN);
        layer = null;
      }
    } else if (want) {
      startTrack(want);
    }
  }
};
