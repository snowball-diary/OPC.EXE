// 像素办公室场景（S6）：192×108 canvas，CSS width:100% + image-rendering:pixelated。
// 自原型「一人公司物语-增强版.html」drawScene 全量移植，并按技术文档 §13 升级：
//   昼夜四相（按当日 AP 余量）/ 桌角智能体小人（雇佣即出现，butler 悬浮）/
//   幽灵公司（角色移沙发位、机器人围绕桌子）/ System1 抖动 ±1px / 压力红滤镜 /
//   energy<20 闭眼 / hiddenFatigue≥70 眼下发黑 / 窗外天际线随 location /
//   结局：suddenDeath 黑屏渐隐，其余定格。弹窗打开或页面不可见时暂停动画时钟。
// 状态→视觉映射表 SCENE_MAP 集中维护（单测校验键完整性）。

import type { StateSlice } from '../core/index';
import type { AgentId } from '../core/types';
import { apMaxFor } from '../core/health';
import { findLocation } from '../data/locations.def';
import { getGame } from './runtime';
import { isOpen as modalOpen } from './modal';

// ---------- 状态→视觉映射表（tests/s6.test.ts 校验） ----------

export const SCENE_MAP: Record<string, string> = {
  phase0_day: 'AP 充沛：蓝天白云（ap/apMax > 2/3）',
  phase1_afternoon: '午后：浅蓝天光（ap/apMax > 1/3）',
  phase2_dusk: '黄昏：橙金天光 + 暖色滤镜（ap > 0）',
  phase3_night: '深夜：星空 + 月亮 + 台灯光晕 + 全屏压暗（ap = 0）',
  skyline_tier1: '默认城市：高楼天际线（一线/新一线/二线/小城）',
  skyline_overseas: '海外：棕榈树天际线',
  skyline_nomad: '游牧/旅居：山脉天际线',
  stress_high_red: 'stress≥70：红色滤镜 + 角色红衣',
  stress_mid_orange: 'stress 40-69：角色橙衣',
  energy_low_eyes: 'energy<20：角色双眼闭合',
  fatigue_undereye: 'hiddenFatigue≥70：角色眼下发黑像素',
  s1_shake: 'system1：全场景 ±1px 随机抖动',
  s1deep_shake: 'system1Deep：±1px 抖动（叠加 body.s1-deep CSS 滤镜）',
  agent_bot_hired: '每雇佣一个 agent 桌角/地面画 6×8 机器人（色相按 AgentId）',
  agent_butler_hover: 'butler 悬浮在显示器上方，带呼吸浮动',
  ghost_company: 'flags.ghostCompany：角色移到沙发位，机器人围绕桌子（自动化可视化）',
  monitor_mode: 'setSceneActivity 切换显示器屏幕动画（idle/build/market/deliver/auto/rest/learn/network）',
  ending_suddendeath: 'meta.over 且 endingKey=suddenDeath：全屏黑幕渐隐',
  ending_other_freeze: 'meta.over 其他结局：动画时钟定格（画面静止）',
  modal_pause: '弹窗打开：动画时钟暂停（画面静止，不阻塞引擎）',
  hidden_page: 'document.hidden：整帧跳绘（自动暂停，省电）'
};

/** 场景必须实现的映射键（单测） */
export const REQUIRED_SCENE_KEYS: string[] = Object.keys(SCENE_MAP);

export type SceneMode =
  | 'idle' | 'build' | 'market' | 'deliver' | 'auto' | 'rest' | 'learn' | 'network' | 'other';

/** 智能体小人色相（按 AgentId） */
export const AGENT_COLORS: Record<AgentId, string> = {
  support: '#4ecdc4',
  growth: '#7bf1a8',
  content: '#ff8fab',
  sales: '#f6c453',
  legalfin: '#b8a9ff',
  regagent: '#ff6b6b',
  butler: '#e8e6f0'
};

