// 核心对外 API（技术文档 §三）：dispatch 全路由 + advanceDay 流水线 + 存档
// ui 只 dispatch，core 是唯一写者；serialize 纯逻辑复用 save/save.ts（localStorage 只在其槽位函数内）
import { findLocation } from '../data/locations.def';
import { RELOCATE_MULT } from '../data/economy.def';
import type {
  Action, ActionResult, DayReport, SaveGame, SetupConfig, StateSlice
} from './types';
import { createRng, type Rng } from './rng';
import { clampAll, createInitialSlice, pushLog } from './state';
import { serialize } from '../save/save';
import { executeAction } from './actions';
import { applyInvest, num, recalcLiving } from './economy';
import { apMaxFor } from './health';
import { installPatch } from './os';
import { createProject, pivotProject, retireProject } from './projects';
import { fireAgent, hireAgent } from './agents';
import { ensureAccount } from './platforms';
import { advanceDay as advanceDayImpl, BOTTLENECK_LABELS } from './time';

export interface Game {
  state: Readonly<StateSlice>;
  dispatch(a: Action): ActionResult;
  advanceDay(): DayReport;
  serialize(): SaveGame;
}

function route(s: StateSlice, a: Action, rng: Rng): ActionResult {
  if (s.meta.over) return { ok: false, msg: '生涯已结束' };
  switch (a.t) {
    case 'act':
      return executeAction(s, a, rng);
    case 'invest':
      return applyInvest(s, a);
    case 'patch':
      return installPatch(s, a.id);
    case 'relocate': {
      if (a.to === s.location) return { ok: false, msg: '已在此地' };
      if (!findLocation(a.to)) return { ok: false, msg: `未知地点：${a.to}` };
      const cost = Math.round(s.monthlyExpense * RELOCATE_MULT); // 迁居费 = 月生活费 × 2
      if (s.cash < cost) return { ok: false, msg: `迁居费不足（需 ¥${cost} = 月生活费×2）` };
      s.cash -= cost;
      s.location = a.to;
      recalcLiving(s);
      s.health.mood.v = Math.min(100, s.health.mood.v + 5);
      pushLog(s, `迁居完成（¥${cost}）：新城市，新的成本与节奏。`, 'good');
      return { ok: true, msg: `迁居完成（¥${cost}）`, floatTexts: [{ text: '迁居', cls: 'good' }] };
    }
    case 'hireAgent':
      return hireAgent(s, a.id, rng);
    case 'fireAgent':
      return fireAgent(s, a.id, rng);
    case 'focus': {
      if (!(a.id in BOTTLENECK_LABELS)) {
        return { ok: false, msg: '焦点须为：健康/现金流/获客/交付/技能/合规' };
      }
      s.focus = a.id;
      s.flags.weekFocus = 1;
      return { ok: true, msg: `本周主焦点：${BOTTLENECK_LABELS[a.id as keyof typeof BOTTLENECK_LABELS]}（该类行动+15%，其余-10%）` };
    }
    case 'dayType': {
      if (num(s.flags.forcedMinDays) > 0 && a.dt !== 'minimum') {
        return { ok: false, msg: '身体强制最低日：今天只能最低日' };
      }
      s.dayType = a.dt;
      s.ap = Math.max(s.ap, apMaxFor(a.dt, s)); // 升档补齐 AP，降档不收回
      return { ok: true, msg: `日型：${a.dt === 'minimum' ? '最低日' : a.dt === 'extended' ? '扩展日' : '标准日'}` };
    }
    case 'newProject':
      return createProject(s, a.name, a.type, a.revenueModel, rng);
    case 'pivotProject':
      return pivotProject(s, a.projectId, a.toType, rng);
    case 'retireProject':
      return retireProject(s, a.projectId);
    case 'declareAI': {
      const acc = ensureAccount(s, a.platform);
      acc.aiDeclared = true;
      acc.banRisk = Math.max(0, acc.banRisk - 10);
      return { ok: true, msg: `已声明 AI 内容（${a.platform}）：AI 检测限流风险下降` };
    }
    case 'setCrypto':
      s.flags.cryptoOn = a.on;
      return { ok: true, msg: `加密资产：${a.on ? '开启' : '关闭'}` };
  }
}

function makeGame(state: StateSlice, rng: Rng): Game {
  return {
    state,
    dispatch(a: Action): ActionResult {
      const r = route(state, a, rng);
      clampAll(state);
      // [S8] 引擎 RNG 状态回写切片：serialize→load 后 createRng(seedState.s) 才能无缝续跑
      //（修 S1 遗留：seedState 停在开局态，读档会把随机流倒带回第 1 天）
      state.meta.seedState = rng.getState();
      return r;
    },
    advanceDay(): DayReport {
      const rep = advanceDayImpl(state, rng);
      clampAll(state);
      state.meta.seedState = rng.getState(); // [S8] 同上
      return rep;
    },
    serialize(): SaveGame {
      return serialize(state);
    }
  };
}

