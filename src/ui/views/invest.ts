// 金融视图（S7，stage≥5 由 Tab 门控）：组合六格（份额与期望损益）+ 买卖/借款/还款/投保
// + 经济周期相位 + 加密资产开关（关闭时置灰：已关闭（真实世界仍在继续））。
import type { UiCtx } from '../registry';
import { registerView } from '../registry';
import type { StateSlice } from '../../core/types';
import { ASSET_RET, PHASE_ORDER_MULT } from '../../data/economy.def';
import { yuan } from '../fmt';
import { enqueueNotice, processQueue } from '../modal';

// ---------- 纯函数（tests/s7.test.ts 覆盖） ----------

export type InvestKind = 'save' | 'fund' | 'bond' | 'indexFund' | 'stock' | 'crypto' | 'realEstate';

export const INVEST_KINDS: readonly { key: InvestKind; label: string }[] = [
  { key: 'save', label: '存款' },
  { key: 'fund', label: '货基' },
  { key: 'bond', label: '债券' },
  { key: 'indexFund', label: '指数' },
  { key: 'stock', label: '个股' },
  { key: 'crypto', label: '加密' },
  { key: 'realEstate', label: '房产' }
];

/** 组合格模型（纯函数）：持仓/占比/期望收益标签 */
export function portfolioCells(s: Readonly<StateSlice>): {
  key: InvestKind; label: string; value: number; share: number; ret: string; cls: string; disabled: boolean;
}[] {
  const total = Object.values(s.portfolio).reduce((a, b) => a + b, 0);
  return INVEST_KINDS.map(k => {
    const value = k.key === 'save' ? (s.portfolio.cash ?? 0) : (s.portfolio[k.key] ?? 0);
    const ret = ASSET_RET[k.key as keyof typeof ASSET_RET];
    const cls = k.key === 'crypto' ? 'purple' : ret ? (ret[0] >= 0.006 ? 'green' : '') : '';
    return {
      key: k.key,
      label: k.label,
      value,
      share: total > 0 ? value / total : 0,
      ret: ret ? `月期望 +${(ret[0] * 100).toFixed(1)}% ±${(ret[1] * 100).toFixed(1)}%` : '无波动',
      cls,
      disabled: k.key === 'crypto' && s.flags.cryptoOn === false
    };
  });
}

/** 相位说明（纯函数） */
export function phaseNote(phase: StateSlice['economyPhase']): string {
  const mult = PHASE_ORDER_MULT[phase];
  const name = { boom: '繁荣', overheat: '过热', recession: '衰退', recovery: '复苏' }[phase];
  return `${name}：订单与广告单价 ×${mult}${mult > 1 ? '（顺风，扩）' : mult < 1 ? '（逆风，守）' : '（中性）'}`;
}

// ---------- 渲染 ----------

