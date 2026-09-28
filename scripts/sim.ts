// ============================================================
// [S9] 平衡模拟器（技术文档 §16.2 / 设计 §十二 目标分布表）
// 8 策略机器人 × 8 开局混布 × 19 种子 = 152 局/bot（共 1216 局），720 天上限。
// 产出 game/sim-report.md：结局分布 / 阶段到达 / 存活中位数 / 猝死过劳 /
// 智能体雇佣率 / Token 月账单 / 幽灵公司 / 异常计数 / 目标对照 / 调参记录。
// 只读 core 公开 API，不碰 DOM；随机全走种子化 RNG（可复现）。
// 运行：npm run sim（tsx scripts/sim.ts）
// ============================================================
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertInvariants, createGame, createRng, resolveChoice,
  type Game, type Rng, type SetupConfig, type StateSlice
} from '../src/core/index';
import { monthlyTokenBill } from '../src/core/agents';
import { AGENT_DEFS } from '../src/data/agents.def';
import { PATCH_DEFS } from '../src/data/patches.def';
import { findEventDef, EVENT_DEFS } from '../src/data/events.def';
import { ENDING_DEFS } from '../src/data/endings.def';
import type { EventDef } from '../src/core/types';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = resolve(HERE, '..', 'sim-report.md');

const MAX_DAYS = 720;
const SEEDS_PER_OPENING = Number(process.env['SIM_SEEDS'] ?? 19); // SIM_SEEDS=2 可快速冒烟
const PASSIVE_KEYS = new Set(['burnoutDown', 'suddenDeath', 'bankrupt', 'healthCollapse', 'mentalBreak', 'legalFrozen', 'platformCollapse']);

// ---------- 开局混布（覆盖难度×地理×背景：与 soak 同源口径） ----------

function cfg(partial: Partial<SetupConfig>, seed: number): SetupConfig {
  return {
    niche: 'dev', background: 'grass', location: 'hangcheng', difficulty: 'normal',
    talents: [], personality: { pragmaticIdeal: 'pragmatic', steadyAggressive: 'steady', soloSocial: 'solo' },
    cryptoOn: true, seed,
    ...partial
  };
}

const OPENINGS: { name: string; cfg: SetupConfig }[] = [
  { name: '开发×草根×标准', cfg: cfg({ niche: 'dev', background: 'grass' }, 0) },
  { name: '博主×裸辞×一线', cfg: cfg({ niche: 'kol', background: 'fired', location: 'beishang', talents: ['socialite'] }, 0) },
  { name: '写作×学生×小城×故事', cfg: cfg({ niche: 'writer', background: 'student', location: 'hometown', difficulty: 'story', talents: ['quickLearner'] }, 0) },
  { name: '教练×体制×二线', cfg: cfg({ niche: 'coach', background: 'system', location: 'changwu', talents: ['empathy'] }, 0) },
  { name: '制客×老兵×广深×硬核', cfg: cfg({ niche: 'maker', background: 'veteran', location: 'guangshen', difficulty: 'hard', talents: ['workaholic', 'nightOwl'] }, 0) },
  { name: '开发×二创×大理', cfg: cfg({ niche: 'dev', background: 'second', location: 'dali', talents: ['zen', 'phobia'] }, 0) },
  { name: '设计×草根×一线×地狱', cfg: cfg({ niche: 'design', background: 'grass', location: 'beishang', difficulty: 'insane', talents: ['debtStart'] }, 0) },
  { name: '博主×草根×新加坡×硬核', cfg: cfg({ niche: 'kol', background: 'grass', location: 'singapore', difficulty: 'hard', talents: ['nightOwl', 'spendthrift'] }, 0) }
];

// ---------- 机器人画像 ----------

interface BotSpec {
  key: string;
  name: string;
  desc: string;
  relentless: boolean;   // 不安排身心行动，硬撑
  daredevil: boolean;    // 作死：高频硬撑 + 高风险事件选项
  healthFirst: boolean;  // 健康优先：低阈值就休整
  slacker: boolean;      // 最低日躺平
  marketer: boolean;     // 内容+平台权重拉满
  builder: boolean;      // 单点突破项目
  automator: boolean;    // 尽早攒钱雇智能体
  eventStyle: 'safe' | 'risky' | 'rotate';
}

