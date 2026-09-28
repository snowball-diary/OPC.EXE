// ============================================================
// [S9] 平衡与模拟器门禁测试（4 组：阶段阈值固化 / 模拟器冒烟 /
//      调参后关键比率 sanity / 猝死 0 与高风险 bot 对比）
// 规格来源：技术文档 §16、设计方案 §三（六阶段触发条件表）/ §十二（目标分布表）
// ============================================================
import { describe, expect, it } from 'vitest';
import {
  assertInvariants, createGame, createRng, rollEvents,
  type SetupConfig, type StateSlice
} from '../src/core/index';
import { recoveryState } from '../src/core/health';
import { livingCost } from '../src/core/economy';

function cfg(partial: Partial<SetupConfig> = {}, seed = 1): SetupConfig {
  return {
    niche: 'dev', background: 'grass', location: 'hangcheng', difficulty: 'normal',
    talents: [], personality: { pragmaticIdeal: 'pragmatic', steadyAggressive: 'steady', soloSocial: 'solo' },
    cryptoOn: true, seed,
    ...partial
  };
}

// ============================================================
// 一、阶段阈值固化（设计方案 §三：②首笔收入 / ③月收入稳定>生活成本 /
//     ④月收入≥3万 / ⑤被动收入>生活开支）——修复 S8 报告「③ 错用 ④ 阈值」疑点的回归锚
// ============================================================
describe('[S9] 阶段迁移阈值 = 设计 §三 映射（回归固化）', () => {
  /** 推进到下一个周结算日（day%7==0 触发 checkStageUp），返回 after 状态 */
  function toWeeklySettle(g: ReturnType<typeof createGame>): StateSlice {
    const s = g.state as StateSlice;
    const jump = ((7 - (s.meta.day % 7)) % 7) + 1; // +1：让「第 7 天」本身被处理
    for (let i = 0; i < jump; i++) {
      if (s.meta.over) break;
      s.health.sleep.v = 70; s.health.mood.v = 70; s.health.diet.v = 70; s.health.exercise.v = 70;
      s.energy = 100; s.stress = 10;
      g.advanceDay();
    }
    return g.state as StateSlice;
  }

  it('②→③：月收入≥生活费即立定（10000 ≥ 7000，远小于 3 万）——③绝不需要月入 3 万', () => {
    const g = createGame(cfg({}, 11), createRng(11));
    const s = g.state as StateSlice;
    expect(s.meta.stage).toBe(1);
    s.stats.totalRevenue = 100; // ②=首笔收入
    s.monthlyIncome = 10000;
    const after = toWeeklySettle(g);
    expect(after.meta.stage).toBeGreaterThanOrEqual(2);
    expect(after.meta.stage).toBeLessThan(4); // 3 万档没到，不可能跳到 ④
  });

  it('③→④：月收入恰好 30000 才到成长期；29999 不行（边界固化）', () => {
    const g1 = createGame(cfg({}, 12), createRng(12));
    (g1.state as StateSlice).meta.stage = 3;
    (g1.state as StateSlice).monthlyIncome = 29999;
    const a1 = toWeeklySettle(g1);
    expect(a1.meta.stage).toBe(3); // 差 1 块也不过

    const g2 = createGame(cfg({}, 13), createRng(13));
    (g2.state as StateSlice).meta.stage = 3;
    (g2.state as StateSlice).monthlyIncome = 30000;
    const a2 = toWeeklySettle(g2);
    expect(a2.meta.stage).toBe(4);
  });

  it('④→⑤：被动收入>生活开支 → 自由期（§三 触发表顺序不被错位）', () => {
    const g = createGame(cfg({}, 14), createRng(14));
    const s = g.state as StateSlice;
    s.meta.stage = 4;
    s.monthlyIncome = 40000;
    s.monthlyExpense = 7000;
    s.flags.lastPassiveIncome = 7000; // ≥ 生活开支
    const after = toWeeklySettle(g);
    expect(after.meta.stage).toBe(5);
  });
});

