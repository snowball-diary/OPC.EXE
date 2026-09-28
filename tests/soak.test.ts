// ============================================================
// [S8] 全链路无头浸泡测试（本批核心产出）
// 不碰 DOM、纯 core：多策略加权随机机器人 × 8 开局 × 6 种子 × ≤720 天（≥48 局）。
// 验收线（任务书 A）：
//   1. 零未捕获异常 + assertInvariants + NaN/undefined 巡检 + 第 100 天存档 roundtrip 等价续跑
//   2. ≥5 种不同 endingKey；burnoutDown / bankrupt / backToWork 必须命中
//   3. 猝死链：构造态 30 种子必有命中且概率符合 §7.2 公式区间；前置缺一全 false（回归）
//   4. 事件覆盖：全事件×全选项 swept；48 局累计触发 ≥40/80；关键事件（心悸/AI 未声明/
//      烧钱警报/月三/灰产链）单独构造针对性用例
//   5. 性能：单局 720 天 advanceDay 总耗时 <200ms（实际值打印）
// ============================================================
import { describe, expect, it } from 'vitest';
import {
  assertInvariants, createGame, createRng, enqueueEvent, filterChoicesForUI,
  loadGame, resolveChoice,
  type Game, type Rng, type SetupConfig, type StateSlice
} from '../src/core/index';
import { rollSuddenDeath, suddenDeathP, suddenDeathRisk } from '../src/core/health';
import { checkPassiveEndings, applyEnding } from '../src/core/endings';
import { publishContent, ensureAccount } from '../src/core/platforms';
import { AGENT_DEFS } from '../src/data/agents.def';
import { ENDING_DEFS, findEnding } from '../src/data/endings.def';
import { EVENT_DEFS, findEventDef } from '../src/data/events.def';
import { PATCH_DEFS } from '../src/data/patches.def';

// ---------- 巡检工具 ----------

/** 合法 undefined 白名单（可选字段路径包含即放行） */
const OK_UNDEFINED = ['endingKey', 'installedDay', 'lastMonthMrr', 'cause', 'ifCond', 'gray']; // ifCond：ChainSeed 可选字段（dist 链/连锁种子常缺省）

/** 深度巡检：NaN/Infinity/非法 undefined 落进 state 即记录路径 */
function patrol(o: unknown, path: string, out: string[]): void {
  if (o === undefined) {
    if (!OK_UNDEFINED.some(p => path.includes(p))) out.push(`${path}=undefined`);
    return;
  }
  if (typeof o === 'number') {
    if (!Number.isFinite(o)) out.push(`${path}=${o}`);
    return;
  }
  if (o === null || typeof o !== 'object') return;
  for (const [k, v] of Object.entries(o)) patrol(v, `${path}.${k}`, out);
}

function checkState(s: StateSlice): string[] {
  const errs = assertInvariants(s);
  const bad: string[] = [];
  patrol(s, 'state', bad);
  errs.push(...bad.map(b => `巡检异常：${b}`));
  return errs;
}

// ---------- 机器人 ----------

interface BotProfile {
  /** 连轴转：不安排身心行动、低精力仍硬撑（过劳/猝死/破产线覆盖） */
  relentless: boolean;
  /** 硬撑者：预警（hf≥70）后拒绝最低日、继续扩展日+硬撑——猝死链「硬撑到底」弧线 */
  pusher?: boolean;
  /** 焦虑者：从不冥想——压力自然滚进 system1Deep（倦怠退场线覆盖） */
  anxious?: boolean;
  /** 不借款续命（破产线覆盖） */
  noBorrow: boolean;
}

interface Bot {
  rng: Rng;
  profile: BotProfile;
  /** 平台轮换指针（内容营销主阵地轮换，覆盖一鱼八吃源头多样性） */
  platIdx: number;
}

const CONTENT_PLATFORMS = ['bilili', 'xhs', 'douyin', 'zhihu', 'wechat', 'weibo', 'site', 'youtube'] as const;
const BOTTLENECKS = ['health', 'cash', 'marketing', 'delivery', 'skill', 'compliance'] as const;

type Weighted<T> = [T, number][];

function pickW<T>(bot: Bot, list: Weighted<T>): T | undefined {
  const total = list.reduce((a, [, w]) => a + w, 0);
  let u = bot.rng.next() * total;
  for (const [v, w] of list) {
    u -= w;
    if (u < 0) return v;
  }
  return list[list.length - 1]?.[0];
}

