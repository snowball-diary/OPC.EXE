// 状态视图（S7）：本体五元（健康四子+合成+隐性疲劳/信息/认知/品性/技能五维×四级进度）
// + 衍生四元 + 决策模式徽章 + 阶段/恢复状态机 + 道德/合规/信用 + 周焦点
// + 「主动结局」区（stage≥4，二次确认）+ 存档与系统（saves.ts）。
import type { UiCtx } from '../registry';
import { registerView } from '../registry';
import { apMaxFor, composeHealth, recoveryState, suddenDeathRisk } from '../../core/health';
import type { RecoveryPhase, SkillDim, StateSlice } from '../../core/types';
import { checkPassiveEndings, applyEnding } from '../../core/endings';
import { findEnding } from '../../data/endings.def';
import { BOTTLENECK_LABELS } from '../../core/time';
import { stageVersion } from '../topbar';
import { saveToSlot } from '../../save/save';
import { renderEndingScreen } from '../ending';
import { barHtml, escapeHtml, pct, segHtml, yuan } from '../fmt';
import { renderSaveSection, slotSummary } from './saves';
import { loadSlot } from '../../save/save';
import { SFX } from '../sfx';
import { getGame } from '../runtime';

// ---------- 纯函数（tests/s7.test.ts 覆盖） ----------

export const SKILL_EXP_THRESHOLDS: readonly number[] = [50, 120, 260, 480];
export const SKILL_DIM_ORDER: readonly SkillDim[] = ['craft', 'expression', 'marketing', 'operation', 'business'];
export const SKILL_DIM_LABELS: Record<SkillDim, string> = {
  craft: '造物', expression: '表达', marketing: '营销', operation: '运营', business: '商业'
};

export interface SkillProgress {
  pct: number; // 当前级内进度 0-100
  label: string; // 进度文案
  blocked?: string; // 经验够但交付次数不足的提示（L3 需 3 次 / L4 需 6 次）
}

/** 技能四级进度换算（纯函数）：阈值 [50,120,260,480]，L3/L4 有真实交付门槛 */
export function skillProgress(level: number, exp: number, deliveries: number): SkillProgress {
  if (level >= 4) return { pct: 100, label: '满级 Lv4' };
  const need = SKILL_EXP_THRESHOLDS[level] ?? 480;
  const prev = level <= 0 ? 0 : SKILL_EXP_THRESHOLDS[level - 1] ?? 0;
  const span = Math.max(1, need - prev);
  const into = Math.max(0, exp - prev);
  const p = Math.round(Math.min(100, (into / span) * 100));
  const needDlv = level === 2 ? 3 : level === 3 ? 6 : 0;
  let blocked: string | undefined;
  if (exp >= need && needDlv > 0 && deliveries < needDlv) {
    blocked = `经验已够，还差 ${needDlv - deliveries} 次真实交付（有人付钱的那种）`;
  }
  return { pct: p, label: `${into}/${span}`, blocked };
}

export interface FatigueReadout {
  text: string; // 显示值：未体检=区间模糊，体检后=精确
  precise: boolean;
  riskPct: number; // 猝死风险%（仅体检后公开）
}

/** 隐性疲劳读数（纯函数）：flags.fatigueKnown 解锁精确值与猝死风险（§7.3 公开值） */
export function fatigueReadout(s: Readonly<StateSlice>): FatigueReadout {
  const hf = s.health.hiddenFatigue;
  const known = s.flags.fatigueKnown === true;
  if (known) {
    return { text: `${Math.round(hf)}/100`, precise: true, riskPct: Math.round(suddenDeathRisk(s) * 100) };
  }
  const lo = Math.floor(hf / 10) * 10;
  const text = hf >= 90 ? '90+' : `${lo}-${lo + 9}`;
  return { text: `约 ${text}（未体检）`, precise: false, riskPct: -1 };
}

/** 决策模式徽章（纯函数）：System2 绿 / System1 橙警语 / Deep 红 */
export function decisionBadge(mode: StateSlice['decisionMode']): { label: string; cls: string; note: string } {
  switch (mode) {
    case 'system1': return { label: 'System1 · 应激', cls: 'orange', note: '疲惫使你的选项变形：理性选项被隐藏，效果打七五折。' };
    case 'system1Deep': return { label: 'System1 · 深度', cls: 'red', note: '压力已过 85：你近期的每个决定都是情绪替你做的。' };
    default: return { label: 'System2 · 理性', cls: 'green', note: '慢而理性的那套系统在线。' };
  }
}

/** 恢复状态机文案（纯函数） */
export function recoveryLabel(phase: RecoveryPhase, interrupted: boolean): { label: string; cls: string } {
  if (interrupted || phase === 'interrupted') return { label: '中断（强制最低日）', cls: 'red' };
  if (phase === 'wobble') return { label: '波动（低能量/低情绪）', cls: 'orange' };
  return { label: '运行中', cls: 'green' };
}