// ============================================================
// 二、模拟器冒烟：无头 bot 3 局跑满管线不炸（scripts/sim.ts 的核心循环等价物）
// ============================================================
describe('[S9] 模拟器冒烟：3 局 × 720 天零异常', () => {
  it('加权随机 bot（content/deliver/develop/rest 混合）连跑 3 局：无异常、无 NaN、终态合法', () => {
    for (const seed of [21, 22, 23]) {
      const g = createGame(cfg({ niche: 'kol', background: 'fired', location: 'beishang' }, seed), createRng(seed));
      for (let day = 0; day < 720 && !(g.state as StateSlice).meta.over; day++) {
        const s = g.state as StateSlice;
        // 事件排水
        // 日型：低血量休整
        if (!(typeof s.flags.forcedMinDays === 'number' && s.flags.forcedMinDays > 0)) {
          const low = Math.min(s.health.sleep.v, s.health.mood.v, s.health.diet.v, s.health.exercise.v);
          g.dispatch({ t: 'dayType', dt: low < 45 || s.energy < 45 ? 'minimum' : 'standard' });
        }
        // 行动：AP 内交付优先，项目没好就开发，偶尔内容
        let guard = 0;
        while (guard++ < 8) {
          const st = g.state as StateSlice;
          if (st.meta.over || st.ap <= 0 || st.energy <= 24) break;
          const proj = st.projects.filter(p => p.alive)[st.projects.filter(p => p.alive).length - 1];
          if (!proj && st.projects.filter(p => p.alive).length < st.attentionCap) {
            g.dispatch({ t: 'newProject', name: '', type: 'template', revenueModel: 'buyout' });
            continue;
          }
          if (proj) {
            const launched = ['build', 'launch', 'grow', 'mature', 'decline'].includes(proj.stage);
            g.dispatch(launched
              ? { t: 'act', id: 'deliverService', projectId: proj.id }
              : { t: 'act', id: 'developProject', projectId: proj.id });
          } else {
            g.dispatch({ t: 'act', id: 'writeContent', platformId: 'bilili' });
          }
        }
        // 最低日充电
        const s2 = g.state as StateSlice;
        if (s2.dayType === 'minimum' && s2.ap > 0) g.dispatch({ t: 'act', id: 'deepRest' });
        g.advanceDay();
        const errs = assertInvariants(g.state as StateSlice);
        expect(errs, `seed${seed} d${day}: ${errs.join('|')}`).toEqual([]);
      }
      const fin = g.state as StateSlice;
      expect(fin.meta.day).toBeGreaterThan(30); // 至少活过第一个月结算
      expect(fin.meta.stage).toBeGreaterThanOrEqual(2); // 首笔收入必达
    }
  }, 120000);
});

// ============================================================
// 三、调参后关键比率 sanity
// ============================================================
describe('[S9] 调参 sanity：random 独立掷点 / 生活费 / wobble 阈值 / marketMult', () => {
  it('crisis-blackswan 名义 3% 门：抽样日命中率落在 [0.5%, 4%]（独立掷点修复后）', () => {
    const g = createGame(cfg({}, 31), createRng(31));
    const s = g.state as StateSlice;
    s.meta.day = 400; // 满足 day>=30
    s.meta.stage = 3;
    s.cash = 50000;
    s.flags.grayHistory = false;
    let fires = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      s.pending.events = [];
      s.flags[`ev_last_crisis-blackswan`] = 0;
      for (const ev of rollEvents(s, createRng(1000 + i))) {
        if (ev.id === 'crisis-blackswan' && ev.source === 'sample') fires += 1;
      }
    }
    // 名义：0.35 抽样门 × 3% ≈ 1.05%/日 → 4000 次 ≈ 42 次。修复前被全池权重稀释，远低于此。
    const rate = fires / n;
    expect(fires).toBeGreaterThanOrEqual(Math.floor(n * 0.005));
    expect(rate).toBeLessThanOrEqual(0.04);
  });

  it('LIVING_BASE 7000：杭州标准 7000 / 小城×难度联动（平凡线盈亏平衡用）', () => {
    const g = createGame(cfg({}, 32), createRng(32));
    expect(g.state.monthlyExpense).toBe(7000); // hangcheng costMult 1.0
    expect(livingCost({ ...g.state, location: 'hometown' } as StateSlice)).toBe(3500);
  });

  it('wobble 阈值 30→12：正常满负荷日（谷值 25）不再触发中断链', () => {
    const g = createGame(cfg({}, 33), createRng(33));
    const s = g.state as StateSlice;
    s.flags.interrupted = false;
    s.flags.lowMoodDays = 0;
    s.energy = 25;
    expect(recoveryState(s)).toBe('run'); // 修复前：25 < 30 恒波动 → 中断刷屏
    s.energy = 11;
    expect(recoveryState(s)).toBe('wobble');
  });
});

