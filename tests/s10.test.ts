// [v0.10] 迭代验收测试：健康饮食 / 全系统日结 / Token 日结 / 智能体可感知 /
// 结局后继续 / 新闻轮换 / 项目看板 / 细节批次 / 作者彩蛋
import { describe, expect, it, vi } from 'vitest';
import { createInitialSlice } from '../src/core/state';
import { assertInvariants } from '../src/core/state';
import { createGame } from '../src/core/index';
import { createRng } from '../src/core/rng';
import { weeklyReview } from '../src/core/time';
import { executeAction } from '../src/core/actions';
import { settleProjectsDay, settleProjectsMonth } from '../src/core/projects';
import { tickPortfolioDay, dailyNet } from '../src/core/economy';
import { agentBizMult, hireAgent, tickAgentsDay, weekStatsOf } from '../src/core/agents';
import { resolveChoice } from '../src/core/events';
import { findEventDef, EVENT_DEFS, NEWS_TICKER } from '../src/data/events.def';
import { findAction } from '../src/data/actions.def';
import { ZHANG_LINES } from '../src/data/zhang.def';
import { KP_DEFS } from '../src/data/kp.def';
import { healthHints } from '../src/ui/views/status';
import { pmfInterval, stageTimeline, grayRiskScore, todayUnitEconomics } from '../src/ui/views/projects';
import { momArrow } from '../src/ui/views/finance';
import { weekContribText } from '../src/ui/views/agents';
import { interpolateEventVars } from '../src/ui/fmt';
import {
  AUTHOR_TAG, PRODUCT_TAG, canContinueFromSlot, clearSlot, isOfficialSave,
  loadSlot, saveToSlot, serialize
} from '../src/save/save';
import type { SetupConfig, StateSlice } from '../src/core/types';

const PERS = { pragmaticIdeal: 'pragmatic', steadyAggressive: 'steady', soloSocial: 'solo' } as const;

function setup(over: Partial<SetupConfig> = {}): SetupConfig {
  return {
    niche: 'dev', background: 'grass', location: 'hangcheng',
    difficulty: 'normal', talents: [], personality: { ...PERS }, cryptoOn: true, seed: 42, ...over
  };
}

function fresh(over: Partial<SetupConfig> = {}): StateSlice {
  return createInitialSlice(setup(over));
}

function ready(): StateSlice {
  const s = fresh();
  s.meta.stage = 4;
  s.cash = 999999;
  return s;
}

/** 带一个已发布项目的就绪态（日结/交付用） */
function withLaunchedProject(s: StateSlice): NonNullable<StateSlice['projects'][number]> {
  const p = {
    id: 'p_test', name: '记账小工具', type: 'saas', revenueModel: 'subscription' as const,
    stage: 'grow' as const, progress: 100, quality: 70, pmfTrue: 50,
    pmfEstimate: { v: 50, noise: 10 }, risk: 40, maintenance: 10,
    users: 38, mrr: 3000, ageMonths: 1, version: 1, alive: true, decayRate: 2
  };
  s.projects.push(p);
  return p;
}

// ============================================================
// W1 健康饮食模块
// ============================================================