/** 昼夜四相（纯函数）：按当日 AP 余量比例。0=白天 1=午后 2=黄昏 3=深夜 */
export function dayPhaseOf(ap: number, apMax: number): 0 | 1 | 2 | 3 {
  if (apMax <= 0 || ap <= 0) return 3;
  const r = ap / apMax;
  if (r > 2 / 3) return 0;
  if (r > 1 / 3) return 1;
  return 2;
}

// ---------- 画布运行时 ----------

interface SceneRT {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  raf: number;
  t: number;        // 动画时钟（可暂停/定格）
  last: number;     // 上一帧时间戳
  activity: SceneMode;
  fade: number;     // suddenDeath 黑幕 0→1
  frozen: boolean;  // 非 suddenDeath 结局定格
}

let rt: SceneRT | null = null;

/** 显示器屏幕内容（S7 行动视图可调用） */
export function setSceneActivity(m: SceneMode): void {
  if (rt) rt.activity = m;
}

function px(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string): void {
  c.fillStyle = col;
  c.fillRect(x, y, w, h);
}

const SKIES = [
  ['#8fd3f4', '#fdfbb6'], // 白天
  ['#5eb6e8', '#fff3c4'], // 午后
  ['#e88a5e', '#f6c453'], // 黄昏
  ['#1b2340', '#f4f4f4']  // 深夜
] as const;

/** 智能体小人（6×8，含 1px 视觉余量），x/y 为脚底中心 */
function drawBot(c: CanvasRenderingContext2D, x: number, yFeet: number, color: string, bob: number): void {
  const yy = yFeet + bob;
  px(c, x + 2, yy - 8, 2, 1, color);            // 天线
  px(c, x, yy - 7, 6, 3, color);                // 头
  px(c, x + 1, yy - 6, 4, 1, '#0d0d16');        // 视觉罩
  px(c, x + 1, yy - 4, 4, 3, color);            // 身体
  px(c, x + 1, yy - 1, 1, 1, color);            // 腿
  px(c, x + 4, yy - 1, 1, 1, color);
}

/** 窗外天际线（随 location 变色）：窗内区域约 x14-46 / y12-38 */
function drawSkyline(c: CanvasRenderingContext2D, s: StateSlice, phase: number): void {
  const tier = findLocation(s.location)?.tier ?? '';
  const silhouette = phase === 3 ? '#0e1230' : phase === 2 ? '#5a3a52' : '#2a3550';
  if (tier.includes('海外')) {
    // 棕榈树
    px(c, 20, 26, 2, 12, '#6a4a2a');
    px(c, 16, 22, 10, 2, '#3f9d5a');
    px(c, 18, 20, 6, 2, '#4ec46a');
    px(c, 34, 28, 2, 10, '#6a4a2a');
    px(c, 30, 24, 10, 2, '#3f9d5a');
    px(c, 44, 30, 2, 8, '#6a4a2a');
  } else if (tier.includes('游牧') || tier.includes('旅居')) {
    // 山脉
    px(c, 14, 34, 6, 2, silhouette);
    px(c, 16, 32, 4, 2, silhouette);
    px(c, 18, 30, 2, 2, silhouette);
    px(c, 26, 36, 8, 2, silhouette);
    px(c, 28, 34, 4, 2, silhouette);
    px(c, 38, 34, 8, 2, silhouette);
    px(c, 40, 32, 4, 2, silhouette);
    px(c, 42, 31, 2, 1, '#f4f4f4'); // 雪顶
  } else {
    // 高楼（默认：一线/新一线/二线/小城）
    const hs = [14, 20, 11, 17, 23, 9];
    hs.forEach((h, i) => {
      px(c, 15 + i * 5, 38 - h, 3, h, silhouette);
      if (h > 12) px(c, 16 + i * 5, 40 - h, 1, 1, phase === 3 ? '#f6c453' : '#8fd3f4');
    });
  }
}

