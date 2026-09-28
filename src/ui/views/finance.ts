// 财务视图（S7）：三张账（月损益预估：收入分项/支出分项/净额与税）+ Runway 大数字
// + 被动收入覆盖率（自由线 100%）+ 净资产/负债/信用分 + 主体形态与税档说明。
import type { UiCtx } from '../registry';
import { registerView } from '../registry';
import { bookkeepingFee, livingCost, monthlySubs, taxDue } from '../../core/economy';
import { netWorth } from '../../data/endings.def';
import { findPatch } from '../../data/patches.def';
import { findProjectType } from '../../data/projects.def';
import type { StateSlice } from '../../core/types';
import { barHtml, pct, yuan } from '../fmt';

// ---------- 纯函数（tests/s7.test.ts 覆盖） ----------

export interface RunwayBand {
  cls: string;
  label: string;
}

/** Runway 颜色分档（纯函数）：<3 红色警报 / <6 橙 / 其余绿 */
export function runwayBand(runway: number): RunwayBand {
  if (runway < 0) return { cls: 'red', label: '负跑道：现金已透支' };
  if (runway < 3) return { cls: 'red', label: '警报：跑道不足 3 个月' };
  if (runway < 6) return { cls: 'orange', label: '偏紧：增收或砍支' };
  return { cls: 'green', label: '健康' };
}

/** 被动收入覆盖率（纯函数）：自由线 = 被动收入 ≥ 生活费（100%） */
export function passiveCoverage(passiveIncome: number, monthlyExpense: number): { pct: number; free: boolean } {
  if (monthlyExpense <= 0) return { pct: passiveIncome > 0 ? 100 : 0, free: passiveIncome > 0 };
  const p = (passiveIncome / monthlyExpense) * 100;
  return { pct: Math.min(100, Math.round(p)), free: passiveIncome >= monthlyExpense && passiveIncome > 0 };
}

export interface FinanceSheet {
  incomeRows: { label: string; value: number }[];
  expenseRows: { label: string; value: number }[];
  incomeTotal: number;
  expenseTotal: number;
  profit: number;
  tax: number;
  taxRate: number;
  grayTax: boolean;
}

/** 月损益三张账预估（纯函数）：口径 = 月收入实测 + 月度性支出按定义式重算 */
export function financeSheet(s: Readonly<StateSlice>): FinanceSheet {
  const projectMrr = s.projects.filter(p => p.alive).reduce((a, p) => a + p.mrr, 0);
  const passive = typeof s.flags.lastPassiveIncome === 'number' ? s.flags.lastPassiveIncome : 0;
  const service = Math.max(0, s.monthlyIncome - projectMrr);
  const incomeRows = [
    { label: '项目 MRR（在营合计）', value: Math.round(projectMrr) },
    { label: '交付 / 内容 / 平台现金', value: Math.round(service) },
    { label: '其中被动部分（上月）', value: Math.round(passive) }
  ];
  const upkeep = s.osRules.reduce((a, r) => a + (findPatch(r.id)?.upkeep ?? 0), 0);
  const projectUpkeep = s.projects.filter(p => p.alive).reduce((a, p) => a + (findProjectType(p.type)?.baseCost ?? 0), 0);
  const expenseRows = [
    { label: '生活费（地点×难度系数）', value: livingCost(s) },
    { label: '工具订阅', value: monthlySubs(s) },
    { label: '代账费', value: bookkeepingFee(s) },
    { label: '项目月维护（Σ类型基线）', value: projectUpkeep },
    { label: 'Token 账单（上月）', value: Math.round(s.tokenBill.lastMonth) },
    { label: 'OS 补丁维护', value: Math.round(upkeep) }
  ];
  const incomeTotal = Math.round(incomeRows.slice(0, 2).reduce((a, r) => a + r.value, 0));
  const expenseTotal = Math.round(expenseRows.reduce((a, r) => a + r.value, 0));
  const profit = incomeTotal - expenseTotal;
  const { tax, rate, gray } = taxDue(s, profit);
  return { incomeRows, expenseRows, incomeTotal, expenseTotal, profit, tax, taxRate: rate, grayTax: gray };
}

