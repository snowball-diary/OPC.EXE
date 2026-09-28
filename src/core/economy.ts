// 经济引擎：生活成本 / 经济周期 / 税费 / 日结金融 / 月度对账 / 金融 dispatch（技术文档 §6.3/§6.4，设计 §六）
// [v0.10/W2] 现金流每日可见，月底只做对账汇总：投资按日浮动记账（tickPortfolioDay），
// 卖出才落袋（applyInvest 已实现收益单独统计）；Token 已改日扣（agents.ts），月报只汇总。
import { findDifficulty } from '../data/openings.def';
import { findLocation } from '../data/locations.def';
import { findPatch } from '../data/patches.def';
import {
  AI_SUB, ASSET_DAILY_VOL, ASSET_RET, BOOKKEEPING_FEE, LIVING_BASE, PHASE_ORDER_MULT, PHASE_TRANSITIONS, SUB_BASE
} from '../data/economy.def';
import type { Rng } from './rng';
import type {
  Action, ActionResult, DailyFlow, EconomyPhase, MonthReport, StateSlice
} from './types';

export const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

// ---------- [v0.10/W2] 今日净流 ----------

/** 今日净流（纯函数）：流入合计 − 流出合计（顶栏 hover / 财务 Tab 首行） */
export function dailyNet(df: DailyFlow): number {
  return df.projIn + df.passiveIn + df.serviceIn - df.livingOut - df.subsOut - df.tokenOut - df.otherOut;
}

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

// ---------- 金融投资（[v0.10/W2] 日浮动市值，卖出落袋） ----------

/**
 * 日度市值浮动：各资产按「月期望/30 漂移 + 日波动率」重估市值（活期无波动）。
 * 只累积浮动盈亏（investGains.floatToday/floatMonth），不动现金——卖出才落袋。
 */
export function tickPortfolioDay(s: StateSlice, rng: Rng): number {
  let gain = 0;
  s.investGains.floatToday = 0;
  for (const k of Object.keys(ASSET_RET) as (keyof typeof ASSET_RET)[]) {
    const v = s.portfolio[k];
    if (v <= 0) continue;
    const drift = ASSET_RET[k][0] / 30; // 月期望折日漂移
    const r = drift + (rng.next() * 2 - 1) * ASSET_DAILY_VOL[k];
    const g = v * r;
    s.portfolio[k] = Math.max(0, v + g); // 市值（clampAll 收口取整）
    gain += g;
  }
  s.investGains.floatToday = gain;
  s.investGains.floatMonth += gain;
  return gain;
}

/** invest dispatch：买/卖（amount<0 = 卖出）/还款/借款/投保。
 *  [v0.10] 卖出按市值落袋，同时结转已实现收益 = 卖出市值 − 对应成本份额。 */
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
    if (k !== 'cash') s.portfolioCost[k] += amt; // 成本随买入门
    return done(`买入 ${a.kind} ¥${amt}`);
  }
  if (amt < 0) {
    const sell = -amt;
    if (s.portfolio[k] < sell) return { ok: false, msg: '持仓不足' };
    s.portfolio[k] -= sell;
    s.cash += sell;
    if (k !== 'cash') {
      const costShare = Math.min(s.portfolioCost[k], s.portfolioCost[k] * (sell / Math.max(1e-9, s.portfolio[k] + sell)));
      s.portfolioCost[k] -= costShare;
      const realized = sell - costShare; // 市值落袋 − 成本份额（可为负）
      s.investGains.realizedTotal += realized;
      s.investGains.realizedMonth += realized;
      return done(`卖出 ${a.kind} ¥${Math.round(sell)}（落袋盈亏 ${realized >= 0 ? '+' : ''}${Math.round(realized)}）`);
    }
    return done(`卖出 ${a.kind} ¥${sell}`);
  }
  return { ok: false, msg: '金额无效' };
}

// ---------- 月结算 ----------

export interface MonthSettleInput {
  projectIncome: number; // 项目月流水（settleProjectsDay 日结累计 + 对账修正；现金已逐日入账）
  projectUpkeep: number; // 项目月维护（settleProjectsMonth 已入现金扣减，此处只计报表）
  passiveIncome: number; // 被动部分（自由期判定 stage5 用）
  moonThree: string[]; // 月三魔咒项目名
}

/**
 * 月度结算（[v0.10] 对账版）：现金流已逐日入账（项目日结/Token 日扣/投资浮动），
 * 此处只做损益聚合 → 税费 → 代账/OS upkeep/项目维护 → 信用分 → runway → 月报归档。
 */
export function settleMonth(s: StateSlice, rng: Rng, proj: MonthSettleInput): MonthReport {
  const phaseBefore = s.economyPhase;
  const incomeProject = proj.projectIncome;
  const incomeService = num(s.flags.monthRevenueAcc); // 交付现金 + 平台日变现（发生时已入账）
  const investRealized = s.investGains.realizedMonth; // 已实现（卖出落袋，现金已在卖出时入账）
  const investFloat = s.investGains.floatMonth; // 本月浮动（未落袋，报表单列）
  const totalIncome = incomeProject + incomeService + Math.max(0, investRealized);

  const dailySpent = num(s.flags.monthExpenseAcc); // 每日生活费+订阅（发生时已入账扣减）
  const fee = bookkeepingFee(s);
  const upkeep = s.osRules.reduce((a, r) => a + (findPatch(r.id)?.upkeep ?? 0), 0);
  const token = s.tokenBill.monthToDate; // [v0.10/W3] 已逐日扣现，此处只报表汇总
  const monthlyCharges = fee + upkeep + proj.projectUpkeep; // 此刻统一扣（Token 不再月扣）
  const totalExpense = dailySpent + token + monthlyCharges;
  const profit = totalIncome - totalExpense;

  const { tax, gray } = taxDue(s, profit);
  s.cash -= monthlyCharges + tax;
  s.flags.grayTaxMonth = gray;
  if (gray) s.compliance = Math.max(0, s.compliance - 2);

  s.stats.totalExpense += Math.round(monthlyCharges + tax); // 生活费/订阅/Token 已在日结时计入

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
  s.tokenBill.monthToDate = 0; // 月度汇总行已生成，累计清零（对账日志由 time.ts 输出）
  s.investGains.realizedMonth = 0;
  s.investGains.floatMonth = 0;
  s.flags.lastPassiveIncome = proj.passiveIncome;
  s.flags.monthRevenueAcc = 0;
  s.flags.monthExpenseAcc = 0;
  s.stats.maxCash = Math.max(s.stats.maxCash, Math.round(s.cash));
  s.stats.maxRunway = Math.max(s.stats.maxRunway, s.runway);

  const report: MonthReport = {
    day: s.meta.day,
    incomeProject: Math.round(incomeProject),
    incomeService: Math.round(incomeService),
    incomeInvest: Math.round(investRealized),
    investFloat: Math.round(investFloat),
    expenseLiving: Math.round(dailySpent),
    expenseSubs: monthlySubs(s),
    expenseUpkeep: upkeep,
    expenseToken: Math.round(token),
    expenseProject: Math.round(proj.projectUpkeep),
    tax,
    profit: Math.round(profit),
    phaseBefore,
    phaseAfter,
    moonThree: proj.moonThree
  };
  s.lastMonthReport = report; // [v0.10/W8] 财务 Tab 环比箭头数据源
  return report;
}
