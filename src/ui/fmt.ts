// S7 共享格式化与纯函数工具：数字统一 ¥ 千分位 / 日志颜色映射 / 特殊日志识别。
// 全部纯函数（无 DOM），tests/s7.test.ts 直接覆盖。
import type { LogEntry, StateSlice } from '../core/types';

/** 千分位数字（与 S6 顶栏口径一致：en-US 分组） */
export function numFmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/**
 * [v0.10/W8] 事件弹窗 body 变量插值（纯函数）：
 * {cash} 现金 / {followers} 粉丝峰值 / {day} {month} 日期 / {runway} 跑道 /
 * {energy} {stress} 身心读数 / {mrr} 在营项目 MRR 合计——叙事里嵌实时数字。
 */
export function interpolateEventVars(body: string, s: Readonly<StateSlice>): string {
  const mrr = s.projects.filter(p => p.alive).reduce((a, p) => a + p.mrr, 0);
  return body
    .replace(/\{cash\}/g, `¥${numFmt(s.cash)}`)
    .replace(/\{followers\}/g, numFmt(s.stats.followersPeak))
    .replace(/\{day\}/g, String(s.meta.day))
    .replace(/\{month\}/g, String(s.meta.month))
    .replace(/\{runway\}/g, String(s.runway))
    .replace(/\{energy\}/g, String(Math.round(s.energy)))
    .replace(/\{stress\}/g, String(Math.round(s.stress)))
    .replace(/\{mrr\}/g, `¥${numFmt(mrr)}`);
}

/** 金额：¥1,234；负数 -¥1,234 */
export function yuan(n: number): string {
  return `${n < 0 ? '-' : ''}¥${numFmt(Math.abs(n))}`;
}

/** 百分比（整数，带 %） */
export function pct(n: number): string {
  return `${Math.round(n)}%`;
}

/** 0-100 → 10 段 segbar HTML（variant 传空串/seekbar 变体类名） */
export function segHtml(val: number, variant = '', segs = 10): string {
  const n = Math.max(1, segs);
  const on = Math.round(Math.max(0, Math.min(100, val)) / 100 * n);
  let html = '';
  for (let i = 0; i < n; i++) html += `<i${i < on ? ' class="on"' : ''}></i>`;
  return `<div class="segbar ${variant}">${html}</div>`;
}

/** 横向进度条（细条，用于技能进度/PMF 等连续值） */
export function barHtml(val: number, variant = ''): string {
  const v = Math.max(0, Math.min(100, val));
  return `<div class="bar ${variant}"><i style="width:${v}%"></i></div>`;
}

/** 日志 cls → 颜色（CSS 变量；未知 cls 落 dim 灰）——日志颜色映射纯函数 */
export function logColor(cls: string): string {
  switch (cls) {
    case 'sys': return 'var(--cyan)';
    case 'good': return 'var(--green)';
    case 'bad': return 'var(--red)';
    case 'gold': return 'var(--gold)';
    case 'purple': return 'var(--purple)';
    case 'pink': return 'var(--pink)';
    default: return 'var(--dim)';
  }
}

export interface LogAccent {
  tag: string;
  color: string;
  kpKey?: string; // 命中知识点词条（日志点击弹 KP 弹窗）
}

/**
 * 特殊日志识别（纯函数）：给【月结】【成就解锁】【阶段提升】【知识点】等
 * 系统行加前置徽标；返回 null = 普通经营行不加徽标。
 */
export function logAccent(msg: string): LogAccent | null {
  if (msg.startsWith('【月结】')) return { tag: '月结', color: 'var(--gold)' };
  if (msg.startsWith('【成就解锁】')) return { tag: '成就', color: 'var(--gold)' };
  if (msg.startsWith('【年度盘点】')) return { tag: '年度', color: 'var(--purple)' };
  if (msg.startsWith('【本周事实】')) return { tag: '复盘', color: 'var(--cyan)' };
  if (msg.startsWith('【假设】')) return { tag: '假设', color: 'var(--cyan)' };
  if (msg.startsWith('【建议】')) return { tag: '建议', color: 'var(--gold)' };
  if (msg.startsWith('【封号】') || msg.startsWith('【限流】')) return { tag: '平台', color: 'var(--red)' };
  if (msg.startsWith('【终局】')) return { tag: '终局', color: 'var(--red)' };
  if (msg.startsWith('【知识点')) return { tag: '知识点', color: 'var(--cyan)', kpKey: msg.replace(/^【知识点[·：:]?/, '').replace(/】.*$/, '').trim() };
  return null;
}

/** ProjectStage 徽章文案与色 */
export function projectStageBadge(stage: string): { label: string; cls: string } {
  const table: Record<string, { label: string; cls: string }> = {
    idea: { label: '想法', cls: '' },
    validate: { label: '验证', cls: '' },
    build: { label: '开发', cls: 'cyan' },
    launch: { label: '发布', cls: 'gold' },
    grow: { label: '增长', cls: 'gold' },
    mature: { label: '成熟', cls: 'green' },
    decline: { label: '衰退', cls: 'red' }
  };
  return table[stage] ?? { label: stage, cls: '' };
}

/** HTML 转义（与 main.ts renderLog 同规则） */
export function escapeHtml(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** LogEntry 类型再导出（避免视图层重复 import 路径写错） */
export type { LogEntry };
