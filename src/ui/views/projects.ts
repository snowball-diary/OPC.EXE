// 项目视图（S7→[v0.10/W7] 经营看板）：项目卡（阶段徽章/进度/PMF 置信区间/今日流水/日增用户/
// 维护负担条/生命周期 7 阶段时间轴）+ 新建项目 + 项目操作 + autoSrv/灰产的单位经济面板
//（今日 Token 成本/今日毛利）+ 灰产清算风险累积条。
import type { UiCtx } from '../registry';
import { registerView } from '../registry';
import { unitEconomics } from '../../core/agents';
import type { Project, ProjectStage, ProjectType, RevenueModelId, StateSlice } from '../../core/types';
import { PROJECT_TYPES, findProjectType } from '../../data/projects.def';
import { pct, projectStageBadge, yuan } from '../fmt';
import { iconHtml } from '../icons';

// ---------- 纯函数（tests/s7.test.ts / s10 覆盖） ----------

export const REVENUE_MODELS: readonly { id: RevenueModelId; label: string }[] = [
  { id: 'buyout', label: '买断' },
  { id: 'subscription', label: '订阅' },
  { id: 'usage', label: '按量' },
  { id: 'ads', label: '广告' },
  { id: 'commission', label: '佣金' },
  { id: 'service', label: '服务' },
  { id: 'tip', label: '打赏' },
  { id: 'license', label: '授权' }
];

export function revenueModelLabel(id: RevenueModelId): string {
  return REVENUE_MODELS.find(m => m.id === id)?.label ?? id;
}

/** [v0.10/W7] PMF 置信区间格式化（纯函数）：估计 ±噪声（区间下限-上限）；认知越高立项时噪声越窄 */
export function pmfInterval(v: number, noise: number): string {
  const lo = Math.max(0, Math.round(v - noise));
  const hi = Math.min(100, Math.round(v + noise));
  return `${Math.round(v)}±${Math.round(noise)}（${lo}-${hi}）`;
}

const STAGE_DOTS: readonly { stage: ProjectStage; label: string }[] = [
  { stage: 'idea', label: '想法' },
  { stage: 'validate', label: '验证' },
  { stage: 'build', label: '开发' },
  { stage: 'launch', label: '发布' },
  { stage: 'grow', label: '增长' },
  { stage: 'mature', label: '成熟' },
  { stage: 'decline', label: '衰退' }
];

export type StageDotState = 'done' | 'current' | 'future';

/** [v0.10/W7] 生命周期时间轴状态（纯函数）：当前阶段高亮，之前 done，之后 future */
export function stageTimeline(stage: ProjectStage): { label: string; state: StageDotState }[] {
  const cur = STAGE_DOTS.findIndex(d => d.stage === stage);
  return STAGE_DOTS.map((d, i) => ({
    label: d.label,
    state: (i < cur ? 'done' : i === cur ? 'current' : 'future') as StageDotState
  }));
}

/** [v0.10/W7] 灰产清算风险累积（纯函数）：ageMonths 与合规分共同决定，0-100 可视化 */
export function grayRiskScore(p: Project, compliance: number): number {
  if (!p.gray) return 0;
  return Math.max(0, Math.min(100, Math.round(25 + p.ageMonths * 6 + (70 - compliance) * 0.8)));
}

/** [v0.10/W7] autoSrv 今日 Token 成本/毛利（纯函数）：今日流水 × Token 成本占比 */
export function todayUnitEconomics(todayFlow: number, cogsToken: number, price: number, priceIndex: number): { tokenCost: number; gross: number } {
  if (todayFlow <= 0 || price <= 0) return { tokenCost: 0, gross: 0 };
  const tokenShare = Math.min(1, (cogsToken * priceIndex) / price);
  const tokenCost = todayFlow * tokenShare;
  return { tokenCost, gross: todayFlow - tokenCost };
}

