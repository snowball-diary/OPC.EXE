// 结局屏（S7）：五维人生报告（纯 CSS/SVG 雷达）+ verdict + overall + 关键数据 +
// 猝死特殊处理（黑屏 2s → 一行白字 → 报告，身心维度显示「——」）+ 成就清单 + 三个出口按钮。
// 渲染为全屏覆盖层（#end-overlay）：游戏屏 DOM 保留在下面，主动结局「继续经营」可原局回场。
// main.ts 的 showEnding 桩与状态页主动结局均调 renderEndingScreen(key)。
import { achCount } from '../core/achievements';
import { buildReport } from '../core/index';
import type { LifeReport, StateSlice } from '../core/types';import { ACHIEVEMENT_DEFS } from '../data/achievements.def';
import { ENDING_DEFS, findEnding, netWorth } from '../data/endings.def';
import { numFmt, yuan } from './fmt';
import { getGame } from './runtime';
import { getCtx } from './registry';
import { SFX } from './sfx';
import { clearModals } from './modal';
import { startScene, stopScene } from './scene';
import { clearSlot, saveToSlot } from '../save/save';

// ---------- 纯函数（tests/s7.test.ts 覆盖） ----------

export interface RadarPoint {
  x: number;
  y: number;
  label: string;
  value: number;
}

/** 五维雷达顶点（纯函数）：起始角 -90°（顶部），顺时针 72°/维，半径 = r × value/100 */
export function radarPoints(
  values: readonly { label: string; value: number }[],
  cx: number,
  cy: number,
  r: number
): RadarPoint[] {
  return values.map((v, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, values.length);
    const rr = (r * Math.max(0, Math.min(100, v.value))) / 100;
    return { x: cx + rr * Math.cos(a), y: cy + rr * Math.sin(a), label: v.label, value: v.value };
  });
}

export type EndingFlow = 'suddenIntro' | 'direct';

/** 猝死结局分支（纯函数）：suddenDeath → 黑屏 2s 引入；其余直接出报告 */
export function endingFlow(key: string): EndingFlow {
  return key === 'suddenDeath' ? 'suddenIntro' : 'direct';
}

/** 黑屏后的一行白字（纯函数）：仅猝死有；其余返回 null */
export function endingIntroLine(key: string): string | null {
  return key === 'suddenDeath' ? '……这一行之后，没有下一行了。' : null;
}

/** 主动结局（可「继续经营」）判定（纯函数）：endings.def type active 的 key */
export function isActiveEnding(key: string): boolean {
  return ENDING_DEFS.find(e => e.key === key)?.type === 'active';
}

/** 已解锁成就名列表（纯函数，读 flags 记账） */
export function unlockedAchievementNames(s: Readonly<StateSlice>): string[] {
  return ACHIEVEMENT_DEFS.filter(d => s.flags[`ach_${d.id}`] === true).map(d => d.name);
}

// ---------- 渲染 ----------

const DIM_LABELS: readonly { key: keyof LifeReport['dims']; label: string }[] = [
  { key: 'finance', label: '财务' },
  { key: 'career', label: '事业' },
  { key: 'relations', label: '关系' },
  { key: 'bodymind', label: '身心' },
  { key: 'meaning', label: '意义' }
];