const BOTS: BotSpec[] = [
  { key: 'workaholic', name: '工作狂', desc: '无休肝，能延伸就延伸，硬撑家常便饭', relentless: true, daredevil: false, healthFirst: false, slacker: false, marketer: false, builder: false, automator: false, eventStyle: 'rotate' },
  { key: 'healthnut', name: '养生家', desc: '健康优先：低阈值休整，安全事件选项', relentless: false, daredevil: false, healthFirst: true, slacker: false, marketer: false, builder: false, automator: false, eventStyle: 'safe' },
  { key: 'marketer', name: '营销怪', desc: '内容+分发拉满，粉丝是一切', relentless: false, daredevil: false, healthFirst: false, slacker: false, marketer: true, builder: false, automator: false, eventStyle: 'rotate' },
  { key: 'builder', name: '产品党', desc: '单点突破：一个项目往死里做', relentless: false, daredevil: false, healthFirst: false, slacker: false, marketer: false, builder: true, automator: false, eventStyle: 'rotate' },
  { key: 'balanced', name: '骑墙派', desc: '均衡配点，什么都会一点', relentless: false, daredevil: false, healthFirst: false, slacker: false, marketer: false, builder: false, automator: false, eventStyle: 'rotate' },
  { key: 'daredevil', name: '作死者', desc: '专选高风险+硬撑到底，猝死线以他为生', relentless: true, daredevil: true, healthFirst: false, slacker: false, marketer: false, builder: false, automator: false, eventStyle: 'risky' },
  { key: 'automator', name: '自动化工', desc: '尽早攒钱雇智能体，autoLevel 优先', relentless: false, daredevil: false, healthFirst: false, slacker: false, marketer: false, builder: false, automator: true, eventStyle: 'safe' },
  { key: 'slacker', name: '摆烂人', desc: '最低日躺平，能不动就不动', relentless: false, daredevil: false, healthFirst: false, slacker: true, marketer: false, builder: false, automator: false, eventStyle: 'safe' }
];

// ---------- 事件选项偏好（safe 避开高风险 id / risky 专挑 / rotate 轮换） ----------

const RISKY_CHOICE_IDS = new Set([
  'hard-push', 'push-through', 'persist', 'deny', 'ignore', 'ignore-it', 'double-down',
  'scale-up', 'keep-burn', 'grit', 'stay-lean', 'all-nighter', 'skip-again', 'argue',
  'accelerate', 'repost', 'tough', 'more-volume', 'let-it-go', 'panic-scroll', 'ignore-siren', 'wait',
  // [S9] 灰产/道德暗账线：接单/拖延/跑路/盗版/造假都是「短多长空」面，
  // hint 里写明「N 天后法律冻结清算」——rotate bot 不踩标注过的灾难支（risky bot 仍专挑）
  'take-orders', 'stall', 'run-away', 'conceal', 'resist',
  'use-pirated', 'take-data', 'buy-10k', 'buy-engagement', 'make-hype',
  'whitewash', 'beautify', 'blame', 'partial'
]);

const choiceCursor = new Map<string, number>();
/** [S9] 事件覆盖统计（有机 = 抽样/连锁/引擎 forced；weekly-focus 心跳不计） */
const eventFired = new Map<string, number>();
const HEARTBEAT_EVENTS = new Set(['weekly-focus']);

function pickChoiceIdx(spec: BotSpec, def: EventDef): number {
  // 'ending:' 前缀 = 直接终局（玩家主动权时刻），不属于任何 bot 的策略意图——一律跳过
  const all = def.choices.map((c, i) => ({ c, i })).filter(x => !x.c.id.startsWith('ending:'));
  const first = all[0];
  if (!first) return 0;
  if (spec.eventStyle === 'risky') {
    const hit = all.find(x => RISKY_CHOICE_IDS.has(x.c.id));
    return (hit ?? all[all.length - 1] ?? first).i;
  }
  if (spec.eventStyle === 'safe') {
    const hit = all.find(x => !RISKY_CHOICE_IDS.has(x.c.id));
    return (hit ?? first).i;
  }
  // rotate：在高风险支之外轮换（试探不同合理打法，但不主动踩标注过的灾难支）
  const eligible = all.filter(x => !RISKY_CHOICE_IDS.has(x.c.id));
  const pool = eligible.length > 0 ? eligible : all;
  const k = choiceCursor.get(def.id) ?? 0;
  choiceCursor.set(def.id, k + 1);
  return (pool[k % pool.length] ?? first).i;
}

// ---------- 加权抽取 ----------

type Weighted<T> = [T, number][];
function pickW<T>(rng: Rng, list: Weighted<T>): T | undefined {
  const total = list.reduce((a, [, w]) => a + w, 0);
  if (total <= 0) return undefined;
  let u = rng.next() * total;
  for (const [v, w] of list) {
    u -= w;
    if (u < 0) return v;
  }
  return list[list.length - 1]?.[0];
}

