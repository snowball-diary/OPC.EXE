// 智能体 + Token 经济引擎（技术文档 §8；设计 §九）——S3 真实现，替换 S2 桩
//
// 职责：
//   hireAgent/fireAgent       部署与停用（钱够+阶段够+未雇佣；trust=60 起步；停用即停止计费）
//   tickAgentsDay             ①替代域自动执行（[v0.10/W4] 每日工作日志 purple + weekStats 本周贡献）
//                             ②Token 日结扣现（[v0.10/W3] 当日用量×priceIndex，月底只汇总对账）
//                             ③trust 月度结算 ④超承载质量惩罚 ⑤月度事故掷骰 ⑥幽灵公司与"意义的空虚"
//   monthlyTokenBill          §8.2 月账单 = Σ(base + perUnit×units×usageScale)×priceIndex（butler 编排抽成 10%）
//   dailyTokenBill            [v0.10/W3] 月账单 / 30：每日扣现口径
//   agentBizMult              [v0.10/W4] 业务加成查询（deliver 收入/注册成本等，挂 AgentInstance 生效）
//   autoLevelScore            §8.4 六关键流程接管度（获客/内容/客服/销售/财务合规/交付）→ autoLevel
//   unitEconomics             §8.2 单位经济面板（毛利率/承载警戒），UI S7 直接读
//
// 计费扣款点：[v0.10/W3] tickAgentsDay 每日扣现（tokenBill.yesterday/monthToDate 记账），
// 月底 settleMonth 只做汇总行，不再一次性大额扣款。
import { findAgent } from '../data/agents.def';
import { findProjectType } from '../data/projects.def';
import { findLocation } from '../data/locations.def';
import { num } from './economy';
import { enqueueEvent } from './events';
import { ensureAccount, publishContent } from './platforms';
import { grantKp, pushLog } from './state';
import type { Rng } from './rng';
import type {
  ActionResult, AgentId, AgentInstance, AgentWeekStats, Project, StateSlice, UnitEconomicsPanel
} from './types';

const clamp01 = (n: number): number => Math.max(0, Math.min(100, n));

// ---------- [v0.10/W4] weekStats 工具 ----------

export function weekStatsOf(a: AgentInstance): AgentWeekStats {
  if (!a.weekStats) a.weekStats = { followers: 0, revenue: 0, apSaved: 0, tickets: 0, content: 0, leads: 0 };
  return a.weekStats;
}

/** 周日清零重算（time.ts 周结算块调用；新周第一天重建） */
export function resetAgentWeekStats(s: StateSlice): void {
  for (const a of s.agents) a.weekStats = { followers: 0, revenue: 0, apSaved: 0, tickets: 0, content: 0, leads: 0 };
}

/** [v0.10/W4] 业务加成查询：雇佣即生效、解雇即失效（butler=其他智能体效果的 40%） */
export interface AgentBizMult {
  deliverIncome: number; // deliverService/谈单收入乘子（sales +15%，butler +6%）
  registerCost: number; // 注册类行动现金成本乘子（regagent −30%，butler −12%）
  leadBonus: number; // 交付接单加成（growth 线索：min(+15%, 线索×1%)）
  churnMult: number; // 项目月 churn 乘子（support −20%，butler −8%）——settleProjectsMonth 消费
}

export function agentBizMult(s: StateSlice): AgentBizMult {
  const has = (id: AgentId): boolean => s.agents.some(a => a.id === id);
  const butler = has('butler');
  return {
    deliverIncome: 1 + (has('sales') ? 0.15 : 0) + (butler ? 0.06 : 0),
    registerCost: 1 - (has('regagent') ? 0.3 : 0) - (butler ? 0.12 : 0),
    leadBonus: Math.min(0.15, (s.stats.leads ?? 0) * 0.01),
    churnMult: 1 - (has('support') ? 0.2 : 0) - (butler ? 0.08 : 0)
  };
}

