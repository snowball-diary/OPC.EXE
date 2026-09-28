// 顶栏（S6）：第 N 天/年 · OS 版本（stage 映射）· 现金（负债红）· 精力条 · AP ·
// 注意力 · 压力 · 经济周期 · 新闻条（NEWS_TICKER 当天及 3 日内）· 疲劳横幅 · 静音。
// 数据组装抽成纯函数（makeTopbarModel / pickNews / makeFatigueModel / stageVersion）供单测。

import type { DecisionMode, StateSlice } from '../core/index';
import type { EconomyPhase, Stage } from '../core/types';
import { dailyNet } from '../core/economy';
import { apMaxFor, fatigueWarning, suddenDeathRisk } from '../core/health';
import { NEWS_TICKER } from '../data/events.def';
import { SFX } from './sfx';
import { iconHtml } from './icons';
import { enqueueNotice, processQueue } from './modal';

// ---------- 纯函数（tests/s6.test.ts 覆盖） ----------

export const PHASE_LABELS: Record<EconomyPhase, string> = {
  boom: '繁荣',
  overheat: '过热',
  recession: '衰退',
  recovery: '复苏'
};

/** stage → OS 版本号（v0.1 → v3.0） */
export function stageVersion(stage: Stage): string {
  const table: Record<Stage, string> = {
    1: 'v0.1', 2: 'v0.5', 3: 'v1.0', 4: 'v1.5', 5: 'v2.0', 6: 'v3.0'
  };
  return table[stage] ?? 'v0.1';
}

/**
 * 新闻条（纯函数，[v0.10/W6] 每日轮换一条）：
 * 池 = day 及之前发布的全部条目（按 day 升序）。day1 只显锚点。
 * [v0.10/体感修复] 旧版 pool[(day-1)%len] 在池扩容日模数跳变，会同一条新闻连挂两天
 * （90 天实测撞 3 次）；且只修模数还会把撞车转嫁到次日。改为「游标逐日 +1、按当日池长取模」：
 * 任意相邻两天必然不同条，池稳定时每 len 天完整轮换一圈。day<1 或空池返回 []。
 */
export function pickNews(ticker: readonly { day: number; text: string }[], day: number): string[] {
  if (day < 1) return [];
  const pool = ticker.filter(n => n.day <= day).sort((a, b) => a.day - b.day);
  if (pool.length === 0) return [];
  let cursor = 0;
  for (let d = 2; d <= day; d++) {
    const len = pool.filter(n => n.day <= d).length;
    if (len > 0) cursor = (cursor + 1) % len;
  }
  const item = pool[cursor];
  return item ? [item.text] : [];
}

/**
 * 近 N 日新闻列表（纯函数，[v0.10/W6]）：发布日落入 (day-N, day] 窗口的条目，新的在前。
 * 点击顶栏新闻条 → 弹窗展示完整文案 + 这份列表。
 */
export function newsHistory(ticker: readonly { day: number; text: string }[], day: number, n = 7): { day: number; text: string }[] {
  return ticker
    .filter(x => x.day <= day && day - x.day < n)
    .sort((a, b) => b.day - a.day)
    .slice(0, n);
}

export interface FatigueModel {
  level: 1 | 2;
  text: string;
  riskPct: number; // suddenDeathRisk 百分比（前置不满足恒 0，§7.3 公开显示）
}

/** 双强预警横幅模型（纯函数）：fatigueWarning 非空才显示 */
export function makeFatigueModel(s: Readonly<StateSlice>): FatigueModel | null {
  const w = fatigueWarning(s);
  if (!w) return null;
  return { level: w.level, text: w.text, riskPct: Math.round(suddenDeathRisk(s) * 100) };
}

export interface TopbarModel {
  day: number;
  week: number;
  month: number;
  year: number;
  stage: Stage;
  version: string;
  cash: number;
  cashNegative: boolean;
  cashText: string;
  energy: number;
  ap: number;
  apMax: number;
  attentionCap: number;
  stress: number;
  phase: EconomyPhase;
  phaseLabel: string;
  decisionMode: DecisionMode;
  news: string[];
  fatigue: FatigueModel | null;
  muted: boolean;
}

const MODE_LABEL: Record<DecisionMode, string> = {
  system2: '系统2 · 理性',
  system1: '系统1 · 应激',
  system1Deep: '系统1 · 深度'
};

/** 顶栏数据模型（纯函数）；extraTicker：运行期追加新闻（DayReport.news 等当日预警优先于轮换条） */
export function makeTopbarModel(
  s: Readonly<StateSlice>,
  extraTicker: readonly { day: number; text: string }[] = []
): TopbarModel {
  return {
    day: s.meta.day,
    week: s.meta.week,
    month: s.meta.month,
    year: s.meta.year,
    stage: s.meta.stage,
    version: stageVersion(s.meta.stage),
    cash: s.cash,
    cashNegative: s.cash < 0,
    // [v0.10/W8] 修复负数格式：-¥500（此前会渲染成 ¥-500）
    cashText: `${s.cash < 0 ? '-' : ''}¥${Math.round(Math.abs(s.cash)).toLocaleString('en-US')}${s.debt > 0 ? `（负债 ¥${Math.round(s.debt).toLocaleString('en-US')}）` : ''}`,
    energy: s.energy,
    ap: s.ap,
    apMax: apMaxFor(s.dayType, s),
    attentionCap: s.attentionCap,
    stress: s.stress,
    phase: s.economyPhase,
    phaseLabel: PHASE_LABELS[s.economyPhase] ?? '—',
    decisionMode: s.decisionMode,
    // [v0.10/W6] 当日预警（DayReport.news）置顶 + 每日轮换一条 NEWS_TICKER
    news: [
      ...extraTicker.filter(e => e.day === s.meta.day).map(e => e.text),
      ...pickNews(NEWS_TICKER, s.meta.day)
    ],
    fatigue: makeFatigueModel(s),
    muted: SFX.muted
  };
}

