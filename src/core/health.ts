// 健康子系统：健康合成 / 漂移与木桶 / 隐性疲劳 / 决策模式滞回 / 猝死掷骰 / 双强预警 / 恢复状态机
// 规格来源：技术文档 §5.1-§5.3、§7（过劳·猝死·恢复三线）
import { grantKp } from './state';
import { findLocation } from '../data/locations.def';
import type { Rng } from './rng';
import type { DayType, FatigueWarning, HealthState, RecoveryPhase, StateSlice } from './types';

const clamp100 = (n: number): number => Math.max(0, Math.min(100, n));

export const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

// ---------- 健康合成（§5.1） ----------

/** health = sleep×0.40 + mood×0.25 + diet×0.20 + exercise×0.15 */
export function composeHealth(h: HealthState): number {
  return h.sleep.v * 0.4 + h.mood.v * 0.25 + h.diet.v * 0.2 + h.exercise.v * 0.15;
}

/** 效率乘子：sleep<20 → 0.5；否则 1-(100-health)²/25000 */
export function healthMult(s: StateSlice): number {
  if (s.health.sleep.v < 20) return 0.5;
  const h = composeHealth(s.health);
  return 1 - ((100 - h) * (100 - h)) / 25000;
}

// ---------- 日型与 AP ----------

const AP_BASE: Record<DayType, number> = { minimum: 1, standard: 3, extended: 4 };

/** 当日 AP 上限（工作狂：非最低日 +1，上限由 clampAll 收口） */
export function apMaxFor(dayType: DayType, s?: StateSlice): number {
  let m = AP_BASE[dayType];
  if (s?.flags.workaholic === true && dayType !== 'minimum') m += 1;
  return m;
}

// ---------- 每日漂移 + 木桶规则（§5.1） ----------

/**
 * 子项自然漂移：sleep -8（固定起床补丁内化则减半）/ mood -3+压力溢出/10 / diet -5 / exercise -6。
 * 最低日完成恢复行动 → 全子项 +3；旅行 buff → mood +2。
 * 木桶规则：任一子项 <20 时该子项再 -5，返回预警子项名单。
 */
export function driftDay(s: StateSlice, dayType: DayType): string[] {
  const h = s.health;
  const fixedWake = s.osRules.some(r => r.id === 'fixedWake' && r.internalized);
  h.sleep.v += fixedWake ? h.sleep.drift / 2 : h.sleep.drift;
  const overflow = Math.max(0, s.stress - 60) / 10;
  h.mood.v += h.mood.drift - overflow;
  // [S8] 修 S1 遗留缝：LocationDef.stress（每日压力修正 -10~+10，locations.def/技术文档 §6 有数据
  // 有文档）从未被引擎消费——一线城市压人、大理治愈的地理手感一直没生效。此处接线。
  s.stress = clamp100(s.stress + (findLocation(s.location)?.stress ?? 0));
  if (num(s.flags.travelBuffUntil) >= s.meta.day && num(s.flags.travelBuffUntil) > 0) h.mood.v += 2;
  h.diet.v += h.diet.drift;
  h.exercise.v += h.exercise.drift;
  if (dayType === 'minimum' && num(s.flags.actsSelf) > 0) {
    h.sleep.v += 3;
    h.mood.v += 3;
    h.diet.v += 3;
    h.exercise.v += 3;
  }
  // 低情绪连续记账（恢复状态机 wobble 判据）
  if (h.mood.v < 40) s.flags.lowMoodDays = num(s.flags.lowMoodDays) + 1;
  else s.flags.lowMoodDays = 0;
  // 木桶
  const names = { sleep: '睡眠', mood: '情绪', diet: '饮食', exercise: '运动' } as const;
  const barrel: string[] = [];
  for (const k of ['sleep', 'mood', 'diet', 'exercise'] as const) {
    if (h[k].v < 20) {
      h[k].v -= 5;
      barrel.push(names[k]);
    }
  }
  for (const k of ['sleep', 'mood', 'diet', 'exercise'] as const) h[k].v = clamp100(h[k].v);
  return barrel;
}

// ---------- 隐性疲劳（§5.3） ----------

/**
 * 扩展日 +8（工作狂减半）/ AP 耗尽仍行动 +6/次 / 睡眠<20 过夜 +10 / 最低日或深度休息 -15。
 * 工作狂正向积累 ×1.25（隐性疲劳积累更快）。钳 0-100。
 */
export function tickHiddenFatigue(s: StateSlice, dayType: DayType, actionsTaken: number): void {
  let d = 0;
  let ext = 0;
  if (dayType === 'extended') ext = s.flags.workaholic === true ? 4 : 8; // 工作狂扩展日惩罚减半（不参与下方 ×1.25）
  const cap = apMaxFor(dayType, s);
  if (actionsTaken > cap) d += 6 * (actionsTaken - cap);
  if (s.health.sleep.v < 20) d += 10;
  if (dayType === 'minimum' || s.flags.deepRestedToday === true) d -= 15;
  if (d > 0 && s.flags.workaholic === true) d = Math.round(d * 1.25); // 工作狂其余路径积累更快
  s.health.hiddenFatigue = clamp100(s.health.hiddenFatigue + d + ext);
}

