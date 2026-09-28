// 状态切片：初始化 / 钳制 / 不变量（技术文档 §四 末）
// createInitialSlice 应用七维开局；init 效果只落「简单数值键」，
// contacts/assets 等「世界生成类」效果留给 S2+ 引擎解释（见 applyInitEffects 分支注释）。
import {
  findBackground, findDifficulty, findNiche, findPersonality, findTalent
} from '../data/openings.def';
import { findLocation } from '../data/locations.def';
import { createRng } from './rng';
import { recalcLiving } from './economy'; // [S2] 修正 S1 的生活费基数 1000 → 8000（LIVING_BASE）
import type {
  EconomyPhase, Effect, EntityForm, LogEntry, PlatformAccount, SetupConfig, SkillDim,
  SkillLevel, StateSlice
} from './types';

export const SCHEMA_VERSION = 1;

const SKILL_DIMS: readonly SkillDim[] = ['craft', 'expression', 'marketing', 'operation', 'business'];

function isSkillDim(x: string): x is SkillDim {
  return (SKILL_DIMS as readonly string[]).includes(x);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(100, n));
}

const clamp = clamp01;

function clampInt(n: number, min: number, max: number): number {
  return Math.round(Math.max(min, Math.min(max, n)));
}

/** 初始化专用效果落地；Range 值取均值（开局不掷骰） */
function applyInitEffects(s: StateSlice, effects: readonly Effect[]): void {
  for (const e of effects) {
    const val = typeof e.v === 'number' ? e.v : (e.v[0] + e.v[1]) / 2;
    const k: string = e.k;
    if (k.startsWith('skillLevel.')) {
      const dim = k.slice('skillLevel.'.length);
      if (!isSkillDim(dim)) continue;
      const cur: number = s.skills[dim];
      const next = e.op === '=' ? val : e.op === '*' ? cur * val : cur + val;
      s.skills[dim] = clampInt(next, 0, 4) as SkillLevel;
    } else if (k.startsWith('skillExp.')) {
      const dim = k.slice('skillExp.'.length);
      if (!isSkillDim(dim)) continue;
      const cur = s.skillExp[dim];
      s.skillExp[dim] = e.op === '=' ? val : e.op === '*' ? cur * val : cur + val;
    } else if (k.startsWith('followers.')) {
      const pid = k.slice('followers.'.length);
      const acc = ensurePlatform(s, pid);
      acc.followers = e.op === '=' ? Math.max(0, val) : Math.max(0, acc.followers + val);
    } else {
      switch (k) {
        case 'cash': s.cash = e.op === '=' ? val : s.cash + val; break;
        case 'debt': s.debt = e.op === '=' ? val : s.debt + val; break;
        case 'energy': s.energy = clamp(e.op === '=' ? val : s.energy + val); break;
        case 'stress': s.stress = clamp(e.op === '=' ? val : s.stress + val); break;
        case 'info': s.info = clamp(e.op === '=' ? val : s.info + val); break;
        case 'cognition': s.cognition = clamp(e.op === '=' ? val : s.cognition + val); break;
        case 'character': s.character = clamp(e.op === '=' ? val : s.character + val); break;
        case 'morality': s.morality = clamp(e.op === '=' ? val : s.morality + val); break;
        case 'compliance': s.compliance = clamp(e.op === '=' ? val : s.compliance + val); break;
        case 'creditScore': s.creditScore = clampInt(e.op === '=' ? val : s.creditScore + val, 0, 1000); break;
        case 'sleep': s.health.sleep.v = clamp(e.op === '=' ? val : s.health.sleep.v + val); break;
        case 'mood': s.health.mood.v = clamp(e.op === '=' ? val : s.health.mood.v + val); break;
        case 'diet': s.health.diet.v = clamp(e.op === '=' ? val : s.health.diet.v + val); break;
        case 'exercise': s.health.exercise.v = clamp(e.op === '=' ? val : s.health.exercise.v + val); break;
        // 以下为引擎期语义（世界生成/复合量），初始化不落地，交由 S2+ 处理：
        // contacts/assetAdd/rep/influence/power/autoLevel/tokenBill/attentionCap/ap/
        // hiddenFatigue/burnoutCount/healthWhole/project*/deliveries.*
        default: break;
      }
    }
  }
}