/** 各智能体月度基础事故概率（用量与低 trust 放大；§8.1 风险列的引擎化） */
export const AGENT_RISK_MONTHLY: Record<AgentId, number> = {
  support: 0.04, growth: 0.06, content: 0.05, sales: 0.05,
  legalfin: 0.03, regagent: 0.03, butler: 0.1 // butler 风险聚合
};

/** trust 承载 = max(1, trust/20)：usageScale 超过它 → 项目 quality 月-5（§8.2 质量衰减阈值） */
export function trustCapacity(a: AgentInstance): number {
  return Math.max(1, a.trust / 20);
}

/** 幽灵公司六关键流程（§8.4）：获客/内容/客服/销售/财务合规/交付 */
export const AUTO_FLOWS = ['growth', 'content', 'support', 'sales', 'fin', 'delivery'] as const;
export type AutoFlow = (typeof AUTO_FLOWS)[number];

/** 流程覆盖表：智能体在岗即接管；butler 编排全部；交付也可由在营 autoSrv 项目自带自动化 */
export function flowCoverage(s: StateSlice): Record<AutoFlow, boolean> {
  const has = (id: AgentId): boolean => s.agents.some(a => a.id === id);
  const butler = has('butler');
  const autoSrvAlive = s.projects.some(p => {
    if (!p.alive) return false;
    const t = findProjectType(p.type);
    return t?.potentialClass === 'autoSrv';
  });
  return {
    growth: has('growth') || butler,
    content: has('content') || butler,
    support: has('support') || butler,
    sales: has('sales') || butler,
    fin: has('legalfin') || butler,
    delivery: butler || autoSrvAlive
  };
}

/** §8.4 AutoLevel = 已接管关键流程 / 全流程 ×100 */
export function autoLevelScore(s: StateSlice): number {
  const cov = flowCoverage(s);
  const covered = AUTO_FLOWS.filter(f => cov[f]).length;
  return (covered / AUTO_FLOWS.length) * 100;
}

/** 主平台：粉丝最多的非封禁账号（与 actions.pickPlatformId 口径一致） */
export function primaryPlatformId(s: StateSlice): string {
  const entries = Object.entries(s.platforms).filter(([, a]) => a && a.state !== 'banned');
  if (entries.length === 0) return 'wechat';
  let best = entries[0];
  if (!best) return 'wechat';
  for (const e of entries) if (best && e[1].followers > best[1].followers) best = e;
  return best?.[0] ?? 'wechat';
}

// ---------- 雇佣 / 停用 ----------

export function hireAgent(s: StateSlice, id: AgentId, rng: Rng): ActionResult {
  void rng;
  if (s.meta.over) return { ok: false, msg: '生涯已结束' };
  const def = findAgent(id);
  if (!def) return { ok: false, msg: `未知智能体：${id}` };
  if (s.agents.some(a => a.id === id)) return { ok: false, msg: `「${def.name}」已在岗` };
  if (s.meta.stage < def.unlockStage) {
    return { ok: false, msg: `阶段不足：「${def.name}」需 OS v${def.unlockStage}.0 解锁（当前 v${s.meta.stage}.0）` };
  }
  if (s.cash < def.deployCost) return { ok: false, msg: `部署费不足（需 ¥${def.deployCost}）` };
  s.cash -= def.deployCost;
  s.agents.push({ id, hiredDay: s.meta.day, usageScale: 1, trust: 60, weekStats: { followers: 0, revenue: 0, apSaved: 0, tickets: 0, content: 0, leads: 0 } });
  s.stats.agentsHired += 1;
  grantKp(s, 'agent'); // [S8] 首次雇佣送智能体经济词条
  pushLog(s, `「${def.name}」部署完成（¥${def.deployCost}）：trust 60 起步，Token ¥${def.monthlyTokenBase}/月起（每日按 1/30 扣现），业务越大烧得越多。自动化不是放手不管。`, 'good');
  return { ok: true, msg: `已部署「${def.name}」`, floatTexts: [{ text: '智能体+', cls: 'good' }] };
}