/** 主体形态说明（纯函数） */
export function entityNote(entity: StateSlice['entity']): string {
  switch (entity) {
    case 'sole': return '个体户：核定征收 3%。低成本合规，摆脱无主体接单的灰色。';
    case 'opc': return '一人有限公司：小微优惠 5%，有限责任护体，注册资本认缴 100 万即达省内 ICP 经营许可门槛。';
    default: return '无主体：不报税（灰色），稽查权重上升，合规持续走低。个体户 ¥500 / 一人有限公司 ¥3000，经营类行动可注册。';
  }
}

// ---------- 渲染 ----------

function sheetRow(label: string, value: number, cls = ''): string {
  return `<div class="sheet-row"><span>${label}</span><b class="${cls}">${yuan(value)}</b></div>`;
}

function register(el: HTMLElement, ctx: UiCtx): void {
  const s = ctx.state;
  const sheet = financeSheet(s);
  const rb = runwayBand(s.runway);
  const cov = passiveCoverage(sheet.incomeRows[2]?.value ?? 0, livingCost(s));
  const nw = netWorth(s);
  el.innerHTML = `
    <div class="fin-view">
      <div class="fin-top">
        <div class="runway-box px-frame rb-${rb.cls}">
          <span class="rb-label">Runway 现金跑道</span>
          <b class="px-num rb-num">${s.runway}</b>
          <span class="rb-unit">个月</span>
          <span class="rb-note">${rb.label}（跑道 = 现金 ÷ 月净支出）</span>
        </div>
        <div class="free-box px-frame ${cov.free ? 'rb-green' : ''}">
          <span class="rb-label">被动收入覆盖率（自由线 100%）</span>
          ${barHtml(cov.pct, cov.free ? 'green' : 'orange')}
          <span class="rb-note">${cov.free ? '√ 已跨过自由线：睡后收入 ≥ 生活费。' : `被动 ${pct(cov.pct)}——离自由线还差 ${yuan(Math.max(0, livingCost(s) - (sheet.incomeRows[2]?.value ?? 0)))}/月`}</span>
        </div>
      </div>
      <div class="fin-cols">
        <div class="fin-col">
          <div class="panel-title">// 收入（本月）</div>
          ${sheet.incomeRows.map(r => sheetRow(r.label, r.value)).join('')}
          ${sheetRow('月收入合计', sheet.incomeTotal, 'c-gold')}
        </div>
        <div class="fin-col">
          <div class="panel-title">// 支出（月度性）</div>
          ${sheet.expenseRows.map(r => sheetRow(r.label, r.value)).join('')}
          ${sheetRow('月支出合计（预估）', sheet.expenseTotal, 'c-red')}
        </div>
        <div class="fin-col">
          <div class="panel-title">// 净额与税</div>
          ${sheetRow('月净额（预估）', sheet.profit, sheet.profit >= 0 ? 'c-green' : 'c-red')}
          ${sheetRow(`税（${(sheet.taxRate * 100).toFixed(0)}% 档）`, sheet.tax, 'c-orange')}
          ${sheet.grayTax ? '<p class="s7-hint c-red">⚠ 灰色税态：无主体/不报税——稽查权重上升，合规走低。</p>' : ''}
        </div>
      </div>
      <div class="panel-title">// 资产负债</div>
      <div class="kv-grid">
        <div class="kv"><span>净资产</span><b class="${nw >= 0 ? 'c-gold' : 'c-red'}">${yuan(Math.round(nw))}</b></div>
        <div class="kv"><span>负债</span><b class="${s.debt > 0 ? 'c-red' : ''}">${yuan(Math.round(s.debt))}</b></div>
        <div class="kv"><span>信用分</span><b>${Math.round(s.creditScore)}/1000</b></div>
        <div class="kv"><span>累计缴税</span><b>${yuan(Math.round(s.stats.taxesPaid))}</b></div>
      </div>
      <div class="panel-title">// 主体形态与税档</div>
      <p class="s7-hint">${entityNote(s.entity)}　三档税姿势：合法节流（小微/核定）＞按期缴纳（信用+2）＞逃（逾期信用-30，稽查盯梢）。</p>
    </div>`;
}

registerView({
  id: 'finance',
  deps: ['cash', 'debt', 'runway', 'monthlyIncome', 'projects', 'entity', 'flags'],
  render: register
});