const CONTENT_PLATFORMS = ['bilili', 'xhs', 'douyin', 'zhihu', 'wechat', 'weibo', 'site', 'youtube'] as const;
const BOTTLENECKS = ['health', 'cash', 'marketing', 'delivery', 'skill', 'compliance'] as const;
const AUTOMATOR_HIRE_ORDER = ['support', 'growth', 'legalfin', 'content', 'sales', 'regagent', 'butler'] as const;

// ---------- 巡检 ----------

const OK_UNDEFINED = ['endingKey', 'installedDay', 'lastMonthMrr', 'cause', 'ifCond', 'gray'];
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

// ---------- 单局 ----------

interface RunStats {
  bot: string;
  opening: string;
  seed: number;
  endDay: number;
  endingKey?: string;      // undefined 且 !over = 活到 720
  maxStage: number;
  finalStage: number;
  agentsHired: number;
  firstHireDay: number;    // 0 = 未雇佣
  maxAgents: number;
  ghostCompany: boolean;
  autoPeak: number;
  tokenSpent: number;
  maxMonthlyToken: number; // 月结时点当前智能体月账单采样峰值
  maxTokenGrossRatio: number; // 月账单 / 上月收入 峰值
  monthlyIncomePeak: number;
  passiveWithinYear: boolean;
  anomalies: number;
}

function playOne(spec: BotSpec, openingIdx: number, seed: number): RunStats {
  const opening = OPENINGS[openingIdx % OPENINGS.length]!;
  const setup = { ...opening.cfg, seed: ((seed * 0x9e3779b1 + openingIdx * 0x85ebca6b) ^ (BOTS.indexOf(spec) + 1)) >>> 0 };
  const g = createGame(setup, createRng(setup.seed));
  const botRng = createRng((setup.seed ^ 0x51ed270b) >>> 0);
  const evRng = createRng((setup.seed ^ 0xabcdef) >>> 0);
  const st = {
    maxStage: 1, firstHireDay: 0, maxAgents: 0, ghostCompany: false, autoPeak: 0,
    maxMonthlyToken: 0, maxTokenGrossRatio: 0, monthlyIncomePeak: 0, anomalies: 0
  };
  const resolveAllPending = (): void => {
    const s = g.state as StateSlice;
    const ids: string[] = [];
    for (const pe of s.pending.events) if (!pe.resolved) ids.push(pe.id);
    for (const id of ids) {
      if (s.meta.over) return;
      const def = findEventDef(id);
      if (!def || def.choices.length === 0) continue;
      if (!HEARTBEAT_EVENTS.has(id)) eventFired.set(id, (eventFired.get(id) ?? 0) + 1);
      resolveChoice(s, def, pickChoiceIdx(spec, def), evRng);
    }
  };

  for (let day = 1; day <= MAX_DAYS; day++) {
    const s = g.state as StateSlice;
    if (s.meta.over) break;
    if (s.pending.events.some(e => !e.resolved)) resolveAllPending();
    botDayType(g, spec, botRng);
    // 行动阶段：AP 内逐点行动（与 soak 同构）；relentless/daredevil 精力见底仍硬撑（过劳线覆盖）
    let guard = 0;
    while (guard < 10 && !g.state.meta.over) {
      botAct(g, spec, botRng);
      guard++;
      const st = g.state as StateSlice;
      const grind = (spec.relentless || spec.daredevil) && st.energy > 0 && botRng.chance(0.6);
      // 24：最贵动作 18 精力 + 硬撑线 5——理性玩家读完「硬撑记账」警告后收手的下限
      const more = st.ap > 0 && st.energy > (spec.relentless || spec.daredevil ? 12 : 24);
      if (!more && !grind) break;
    }
    const prevDay = s.meta.day;
    g.advanceDay();
    const s2 = g.state as StateSlice;
    st.maxStage = Math.max(st.maxStage, s2.meta.stage);
    st.autoPeak = Math.max(st.autoPeak, s2.autoLevel);
    if (s2.flags.ghostCompany === true) st.ghostCompany = true;
    st.maxAgents = Math.max(st.maxAgents, s2.agents.length);
    if (st.firstHireDay === 0 && s2.agents.length > 0) st.firstHireDay = s2.meta.day;
    st.monthlyIncomePeak = Math.max(st.monthlyIncomePeak, s2.monthlyIncome);
    if (prevDay % 30 === 0 && s2.agents.length > 0) {
      const bill = monthlyTokenBill(s2, createRng(1));
      st.maxMonthlyToken = Math.max(st.maxMonthlyToken, Math.round(bill));
      if (s2.monthlyIncome > 0) st.maxTokenGrossRatio = Math.max(st.maxTokenGrossRatio, bill / s2.monthlyIncome);
    }
    resolveAllPending();
    // 巡检：每月 + 终局时全量，平时只跑不变量（性能）
    if (day % 30 === 0 || s2.meta.over) {
      const errs = checkState(s2);
      if (errs.length > 0) st.anomalies += errs.length;
    } else {
      const errs = assertInvariants(s2);
      if (errs.length > 0) st.anomalies += errs.length;
    }
  }

  const s = g.state as StateSlice;
  return {
    bot: spec.key,
    opening: opening.name,
    seed,
    endDay: Math.min(s.meta.day, MAX_DAYS + 1),
    endingKey: s.meta.endingKey,
    maxStage: st.maxStage,
    finalStage: s.meta.stage,
    agentsHired: s.stats.agentsHired,
    firstHireDay: st.firstHireDay,
    maxAgents: st.maxAgents,
    ghostCompany: st.ghostCompany,
    autoPeak: Math.round(st.autoPeak),
    tokenSpent: Math.round(s.stats.tokenSpent),
    maxMonthlyToken: st.maxMonthlyToken,
    maxTokenGrossRatio: Math.round(st.maxTokenGrossRatio * 100) / 100,
    monthlyIncomePeak: Math.round(st.monthlyIncomePeak),
    passiveWithinYear: PASSIVE_KEYS.has(s.meta.endingKey ?? '') && s.meta.day <= 360,
    anomalies: st.anomalies
  };
}