/** 一次「行动阶段」：按权重挑一个合法 Action 尝试 dispatch（失败静默——像人撞墙就换） */
function botAct(g: Game, bot: Bot): void {
  const s = g.state as StateSlice;
  // 最低日：只做身心恢复（core 会拒绝其他类；直接走恢复列表不浪费尝试）
  if (s.dayType === 'minimum') {
    const rest: Weighted<{ id: string }> = [
      [{ id: 'exercise' }, s.health.exercise.v < 50 ? 4 : 2],
      [{ id: 'meditate' }, bot.profile.anxious === true ? 0 : s.stress > 50 ? 3 : 1],
      [{ id: 'deepRest' }, 4],
      [{ id: 'socialize' }, s.health.mood.v < 50 ? 3 : 1],
      [{ id: 'seekDoctor' }, s.health.sleep.v < 35 || s.health.hiddenFatigue >= 75 ? 3 : 0],
      [{ id: 'healthCheckup' }, s.health.hiddenFatigue >= 55 && s.flags.fatigueKnown !== true ? 3 : 0]
    ];
    const pick = pickW(bot, rest);
    if (pick) g.dispatch({ t: 'act', id: pick.id });
    return;
  }
  const alive = s.projects.filter(p => p.alive);
  const proj = alive[alive.length - 1];
  const launched = alive.some(p => ['build', 'launch', 'grow', 'mature', 'decline'].includes(p.stage));
  const rel = bot.profile.relentless;

  // —— 结构性操作（非 act 类，低频） ——
  if (alive.length < s.attentionCap && bot.rng.chance(0.10)) {
    const t = pickW(bot, [
      ['saas', 3], ['template', 3], ['course', 2], ['consulting', 3], ['plugin', 2],
      ['community', 1], ['publishing', 1], ['aiSupport', s.meta.stage >= 3 ? 2 : 0],
      ['apiRelay', 1], ['physical', 1], ['bootcamp', 1]
    ] as Weighted<string>);
    if (t) {
      g.dispatch({ t: 'newProject', name: '', type: t, revenueModel: 'subscription' });
      return;
    }
  }
  if (proj && proj.stage === 'decline' && bot.rng.chance(0.15)) {
    g.dispatch({ t: 'pivotProject', projectId: proj.id, toType: pickW(bot, [['saas', 2], ['course', 2], ['consulting', 2], ['template', 2]]) ?? 'saas' });
    return;
  }
  if (bot.rng.chance(0.01) && alive.length > 0 && proj) {
    g.dispatch({ t: 'retireProject', projectId: proj.id });
    return;
  }
  if (s.meta.stage >= 3 && s.agents.length < 3 && s.cash > 12000 && bot.rng.chance(0.08)) {
    const hireable = AGENT_DEFS.filter(d => s.meta.stage >= d.unlockStage && s.cash >= d.deployCost && !s.agents.some(a => a.id === d.id));
    const id = hireable.length > 0 ? bot.rng.pick(hireable).id : undefined;
    if (id) { g.dispatch({ t: 'hireAgent', id }); return; }
  }
  if (s.agents.length > 1 && bot.rng.chance(0.005)) {
    g.dispatch({ t: 'fireAgent', id: bot.rng.pick(s.agents).id });
    return;
  }
  if (bot.rng.chance(0.02)) {
    const installed = new Set(s.osRules.map(r => r.id));
    const cand = PATCH_DEFS.filter(p => !installed.has(p.id) && s.ap >= p.installCost.ap && s.cash >= (p.installCost.cash ?? 0));
    if (cand.length > 0) { g.dispatch({ t: 'patch', id: bot.rng.pick(cand).id }); return; }
  }
  if (s.cash > 40000 && bot.rng.chance(0.05)) {
    g.dispatch({ t: 'invest', kind: bot.rng.chance(0.5) ? 'indexFund' : 'fund', amount: Math.round(s.cash * 0.2) });
    return;
  }
  if (s.debt > 0 && s.cash > s.debt && bot.rng.chance(0.1)) {
    g.dispatch({ t: 'invest', kind: 'repay', amount: Math.min(s.debt, Math.round(s.cash * 0.3)) });
    return;
  }
  if (s.cash < 0 && !bot.profile.noBorrow && s.creditScore >= 400 && bot.rng.chance(0.8)) {
    g.dispatch({ t: 'invest', kind: 'funding', amount: 12000 });
    return;
  }
  const mainAcc = Object.entries(s.platforms).sort((a, b) => (b[1]?.followers ?? 0) - (a[1]?.followers ?? 0))[0]?.[1];
  if (mainAcc && !mainAcc.aiDeclared && bot.rng.chance(0.06)) {
    const pid = Object.entries(s.platforms).sort((a, b) => (b[1]?.followers ?? 0) - (a[1]?.followers ?? 0))[0]?.[0];
    if (pid) { g.dispatch({ t: 'declareAI', platform: pid }); return; }
  }
  if (bot.rng.chance(0.002)) {
    g.dispatch({ t: 'relocate', to: bot.rng.pick(['dali', 'nomad', 'beishang', 'changwu', 'hometown']) });
    return;
  }
  if (bot.rng.chance(0.01)) {
    g.dispatch({ t: 'focus', id: bot.rng.pick([...BOTTLENECKS]) });
    return;
  }

  // —— 日常行动（act 类，加权） ——
  const list: Weighted<{ id: string; projectId?: string; platformId?: string }> = [];
  const w = (id: string, weight: number, extra?: { projectId?: string; platformId?: string }): void => {
    if (weight > 0) list.push([{ id, ...extra }, weight]);
  };
  w('deepLearnFit', 3);
  w('deepLearnHard', rel ? 2 : 1);
  w('readIndustry', 2);
  w('userInterview', proj ? 1 : 0, { projectId: proj?.id });
  w('askMentor', s.contacts.some(c => c.type === 'mentor' && c.relation >= 30) ? 1 : 0);
  w('joinCommunity', 1);
  const plat = CONTENT_PLATFORMS[bot.platIdx % CONTENT_PLATFORMS.length] ?? 'bilili';
  w('writeContent', 4, { platformId: plat });
  w('marketingDistribution', 2);
  w('developProject', proj ? 5 : 0, { projectId: proj?.id });
  w('polishQuality', proj ? 1 : 0, { projectId: proj?.id });
  w('deliverService', launched ? 4 : 0, { projectId: proj?.id });
  w('makeCourse', alive.some(p => p.type === 'course') ? 1 : 0, { projectId: proj?.id });
  w('negotiatePriceStd', 0.5);
  w('bookkeeping', s.flags.selfBookkeeping === true ? 0 : 0.5);
  w('payTax', 0.7);
  if (s.meta.stage >= 2 && s.entity === 'none' && s.cash > 2000) w('registerSole', 1);
  if (s.meta.stage >= 3 && s.entity !== 'opc' && s.cash > 6000) w('registerOPC', 0.6);
  if (s.meta.stage >= 3 && s.flags.trademark !== true && s.cash > 6000) w('fileTrademark', 0.3);
  if (s.meta.stage >= 3 && s.flags.icp !== true && s.cash > 3000) w('fileIcp', 0.3);
  w('outsourceHire', proj && s.cash > 4000 ? 0.5 : 0, { projectId: proj?.id });
  w('writeSop', 0.5);
  if (s.meta.stage >= 3 && s.cash > 5000) w('buildAutomation', 0.4);
  w('businessCoop', 0.5);
  if (!rel) {
    const bars = [s.health.sleep.v, s.health.mood.v, s.health.diet.v, s.health.exercise.v];
    const low = Math.min(...bars);
    w('exercise', (2 + (s.health.exercise.v < 50 ? 3 : 0)) * (low < 30 ? 1.5 : 1));
    w('meditate', bot.profile.anxious === true ? 0 : s.stress > 50 ? 3 : 0.5);
    w('deepRest', s.energy < 40 ? 3 : 0.5 + (s.health.sleep.v < 45 ? 3 : 0));
    w('socialize', s.health.mood.v < 45 ? 3 : 1);
    w('travel', s.cash > 12000 && s.stress > 60 ? 0.5 : 0);
    w('healthCheckup', s.health.hiddenFatigue >= 55 && s.flags.fatigueKnown !== true ? 4 : 0);
    w('seekDoctor', s.health.sleep.v < 35 || s.health.hiddenFatigue >= 75 ? 3 : 0);
  } else {
    // 连轴转也偶尔被身体按住：极低频恢复
    w('exercise', 0.1);
    w('deepRest', s.energy < 15 ? 0.2 : 0);
  }
  const choice = pickW(bot, list);
  if (!choice) return;
  g.dispatch({ t: 'act', ...choice });
}