export function createGame(setup: SetupConfig, rng?: Rng): Game {
  const state = createInitialSlice(setup);
  return makeGame(state, rng ?? createRng(setup.seed));
}

/** 旧版存档兜底：补齐 [S2+] 增量字段（rep/difficulty） */
function withDefaults(s: StateSlice): StateSlice {
  if (typeof s.rep !== 'number') s.rep = 0;
  if (!s.meta.difficulty) s.meta.difficulty = 'normal';
  if (!s.flags) s.flags = {};
  if (!s.stats.endingsSeen) s.stats.endingsSeen = [];
  if (typeof s.stats.leads !== 'number') s.stats.leads = 0;
  // [v0.10/W3] tokenBill：lastMonth → { yesterday, monthToDate }（旧值并入本月累计）
  const tb = s.tokenBill as StateSlice['tokenBill'] & { lastMonth?: number };
  if (tb && typeof tb.lastMonth === 'number') {
    const legacy = tb.lastMonth;
    delete tb.lastMonth;
    tb.yesterday = tb.yesterday ?? 0;
    tb.monthToDate = (tb.monthToDate ?? 0) + legacy;
  }
  // [v0.10/W2] 投资成本与盈亏记账、日流水结构（clampAll 内再兜底一次）
  if (!s.portfolioCost) s.portfolioCost = { ...s.portfolio };
  if (!s.investGains) s.investGains = { realizedTotal: 0, realizedMonth: 0, floatToday: 0, floatMonth: 0 };
  if (!s.dailyFlow) s.dailyFlow = { projIn: 0, passiveIn: 0, serviceIn: 0, livingOut: 0, subsOut: 0, tokenOut: 0, otherOut: 0 };
  return s;
}

export function loadGame(sv: SaveGame, rng?: Rng): Game {
  const parsed = withDefaults(JSON.parse(sv.game) as StateSlice);
  return makeGame(parsed, rng ?? createRng(parsed.meta.seedState.s));
}

export { createInitialSlice, clampAll, assertInvariants, pushLog, grantKp } from './state';
export { createRng, Rng } from './rng';
export type { Rng as RNG } from './rng';
export { advanceDay } from './time';
export {
  applyEffects, checkSkillUp, executeAction } from './actions';
export {
  composeHealth, driftDay, fatigueWarning, healthMult, recoveryState,
  rollSuddenDeath, suddenDeathP, suddenDeathRisk, tickHiddenFatigue, updateDecisionMode
} from './health';
export { createProject, pivotProject, retireProject, settleProjectsDay, settleProjectsMonth, tickProjectsDay } from './projects';
export { installPatch, patchMult, tickPatchesDay } from './os';
export { dailyNet, livingCost, phaseMult, recalcLiving, rollPhase, settleMonth, taxDue, tickPortfolioDay } from './economy';
export { buildReport, checkPassiveEndings } from './endings';
export { weeklyReview, BOTTLENECK_LABELS } from './time';
export {
  enqueueEvent, evalCond, filterChoicesForUI, resolveChoice, resolveEvent,
  rollEvents, tickChains, validateChains, validateWhenReachable
} from './events';
export {
  banChance, distributeContent, ensureAccount, platformDependency,
  publishContent, rollPlatformDay, tickPlatformsDay
} from './platforms';
export {
  autoLevelScore, fireAgent, flowCoverage, hireAgent, monthlyTokenBill,
  tickAgentsDay, unitEconomics
} from './agents';
export type {
  Action, ActionResult, ChainSeed, ChoiceDef, Cond, Contact, DayReport,
  DecisionMode, DifficultyDef, Effect, EffectKey, EventCat, EventDef,
  NicheDef, OSRuleDef, OSRuleState, PendingEvent, PersonalityDef, PlatformAccount,
  Project, ProjectType, RngState, SaveGame, SetupConfig, StateSlice, SubBar,
  TalentDef, ActionDef, AgentDef, AgentInstance, AssetItem, BackgroundDef,
  HealthState, LifeStats, LocationDef, LocationId, LogEntry, RevenueModelId,
  EndingDef, EndingDef as Ending, LifeReport, MonthReport, WeeklyReviewResult,
  BottleneckKey, BottleneckScore, RecoveryPhase, FatigueWarning,
  PlatformDef, UnitEconomicsPanel, ChoiceResult
} from './types';