export interface ActiveEndingOption {
  key: string;
  name: string;
  flag: string; // endings.def 触发约定：置 flag 后 checkPassiveEndings 命中
  minStage: number;
  enabled: boolean;
  reason: string;
}

/** 主动结局按钮组（纯函数，endings.ts 触发约定） */
export function activeEndingOptions(s: Readonly<StateSlice>): ActiveEndingOption[] {
  const mk = (key: string, flag: string, minStage: number): ActiveEndingOption => {
    const def = findEnding(key);
    const stageOk = s.meta.stage >= minStage;
    return {
      key,
      name: def?.name ?? key,
      flag,
      minStage,
      enabled: stageOk,
      reason: stageOk ? '' : `需阶段 ${minStage}（当前 ${s.meta.stage}）`
    };
  };
  return [
    mk('sellCompany', 'sellChosen', 5),
    mk('handover', 'handoverChosen', 6),
    mk('retire', 'retireChosen', 6),
    mk('backToWork', 'backToWorkChosen', 4)
  ];
}

// ---------- 渲染 ----------

function secTitle(t: string): string {
  return `<div class="sec-title">${escapeHtml(t)}</div>`;
}

function subBarRow(name: string, v: number, drift: number): string {
  const warn = v < 20;
  return `<div class="sub-row">
    <span class="sub-name">${escapeHtml(name)}</span>
    ${segHtml(v, warn ? 'warn' : '')}
    <span class="sub-val${warn ? ' c-red' : ''}">${Math.round(v)}<i class="drift">${drift >= 0 ? '+' : ''}${drift}/日</i></span>
  </div>`;
}

function bodyHtml(s: Readonly<StateSlice>): string {
  const h = s.health;
  const health = composeHealth(h);
  const fr = fatigueReadout(s);
  return `
    ${secTitle('健康四子（合成 ' + Math.round(health) + '/100）')}
    ${subBarRow('睡眠 ×40%', h.sleep.v, h.sleep.drift)}
    ${subBarRow('情绪 ×25%', h.mood.v, h.mood.drift)}
    ${subBarRow('饮食 ×20%', h.diet.v, h.diet.drift)}
    ${subBarRow('运动 ×15%', h.exercise.v, h.exercise.drift)}
    <div class="fatigue-line ${fr.precise ? '' : 'dim'}">
      隐性疲劳 <b class="${hfCls(h.hiddenFatigue, fr.precise)}">${fr.text}</b>
      ${fr.precise ? `　猝死风险 <b class="c-red">${pct(fr.riskPct)}</b>（公式 0.03+0.02×(hf-85)/5+0.03×硬撑天）` : '　<span class="c-dim">做一次体检（¥500）解锁精确读数</span>'}
    </div>`;
}

function hfCls(hf: number, precise: boolean): string {
  if (!precise) return 'c-dim';
  if (hf >= 85) return 'c-red';
  if (hf >= 70) return 'c-orange';
  return 'c-green';
}

function mindHtml(s: Readonly<StateSlice>): string {
  const rows: [string, number][] = [['信息', s.info], ['认知', s.cognition], ['品性', s.character]];
  return `${secTitle('信息 / 认知 / 品性')}
    ${rows.map(([n, v]) => `<div class="sub-row"><span class="sub-name">${n}</span>${segHtml(v, 'cyan')}<span class="sub-val">${Math.round(v)}</span></div>`).join('')}`;
}

function skillsHtml(s: Readonly<StateSlice>): string {
  return `${secTitle('技能五维 × 四级（升级要真实交付：L3 需 3 次 / L4 需 6 次）')}
    <div class="skill-grid">${SKILL_DIM_ORDER.map(dim => {
      const lv = s.skills[dim];
      const p = skillProgress(lv, s.skillExp[dim], s.deliveries[dim]);
      return `<div class="skill-cell">
        <div class="skill-head"><b>${SKILL_DIM_LABELS[dim]}</b><span class="px-num">Lv${lv}</span></div>
        ${barHtml(p.pct, p.blocked ? 'orange' : lv >= 4 ? 'green' : '')}
        <div class="skill-meta">${lv >= 4 ? '满级' : p.blocked ? `<span class="c-orange">${p.blocked}</span>` : `${p.label} 经验 · 交付 ${s.deliveries[dim]} 次`}</div>
      </div>`;
    }).join('')}</div>`;
}

function derivedHtml(s: Readonly<StateSlice>): string {
  const assetValue = s.assets.reduce((a, x) => a + x.value, 0);
  const kv = (k: string, v: string): string => `<div class="kv"><span>${k}</span><b>${v}</b></div>`;
  return `${secTitle('衍生资产')}
    <div class="kv-grid">
      ${kv('资产项', `${s.assets.length} 项 · 估值 ${yuan(Math.round(assetValue))}`)}
      ${kv('人脉', `${s.contacts.length} 人`)}
      ${kv('影响力', `${Math.round(s.influence)}/100`)}
      ${kv('权力', `${Math.round(s.power)}/100`)}
      ${kv('口碑', `${Math.round(s.rep)}/100`)}
    </div>`;
}