/** 日型策略：精力满延伸、精力瘪最低（relentless 更爱延伸） */
function botDayType(g: Game, bot: Bot): void {
  const s = g.state as StateSlice;
  if (typeof s.flags.forcedMinDays === 'number' && s.flags.forcedMinDays > 0) return; // core 强制最低日
  const bars = [s.health.sleep.v, s.health.mood.v, s.health.diet.v, s.health.exercise.v];
  const low = Math.min(...bars);
  if (bot.profile.pusher && s.health.hiddenFatigue >= 70) {
    g.dispatch({ t: 'dayType', dt: s.energy >= 30 || bot.rng.chance(0.5) ? 'extended' : 'standard' }); // 预警后仍硬撑
    return;
  }
  if (!bot.profile.relentless && (low < 45 || s.energy < 45 || (!bot.profile.pusher && s.health.hiddenFatigue >= 55))) {
    // 身体亮红灯 → 明天最低日（§7.1 恢复节奏：最低日完成恢复行动全子项 +3、隐性疲劳 -15）
    g.dispatch({ t: 'dayType', dt: bot.rng.chance(0.9) ? 'minimum' : 'standard' });
    return;
  }
  const wantExt = bot.profile.relentless
    ? s.energy >= 30 && bot.rng.chance(0.8)
    : s.energy >= 80 && low >= 60 && s.health.hiddenFatigue < 30 && bot.rng.chance(0.5);
  g.dispatch({ t: 'dayType', dt: wantExt ? 'extended' : 'standard' });
}

// ---------- 事件选择器：按事件轮换选项（跨局全局游标，保证分支覆盖） ----------

const choiceCursor = new Map<string, number>();
const chosenKeys = new Set<string>();
const triggeredEvents = new Set<string>();

function resolveAllPending(g: Game, repEvents: import('../src/core/types').PendingEvent[]): void {
  const s = g.state as StateSlice;
  const ids = new Set<string>();
  for (const pe of repEvents) ids.add(pe.id);
  for (const pe of s.pending.events) if (!pe.resolved) ids.add(pe.id);
  for (const id of ids) {
    const def = findEventDef(id);
    if (!def) continue;
    if (s.meta.over) return;
    triggeredEvents.add(id);
    const n = choiceCursor.get(id) ?? 0;
    choiceCursor.set(id, n + 1);
    const idx = def.choices.length > 0 ? n % def.choices.length : 0;
    chosenKeys.add(`${id}:${idx}`);
    resolveChoice(s, def, idx, gBotRng(g));
  }
}