/** 单位经济面板的 UI 数据映射（纯函数）：毛利率 → 色条档位 */
export function marginBand(grossMargin: number): { cls: string; label: string } {
  if (grossMargin >= 0.6) return { cls: 'green', label: '优' };
  if (grossMargin >= 0.3) return { cls: '', label: '正常' };
  if (grossMargin >= 0) return { cls: 'orange', label: '薄' };
  return { cls: 'red', label: '负毛利：越自动化越亏' };
}

/** 项目卡是否需要单位经济面板（纯函数）：Token 成本 >0 的类型（autoSrv/灰产/重交付） */
export function needsUnitEconomics(t: ProjectType | undefined): boolean {
  return (t?.cogsToken ?? 0) > 0;
}

/** 可选项目类型（纯函数）：全部 14 类；灰产加标记 */
export function projectTypeOptions(): ProjectType[] {
  return PROJECT_TYPES;
}

// ---------- 渲染 ----------

function projectCard(p: Project, s: StateSlice): string {
  const t = findProjectType(p.type);
  const st = projectStageBadge(p.stage);
  const launched = ['launch', 'grow', 'mature', 'decline'].includes(p.stage);
  const canDev = p.alive;
  const canPivot = p.alive;
  const ue = needsUnitEconomics(t) ? unitEconomics(s, p) : null;
  const band = ue ? marginBand(ue.grossMargin) : null;
  // [v0.10/W7] 看板增量：今日流水 / 日增用户 / PMF 置信区间 / 时间轴 / 清算风险 / 今日单位经济
  const todayFlow = p.todayFlow ?? 0;
  const todayUsers = p.todayUsers ?? 0;
  const timeline = stageTimeline(p.stage);
  const grayRisk = grayRiskScore(p, s.compliance);
  const tue = ue && ue.price > 0
    ? todayUnitEconomics(todayFlow, ue.cogsToken, ue.price, ue.priceIndex)
    : null;
  return `
    <div class="proj-card ${p.gray ? 'gray' : ''}${p.alive ? '' : ' dead'}">
      <div class="proj-head">
        <b>${p.gray ? '<span class="tag-gray">灰</span>' : ''}${p.name}</b>
        <span class="badge ${st.cls}">${st.label}</span>
        <span class="dim-line">${t?.name ?? p.type} · ${revenueModelLabel(p.revenueModel)} · v${p.version}</span>
      </div>
      <div class="stage-dots" title="生命周期：${timeline.map(d => d.label).join(' → ')}">
        ${timeline.map(d => `<i class="${d.state}" title="${d.label}"></i>`).join('')}
      </div>
      <div class="proj-rows">
        <div class="prow"><span>进度</span>${bar(p.progress)}<b>${pct(p.progress)}</b></div>
        <div class="prow"><span>质量</span>${bar(p.quality, 'cyan')}<b>${pct(p.quality)}</b></div>
        <div class="prow"><span>PMF 区间</span>${bar(p.pmfEstimate.v, 'orange')}<b>${pmfInterval(p.pmfEstimate.v, p.pmfEstimate.noise)}</b></div>
        <div class="prow"><span>维护负担</span>${bar(p.maintenance, p.maintenance > 70 ? 'warn' : '')}<b>${pct(p.maintenance)}</b></div>
      </div>
      <div class="proj-stats">
        <span>今日流水 <b class="${todayFlow > 0 ? 'c-green' : 'c-dim'}">${todayFlow > 0 ? `+${yuan(Math.round(todayFlow))}` : '¥0'}</b></span>
        <span>日增用户 <b>${todayUsers > 0 ? `+${Math.max(1, Math.round(todayUsers))}` : '—'}</b></span>
        <span>月收 <b class="c-gold">${yuan(Math.round(p.mrr))}</b></span>
        <span>用户 <b>${Math.round(p.users)}</b></span>
        <span>风险 <b class="c-orange">${pct(p.risk)}</b></span>
      </div>
      ${tue && (ue?.projectType ?? '') === p.type && todayFlow > 0 ? `
      <div class="ue-rows dim-line" style="margin-top:2px">
        <span>今日 Token 成本 <b class="c-red">-${yuan(Math.round(tue.tokenCost))}</b></span>
        <span>今日毛利 <b class="${tue.gross >= 0 ? 'c-green' : 'c-red'}">${tue.gross >= 0 ? '+' : ''}${yuan(Math.round(tue.gross))}</b></span>
      </div>` : ''}
      ${ue && band ? `
      <div class="ue-panel">
        <div class="ue-head">${iconHtml('coin', 'icon')}单位经济（Token 进货价口径）</div>
        <div class="ue-rows">
          <span>客单价 <b>${yuan(Math.round(ue.price))}</b></span>
          <span>Token/单 <b>${yuan(Math.round(ue.cogsToken * ue.priceIndex))}（指数 ×${ue.priceIndex.toFixed(1)}）</b></span>
          <span>平台费 <b>${pct(ue.feeRate * 100)}</b></span>
          <span>毛利率 <b class="c-${band.cls}">${pct(ue.grossMargin * 100)}（${band.label}）</b></span>
        </div>
        <div class="ue-note ${ue.overTrustCapacity ? 'c-red' : 'dim-line'}">${ue.overTrustCapacity ? '⚠ ' + ue.scaleCapNote : ue.scaleCapNote}</div>
      </div>` : ''}
      ${p.gray && p.alive ? `
      <div class="gray-risk">
        <div class="prow"><span>清算风险累积</span>${bar(grayRisk, grayRisk > 60 ? 'warn' : '')}<b class="${grayRisk > 60 ? 'c-red' : 'c-orange'}">${pct(grayRisk)}</b></div>
        <div class="dim-line">灰产历史在稽查权重里滚存（ageMonths 与合规分共同决定）——短多长空，自己掂量。</div>
      </div>` : ''}
      ${p.alive ? `
      <div class="proj-btns">
        ${canDev ? `<button class="px-btn" data-act="developProject" data-pid="${p.id}">开发${launched ? '/迭代' : ''}</button>` : ''}
        <button class="px-btn" data-act="polishQuality" data-pid="${p.id}">打磨</button>
        ${canPivot ? `<button class="px-btn" data-pivot="${p.id}">转型</button>` : ''}
        <button class="px-btn red" data-retire="${p.id}">退役</button>
      </div>
      <div class="pivot-row" data-pivot-row="${p.id}" style="display:none">
        <select class="s7-select" data-pivot-sel="${p.id}">
          ${PROJECT_TYPES.map(x => `<option value="${x.id}">${x.name}${x.gray ? '（灰）' : ''}</option>`).join('')}
        </select>
        <button class="px-btn" data-pivot-go="${p.id}">确认转型（质量剩 60%/进度剩 30%）</button>
      </div>` : '<div class="dim-line">已退役：残值已回收为资产项。</div>'}
    </div>`;
}

