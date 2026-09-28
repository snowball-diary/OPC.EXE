// S3 验收测试：Cond 求值 / 事件抽样（once·cooldown·心悸置顶）/ 连锁 / System1 过滤 /
// 智能体（雇佣·Token 账单·trust·事故·幽灵公司·单位经济）/ 平台（observe·大爆小爆·封号·依赖·一鱼八吃）/ 灰产标记 / 静态校验
import { describe, expect, it } from 'vitest';
import { createInitialSlice } from '../src/core/state';
import { assertInvariants } from '../src/core/state';
import { createRng, type Rng } from '../src/core/rng';
import { createProject } from '../src/core/projects';
import { advanceDay } from '../src/core/time';
import { hireAgent, monthlyTokenBill, tickAgentsDay, unitEconomics, autoLevelScore } from '../src/core/agents';
import {
  banChance, banRiskRoll, computeIncomeShares, distributeContent, ensureAccount,
  platformDependency, plTier, privateDomainRate, publishContent, rollPlatformDay, stateFlowMult
} from '../src/core/platforms';
import {
  enqueueEvent, evalCond, filterChoicesForUI, resolveChoice, rollEvents,
  tickChains, validateChains, validateWhenReachable
} from '../src/core/events';
import { EVENT_DEFS, findEventDef } from '../src/data/events.def';
import { AGENT_DEFS, findAgent } from '../src/data/agents.def';
import { PLATFORM_DEFS } from '../src/data/platforms.def';
import type { EventDef, SetupConfig, StateSlice } from '../src/core/types';

const PERS = { pragmaticIdeal: 'pragmatic', steadyAggressive: 'steady', soloSocial: 'solo' } as const;

function setup(over: Partial<SetupConfig> = {}): SetupConfig {
  return {
    niche: 'dev', background: 'grass', location: 'hangcheng', difficulty: 'normal',
    talents: [], personality: { ...PERS }, cryptoOn: true, seed: 42, ...over
  };
}

const fresh = (over: Partial<SetupConfig> = {}) => createInitialSlice(setup(over));

/** 有现金有阶段的就绪态（智能体/平台用） */
function ready(): StateSlice {
  const s = fresh();
  s.meta.stage = 3;
  s.cash = 999999;
  return s;
}

/** 在 max 个种子内找到使 fn(s, rng) 满足 pred 的种子（找不到则测试失败） */
function findSeed(s: StateSlice, fn: (s: StateSlice, rng: Rng) => unknown, pred: (r: unknown) => boolean, max = 500): number {
  for (let seed = 1; seed <= max; seed++) {
    const r = fn(s, createRng(seed));
    if (pred(r)) return seed;
  }
  throw new Error('500 个种子内未找到满足条件的结果');
}

// ============================================================
// 一、Cond 求值器（全算子）
// ============================================================