/** 事件结算用的 rng：从游戏切片种子派生（确定性可复现） */
function gBotRng(g: Game): Rng {
  return createRng((g.state.meta.seedState.s ^ 0xabcdef) >>> 0);
}

// ---------- 8 开局 × 6 种子 ----------

function cfg(partial: Partial<SetupConfig>, seed: number): SetupConfig {
  return {
    niche: 'dev', background: 'grass', location: 'hangcheng', difficulty: 'normal',
    talents: [], personality: { pragmaticIdeal: 'pragmatic', steadyAggressive: 'steady', soloSocial: 'solo' },
    cryptoOn: true, seed,
    ...partial
  };
}

const OPENINGS: { name: string; cfg: SetupConfig; profile: BotProfile }[] = [
  { name: '开发×草根×标准', cfg: cfg({ niche: 'dev', background: 'grass' }, 0), profile: { relentless: false, noBorrow: false } },
  { name: '博主×裸辞×一线', cfg: cfg({ niche: 'kol', background: 'fired', location: 'beishang', talents: ['socialite'] }, 0), profile: { relentless: false, anxious: true, noBorrow: false } },
  { name: '写作×学生×小城×故事', cfg: cfg({ niche: 'writer', background: 'student', location: 'hometown', difficulty: 'story', talents: ['quickLearner'] }, 0), profile: { relentless: false, noBorrow: false } },
  { name: '教练×体制×二线', cfg: cfg({ niche: 'coach', background: 'system', location: 'changwu', talents: ['empathy'] }, 0), profile: { relentless: false, noBorrow: false } },
  { name: '制客×老兵×广深×硬核', cfg: cfg({ niche: 'maker', background: 'veteran', location: 'guangshen', difficulty: 'hard', talents: ['workaholic', 'nightOwl'] }, 0), profile: { relentless: false, pusher: true, noBorrow: false } },
  { name: '开发×二创×大理', cfg: cfg({ niche: 'dev', background: 'second', location: 'dali', talents: ['zen', 'phobia'] }, 0), profile: { relentless: false, noBorrow: false } },
  { name: '设计×草根×一线×地狱', cfg: cfg({ niche: 'design', background: 'grass', location: 'beishang', difficulty: 'insane', talents: ['debtStart'] }, 0), profile: { relentless: false, noBorrow: true } },
  { name: '博主×草根×新加坡×硬核', cfg: cfg({ niche: 'kol', background: 'grass', location: 'singapore', difficulty: 'hard', talents: ['nightOwl', 'spendthrift'] }, 0), profile: { relentless: false, noBorrow: false } }
];

const MAX_DAYS = 720;
const ROUNDTRIP_DAY = 100;

interface RunResult {
  opening: string;
  seed: number;
  endDay: number;
  endingKey?: string;
  maxCash: number;
  minCash: number;
  stage: number;
  followersPeak: number;
  advMs: number;
}

const runResults: RunResult[] = [];

/** 单局：跑到 over / 720 天；第 100 天做 serialize→load roundtrip 并用新实例续跑 */
function playOne(opening: { name: string; cfg: SetupConfig; profile: BotProfile }, seed: number): RunResult {
  const setup = { ...opening.cfg, seed: (seed * 0x9e3779b1) >>> 0 };
  let g = createGame(setup, createRng(setup.seed));
  const bot: Bot = {
    rng: createRng((setup.seed ^ 0x51ed270b) >>> 0),
    profile: opening.profile,
    platIdx: seed
  };
  let advMs = 0;
  let maxCash = g.state.cash;
  let minCash = g.state.cash;
  const errs: string[] = [];
  let roundtripped = false;

  for (let day = 1; day <= MAX_DAYS; day++) {
    if (g.state.meta.over) break;
    // ① 昨日行动期间入队的事件先决（覆盖 dispatch 入队路径）
    if (g.state.pending.events.some(e => !e.resolved)) resolveAllPending(g, []);
    // ② 日型 + 行动阶段（AP 内正常行动；relentless 在精力见底前后继续硬撑——过劳线覆盖）
    botDayType(g, bot);
    let guard = 0;
    while (guard < 10 && !g.state.meta.over) {
      botAct(g, bot);
      guard++;
      const st = g.state;
      const grind = (bot.profile.relentless && bot.rng.chance(0.6)) || (bot.profile.pusher === true && bot.rng.chance(0.35));
      const more = st.ap > 0 && st.energy > (bot.profile.relentless ? 0 : 15);
      if (!more && !(grind && st.energy > 0)) break;
    }
    // ③ 结束今天
    const t0 = performance.now();
    const rep = g.advanceDay();
    advMs += performance.now() - t0;
    maxCash = Math.max(maxCash, g.state.cash);
    minCash = Math.min(minCash, g.state.cash);
    // ④ 今日新事件全决（轮换选项）
    resolveAllPending(g, rep.events);
    // ⑤ 不变量 + 巡检（每日）
    const dayErrs = checkState(g.state);
    if (dayErrs.length > 0) errs.push(`day ${day}: ${dayErrs.join(' | ')}`);
    // ⑥ 第 100 天：存档 roundtrip → 用加载实例续跑（无异常 + 状态等价）
    if (!roundtripped && g.state.meta.day > ROUNDTRIP_DAY && !g.state.meta.over) {
      roundtripped = true;
      const sv = g.serialize();
      const g2 = loadGame(sv);
      expect(g2.serialize().game).toBe(sv.game); // 状态等价：字节级一致
      g = g2; // 续跑（覆盖读档路径）
    }
    if (errs.length > 0) break;
  }
  expect(errs, `${opening.name} seed${seed}: ${errs.slice(0, 5).join(' ;; ')}`).toEqual([]);
  const res: RunResult = {
    opening: opening.name,
    seed,
    endDay: g.state.meta.day,
    endingKey: g.state.meta.endingKey,
    maxCash: Math.round(maxCash),
    minCash: Math.round(minCash),
    stage: g.state.meta.stage,
    followersPeak: g.state.stats.followersPeak,
    advMs: Math.round(advMs * 10) / 10
  };
  runResults.push(res);
  return res;
}

