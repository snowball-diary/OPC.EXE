// 行动视图（S7）：输入/输出/经营/身心四组行动卡（AP/精力/现金/禁用原因）
// + 深度学习三档（i+1 规则）弹层 + 内容营销卡平台选择（一鱼八走 distributeContent）
// + 经营组实体状态条（主体/商标/ICP/定价）。
import type { UiCtx } from '../registry';
import { registerView } from '../registry';
import { distributeContent, ensureAccount } from '../../core/platforms';
import type { ActionDef, StateSlice } from '../../core/types';
import { ACTION_DEFS } from '../../data/actions.def';
import { PLATFORM_DEFS } from '../../data/platforms.def';
import { escapeHtml, yuan } from '../fmt';
import { getRng } from '../runtime';
import { SFX } from '../sfx';

// ---------- 纯函数（tests/s7.test.ts 覆盖） ----------

export const CAT_LABELS: Record<ActionDef['cat'], string> = {
  input: '输入（学）', output: '输出（做）', biz: '经营（管）', self: '身心（修）'
};
export const CAT_ORDER: readonly ActionDef['cat'][] = ['input', 'output', 'biz', 'self'];

/** 深度学习三档卡配置（三档行动合并为一张卡，弹层选难度） */
export const LEARN_TIERS: readonly { id: string; tier: string; label: string; note: string }[] = [
  { id: 'deepLearnEasy', tier: 'easy', label: '易 · i−1', note: '舒适区：安全无挫折，但经验+0——卡在舒适区没有成长。' },
  { id: 'deepLearnFit', tier: 'fit', label: '适中 · i+1', note: '标准档：经验+10~25。本周没有输出行动则经验×0.2（输入必绑输出）。' },
  { id: 'deepLearnHard', tier: 'hard', label: '难 · i+2', note: '过难档：70% 挫折（压力+8），30% 顿悟（经验×1.6）。' }
];

const LEARN_IDS: readonly string[] = LEARN_TIERS.map(t => t.id);

/** 行动禁用判定（纯函数）：返回禁用原因，null=可执行（镜像 executeAction 前置检查的 UI 近似） */
export function actionDisabled(s: Readonly<StateSlice>, def: ActionDef): string | null {
  if (def.minStage && s.meta.stage < def.minStage) return `阶段不足：需第 ${def.minStage} 阶段`;
  if (s.dayType === 'minimum' && def.cat !== 'self') return '最低日：只能做身心恢复类行动';
  const alive = s.projects.filter(p => p.alive);
  if (def.needsProject && alive.length === 0) return '需要先立项一个项目';
  const cost = Math.round((def.cash ?? 0) * (s.flags.spendthrift === true ? 1.1 : 1));
  if (cost > 0 && s.cash < cost) return `现金不足（需 ${yuan(cost)}）`;
  if (s.energy <= 0 && def.cat !== 'self') return '精力见底：选最低日或恢复类行动';
  if (def.special === 'consult' && !s.contacts.some(c => c.type === 'mentor' && c.relation >= 30)) return '没有关系≥30 的导师人脉';
  if (def.special === 'makeCourse' && !alive.some(p => p.type === 'course')) return '需先立项「录播课程」类型项目';
  if (def.special === 'deliver') {
    const ready = alive.some(p => ['build', 'launch', 'grow', 'mature', 'decline'].includes(p.stage));
    if (!ready && s.flags.ordersChannel !== true) return '项目需进入开发后阶段（或先在社群建立订单渠道）';
  }
  if (def.id === 'registerOPC' && s.entity === 'opc') return '已是一人有限公司';
  if (def.id === 'registerSole' && s.entity === 'opc') return '已是一人有限公司，无需回退个体户';
  if (def.id === 'fileTrademark' && s.flags.trademark === true) return '商标已在受理/注册';
  if (def.id === 'fileIcp' && s.flags.icp === true) return 'ICP 备案已通过';
  return null;
}

/** 经营组实体状态条文案（纯函数） */
export function entityStatusText(s: Readonly<StateSlice>): string {
  const entity = s.entity === 'opc' ? '一人有限公司（税 5% 小微）' : s.entity === 'sole' ? '个体户（核定 3%）' : '无主体（灰色接单）';
  return `${entity} · 商标${s.flags.trademark === true ? '√' : '×'} · ICP${s.flags.icp === true ? '√' : '×'} · 定价${s.flags.pricing === 1 ? '亲民×0.8' : s.flags.pricing === 3 ? '高端×1.35' : '标准×1.0'}`;
}