describe('evalCond：结构化判别式联合（§9.1）', () => {
  it('全算子求值正确；flag 长度 2/4 两种形态区分', () => {
    const s = fresh();
    s.flags.married = true;
    s.flags.level = 3;
    const rng = createRng(1);
    // 标量谓词
    expect(evalCond(s, ['stage', '>=', 2])).toBe(false);
    s.meta.stage = 2;
    expect(evalCond(s, ['stage', '>=', 2])).toBe(true);
    expect(evalCond(s, ['cash', '<', 1000])).toBe(false);
    s.cash = 500;
    expect(evalCond(s, ['cash', '<', 1000])).toBe(true);
    expect(evalCond(s, ['stress', '>=', 60])).toBe(false);
    s.stress = 60;
    expect(evalCond(s, ['stress', '>=', 60])).toBe(true);
    expect(evalCond(s, ['energy', '<=', 30])).toBe(false);
    s.energy = 30;
    expect(evalCond(s, ['energy', '<=', 30])).toBe(true);
    expect(evalCond(s, ['day', '>=', 5])).toBe(false);
    s.meta.day = 5;
    expect(evalCond(s, ['day', '>=', 5])).toBe(true);
    expect(evalCond(s, ['monthPhase', 'boom'])).toBe(false);
    s.economyPhase = 'boom';
    expect(evalCond(s, ['monthPhase', 'boom'])).toBe(true);
    // flag：长度 2 = 存在且真值；长度 4 = 精确比较
    expect(evalCond(s, ['flag', 'married'])).toBe(true);
    expect(evalCond(s, ['flag', 'nope'])).toBe(false);
    s.flags.zero = 0;
    expect(evalCond(s, ['flag', 'zero'])).toBe(false); // 0 非真值
    expect(evalCond(s, ['flag', '==', 'level', 3])).toBe(true);
    expect(evalCond(s, ['flag', '==', 'level', 4])).toBe(false);
    expect(evalCond(s, ['flag', '==', 'married', true])).toBe(true);
    expect(evalCond(s, ['flag', '==', 'married', false])).toBe(false);
    // world 谓词
    expect(evalCond(s, ['platform', 'xhs', 'banRisk>=', 50])).toBe(false);
    ensureAccount(s, 'xhs').banRisk = 50;
    expect(evalCond(s, ['platform', 'xhs', 'banRisk>=', 50])).toBe(true);
    expect(evalCond(s, ['agent', 'support'])).toBe(false);
    s.meta.stage = 3; // support 解锁阶段
    s.cash = 99999; // 部署费够（前面断言把现金压到了 500）
    hireAgent(s, 'support', rng);
    expect(evalCond(s, ['agent', 'support'])).toBe(true);
    expect(evalCond(s, ['project', 'mrr<', 100])).toBe(false);
    expect(evalCond(s, ['projectCount', '>=', 2])).toBe(false);
    s.attentionCap = 5; // 默认槽 1，扩容以便造两个项目
    createProject(s, '甲', 'saas', 'subscription', rng);
    expect(evalCond(s, ['project', 'mrr<', 100])).toBe(true);
    createProject(s, '乙', 'saas', 'subscription', rng);
    expect(evalCond(s, ['projectCount', '>=', 2])).toBe(true);
    // gray
    expect(evalCond(s, ['gray', false])).toBe(true);
    s.flags.grayHistory = true;
    expect(evalCond(s, ['gray', false])).toBe(false);
    expect(evalCond(s, ['gray', true])).toBe(true);
    // 组合（现金此时为 99999）
    expect(evalCond(s, ['and', [['stage', '>=', 2], ['cash', '<', 100000]]])).toBe(true);
    expect(evalCond(s, ['or', [['stage', '>=', 6], ['cash', '<', 100]]])).toBe(false);
    expect(evalCond(s, ['not', ['cash', '<', 100000]])).toBe(false);
    // random：<0 恒假，<1 恒真
    expect(evalCond(s, ['random', '<', 0], rng)).toBe(false);
    expect(evalCond(s, ['random', '<', 1], rng)).toBe(true);
  });
});

// ============================================================
// 二、事件抽样：权重 / once / cooldown / 心悸置顶
// ============================================================

describe('rollEvents：抽样与队列（§9.2）', () => {
  it('难度触发率内 weight 加权：450 独立种子两池都出现，权重高者更多（S5：改用正式事件 id）', () => {
    const counts: Record<string, number> = {};
    for (let seed = 1; seed <= 600; seed++) {
      const s = fresh();
      s.meta.stage = 2;
      for (const ev of rollEvents(s, createRng(seed))) {
        if (ev.source === 'sample') counts[ev.id] = (counts[ev.id] ?? 0) + 1;
      }
    }
    const opp = counts['opp-ai-package'] ?? 0;
    const crisis = counts['crisis-ai-crackdown'] ?? 0;
    expect(opp).toBeGreaterThanOrEqual(20);
    expect(crisis).toBeGreaterThanOrEqual(20);
    expect(opp).toBeGreaterThan(crisis); // weight 12 vs 7（day1 池仅此两条：weight 9/8 其余事件 day>=8 起）
  });

  it('once 查询侧：同一状态机遇事件至多入队一次', () => {
    const s = fresh();
    s.meta.stage = 2;
    let seen = 0;
    for (let i = 0; i < 1000; i++) {
      s.meta.day = i + 1;
      for (const ev of rollEvents(s, createRng(i + 1))) {
        if (ev.id === 'opp-ai-package') {
          seen += 1;
          expect(ev.source).toBe('sample');
        }
        for (const e of s.pending.events) if (e.id === ev.id) e.resolved = true;
      }
    }
    expect(seen).toBe(1); // once：机会事件只来一次
    expect(s.flags['ev_once_opp-ai-package']).toBe(true);
  });

  it('cooldown 查询侧：两次入队间隔 ≥ cooldownDays', () => {
    const s = fresh();
    const days: number[] = [];
    for (let i = 0; i < 1500; i++) {
      s.meta.day = i + 1;
      for (const ev of rollEvents(s, createRng(i + 7))) {
        if (ev.id === 'crisis-ai-crackdown') days.push(ev.day);
        for (const e of s.pending.events) if (e.id === ev.id) e.resolved = true;
      }
    }
    expect(days.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < days.length; i++) {
      const a = days[i - 1];
      const b = days[i];
      if (a !== undefined && b !== undefined) expect(b - a).toBeGreaterThanOrEqual(10);
    }
  });

  it('心悸预警置顶必出：hf≥70 当日只出它；cooldown 5 天；hf<70 不触发', () => {
    const s = fresh();
    s.health.hiddenFatigue = 75;
    const evts = rollEvents(s, createRng(3));
    expect(evts.some(e => e.id === 'heartAttackWarn')).toBe(true);
    expect(evts.length).toBe(1); // 置顶：当日不再抽其他
    expect(evts[0]?.source).toBe('forced');
    for (const e of s.pending.events) e.resolved = true;
    s.meta.day = 3; // cooldown 内（1+5>3）
    expect(rollEvents(s, createRng(4)).some(e => e.id === 'heartAttackWarn')).toBe(false);
    s.meta.day = 7; // cooldown 到期 → 必出
    expect(rollEvents(s, createRng(5)).some(e => e.id === 'heartAttackWarn')).toBe(true);
    const calm = fresh();
    calm.health.hiddenFatigue = 60;
    expect(rollEvents(calm, createRng(6)).some(e => e.id === 'heartAttackWarn')).toBe(false);
  });
});

