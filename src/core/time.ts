// 时间引擎：advanceDay 11 步流水线（技术文档 §6.1）+ 周复盘三段生成器（§6.2）+ 月结算（§6.3）+ 年结算
// 步 5/6/7/8 调 S3 桩（platforms/agents/events）；步 11 存档由 UI 层负责（引擎只 serialize）
import { monthlySubs, settleMonth } from './economy';
import { enqueueEvent, rollEvents } from './events';
import {
  apMaxFor, composeHealth, driftDay, fatigueWarning, num, recoveryState,
  rollSuddenDeath, suddenDeathRisk, tickHiddenFatigue, updateDecisionMode
} from './health';
import { applyEnding, checkPassiveEndings } from './endings';
import { findEnding } from '../data/endings.def';
import { checkAchievements } from './achievements'; // [S4] 成就接线
import { monthlyTokenBill, tickAgentsDay } from './agents';
import { rollPlatformDay } from './platforms';
import { settleProjectsMonth, stageIdx, tickProjectsDay } from './projects';
import { tickPatchesDay } from './os';
import { clampAll, grantKp, pushLog } from './state';
import type { Rng } from './rng';
import type {
  BottleneckKey, BottleneckScore, DayReport, EconomyPhase, LogEntry,
  PendingEvent, StateSlice, WeeklyReviewResult
} from './types';

const clampv = (n: number): number => Math.max(0, Math.min(100, n));

const PHASE_NAMES: Record<EconomyPhase, string> = { boom: '繁荣', overheat: '过热', recession: '衰退', recovery: '复苏' };

export const BOTTLENECK_LABELS: Record<BottleneckKey, string> = {
  health: '健康', cash: '现金流', marketing: '获客', delivery: '交付', skill: '技能', compliance: '合规'
};

// ---------- 瓶颈引擎（§6.2：影响×紧迫×可控×杠杆÷成本，6 候选排序） ----------

function bottleneckScores(s: StateSlice): BottleneckScore[] {
  const h = composeHealth(s.health);
  const anySub = [s.health.sleep.v, s.health.mood.v, s.health.diet.v, s.health.exercise.v].some(v => v < 20);
  const runway = s.monthlyExpense > 0 ? Math.max(0, s.cash) / s.monthlyExpense : 99;
  const alive = s.projects.filter(p => p.alive);
  const launched = alive.some(p => stageIdx(p.stage) >= 3);
  const avgLv = ((Object.values(s.skills) as number[]).reduce((a, b) => a + b, 0)) / 5;
  // [影响, 紧迫, 可控, 杠杆, 成本]
  const raw: Record<BottleneckKey, [number, number, number, number, number]> = {
    health: [100 - h, anySub || s.health.hiddenFatigue >= 70 ? 90 : 40, 90, 85, 30],
    cash: [runway < 3 ? 90 : runway < 6 ? 60 : 30, runway < 3 ? 95 : 50, 70, 75, 40],
    marketing: [s.stats.followersPeak < 500 ? 70 : 45, launched ? 70 : 40, 60, 65, 50],
    delivery: [alive.some(p => p.maintenance > 50) || launched ? 70 : 40, 55, 75, 70, 45],
    skill: [avgLv < 2 ? 65 : 35, 45, 85, 80, 55],
    compliance: [s.compliance < 60 ? 75 : 20, s.compliance < 40 ? 85 : 30, 80, 60, 35]
  };
  return (Object.keys(raw) as BottleneckKey[])
    .map(k => {
      const r = raw[k];
      const score = r[0] * r[1] * r[2] * r[3] / Math.max(1, r[4] ?? 1) / 1000;
      return { key: k, label: BOTTLENECK_LABELS[k], score: Math.round(score * 10) / 10 };
    })
    .sort((a, b) => b.score - a.score);
}

