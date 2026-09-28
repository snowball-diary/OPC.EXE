// 经济引擎：生活成本 / 经济周期 / 税费 / 月度结算 / 金融 dispatch（技术文档 §6.3/§6.4，设计 §六）
import { findDifficulty } from '../data/openings.def';
import { findLocation } from '../data/locations.def';
import { findPatch } from '../data/patches.def';
import {
  AI_SUB, ASSET_RET, BOOKKEEPING_FEE, LIVING_BASE, PHASE_ORDER_MULT, PHASE_TRANSITIONS, SUB_BASE
} from '../data/economy.def';
import type { Rng } from './rng';
import type {
  Action, ActionResult, EconomyPhase, MonthReport, StateSlice
} from './types';

export const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

// ---------- 生活成本 ----------

/** 月生活费 = LIVING_BASE × 地点系数 × 难度系数 */
export function livingCost(s: StateSlice): number {
  const cm = findLocation(s.location)?.costMult ?? 1;
  const dm = findDifficulty(s.meta.difficulty)?.livingCostMult ?? 1;
  return Math.round(LIVING_BASE * cm * dm);
}

/** 重算月生活费写入 monthlyExpense（init / relocate 时调用） */
export function recalcLiving(s: StateSlice): number {
  s.monthlyExpense = livingCost(s);
  return s.monthlyExpense;
}

// ---------- 经济周期 ----------

export function phaseMult(phase: EconomyPhase): number {
  return PHASE_ORDER_MULT[phase];
}

/** 月掷周期转移（§6.4 转移矩阵） */
export function rollPhase(s: StateSlice, rng: Rng): EconomyPhase {
  const row = PHASE_TRANSITIONS[s.economyPhase] ?? [];
  const u = rng.next();
  let acc = 0;
  let next: EconomyPhase = s.economyPhase;
  for (const [ph, p] of row) {
    acc += p;
    if (u < acc) {
      next = ph;
      break;
    }
  }
  s.economyPhase = next;
  return next;
}

// ---------- 订阅与代账 ----------

export function monthlySubs(s: StateSlice): number {
  return SUB_BASE + (s.flags.aiSub === true ? AI_SUB : 0);
}

export function bookkeepingFee(s: StateSlice): number {
  return s.flags.selfBookkeeping === true ? 0 : BOOKKEEPING_FEE;
}

// ---------- 税费（主体形态决定档位） ----------

export function taxDue(s: StateSlice, profit: number): { tax: number; rate: number; gray: boolean } {
  if (profit <= 0) return { tax: 0, rate: 0, gray: s.entity === 'none' };
  if (s.entity === 'none') return { tax: 0, rate: 0, gray: true }; // 灰色：不报税，稽查权重↑（S3 事件读 flags.grayTaxMonth）
  if (s.entity === 'sole') return { tax: Math.round(profit * 0.03), rate: 0.03, gray: false }; // 个体户核定征收
  return { tax: Math.round(profit * 0.05), rate: 0.05, gray: false }; // 一人有限公司小微优惠
}

// ---------- 金融投资 ----------

/** 月度资产收益结算（按相位波动，crypto 高波动；就地改 portfolio，返回收益额） */
export function portfolioReturn(s: StateSlice, rng: Rng): number {
  let gain = 0;
  for (const k of Object.keys(ASSET_RET) as (keyof typeof ASSET_RET)[]) {
    const v = s.portfolio[k];
    if (v <= 0) continue;
    const ret = ASSET_RET[k];
    const r = ret[0] + (rng.next() * 2 - 1) * ret[1];
    const g = v * r;
    s.portfolio[k] = Math.max(0, Math.round(v + g));
    gain += g;
  }
  return gain;
}