// ============================================================
// 三、选项结算 / 连锁 / System1 过滤
// ============================================================

describe('resolveChoice + 连锁 + System1 过滤（§9.3/§5.2）', () => {
  it('choice effects 落账 + chain 延迟触发（2 日后危机到站；S5：改用正式事件 id 直接入队）', () => {
    const s = fresh();
    s.meta.stage = 2;
    ensureAccount(s, 'bilili').followers = 100;
    const oppDef = findEventDef('opp-ai-package');
    if (!oppDef) throw new Error('def missing');
    enqueueEvent(s, oppDef.id, 'forced');
    const cash0 = s.cash;
    const res = resolveChoice(s, oppDef as EventDef, 0, createRng(9)); // accept
    expect(res.ok).toBe(true);
    expect(res.msg).toContain('合同');
    expect(s.cash).toBeGreaterThan(cash0); // cash +[3000,6000]
    expect(s.rep).toBe(2);
    expect(s.pending.chains.map(c => c.event)).toContain('crisis-ai-crackdown');
    const seed = s.pending.chains.find(c => c.event === 'crisis-ai-crackdown');
    expect(seed?.delayDays).toBe(2);
    // 第一天：递减不触发
    s.meta.day += 1;
    tickChains(s, createRng(1));
    expect(s.pending.chains.some(c => c.event === 'crisis-ai-crackdown')).toBe(true);
    // 第二天：到期入池
    s.meta.day += 1;
    tickChains(s, createRng(2));
    expect(s.pending.chains.some(c => c.event === 'crisis-ai-crackdown')).toBe(false);
    const crisis = s.pending.events.find(e => e.id === 'crisis-ai-crackdown');
    expect(crisis?.source).toBe('chain');
  });

  it('System1 过滤三规则：深思选项隐藏 / s1Variant 换文案 / deep 无取消', () => {
    const def = findEventDef('crisis-ai-crackdown');
    if (!def) throw new Error('def missing');
    const s = fresh();
    s.decisionMode = 'system2';
    const r2 = filterChoicesForUI(s, def);
    expect(r2.length).toBe(3);
    expect(r2.some(c => c.id === 'hide' && c.label === '赌一把：声明先不补')).toBe(true);
    s.decisionMode = 'system1';
    const r1 = filterChoicesForUI(s, def);
    expect(r1.some(c => c.id === 'hide')).toBe(false); // 规则①：requires system2 隐藏
    expect(r1.find(c => c.id === 'declare')?.label).toBe('先补标识再说'); // 规则②：s1Variant
    s.decisionMode = 'system1Deep';
    const rd = filterChoicesForUI(s, def);
    expect(rd.some(c => c.id === 'walkaway')).toBe(false); // 规则③：强制无取消
    expect(rd.map(c => c.id)).toEqual(['declare']);
  });

  it('正式事件全链路：危机事件选择→效果落账→事件标记已决→老张台词（S5：改用正式事件 id）', () => {
    const s = fresh();
    ensureAccount(s, 'bilili').followers = 100;
    const def = findEventDef('crisis-ai-crackdown');
    if (!def) throw new Error('def missing');
    enqueueEvent(s, def.id, 'forced');
    const res = resolveChoice(s, def, 0, createRng(3)); // declare：合规+4 粉丝-30
    expect(res.ok).toBe(true);
    expect(s.compliance).toBe(74);
    expect(s.platforms['bilili']?.followers).toBe(70);
    const pe = s.pending.events.find(e => e.id === def.id);
    expect(pe?.resolved).toBe(true);
    expect(s.log.some(l => l.msg.includes('老张：'))).toBe(true);
  });

  it('静态校验：validateChains 环检测必须报环；健康数据零告警；未知 agent 引用被抓', () => {
    const mk = (id: string, target: string): EventDef => ({
      id, title: id, body: '', cat: 'opportunity', when: [], weight: 1,
      choices: [{ id: 'c', label: 'c', effects: [], results: '', chain: [{ event: target, delayDays: 1 }] }]
    });
    const cycles = validateChains([mk('a', 'b'), mk('b', 'a')]);
    expect(cycles.length).toBeGreaterThan(0);
    expect(cycles[0]).toContain('a');
    expect(cycles[0]).toContain('b');
    expect(validateChains(EVENT_DEFS)).toEqual([]); // S5 80 条正式数据无环
    expect(validateWhenReachable(EVENT_DEFS)).toEqual([]); // S5 正式数据引用干净
    const bad: EventDef = {
      id: 'bad', title: 'bad', body: '', cat: 'ai', when: [['agent', 'nonexistent' as 'support']], weight: 1,
      choices: [{ id: 'c', label: 'c', effects: [], results: '' }]
    };
    expect(validateWhenReachable([bad]).some(w => w.includes('nonexistent'))).toBe(true);
  });
});