/** 三段复盘生成器：事实层（只陈述）/ 假设层（规则模板）/ 建议层（瓶颈 Top1） */
export function weeklyReview(s: StateSlice): WeeklyReviewResult {
  const candidates = bottleneckScores(s);
  const top = candidates[0];
  const names = { sleep: '睡眠', mood: '情绪', diet: '饮食', exercise: '运动' } as const;
  let lowest: { name: string; v: number } = { name: '睡眠', v: s.health.sleep.v };
  for (const k of ['sleep', 'mood', 'diet', 'exercise'] as const) {
    if (s.health[k].v < lowest.v) lowest = { name: names[k], v: s.health[k].v };
  }
  const facts = [
    `行动 ${num(s.flags.weekActs)} 次，交付 ${num(s.flags.weekDeliveries)} 单`,
    `现金变动 ¥${Math.round(num(s.flags.weekCashDelta))}，期末 ¥${Math.round(s.cash)}`,
    `健康 ${Math.round(composeHealth(s.health))}/100，压力 ${Math.round(s.stress)}/100`,
    `决策模式：${s.decisionMode === 'system2' ? 'System2（理性）' : 'System1（情绪）'}`
  ];
  const hyp: string[] = [];
  if (num(s.flags.weekHardPress) > 0) hyp.push(`${num(s.flags.weekHardPress)} 次硬撑与精力低谷直接相关`);
  if (lowest.v < 60) hyp.push(`「${lowest.name}」是当前最短板，行动效率正被它拖住`);
  if (num(s.flags.weekCashDelta) < 0) hyp.push('现金流为负：获客或交付节奏不足');
  if (s.decisionMode !== 'system2') hyp.push('System1 天数偏多：决策质量被身体状态拖累');
  if (s.projects.some(p => p.alive && p.maintenance > 60)) hyp.push('维护欠账在堆：交付质量开始反噬');
  if (hyp.length === 0) hyp.push('节奏本身是变量：先保住最低日的连续性');
  const suggestion = top
    ? `下周主焦点建议：${top.label}（该类行动 +15%，其余 -10%——贪多无加成）`
    : '';
  return { facts, hypotheses: hyp.slice(0, 3), suggestion, candidates };
}

// ---------- 阶段推进 ----------

const STAGE_VER: Record<number, string> = { 2: 'v0.2 求生', 3: 'v0.5 立定', 4: 'v1.0 成长', 5: 'v2.0 自由', 6: 'v3.0 传承' };
const STAGE_CAPS: Record<number, number> = { 1: 1, 2: 1, 3: 3, 4: 4, 5: 5, 6: 5 };

function checkStageUp(s: StateSlice, track: (msg: string, cls?: LogEntry['cls']) => void): void {
  const tryUp = (cond: boolean): boolean => {
    if (!cond || s.meta.stage >= 6) return false;
    s.meta.stage = (s.meta.stage + 1) as StateSlice['meta']['stage'];
    s.attentionCap = Math.max(s.attentionCap, STAGE_CAPS[s.meta.stage] ?? s.attentionCap);
    track(`阶段提升：OS ${STAGE_VER[s.meta.stage] ?? s.meta.stage}——新的面板解锁了。`, 'gold');
    return true;
  };
  // 逐档判定（满足即停）
  if (s.meta.stage === 1) tryUp(s.stats.totalRevenue > 0);
  if (s.meta.stage === 2) tryUp(s.monthlyIncome > 0 && s.monthlyIncome >= s.monthlyExpense);
  if (s.meta.stage === 3) tryUp(s.monthlyIncome >= 30000);
  if (s.meta.stage === 4) tryUp(num(s.flags.lastPassiveIncome) >= s.monthlyExpense && num(s.flags.lastPassiveIncome) > 0);
}

// ---------- 11 步日流水线 ----------