function ensurePlatform(s: StateSlice, pid: string): PlatformAccount {
  let acc = s.platforms[pid];
  if (!acc) {
    acc = { state: 'observe', observeDaysLeft: 30, followers: 0, aiDeclared: false, banRisk: 0, incomeShare: 0 };
    s.platforms[pid] = acc;
  }
  return acc;
}

/** 七维开局 → 初始状态切片（技术文档 §四/§5.1；设计方案 §十三） */
export function createInitialSlice(setup: SetupConfig): StateSlice {
  const niche = findNiche(setup.niche);
  if (!niche) throw new Error(`UNKNOWN_NICHE: ${setup.niche}`);
  const bg = findBackground(setup.background);
  if (!bg) throw new Error(`UNKNOWN_BACKGROUND: ${setup.background}`);
  const loc = findLocation(setup.location);
  if (!loc) throw new Error(`UNKNOWN_LOCATION: ${setup.location}`);
  const diff = findDifficulty(setup.difficulty);
  if (!diff) throw new Error(`UNKNOWN_DIFFICULTY: ${setup.difficulty}`);
  const talents = setup.talents.map(findTalent);
  if (talents.some(t => !t)) throw new Error('UNKNOWN_TALENT');
  const axes = (['pragmaticIdeal', 'steadyAggressive', 'soloSocial'] as const).map(a => findPersonality(setup.personality[a]));
  if (axes.some(p => !p)) throw new Error('UNKNOWN_PERSONALITY');

  // 本体五元基线
  const health = {
    sleep: { v: 70, drift: -8 },   // §5.1 漂移：sleep -8
    mood: { v: 70, drift: -2 },    // mood -2 + 压力溢出/10（溢出项引擎加）[S9] -3→-2：低情绪 wobble→中断链过密（sim 实证）
    diet: { v: 70, drift: -5 },    // diet -5
    exercise: { v: 70, drift: -6 },// exercise -6
    hiddenFatigue: 0
  };

  const skills: Record<SkillDim, SkillLevel> = { craft: 0, expression: 0, marketing: 0, operation: 0, business: 0 };
  const skillExp: Record<SkillDim, number> = { craft: 0, expression: 0, marketing: 0, operation: 0, business: 0 };
  const deliveries: Record<SkillDim, number> = { craft: 0, expression: 0, marketing: 0, operation: 0, business: 0 };
  for (const [dim, lv] of Object.entries(bg.skills)) {
    if (isSkillDim(dim) && typeof lv === 'number') skills[dim] = lv as SkillLevel;
  }
  for (const [dim, lv] of Object.entries(niche.startSkills ?? {})) {
    if (isSkillDim(dim) && typeof lv === 'number') skills[dim] = Math.max(skills[dim], lv) as SkillLevel;
  }

  // 现金 = 背景基数 × 难度倍率；月生活费 = LIVING_BASE(8000) × 地点系数 × 难度系数（§6 按月扣，日折算=/30）
  const cash = Math.round(bg.baseCash * diff.cashMult);

  const s: StateSlice = {
    meta: { day: 1, week: 1, month: 1, year: 1, stage: 1, over: false, seedState: createRng(setup.seed).getState(), schemaVersion: SCHEMA_VERSION, difficulty: diff.id },
    health,
    info: 30,
    cognition: 20,
    character: 50,
    skills,
    skillExp,
    deliveries,
    assets: [],
    contacts: [],
    power: 0,
    influence: 0,
    rep: 0,
    cash,
    energy: 100,
    ap: 3,
    attentionCap: 1,
    stress: 10,
    morality: 50,
    compliance: 70,
    creditScore: 600,
    location: loc.id,
    economyPhase: 'recovery' as EconomyPhase,
    entity: 'none' as EntityForm,
    platforms: {},
    projects: [],
    agents: [],
    autoLevel: 0,
    osRules: [],
    tokenBill: { lastMonth: 0, priceIndex: 1 },
    portfolio: { cash: 0, fund: 0, bond: 0, indexFund: 0, stock: 0, crypto: 0, realEstate: 0 },
    debt: 0,
    runway: 0,
    monthlyIncome: 0,
    monthlyExpense: 0, // [S2] 由 recalcLiving 落账（下方调用）
    decisionMode: 'system2',
    dayType: 'standard',
    burnoutCount: 0,
    hardStreakDays: 0,
    suddenDeathRisk: 0,
    focus: null,
    log: [
      { day: 1, msg: 'OPC.exe by 赖嘉诚 启动。你的第一家公司，是你自己。', cls: 'gold' },
      { day: 1, msg: `开局：${niche.name} × ${bg.name} × ${loc.name} · 难度「${diff.name}」`, cls: 'sys' },
      { day: 1, msg: bg.hiddenText, cls: 'purple' }
    ],
    stats: {
      totalRevenue: 0, totalExpense: 0, taxesPaid: 0, tokenSpent: 0,
      orders: 0, contentPublished: 0, projectsDone: 0, projectsFailed: 0, pivots: 0,
      daysWorkedOut: 0, minDays: 0, s1Days: 0, healthBadDays: 0,
      maxCash: cash, maxRunway: 0,
      grayDeals: 0, audits: 0, accidents: 0, contactsMade: 0,
      followersPeak: 0, bigHits: 0, eventsSeen: 0, patchesInstalled: 0, agentsHired: 0,
      endingsSeen: []
    },
    pending: { events: [], chains: [], kpQueue: [] },
    newsSeen: 0,
    flags: {}
  };

  // crypto 默认开启（09-28 裁决）；开关落 flags
  s.flags.cryptoOn = setup.cryptoOn;

  // 七维 flags 落账
  for (const f of [...niche.flags, ...bg.flags]) s.flags[f] = true;
  for (const t of talents) {
    if (!t) continue;
    for (const f of t.flags) s.flags[f] = true;
  }
  for (const p of axes) {
    if (!p) continue;
    for (const f of p.flags) s.flags[f] = true;
  }

  // 效果落地顺序：背景 → 赛道 → 特质 → 性格（同键后写覆盖 '=' 类）
  applyInitEffects(s, bg.effects);
  applyInitEffects(s, niche.effects);
  for (const t of talents) if (t) applyInitEffects(s, t.effects);
  for (const p of axes) if (p) applyInitEffects(s, p.effects);

  clampAll(s);
  recalcLiving(s); // [S2] init 月生活费统一走经济引擎（修正基数 1000 → 8000）
  s.runway = computeRunway(s);
  s.stats.maxCash = Math.max(s.stats.maxCash, s.cash);
  return s;
}