// ---------- 日型策略 ----------

function botDayType(g: Game, spec: BotSpec, rng: Rng): void {
  const s = g.state as StateSlice;
  if (typeof s.flags.forcedMinDays === 'number' && s.flags.forcedMinDays > 0) return;
  const bars = [s.health.sleep.v, s.health.mood.v, s.health.diet.v, s.health.exercise.v];
  const low = Math.min(...bars);
  if (spec.slacker) {
    g.dispatch({ t: 'dayType', dt: s.energy < 90 || low < 70 ? 'minimum' : 'standard' });
    return;
  }
  if (spec.relentless) {
    g.dispatch({ t: 'dayType', dt: s.energy >= 30 || rng.chance(0.5) ? 'extended' : 'standard' });
    return;
  }
  const restAt = spec.healthFirst ? 55 : 45;
  const hfAt = spec.healthFirst ? 40 : 55;
  if (low < restAt || s.energy < restAt || s.health.hiddenFatigue >= hfAt) {
    g.dispatch({ t: 'dayType', dt: rng.chance(0.9) ? 'minimum' : 'standard' });
    return;
  }
  const wantExt = s.energy >= 80 && low >= 60 && s.health.hiddenFatigue < 30 && rng.chance(0.5);
  g.dispatch({ t: 'dayType', dt: wantExt ? 'extended' : 'standard' });
}

// ---------- 行动策略 ----------

