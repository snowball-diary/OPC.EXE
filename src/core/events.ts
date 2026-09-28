// 事件引擎（技术文档 §九）——S3 真实现：Cond 求值 / 每日抽样 / 连锁种子 / System1 过滤 / 静态校验
//
// S5 数据文件（events.def.ts）写作规范：
//   EventDef.when   : Cond[]，全部通过才可被抽中（求值器 evalCond 支持全部算子，见下）
//   Cond['flag',k]  : 长度 2 = flag 存在且为真值；['flag','==',k,v] 长度 4 = 精确比较（靠元组长度区分）
//   ChoiceDef.effects: EffectKey 联合类型（cash/compliance/stress/followers.<pid>/project* 等，
//                      未知键被 applyEffects 静默忽略）；Range 值由引擎掷骰
//   chain: ChainSeed[]（EventDef 级与 ChoiceDef 级均可）：delayDays 每日 -1，到 0 且 ifCond 通过 → 入队
//   chain.event 必须指向 EVENT_DEFS 中存在的 id（validateChains 静态环检测；引用缺失由 validateWhenReachable 报）
//   choice.id 以 'ending:' 开头 = 直接终局（收购接受等），endingKey 取冒号后缀
//   心悸预警事件 id 固定 'heartAttackWarn'（hiddenFatigue≥70 时权重置顶必出，cooldown 5 天）
import { AGENT_DEFS } from '../data/agents.def';
import { EVENT_DEFS, findEventDef } from '../data/events.def';
import { findDifficulty } from '../data/openings.def';
import { PLATFORM_DEFS } from '../data/platforms.def';
import { applyEffects } from './actions';
import { grantKp, pushLog } from './state';
import type { Rng } from './rng';
import type { ChainSeed, ChoiceDef, ChoiceResult, Cond, EventDef, PendingEvent, StateSlice } from './types';

// ---------- §9.1 触发谓词 DSL（结构化，禁 eval） ----------

/** 递归判别式联合求值；rng 供 ['random','<',p] 使用（缺省退化 Math.random，引擎内始终传入） */
export function evalCond(s: StateSlice, c: Cond, rng?: Rng): boolean {
  switch (c[0]) {
    case 'stage': return s.meta.stage >= c[2];
    case 'cash': return s.cash < c[2];
    case 'flag': {
      if (c.length === 2) {
        const v = s.flags[c[1]];
        return v !== undefined && v !== false && v !== 0; // 存在且为真值
      }
      const k = c[2];
      return s.flags[k] === c[3]; // 精确比较
    }
    case 'stress': return s.stress >= c[2];
    case 'energy': return s.energy <= c[2];
    case 'platform': return (s.platforms[c[1]]?.banRisk ?? 0) >= c[3];
    case 'agent': return s.agents.some(a => a.id === c[1]);
    case 'project': return s.projects.some(p => p.alive && p.mrr < c[2]);
    case 'projectCount': return s.projects.filter(p => p.alive).length >= c[2];
    case 'gray': return (s.flags.grayHistory === true) === c[1];
    case 'and': return c[1].every(x => evalCond(s, x, rng));
    case 'or': return c[1].some(x => evalCond(s, x, rng));
    case 'not': return !evalCond(s, c[1], rng);
    case 'random': return rng ? rng.chance(c[2]) : Math.random() < c[2];
    case 'day': return s.meta.day >= c[2];
    case 'monthPhase': return s.economyPhase === c[1];
    default: return false;
  }
}

// ---------- §9.2 抽样与队列 ----------

export const BASE_EVENT_CHANCE = 0.35; // 每日基础触发率，×难度 eventFrequency
const HEART_WARN_ID = 'heartAttackWarn';
const HEART_WARN_COOLDOWN = 5;

/** 每日 0-1 条：连锁先到期 → 心悸预警置顶必出 → 难度触发率 → 八类池 weight 加权抽 1 */
export function rollEvents(s: StateSlice, rng: Rng): PendingEvent[] {
  if (s.meta.over) return [];
  const out: PendingEvent[] = [];
  out.push(...tickChains(s, rng));
  // 心悸预警（猝死链前置 §7.3）：hiddenFatigue≥70 且 cooldown 到期 → 置顶必出，当日不再抽其他
  if (s.health.hiddenFatigue >= 70) {
    const ev = enqueueEvent(s, HEART_WARN_ID, 'forced', { cooldownDays: HEART_WARN_COOLDOWN });
    if (ev) return [...out, ev];
  }
  const freq = findDifficulty(s.meta.difficulty)?.eventFrequency ?? 1;
  if (!rng.chance(Math.min(1, BASE_EVENT_CHANCE * freq))) return out;
  const picked = pickWeighted(s, rng);
  if (!picked) return out;
  const ev = enqueueEvent(s, picked.id, 'sample', { once: picked.once === true, cooldownDays: picked.cooldownDays ?? 0 });
  return ev ? [...out, ev] : out;
}