/** 统一日志写入（cap 300 条；core 各模块共用） */
export function pushLog(s: StateSlice, msg: string, cls: LogEntry['cls'] = 'sys'): LogEntry {
  const e: LogEntry = { day: s.meta.day, msg, cls };
  s.log.push(e);
  if (s.log.length > 300) s.log.splice(0, s.log.length - 300);
  return e;
}

/**
 * [S8] KP 知识点持久记账：flags['kp_'+key]=true（存档携带，跨会话点亮图鉴）。
 * deliver=true 时把 key 压入 pending.kpQueue（UI 弹窗队列消费处 → main.ts onEndDay）；
 * deliver=false 仅记「已读」（图鉴页主动展开用）。幂等：已记账直接返回。
 */
export function grantKp(s: StateSlice, key: string, deliver = true): void {
  if (s.flags[`kp_${key}`] === true) return;
  s.flags[`kp_${key}`] = true;
  if (deliver && !s.pending.kpQueue.includes(key)) s.pending.kpQueue.push(key);
}

function computeRunway(s: StateSlice): number {
  if (s.monthlyExpense <= 0) return 99;
  return Math.round((Math.max(0, s.cash) / s.monthlyExpense) * 10) / 10;
}

/** 全条目钳制（就地修改并返回同引用；dev 模式每次 dispatch 后由引擎调用） */
export function clampAll(s: StateSlice): StateSlice {
  s.health.sleep.v = clamp(s.health.sleep.v);
  s.health.mood.v = clamp(s.health.mood.v);
  s.health.diet.v = clamp(s.health.diet.v);
  s.health.exercise.v = clamp(s.health.exercise.v);
  s.health.hiddenFatigue = clamp(s.health.hiddenFatigue);
  s.info = clamp(s.info);
  s.cognition = clamp(s.cognition);
  s.character = clamp(s.character);
  s.energy = clamp(s.energy);
  s.stress = clamp(s.stress);
  s.morality = clamp(s.morality);
  s.compliance = clamp(s.compliance);
  s.autoLevel = clamp(s.autoLevel);
  if (typeof s.rep !== 'number') s.rep = 0;
  else s.rep = clamp(s.rep);
  s.creditScore = clampInt(s.creditScore, 0, 1000);
  s.ap = clampInt(s.ap, 0, 8);
  s.debt = Math.max(0, s.debt);
  s.cash = Math.round(s.cash);
  for (const dim of SKILL_DIMS) {
    s.skills[dim] = clampInt(s.skills[dim], 0, 4) as SkillLevel;
    s.skillExp[dim] = Math.max(0, s.skillExp[dim]);
    s.deliveries[dim] = Math.max(0, s.deliveries[dim]);
  }
  for (const c of s.contacts) c.relation = clamp(c.relation);
  for (const a of s.agents) {
    a.trust = clamp(a.trust);
    a.usageScale = Math.max(0, a.usageScale);
  }
  for (const p of s.projects) {
    p.progress = clamp(p.progress);
    p.quality = clamp(p.quality);
    p.pmfTrue = clamp(p.pmfTrue);
    p.risk = clamp(p.risk);
    p.maintenance = clamp(p.maintenance);
    p.pmfEstimate.v = clamp(p.pmfEstimate.v);
    p.pmfEstimate.noise = clamp(p.pmfEstimate.noise);
    p.users = Math.max(0, p.users);
    p.mrr = Math.max(0, p.mrr);
  }
  for (const pid of Object.keys(s.platforms)) {
    const acc = s.platforms[pid];
    if (!acc) continue;
    acc.followers = Math.max(0, acc.followers);
    acc.banRisk = clamp(acc.banRisk);
    acc.incomeShare = Math.max(0, Math.min(1, acc.incomeShare));
    acc.observeDaysLeft = Math.max(0, acc.observeDaysLeft);
  }
  const port = s.portfolio;
  for (const key of Object.keys(port) as (keyof typeof port)[]) {
    port[key] = Math.max(0, Math.round(port[key]));
  }
  s.tokenBill.priceIndex = Math.max(0.1, s.tokenBill.priceIndex);
  s.tokenBill.lastMonth = Math.max(0, s.tokenBill.lastMonth);
  return s;
}