export function fireAgent(s: StateSlice, id: AgentId, rng: Rng): ActionResult {
  void rng;
  if (s.meta.over) return { ok: false, msg: '生涯已结束' };
  const def = findAgent(id);
  if (!def) return { ok: false, msg: `未知智能体：${id}` };
  const i = s.agents.findIndex(a => a.id === id);
  if (i < 0) return { ok: false, msg: `「${def.name}」未在岗` };
  s.agents.splice(i, 1);
  pushLog(s, `「${def.name}」已停用：Token 计费停止。它接管的流程要重新自己扛了。`, 'sys');
  return { ok: true, msg: `已停用「${def.name}」`, floatTexts: [{ text: '智能体-', cls: 'sys' }] };
}

// ---------- 每日结算 ----------

export function tickAgentsDay(s: StateSlice, rng: Rng): void {
  if (s.meta.over) return;
  const monthBoundary = s.meta.day % 30 === 0;
  const weekStart = s.meta.day % 7 === 1; // 新周第一天：weekStats 清零重算
  const butlerOn = s.agents.some(a => a.id === 'butler');
  const butlerMult = butlerOn ? 1.1 : 1; // 编排放大其他智能体产出 10%
  const market = findLocation(s.location)?.marketMult ?? 1; // [S9] 获客/成单产出随地点市场规模
  const aliveProjects = s.projects.filter(p => p.alive);

  if (weekStart) resetAgentWeekStats(s);

  // --- ① 替代域行动的自动执行 + [v0.10/W4] 每日工作日志（purple，具体数字可感知） ---
  for (const a of s.agents) {
    const def = findAgent(a.id);
    if (!def) continue;
    const ws = weekStatsOf(a);
    const trustF = a.trust < 40 ? 0.5 : 1; // trust<40 效率减半（§8.1）
    const eff = def.efficiency * trustF * butlerMult;
    switch (a.id) {
      case 'growth': {
        const acc = ensureAccount(s, primaryPlatformId(s));
        if (acc.state !== 'banned') {
          const gain = Math.max(1, Math.round(rng.int(3, 10) * a.usageScale * eff * market));
          acc.followers += gain;
          ws.followers += gain;
          s.stats.followersPeak = Math.max(s.stats.followersPeak, acc.followers);
          acc.banRisk = clamp01(acc.banRisk + 0.2 * a.usageScale); // §8.5 投放用量计入平台 banRisk
          pushLog(s, `【${def.name}】今日拉新 +${gain} 粉（主平台 ${Math.round(acc.followers)}）· banRisk ${Math.round(acc.banRisk)}`, 'purple');
        }
        // [v0.10/W4] 每周（新周首日）产生 1-3 条销售线索（butler 编排为其 40%）
        if (weekStart) {
          let leads = rng.int(1, 3);
          if (butlerOn) leads += Math.max(1, Math.round(leads * 0.4));
          s.stats.leads += leads;
          ws.leads += leads;
          pushLog(s, `【${def.name}】本周线索池入账 +${leads} 条（累计 ${s.stats.leads}）——交付类行动接单成功率 +${Math.round(Math.min(0.15, s.stats.leads * 0.01) * 100)}%`, 'purple');
        }
        break;
      }
      case 'content': {
        // [v0.10/W4] 每 2 日自动产 1 篇（等效 writeContent 的 40% 效果），日志可见
        const due = (s.meta.day - a.hiredDay) % 2 === 0;
        if (!due) break;
        const pid = primaryPlatformId(s);
        const acc = ensureAccount(s, pid);
        if (acc.state === 'banned') break;
        const r = publishContent(s, pid, rng); // 走平台引擎：抽样/banRisk/AI 检测全联动
        const scaled = Math.max(0, Math.round(r.followers * 0.4)); // 等效 40% 涨粉
        const giveBack = r.followers - scaled;
        acc.followers = Math.max(0, acc.followers - giveBack);
        s.stats.followersPeak = Math.max(s.stats.followersPeak, acc.followers);
        s.stats.contentPublished += 1;
        ws.content += 1;
        ws.followers += scaled;
        if (r.income > 0) ws.revenue += r.income;
        pushLog(s, `【${def.name}】自动产出第 ${ws.content} 篇内容（等效 40%）：粉丝 +${scaled}${r.income > 0 ? ` · 变现 +¥${Math.round(r.income * 0.4)}` : ''}`, 'purple');
        if (r.income > 0) {
          // 自动内容变现按 40% 等效折算（引擎侧 publishContent 已全额入账，回冲 60%）
          const giveBackCash = Math.round(r.income * 0.6);
          s.cash -= giveBackCash;
          s.stats.totalRevenue -= giveBackCash;
          s.flags.monthRevenueAcc = num(s.flags.monthRevenueAcc) - giveBackCash;
        }
        break;
      }
      case 'support': {
        // [v0.10/W4] 在营项目 maintenance 日 -0.8×eff（替代域）之外再 -0.5（数值加成），churn −20% 见 settleProjectsMonth
        const reliefTotal = 0.8 * eff + 0.5;
        let tickets = 0;
        for (const p of aliveProjects) {
          p.maintenance = clamp01(p.maintenance - reliefTotal);
          tickets += Math.round(4 + p.users * 0.02);
        }
        tickets = Math.round(tickets * a.usageScale * trustF);
        ws.tickets += tickets;
        pushLog(s, `【${def.name}】今日处理 ${tickets} 工单 · 维护 -${Math.round(reliefTotal * aliveProjects.length)} · 满意度+`, 'purple');
        break;
      }
      case 'sales': {
        if (aliveProjects.length > 0 && rng.chance(Math.min(0.6, 0.15 * a.usageScale))) {
          const income = Math.max(1, Math.round(rng.int(500, 1200) * eff * market));
          s.cash += income;
          s.stats.totalRevenue += income;
          s.stats.orders += 1;
          s.flags.monthRevenueAcc = num(s.flags.monthRevenueAcc) + income;
          s.dailyFlow.serviceIn += income;
          ws.revenue += income;
          pushLog(s, `【${def.name}】自动成单 +¥${income}（×${eff.toFixed(2)} 效率 · 市场系数 ${market.toFixed(2)}）`, 'purple');
        } else {
          pushLog(s, `【${def.name}】今日跟进 ${Math.round(6 * a.usageScale)} 个线索，未成交——话术库还在学。`, 'purple');
        }
        break;
      }
      case 'legalfin': {
        pushLog(s, `【${def.name}】今日对账 ${rng.int(3, 9)} 笔流水 · 发票校验通过 · 月底自动报税（合规 +2/月）`, 'purple');
        break;
      }
      case 'regagent': {
        pushLog(s, `【${def.name}】今日巡检资质与年检日历 · 注册类行动现金成本 -30%生效中`, 'purple');
        break;
      }
      case 'butler': {
        // [v0.10/W4] 每日额外返 0.2 AP（攒够 1 点补发，银行封顶 1）
        const bank = num(s.flags.butlerApBank);
        const nb = Math.min(1, bank + 0.2);
        if (nb >= 1) {
          s.ap += 1;
          s.flags.butlerApBank = 0;
          ws.apSaved += 1;
        } else {
          s.flags.butlerApBank = nb;
        }
        pushLog(s, `【${def.name}】今日编排六线运转 · 其他智能体效果 40% 加成中${nb >= 1 ? ' · 返还 1 AP' : ` · AP 银行 ${nb.toFixed(1)}/1.0`}`, 'purple');
        break;
      }
      default: break;
    }
  }

  // --- ①b [v0.10/W3] Token 日结：当日用量×priceIndex 扣现（月底只汇总对账，不再大额扣款） ---
  const dayBill = dailyTokenBill(s);
  if (dayBill > 0) {
    s.cash -= dayBill;
    s.stats.tokenSpent += Math.round(dayBill);
    s.stats.totalExpense += Math.round(dayBill);
    s.dailyFlow.tokenOut += dayBill;
    s.tokenBill.yesterday = dayBill;
    s.tokenBill.monthToDate += dayBill;
  }

  // --- autoLevel 重算 + 幽灵公司旗标（每日必要 AP 降为 1 由 time 层处理） ---
  recomputeAutoLevel(s);

  if (!monthBoundary) return;

  // --- ② trust 月度结算：上月无事故 +5 ---
  for (const a of s.agents) {
    if (s.flags[`agAcc_${a.id}`] !== true) a.trust = Math.min(100, a.trust + 5);
    s.flags[`agAcc_${a.id}`] = false;
  }

  // --- ③ 超承载：usageScale > trust 承载 → 项目 quality 月-5（§8.2 质量衰减阈值） ---
  for (const a of s.agents) {
    const def = findAgent(a.id);
    if (!def) continue;
    const cap = trustCapacity(a);
    if (a.usageScale > cap + 1e-9) {
      for (const p of aliveProjects) p.quality = clamp01(p.quality - 5);
      pushLog(s, `「${def.name}」用量超出 trust 承载（${a.usageScale.toFixed(1)}/${cap.toFixed(1)}）：项目质量 -5。要么加薪（trust），要么减速。`, 'bad');
    }
    // legalfin 自动记账报税 / regagent 合规维护（月度）
    if (a.id === 'legalfin') {
      s.flags.taxCurrent = true; // 按期报税：月结时信用 +2 而非逾期 -30
      s.compliance = clamp01(s.compliance + 2);
    }
    if (a.id === 'regagent') s.compliance = clamp01(s.compliance + 2);
  }

  // --- ④ 事故掷骰（月度，风险事件入 pending 队列 + trust-20） ---
  for (const a of s.agents) {
    const def = findAgent(a.id);
    if (!def) continue;
    const usageF = Math.min(1.5, Math.max(0.5, 0.5 + a.usageScale * 0.25)); // 风险与用量挂钩
    const p = AGENT_RISK_MONTHLY[a.id] * usageF * (a.trust < 40 ? 1.5 : 1);
    if (!rng.chance(p)) continue;
    const evId = rng.pick(def.riskEvents) ?? `${a.id}-accident`;
    enqueueEvent(s, evId, 'forced', { cooldownDays: 5 });
    a.trust = Math.max(0, a.trust - 20);
    s.flags[`agAcc_${a.id}`] = true;
    s.stats.accidents += 1;
    pushLog(s, `智能体事故：「${def.name}」触发风险事件（trust -20）。你需要人工盯住它了。`, 'bad');
  }

  // --- ⑤ 幽灵公司对价：月度"意义的空虚"（无亲自创作/见客户 → mood-3，§8.4） ---
  if (s.flags.ghostCompany === true) {
    const curMonth = Math.floor((s.meta.day - 1) / 30);
    const outDay = num(s.flags.lastOutputDay);
    const personalMade = (outDay > 0 && Math.floor((outDay - 1) / 30) === curMonth)
      || s.contacts.some(c => c.lastTouch > 0 && Math.floor((c.lastTouch - 1) / 30) === curMonth);
    if (!personalMade) {
      s.health.mood.v = clamp01(s.health.mood.v - 3);
      pushLog(s, '意义的空虚：公司自己在转，可这里没有一件东西是你亲手做的，也没有一个客户是你亲自见的。（心境 -3）', 'bad');
    }
  }

  // --- [v0.10/W3] Token 月度对账（现金已逐日扣，此处只做烧钱警报判定与汇总口径） ---
  const bill = monthlyTokenBill(s); // 月账单口径（当期在岗智能体的整月投影）
  // 烧钱警报记账：连续 2 月账单 > 上月收入 60%（事件体由 S5 提供 id 'token-burn-warning'）
  if (s.monthlyIncome > 0 && bill > s.monthlyIncome * 0.6) {
    s.flags.tokenBurnStreak = num(s.flags.tokenBurnStreak) + 1;
    if (num(s.flags.tokenBurnStreak) >= 2) {
      enqueueEvent(s, 'token-burn-warning', 'forced', { cooldownDays: 30 });
      s.flags.tokenBurnStreak = 0;
    }
  } else {
    s.flags.tokenBurnStreak = 0;
  }
}