/** 八类池过滤（[S9] 改：random 条件独立掷点，与加权抽样解耦）
 *  旧实现：['random','<',p] 与普通 when 一起求值一次，通过后还要再跟全部候选拼 weight 抽样——
 *  名义命中率 p 被抽样竞争二次稀释（如黑天鹅 3% 实测远低于 3%/抽样日），长线事件几乎见不到。
 *  现拆两层：
 *  ① 普通条件全过 + random 条件**独立掷点全中** → 进直通池，按 weight 在直通池内抽 1（不再与全池竞争）；
 *  ② 直通池为空 → 在无 random 门槛的事件里按 weight 抽 1（原行为）。
 *  moon-three / recovery-interrupt / weekly-focus 的 when=[random<0] 依旧恒假，永不入抽样池（forced 专用）。
 *  evalCond 语义未动（连锁 ifCond / 校验器仍走原路径），改动仅限抽样层。 */
interface WhenParts { base: Cond[]; probs: number[] }
const whenCache = new Map<string, WhenParts>();
function whenParts(def: EventDef): WhenParts {
  const hit = whenCache.get(def.id);
  if (hit) return hit;
  const base: Cond[] = [];
  const probs: number[] = [];
  for (const c of def.when) {
    if (c[0] === 'random') probs.push(c[2]);
    else base.push(c);
  }
  const parts = { base, probs };
  whenCache.set(def.id, parts);
  return parts;
}

function pickWeighted(s: StateSlice, rng: Rng): EventDef | null {
  const friendliness = findDifficulty(s.meta.difficulty)?.eventFriendliness ?? 1;
  const pool: { def: EventDef; w: number }[] = [];
  const direct: { def: EventDef; w: number }[] = [];
  for (const def of EVENT_DEFS) {
    if (def.once === true && s.flags[`ev_once_${def.id}`] === true) continue; // once 查询侧
    const cd = def.cooldownDays ?? 0;
    if (cd > 0) {
      const last = s.flags[`ev_last_${def.id}`];
      if (typeof last === 'number' && s.meta.day - last < cd) continue; // cooldown 查询侧
    }
    const parts = whenParts(def);
    if (!parts.base.every(c => evalCond(s, c, rng))) continue;
    let w = Math.max(0, def.weight);
    if ((def.cat === 'crisis' || def.cat === 'health') && friendliness > 0) w /= friendliness; // 难度越狠负面越凶
    if (w <= 0) continue;
    if (parts.probs.length > 0) {
      if (!parts.probs.every(p => rng.chance(p))) continue; // 独立掷点：命中即入直通池
      direct.push({ def, w });
    } else {
      pool.push({ def, w });
    }
  }
  const pickFrom = (list: { def: EventDef; w: number }[]): EventDef | null => {
    if (list.length === 0) return null;
    const total = list.reduce((a, x) => a + x.w, 0);
    let u = rng.next() * total;
    for (const x of list) {
      u -= x.w;
      if (u < 0) return x.def;
    }
    return list[list.length - 1]?.def ?? null;
  };
  return pickFrom(direct) ?? pickFrom(pool);
}

// ---------- 选项结算 ----------

/** 应用选项 effects（复用 applyEffects）→ 埋 chain → 标记已决 → 结果文案与终局触发 */
export function resolveChoice(s: StateSlice, ev: EventDef, choiceIdx: number, rng: Rng): ChoiceResult {
  const choice = ev.choices[choiceIdx];
  if (!choice) return { ok: false, msg: '无效选项', eventId: ev.id };
  applyEffects(s, choice.effects, { rng });
  for (const seed of [...(ev.chain ?? []), ...(choice.chain ?? [])]) {
    s.pending.chains.push({ event: seed.event, delayDays: Math.max(0, seed.delayDays), ifCond: seed.ifCond });
  }
  resolveEvent(s, ev.id);
  let ending: string | undefined;
  if (choice.id.startsWith('ending:')) {
    ending = choice.id.slice('ending:'.length);
    s.meta.over = true;
    s.meta.endingKey = ending;
    if (!s.stats.endingsSeen.includes(ending)) s.stats.endingsSeen.push(ending);
    pushLog(s, `【终局】${choice.results}`, 'gold');
  }
  pushLog(s, `【${ev.title}】${choice.results}`, ending ? 'gold' : 'sys');
  if (ev.oldZhang) pushLog(s, `老张：「${ev.oldZhang}」`, 'purple');
  return { ok: true, msg: choice.results, ending, eventId: ev.id };
}