function radarSvgHtml(report: LifeReport): string {
  const cx = 100;
  const cy = 105;
  const r = 78;
  const ringVals = [25, 50, 75, 100];
  const rings = ringVals.map(v => {
    const pts = radarPoints(ringVals.map(() => ({ label: '', value: v })), cx, cy, r);
    return `<polygon class="radar-ring" points="${pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" />`;
  }).join('');
  const axisPts = radarPoints(ringVals.map(() => ({ label: '', value: 100 })), cx, cy, r);
  const axisLines = axisPts
    .map(p => `<line class="radar-axis" x1="${cx}" y1="${cy}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" />`)
    .join('');
  const vals = DIM_LABELS.map(d => ({
    key: d.key,
    label: d.label,
    value: d.key === 'bodymind' && report.bodymindMissing ? 0 : report.dims[d.key]
  }));
  const pts = radarPoints(vals, cx, cy, r);
  const poly = `<polygon class="radar-data" points="${pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" />`;
  const dots = pts.map(p => `<circle class="radar-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" />`).join('');
  const labelPts = radarPoints(ringVals.map(() => ({ label: '', value: 120 })), cx, cy, r);
  const labels = labelPts.map((p, i) => {
    const d = vals[i];
    if (!d) return '';
    const text = report.bodymindMissing && d.key === 'bodymind' ? `${d.label} ——` : `${d.label} ${d.value}`;
    const anchor = Math.abs(p.x - cx) < 8 ? 'middle' : p.x > cx ? 'start' : 'end';
    return `<text class="radar-label" x="${p.x.toFixed(1)}" y="${(p.y + 4).toFixed(1)}" text-anchor="${anchor}">${text}</text>`;
  }).join('');
  return `<svg class="radar" viewBox="0 0 200 200" role="img" aria-label="五维人生雷达图">
    ${rings}${axisLines}${poly}${dots}${labels}
  </svg>`;
}

function factsHtml(s: Readonly<StateSlice>, report: LifeReport): string {
  const row = (k: string, v: string): string => `<div class="fact-row"><span>${k}</span><b>${v}</b></div>`;
  const ach = unlockedAchievementNames(s);
  return `
    <p class="verdict">${report.verdict}</p>
    <div class="overall-row">综合 <b class="px-num">${report.overall}</b> / 100　·　成就 <b class="px-num">${achCount(s)}</b>/${ACHIEVEMENT_DEFS.length}</div>
    <div class="fact-grid">
      ${row('生涯天数', `${numFmt(s.meta.day)} 天`)}
      ${row('净资产', yuan(Math.round(netWorth(s))))}
      ${row('累计收入', yuan(Math.round(s.stats.totalRevenue)))}
      ${row('累计缴税', yuan(Math.round(s.stats.taxesPaid)))}
      ${row('完成项目', `${s.stats.projectsDone} 个（失败 ${s.stats.projectsFailed}）`)}
      ${row('真实订单', `${numFmt(s.stats.orders)} 单`)}
      ${row('粉丝峰值', numFmt(s.stats.followersPeak))}
      ${row('最低日 / 扩展日', `${s.stats.minDays} / ${s.stats.daysWorkedOut}`)}
      ${row('System1 天数', `${s.stats.s1Days} 天`)}
      ${row('大爆次数', `${s.stats.bigHits} 次`)}
    </div>
    ${report.bodymindMissing ? '<p class="missing-note">身心维度显示「——」：猝死没有事后数据。这份报告只对活着的人完整。</p>' : ''}
    <div class="ach-strip">${ach.length > 0 ? ach.map(a => `<span class="ach-chip">${a}</span>`).join('') : '<span class="ach-chip dim">本次生涯没有解锁成就</span>'}</div>`;
}

function endOverlayInnerHtml(key: string): string {
  const g = getGame();
  const def = findEnding(key);
  const s = g?.state;
  const report = s ? buildReport(s) : null;
  const text = def ? (typeof def.text === 'function' && s ? def.text(s) : def.text) : `结局「${key}」……`;
  const cls = `c-${def?.color ?? 'sys'}`;
  return `
    <div class="end-inner">
      <p class="end-note">// OPC.exe 已关机 · 五维人生报告</p>
      <h1 class="end-title ${cls}">${def?.name ?? key}</h1>
      <p class="end-desc">${text}</p>
      <div class="end-grid px-frame">
        <div class="radar-wrap">${report ? radarSvgHtml(report) : '<p class="missing-note">报告数据缺失</p>'}</div>
        <div class="end-facts">${s && report ? factsHtml(s, report) : ''}</div>
      </div>
      <div class="title-btns">
        <button class="px-btn" id="btn-export-save">导出存档</button>
        ${isActiveEnding(key) ? '<button class="px-btn green" id="btn-continue">继续经营（主动结局可回头）</button>' : ''}
        <button class="px-btn gold" id="btn-restart">再 来 一 局</button>
      </div>
      <p class="end-credit">OPC.exe © 2026 赖嘉诚 (Lai Jiacheng) · <a href="https://laijiacheng.com" target="_blank" rel="noopener">laijiacheng.com</a></p>
    </div>`;
}