export function advanceDay(s: StateSlice, rng: Rng): DayReport {
  const day = s.meta.day;
  const dayType = s.dayType;
  const repLogs: LogEntry[] = [];
  const events: PendingEvent[] = [];
  const news: string[] = [];
  const track = (msg: string, cls: LogEntry['cls'] = 'sys'): void => {
    repLogs.push(pushLog(s, msg, cls));
  };

  if (s.meta.over) return { day, logs: repLogs, events, news, endingKey: s.meta.endingKey };

  // 步1 未用 AP 结算：浪费无惩罚（「每日一主任务」的当日加成自然丢失）

  // 步2 日型生效 + 隐性疲劳累积
  if (dayType === 'extended') s.stats.daysWorkedOut += 1;
  if (dayType === 'minimum') s.stats.minDays += 1;
  tickHiddenFatigue(s, dayType, num(s.flags.actsToday));
  if (dayType === 'minimum' && num(s.flags.actsSelf) > 0) {
    s.flags.minDayStreak = num(s.flags.minDayStreak) + 1;
    if (s.flags.interrupted === true && num(s.flags.minDayStreak) >= 3) {
      s.flags.interrupted = false;
      s.flags.wobbleDays = 0;
      s.flags.minDayStreak = 0;
      track('连续三次最低日完成：中断解除，回到稳定化。系统没断。', 'good');
    }
  } else if (dayType !== 'minimum') {
    s.flags.minDayStreak = 0;
  }
  tickPatchesDay(s); // OS 补丁每日执行记账（streak/内化）
  if (s.flags.hardPressedToday === true) s.hardStreakDays += 1;
  else s.hardStreakDays = 0;

  // 步3 子项漂移 + 木桶检查 → 健康合成
  const barrel = driftDay(s, dayType);
  if (barrel.length > 0) track(`木桶预警：${barrel.join('、')}子项低于 20，额外-5。身体在记账。`, 'bad');
  if (s.osRules.some(r => r.id === 'whiteList' && r.internalized)) s.stress = clampv(s.stress - 1);

  // 步4 过劳/猝死/恢复判定
  const warn = fatigueWarning(s);
  if (warn) {
    news.push(warn.text);
    if (warn.level === 2 && s.flags.heartAttackWarn !== true) {
      const ev = enqueueEvent(s, 'heart-attack', 'forced', { cooldownDays: 5 });
      if (ev) events.push(ev);
    }
  }
  s.suddenDeathRisk = suddenDeathRisk(s);
  let deathCheck: DayReport['deathCheck'];
  if (!s.meta.over && rollSuddenDeath(s, rng)) {
    s.flags.diedSudden = true;
    const def = findEnding('suddenDeath');
    if (def) applyEnding(s, def);
    const last = s.log[s.log.length - 1];
    if (last) repLogs.push(last);
    deathCheck = { died: true, cause: 'suddenDeath' };
    track('……这一行之后，没有下一行了。', 'bad');
  }
  const rs = recoveryState(s);
  if (rs === 'wobble') {
    s.flags.wobbleDays = num(s.flags.wobbleDays) + 1;
    if (num(s.flags.wobbleDays) >= 2 && s.flags.interrupted !== true) {
      s.flags.interrupted = true;
      s.flags.interruptDaysLeft = rng.int(3, 5);
      s.flags.forcedMinDays = 3;
      grantKp(s, 'recovery'); // [S8] 恢复三线首次进入中断 → 词条投递
      track('波动→中断：身心报警，项目停摆几日。不羞辱失败，但代价是真的。', 'bad');
      const ev = enqueueEvent(s, 'recovery-interrupt', 'forced', { cooldownDays: 10 });
      if (ev) events.push(ev);
    }
  } else if (s.flags.interrupted !== true) {
    s.flags.wobbleDays = 0;
  }
  if (s.flags.interrupted === true) {
    s.flags.interruptDaysLeft = num(s.flags.interruptDaysLeft) - 1;
    if (num(s.flags.interruptDaysLeft) <= 0) track('停摆期结束：低耗运转，等身体回来。', 'sys');
  }

  // 步5-10（终局后世界停摆，直接进收尾）
  if (!s.meta.over) {
    rollPlatformDay(s, rng); // 步5 平台自然流量（S3 桩）
    tickAgentsDay(s, rng); // 步6 智能体自动执行（S3 桩）
    tickProjectsDay(s, rng); // 步7 项目每日产出（被动收入按日折算）
    const evts = rollEvents(s, rng); // 步8 事件抽样（S3 桩，返回 []）
    events.push(...evts);
    s.stats.eventsSeen += evts.length;
    // 步9 生活成本/订阅日扣（月度性支出月结时扣）
    const daily = (s.monthlyExpense + monthlySubs(s)) / 30;
    s.cash -= daily;
    s.flags.monthExpenseAcc = num(s.flags.monthExpenseAcc) + daily;
    if (s.cash < 0) {
      s.flags.cashNegDays = num(s.flags.cashNegDays) + 1;
      grantKp(s, 'cashflow'); // [S8] 现金转负 → 现金流词条（幂等）
    } else s.flags.cashNegDays = 0;
    // 步10 S1/S2 状态机迁移（滞回）
    if (s.decisionMode !== 'system2') s.stats.s1Days += 1;
    updateDecisionMode(s);
  }

  // ---- 周结算（day%7==0）：三段复盘 + 主焦点 ----
  if (day % 7 === 0) {
    const review = weeklyReview(s);
    track(`【本周事实】${review.facts.join('；')}`);
    track(`【假设】${review.hypotheses.join('；')}`);
    track(`【建议】${review.suggestion}`, 'gold');
    const ev = enqueueEvent(s, 'weekly-focus', 'forced', { cooldownDays: 1 });
    if (ev) events.push(ev);
    s.flags.weekActs = 0;
    s.flags.weekDeliveries = 0;
    s.flags.weekCashDelta = 0;
    s.flags.weekHardPress = 0;
    checkStageUp(s, track);
  }

  // ---- 月结算（day%30==0）：项目月结 + 损益/税/Token + 周期迁移 ----
  if (day % 30 === 0 && !s.meta.over) {
    const pr = settleProjectsMonth(s, rng);
    s.tokenBill.lastMonth = monthlyTokenBill(s, rng); // S3 桩读 0
    const mr = settleMonth(s, rng, { projectIncome: pr.income, projectUpkeep: pr.upkeep, passiveIncome: pr.passiveIncome, moonThree: pr.moonThree });
    const inc = mr.incomeProject + mr.incomeService + mr.incomeInvest;
    const exp = mr.expenseLiving + mr.expenseSubs + mr.expenseUpkeep + mr.expenseToken + mr.expenseProject;
    track(`【月结】收入 ¥${Math.round(inc)}｜支出 ¥${Math.round(exp)}｜税 ¥${mr.tax}｜利润 ¥${mr.profit}｜跑道 ${s.runway} 个月`, mr.profit >= 0 ? 'good' : 'bad');
    if (s.runway < 3) grantKp(s, 'runway'); // [S8] 跑道警报 → 跑道词条（幂等）
    if (mr.phaseAfter !== mr.phaseBefore) {
      track(`经济周期：${PHASE_NAMES[mr.phaseBefore]} → ${PHASE_NAMES[mr.phaseAfter]}。`, 'sys');
    }
    for (const name of mr.moonThree) {
      track(`月三魔咒：「${name}」三个月了 MRR 仍不足 ¥1000。能跨过这道坎的项目只有 12.3%。`, 'bad');
      const ev = enqueueEvent(s, 'moon-three', 'forced', { cooldownDays: 30 });
      if (ev) events.push(ev);
    }
    checkStageUp(s, track);
  }

  // ---- 年结算（day%360==0）：年度盘点 + stats 归档 ----
  if (day % 360 === 0 && !s.meta.over) {
    track(`【年度盘点】第 ${s.meta.year} 年：累计收入 ¥${Math.round(s.stats.totalRevenue)}｜累计支出 ¥${Math.round(s.stats.totalExpense)}｜完成项目 ${s.stats.projectsDone}｜过劳计数 ${s.burnoutCount}/3。`, 'gold');
    s.meta.year += 1;
  }

  // 步11 收尾：被动结局轮询 + 统计归档 + 清日 flag + 进入明晨（存档由 UI 层做）
  if (!s.meta.over) {
    const e = checkPassiveEndings(s);
    if (e) {
      applyEnding(s, e);
      const last = s.log[s.log.length - 1];
      if (last) repLogs.push(last);
    }
  }
  s.stats.maxCash = Math.max(s.stats.maxCash, Math.round(s.cash));
  if (s.monthlyExpense > 0) {
    s.stats.maxRunway = Math.max(s.stats.maxRunway, Math.round((Math.max(0, s.cash) / s.monthlyExpense) * 10) / 10);
  }
  if ([s.health.sleep.v, s.health.mood.v, s.health.diet.v, s.health.exercise.v].some(v => v < 20)) {
    s.stats.healthBadDays += 1;
  }
  // 清当日行为记账
  s.flags.actsToday = 0;
  s.flags.actsSelf = 0;
  s.flags.deepRestedToday = false;
  s.flags.hardPressedToday = false;
  s.flags.learnedToday = false;
  s.flags.deliveredToday = false;

  // 明晨：日推进 + AP/精力回复
  // [S9] 恢复速率 35/20 → 45/30：sim 实测混合局（3AP 标准 日耗 50-70 精力）晚夜精力恒 21-28，
  // 恒定踩中 wobble（<30）→ 每 ~5 天一次「波动→中断」→ recovery-interrupt 高风险支 → burnout 47-59%
  // （目标 5-8%），中断停摆还把项目收入压到 ×0.3。恢复侧上调后，wobble 回归「真越界才触发」的设计意图。
  s.meta.day = day + 1;
  s.meta.week = Math.floor((s.meta.day - 1) / 7) + 1;
  s.meta.month = Math.floor((s.meta.day - 1) / 30) + 1;
  if (num(s.flags.forcedMinDays) > 0) {
    s.flags.forcedMinDays = num(s.flags.forcedMinDays) - 1;
    s.dayType = 'minimum';
  } else {
    s.dayType = 'standard';
  }
  s.ap = apMaxFor(s.dayType, s);
  s.energy = clampv(s.energy + (s.dayType === 'minimum' ? 30 : 45));

  // 晚间小结（每日必有日志行，UI 弹窗队列的结算提示层）
  track(`第 ${day} 天结束：现金 ¥${Math.round(s.cash)}｜精力 ${Math.round(s.energy)}｜健康 ${Math.round(composeHealth(s.health))}${s.decisionMode !== 'system2' ? '｜⚠ System1' : ''}`);

  // [S4] 成就检查：新解锁写入日志（gold；flags 记账在 checkAchievements 内）
  const newAch = checkAchievements(s);
  for (const a of newAch) track(`【成就解锁】${a.name}：${a.desc}`, 'gold');

  clampAll(s);
  return { day, logs: repLogs, events, news, deathCheck, endingKey: s.meta.endingKey };
}