function recomputeAutoLevel(s: StateSlice): void {
  const score = autoLevelScore(s);
  // 智能体覆盖抬升下限；行动（写 SOP/自动化搭建）攒出的部分缓慢折旧
  s.autoLevel = score >= s.autoLevel ? score : Math.max(score, s.autoLevel - 0.2);
  const ghost = s.autoLevel >= 85;
  if (ghost && s.flags.ghostCompany !== true) {
    grantKp(s, 'ghostCompany'); // [S8] 幽灵公司成立送词条
    pushLog(s, '幽灵公司成立：关键流程全部由智能体接管，公司开始自己转。每日必要 AP 降至 1——但"这是你的公司吗"这个问题，现在归你答。', 'gold');
  }
  if (!ghost && s.flags.ghostCompany === true) {
    pushLog(s, '幽灵公司状态解除：你重新回到了流水线上。', 'sys');
  }
  s.flags.ghostCompany = ghost;
}

// ---------- Token 经济（§8.2） ----------

/** 月业务量：客服=工单（10/项目）、获客=千次触达（粉丝峰值/1000）、内容=篇（4/项目）、销售=百次跟进（2/项目） */
function agentMonthlyUnits(s: StateSlice, id: AgentId, alive: number): number {
  switch (id) {
    case 'support': return alive * 10;
    case 'growth': return Math.floor(s.stats.followersPeak / 1000);
    case 'content': return alive * 4;
    case 'sales': return alive * 2;
    default: return 0; // legalfin/regagent/butler（butler 走编排抽成）
  }
}