/** 不变量检查（技术文档 §四 末），返回违规清单；空数组=通过 */
export function assertInvariants(s: StateSlice): string[] {
  const v: string[] = [];
  const in01 = (n: number) => n >= 0 && n <= 100;
  if (s.meta.schemaVersion !== SCHEMA_VERSION) v.push('schemaVersion≠1');
  if (s.meta.stage < 1 || s.meta.stage > 6) v.push('stage 越界');
  if (!in01(s.energy)) v.push('energy 越界');
  if (!in01(s.stress)) v.push('stress 越界');
  if (!in01(s.morality) || !in01(s.compliance) || !in01(s.autoLevel)) v.push('0-100 条目越界');
  if (!in01(s.health.hiddenFatigue)) v.push('hiddenFatigue 越界');
  for (const key of ['sleep', 'mood', 'diet', 'exercise'] as const) {
    if (!in01(s.health[key].v)) v.push(`health.${key} 越界`);
  }
  if (!Number.isFinite(s.cash)) v.push('cash 非有限数');
  if (s.debt < 0) v.push('debt 为负');
  if (s.ap < 0) v.push('ap 为负');
  if (s.attentionCap < 1) v.push('attentionCap<1');
  const alive = s.projects.filter(p => p.alive).length;
  if (alive > s.attentionCap) v.push(`存活项目 ${alive} 超注意力槽 ${s.attentionCap}`);
  for (const a of s.agents) if (!in01(a.trust)) v.push(`agent ${a.id} trust 越界`);
  if (s.tokenBill.priceIndex <= 0) v.push('priceIndex≤0');
  if (s.monthlyExpense < 0) v.push('monthlyExpense 为负');
  if (s.burnoutCount > 3) v.push('burnoutCount>3（应已终局）');
  if (s.meta.over && !s.meta.endingKey) v.push('over=true 但缺 endingKey');
  return v;
}

export { SKILL_DIMS };