describe('[W1] 健康饮食', () => {
  it('连续 10 天只靠 takeout/eatWell 维持饮食：diet 不崩（≥50，无木桶预警）', () => {
    const g = createGame(setup({ seed: 7 }));
    const s = g.state as StateSlice;
    expect(findAction('eatWell')).toBeDefined();
    expect(findAction('takeout')).toBeDefined();
    for (let d = 0; d < 10; d++) {
      // 奇数日好好吃饭（diet+12），偶数日外卖凑合（diet+4，AP0）
      const ok = g.dispatch({ t: 'act', id: d % 2 === 0 ? 'eatWell' : 'takeout' });
      expect(ok.ok, `day ${d + 1} ${d % 2 === 0 ? 'eatWell' : 'takeout'} 应可执行`).toBe(true);
      const rep = g.advanceDay();
      expect(rep.logs.some(l => l.msg.includes('木桶预警：饮食'))).toBe(false);
      expect(s.health.diet.v).toBeGreaterThanOrEqual(50);
    }
    expect(s.health.diet.v).toBeGreaterThanOrEqual(50); // 10 天后仍 ≥50
    expect(s.health.diet.v).toBeLessThanOrEqual(100);
  });

  it('coffee：精力+10 睡眠-3；earlySleep：置 earlySleptToday 标记（UI 消费结束今天）', () => {
    const s = ready();
    s.energy = 40;
    s.health.sleep.v = 60;
    const r1 = executeAction(s, { t: 'act', id: 'coffee' }, createRng(1));
    expect(r1.ok).toBe(true);
    expect(s.energy).toBe(50); // 40 + 10（精力不走效果乘子）
    expect(s.health.sleep.v).toBeGreaterThan(56); // 60 - 3×healthMult（≈57.1）
    expect(s.health.sleep.v).toBeLessThan(58);
    const r2 = executeAction(s, { t: 'act', id: 'earlySleep' }, createRng(1));
    expect(r2.ok).toBe(true);
    expect(s.flags.earlySleptToday).toBe(true); // main.ts uiDispatch 据此走「结束今天」
    expect(s.flags.deepRestedToday).toBe(true);
    expect(s.health.sleep.v).toBeGreaterThan(70); // + 15×healthMult（≈71.5）
    expect(s.health.sleep.v).toBeLessThan(73)
  });

  it('healthHints（状态页健康区动态提示）：子项 <50 时给出对应行动建议', () => {
    const s = fresh();
    expect(healthHints(s)).toEqual([]); // 开局四项均 70
    s.health.diet.v = 42;
    s.health.sleep.v = 45;
    const hints = healthHints(s);
    expect(hints.map(h => h.key)).toEqual(['diet', 'sleep']); // 按严重度升序（42 < 45）
    expect(hints[0]?.text).toContain('好好吃顿饭');
    expect(hints[1]?.text).toContain('早睡');
  });
});

// ============================================================
// W2 全系统日结
// ============================================================