// ---------- 渲染 ----------

function actionCard(def: ActionDef, s: StateSlice): string {
  const reason = actionDisabled(s, def);
  const apShort = s.ap < def.ap;
  const hardNote = apShort && def.cat !== 'self' && !reason ? ' title="AP 不足：仍可硬撑执行（隐性疲劳+6）"' : '';
  const cost = Math.round((def.cash ?? 0) * (s.flags.spendthrift === true ? 1.1 : 1));
  const chips = [
    `AP ${def.ap}${apShort && def.cat !== 'self' ? '!' : ''}`,
    `精力 ${def.energy}`,
    cost > 0 ? yuan(cost) : ''
  ].filter(Boolean).map(c => `<span class="chip">${c}</span>`).join('');
  return `
    <button class="act-card${reason ? ' disabled' : ''}" data-act="${def.id}" ${reason ? `disabled title="${escapeHtml(reason)}"` : hardNote}>
      <b>${escapeHtml(def.name)}</b>
      <span class="chips">${chips}</span>
      <small>${escapeHtml(def.desc)}</small>
      ${reason ? `<small class="c-red">${escapeHtml(reason)}</small>` : ''}
    </button>`;
}

function groupHtml(cat: ActionDef['cat'], s: StateSlice, defs: ActionDef[]): string {
  const header = cat === 'biz'
    ? `<div class="grp-head">${CAT_LABELS[cat]}<span class="entity-line">${entityStatusText(s)}</span></div>`
    : `<div class="grp-head">${CAT_LABELS[cat]}</div>`;
  return `<section class="act-grp">${header}<div class="act-grid">${defs.map(d => actionCard(d, s)).join('')}</div></section>`;
}

function learnCardHtml(): string {
  return `
    <button class="act-card learn" id="card-learn">
      <b>深度学习（i+1 三档）</b>
      <span class="chips"><span class="chip">AP 1</span><span class="chip">精力 8~16</span></span>
      <small>选难度：易（i−1 安全无经验）/ 适中（i+1 标准收益）/ 难（i+2 赌顿悟）。输入之后记得输出。</small>
    </button>`;
}

function overlayHtml(title: string, inner: string): string {
  return `
    <div class="s7-overlay" id="s7-overlay">
      <div class="s7-sheet px-frame">
        <div class="s7-sheet-head"><b>${escapeHtml(title)}</b><button class="px-btn" id="s7-overlay-close">关闭</button></div>
        ${inner}
      </div>
    </div>`;
}

function platformCellHtml(pid: string, name: string, flowMult: number, banRiskBase: number, note: string, acc: StateSlice['platforms'][string] | undefined, recommended: boolean): string {
  const state = acc ? acc.state : 'none';
  const stateLabel = !acc ? '<b class="c-dim">未开通</b>'
    : acc.state === 'observe' ? `<b class="c-orange">观察期 ${acc.observeDaysLeft} 天</b>`
      : acc.state === 'throttled' ? '<b class="c-orange">限流中</b>'
        : acc.state === 'banned' ? '<b class="c-red">已封禁</b>'
          : '<b class="c-green">正常</b>';
  return `
    <button class="plat-cell ${state === 'banned' ? 'off' : ''}" data-plat="${pid}" ${state === 'banned' ? 'disabled title="已封禁：收入停摆"' : ''}>
      <b>${escapeHtml(name)}${recommended ? '<i class="rec">荐</i>' : ''}</b>
      <span class="plat-meta">流量 ×${flowMult} · 风险 ${banRiskBase === 0 ? '0（封不了号）' : `×${banRiskBase}`}</span>
      <span class="plat-meta">状态：${stateLabel}${acc ? ` · 粉丝 ${Math.round(acc.followers)}` : ''}</span>
      <small>${escapeHtml(note)}</small>
    </button>`;
}