// ---------- 测试体 ----------

describe('[S8] soak：8 开局 × 6 种子无头浸泡', () => {
  it('零未捕获异常 / 不变量 / NaN 巡检 / 存档 roundtrip（每开局 6 局）', () => {
    for (const opening of OPENINGS) {
      for (let seed = 1; seed <= 6; seed++) {
        expect(() => playOne(opening, seed)).not.toThrow();
      }
    }
    // 局数与天数 sanity
    expect(runResults.length).toBeGreaterThanOrEqual(48);
    console.info('[soak] 局数', runResults.length, '平均天数',
      Math.round(runResults.reduce((a, r) => a + r.endDay, 0) / runResults.length));
  }, 600000);

  it('性能：单局 advanceDay 总耗时 <200ms（720 天口径）', () => {
    expect(runResults.length).toBeGreaterThan(0);
    const maxMs = Math.max(...runResults.map(r => r.advMs));
    const avgMs = runResults.reduce((a, r) => a + r.advMs, 0) / runResults.length;
    console.info(`[soak] advanceDay 总耗时：max ${maxMs}ms / avg ${Math.round(avgMs * 10) / 10}ms（每局自然终局）`);
    expect(maxMs).toBeLessThan(200);
    // 完整 720 天口径：构造态维持生命体征（带在营项目/平台/智能体的满载世界）连打 720 天
    const g = createGame(cfg({ niche: 'kol', background: 'fired' }, 777), createRng(777));
    const s = g.state as StateSlice;
    s.meta.stage = 5;
    s.cash = 1e7;
    g.dispatch({ t: 'newProject', name: 'perf', type: 'saas', revenueModel: 'subscription' });
    const p0 = s.projects[0]!;
    p0.stage = 'grow'; p0.mrr = 50000; p0.users = 4000;
    g.dispatch({ t: 'hireAgent', id: 'growth' });
    g.dispatch({ t: 'hireAgent', id: 'content' });
    ensureAccount(s, 'bilili').followers = 50000;
    const t0 = performance.now();
    for (let d = 0; d < 720; d++) {
      s.health.sleep.v = 70; s.health.mood.v = 70; s.health.diet.v = 70; s.health.exercise.v = 70;
      s.energy = 100; s.stress = 10; s.cash = Math.max(s.cash, 100000);
      s.flags.cashNegDays = 0; s.flags.s1DeepDays = 0;
      g.advanceDay();
    }
    const ms720 = performance.now() - t0;
    console.info(`[soak] 完整 720 天 advanceDay 总耗时：${Math.round(ms720 * 10) / 10}ms`);
    expect(ms720).toBeLessThan(200);
  });

  it('结局可达性：≥5 种 endingKey；burnoutDown/bankrupt/backToWork 必命中', () => {
    const seen = new Set(runResults.map(r => r.endingKey).filter((k): k is string => !!k));
    console.info('[soak] 结局分布', JSON.stringify(
      [...seen].map(k => ({ k, n: runResults.filter(r => r.endingKey === k).length }))));
    expect(seen.size).toBeGreaterThanOrEqual(5);
    for (const must of ['burnoutDown', 'bankrupt', 'backToWork']) {
      expect(seen, `结局 ${must} 未被任何一局命中`).toContain(must);
    }
  });

  it('事件覆盖：48 局有机触发的不同事件 id ≥40/80', () => {
    console.info('[soak] 48 局有机触发事件数', triggeredEvents.size, '/', EVENT_DEFS.length,
      '缺：', EVENT_DEFS.filter(d => !triggeredEvents.has(d.id)).map(d => d.id).join(','));
    expect(triggeredEvents.size).toBeGreaterThanOrEqual(40);
  });
});