describe('[W2] 全系统日结', () => {
  it('连跑 31 天：每日现金变动非零、dailyFlow 分项落账、日清零', () => {
    const g = createGame(setup({ seed: 11 }));
    const s = g.state as StateSlice;
    withLaunchedProject(s);
    s.cash = 50000;
    for (let i = 0; i < 31 && !s.meta.over; i++) {
      const before = s.cash;
      if (s.ap > 0) g.dispatch({ t: 'act', id: 'deepRest' }); // 睡眠 -8/日：每天还账，防健康崩盘终局
      g.advanceDay();
      expect(s.cash).not.toBe(before); // 生活费日扣 ⇒ 每日现金必有变动
      expect(s.dailyFlow.livingOut).toBe(0); // 日结完成后已清零（明日重算）
    }
    expect(s.meta.day).toBe(32);
    expect(s.flags.lastDayNet).not.toBe(undefined); // 昨日净流留档
  });

  it('月底对账：修正后残差为 0，修正幅度（日波动噪声）< 月应收 5%', () => {
    const s = ready();
    const p = withLaunchedProject(s);
    s.cash = 100000;
    const rng = createRng(3);
    for (let d = 0; d < 30; d++) settleProjectsDay(s, rng);
    const due = s.flags.monthProjDue as number;
    const net = s.flags.monthProjNet as number;
    const acc = s.flags.monthProjAcc as number;
    expect(due).toBeCloseTo(3000, 5); // mrr=3000 恒定 30 天
    expect(Math.abs(net - due) / due).toBeLessThan(0.05); // ±6% 噪声均值回归
    const res = settleProjectsMonth(s, rng);
    expect(Math.abs(due - (net + Math.round(due - net)))).toBeLessThan(1); // 修正后残差 ≈ 0
    expect(Math.abs(Math.round(due - net))).toBeLessThan(due * 0.05); // 修正量 <5%
    expect(res.income).toBeCloseTo(acc + Math.round(due - net), 0);
    expect(s.flags.monthProjAcc).toBe(0); // 累计器月清
    void p;
  });

  it('投资 30 日市值路径：货基近线性（日波动 <0.5%，终值 ±3%），卖出才落袋', () => {
    const s = ready();
    s.portfolio.fund = 10000;
    s.portfolioCost.fund = 10000;
    const rng = createRng(9);
    let prev = 10000;
    let maxDailySwing = 0;
    for (let d = 0; d < 30; d++) {
      tickPortfolioDay(s, rng);
      const swing = Math.abs(s.portfolio.fund - prev) / prev;
      maxDailySwing = Math.max(maxDailySwing, swing);
      prev = s.portfolio.fund;
    }
    expect(maxDailySwing).toBeLessThan(0.005); // 货基日波动率 0.01%×随机 → 远小于 0.5%
    expect(s.portfolio.fund).toBeGreaterThan(9700);
    expect(s.portfolio.fund).toBeLessThan(10300);
    expect(Math.abs(s.investGains.floatMonth)).toBeLessThan(300);
    // 卖出落袋：现金 += 卖出市值；已实现 = 市值 − 成本份额（浮动不落袋）
    const game = createGame(setup({ seed: 13 }));
    const st = game.state as StateSlice;
    st.portfolio.fund = 10150; // 演示市值（浮动 +150）
    st.portfolioCost.fund = 10000;
    st.cash = 50000;
    const sellAmt = 10150;
    expect(game.dispatch({ t: 'invest', kind: 'fund', amount: -sellAmt }).ok).toBe(true);
    expect(st.cash).toBe(50000 + sellAmt);
    expect(st.portfolio.fund).toBe(0);
    expect(st.investGains.realizedTotal).toBeCloseTo(150, 6);
    expect(st.investGains.realizedMonth).toBeCloseTo(150, 6);
  });

  it('dailyNet 纯函数：流入 − 流出', () => {
    expect(dailyNet({ projIn: 100, passiveIn: 20, serviceIn: 50, livingOut: 233, subsOut: 7, tokenOut: 10, otherOut: 40 })).toBe(-120);
    expect(dailyNet({ projIn: 0, passiveIn: 0, serviceIn: 300, livingOut: 0, subsOut: 0, tokenOut: 0, otherOut: 0 })).toBe(300);
  });
});

// ============================================================
// W3 Token 日结
// ============================================================

describe('[W3] Token 日结', () => {
  it('雇 2 个智能体连跑 10 天：每日现金流出、monthToDate 递增、yesterday>0', () => {
    const s = ready();
    s.cash = 100000;
    withLaunchedProject(s);
    expect(hireAgent(s, 'support', createRng(1)).ok).toBe(true);
    expect(hireAgent(s, 'growth', createRng(1)).ok).toBe(true);
    const rng = createRng(5);
    let prevMtd = 0;
    for (let d = 0; d < 10; d++) {
      const before = s.cash;
      s.meta.day += 1;
      tickAgentsDay(s, rng);
      expect(s.cash).toBeLessThan(before); // 当日 Token 扣现
      expect(s.tokenBill.yesterday).toBeGreaterThan(0);
      expect(s.tokenBill.monthToDate).toBeGreaterThan(prevMtd); // 月累计递增
      expect(s.dailyFlow.tokenOut).toBeGreaterThan(0);
      prevMtd = s.tokenBill.monthToDate;
    }
    expect(s.stats.tokenSpent).toBeGreaterThan(0);
    expect(s.stats.totalExpense).toBeGreaterThan(0); // Token 计入支出（不再月底一次扣）
  });
});

// ============================================================
// W4 智能体业务加成可感知
// ============================================================