/** §8.2 月账单 = Σ(base + perUnit×units×usageScale)×priceIndex；butler 对其他智能体账单抽成 10% */
export function monthlyTokenBill(s: StateSlice, rng?: Rng): number {
  void rng;
  const pi = s.tokenBill.priceIndex;
  const alive = s.projects.filter(p => p.alive).length;
  let othersPre = 0;
  let butlerPre = 0;
  for (const a of s.agents) {
    const def = findAgent(a.id);
    if (!def) continue;
    const pre = def.monthlyTokenBase + def.tokenPerUnit * agentMonthlyUnits(s, a.id, alive) * a.usageScale;
    if (a.id === 'butler') butlerPre += pre;
    else othersPre += pre;
  }
  const orchestration = s.agents.some(a => a.id === 'butler') ? othersPre * 0.1 : 0;
  return (othersPre + butlerPre + orchestration) * pi;
}

/** [v0.10/W3] Token 日账单 = 月账单 / 30（每日扣现，反馈前置） */
export function dailyTokenBill(s: StateSlice): number {
  return monthlyTokenBill(s) / 30;
}

// ---------- 单位经济面板（§8.2，UI S7 常驻） ----------

export const PLATFORM_FEE_RATE = 0.05; // 平台费率（独立站归自己，引擎统一按 5% 记）