function botAct(g: Game, spec: BotSpec, rng: Rng): void {
  const s = g.state as StateSlice;
  // 最低日：只做身心恢复
  if (s.dayType === 'minimum') {
    const rest: Weighted<{ id: string }> = [
      [{ id: 'exercise' }, s.health.exercise.v < 50 ? 4 : 2],
      [{ id: 'meditate' }, s.stress > 50 ? 3 : 1],
      [{ id: 'deepRest' }, s.health.sleep.v < 50 ? 6 : 4],
      [{ id: 'socialize' }, s.health.mood.v < 50 ? 3 : 1],
      [{ id: 'seekDoctor' }, s.health.sleep.v < 35 || s.health.hiddenFatigue >= 75 ? 3 : 0],
      [{ id: 'healthCheckup' }, s.health.hiddenFatigue >= 55 && s.flags.fatigueKnown !== true ? 3 : 0]
    ];
    const pick = pickW(rng, rest);
    if (pick) g.dispatch({ t: 'act', id: pick.id });
    return;
  }
  const alive = s.projects.filter(p => p.alive);
  const proj = alive[alive.length - 1];
  const deliverable = alive.some(p => ['build', 'launch', 'grow', 'mature', 'decline'].includes(p.stage));
  // 现金流状态机（模拟真人 runway 感）：紧张=跑道<1.8 月全力搞钱；宽裕=跑道>6 月才养生旅游
  const broke = s.cash < Math.max(3000, Math.round(s.monthlyExpense * 1.8));

  // —— 结构性操作 ——
  if (spec.automator && s.meta.stage >= 3) {
    // 自动化工：雇人优先级最高，先补齐 support+growth 基本盘；
    // 月账单/上月收入 >35% 时先止损不扩编（§8.2 单位经济面板的理性读者）
    const billNow = s.agents.length > 0 ? monthlyTokenBill(s, createRng(1)) : 0;
    const billHot = s.monthlyIncome > 0 && billNow > s.monthlyIncome * 0.35;
    const want = billHot ? [] : AUTOMATOR_HIRE_ORDER.map(id => AGENT_DEFS.find(d => d.id === id)).filter(
      d => d && s.meta.stage >= (d?.unlockStage ?? 9) && !s.agents.some(a => a.id === d?.id) && s.cash >= (d?.deployCost ?? 1e9) + 3000
    );
    const next = want[0];
    if (next) { g.dispatch({ t: 'hireAgent', id: next.id }); return; }
  }
  if (alive.length < s.attentionCap && rng.chance(spec.automator ? 0.15 : 0.10)) {
    const t = pickW(rng, [
      ['saas', spec.builder ? 8 : 3],
      ['aiSupport', spec.automator ? (s.meta.stage >= 3 ? 6 : 1) : 0],
      ['template', 3], ['course', 2], ['consulting', 3], ['plugin', spec.builder ? 2 : 2],
      ['community', 1], ['publishing', 1],
      ['apiRelay', spec.daredevil ? 2 : 0], ['physical', 1], ['bootcamp', 1]
    ] as Weighted<string>);
    if (t) { g.dispatch({ t: 'newProject', name: '', type: t, revenueModel: 'subscription' }); return; }
  }
  if (proj && proj.stage === 'decline' && rng.chance(0.15)) {
    g.dispatch({ t: 'pivotProject', projectId: proj.id, toType: pickW(rng, [['saas', 2], ['course', 2], ['consulting', 2], ['template', 2]]) ?? 'saas' });
    return;
  }
  if (rng.chance(0.005) && alive.length > 1 && proj) {
    g.dispatch({ t: 'retireProject', projectId: proj.id });
    return;
  }
  if (!spec.automator && s.meta.stage >= 3 && s.agents.length < 3 && s.cash > 15000 && rng.chance(spec.daredevil ? 0 : 0.04)) {
    const hireable = AGENT_DEFS.filter(d => s.meta.stage >= d.unlockStage && s.cash >= d.deployCost && !s.agents.some(a => a.id === d.id));
    const id = hireable.length > 0 ? rng.pick(hireable).id : undefined;
    if (id) { g.dispatch({ t: 'hireAgent', id }); return; }
  }
  if (rng.chance(0.02)) {
    const installed = new Set(s.osRules.map(r => r.id));
    const cand = PATCH_DEFS.filter(p => !installed.has(p.id) && s.ap >= p.installCost.ap && s.cash >= (p.installCost.cash ?? 0));
    if (cand.length > 0 && !spec.relentless) { g.dispatch({ t: 'patch', id: rng.pick(cand).id }); return; }
  }
  if (s.cash > 40000 && rng.chance(0.05)) {
    g.dispatch({ t: 'invest', kind: rng.chance(0.5) ? 'indexFund' : 'fund', amount: Math.round(s.cash * 0.2) });
    return;
  }
  if (s.debt > 0 && s.cash > s.debt && rng.chance(0.1)) {
    g.dispatch({ t: 'invest', kind: 'repay', amount: Math.min(s.debt, Math.round(s.cash * 0.3)) });
    return;
  }
  if (s.cash < 0 && s.creditScore >= 400 && rng.chance(0.8) && !spec.slacker) {
    g.dispatch({ t: 'invest', kind: 'funding', amount: 12000 });
    return;
  }
  const mainAcc = Object.entries(s.platforms).sort((a, b) => (b[1]?.followers ?? 0) - (a[1]?.followers ?? 0))[0]?.[1];
  if (mainAcc && !mainAcc.aiDeclared && rng.chance(0.06)) {
    const pid = Object.entries(s.platforms).sort((a, b) => (b[1]?.followers ?? 0) - (a[1]?.followers ?? 0))[0]?.[0];
    if (pid) { g.dispatch({ t: 'declareAI', platform: pid }); return; }
  }
  if (rng.chance(0.0008)) { // [S9] 0.002→0.0008：bot 无「旅居」意图，随机迁居把 secondLife 抬到 14.5%
    g.dispatch({ t: 'relocate', to: rng.pick(['dali', 'nomad', 'beishang', 'changwu', 'hometown']) });
    return;
  }
  if (rng.chance(0.01)) {
    g.dispatch({ t: 'focus', id: rng.pick([...BOTTLENECKS]) });
    return;
  }

  // —— 日常行动（act 类，按画像加权） ——
  const list: Weighted<{ id: string; projectId?: string; platformId?: string }> = [];
  const w = (id: string, weight: number, extra?: { projectId?: string; platformId?: string }): void => {
    if (weight > 0) list.push([{ id, ...extra }, weight]);
  };
  const plat = CONTENT_PLATFORMS[rng.int(0, CONTENT_PLATFORMS.length - 1)] ?? 'bilili';
  // 预算思路：每天 ~3 AP，工作块为主、自我块保底、管理块零头；break（现金<3000）时全部让位给交付
  const workBias = broke ? 0.4 : 1;
  const preSeed = spec.automator && s.meta.stage < 3; // 自动化工上线前纯搞钱：不学不写不内容
  w('deepLearnFit', broke || preSeed ? 0 : 1);
  w('deepLearnHard', spec.relentless ? 1.5 : 0.5);
  w('readIndustry', broke || preSeed ? 0 : 0.5);
  w('userInterview', proj ? 0.5 : 0, { projectId: proj?.id });
  w('joinCommunity', preSeed ? 0 : 0.5);
  w('writeContent', preSeed ? 0 : (spec.marketer ? 7 : 2) * workBias, { platformId: plat });
  w('marketingDistribution', preSeed ? 0 : (spec.marketer ? 5 : 1) * workBias);
  w('developProject', proj ? (spec.builder ? 7 : 3.5) * workBias : 0, { projectId: proj?.id });
  w('polishQuality', proj ? (spec.builder ? 1.5 : 0.8) * workBias : 0, { projectId: proj?.id });
  w('deliverService', deliverable ? (broke ? 10 : spec.healthFirst ? 8 : spec.automator ? 8 : spec.builder ? 4 : 6) : 0, { projectId: proj?.id });
  w('makeCourse', alive.some(p => p.type === 'course') ? 1 : 0, { projectId: proj?.id });
  w('negotiatePriceStd', 0.4);
  w('bookkeeping', s.flags.selfBookkeeping === true ? 0 : 0.3);
  w('payTax', 0.5);
  if (s.meta.stage >= 2 && s.entity === 'none' && s.cash > 2000) w('registerSole', 1);
  if (s.meta.stage >= 3 && s.entity !== 'opc' && s.cash > 6000) w('registerOPC', 0.6);
  if (s.meta.stage >= 3 && s.cash > 5000) w('buildAutomation', spec.automator ? 2.5 : 0.4);
  w('writeSop', spec.automator ? 1.5 : 0.5);
  w('businessCoop', 0.5);
  if (!spec.relentless) {
    const bars = [s.health.sleep.v, s.health.mood.v, s.health.diet.v, s.health.exercise.v];
    const low = Math.min(...bars);
    const healthBoost = spec.healthFirst ? 2 : 1;
    w('exercise', (2 + (s.health.exercise.v < 50 ? 3 : 0)) * (low < 30 ? 1.5 : 1) * healthBoost);
    w('meditate', s.stress > 50 ? 3 * healthBoost : 0.5);
    w('deepRest', ((s.energy < 40 ? 3 : 0.5) + (s.health.sleep.v < 50 ? 6 : 0)) * healthBoost);
    w('socialize', s.health.mood.v < 45 ? 3 : 1);
    w('travel', s.cash > 12000 && s.stress > 60 ? 0.5 : 0);
    w('healthCheckup', s.health.hiddenFatigue >= 55 && s.flags.fatigueKnown !== true ? 4 : 0);
    w('seekDoctor', s.health.sleep.v < 35 || s.health.hiddenFatigue >= 75 ? 3 : 0);
  } else {
    // 连轴转/作死：平时不休息，但非睡眠子项告急时被身体按一下（soak relentless 同款）
    //（作死者对睡眠线视而不见——只有睡眠崩、其他项吊住，才走「硬撑到底」猝死链而非泛型健康崩盘）
    const ignoreSleep = spec.daredevil;
    const bars = ignoreSleep
      ? [s.health.mood.v, s.health.diet.v, s.health.exercise.v]
      : [s.health.sleep.v, s.health.mood.v, s.health.diet.v, s.health.exercise.v];
    const low = Math.min(...bars);
    const critical = low < 30 ? 3 : low < 45 ? 1 : 0;
    w('exercise', s.health.exercise.v < 40 ? critical : 0.1);
    w('deepRest', !ignoreSleep && s.health.sleep.v < 35 ? critical : 0);
    w('socialize', s.health.mood.v < 40 ? critical : 0);
    w('seekDoctor', s.health.sleep.v < 15 && s.flags.fatigueKnown === true ? 0.3 : 0);
  }
  const choice = pickW(rng, list);
  if (!choice) return;
  g.dispatch({ t: 'act', ...choice });
}