function modeHtml(ctx: UiCtx): string {
  const s = ctx.state;
  const badge = decisionBadge(s.decisionMode);
  const rec = recoveryLabel(recoveryState(s), s.flags.interrupted === true);
  return `${secTitle('决策与系统')}
    <div class="mode-panel mode-${badge.cls}">
      <span class="mode-chip">${badge.label}</span>
      <span class="mode-note">${badge.note}</span>
    </div>
    <div class="kv-grid">
      <div class="kv"><span>阶段 / OS</span><b>${stageVersion(s.meta.stage)}（阶段 ${s.meta.stage}）</b></div>
      <div class="kv"><span>恢复状态机</span><b class="c-${rec.cls}">${rec.label}</b></div>
      <div class="kv"><span>道德 / 合规</span><b>${Math.round(s.morality)} / ${Math.round(s.compliance)}</b></div>
      <div class="kv"><span>信用分</span><b>${Math.round(s.creditScore)}/1000</b></div>
      <div class="kv"><span>本周焦点</span><b>${s.focus && s.focus in BOTTLENECK_LABELS ? BOTTLENECK_LABELS[s.focus as keyof typeof BOTTLENECK_LABELS] + '（该类+15%）' : '未设定（周复盘会建议）'}</b></div>
      <div class="kv"><span>今日 AP</span><b>${s.ap}/${apMaxFor(s.dayType, s)}</b></div>
    </div>`;
}

function activeEndingsHtml(ctx: UiCtx): string {
  const s = ctx.state;
  if (s.meta.stage < 4) {
    return `${secTitle('主动结局')}
      <p class="s7-hint">第 4 阶段解锁：当你不再想让公司变大，而是想让自己变小的时候，这里有四个体面的出口。</p>`;
  }
  const opts = activeEndingOptions(s);
  return `${secTitle('主动结局（按钮走 endings.def 触发约定，二次确认）')}
    <div class="end-btns">
      ${opts.map(o => `<button class="px-btn ${o.enabled ? 'gold' : ''}" data-ending="${o.key}" data-flag="${o.flag}"
        ${o.enabled ? '' : `disabled title="${o.reason}"`}>${o.name}<small>${o.enabled ? '点击后需再点一次确认' : o.reason}</small></button>`).join('')}
    </div>
    <p class="s7-hint">出售公司需阶段 5+；交棒与功成身退需阶段 6；回归职场从第 4 阶段起随时可选。结局会写入图鉴，主动结局可「继续经营」反悔。</p>`;
}

function bindActiveEndings(el: HTMLElement, ctx: UiCtx): void {
  el.querySelectorAll<HTMLButtonElement>('button[data-ending]').forEach(b => {
    b.addEventListener('click', () => {
      if (b.dataset.armed !== '1') {
        // 二次确认：第一次点击只武装按钮
        el.querySelectorAll<HTMLButtonElement>('button[data-ending]').forEach(x => {
          if (x !== b) { x.dataset.armed = ''; }
        });
        b.dataset.armed = '1';
        b.classList.add('armed');
        b.querySelector('small')!.textContent = '再点一次 = 确认终局';
        SFX.alarm();
        return;
      }
      const key = b.dataset.ending ?? '';
      const flag = b.dataset.flag ?? '';
      const g = getGame();
      if (!g) return;
      // endings.ts 触发约定：置约定 flag → 被动轮询谓词命中 → applyEnding 记账（over/endingKey/图鉴）
      g.state.flags[flag] = true;
      const def = checkPassiveEndings(g.state) ?? findEnding(key);
      if (def) applyEnding(g.state, def);
      saveToSlot('auto', g.state);
      renderEndingScreen(key);
      void ctx;
    });
  });
}

function saveHtml(el: HTMLElement): void {
  const wrap = el.querySelector('.save-wrap');
  if (wrap) renderSaveSection(wrap as HTMLElement);
}

function register(el: HTMLElement, ctx: UiCtx): void {
  const s = ctx.state;
  const auto = slotSummary(loadSlot('auto'));
  el.innerHTML = `
    <div class="status-view">
      <div class="status-col">
        ${bodyHtml(s)}
        ${mindHtml(s)}
        ${skillsHtml(s)}
      </div>
      <div class="status-col">
        ${derivedHtml(s)}
        ${modeHtml(ctx)}
        ${activeEndingsHtml(ctx)}
        <div class="save-wrap"></div>
      </div>
    </div>
    <p class="s7-foot dim-line">自动档：${auto}</p>`;
  bindActiveEndings(el, ctx);
  saveHtml(el);
}

registerView({
  id: 'status',
  deps: ['health', 'skills', 'meta', 'flags', 'assets', 'contacts'],
  render: register
});