export function unitEconomics(s: StateSlice, project: Project): UnitEconomicsPanel {
  const t = findProjectType(project.type);
  const price = t ? (t.price[0] + t.price[1]) / 2 : 0;
  const cogs = t?.cogsToken ?? 0;
  const pi = s.tokenBill.priceIndex;
  const grossMargin = price > 0 ? (price - cogs * pi - PLATFORM_FEE_RATE * price) / price : 0;
  const driver = s.agents.reduce<AgentInstance | undefined>(
    (m, a) => (m === undefined || a.usageScale > m.usageScale ? a : m), undefined);
  const cap = driver ? trustCapacity(driver) : 99;
  const usage = s.agents.reduce((m, a) => Math.max(m, a.usageScale), 0);
  const over = driver !== undefined && usage > cap + 1e-9;
  return {
    projectType: project.type,
    price,
    cogsToken: cogs,
    priceIndex: pi,
    feeRate: PLATFORM_FEE_RATE,
    grossMargin,
    usageScale: usage,
    trustCapacity: cap,
    overTrustCapacity: over,
    scaleCapNote: over
      ? '用量超 trust 承载：项目质量每月 -5（规模化上限 = 质量衰减阈值）'
      : '规模化上限 = min(平台风控阈值, 质量衰减阈值)'
  };
}