function openPlatformPicker(ctx: UiCtx): void {
  if (document.getElementById('s7-overlay')) return;
  const s = ctx.state;
  const entries = Object.entries(s.platforms);
  let best = entries[0];
  for (const e of entries) if (best && e[1].followers > best[1].followers) best = e;
  const recId = best?.[0];
  const cells = PLATFORM_DEFS.map(p => platformCellHtml(
    p.id, p.name, p.flowMult, p.banRiskBase, p.note, s.platforms[p.id], p.id === recId
  )).join('');
  const holder = document.createElement('div');
  holder.innerHTML = overlayHtml('内容营销 · 选主平台（一鱼八吃）', `
    <p class="s7-hint">内容先发布到你选的主阵地（行动结算走官方管线，源头平台自己吃到大爆抽样），再向其余平台瀑布分发：当日 / 次日 / 三日三批，各平台独立抽样大爆。小红书风险系数 1.6 最危险；独立站封不了号。</p>
    <div class="plat-grid">${cells}</div>`);
  const overlay = holder.firstElementChild as HTMLElement;
  document.body.appendChild(overlay);
  SFX.click();
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.remove();
  });
  overlay.querySelector<HTMLButtonElement>('#s7-overlay-close')?.addEventListener('click', () => overlay.remove());
  overlay.querySelectorAll<HTMLButtonElement>('button[data-plat]').forEach(b => {
    b.addEventListener('click', () => {
      const pid = b.dataset.plat ?? '';
      overlay.remove();
      // [S8] 修「瀑布源头不涨粉」：选定的主阵地即官方管线首发平台（Action.platformId），
      // 之后一鱼八吃向其余平台瀑布分发——源头平台自己吃到大爆抽样，不再是只出不进的纯管道
      ensureAccount(ctx.state, pid);
      const r = ctx.dispatch({ t: 'act', id: 'writeContent', platformId: pid });
      if (r.ok) {
        distributeContent(ctx.state, pid, getRng()); // 一鱼八吃瀑布（源头除外，其余 7 平台）
        ctx.rerender(); // 瀑布结果（延迟链/日志）落到界面
      }
    });
  });
}

function openLearnPicker(ctx: UiCtx): void {
  if (document.getElementById('s7-overlay')) return;
  const s = ctx.state;
  const rows = LEARN_TIERS.map(t => {
    const def = ACTION_DEFS.find(d => d.id === t.id);
    const reason = def ? actionDisabled(s, def) : '未知行动';
    return `
      <button class="tier-row" data-tier="${t.id}" ${reason ? `disabled title="${escapeHtml(reason)}"` : ''}>
        <b>${t.label}</b>
        <span class="chips">${def ? `<span class="chip">AP ${def.ap}</span><span class="chip">精力 ${def.energy}</span>` : ''}</span>
        <small>${t.note}</small>
      </button>`;
  }).join('');
  const holder = document.createElement('div');
  holder.innerHTML = overlayHtml('深度学习 · 选难度（i+1 规则）', `
    <p class="s7-hint">i+1：比当前水平高一档的难度成长最快。太难受挫，太舒适没有经验——挑微微够不着的那个。</p>
    <div class="tier-list">${rows}</div>`);
  const overlay = holder.firstElementChild as HTMLElement;
  document.body.appendChild(overlay);
  SFX.click();
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.remove();
  });
  overlay.querySelector<HTMLButtonElement>('#s7-overlay-close')?.addEventListener('click', () => overlay.remove());
  overlay.querySelectorAll<HTMLButtonElement>('button[data-tier]').forEach(b => {
    b.addEventListener('click', () => {
      overlay.remove();
      ctx.dispatch({ t: 'act', id: b.dataset.tier ?? '' });
    });
  });
}

function register(el: HTMLElement, ctx: UiCtx): void {
  const s = ctx.state;
  const groups = CAT_ORDER.map(cat => {
    const defs = ACTION_DEFS.filter(d => d.cat === cat && !LEARN_IDS.includes(d.id));
    return groupHtml(cat, s, defs);
  });
  // 学习卡插入输入组首位
  el.innerHTML = `<div class="act-view">${groups.join('')}</div>`;
  const inputGrid = el.querySelector('.act-grp .act-grid');
  if (inputGrid) inputGrid.insertAdjacentHTML('afterbegin', learnCardHtml());

  el.querySelectorAll<HTMLButtonElement>('button[data-act]').forEach(b => {
    b.addEventListener('click', () => {
      const id = b.dataset.act ?? '';
      if (id === 'writeContent') {
        openPlatformPicker(ctx); // 内容营销卡：平台选择 → 一鱼八吃
        return;
      }
      ctx.dispatch({ t: 'act', id });
    });
  });
  el.querySelector<HTMLButtonElement>('#card-learn')?.addEventListener('click', () => openLearnPicker(ctx));
}

registerView({
  id: 'actions',
  deps: ['ap', 'energy', 'cash', 'projects', 'contacts', 'entity', 'flags'],
  render: register
});