// ============================================================
// 四、智能体：雇佣 / Token 账单 / trust / 事故 / 幽灵公司 / 单位经济
// ============================================================

describe('智能体引擎（§8）', () => {
  it('雇佣前置：阶段/现金/重复三重校验，扣款与 trust=60 记账', () => {
    const s = fresh();
    s.cash = 999999;
    expect(hireAgent(s, 'support', createRng(1)).msg).toContain('阶段不足'); // unlockStage 3
    s.meta.stage = 3;
    expect(hireAgent(s, 'growth', createRng(1)).ok).toBe(true); // growth 也是阶段 3
    s.cash = 0;
    expect(hireAgent(s, 'support', createRng(1)).msg).toContain('部署费不足');
    s.cash = 999999;
    const r = hireAgent(s, 'support', createRng(1));
    expect(r.ok).toBe(true);
    expect(s.cash).toBe(999999 - 2000);
    expect(s.agents.find(a => a.id === 'support')).toMatchObject({ trust: 60, usageScale: 1 });
    expect(s.stats.agentsHired).toBe(2); // growth + support
    expect(hireAgent(s, 'support', createRng(1)).ok).toBe(false); // 重复雇佣
    expect(hireAgent(s, 'butler', createRng(1)).msg).toContain('阶段不足'); // butler 需 stage5
  });

  it('Token 月账单公式：priceIndex 1.5 精确值；butler 编排抽成 10%', () => {
    const s = ready();
    hireAgent(s, 'support', createRng(1));
    s.tokenBill.priceIndex = 1.5;
    expect(monthlyTokenBill(s, createRng(1))).toBeCloseTo(300 * 1.5, 10); // 无项目：base×pi（[S9] base 300）
    createProject(s, '工单源', 'saas', 'subscription', createRng(2));
    // support: base 300 + 0.8×10 工单×1 = 308 → ×1.5（[S9] base 400→300）
    expect(monthlyTokenBill(s, createRng(1))).toBeCloseTo(308 * 1.5, 10);
    // growth：base 1000 + 2.0×千次触达(followersPeak 5000→5)×1 = 1010 → ×1.5
    hireAgent(s, 'growth', createRng(2));
    s.stats.followersPeak = 5000;
    expect(monthlyTokenBill(s, createRng(1))).toBeCloseTo((308 + 1010) * 1.5, 10);
    // butler：编排抽成 = 其他智能体税前账单×10%（但ler 需 stage5）
    const s2 = ready();
    s2.meta.stage = 5;
    hireAgent(s2, 'support', createRng(1));
    hireAgent(s2, 'butler', createRng(2));
    s2.tokenBill.priceIndex = 1.5;
    expect(monthlyTokenBill(s2, createRng(1))).toBeCloseTo((300 + 2500 + 30) * 1.5, 10); // 4245（[S9] base 300，编排抽成=其他×10%）
  });

  it('trust<40 效率减半：同种子 30 天，trust80 获客 ≈ trust30 的 2 倍', () => {
    const mk = (): StateSlice => {
      const s = ready();
      hireAgent(s, 'growth', createRng(1));
      return s;
    };
    const hi = mk();
    const lo = mk();
    hi.agents[0]!.trust = 80;
    lo.agents[0]!.trust = 30;
    ensureAccount(hi, 'wechat');
    ensureAccount(lo, 'wechat');
    const rHi = createRng(7);
    const rLo = createRng(7);
    for (let d = 1; d <= 30; d++) {
      hi.meta.day = d;
      lo.meta.day = d;
      tickAgentsDay(hi, rHi);
      tickAgentsDay(lo, rLo);
    }
    const fHi = hi.platforms['wechat']?.followers ?? 0;
    const fLo = lo.platforms['wechat']?.followers ?? 0;
    expect(fHi).toBeGreaterThan(fLo * 1.7);
    expect(fHi).toBeLessThan(fLo * 2.3);
  });

  it('事故掷骰：trust-20 + 风险事件入 pending 队列 + accidents 记账；无事故月 trust+5', () => {
    // 找一个出事故的种子（support+growth，双倍概率面）
    let hit: StateSlice | undefined;
    for (let seed = 1; seed <= 400 && !hit; seed++) {
      const s = ready();
      hireAgent(s, 'support', createRng(1));
      hireAgent(s, 'growth', createRng(2));
      s.meta.day = 30;
      tickAgentsDay(s, createRng(seed));
      if (s.pending.events.length > 0) hit = s;
    }
    expect(hit).toBeDefined();
    const h = hit as StateSlice;
    const acc = h.agents.find(a => h.flags[`agAcc_${a.id}`] === true);
    expect(acc).toBeDefined();
    expect(acc?.trust).toBe(45); // 月界先结上月无事故 +5（60→65），再掷新事故 -20 → 45
    expect(h.stats.accidents).toBe(1);
    const riskIds = new Set(AGENT_DEFS.flatMap(d => d.riskEvents));
    expect(riskIds.has(h.pending.events[0]?.id ?? '')).toBe(true);
    // 找一个无事故种子：trust +5
    let calm: StateSlice | undefined;
    for (let seed = 1; seed <= 400 && !calm; seed++) {
      const s = ready();
      hireAgent(s, 'support', createRng(1));
      s.meta.day = 30;
      tickAgentsDay(s, createRng(seed));
      if (s.pending.events.length === 0 && s.stats.accidents === 0) calm = s;
    }
    expect(calm?.agents[0]?.trust).toBe(65);
  });

  it('autoLevel 六流程与幽灵公司：butler 全接管=100；五流程=83.3 不触发；空虚月 mood-3', () => {
    const s = ready();
    for (const id of ['support', 'growth', 'content', 'sales', 'legalfin'] as const) {
      s.meta.stage = 5;
      expect(hireAgent(s, id, createRng(1)).ok).toBe(true);
    }
    tickAgentsDay(s, createRng(1));
    expect(autoLevelScore(s)).toBeCloseTo(500 / 6, 10);
    expect(s.autoLevel).toBeCloseTo(500 / 6, 10);
    expect(s.flags.ghostCompany).toBe(false); // 83.3 < 85
    // autoSrv 项目自带交付自动化 → 六流程全接管
    createProject(s, '自动化', 'aiSupport', 'usage', createRng(2));
    tickAgentsDay(s, createRng(2));
    expect(autoLevelScore(s)).toBe(100);
    expect(s.flags.ghostCompany).toBe(true);
    // 幽灵公司对价：当月无亲自创作/见客户 → mood-3（70→67）
    s.meta.day = 30;
    tickAgentsDay(s, createRng(3));
    expect(s.health.mood.v).toBe(67);
    expect(s.log.some(l => l.msg.includes('意义的空虚'))).toBe(true);
    // 当月有亲自创作（lastOutputDay 落在第 2 个月）→ 不扣
    s.flags.lastOutputDay = 60;
    s.meta.day = 60;
    tickAgentsDay(s, createRng(4));
    expect(s.health.mood.v).toBe(67);
  });

  it('单位经济面板：毛利率公式精确值；priceIndex 联动；超 trust 承载告警', () => {
    const s = ready();
    const r = createProject(s, '自动化', 'aiSupport', 'usage', createRng(1));
    const p = s.projects[0];
    if (!p || !r.ok) throw new Error('project missing');
    const panel = unitEconomics(s, p);
    expect(panel.price).toBe(1750); // (500+3000)/2
    expect(panel.cogsToken).toBe(80);
    // (1750 − 80×1 − 0.05×1750)/1750
    expect(panel.grossMargin).toBeCloseTo((1750 - 80 - 87.5) / 1750, 10);
    s.tokenBill.priceIndex = 2;
    expect(unitEconomics(s, p).grossMargin).toBeCloseTo((1750 - 160 - 87.5) / 1750, 10);
    // 超 trust 承载：usageScale 3 > max(1, 30/20)=1.5
    hireAgent(s, 'support', createRng(2));
    const sup = s.agents.find(a => a.id === 'support');
    if (!sup) throw new Error('agent missing');
    sup.trust = 30;
    sup.usageScale = 3;
    const p2 = unitEconomics(s, p);
    expect(p2.overTrustCapacity).toBe(true);
    expect(p2.trustCapacity).toBeCloseTo(1.5, 10);
    // 超承载月结：项目质量 -5
    const q0 = p.quality;
    s.meta.day = 30;
    tickAgentsDay(s, createRng(3));
    expect(p.quality).toBeCloseTo(Math.max(0, q0 - 5), 10);
  });
});