function bar(v: number, variant = ''): string {
  const on = Math.max(0, Math.min(100, v));
  return `<span class="pbar ${variant}"><i style="width:${on}%"></i></span>`;
}

function newProjectFormHtml(): string {
  return `
    <div class="np-form">
      <div class="np-row">
        <input class="s7-input" id="np-name" maxlength="20" placeholder="项目名（留空自动编号）" />
        <select class="s7-select" id="np-type">
          ${PROJECT_TYPES.map(t => `<option value="${t.id}">${t.name}${t.gray ? '（灰产）' : ''}</option>`).join('')}
        </select>
        <select class="s7-select" id="np-rev">
          ${REVENUE_MODELS.map(m => `<option value="${m.id}">${m.label}</option>`).join('')}
        </select>
        <button class="px-btn gold" id="np-go">立项</button>
      </div>
      <p class="s7-hint">立项即幂律抽取真实潜力（对你不可见，PMF 估计只是带噪声的读数——用户访谈能让它收敛）。灰产立项：合规-5、稽查权重×2、永久记录。</p>
    </div>`;
}

function register(el: HTMLElement, ctx: UiCtx): void {
  const s = ctx.state;
  const alive = s.projects.filter(p => p.alive);
  const dead = s.projects.filter(p => !p.alive);
  el.innerHTML = `
    <div class="proj-view">
      <div class="proj-toolbar">
        <span class="dim-line">注意力槽 ${alive.length}/${s.attentionCap} · 在营项目月维护 = Σ类型基线</span>
        <button class="px-btn gold" id="btn-new-project">＋ 新建项目</button>
      </div>
      <div class="np-wrap" style="display:none">${newProjectFormHtml()}</div>
      ${alive.length + dead.length === 0 ? '<p class="s7-hint">还没有项目。一个人公司最先要回答的问题：你打算把什么东西，卖给谁？</p>' : ''}
      <div class="proj-list">${alive.map(p => projectCard(p, s)).join('')}</div>
      ${dead.length > 0 ? `<div class="panel-title">// 已退役</div><div class="proj-list">${dead.map(p => projectCard(p, s)).join('')}</div>` : ''}
    </div>`;

  // 新建项目表单开合
  el.querySelector<HTMLButtonElement>('#btn-new-project')?.addEventListener('click', () => {
    const wrap = el.querySelector<HTMLElement>('.np-wrap');
    if (wrap) wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none';
  });
  el.querySelector<HTMLButtonElement>('#np-go')?.addEventListener('click', () => {
    const name = el.querySelector<HTMLInputElement>('#np-name')?.value ?? '';
    const type = el.querySelector<HTMLSelectElement>('#np-type')?.value ?? 'saas';
    const rev = el.querySelector<HTMLSelectElement>('#np-rev')?.value ?? 'subscription';
    const r = ctx.dispatch({ t: 'newProject', name, type, revenueModel: rev as RevenueModelId });
    if (r.ok) {
      el.querySelectorAll<HTMLInputElement>('#np-name').forEach(i => { i.value = ''; });
    }
  });

  // 项目操作：开发/打磨（act 带 projectId）
  el.querySelectorAll<HTMLButtonElement>('button[data-act]').forEach(b => {
    b.addEventListener('click', () => {
      ctx.dispatch({ t: 'act', id: b.dataset.act ?? '', projectId: b.dataset.pid });
    });
  });
  // 转型开合 + 确认
  el.querySelectorAll<HTMLButtonElement>('button[data-pivot]').forEach(b => {
    b.addEventListener('click', () => {
      const row = el.querySelector<HTMLElement>(`[data-pivot-row="${b.dataset.pivot}"]`);
      if (row) row.style.display = row.style.display === 'none' ? 'flex' : 'none';
    });
  });
  el.querySelectorAll<HTMLButtonElement>('button[data-pivot-go]').forEach(b => {
    b.addEventListener('click', () => {
      const pid = b.dataset.pivotGo ?? '';
      const to = el.querySelector<HTMLSelectElement>(`[data-pivot-sel="${pid}"]`)?.value ?? 'saas';
      ctx.dispatch({ t: 'pivotProject', projectId: pid, toType: to });
    });
  });
  // 退役（二次确认）
  el.querySelectorAll<HTMLButtonElement>('button[data-retire]').forEach(b => {
    b.addEventListener('click', () => {
      if (b.dataset.armed !== '1') {
        b.dataset.armed = '1';
        b.textContent = '确认退役？';
        window.setTimeout(() => {
          if (b.isConnected) { b.dataset.armed = ''; b.textContent = '退役'; }
        }, 2600);
        return;
      }
      ctx.dispatch({ t: 'retireProject', projectId: b.dataset.retire ?? '' });
    });
  });
}

registerView({
  id: 'projects',
  deps: ['projects', 'cash', 'attentionCap'],
  render: register
});