function bindOverlayButtons(overlay: HTMLElement): void {
  overlay.querySelector<HTMLButtonElement>('#btn-restart')?.addEventListener('click', () => {
    SFX.click();
    window.location.reload(); // 回标题屏（全量重开机，最干净）
  });
  overlay.querySelector<HTMLButtonElement>('#btn-export-save')?.addEventListener('click', () => {
    const g = getGame();
    if (!g) return;
    SFX.coin();
    const blob = new Blob([JSON.stringify(g.serialize(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `opc-save-day${g.state.meta.day}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  overlay.querySelector<HTMLButtonElement>('#btn-continue')?.addEventListener('click', () => {
    const g = getGame();
    if (!g) return;
    SFX.good();
    // 主动结局回头（任务指定）：解除 over，清理结局触发 flag（否则下一天被动轮询会立刻再终局），
    // 过劳计数复位，存档，撤覆盖层，原局回场。[S8] 修「继续经营后被结局 immediately 拖回」缝
    g.state.meta.over = false;
    g.state.meta.endingKey = undefined;
    for (const f of ['retireChosen', 'sellChosen', 'handoverChosen', 'pivotRestartChosen', 'backToWorkChosen']) {
      delete g.state.flags[f];
    }
    (g.state as StateSlice).burnoutCount = 0; // 过劳计数复位（burnoutDown 被动轮询不会再立刻拖回终局）
    saveToSlot('auto', g.state);
    overlay.remove();
    const canvas = document.getElementById('scene');
    if (canvas) startScene(canvas as HTMLCanvasElement);
    const ctx = getCtx();
    if (ctx) ctx.dispatch({ t: 'dayType', dt: ctx.state.dayType }); // uiDispatch 尾部自带 refreshUi
  });
}

function removeExistingOverlay(): void {
  document.getElementById('end-overlay')?.remove();
}

/**
 * 结局屏渲染入口（main.ts showEnding 桩的落地 + 状态页主动结局共用）。
 * 猝死：黑屏 2s → 一行白字 → 报告；其余直接出报告。
 */
export function renderEndingScreen(key: string): void {
  stopScene();
  clearModals();
  document.body.className = '';
  removeExistingOverlay();
  const def = findEnding(key);
  // [v0.10/W5] 终局型结局（非 active）→ 立即清除 auto 槽：标题屏「继续经营」不能再读回已结束的档；
  // 主动结局保留存档（「继续经营」回头入口需要它）。
  if (!isActiveEnding(key)) clearSlot('auto');
  if (def?.color === 'bad') SFX.lose();
  else SFX.win();

  const overlay = document.createElement('div');
  overlay.id = 'end-overlay';

  if (endingFlow(key) === 'suddenIntro') {
    overlay.className = 'end-black';
    overlay.innerHTML = `<p class="end-white-line">${endingIntroLine(key) ?? ''}</p>`;
    document.body.appendChild(overlay);
    window.setTimeout(() => {
      if (!overlay.isConnected) return;
      overlay.className = '';
      overlay.innerHTML = endOverlayInnerHtml(key);
      bindOverlayButtons(overlay);
    }, 2000);
    return;
  }
  overlay.innerHTML = endOverlayInnerHtml(key);
  document.body.appendChild(overlay);
  bindOverlayButtons(overlay);
}