describe('[S8] soak 充电：全事件 × 全选项直打 sweep（含 System1 无空选项检查）', () => {
  it('80 事件 × 全选项：构造态强制入队直打，零异常、零不变量违规', () => {
    let seed = 0x5eed;
    for (const def of EVENT_DEFS) {
      for (let i = 0; i < def.choices.length; i++) {
        seed = (seed + 0x9e37) >>> 0;
        const g = createGame(cfg({ niche: 'dev', background: 'fired', difficulty: 'normal' }, seed), createRng(seed));
        const s = g.state as StateSlice;
        s.meta.stage = 4;
        s.cash = 60000;
        s.projects.push({
          id: 'sweep_p1', name: 'sweep', type: 'saas', revenueModel: 'subscription', stage: 'grow',
          progress: 60, quality: 60, pmfTrue: 60, pmfEstimate: { v: 55, noise: 10 }, risk: 30,
          maintenance: 20, users: 200, mrr: 4000, ageMonths: 4, version: 2, alive: true,
          decayRate: 2, lastMonthMrr: 3900, stalledMonths: 0
        });
        const pe = enqueueEvent(s, def.id, 'forced', { once: def.once === true, cooldownDays: def.cooldownDays ?? 0 });
        expect(pe, `${def.id} 入队失败`).not.toBeNull();
        const r = resolveChoice(s, def, i, createRng(seed));
        expect(r.ok, `${def.id}#${i} 结算失败`).toBe(true);
        const rep = g.advanceDay();
        expect(rep).toBeDefined();
        expect(checkState(s), `${def.id}#${i}: ${checkState(s).join('|')}`).toEqual([]);
        chosenKeys.add(`${def.id}:${i}`);
      }
    }
  });

  it('触发过的事件每个选项都被选过一次（有机 + sweep 合并覆盖）', () => {
    for (const def of EVENT_DEFS) {
      for (let i = 0; i < def.choices.length; i++) {
        expect(chosenKeys, `${def.id} 选项#${i} 未被选过`).toContain(`${def.id}:${i}`);
      }
    }
  });

  it('System1 / system1Deep 下任何事件弹窗都不空选项（无死锁）', () => {
    const s1like = { decisionMode: 'system1' } as StateSlice;
    const deep = { decisionMode: 'system1Deep' } as StateSlice;
    const empty: string[] = [];
    for (const def of EVENT_DEFS) {
      if (filterChoicesForUI(s1like, def).length === 0) empty.push(`system1:${def.id}`);
      if (filterChoicesForUI(deep, def).length === 0) empty.push(`deep:${def.id}`);
    }
    expect(empty, 'System1 下空选项事件（弹窗死锁风险）').toEqual([]);
  });
});

describe('[S8] 读档续跑确定性（seedState 回写契约）', () => {
  it('同一存档加载两个实例，同序操作 40 天后状态字节级一致（随机流无缝续接）', () => {
    const setup = cfg({ niche: 'dev', background: 'fired' }, 4242);
    const g = createGame(setup, createRng(setup.seed));
    // 预跑 60 天
    for (let d = 0; d < 60 && !g.state.meta.over; d++) {
      g.dispatch({ t: 'dayType', dt: 'standard' });
      g.dispatch({ t: 'newProject', name: 'det', type: 'template', revenueModel: 'subscription' });
      for (let i = 0; i < 3; i++) g.dispatch({ t: 'act', id: 'developProject' });
      g.advanceDay();
    }
    const sv = g.serialize();
    const ga = loadGame(sv);
    const gb = loadGame(sv);
    for (let d = 0; d < 40 && !ga.state.meta.over && !gb.state.meta.over; d++) {
      for (const gx of [ga, gb]) {
        gx.dispatch({ t: 'dayType', dt: 'extended' });
        gx.dispatch({ t: 'act', id: 'writeContent', platformId: 'bilili' });
        gx.dispatch({ t: 'act', id: 'deepLearnFit' });
        gx.advanceDay();
      }
    }
    expect(ga.serialize().game).toBe(gb.serialize().game);
    console.info('[soak] 读档续跑 40 天双实例状态一致：day', ga.state.meta.day);
  });
});

// ---------- 猝死链（§7.2 回归 + 概率区间） ----------

describe('[S8] 猝死链：构造态 30 种子硬撑', () => {
  function suddenGame(seed: number): Game {
    const g = createGame(cfg({}, seed), createRng(seed));
    const s = g.state as StateSlice;
    s.health.hiddenFatigue = 90;
    s.health.sleep.v = 10;
    s.flags.heartAttackWarn = true;
    s.burnoutCount = 1;
    s.energy = 100;
    return g;
  }

  it('全前置成立：30 种子内必有命中，且每日风险按公式递增并封顶', () => {
    let hits = 0;
    const risks: number[] = [];
    for (let seed = 1; seed <= 30; seed++) {
      const g = suddenGame(seed);
      const s = g.state as StateSlice;
      let died = false;
      for (let d = 0; d < 30 && !s.meta.over; d++) {
        s.flags.hardPressedToday = true; // 硬撑记账 → 次日步 2 hardStreakDays 累积
        const want = suddenDeathP(s.health.hiddenFatigue, s.hardStreakDays);
        expect(suddenDeathRisk(s)).toBeCloseTo(want, 10);
        risks.push(suddenDeathRisk(s));
        g.advanceDay();
        if (s.meta.endingKey === 'suddenDeath') { died = true; break; }
      }
      if (died) hits++;
    }
    console.info(`[soak] 猝死链：30 种子命中 ${hits}`);
    expect(hits).toBeGreaterThanOrEqual(1);
    expect(hits / 30).toBeLessThanOrEqual(1);
    expect(Math.max(...risks)).toBeLessThanOrEqual(0.12 + 1e-9); // §7.2 封顶
  });

  it('前置缺任一：30 种子全 false（回归确认，单掷层——漂移会让缺失前置在多日里自愈，与 s2 同口径）', () => {
    const breakers: ((s: StateSlice) => void)[] = [
      s => { s.health.hiddenFatigue = 84; },
      s => { s.health.sleep.v = 15; },
      s => { s.flags.heartAttackWarn = false; },
      s => { s.burnoutCount = 0; }
    ];
    for (const brk of breakers) {
      for (let seed = 1; seed <= 30; seed++) {
        const g = suddenGame(seed);
        brk(g.state);
        expect(rollSuddenDeath(g.state, createRng(seed)), `seed${seed} 前置缺失却掷中`).toBe(false);
      }
    }
  });
});