/** 显示器屏幕动画（原型移植） */
function drawMonitorScreen(c: CanvasRenderingContext2D, mode: SceneMode, t: number, phase: number): void {
  const scrC = phase === 3 ? '#3fd0c9' : '#4ecdc4';
  px(c, 82, 46, 16, 11, mode === 'idle' ? '#16324a' : '#0d2438');
  if (mode === 'build' || mode === 'idle') {
    for (let i = 0; i < 4; i++) px(c, 84, 48 + i * 2, 3 + ((i * 5 + Math.floor(t / 300)) % 9), 1, scrC);
  } else if (mode === 'market') {
    px(c, 84, 53, 2, 3, '#7bf1a8'); px(c, 87, 51, 2, 5, '#7bf1a8');
    px(c, 90, 48, 2, 8, '#7bf1a8'); px(c, 93, 45, 2, 11, '#f6c453');
  } else if (mode === 'deliver') {
    px(c, 86, 49, 8, 6, '#f6c453'); px(c, 88, 51, 2, 2, '#1a1c2c');
  } else if (mode === 'auto') {
    const r = Math.floor(t / 200) % 2;
    px(c, 86, 48, 8, 8, '#b8a9ff'); px(c, 88 + (r ? 1 : 0), 50, 4, 4, '#0d2438');
  } else if (mode === 'rest') {
    px(c, 84, 48, 4, 2, '#8a87a8'); px(c, 88, 50, 5, 2, '#8a87a8'); px(c, 90, 52, 6, 2, '#8a87a8');
  } else if (mode === 'learn') {
    px(c, 84, 48, 5, 7, '#f4f4f4'); px(c, 91, 48, 5, 7, '#f4f4f4'); px(c, 89, 48, 2, 7, '#8a87a8');
  } else if (mode === 'network') {
    px(c, 85, 48, 3, 3, '#ff8fab'); px(c, 90, 47, 3, 3, '#7bf1a8'); px(c, 88, 52, 3, 3, '#b8a9ff');
  }
  if (Math.floor(t / 500) % 2) px(c, 95, 54, 1, 2, scrC); // 光标闪烁
}