// ============================================================
// 五、平台：observe / 大爆小爆 / 封号 / 依赖 / 一鱼八吃
// ============================================================

describe('平台引擎（§10）', () => {
  it('observe 30 天→normal；观察期流量×0.4 且不变现', () => {
    const s = ready();
    const acc = ensureAccount(s, 'wechat');
    expect(acc.state).toBe('observe');
    expect(acc.observeDaysLeft).toBe(30);
    // 流量×0.4：观察期 vs 正常态同种子对比
    const s2 = ready();
    const acc2 = ensureAccount(s2, 'wechat');
    acc2.state = 'normal';
    acc2.observeDaysLeft = 0;
    const g1 = publishContent(s, 'wechat', createRng(11));
    const g2 = publishContent(s2, 'wechat', createRng(11));
    expect(g1.followers).toBeLessThan(g2.followers);
    expect(stateFlowMult(acc)).toBe(0.4);
    // 观察期不变现：粉丝 1 万也不进账
    acc.followers = 10000;
    const cash0 = s.cash;
    s.meta.day = 15;
    rollPlatformDay(s, createRng(5));
    expect(s.cash).toBe(cash0);
    expect(acc.observeDaysLeft).toBe(29);
    // 30 天后转 normal 并开始变现：重置粉丝后 10000×0.008×marketMult(hangcheng 1.2) = 96/日
    for (let d = 0; d < 30; d++) {
      s.meta.day = 16 + d;
      rollPlatformDay(s, createRng(6 + d));
    }
    expect(acc.state).toBe('normal');
    acc.followers = 10000; // 重置（自然漂移不干扰精确值：入账前先漂移 10000→9980）
    const cash1 = s.cash;
    s.meta.day = 50;
    rollPlatformDay(s, createRng(99));
    expect(s.cash - cash1).toBe(96); // [S9] 地点市场规模参与日变现：80×1.2
  });

  it('大爆小爆分段概率 sanity：1000 样本频率区间（0.90/0.09/0.01）', () => {
    const rng = createRng(9);
    let a = 0, b = 0, c = 0;
    for (let i = 0; i < 1000; i++) {
      const t = plTier(rng.next());
      if (t === 1) a += 1;
      else if (t === 3) b += 1;
      else c += 1;
    }
    expect(a / 1000).toBeGreaterThan(0.86);
    expect(a / 1000).toBeLessThan(0.94);
    expect(b / 1000).toBeGreaterThan(0.06);
    expect(b / 1000).toBeLessThan(0.12);
    expect(c / 1000).toBeGreaterThan(0.003);
    expect(c / 1000).toBeLessThan(0.02);
  });

  it('banRisk 迁移：normal→throttled（7 天）→banned；粉丝按私域化率清算；封号后收入停', () => {
    const s = ready();
    const acc = ensureAccount(s, 'bilili');
    acc.followers = 1000;
    acc.banRisk = 50; // <85：先走限流档（banChance = 0.02）
    // 找到触发限流的种子
    findSeed(s, (st, r) => { acc.state = 'normal'; return banRiskRoll(st, 'bilili', r); },
      r => r === 'throttled');
    expect(acc.state).toBe('throttled');
    expect(s.flags.pl_throttle_bilili).toBe(7);
    // throttled 再犯 → banned（粉丝清算：无私域 → 0）；banRisk 100 必进重罚档
    acc.banRisk = 100;
    let before = acc.followers;
    findSeed(s, (st, r) => {
      acc.state = 'throttled';
      s.flags.pl_throttle_bilili = 7;
      acc.banRisk = 100;
      before = acc.followers;
      return banRiskRoll(st, 'bilili', r);
    }, r => r === 'banned');
    expect(acc.followers).toBe(0);
    // 私域化率 0.5 → 保留一半
    const s2 = ready();
    const acc2 = ensureAccount(s2, 'bilili');
    acc2.followers = 1000;
    acc2.banRisk = 100; // ≥85：直接封禁档
    s2.flags.privateDomain = 0.5;
    expect(privateDomainRate(s2)).toBe(0.5);
    let before2 = 1000;
    findSeed(s2, (st, r) => {
      acc2.state = 'throttled';
      s2.flags.pl_throttle_bilili = 7;
      acc2.banRisk = 100;
      before2 = acc2.followers;
      return banRiskRoll(st, 'bilili', r);
    }, r => r === 'banned');
    expect(acc2.followers).toBe(Math.round(before2 * 0.5));
    expect(acc2.followers).toBeGreaterThan(0);
    // 封号后收入停摆：rollPlatformDay 不入账
    expect(before).toBeGreaterThan(0);
    const cash0 = s.cash;
    for (let d = 0; d < 3; d++) {
      s.meta.day = 100 + d;
      rollPlatformDay(s, createRng(120 + d));
    }
    expect(s.cash).toBe(cash0);
    // 封号后发布拒绝
    expect(publishContent(s, 'bilili', createRng(1)).ok).toBe(false);
  });

  it('单平台依赖警戒：收入占比>60% → banChance ×3', () => {
    const s = ready();
    const bl = ensureAccount(s, 'bilili');
    bl.followers = 100;
    bl.state = 'normal'; // 出观察期，排除 ×2 档
    const wc = ensureAccount(s, 'wechat');
    wc.followers = 100;
    wc.state = 'normal';
    s.flags.pl_inc_bilili = 800;
    s.flags.pl_inc_wechat = 200;
    computeIncomeShares(s);
    expect(s.platforms['bilili']?.incomeShare).toBeCloseTo(0.8, 10);
    expect(platformDependency(s)).toBe('bilili');
    s.platforms['bilili']!.banRisk = 50;
    const pDep = banChance(s, 'bilili');
    s.flags.pl_inc_bilili = 500;
    s.flags.pl_inc_wechat = 500;
    computeIncomeShares(s);
    expect(platformDependency(s)).toBeNull();
    const pEven = banChance(s, 'bilili');
    expect(pEven).toBeCloseTo((50 / 100) * 0.04, 10);
    expect(pDep).toBeCloseTo(pEven * 3, 10); // 依赖警戒 ×3
  });

  it('一鱼八吃：当日/次日/三日三批延迟分发，各平台独立抽样', () => {
    const s = ready();
    ensureAccount(s, 'bilili').followers = 100;
    const res = distributeContent(s, 'bilili', createRng(1));
    expect(res.ok).toBe(true);
    expect(res.batches.length).toBe(7); // 8 平台 - 主平台
    const today = res.batches.filter(b => b.delayDays === 0).map(b => b.pid);
    expect(today.sort()).toEqual(['douyin', 'weibo'].sort()); // 0h 批当日发
    expect(s.platforms['douyin']!.followers).toBeGreaterThanOrEqual(1);
    expect(s.platforms['weibo']!.followers).toBeGreaterThanOrEqual(1);
    // 次日批（wechat/youtube/site）与三日批（xhs/zhihu）
    const chains = s.pending.chains.filter(c => c.event.startsWith('dist:'));
    expect(chains.find(c => c.event === 'dist:wechat')?.delayDays).toBe(1);
    expect(chains.find(c => c.event === 'dist:xhs')?.delayDays).toBe(3);
    // 第一滚：次日批到站，三日批未动
    s.meta.day = 2;
    rollPlatformDay(s, createRng(2));
    expect(s.platforms['wechat']!.followers).toBeGreaterThanOrEqual(1);
    expect(s.platforms['xhs']!.followers).toBe(0);
    // 第二、三滚：三日批到站
    s.meta.day = 3;
    rollPlatformDay(s, createRng(3));
    s.meta.day = 4;
    rollPlatformDay(s, createRng(4));
    expect(s.platforms['xhs']!.followers).toBeGreaterThanOrEqual(1);
    expect(s.platforms['zhihu']!.followers).toBeGreaterThanOrEqual(1);
    expect(s.pending.chains.some(c => c.event.startsWith('dist:'))).toBe(false);
  });

  it('灰产 grayHistory：apiRelay 立项即永久标记（S2 钩子回归）', () => {
    const s = ready();
    const r = createProject(s, '中转站', 'apiRelay', 'usage', createRng(1));
    expect(r.ok).toBe(true);
    expect(s.flags.grayHistory).toBe(true);
    expect(s.stats.grayDeals).toBe(1);
    expect(s.compliance).toBe(65); // 70-5
    expect(evalCond(s, ['gray', true])).toBe(true);
  });
});