function register(el: HTMLElement, ctx: UiCtx): void {
  const s = ctx.state;
  const cryptoOff = s.flags.cryptoOn === false;
  const cells = portfolioCells(s);
  el.innerHTML = `
    <div class="inv-view">
      <div class="inv-head">
        <div class="kv-grid">
          <div class="kv"><span>经济周期</span><b>${phaseNote(s.economyPhase)}</b></div>
          <div class="kv"><span>现金（活期）</span><b class="c-gold">${yuan(Math.round(s.cash))}</b></div>
          <div class="kv"><span>组合总值</span><b>${yuan(cells.reduce((a, c) => a + c.value, 0))}</b></div>
          <div class="kv"><span>加密资产</span><b class="${cryptoOff ? 'c-dim' : 'c-purple'}">${cryptoOff ? '已关闭' : '开启'}</b></div>
        </div>
        <button class="px-btn ${cryptoOff ? '' : 'purple'}" id="btn-crypto">${cryptoOff ? '开启加密资产' : '关闭加密资产'}</button>
      </div>
      ${cryptoOff ? '<p class="s7-hint c-dim">加密面板已关闭（真实世界仍在继续）——币价波动、掘金新闻与你无关，组合中的加密份额已被冻结。</p>' : ''}
      <div class="panel-title">// 组合（份额与月度期望）</div>
      <div class="inv-grid">
        ${cells.map(c => `
          <div class="inv-cell ${c.disabled ? 'off' : ''} ${c.value > 0 ? 'held' : ''}">
            <b>${c.label}</b>
            <span class="px-num ${c.disabled ? 'c-dim' : ''}">${yuan(c.value)}</span>
            <span class="dim-line">占比 ${(c.share * 100).toFixed(0)}% · ${c.ret}</span>
          </div>`).join('')}
      </div>
      <div class="panel-title">// 交易台</div>
      <div class="trade-row">
        <select class="s7-select" id="tv-kind">
          ${INVEST_KINDS.map(k => `<option value="${k.key}" ${k.key === 'crypto' && cryptoOff ? 'disabled' : ''}>${k.label}</option>`).join('')}
        </select>
        <input class="s7-input" id="tv-amount" type="number" min="0" step="100" placeholder="金额 ¥" />
        <button class="px-btn green" id="tv-buy">买入</button>
        <button class="px-btn" id="tv-sell">卖出</button>
      </div>
      <div class="trade-row">
        <span class="dim-line">信用业务：</span>
        <button class="px-btn" id="tv-repay">还款（信用+2）</button>
        <button class="px-btn" id="tv-funding">借款（本息 ×1.05，需信用≥400）</button>
        <button class="px-btn" id="tv-insurance">投保（部分事故兜底）</button>
      </div>
      <p class="s7-hint">收益按月结算（经济相位波动；加密标准差 ×6，心脏也是成本）。资产收益是唯一不耗 AP 的现金流——也是唯一会半夜跳水的那种。</p>
    </div>`;

  el.querySelector<HTMLButtonElement>('#btn-crypto')?.addEventListener('click', () => {
    ctx.dispatch({ t: 'setCrypto', on: !(ctx.state.flags.cryptoOn === true) });
  });
  const trade = (sign: 1 | -1): void => {
    const kind = el.querySelector<HTMLSelectElement>('#tv-kind')?.value as InvestKind | undefined;
    const raw = Number(el.querySelector<HTMLInputElement>('#tv-amount')?.value ?? 0);
    // [S8] 修死按钮：金额无效时不再静默无反馈
    if (!kind || !Number.isFinite(raw) || raw <= 0) {
      enqueueNotice('交易台', '请先输入大于 0 的金额。', 'bad');
      processQueue();
      return;
    }
    ctx.dispatch({ t: 'invest', kind, amount: sign * Math.round(raw) });
  };
  el.querySelector<HTMLButtonElement>('#tv-buy')?.addEventListener('click', () => trade(1));
  el.querySelector<HTMLButtonElement>('#tv-sell')?.addEventListener('click', () => trade(-1));
  const lump = (kind: 'repay' | 'funding' | 'insurance'): number => {
    const raw = Number(el.querySelector<HTMLInputElement>('#tv-amount')?.value ?? 0);
    return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : kind === 'funding' ? 10000 : 1000;
  };
  el.querySelector<HTMLButtonElement>('#tv-repay')?.addEventListener('click', () => ctx.dispatch({ t: 'invest', kind: 'repay', amount: lump('repay') }));
  el.querySelector<HTMLButtonElement>('#tv-funding')?.addEventListener('click', () => ctx.dispatch({ t: 'invest', kind: 'funding', amount: lump('funding') }));
  el.querySelector<HTMLButtonElement>('#tv-insurance')?.addEventListener('click', () => ctx.dispatch({ t: 'invest', kind: 'insurance', amount: lump('insurance') }));
}

registerView({
  id: 'invest',
  deps: ['portfolio', 'cash', 'economyPhase', 'flags'],
  render: register
});