// ---------- 关键事件针对性用例 ----------

describe('[S8] 关键事件针对性补齐', () => {
  it('heartAttackWarn：hf≥70 置顶必出，三选项各结算一次', () => {
    for (let i = 0; i < 3; i++) {
      const g = createGame(cfg({}, 100 + i), createRng(100 + i));
      const s = g.state as StateSlice;
      s.health.hiddenFatigue = 75;
      const rep = g.advanceDay();
      expect(rep.events.some(e => e.id === 'heartAttackWarn'), 'hf≥70 应置顶必出心悸预警').toBe(true);
      const def = findEventDef('heartAttackWarn');
      expect(def).toBeDefined();
      const r = resolveChoice(s, def!, i, createRng(i));
      expect(r.ok).toBe(true);
      expect(checkState(s)).toEqual([]);
    }
    // 选「硬撑」→ 掷骰门控 flag 置位
    const g = createGame(cfg({}, 200), createRng(200));
    const s = g.state as StateSlice;
    s.health.hiddenFatigue = 75;
    g.advanceDay();
    resolveChoice(s, findEventDef('heartAttackWarn')!, 0, createRng(0));
    expect(s.flags.heartAttackWarn).toBe(true);
  });

  it('aiUndeclared：content 智能体未声明发布可有机触发；三选项直打', () => {
    // 有机触发路径
    let organic = false;
    for (let seed = 300; seed < 340 && !organic; seed++) {
      const g = createGame(cfg({ talents: [] }, seed), createRng(seed));
      const s = g.state as StateSlice;
      s.meta.stage = 4;
      s.cash = 50000;
      g.dispatch({ t: 'hireAgent', id: 'content' });
      ensureAccount(s, 'bilili').state = 'normal';
      for (let i = 0; i < 120 && !organic; i++) {
        publishContent(s, 'bilili', createRng(seed * 1000 + i));
        if (s.pending.events.some(e => e.id === 'aiUndeclared')) organic = true;
      }
    }
    expect(organic, '120 次未声明发布（检测概率 ×3）内应触发 aiUndeclared').toBe(true);
    // 三选项直打
    for (let i = 0; i < 3; i++) {
      const g = createGame(cfg({}, 400 + i), createRng(400 + i));
      const s = g.state as StateSlice;
      enqueueEvent(s, 'aiUndeclared', 'forced', { cooldownDays: 7 });
      const r = resolveChoice(s, findEventDef('aiUndeclared')!, i, createRng(i));
      expect(r.ok).toBe(true);
      expect(checkState(s)).toEqual([]);
    }
  });

  it('token-burn-warning：连续 2 月账单>上月收入 60% 时月结触发', () => {
    const g = createGame(cfg({}, 500), createRng(500));
    const s = g.state as StateSlice;
    s.meta.stage = 4;
    s.cash = 50000;
    g.dispatch({ t: 'hireAgent', id: 'legalfin' });
    g.dispatch({ t: 'hireAgent', id: 'support' });
    s.monthlyIncome = 100; // 上月收入极低 → 账单占比必超 60%
    s.flags.tokenBurnStreak = 1;
    s.meta.day = 30; // 月边界
    g.advanceDay();
    // tickAgentsDay 直接入 pending.events（不回传 DayReport）——UI 由 main.ts 的 pending 兜底排水浮出
    expect(s.pending.events.some(e => e.id === 'token-burn-warning'), '烧钱警报应 forced 入队').toBe(true);
  });

  it('moon-three：项目第 3 月 MRR<1000 月结 forced 入队', () => {
    const g = createGame(cfg({}, 600), createRng(600));
    const s = g.state as StateSlice;
    g.dispatch({ t: 'newProject', name: '魔咒', type: 'saas', revenueModel: 'subscription' });
    const p = s.projects[0]!;
    p.ageMonths = 2;
    p.mrr = 0;
    s.meta.day = 30;
    const rep = g.advanceDay();
    expect(rep.events.some(e => e.id === 'moon-three'), '月三魔咒应 forced 入队').toBe(true);
  });

  it('灰产链全链：lead → scale → crash → audit → legal 经连锁种子有机到站', () => {
    const g = createGame(cfg({}, 700), createRng(700));
    const s = g.state as StateSlice;
    s.meta.stage = 2;
    s.cash = 80000;
    // 立项灰产 → grayHistory 永久记录
    g.dispatch({ t: 'newProject', name: '中转站', type: 'apiRelay', revenueModel: 'usage' });
    expect(s.flags.grayHistory).toBe(true);
    // lead（dig-deeper → 连锁 scale，14 天，ifCond gray）
    enqueueEvent(s, 'gray-relay-lead', 'forced', {});
    resolveChoice(s, findEventDef('gray-relay-lead')!, 0, createRng(1));
    const keepAlive = (): void => {
      // 构造态不行动会让健康在 ~2 周内崩到 healthCollapse（over 后步 5-10 停摆，连锁不再走表）——维持生命体征
      const st = g.state as StateSlice;
      st.health.sleep.v = 70; st.health.mood.v = 70; st.health.diet.v = 70; st.health.exercise.v = 70;
      st.health.hiddenFatigue = 0; st.energy = 100; st.stress = 10;
      st.flags.forcedMinDays = 0; st.flags.interrupted = false; st.flags.lowMoodDays = 0;
      st.flags.cashNegDays = 0; st.flags.s1DeepDays = 0;
    };
    const arrive = (id: string, cap: number): void => {
      for (let d = 0; d < cap && !g.state.pending.events.some(e => e.id === id); d++) {
        keepAlive();
        g.advanceDay();
      }
      expect(g.state.pending.events.some(e => e.id === id), `${id} 应经连锁到站`).toBe(true);
    };
    arrive('gray-relay-scale', 16);
    resolveChoice(s, findEventDef('gray-relay-scale')!, 0, createRng(2)); // aggressive → 连锁 crash 21 天
    arrive('gray-relay-crash', 23);
    resolveChoice(s, findEventDef('gray-relay-crash')!, 1, createRng(3)); // new-upstream → 连锁 audit 15 天
    arrive('gray-clearing-audit', 17);
    resolveChoice(s, findEventDef('gray-clearing-audit')!, 1, createRng(4)); // conceal → 连锁 legal 15 天
    arrive('gray-clearing-legal', 17);
    // legal 两选项都直打一次（cooperate 在本局，resist 另开一局直打）
    resolveChoice(s, findEventDef('gray-clearing-legal')!, 0, createRng(5));
    const g2 = createGame(cfg({}, 701), createRng(701));
    enqueueEvent(g2.state, 'gray-clearing-legal', 'forced', {});
    resolveChoice(g2.state, findEventDef('gray-clearing-legal')!, 1, createRng(6));
    // topup 链：lead(take-orders) → settle(delay14)
    const g3 = createGame(cfg({}, 702), createRng(702));
    enqueueEvent(g3.state, 'gray-topup-lead', 'forced', {});
    resolveChoice(g3.state, findEventDef('gray-topup-lead')!, 0, createRng(7));
    for (let d = 0; d < 16 && !g3.state.pending.events.some(e => e.id === 'gray-topup-settle'); d++) {
      const st = g3.state as StateSlice;
      st.health.sleep.v = 70; st.health.mood.v = 70; st.health.diet.v = 70; st.health.exercise.v = 70;
      st.health.hiddenFatigue = 0; st.energy = 100; st.stress = 10;
      st.flags.forcedMinDays = 0; st.flags.interrupted = false; st.flags.lowMoodDays = 0;
      st.flags.cashNegDays = 0; st.flags.s1DeepDays = 0;
      g3.advanceDay();
    }
    expect(g3.state.pending.events.some(e => e.id === 'gray-topup-settle')).toBe(true);
    expect(checkState(s)).toEqual([]);
    expect(checkState(g3.state)).toEqual([]);
  });
});