// ---------- §9.3 连锁种子 ----------

/** delayDays 每日 -1；==0 且 ifCond 通过 → 入事件池（dist: 前缀条目归平台引擎，跳过） */
export function tickChains(s: StateSlice, rng: Rng): PendingEvent[] {
  const out: PendingEvent[] = [];
  const keep: ChainSeed[] = [];
  for (const seed of s.pending.chains) {
    if (seed.event.startsWith('dist:')) {
      keep.push(seed);
      continue;
    }
    seed.delayDays -= 1;
    if (seed.delayDays > 0) {
      keep.push(seed);
      continue;
    }
    if (!(seed.ifCond ?? []).every(c => evalCond(s, c, rng))) continue; // 条件不满足：连锁断掉
    const def = findEventDef(seed.event);
    const ev = enqueueEvent(s, seed.event, 'chain', def ? { once: def.once === true, cooldownDays: def.cooldownDays ?? 0 } : {});
    if (ev) out.push(ev);
  }
  s.pending.chains = keep;
  return out;
}

// ---------- System1 选项过滤（渲染层直接调用，§5.2/§9.2） ----------

/**
 * 三规则：①非 System2 时 requires:'system2' 的选项剔除
 *        ②非 System2 时 s1Variant 替换文案
 *        ③system1Deep 强制无"取消"（id/label 含 取消|cancel 的选项剔除）
 */
export function filterChoicesForUI(s: StateSlice, ev: EventDef): ChoiceDef[] {
  const mode = s.decisionMode;
  const out: ChoiceDef[] = [];
  for (const c of ev.choices) {
    if (mode !== 'system2' && c.requires === 'system2') continue;
    if (mode === 'system1Deep' && /取消|cancel/i.test(`${c.id} ${c.label}`)) continue;
    out.push(mode !== 'system2' && c.s1Variant ? { ...c, label: c.s1Variant } : c);
  }
  return out;
}

// ---------- 静态校验（S5 数据入库 / S9 平衡模拟用） ----------

/** 连锁 DAG 环检测：EventDef.chain + ChoiceDef.chain 构边，三色 DFS，返回闭环描述（空数组=通过） */
export function validateChains(defs: EventDef[]): string[] {
  const ids = new Set(defs.map(d => d.id));
  const edges = new Map<string, string[]>();
  for (const d of defs) {
    edges.set(d.id, [...(d.chain ?? []), ...d.choices.flatMap(c => c.chain ?? [])]
      .filter(t => !t.event.startsWith('dist:'))
      .map(t => t.event));
  }
  const color = new Map<string, 0 | 1 | 2>();
  const path: string[] = [];
  const errors: string[] = [];
  const dfs = (id: string): void => {
    color.set(id, 1);
    path.push(id);
    for (const t of edges.get(id) ?? []) {
      if (!ids.has(t)) continue;
      const c = color.get(t) ?? 0;
      if (c === 1) {
        const start = path.indexOf(t);
        errors.push(`连锁闭环：${[...path.slice(start), t].join(' -> ')}`);
      } else if (c === 0) {
        dfs(t);
      }
    }
    path.pop();
    color.set(id, 2);
  };
  for (const d of defs) if ((color.get(d.id) ?? 0) === 0) dfs(d.id);
  return errors;
}

/**
 * when 可达性简化校验：引用的 agent/平台 id 必须存在于 defs 表；
 * flag 需属于已知引擎落账清单（否则提示 S5 确认来源）；chain 目标必须存在；weight>0；choices 非空。
 */
const KNOWN_FLAGS = new Set([
  'grayHistory', 'heartAttackWarn', 'cryptoOn', 'privateDomain', 'homophone',
  'taxCurrent', 'selfBookkeeping', 'ghostCompany', 'ordersChannel', 'aiSub', 'insured'
]);