// ---------- 汇总与报告 ----------

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m]! : Math.round(((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2);
}

function pct(n: number, total: number): string {
  return total === 0 ? '0%' : `${(100 * n / total).toFixed(1)}%`;
}

function endingName(key: string): string {
  if (key === 'survived720') return '经营中（活到 720 天）';
  return ENDING_DEFS.find(e => e.key === key)?.name ?? key;
}

function buildReport(all: RunStats[], elapsedMs: number): string {
  const total = all.length;
  const lines: string[] = [];
  lines.push('# OPC.exe 平衡模拟报告（S9）');
  lines.push('');
  lines.push(`- 生成：2026-09-27 · ${BOTS.length} bot × ${OPENINGS.length} 开局 × ${SEEDS_PER_OPENING} 种子 = ${total} 局 · 720 天上限`);
  lines.push(`- 引擎：纯 core 无头跑（与 soak 同口径）· 总耗时 ${Math.round(elapsedMs / 1000)}s · 异常计数 ${all.reduce((a, r) => a + r.anomalies, 0)}`);
  lines.push('');
  // ---- 全体结局分布 vs 目标 ----
  const byEnding = new Map<string, number>();
  for (const r of all) {
    const k = r.endingKey ?? 'survived720';
    byEnding.set(k, (byEnding.get(k) ?? 0) + 1);
  }
  const passiveYear = all.filter(r => r.passiveWithinYear).length;
  const ord = [...byEnding.entries()].sort((a, b) => b[1] - a[1]);
  lines.push('## 一、全体结局分布 vs 目标表（设计 §十二）');
  lines.push('');
  lines.push('| 结局 | 局数 | 占比 | 备注 |');
  lines.push('|---|---|---|---|');
  for (const [k, n] of ord) lines.push(`| ${endingName(k)}（${k}） | ${n} | ${pct(n, total)} | |`);
  lines.push(`| **年内被动终局合计** | ${passiveYear} | **${pct(passiveYear, total)}** | 目标 ≈20%±5 |`);
  const burnout = byEnding.get('burnoutDown') ?? 0;
  const sudden = byEnding.get('suddenDeath') ?? 0;
  lines.push(`| 其中：过劳倒下 | ${burnout} | ${pct(burnout, total)} | 目标 5-8% |`);
  lines.push(`| 其中：猝死 | ${sudden} | ${pct(sudden, total)} | 目标 <1% |`);
  lines.push('');
  const stageReach = (n: number): number => all.filter(r => r.maxStage >= n).length;
  const mundane = all.filter(r => r.maxStage <= 3).length;
  lines.push('### 阶段到达 vs 目标');
  lines.push('');
  lines.push('| 里程碑 | 到达数 | 占比 | 目标 |');
  lines.push('|---|---|---|---|');
  lines.push(`| 平凡线（最高停留在 ②③阶段） | ${mundane} | ${pct(mundane, total)} | ≈55%±8 |`);
  lines.push(`| 成长期（最高到 ④，月 3 万+） | ${stageReach(4)} | ${pct(stageReach(4), total)} | ≈20% |`);
  lines.push(`| 自由期（最高到 ⑤，被动覆盖） | ${stageReach(5)} | ${pct(stageReach(5), total)} | ≈4%±2 |`);
  lines.push(`| 传承期/独角兽（⑥ 或 unicorn） | ${all.filter(r => r.maxStage >= 6 || r.endingKey === 'unicorn').length} | ${pct(all.filter(r => r.maxStage >= 6 || r.endingKey === 'unicorn').length, total)} | ≈1% |`);
  lines.push('');
  lines.push('> 注：bot 是策略机器人不是真人，目标表用来抓**量级失衡**（某结局 0% 或 50%），小口径偏差属正常。');
  lines.push('');
  // ---- 分 bot 表 ----
  lines.push('## 二、分 bot 明细');
  for (const spec of BOTS) {
    const runs = all.filter(r => r.bot === spec.key);
    const n = runs.length;
    const eb = new Map<string, number>();
    for (const r of runs) {
      const k = r.endingKey ?? 'survived720';
      eb.set(k, (eb.get(k) ?? 0) + 1);
    }
    const hired = runs.filter(r => r.agentsHired > 0);
    const ghost = runs.filter(r => r.ghostCompany);
    const surv = median(runs.map(r => r.endDay));
    const tokenMedian = median(runs.filter(r => r.maxMonthlyToken > 0).map(r => r.maxMonthlyToken));
    lines.push('');
    lines.push(`### ${spec.name}（${spec.key}）— ${spec.desc}`);
    lines.push('');
    lines.push('| 指标 | 值 |');
    lines.push('|---|---|');
    lines.push(`| 局数 | ${n} |`);
    lines.push(`| 存活天数中位数 | ${surv} |`);
    lines.push(`| 猝死 / 过劳倒下 | ${eb.get('suddenDeath') ?? 0} / ${eb.get('burnoutDown') ?? 0} |`);
    lines.push(`| 倦怠退场（mentalBreak）/ 破产 | ${eb.get('mentalBreak') ?? 0} / ${eb.get('bankrupt') ?? 0} |`);
    lines.push(`| 最高阶段分布 | ${[2, 3, 4, 5, 6].map(st => `S${st}:${runs.filter(r => r.maxStage === st).length}`).join(' ')} |`);
    lines.push(`| 智能体雇佣率 / 首雇中位天 | ${pct(hired.length, n)} / ${hired.length > 0 ? median(hired.map(r => r.firstHireDay)) : '—'} |`);
    lines.push(`| Token 月账单中位（有账单局） / 月账单占毛利峰值中位 | ${tokenMedian > 0 ? `¥${tokenMedian}` : '—'} / ${hired.length > 0 ? `${median(hired.map(r => Math.round(r.maxTokenGrossRatio * 100)))}%` : '—'} |`);
    lines.push(`| 幽灵公司达成 | ${ghost.length}（${pct(ghost.length, n)}） |`);
    lines.push(`| 异常计数 | ${runs.reduce((a, r) => a + r.anomalies, 0)} |`);
    lines.push('');
    lines.push('结局分布：' + [...eb.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${endingName(k)} ${v}（${pct(v, n)}）`).join(' · '));
  }
  // ---- 长线事件覆盖（任务 C.3 证据） ----
  lines.push('');
  lines.push('## 三、事件覆盖（有机触发，weekly-focus 心跳不计）');
  lines.push('');
  lines.push(`- 去重事件数：${eventFired.size} / ${EVENT_DEFS.length}`);
  lines.push('');
  lines.push('| 长线事件 | 触发局次（多次触发累计） |');
  lines.push('|---|---|');
  for (const id of ['moon-three', 'crisis-blackswan', 'platform-dependency-siren', 'gray-relay-lead', 'gray-topup-lead', 'gray-clearing-legal', 'token-burn-warning', 'heartAttackWarn', 'recovery-interrupt']) {
    lines.push(`| ${id} | ${eventFired.get(id) ?? 0} |`);
  }
  lines.push('');
  return lines.join('\n');
}

// ---------- 主流程（保留旧报告中的调参记录块） ----------

function main(): void {
  const t0 = Date.now();
  const all: RunStats[] = [];
  let done = 0;
  for (const spec of BOTS) {
    for (let oi = 0; oi < OPENINGS.length; oi++) {
      for (let seed = 1; seed <= SEEDS_PER_OPENING; seed++) {
        all.push(playOne(spec, oi, seed));
      }
    }
    done += 1;
    console.error(`[sim] ${spec.name} 完成（${done}/${BOTS.length}）`);
  }
  const elapsed = Date.now() - t0;
  let report = buildReport(all, elapsed);
  // 保留人工维护的调参记录块（每次重跑不丢历史）
  const TSTART = '<!-- TUNING-LOG-START -->';
  const TEND = '<!-- TUNING-LOG-END -->';
  if (existsSync(REPORT_PATH)) {
    const old = readFileSync(REPORT_PATH, 'utf8');
    const i = old.indexOf(TSTART);
    const j = old.indexOf(TEND);
    if (i >= 0 && j > i) {
      report += `\n${old.slice(i, j + TEND.length)}\n`;
    }
  } else {
    report += `\n${TSTART}\n## 调参记录\n\n（首轮基线，尚无调参）\n${TEND}\n`;
  }
  writeFileSync(REPORT_PATH, report, 'utf8');
  console.log(`[sim] ${all.length} 局完成，报告已写入 ${REPORT_PATH}`);
  const byEnding = new Map<string, number>();
  for (const r of all) {
    const k = r.endingKey ?? 'survived720';
    byEnding.set(k, (byEnding.get(k) ?? 0) + 1);
  }
  console.log('[sim] 全体结局分布', JSON.stringify([...byEnding.entries()].sort((a, b) => b[1] - a[1])));
}

main();