// ---------- 决策模式滞回（§5.2） ----------

/**
 * 进入 S1：energy≤40 或 stress≥60；stress≥85 → system1Deep。
 * 退出：energy≥55 且 stress<45 且距上次模式切换 ≥1 天（滞回防抖，切换日记入 flags.modeChangeDay）。
 */
export function updateDecisionMode(s: StateSlice): void {
  const prev = s.decisionMode;
  const lastChange = num(s.flags.modeChangeDay);
  const gapOk = s.meta.day - lastChange >= 1;
  const deep = s.stress >= 85;
  const enter = s.energy <= 40 || s.stress >= 60;
  let next = prev;
  if (prev === 'system2') {
    if (deep) next = 'system1Deep';
    else if (enter) next = 'system1';
  } else {
    if (deep) next = 'system1Deep';
    else if (prev === 'system1Deep') next = 'system1'; // 压力回落：先降级回 S1
    else if (s.energy >= 55 && s.stress < 45 && gapOk) next = 'system2';
  }
  if (next !== prev) s.flags.modeChangeDay = s.meta.day;
  if (prev === 'system2' && next !== 'system2') grantKp(s, 'system1'); // [S8] 首次跌落 System1 → 词条投递
  s.flags.prevMode = prev === 'system2' ? 0 : prev === 'system1' ? 1 : 2;
  s.decisionMode = next;
  s.flags.s1DeepDays = next === 'system1Deep' ? num(s.flags.s1DeepDays) + 1 : 0;
}

// ---------- 猝死（§7.2） ----------

/** P = min(0.12, 0.03 + 0.02×(hf-85)/5 + 0.03×hardStreakDays) */
export function suddenDeathP(hiddenFatigue: number, hardStreakDays: number): number {
  return Math.min(0.12, 0.03 + (0.02 * (hiddenFatigue - 85)) / 5 + 0.03 * hardStreakDays);
}

/** 掷骰前置（全部满足才掷）：hf≥85 且 sleep<15 且心悸事件选了硬撑 且 burnoutCount≥1 */
export function canRollSuddenDeath(s: StateSlice): boolean {
  return (
    s.health.hiddenFatigue >= 85 &&
    s.health.sleep.v < 15 &&
    s.flags.heartAttackWarn === true &&
    s.burnoutCount >= 1
  );
}

/** 当前猝死概率（永远可算，前置不满足 = 0；概率对玩家公开显示 §7.3） */
export function suddenDeathRisk(s: StateSlice): number {
  if (!canRollSuddenDeath(s)) return 0;
  return suddenDeathP(s.health.hiddenFatigue, s.hardStreakDays);
}

export function rollSuddenDeath(s: StateSlice, rng: Rng): boolean {
  if (!canRollSuddenDeath(s)) return false;
  return rng.chance(suddenDeathRisk(s));
}

// ---------- 双强预警（§7.3） ----------

/** hiddenFatigue≥70 → level1；≥85 或已见心悸事件 → level2（顶栏黑底红字） */
export function fatigueWarning(s: StateSlice): FatigueWarning | null {
  const hf = s.health.hiddenFatigue;
  if (hf < 70 && s.flags.heartAttackWarn !== true) return null;
  const read = s.flags.fatigueKnown === true
    ? `${Math.round(hf)}/100`
    : hf >= 90 ? '90+' : `${Math.floor(hf / 10) * 10}-${Math.floor(hf / 10) * 10 + 9}`;
  if (hf >= 85 || s.flags.heartAttackWarn === true) {
    return { level: 2, text: `隐性疲劳 ${read} —— 心悸风险极高，今日请勿硬撑` };
  }
  return { level: 1, text: `隐性疲劳 ${read} —— 身体在记账，该还了` };
}

// ---------- 恢复状态机（§7.1 波动/中断线） ----------

/**
 * [S9] wobble 能量阈值 30 → 12：现行动表（10-15 精力 × 3AP）下正常满负荷日夜间谷值 10-25，
 * 阈值 30 把「认真干了一天」恒判为波动 → 每 ~8 天一次中断 → recovery-interrupt 高风险支
 * （deny +1 过劳）→ 实测过劳倒下 34%（目标 5-8%）。12 让 wobble 回归「真·力竭」的例外语义。
 * energy<12 或连续 2 日 mood<40 → 'wobble'；flags.interrupted → 'interrupted'
 */
export function recoveryState(s: StateSlice): RecoveryPhase {
  if (s.flags.interrupted === true) return 'interrupted';
  // [S9] wobble 能量阈值 30 → 12：现行动表（10-15 精力 × 3AP）下正常满负荷日夜间谷值 10-25，
  // 阈值 30 把「认真干了一天」恒判为波动 → 每 ~8 天一次中断 → recovery-interrupt 高风险支
  // （deny +1 过劳）→ 实测过劳倒下 34%（目标 5-8%）。12 让 wobble 回归「真·力竭」的例外语义。
  if (s.energy < 12 || num(s.flags.lowMoodDays) >= 2) return 'wobble';
  return 'run';
}