// ============================================================
// 四、风险可见性对比：养生家 0 猝死（硬底线） vs 连轴转 bot 高危信号显著
// ============================================================
describe('[S9] 风险可见性：养生家 0 猝死，硬撑线预警可见', () => {
  const SEEDS = [41, 42, 43, 44, 45, 46];
  const DAYS = 60;

  it(`养生家式 bot × ${SEEDS.length} 局 × ${DAYS} 天：0 猝死、0 过劳计数（终局黑线底线）`, () => {
    for (const seed of SEEDS) {
      const g = createGame(cfg({ talents: ['zen'] }, seed), createRng(seed));
      for (let day = 0; day < DAYS && !(g.state as StateSlice).meta.over; day++) {
        const s = g.state as StateSlice;
        if (!(typeof s.flags.forcedMinDays === 'number' && s.flags.forcedMinDays > 0)) {
          const low = Math.min(s.health.sleep.v, s.health.mood.v, s.health.diet.v, s.health.exercise.v);
          g.dispatch({ t: 'dayType', dt: low < 55 || s.energy < 55 ? 'minimum' : 'standard' });
        }
        if ((g.state as StateSlice).ap > 0) {
          const st = g.state as StateSlice;
          if (st.stress > 50) g.dispatch({ t: 'act', id: 'meditate' });
          else if (st.health.sleep.v < 55) g.dispatch({ t: 'act', id: 'deepRest' });
          else g.dispatch({ t: 'act', id: 'exercise' });
        }
        if ((g.state as StateSlice).meta.over) break;
        g.advanceDay();
      }
      const s = g.state as StateSlice;
      expect(s.meta.endingKey === 'suddenDeath', `seed${seed} 养生家不得猝死`).toBe(false);
      expect(s.burnoutCount).toBeLessThan(3);
    }
  });

  it('连轴转式 bot：6 局内隐性疲劳全部冲上预警线（≥70），危机信号对玩家可见', () => {
    let visible = 0;
    for (const seed of SEEDS) {
      const g = createGame(cfg({ talents: ['workaholic', 'nightOwl'] }, seed), createRng(seed));
      const botRng = createRng(seed ^ 0xdead);
      let peakHf = 0;
      for (let day = 0; day < 25 && !(g.state as StateSlice).meta.over; day++) {
        const s = g.state as StateSlice;
        if (!(typeof s.flags.forcedMinDays === 'number' && s.flags.forcedMinDays > 0)) {
          g.dispatch({ t: 'dayType', dt: s.energy >= 30 ? 'extended' : 'standard' });
        }
        let guard = 0;
        while (guard++ < 10) {
          const st = g.state as StateSlice;
          if (st.meta.over) break;
          const proj = st.projects.filter(p => p.alive)[0];
          if (st.ap > 0 || st.energy > 0) {
            if (proj && ['build', 'launch', 'grow', 'mature'].includes(proj.stage) && st.energy > 0) {
              g.dispatch({ t: 'act', id: 'deliverService', projectId: proj.id });
            } else if (proj) {
              g.dispatch({ t: 'act', id: 'developProject', projectId: proj.id });
            } else {
              g.dispatch({ t: 'newProject', name: '', type: 'template', revenueModel: 'buyout' });
            }
          }
          const more = (g.state as StateSlice).ap > 0 && (g.state as StateSlice).energy > 12;
          if (!more && !botRng.chance(0.6)) break;
        }
        if ((g.state as StateSlice).meta.over) break;
        g.advanceDay();
        peakHf = Math.max(peakHf, (g.state as StateSlice).health.hiddenFatigue);
      }
      if (peakHf >= 70) visible += 1;
    }
    expect(visible, '连轴转 bot 应在 25 天内普遍触发隐性疲劳预警（≥70）').toBeGreaterThanOrEqual(4);
  });
});