// ============================================================
// 六、数据完整性 + 整合冒烟
// ============================================================

describe('数据与整合', () => {
  it('数据表完整性：7 智能体数字严格按 §8.1；8 平台按设计方案 §七', () => {
    expect(AGENT_DEFS.length).toBe(7);
    const byId = Object.fromEntries(AGENT_DEFS.map(a => [a.id, a]));
    expect(byId['support']).toMatchObject({ deployCost: 2000, monthlyTokenBase: 300, tokenPerUnit: 0.8, efficiency: 0.9, unlockStage: 3 }); // [S9] base 400→300
    expect(byId['growth']).toMatchObject({ deployCost: 5000, monthlyTokenBase: 1000, tokenPerUnit: 2.0, efficiency: 1.0, unlockStage: 3 }); // [S9] efficiency 0.8→1.0
    expect(byId['content']).toMatchObject({ deployCost: 3000, monthlyTokenBase: 600, tokenPerUnit: 1.5, efficiency: 0.75, unlockStage: 4 });
    expect(byId['sales']).toMatchObject({ deployCost: 4000, monthlyTokenBase: 800, tokenPerUnit: 3.0, efficiency: 0.7, unlockStage: 4 });
    expect(byId['legalfin']).toMatchObject({ deployCost: 3500, monthlyTokenBase: 500, tokenPerUnit: 0, efficiency: 0.85, unlockStage: 4 });
    expect(byId['regagent']).toMatchObject({ deployCost: 1500, monthlyTokenBase: 300, tokenPerUnit: 0, efficiency: 0.95, unlockStage: 4 });
    expect(byId['butler']).toMatchObject({ deployCost: 12000, monthlyTokenBase: 2500, unlockStage: 5 });
    expect(byId['butler']?.riskEvents.length).toBeGreaterThanOrEqual(10); // 风险聚合
    for (const a of AGENT_DEFS) expect(a.riskEvents.length).toBeGreaterThan(0);
    expect(PLATFORM_DEFS.length).toBe(8);
    const p = Object.fromEntries(PLATFORM_DEFS.map(x => [x.id, x]));
    expect(p['xhs']?.banRiskBase).toBe(1.6); // 最危险
    expect(p['site']?.banRiskBase).toBe(0); // 封不了号
    expect(p['douyin']?.flowVar).toBeGreaterThan(1); // 头部效应方差大
    expect(p['youtube']?.mRate).toBeGreaterThan(p['weibo']?.mRate ?? 0); // 分成最高
    for (const d of [0, 24, 72]) expect(PLATFORM_DEFS.some(x => x.delayHours === d)).toBe(true);
    expect(findAgent('support')?.replaces).toContain('cash');
  });

  it('整合冒烟：雇佣+发布+40 天 advanceDay，事件/平台/智能体三引擎联动不变量干净', () => {
    const s = ready();
    expect(hireAgent(s, 'support', createRng(1)).ok).toBe(true);
    expect(hireAgent(s, 'growth', createRng(2)).ok).toBe(true);
    expect(createProject(s, '起量', 'saas', 'subscription', createRng(3)).ok).toBe(true);
    const rng = createRng(2026);
    for (let d = 0; d < 40 && !s.meta.over; d++) {
      if (d % 3 === 0) publishContent(s, 'wechat', rng);
      const rep = advanceDay(s, rng);
      if (rep.deathCheck?.died) break;
    }
    // 至少：平台账号在转、获客智能体拉了新、Token 记账有痕、不变量干净
    expect(Object.keys(s.platforms).length).toBeGreaterThanOrEqual(1);
    expect(s.stats.followersPeak).toBeGreaterThan(0);
    expect(s.stats.tokenSpent).toBeGreaterThanOrEqual(0);
    expect(assertInvariants(s)).toEqual([]);
  });
});