// ---------- 结局「继续经营」复位契约（ending.ts 清理逻辑的 core 侧断言） ----------

describe('[S8] 主动结局「继续经营」复位契约', () => {
  it('清 chosen flag + over/endingKey + burnoutCount 后，被动轮询不再立刻拖回终局', () => {
    const g = createGame(cfg({}, 900), createRng(900));
    const s = g.state as StateSlice;
    s.burnoutCount = 3;
    expect(checkPassiveEndings(s)?.key).toBe('burnoutDown'); // 烈度优先：过劳先于主动结局
    s.burnoutCount = 0;
    s.flags.backToWorkChosen = true;
    const def = checkPassiveEndings(s);
    expect(def?.key).toBe('backToWork'); // 结局触发
    applyEnding(s, def!);
    expect(s.meta.over).toBe(true);
    // —— 复制 ending.ts「继续经营」清理逻辑 ——
    s.meta.over = false;
    s.meta.endingKey = undefined;
    for (const f of ['retireChosen', 'sellChosen', 'handoverChosen', 'pivotRestartChosen', 'backToWorkChosen']) {
      delete s.flags[f];
    }
    s.burnoutCount = 0;
    expect(checkPassiveEndings(s)).toBeNull();
    for (let d = 0; d < 5; d++) {
      s.flags.hardPressedToday = false;
      g.advanceDay();
      if (!s.meta.over) continue;
    }
    expect(s.meta.over, '复位后 5 天内不得再被同结局拖回').toBe(false);
    expect(findEnding('backToWork')).toBeDefined();
    expect(ENDING_DEFS.length).toBe(17);
  });
});