/** 主绘制帧 */
function drawFrame(sc: SceneRT): void {
  const g = getGame();
  const c = sc.ctx;
  c.clearRect(0, 0, 192, 108);
  if (!g) {
    px(c, 0, 0, 192, 108, '#14141f');
    return;
  }
  const s = g.state;
  const t = sc.t;

  // 结局分支：suddenDeath 渐隐 / 其他定格
  if (s.meta.over && s.meta.endingKey === 'suddenDeath') {
    sc.fade = Math.min(1, sc.fade + 0.015);
  } else if (s.meta.over && !sc.frozen) {
    sc.frozen = true; // 定格：t 不再推进（循环里已停时钟，这里保证标记）
  }

  const phase = dayPhaseOf(s.ap, apMaxFor(s.dayType, s));
  const skyPair = SKIES[phase];
  const sky = skyPair[0];
  const celestial = skyPair[1];
  const bob = Math.floor(t / 450) % 2;
  const catOff = Math.floor(t / 700) % 2;
  const typing = sc.activity !== 'idle' && sc.activity !== 'rest';

  // 背景（支持 s1 抖动：±1px 随机平移）
  c.save();
  if (s.decisionMode === 'system1' || s.decisionMode === 'system1Deep') {
    c.translate(Math.round((Math.random() - 0.5) * 2), Math.round((Math.random() - 0.5) * 2));
  }
  px(c, 0, 0, 192, 108, '#2a2340');
  px(c, 0, 64, 192, 44, '#3a2f4a');
  for (let i = 0; i < 12; i++) px(c, i * 16, 64, 8, 2, '#443a58');
  // 窗 + 天际线
  px(c, 12, 10, 36, 30, '#1a1c2c');
  px(c, 14, 12, 32, 26, sky);
  drawSkyline(c, s, phase);
  if (phase === 3) {
    px(c, 36, 16, 6, 6, celestial); // 月亮
    px(c, 20, 18, 1, 1, '#fff'); px(c, 28, 26, 1, 1, '#fff'); px(c, 40, 30, 1, 1, '#fff');
  } else {
    px(c, 34, 16, 7, 7, celestial); // 太阳
  }
  px(c, 29, 12, 2, 26, '#1a1c2c'); px(c, 14, 24, 32, 2, '#1a1c2c');
  // 海报
  px(c, 150, 12, 22, 28, '#1a1c2c'); px(c, 152, 14, 18, 24, '#f6c453');
  px(c, 154, 17, 14, 3, '#1a1c2c'); px(c, 154, 23, 10, 2, '#1a1c2c');
  px(c, 154, 28, 12, 2, '#1a1c2c'); px(c, 154, 33, 7, 2, '#1a1c2c');
  // 书架
  px(c, 58, 16, 44, 4, '#5a4632');
  const books = ['#ff6b6b', '#4ecdc4', '#7bf1a8', '#b8a9ff', '#f6c453', '#ff8fab'];
  books.forEach((col, i) => px(c, 61 + i * 7, 8 + (i % 2), 4, 8 - (i % 2), col));
  // 绿植
  px(c, 168, 86, 12, 10, '#8a5a3a');
  px(c, 170, 78, 3, 9, '#3f9d5a'); px(c, 175, 74, 3, 13, '#4ec46a'); px(c, 179, 79, 3, 8, '#3f9d5a');
  // 地毯与猫
  px(c, 118, 88, 52, 12, '#5a3a5e'); px(c, 122, 91, 44, 6, '#6e4a72');
  px(c, 140, 92, 14, 5, '#e8b96a'); px(c, 152, 90, 5, 5, '#e8b96a');
  px(c, 152, 88, 2, 2, '#e8b96a'); px(c, 155, 88, 2, 2, '#e8b96a');
  px(c, 136, 91, 4, 2, '#e8b96a');
  if (catOff) { px(c, 157, 84, 2, 2, '#8a87a8'); px(c, 160, 81, 2, 2, '#8a87a8'); }
  // 书桌
  px(c, 60, 60, 58, 5, '#7a5a3a');
  px(c, 62, 65, 4, 24, '#5a4632'); px(c, 112, 65, 4, 24, '#5a4632');
  px(c, 74, 66, 16, 4, '#4a3a2a');
  // 台灯（夜晚亮）
  px(c, 110, 48, 2, 12, '#8a87a8'); px(c, 106, 44, 10, 4, '#f6c453');
  if (phase === 3) {
    px(c, 104, 48, 14, 12, 'rgba(246,196,83,.18)');
    px(c, 100, 60, 22, 8, 'rgba(246,196,83,.10)');
  }
  // 显示器
  px(c, 80, 44, 20, 15, '#1a1c2c');
  drawMonitorScreen(c, sc.activity, t, phase);
  px(c, 88, 59, 4, 2, '#1a1c2c');

  // 智能体小人（桌角/地面；butler 悬浮在显示器上方）
  const hired = s.agents;
  const slots: readonly (readonly [number, number])[] =
    [[98, 60], [64, 60], [126, 88], [134, 88], [142, 88], [150, 88]];
  let slot = 0;
  for (const a of hired) {
    if (a.id === 'butler') {
      drawBot(c, 86, 40 + (catOff ? 1 : 0), AGENT_COLORS.butler, 0);
      px(c, 83, 42, 12, 1, 'rgba(232,230,240,.25)'); // 悬浮光晕
      continue;
    }
    const pos = slots[slot];
    if (!pos) break;
    drawBot(c, pos[0], pos[1], AGENT_COLORS[a.id] ?? '#8a87a8', catOff);
    slot += 1;
  }

  // 角色：ghostCompany → 沙发位（自动化可视化）；否则桌前
  const skin = '#f2c89b';
  const hair = '#3a2a20';
  const shirtColor = s.stress >= 70 ? '#ff6b6b' : s.stress >= 40 ? '#c8823c' : '#4ecdc4';
  if (s.flags.ghostCompany === true) {
    // 沙发
    px(c, 122, 66, 28, 4, '#5a3a5e');
    px(c, 122, 70, 28, 12, '#6e4a72');
    px(c, 120, 70, 3, 12, '#4a2f52'); px(c, 149, 70, 3, 12, '#4a2f52');
    // 角色瘫在沙发上（闭眼休息）
    px(c, 132, 62 + bob, 7, 6, skin);
    px(c, 131, 61 + bob, 9, 3, hair);
    px(c, 133, 64 + bob, 3, 1, '#1a1c2c'); // 闭眼
    px(c, 131, 68 + bob, 10, 9, shirtColor);
    px(c, 130, 74 + bob, 12, 3, '#3a3a5a');
    px(c, 138, 58 + bob, 2, 2, '#8a87a8'); // zzz
    px(c, 141, 55 + bob, 2, 2, '#b8a9ff');
  } else {
    // 座椅
    px(c, 66, 68, 10, 4, '#3a3a5a'); px(c, 70, 72, 2, 16, '#3a3a5a');
    px(c, 67, 46 + bob, 7, 6, skin);
    px(c, 66, 45 + bob, 9, 3, hair);
    px(c, 66, 48 + bob, 2, 2, hair);
    if (s.energy < 20) {
      px(c, 69, 50 + bob, 2, 1, '#1a1c2c'); // 双眼闭合
      px(c, 71, 50 + bob, 2, 1, '#1a1c2c');
    } else {
      px(c, 71, 49 + bob, 1, 1, '#1a1c2c');
    }
    if (s.health.hiddenFatigue >= 70) {
      px(c, 69, 51 + bob, 1, 1, '#6a5a7a'); // 眼下发黑
      px(c, 72, 51 + bob, 1, 1, '#6a5a7a');
    }
    px(c, 66, 52 + bob, 9, 9, shirtColor);
    if (typing) {
      px(c, 75, 54 + bob, 6, 2, skin); px(c, 75, 57 + bob, 6, 2, skin);
    } else {
      px(c, 75, 54 + bob, 3, 2, skin); px(c, 64, 54 + bob, 2, 6, shirtColor);
    }
  }
  c.restore();

  // 滤镜层（不参与抖动）
  if (phase === 3) { c.fillStyle = 'rgba(13,13,30,.35)'; c.fillRect(0, 0, 192, 108); }
  if (phase === 2) { c.fillStyle = 'rgba(232,138,94,.10)'; c.fillRect(0, 0, 192, 108); }
  if (s.stress >= 70) { c.fillStyle = 'rgba(255,107,107,.15)'; c.fillRect(0, 0, 192, 108); }
  if (sc.fade > 0) { c.fillStyle = `rgba(0,0,0,${sc.fade})`; c.fillRect(0, 0, 192, 108); }
}

function loop(now: number): void {
  if (!rt) return;
  const g = getGame();
  const over = g?.state.meta.over === true;
  const sudden = over && g?.state.meta.endingKey === 'suddenDeath';
  const paused = modalOpen() || document.hidden || (over && !sudden); // 定格结局时钟停走
  if (!paused) rt.t += now - rt.last;
  rt.last = now;
  if (!document.hidden) drawFrame(rt);
  rt.raf = requestAnimationFrame(loop);
}

/** 游戏屏挂载时启动（幂等：重复调用先停旧循环） */
export function startScene(canvas: HTMLCanvasElement): void {
  stopScene();
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  rt = { canvas, ctx, raf: 0, t: 0, last: performance.now(), activity: 'idle', fade: 0, frozen: false };
  rt.raf = requestAnimationFrame(loop);
}

export function stopScene(): void {
  if (rt) cancelAnimationFrame(rt.raf);
  rt = null;
}

/** 供测试：场景目标画布尺寸 */
export const SCENE_SIZE = { w: 192, h: 108 } as const;