/** invest dispatch：买/卖（amount<0 = 卖出）/还款/借款/投保（简化为金额转移+份额记账） */
export function applyInvest(s: StateSlice, a: Extract<Action, { t: 'invest' }>): ActionResult {
  if (s.meta.over) return { ok: false, msg: '生涯已结束' };
  const amt = Math.round(a.amount);
  const done = (msg: string): ActionResult => ({ ok: true, msg, floatTexts: [{ text: msg, cls: 'gold' }] });
  if (a.kind === 'repay') {
    if (amt <= 0 || s.cash < amt) return { ok: false, msg: '现金不足，无法还款' };
    s.cash -= amt;
    s.debt = Math.max(0, s.debt - amt);
    s.creditScore = Math.min(1000, s.creditScore + 2);
    return done(`还款 ¥${amt}：信用+2`);
  }
  if (a.kind === 'funding') {
    if (s.creditScore < 400) return { ok: false, msg: '信用分不足 400，借不到钱' };
    if (amt <= 0) return { ok: false, msg: '金额无效' };
    const due = Math.round(amt * 1.05);
    s.cash += amt;
    s.debt += due;
    return done(`借款 ¥${amt}（本息 ¥${due}）`);
  }
  if (a.kind === 'insurance') {
    if (amt <= 0 || s.cash < amt) return { ok: false, msg: '现金不足' };
    s.cash -= amt;
    s.flags.insured = true;
    return done('已投保：部分事故成本将由保险兜底');
  }
  if (a.kind === 'crypto' && s.flags.cryptoOn === false) return { ok: false, msg: '加密资产已在设置中关闭' };
  const key = a.kind === 'save' ? 'cash' : a.kind;
  if (!(key in s.portfolio)) return { ok: false, msg: '未知资产类型' };
  const k = key as keyof typeof s.portfolio;
  if (amt > 0) {
    if (s.cash < amt) return { ok: false, msg: '现金不足' };
    s.cash -= amt;
    s.portfolio[k] += amt;
    return done(`买入 ${a.kind} ¥${amt}`);
  }
  if (amt < 0) {
    const sell = -amt;
    if (s.portfolio[k] < sell) return { ok: false, msg: '持仓不足' };
    s.portfolio[k] -= sell;
    s.cash += sell;
    return done(`卖出 ${a.kind} ¥${sell}`);
  }
  return { ok: false, msg: '金额无效' };
}

// ---------- 月结算 ----------

export interface MonthSettleInput {
  projectIncome: number; // 项目 MRR 全额（含被动部分，settleProjectsMonth 已入现金）
  projectUpkeep: number; // 项目月维护（settleProjectsMonth 已入现金扣减，此处只计报表）
  passiveIncome: number; // 被动部分（自由期判定 stage5 用）
  moonThree: string[]; // 月三魔咒项目名
}

/**
 * 月度结算：损益聚合 → 税费 → 订阅/代账/OS upkeep/Token 账单 → 信用分 → runway。
 * 项目收入与交付收入已在发生时入 cash；此处只扣月度性支出并生成损益报表。
 */
export function settleMonth(s: StateSlice, rng: Rng, proj: MonthSettleInput): MonthReport {
  const phaseBefore = s.economyPhase;
  const incomeProject = proj.projectIncome;
  const incomeService = num(s.flags.monthRevenueAcc); // 交付现金 + 每日被动流（发生时已入账）
  const investGain = portfolioReturn(s, rng);
  const totalIncome = incomeProject + incomeService + Math.max(0, investGain);

  const dailySpent = num(s.flags.monthExpenseAcc); // 每日生活费+订阅（发生时已入账扣减）
  const fee = bookkeepingFee(s);
  const upkeep = s.osRules.reduce((a, r) => a + (findPatch(r.id)?.upkeep ?? 0), 0);
  const token = s.tokenBill.lastMonth;
  const monthlyCharges = fee + upkeep + token + proj.projectUpkeep; // 此刻统一扣
  const totalExpense = dailySpent + monthlyCharges;
  const profit = totalIncome - totalExpense;

  const { tax, gray } = taxDue(s, profit);
  s.cash -= monthlyCharges + tax;
  s.flags.grayTaxMonth = gray;
  if (gray) s.compliance = Math.max(0, s.compliance - 2);

  s.stats.totalExpense += Math.round(totalExpense);
  s.stats.taxesPaid += tax;

  // 信用分：正常纳税+2 / 逾期-30 / 合规+1 月
  if (tax > 0) {
    if (s.flags.taxCurrent === true) s.creditScore = Math.min(1000, s.creditScore + 2);
    else {
      s.creditScore = Math.max(0, s.creditScore - 30);
      s.compliance = Math.max(0, s.compliance - 5);
    }
  }
  s.flags.taxCurrent = false;
  if (s.compliance >= 70) s.creditScore = Math.min(1000, s.creditScore + 1);

  const phaseAfter = rollPhase(s, rng);

  s.monthlyIncome = Math.round(totalIncome);
  s.runway = Math.min(99, Math.round((Math.max(0, s.cash) / Math.max(1, totalExpense)) * 10) / 10);
  s.tokenBill.lastMonth = 0;
  s.flags.lastPassiveIncome = proj.passiveIncome;
  s.flags.monthRevenueAcc = 0;
  s.flags.monthExpenseAcc = 0;
  s.stats.maxCash = Math.max(s.stats.maxCash, Math.round(s.cash));
  s.stats.maxRunway = Math.max(s.stats.maxRunway, s.runway);

  return {
    day: s.meta.day,
    incomeProject: Math.round(incomeProject),
    incomeService: Math.round(incomeService),
    incomeInvest: Math.round(investGain),
    expenseLiving: Math.round(dailySpent),
    expenseSubs: monthlySubs(s),
    expenseUpkeep: upkeep,
    expenseToken: token,
    expenseProject: Math.round(proj.projectUpkeep),
    tax,
    profit: Math.round(profit),
    phaseBefore,
    phaseAfter,
    moonThree: proj.moonThree
  };
}