// ---------- DOM 渲染 ----------

function segHtml(val: number, variant: string): string {
  const n = 10;
  const on = Math.round(Math.max(0, Math.min(100, val)) / 100 * n);
  const segs = Array.from({ length: n }, (_, i) => `<i${i < on ? ' class="on"' : ''}></i>`).join('');
  return `<div class="segbar ${variant}">${segs}</div>`;
}

function statHtml(icon: string, label: string, inner: string): string {
  return `<div class="stat px-frame">${iconHtml(icon)}<div><div class="l">${label}</div><div class="v">${inner}</div></div></div>`;
}

/** 渲染顶栏 + 疲劳横幅到 #topbar（每次 refreshUi 全量重建） */
export function renderTopbar(s: Readonly<StateSlice>, extraTicker: readonly { day: number; text: string }[] = []): void {
  const el = document.getElementById('topbar');
  if (!el) return;
  const m = makeTopbarModel(s, extraTicker);
  const newsText = m.news.length > 0 ? m.news.join('　◆　') : '一人公司广播：今天没有头条，把今天过好。';
  // [v0.10/W2] 现金 hover 显示今日净流（财务 Tab 首行为完整分项版）
  const net = dailyNet(s.dailyFlow);
  const lastNet = typeof s.flags.lastDayNet === 'number' ? s.flags.lastDayNet : null;
  const cashTitle = `今日净流 ${net >= 0 ? '+' : ''}¥${Math.round(net).toLocaleString('en-US')}${lastNet !== null ? ` · 昨日 ${lastNet >= 0 ? '+' : ''}¥${lastNet.toLocaleString('en-US')}` : ''}（详情见财务 Tab）`;
  el.innerHTML = `
    <div class="topbar-row">
      ${statHtml('cal', `第 ${m.day} 天 / 第 ${m.year} 年`, `${m.version} · 周${m.week} · 月${m.month}`)}
      ${statHtml('coin', m.cashNegative ? '现金（负债）' : '现金', `<span class="${m.cashNegative ? 'neg' : ''}" title="${cashTitle}">${m.cashText}</span>`)}
      ${statHtml('bolt', `精力 · AP ${m.ap}/${m.apMax}`, segHtml(m.energy, m.energy < 25 ? 'warn' : ''))}
      ${statHtml('msg', `注意力槽 ${m.attentionCap}`, segHtml(Math.min(100, m.attentionCap * 20), 'cyan'))}
      ${statHtml('heart', '压力', segHtml(m.stress, m.stress >= 60 ? 'warn' : 'orange'))}
      ${statHtml('moon', `周期 · ${m.phaseLabel}`, `<span class="mode-tag mode-${m.decisionMode}">${MODE_LABEL[m.decisionMode]}</span>`)}
      <button class="px-btn" id="btn-mute" title="静音开关">${iconHtml(m.muted ? 'mute' : 'snd')}</button>
    </div>
    <div class="news-ticker"><span class="news-tag">${iconHtml('news')}</span><div class="news-scroll"><span class="news-inner">${newsText}</span></div></div>
    ${m.fatigue ? fatigueBannerHtml(m.fatigue) : ''}
  `;
  const muteBtn = el.querySelector<HTMLButtonElement>('#btn-mute');
  muteBtn?.addEventListener('click', () => {
    SFX.toggleMuted();
    renderTopbar(s);
  });
  // [v0.10/W6] 点击新闻条 → 完整文案 + 近 7 日新闻列表（复用 Notice 弹窗）
  const tickerBtn = el.querySelector<HTMLDivElement>('.news-ticker');
  tickerBtn?.addEventListener('click', () => {
    SFX.click();
    const rotated = pickNews(NEWS_TICKER, s.meta.day)[0] ?? '今天没有头条。';
    const week = newsHistory([...NEWS_TICKER, ...extraTicker], s.meta.day, 7);
    const lines = week.map(n => `第 ${n.day} 天 · ${n.text}`).join('\n');
    enqueueNotice('一人公司广播 · 近 7 日', `${rotated}\n\n———— 近 7 日 ————\n${lines || '（近 7 日无播报）'}`, 'sys');
    processQueue();
  });
}

/** 疲劳横幅（level2 黑底红字闪烁） */
export function fatigueBannerHtml(f: FatigueModel): string {
  const risk = f.riskPct > 0 ? `　◆　当前风险 ${f.riskPct}%` : '';
  return `<div id="fatigue-banner" class="fatigue-banner level${f.level}">⚠ ${f.text}${risk}</div>`;
}