describe('[W4] 智能体业务加成', () => {
  it('sales 在岗：deliverService 收入差 ≥15%（同种子逐单对照）', () => {
    const run = (withSales: boolean): number[] => {
      const s = ready();
      withLaunchedProject(s);
      if (withSales) hireAgent(s, 'sales', createRng(1));
      const incomes: number[] = [];
      const rng = createRng(77);
      for (let i = 0; i < 6; i++) {
        const before = s.cash;
        s.ap = 3;
        s.energy = 100;
        const r = executeAction(s, { t: 'act', id: 'deliverService' }, rng);
        expect(r.ok).toBe(true);
        incomes.push(s.cash - before);
      }
      return incomes;
    };
    const base = run(false);
    const buffed = run(true);
    for (let i = 0; i < base.length; i++) {
      // ×1.15 后各自取整：单笔允许 ±0.2% 取整噪声，聚合 ≥15%
      expect(buffed[i]! / base[i]!).toBeGreaterThanOrEqual(1.147);
    }
    const totalRatio = buffed.reduce((a, b) => a + b, 0) / base.reduce((a, b) => a + b, 0);
    expect(totalRatio).toBeGreaterThanOrEqual(1.149);
  });

  it('content 智能体 6 日 ≥2 篇自动内容日志（purple，每 2 日 1 篇）', () => {
    const s = ready();
    s.cash = 100000;
    s.meta.stage = 4;
    hireAgent(s, 'content', createRng(1));
    const rng = createRng(21);
    for (let d = 0; d < 6; d++) {
      s.meta.day += 1;
      tickAgentsDay(s, rng);
    }
    const autoLogs = s.log.filter(l => l.cls === 'purple' && l.msg.includes('【内容智能体】') && l.msg.includes('自动产出'));
    expect(autoLogs.length).toBeGreaterThanOrEqual(2); // 第 2/4/6 日各 1 篇
    const ws = weekStatsOf(s.agents[0]!);
    expect(ws.content).toBeGreaterThanOrEqual(2);
  });

  it('growth 周产 1-3 条销售线索（stats.leads），交付接单加成封顶 +15%', () => {
    const s = ready();
    s.cash = 100000;
    withLaunchedProject(s);
    hireAgent(s, 'growth', createRng(1));
    const rng = createRng(33);
    for (let d = 0; d < 9; d++) {
      s.meta.day += 1;
      tickAgentsDay(s, rng); // 跨 day%7===1 的新周首日
    }
    expect(s.stats.leads).toBeGreaterThanOrEqual(1);
    expect(agentBizMult(s).leadBonus).toBeGreaterThan(0);
    expect(agentBizMult(s).leadBonus).toBeLessThanOrEqual(0.15);
    // butler 额外 40%：churn 乘子为其他智能体效果的 40%（support 未雇 → butler −8%）
    s.meta.stage = 5; // butler 解锁阶段
    expect(hireAgent(s, 'butler', createRng(1)).ok).toBe(true);
    const m = agentBizMult(s);
    expect(m.churnMult).toBeCloseTo(0.92, 6);
    expect(m.deliverIncome).toBeCloseTo(1 + 0.06, 6); // sales 未雇，butler 40%×15%=6%
  });

  it('regagent 在岗：注册类行动现金成本 -30%', () => {
    const s = ready(); // stage 4（regagent unlockStage）
    s.cash = 5000;
    const costBefore = executeAction(s, { t: 'act', id: 'registerSole' }, createRng(1));
    expect(costBefore.ok).toBe(true);
    expect(s.cash).toBe(5000 - 500);
    expect(hireAgent(s, 'regagent', createRng(1)).ok).toBe(true);
    s.entity = 'none';
    s.cash = 5000;
    const costAfter = executeAction(s, { t: 'act', id: 'registerSole' }, createRng(1));
    expect(costAfter.ok).toBe(true);
    expect(s.cash).toBe(5000 - Math.round(500 * 0.7)); // 350
  });

  it('weekStats 周清零 + agents Tab 本周贡献文案', () => {
    const s = ready();
    s.cash = 100000;
    hireAgent(s, 'support', createRng(1));
    const a = s.agents[0]!;
    const ws = weekStatsOf(a);
    ws.tickets = 42;
    ws.revenue = 1200;
    expect(weekContribText(ws)).toContain('工单 42');
    expect(weekContribText(ws)).toContain('流水 +¥1,200');
    expect(weekContribText(undefined)).toContain('还没开工');
    // 新周首日（day%7===1，即第 8 天）tickAgentsDay 清零重算
    s.meta.day = 6;
    tickAgentsDay(s, createRng(2));
    expect(weekStatsOf(a).tickets).toBe(42); // 周中不清（无在营项目，当日工单 0）
    s.meta.day = 8;
    tickAgentsDay(s, createRng(2));
    expect(weekStatsOf(a).tickets).toBeLessThan(42); // 周清零后重计
  });
});

