// 智能体视图（S7，stage≥3 由 Tab 门控）：7 智能体卡（部署费/月 Token/效率/解锁/在岗+trust 条）
// + Token 账单面板（上月账单/价格指数档位/事件预告）+ 幽灵公司进度（autoLevel/六流程覆盖/空虚提示）。
import type { UiCtx } from '../registry';
import { registerView } from '../registry';
import { AUTO_FLOWS, autoLevelScore, flowCoverage } from '../../core/agents';
import type { AgentId, StateSlice } from '../../core/types';
import { AGENT_DEFS } from '../../data/agents.def';
import { barHtml, yuan } from '../fmt';

// ---------- 纯函数（tests/s7.test.ts 覆盖） ----------

export const FLOW_LABELS: Record<string, string> = {
  growth: '获客', content: '内容', support: '客服', sales: '销售', fin: '财务合规', delivery: '交付'
};

/** Token 价格指数档位文案（纯函数） */
export function priceIndexLabel(pi: number): { label: string; cls: string; teaser: string } {
  if (pi < 0.9) return { label: `×${pi.toFixed(1)} 降价红利`, cls: 'green', teaser: '上游在打价格战——多接单，红利不等人。' };
  if (pi < 1.2) return { label: `×${pi.toFixed(1)} 基线`, cls: '', teaser: '算力价格平稳：账单按表走。' };
  if (pi < 1.8) return { label: `×${pi.toFixed(1)} 涨价`, cls: 'orange', teaser: '涨价潮：毛利率被压缩，重算单位经济再扩量。' };
  return { label: `×${pi.toFixed(1)} 限流溢价`, cls: 'red', teaser: '限流溢价：Token 变成奢侈品，烧钱的自动化先停一停。' };
}

/** 幽灵公司面板模型（纯函数） */
export function ghostCompanyModel(s: Readonly<StateSlice>): {
  score: number;
  ghost: boolean;
  covered: { key: string; label: string; on: boolean }[];
} {
  const cov = flowCoverage(s);
  return {
    score: Math.round(autoLevelScore(s)),
    ghost: s.autoLevel >= 85,
    covered: AUTO_FLOWS.map(f => ({ key: f, label: FLOW_LABELS[f] ?? f, on: cov[f] }))
  };
}

// ---------- 渲染 ----------

function agentCard(def: (typeof AGENT_DEFS)[number], s: StateSlice): string {
  const inst = s.agents.find(a => a.id === def.id);
  const locked = s.meta.stage < def.unlockStage;
  const risk = def.id === 'butler' ? '风险聚合（全部）' : def.riskEvents.length + ' 项风险事件';
  return `
    <div class="agent-card ${inst ? 'on' : ''}${locked ? ' locked' : ''}">
      <div class="agent-head"><b>${def.name}</b>${inst ? '<span class="badge green">在岗</span>' : locked ? `<span class="badge">v${def.unlockStage}.0 解锁</span>` : '<span class="badge cyan">可雇佣</span>'}</div>
      <div class="agent-stats">
        <span>部署费 <b class="c-gold">${yuan(def.deployCost)}</b></span>
        <span>月 Token <b>${yuan(def.monthlyTokenBase)} 起</b></span>
        <span>效率 <b>×${def.efficiency}</b></span>
        <span>${risk}</span>
      </div>
      <small>${def.desc}</small>
      ${inst ? `
        <div class="trust-line">trust ${Math.round(inst.trust)}/100（&lt;40 效率减半）· 用量 ×${inst.usageScale.toFixed(1)} / 承载 ${Math.max(1, inst.trust / 20).toFixed(1)}</div>
        ${barHtml(inst.trust, inst.trust < 40 ? 'warn' : 'green')}
        <div class="agent-btns"><button class="px-btn red" data-fire="${def.id}">停用（计费停止）</button></div>`
      : `<div class="agent-btns">
          <button class="px-btn gold" data-hire="${def.id}" ${locked ? `disabled title="需 OS 阶段 ${def.unlockStage}"` : ''}>雇佣</button>
        </div>`}
    </div>`;
}

function tokenPanelHtml(s: StateSlice): string {
  const pi = priceIndexLabel(s.tokenBill.priceIndex);
  return `
    <div class="panel-title">// Token 账单</div>
    <div class="token-panel">
      <div class="kv-grid">
        <div class="kv"><span>上月账单</span><b class="c-gold">${yuan(Math.round(s.tokenBill.lastMonth))}</b></div>
        <div class="kv"><span>价格指数</span><b class="c-${pi.cls}">${pi.label}</b></div>
        <div class="kv"><span>本月已烧</span><b>${yuan(Math.round(s.stats.tokenSpent))}（生涯累计）</b></div>
        <div class="kv"><span>在岗智能体</span><b>${s.agents.length} / 7</b></div>
      </div>
      <p class="s7-hint">预告：${pi.teaser} 账单月底刚性扣除，零收入也照扣——先算单位经济，再谈规模。</p>
    </div>`;
}

function ghostPanelHtml(s: StateSlice): string {
  const m = ghostCompanyModel(s);
  return `
    <div class="panel-title">// 幽灵公司进度</div>
    <div class="ghost-panel ${m.ghost ? 'ghost-on' : ''}">
      <div class="ghost-score">
        <span>自动化 AutoLevel</span>
        <b class="px-num ${m.ghost ? 'c-purple' : ''}">${m.score}</b>
        <span class="dim-line">/ 100（≥85 触发幽灵公司）</span>
        ${m.ghost ? '<span class="badge purple">幽灵公司运行中</span>' : ''}
      </div>
      ${barHtml(m.score, m.ghost ? 'purple' : 'cyan')}
      <div class="flow-grid">
        ${m.covered.map(c => `<span class="flow ${c.on ? 'on' : ''}">${c.on ? '■' : '□'} ${c.label}</span>`).join('')}
      </div>
      <p class="s7-hint">${m.ghost
        ? '意义的空虚开始计息：这个月若没有一件亲手做的作品、没有一个亲自见的客户，心境 -3。「这是你的公司吗」归你答。'
        : '在岗智能体即接管对应流程；「全能管家」一次接管全部六流程。写 SOP / 自动化搭建也能攒 autoLevel（缓慢折旧）。'}</p>
    </div>`;
}

function register(el: HTMLElement, ctx: UiCtx): void {
  const s = ctx.state;
  el.innerHTML = `
    <div class="agent-view">
      ${tokenPanelHtml(s)}
      <div class="panel-title">// 智能体矩阵（7）</div>
      <div class="agent-grid">${AGENT_DEFS.map(d => agentCard(d, s)).join('')}</div>
      ${ghostPanelHtml(s)}
    </div>`;
  el.querySelectorAll<HTMLButtonElement>('button[data-hire]').forEach(b => {
    b.addEventListener('click', () => ctx.dispatch({ t: 'hireAgent', id: b.dataset.hire as AgentId }));
  });
  el.querySelectorAll<HTMLButtonElement>('button[data-fire]').forEach(b => {
    b.addEventListener('click', () => ctx.dispatch({ t: 'fireAgent', id: b.dataset.fire as AgentId }));
  });
}

registerView({
  id: 'agents',
  deps: ['agents', 'tokenBill', 'autoLevel'],
  render: register
});
