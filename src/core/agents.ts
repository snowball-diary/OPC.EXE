// 智能体 + Token 经济引擎（技术文档 §8；设计 §九）——S3 真实现，替换 S2 桩
//
// 职责：
//   hireAgent/fireAgent       部署与停用（钱够+阶段够+未雇佣；trust=60 起步；停用即停止计费）
//   tickAgentsDay             ①替代域自动执行 ②trust 月度结算 ③超承载质量惩罚
//                             ④月度事故掷骰（riskEvents 入 pending 队列）⑤幽灵公司与"意义的空虚"
//   monthlyTokenBill          §8.2 月账单 = Σ(base + perUnit×units×usageScale)×priceIndex（butler 编排抽成 10%）
//   autoLevelScore            §8.4 六关键流程接管度（获客/内容/客服/销售/财务合规/交付）→ autoLevel
//   unitEconomics             §8.2 单位经济面板（毛利率/承载警戒），UI S7 直接读
//
// 计费扣款点：time.ts 月结块写 s.tokenBill.lastMonth = monthlyTokenBill(s,rng)，
// economy.settleMonth 读它统一扣款并清零——链路 S2 已接好，本模块只负责算准。
import { findAgent } from '../data/agents.def';
import { findProjectType } from '../data/projects.def';
import { findLocation } from '../data/locations.def';
import { num } from './economy';
import { enqueueEvent } from './events';
import { ensureAccount, publishContent } from './platforms';
import { grantKp, pushLog } from './state';
import type { Rng } from './rng';
import type {
  ActionResult, AgentId, AgentInstance, Project, StateSlice, UnitEconomicsPanel
} from './types';

const clamp01 = (n: number): number => Math.max(0, Math.min(100, n));

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
  s.agents.push({ id, hiredDay: s.meta.day, usageScale: 1, trust: 60 });
  s.stats.agentsHired += 1;
  grantKp(s, 'agent'); // [S8] 首次雇佣送智能体经济词条
  pushLog(s, `「${def.name}」部署完成（¥${def.deployCost}）：trust 60 起步，月 Token 账单 ¥${def.monthlyTokenBase} 起，业务越大烧得越多。自动化不是放手不管。`, 'good');
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
  const butlerOn = s.agents.some(a => a.id === 'butler');
  const butlerMult = butlerOn ? 1.1 : 1; // 编排放大其他智能体产出 10%
  const market = findLocation(s.location)?.marketMult ?? 1; // [S9] 获客/成单产出随地点市场规模
  const aliveProjects = s.projects.filter(p => p.alive);

  // --- ① 替代域行动的自动执行 ---
  for (const a of s.agents) {
    const def = findAgent(a.id);
    if (!def || a.id === 'butler') continue; // butler 只做编排（乘子+抽成），不直接产出
    const trustF = a.trust < 40 ? 0.5 : 1; // trust<40 效率减半（§8.1）
    const eff = def.efficiency * trustF * butlerMult;
    switch (a.id) {
      case 'growth': {
        const acc = ensureAccount(s, primaryPlatformId(s));
        if (acc.state !== 'banned') {
          const gain = Math.max(1, Math.round(rng.int(3, 10) * a.usageScale * eff * market));
          acc.followers += gain;
          s.stats.followersPeak = Math.max(s.stats.followersPeak, acc.followers);
          acc.banRisk = clamp01(acc.banRisk + 0.2 * a.usageScale); // §8.5 投放用量计入平台 banRisk
        }
        break;
      }
      case 'content': {
        if (!rng.chance(Math.min(0.9, 0.2 + 0.25 * a.usageScale))) break;
        const pid = primaryPlatformId(s);
        const acc = ensureAccount(s, pid);
        if (acc.state === 'banned') break;
        const r = publishContent(s, pid, rng); // 走平台引擎：抽样/banRisk/AI 检测全联动
        const extra = Math.round(r.followers * (eff - 1)); // 效率差补足（eff<1 时为负，代表同质化削流量）
        if (extra !== 0) {
          acc.followers = Math.max(0, acc.followers + extra);
          s.stats.followersPeak = Math.max(s.stats.followersPeak, acc.followers);
        }
        s.stats.contentPublished += 1;
        break;
      }
      case 'support': {
        for (const p of aliveProjects) p.maintenance = clamp01(p.maintenance - 0.8 * eff); // 自动消化客服与工单
        break;
      }
      case 'sales': {
        if (aliveProjects.length > 0 && rng.chance(Math.min(0.6, 0.15 * a.usageScale))) {
          const income = Math.max(1, Math.round(rng.int(500, 1200) * eff * market));
          s.cash += income;
          s.stats.totalRevenue += income;
          s.stats.orders += 1;
          s.flags.monthRevenueAcc = num(s.flags.monthRevenueAcc) + income;
        }
        break;
      }
      default: break; // legalfin/regagent：无每日产出，月度结算见下
    }
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

  // --- Token 用量记账（账单本身由 time.ts 月结块写入 tokenBill.lastMonth → settleMonth 扣款） ---
  const bill = monthlyTokenBill(s, rng);
  s.stats.tokenSpent += Math.round(bill);
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
export function monthlyTokenBill(s: StateSlice, rng: Rng): number {
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