// ============================================================
// W5 结局后继续 bug
// ============================================================

describe('[W5] 结局后继续', () => {
  it('canContinueFromSlot：空槽/终局档不可继续，经营档可继续（纯函数）', () => {
    expect(canContinueFromSlot(null).ok).toBe(false);
    const s = fresh();
    const alive = serialize(s);
    expect(canContinueFromSlot(alive).ok).toBe(true);
    s.meta.over = true;
    s.meta.endingKey = 'bankrupt';
    const over = serialize(s);
    const verdict = canContinueFromSlot(over);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('已落幕');
  });

  it('clearSlot：终局清除 auto 槽后 loadSlot === null（storage + 内存双清）', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => store.clear(),
      key: () => null,
      length: 0
    });
    try {
      const s = fresh();
      saveToSlot('auto', s);
      expect(loadSlot('auto')).not.toBeNull();
      clearSlot('auto');
      expect(loadSlot('auto')).toBeNull(); // 终局清槽后标题屏/继续经营无档可读
      // 终局型结局（非 active）→ renderEndingScreen 清 auto；主动结局保留（isActiveEnding 判定在 ending.ts，此处验证数据面）
      s.meta.over = true;
      s.meta.endingKey = 'suddenDeath';
      saveToSlot('auto', s);
      expect(canContinueFromSlot(loadSlot('auto')).ok).toBe(false); // 残留终局档同样拦下
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// ============================================================
// W7 项目看板（纯函数）
// ============================================================

describe('[W7] 项目看板', () => {
  it('pmfInterval：估计±噪声（区间上下限，钳 0-100）', () => {
    expect(pmfInterval(62, 11)).toBe('62±11（51-73）');
    expect(pmfInterval(5, 10)).toBe('5±10（0-15）');
    expect(pmfInterval(98, 9)).toBe('98±9（89-100）');
  });

  it('stageTimeline：7 阶段时间轴，当前高亮、之前 done、之后 future', () => {
    const tl = stageTimeline('launch');
    expect(tl).toHaveLength(7);
    expect(tl.map(d => d.label)).toEqual(['想法', '验证', '开发', '发布', '增长', '成熟', '衰退']);
    expect(tl[3]?.state).toBe('current');
    expect(tl[2]?.state).toBe('done');
    expect(tl[4]?.state).toBe('future');
    expect(stageTimeline('idea')[0]?.state).toBe('current');
    expect(stageTimeline('decline')[6]?.state).toBe('current');
  });

  it('grayRiskScore：灰产随 ageMonths/合规恶化累积，非灰产恒 0', () => {
    const p = { gray: true, ageMonths: 3 } as StateSlice['projects'][number];
    expect(grayRiskScore(p, 70)).toBe(43); // 25 + 18 + 0
    expect(grayRiskScore(p, 30)).toBe(75); // 25 + 18 + 32
    expect(grayRiskScore({ gray: false, ageMonths: 9 } as StateSlice['projects'][number], 0)).toBe(0);
    expect(grayRiskScore({ gray: true, ageMonths: 99 } as StateSlice['projects'][number], 0)).toBe(100); // 封顶
  });

  it('todayUnitEconomics：今日 Token 成本/毛利按单位经济占比折算', () => {
    // 客单价 100，Token 成本 40×指数 1 → 40% 成本占比
    const r = todayUnitEconomics(1000, 40, 100, 1);
    expect(r.tokenCost).toBeCloseTo(400, 6);
    expect(r.gross).toBeCloseTo(600, 6);
    expect(todayUnitEconomics(0, 40, 100, 1)).toEqual({ tokenCost: 0, gross: 0 });
  });
});

// ============================================================
// W8 细节批次
// ============================================================

describe('[W8] 细节深度', () => {
  it('deliverService 文案带完整数字拆解（底价×商业×报价×质量×市场）', () => {
    const s = ready();
    withLaunchedProject(s);
    s.ap = 3;
    s.energy = 100;
    const r = executeAction(s, { t: 'act', id: 'deliverService' }, createRng(5));
    expect(r.ok).toBe(true);
    expect(r.msg).toContain('入账 ¥');
    expect(r.msg).toContain('底价 ¥');
    expect(r.msg).toContain('报价');
    expect(r.msg).toContain('质量');
    expect(r.msg).toMatch(/× 商业Lv\d/);
  });

  it('周复盘建议层带数据：精力均值 <50 → 主焦点强制健康（数字写进文案）', () => {
    const s = fresh();
    s.flags.weekEnergySum = 41 * 7; // 均值 41
    s.flags.weekDays = 7;
    const review = weeklyReview(s);
    expect(review.facts.some(f => f.includes('精力均值 41'))).toBe(true);
    expect(review.suggestion).toContain('精力均值 41');
    expect(review.suggestion).toContain('健康');
    // 精力充足 → 常规瓶颈排序建议
    const s2 = fresh();
    s2.flags.weekEnergySum = 80 * 7;
    s2.flags.weekDays = 7;
    const review2 = weeklyReview(s2);
    expect(review2.suggestion).not.toContain('精力均值');
  });

  it('momArrow 环比箭头：涨/跌/持平/新增', () => {
    expect(momArrow(120, 100).text).toBe('▲ 20% vs 上月');
    expect(momArrow(120, 100).cls).toBe('c-green');
    expect(momArrow(80, 100).text).toBe('▼ 20% vs 上月');
    expect(momArrow(80, 100).cls).toBe('c-red');
    expect(momArrow(100.2, 100).text).toBe('— 持平');
    expect(momArrow(50, 0).text).toBe('▲ 新增');
    expect(momArrow(50, undefined).text).toBe(''); // 上月无月报
  });

  it('interpolateEventVars：事件 body 实时变量插值（现金/粉丝/日期/MRR）', () => {
    const s = fresh();
    s.cash = 12345;
    s.stats.followersPeak = 678;
    s.meta.day = 33;
    s.meta.month = 2;
    const out = interpolateEventVars('现金 {cash}，粉丝 {followers}，第 {day} 天，第 {month} 月，MRR {mrr}，跑道 {runway}，精力 {energy}，压力 {stress}', s);
    expect(out).toContain('¥12,345');
    expect(out).toContain('678');
    expect(out).toContain('第 33 天');
    expect(out).toContain('第 2 月');
    expect(out).toContain('¥0'); // 无项目 MRR
    expect(out).not.toMatch(/\{(cash|followers|day|month|mrr|runway|energy|stress)\}/);
    // 高流量事件 body 至少 10 条已接变量
    const wired = EVENT_DEFS.filter(d => /\{(?:cash|followers|day|month|runway|energy|stress|mrr)\}/.test(d.body));
    expect(wired.length).toBeGreaterThanOrEqual(10);
  });

  it('周焦点事件选择真正设置 s.focus（修复「选了不生效」）', () => {
    const s = fresh();
    const ev = findEventDef('weekly-focus')!;
    const r1 = resolveChoice(s, ev, 0, createRng(1)); // focus-health
    expect(r1.ok).toBe(true);
    expect(s.focus).toBe('health');
    const r3 = resolveChoice(s, ev, 2, createRng(1)); // no-focus
    expect(r3.ok).toBe(true);
    expect(s.focus).toBeNull();
  });

  it('招外包负现金缝修复：现金不足区间下限时拒绝（不再静默打负现金）', () => {
    const s = ready();
    withLaunchedProject(s);
    s.cash = 100; // 外包 effects cash [-3000,-500]，下限 500
    const r = executeAction(s, { t: 'act', id: 'outsourceHire' }, createRng(1));
    expect(r.ok).toBe(false);
    expect(r.msg).toContain('现金不足');
    expect(s.cash).toBe(100); // 未被扣
    s.ap = 3;
    s.energy = 100;
    s.cash = 3500; // ≥ 区间上限 3000：任何掷点都不打负
    const r2 = executeAction(s, { t: 'act', id: 'outsourceHire' }, createRng(1));
    expect(r2.ok).toBe(true);
    expect(s.cash).toBeGreaterThanOrEqual(500); // 区间扣款后 ≥ 下限
  });
});

// ============================================================
// W9 作者彩蛋
// ============================================================

describe('[W9] 作者彩蛋与溯源', () => {
  it('存档溯源：serialize 带 author/product 字段；isOfficialSave 识别第三方档', () => {
    const sv = serialize(fresh());
    expect(sv.author).toBe('Lai Jiacheng (c) 2026');
    expect(sv.product).toBe('OPC.exe');
    expect(isOfficialSave(sv)).toBe(true);
    expect(isOfficialSave({ ...sv, author: undefined })).toBe(false);
    expect(isOfficialSave(null)).toBe(false);
    void AUTHOR_TAG; void PRODUCT_TAG;
  });

  it('老张台词池 ≥3 条提到赖嘉诚（克制典故，毒舌风格不变）', () => {
    const named = ZHANG_LINES.filter(l => l.text.includes('赖嘉诚'));
    expect(named.length).toBeGreaterThanOrEqual(3);
    for (const l of named) expect(l.text.length).toBeLessThanOrEqual(60);
  });

  it('彩蛋事件 egg-laijiacheng-site：机会类低权重 once，独立站流量小幅+', () => {
    const ev = findEventDef('egg-laijiacheng-site');
    expect(ev).toBeDefined();
    expect(ev!.cat).toBe('opportunity');
    expect(ev!.weight).toBeLessThanOrEqual(3);
    expect(ev!.once).toBe(true);
    expect(ev!.when[0]).toEqual(['day', '>=', 10]);
    const c = ev!.choices[0]!;
    expect(c.effects.some(e => e.k === 'followers.site')).toBe(true);
  });

  it('知识点 source ≥4 条署「作者赖嘉诚一手实践」', () => {
    const signed = KP_DEFS.filter(k => k.source.includes('作者赖嘉诚一手实践'));
    expect(signed.length).toBeGreaterThanOrEqual(4);
  });

  it('新闻条 30 条已覆盖（s6 同步断言此处复核锚点与科普向）', () => {
    expect(NEWS_TICKER.length).toBe(30);
    expect(NEWS_TICKER.some(n => n.text.includes('灵活就业社保补贴'))).toBe(true);
    expect(NEWS_TICKER.some(n => n.text.includes('智能体外包市场'))).toBe(true);
    expect(NEWS_TICKER.some(n => n.text.includes('烧 Token'))).toBe(true);
    expect(NEWS_TICKER.some(n => n.text.includes('SaaS 订阅数破千'))).toBe(true);
    expect(NEWS_TICKER.some(n => n.text.includes('代运营'))).toBe(true);
    expect(NEWS_TICKER.some(n => n.text.includes('内容工厂'))).toBe(true);
  });
});

// ============================================================
// 回归：全链路浸泡（日结改造后的不变量）
// ============================================================

describe('[v0.10] 全链路回归', () => {
  it('31 天完整局：不变量全绿、日结口径无 NaN、月结对账日志出现', () => {
    const g = createGame(setup({ seed: 2026 }));
    const s = g.state as StateSlice;
    withLaunchedProject(s);
    let sawReconcile = false;
    for (let d = 0; d < 31 && !s.meta.over; d++) {
      const rep = g.advanceDay();
      if (rep.logs.some(l => l.msg.includes('第') && l.msg.includes('天结束：现金') && l.msg.includes('今日净流'))) {
        sawReconcile = true;
      }
      expect(Number.isFinite(s.cash)).toBe(true);
      expect(Number.isFinite(s.dailyFlow.projIn)).toBe(true);
    }
    expect(sawReconcile, '晚间小结应包含今日净流').toBe(true);
    expect(assertInvariants(s)).toEqual([]);
    expect(s.stats.totalRevenue).toBeGreaterThan(0); // 项目日结 30 天累计入账
  });
});