export function validateWhenReachable(defs: EventDef[]): string[] {
  const warns: string[] = [];
  const agentIds = new Set(AGENT_DEFS.map(a => a.id));
  const platformIds = new Set(PLATFORM_DEFS.map(p => p.id));
  const eventIds = new Set(defs.map(d => d.id));
  const walk = (owner: string, c: Cond): void => {
    switch (c[0]) {
      case 'and':
      case 'or':
        for (const x of c[1]) walk(owner, x);
        break;
      case 'not':
        walk(owner, c[1]);
        break;
      case 'agent':
        if (!agentIds.has(c[1])) warns.push(`${owner}: when 引用未知智能体「${c[1]}」`);
        break;
      case 'platform':
        if (!platformIds.has(c[1])) warns.push(`${owner}: when 引用未知平台「${c[1]}」`);
        break;
      case 'flag': {
        const k = c.length === 2 ? c[1] : c[2];
        if (!KNOWN_FLAGS.has(k) && !k.startsWith('ev_')) {
          warns.push(`${owner}: when 引用 flag「${k}」无已知引擎来源（确认由事件 effects 或引擎落账）`);
        }
        break;
      }
      default: break; // 标量谓词（stage/cash/stress/…）恒可满足
    }
  };
  for (const d of defs) {
    for (const c of d.when) walk(d.id, c);
    if (d.choices.length === 0) warns.push(`${d.id}: 没有任何选项（事件不可决）`);
    if (d.weight <= 0) warns.push(`${d.id}: weight<=0，永远不会被抽中`);
    for (const seed of [...(d.chain ?? []), ...d.choices.flatMap(c => c.chain ?? [])]) {
      if (!seed.event.startsWith('dist:') && !eventIds.has(seed.event)) {
        warns.push(`${d.id}: chain 引用了不存在的事件「${seed.event}」`);
      }
      if (seed.delayDays < 0) warns.push(`${d.id}: chain 延迟为负（${seed.delayDays}）`);
    }
  }
  return warns;
}

// ---------- 入队记账（S2 已实现，原样保留） ----------

/** [S8] 事件 → 知识点词条投递表：事件首次入队时把对应 KP 压入 pending.kpQueue（UI 弹窗消费） */
const KP_BY_EVENT: Record<string, string> = {
  heartAttackWarn: 'hiddenFatigue',
  'heart-attack': 'fireLine',
  aiUndeclared: 'aiDeclare',
  'token-burn-warning': 'tokenEcon',
  'moon-three': 'pmf',
  'recovery-interrupt': 'recovery',
  'crisis-ai-crackdown': 'platformRisk',
  'gray-relay-lead': 'relay',
  'gray-relay-scale': 'relay',
  'gray-topup-lead': 'topup',
  'gray-clearing-legal': 'moralValue',
  'gray-clearing-audit': 'moralValue'
};

/**
 * 入队待处理事件（去重 / once / cooldown 记账）。
 * once → flags.ev_once_{id}；cooldown → flags.ev_last_{id} 记录入队日。
 * [S8] 命中 KP_BY_EVENT 的词条随事件投递（grantKp 幂等，flags['kp_'+key] 持久记账）。
 */
export function enqueueEvent(
  s: StateSlice,
  id: string,
  source: PendingEvent['source'],
  opts: { once?: boolean; cooldownDays?: number } = {}
): PendingEvent | null {
  if (s.pending.events.some(e => e.id === id && !e.resolved)) return null; // 去重：同 id 未决
  if (opts.once === true && s.flags[`ev_once_${id}`] === true) return null;
  const cd = opts.cooldownDays ?? 0;
  if (cd > 0) {
    const last = s.flags[`ev_last_${id}`];
    if (typeof last === 'number' && s.meta.day - last < cd) return null;
  }
  const pe: PendingEvent = { id, day: s.meta.day, source, resolved: false };
  s.pending.events.push(pe);
  s.flags[`ev_last_${id}`] = s.meta.day;
  if (opts.once === true) s.flags[`ev_once_${id}`] = true;
  const kp = KP_BY_EVENT[id];
  if (kp) grantKp(s, kp);
  return pe;
}

/** 标记事件已决（弹窗结算后由 UI/引擎调用） */
export function resolveEvent(s: StateSlice, id: string): void {
  const e = s.pending.events.find(x => x.id === id && !x.resolved);
  if (e) e.resolved = true;
}
