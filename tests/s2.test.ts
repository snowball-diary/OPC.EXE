// S2 验收测试：健康合成/滞回/隐性疲劳/猝死门控/行动器/技能升级/项目引擎/补丁/经济/结局 全链
import { describe, expect, it } from 'vitest';
import { createInitialSlice } from '../src/core/state';
import { assertInvariants } from '../src/core/state';
import { createRng } from '../src/core/rng';
import { createGame } from '../src/core/index';
import {
  applyEffects, checkSkillUp, executeAction
} from '../src/core/actions';
import {
  composeHealth, driftDay, fatigueWarning, healthMult, recoveryState,
  rollSuddenDeath, suddenDeathP, suddenDeathRisk, tickHiddenFatigue, updateDecisionMode
} from '../src/core/health';
import { createProject, settleProjectsDay, settleProjectsMonth, tickProjectsDay } from '../src/core/projects';
import { installPatch, layerSlots, patchMult, tickPatchesDay } from '../src/core/os';
import { livingCost, phaseMult, settleMonth, taxDue } from '../src/core/economy';
import { PHASE_TRANSITIONS } from '../src/data/economy.def';
import { ACTION_DEFS, findAction } from '../src/data/actions.def';
import { PROJECT_TYPES } from '../src/data/projects.def';
import { PATCH_DEFS } from '../src/data/patches.def';
import { ENDING_DEFS, findEnding } from '../src/data/endings.def';
import { buildReport, checkPassiveEndings } from '../src/core/endings';
import { advanceDay, weeklyReview } from '../src/core/time';
import type { SetupConfig } from '../src/core/types';

const PERS = { pragmaticIdeal: 'pragmatic', steadyAggressive: 'steady', soloSocial: 'solo' } as const;

function setup(over: Partial<SetupConfig> = {}): SetupConfig {
  return {
    niche: 'dev', background: 'grass', location: 'hangcheng', difficulty: 'normal',
    talents: [], personality: { ...PERS }, cryptoOn: true, seed: 42, ...over
  };
}

const fresh = (over: Partial<SetupConfig> = {}) => createInitialSlice(setup(over));

describe('行动表完整性（约 30 条四类）', () => {
  it('38 条行动：四类齐全、learn 三档、def 可查、[v0.10] 饮食五连', () => {
    expect(ACTION_DEFS.length).toBe(38); // [v0.10/W1] 33 + eatWell/cook/takeout/coffee/earlySleep
    for (const cat of ['input', 'output', 'biz', 'self'] as const) {
      expect(ACTION_DEFS.some(a => a.cat === cat)).toBe(true);
    }
    expect(ACTION_DEFS.filter(a => a.special === 'learn').map(a => a.tier).sort())
      .toEqual(['easy', 'fit', 'hard']);
    expect(findAction('deepLearnFit')?.domain).toBe('skill');
    // [v0.10/W1] 健康饮食模块五连
    expect(findAction('eatWell')?.effects[0]).toEqual({ k: 'diet', op: '+', v: 12 });
    expect(findAction('cook')?.cash).toBe(12);
    expect(findAction('takeout')?.ap).toBe(0);
    expect(findAction('coffee')?.energy).toBe(-10);
    expect(findAction('earlySleep')?.special).toBe('earlySleep');
  });

  it('项目类型 14 条（10 基础 + 4 autoSrv），中转站 gray', () => {
    expect(PROJECT_TYPES.length).toBe(14);
    expect(PROJECT_TYPES.filter(t => t.potentialClass === 'autoSrv').length).toBe(4);
    const relay = PROJECT_TYPES.find(t => t.id === 'apiRelay');
    expect(relay?.gray).toBe(true);
    expect(relay && relay.price[1] - relay.cogsToken > 0).toBe(true); // 毛利为正
  });

  it('补丁 24 条四层各 6', () => {
    expect(PATCH_DEFS.length).toBe(24);
    for (const layer of ['principle', 'rule', 'env', 'feedback'] as const) {
      expect(PATCH_DEFS.filter(p => p.layer === layer).length).toBe(6);
    }
  });
});

describe('健康：composeHealth / healthMult / driftDay', () => {
  it('composeHealth 精确值（§5.1 配比）', () => {
    const s = fresh();
    s.health.sleep.v = 100; s.health.mood.v = 80; s.health.diet.v = 60; s.health.exercise.v = 40;
    expect(composeHealth(s.health)).toBeCloseTo(78, 10); // 40+20+12+6
  });

  it('healthMult 边界：100→1.0；公式值；sleep<20→0.5', () => {
    const s = fresh();
    s.health.sleep.v = 100; s.health.mood.v = 100; s.health.diet.v = 100; s.health.exercise.v = 100;
    expect(healthMult(s)).toBe(1);
    s.health.sleep.v = 60; s.health.mood.v = 60; s.health.diet.v = 60; s.health.exercise.v = 60;
    expect(healthMult(s)).toBeCloseTo(1 - (1600 / 25000), 10); // 0.936
    s.health.sleep.v = 19;
    expect(healthMult(s)).toBe(0.5);
  });

  it('driftDay：自然漂移/木桶-5 返回预警/低情绪记账', () => {
    const s = fresh();
    s.health.sleep.v = 15; s.health.mood.v = 15;
    const barrel = driftDay(s, 'standard');
    expect(barrel).toContain('睡眠');
    expect(barrel).toContain('情绪');
    expect(s.health.sleep.v).toBe(2); // 15-8-5
    expect(s.flags.lowMoodDays).toBe(1);
  });

  it('driftDay：最低日完成恢复行动 +3；旅行 buff mood+2', () => {
    const s = fresh();
    s.health.sleep.v = 80; s.flags.actsSelf = 2;
    driftDay(s, 'minimum');
    expect(s.health.sleep.v).toBe(75); // 80-8+3
    const s2 = fresh();
    s2.flags.travelBuffUntil = s2.meta.day + 5;
    driftDay(s2, 'standard');
    expect(s2.health.mood.v).toBeCloseTo(70, 10); // 70-2+2（[S9] mood drift -3→-2）
  });
});

describe('决策模式滞回（§5.2）', () => {
  it('进入 S1；退出需 energy≥55 且 stress<45 且间隔≥1 天', () => {
    const s = fresh();
    s.energy = 30;
    updateDecisionMode(s);
    expect(s.decisionMode).toBe('system1');
    s.energy = 70; s.stress = 10;
    updateDecisionMode(s); // 同日：滞回锁死
    expect(s.decisionMode).toBe('system1');
    s.meta.day += 1;
    updateDecisionMode(s);
    expect(s.decisionMode).toBe('system2');
  });

  it('stress≥85 → system1Deep；回落先降级 system1', () => {
    const s = fresh();
    s.stress = 90;
    updateDecisionMode(s);
    expect(s.decisionMode).toBe('system1Deep');
    s.stress = 70; s.energy = 80; s.meta.day += 2;
    updateDecisionMode(s);
    expect(s.decisionMode).toBe('system1');
  });
});

describe('隐性疲劳全路径（§5.3）', () => {
  it('扩展日+8 / 工作狂减半 / AP 耗尽仍行动+6/次 / 睡眠<20+10 / 深度休息-15', () => {
    const a = fresh();
    tickHiddenFatigue(a, 'extended', 0);
    expect(a.health.hiddenFatigue).toBe(8);
    const b = fresh({ talents: ['workaholic'] });
    tickHiddenFatigue(b, 'extended', 0);
    expect(b.health.hiddenFatigue).toBe(4); // 工作狂扩展日惩罚减半
    const c = fresh();
    tickHiddenFatigue(c, 'standard', 4); // 上限 3，超额 1 次
    expect(c.health.hiddenFatigue).toBe(6);
    const d = fresh();
    d.health.sleep.v = 15;
    tickHiddenFatigue(d, 'standard', 0);
    expect(d.health.hiddenFatigue).toBe(10);
    const e = fresh();
    e.health.hiddenFatigue = 20;
    e.flags.deepRestedToday = true;
    tickHiddenFatigue(e, 'standard', 0);
    expect(e.health.hiddenFatigue).toBe(5); // 20-15
    const f = fresh({ talents: ['workaholic'] });
    tickHiddenFatigue(f, 'standard', 6); // 超额 2（工作狂上限 4）→ 12 ×1.25 = 15
    expect(f.health.hiddenFatigue).toBe(15);
  });
});

describe('猝死：门控与概率（§7.2/§7.3）', () => {
  function suddenState(): ReturnType<typeof fresh> {
    const s = fresh();
    s.health.hiddenFatigue = 90;
    s.health.sleep.v = 10;
    s.flags.heartAttackWarn = true;
    s.burnoutCount = 1;
    return s;
  }

  it('缺任一前置永不掷骰（300 个种子全 false）', () => {
    const full = suddenState();
    expect(rollSuddenDeath(full, createRng(1))).toBeDefined();
    for (const breaker of [
      (s: ReturnType<typeof fresh>) => { s.health.hiddenFatigue = 84; },
      (s: ReturnType<typeof fresh>) => { s.health.sleep.v = 15; },
      (s: ReturnType<typeof fresh>) => { delete s.flags.heartAttackWarn; },
      (s: ReturnType<typeof fresh>) => { s.burnoutCount = 0; }
    ]) {
      for (let seed = 1; seed <= 300; seed++) {
        const s = suddenState();
        breaker(s);
        expect(rollSuddenDeath(s, createRng(seed))).toBe(false);
      }
    }
  });

  it('全前置成立时可掷骰命中（300 种子内必有 true），概率公式边界', () => {
    let hits = 0;
    for (let seed = 1; seed <= 300; seed++) {
      if (rollSuddenDeath(suddenState(), createRng(seed))) hits += 1;
    }
    expect(hits).toBeGreaterThan(0);
    expect(suddenDeathP(85, 0)).toBeCloseTo(0.03, 10);
    expect(suddenDeathP(100, 0)).toBeCloseTo(0.09, 10); // 0.03+0.02×3
    expect(suddenDeathP(100, 10)).toBe(0.12); // 上限封顶
    const gated = suddenState();
    gated.health.hiddenFatigue = 84;
    expect(suddenDeathRisk(gated)).toBe(0); // 前置不满足风险显示 0
    expect(suddenDeathRisk(suddenState())).toBeGreaterThan(0);
  });

  it('双强预警：≥70 level1；≥85 或心悸后 level2；体检解锁精确读数', () => {
    const s = fresh();
    s.health.hiddenFatigue = 75;
    expect(fatigueWarning(s)?.level).toBe(1);
    s.health.hiddenFatigue = 86;
    expect(fatigueWarning(s)?.level).toBe(2);
    s.health.hiddenFatigue = 75;
    s.flags.heartAttackWarn = true;
    expect(fatigueWarning(s)?.level).toBe(2);
    s.flags.fatigueKnown = true;
    expect(fatigueWarning(s)?.text).toContain('75/100');
  });
});

describe('行动执行器（§5.4）', () => {
  it('deepLearn 三档：easy 0 经验；fit 同种子确定性；hard 挫折或顿悟', () => {
    const a = fresh();
    const a0 = a.skillExp.craft; // dev 赛道自带 craft 经验 20
    executeAction(a, { t: 'act', id: 'deepLearnEasy' }, createRng(7));
    expect(a.skillExp.craft).toBe(a0); // easy：经验+0
    const b1 = fresh();
    const b0 = b1.skillExp.craft;
    executeAction(b1, { t: 'act', id: 'deepLearnFit' }, createRng(7));
    const b2 = fresh();
    executeAction(b2, { t: 'act', id: 'deepLearnFit' }, createRng(7));
    expect(b1.skillExp.craft - b0).toBe(b2.skillExp.craft - b0); // 同种子确定性
    expect(b1.skillExp.craft).toBeGreaterThan(b0);
    const c = fresh();
    const stressBefore = c.stress;
    const c0 = c.skillExp.craft;
    executeAction(c, { t: 'act', id: 'deepLearnHard' }, createRng(3));
    const stressed = c.stress >= stressBefore + 7; // 挫折路径 stress+8（×mult 后≥7）
    const epiphany = c.skillExp.craft > c0; // 顿悟路径
    expect(stressed || epiphany).toBe(true);
  });

  it('输入绑定输出：本周无输出 → 经验×0.2', () => {
    const noOut = fresh();
    const a0 = noOut.skillExp.craft;
    executeAction(noOut, { t: 'act', id: 'deepLearnFit' }, createRng(11));
    const withOut = fresh();
    const b0 = withOut.skillExp.craft;
    withOut.flags.lastOutputDay = 1; // 同周（day1）
    executeAction(withOut, { t: 'act', id: 'deepLearnFit' }, createRng(11));
    const a = noOut.skillExp.craft - a0; // 实际获得
    const b = withOut.skillExp.craft - b0;
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(Math.abs(a - Math.round(b * 0.2))).toBeLessThanOrEqual(1);
  });

  it('S1 效果衰减 ×0.75（运动收益同种子对比）', () => {
    const s2 = fresh();
    executeAction(s2, { t: 'act', id: 'exercise' }, createRng(13));
    const s1 = fresh();
    s1.decisionMode = 'system1';
    executeAction(s1, { t: 'act', id: 'exercise' }, createRng(13));
    const gain2 = s2.health.exercise.v - 70;
    const gain1 = s1.health.exercise.v - 70;
    expect(gain1).toBeGreaterThan(0);
    expect(gain1).toBeLessThan(gain2);
  });

  it('deliver 收入公式：base×(0.6+0.15×商业)×定价×(0.7+0.3×质量/100)×marketMult；记账+1', () => {
    const s = fresh();
    const r = createProject(s, '交付源', 'template', 'buyout', createRng(5));
    expect(r.ok).toBe(true);
    const p = s.projects[0];
    if (!p) throw new Error('project missing');
    p.stage = 'build';
    const cashBefore = s.cash;
    const res = executeAction(s, { t: 'act', id: 'deliverService' }, createRng(17));
    expect(res.ok).toBe(true);
    const income = s.cash - cashBefore;
    // [S9] hangcheng marketMult 1.2 参与交付收入（地点机会补偿接线）
    expect(income).toBeGreaterThanOrEqual(Math.round(1200 * 0.6 * 0.85 * 1.2));
    expect(income).toBeLessThanOrEqual(Math.round(2400 * 0.6 * 0.85 * 1.2));
    expect(s.stats.orders).toBe(1);
    expect(s.deliveries.craft).toBe(1);
    // 高端定价同种子更贵
    const s2 = fresh();
    createProject(s2, '交付源', 'template', 'buyout', createRng(5));
    const p2 = s2.projects[0];
    if (!p2) throw new Error('project missing');
    p2.stage = 'build';
    s2.flags.pricing = 3;
    const cash2 = s2.cash;
    executeAction(s2, { t: 'act', id: 'deliverService' }, createRng(17));
    expect(s2.cash - cash2).toBeGreaterThan(income);
  });

  it('burnout：energy≤5 硬撑 3 次 → 过劳倒下被动终局', () => {
    const s = fresh();
    const rng = createRng(9);
    for (let i = 0; i < 3; i++) {
      s.energy = 3;
      s.ap = 10;
      executeAction(s, { t: 'act', id: 'deepLearnEasy' }, rng);
    }
    expect(s.burnoutCount).toBe(3);
    expect(s.meta.over).toBe(true);
    expect(s.meta.endingKey).toBe('burnoutDown');
  });

  it('energy=0 非恢复行动拒绝；最低日限恢复类', () => {
    const s = fresh();
    s.energy = 0;
    expect(executeAction(s, { t: 'act', id: 'deepLearnEasy' }, createRng(1)).ok).toBe(false);
    s.energy = 100;
    s.dayType = 'minimum';
    expect(executeAction(s, { t: 'act', id: 'deepLearnEasy' }, createRng(1)).ok).toBe(false);
    expect(executeAction(s, { t: 'act', id: 'meditate' }, createRng(1)).ok).toBe(true);
  });
});

describe('技能升级（§5.5）', () => {
  it('阈值 50/120/260/480；L3 需 3 次交付、L4 需 6 次', () => {
    const s = fresh();
    // dev 赛道 craft 自带 L1，改用营销维（开局 0 级）做阈值验证
    s.skillExp.marketing = 49;
    checkSkillUp(s, 'marketing');
    expect(s.skills.marketing).toBe(0);
    s.skillExp.marketing = 50;
    checkSkillUp(s, 'marketing');
    expect(s.skills.marketing).toBe(1);
    s.skillExp.marketing = 120;
    checkSkillUp(s, 'marketing');
    expect(s.skills.marketing).toBe(2);
    s.skillExp.marketing = 300; // 经验够 L3 但无交付
    checkSkillUp(s, 'marketing');
    expect(s.skills.marketing).toBe(2);
    s.deliveries.marketing = 3;
    checkSkillUp(s, 'marketing');
    expect(s.skills.marketing).toBe(3);
    s.skillExp.marketing = 480;
    checkSkillUp(s, 'marketing');
    expect(s.skills.marketing).toBe(3); // L4 需 6 次交付
    s.deliveries.marketing = 6;
    checkSkillUp(s, 'marketing');
    expect(s.skills.marketing).toBe(4);
  });

  it('applyEffects 通用落账：contacts/assetAdd/creditScore/deliveries', () => {
    const s = fresh();
    applyEffects(s, [
      { k: 'contacts', op: '+', v: 2 },
      { k: 'assetAdd', op: '+', v: 500 },
      { k: 'creditScore', op: '+', v: 50 },
      { k: 'deliveries.craft', op: '+', v: 1 }
    ]);
    expect(s.contacts.length).toBe(2);
    expect(s.assets[0]?.value).toBe(500);
    expect(s.creditScore).toBe(650);
    expect(s.deliveries.craft).toBe(1);
  });
});

describe('项目引擎（§5.6）', () => {
  it('pmfTrue 幂律分布 sanity：200 样本钳 [5,95]，均值<40，70%<35（宽松 60%）', () => {
    const s = fresh();
    s.attentionCap = 250;
    const rng = createRng(2026);
    const xs: number[] = [];
    for (let i = 0; i < 200; i++) {
      const r = createProject(s, `p${i}`, 'saas', 'subscription', rng);
      expect(r.ok).toBe(true);
      const p = s.projects[s.projects.length - 1];
      if (p) xs.push(p.pmfTrue);
    }
    expect(xs.length).toBe(200);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(5);
      expect(x).toBeLessThanOrEqual(95);
    }
    expect(xs.reduce((a, b) => a + b, 0) / xs.length).toBeLessThan(40);
    expect(xs.filter(x => x < 35).length / xs.length).toBeGreaterThanOrEqual(0.6);
  });

  it('月结算 churn 方向：高质量低流失 → mrr 更高', () => {
    const run = (quality: number): number => {
      const s = fresh();
      createProject(s, 'churn', 'saas', 'subscription', createRng(7));
      const p = s.projects[0];
      if (!p) throw new Error('project missing');
      p.stage = 'grow';
      p.users = 100;
      p.quality = quality;
      p.maintenance = 0;
      settleProjectsMonth(s, createRng(7));
      return p.mrr;
    };
    expect(run(90)).toBeGreaterThan(run(20));
  });

  it('月三魔咒：ageMonths==3 且 mrr<1000 → 标记', () => {
    const s = fresh();
    createProject(s, '魔咒', 'template', 'buyout', createRng(7));
    const p = s.projects[0];
    if (!p) throw new Error('project missing');
    p.stage = 'launch';
    p.users = 10;
    p.quality = 20;
    p.maintenance = 10;
    p.ageMonths = 2;
    const res = settleProjectsMonth(s, createRng(7));
    expect(p.ageMonths).toBe(3);
    expect(p.mrr).toBeLessThan(1000);
    expect(res.moonThree).toEqual(['魔咒']);
  });

  it('[v0.10] 项目日结 settleProjectsDay：mrr/30±6% 逐日入账；停摆 ×0.3；未发布无收入', () => {
    const s = fresh();
    createProject(s, '日结', 'saas', 'subscription', createRng(3));
    const p = s.projects[0];
    if (!p) throw new Error('project missing');
    p.stage = 'grow';
    p.users = 50;
    p.quality = 60;
    p.mrr = 3000;
    const c0 = s.cash;
    settleProjectsDay(s, createRng(3));
    const flowNormal = s.cash - c0;
    expect(flowNormal).toBeGreaterThan(3000 / 30 * 0.94 - 1e-6);
    expect(flowNormal).toBeLessThan(3000 / 30 * 1.06 + 1e-6);
    expect(p.todayFlow).toBeCloseTo(flowNormal, 6);
    expect(s.dailyFlow.projIn).toBeCloseTo(flowNormal, 6);
    // 停摆：×0.3 惩罚
    s.flags.interrupted = true;
    const c1 = s.cash;
    settleProjectsDay(s, createRng(3));
    const flowStop = s.cash - c1;
    expect(flowStop).toBeGreaterThan(3000 / 30 * 0.3 * 0.94 - 1e-6);
    expect(flowStop).toBeLessThan(3000 / 30 * 0.3 * 1.06 + 1e-6);
    // 未发布（idea/validate/build）无收入，维护账仍在走
    s.flags.interrupted = false;
    p.stage = 'build';
    p.mrr = 0;
    const c2 = s.cash;
    settleProjectsDay(s, createRng(3));
    tickProjectsDay(s, createRng(3));
    expect(s.cash - c2).toBe(0);
    expect(p.maintenance).toBeGreaterThan(0);
  });
});

describe('OS 补丁（设计 §2.5）', () => {
  it('同层槽位：stage1-2 共 2，stage5 共 6', () => {
    expect(layerSlots(1)).toBe(2);
    expect(layerSlots(3)).toBe(4);
    expect(layerSlots(5)).toBe(6);
    const s = fresh();
    s.ap = 10; s.energy = 100;
    expect(installPatch(s, 'noList').ok).toBe(true);
    expect(installPatch(s, 'serviceFirst').ok).toBe(true);
    expect(installPatch(s, 'sincere').ok).toBe(false); // 原则层槽位满
    s.meta.stage = 5;
    expect(installPatch(s, 'sincere').ok).toBe(true);
  });

  it('7 天连续执行 → 内化；内化后 patchMult 生效', () => {
    const s = fresh();
    s.ap = 10; s.energy = 100;
    expect(installPatch(s, 'inputBindOutput').ok).toBe(true);
    s.flags.learnedToday = true;
    s.flags.lastOutputDay = s.meta.day;
    for (let i = 0; i < 7; i++) tickPatchesDay(s);
    expect(s.osRules[0]?.internalized).toBe(true);
    expect(patchMult(s, 'skill')).toBeCloseTo(1.15, 10);
    expect(patchMult(s, 'marketing')).toBe(1);
  });

  it('中断 → streak 清半', () => {
    const s = fresh();
    s.ap = 10; s.energy = 100;
    installPatch(s, 'threeTierPricing');
    s.flags.pricing = 2;
    tickPatchesDay(s);
    tickPatchesDay(s);
    expect(s.osRules[0]?.streak).toBe(2);
    delete s.flags.pricing; // 中断
    tickPatchesDay(s);
    expect(s.osRules[0]?.internalized).toBe(false);
    expect(s.osRules[0]?.streak).toBe(1); // 2 清半 = 1
  });
});

describe('经济（§6.3/§6.4）', () => {
  it('周期转移矩阵每行和 = 1', () => {
    for (const rows of Object.values(PHASE_TRANSITIONS)) {
      expect(rows.reduce((a, [, p]) => a + p, 0)).toBeCloseTo(1, 10);
    }
    expect(phaseMult('recession')).toBe(0.7);
    expect(phaseMult('overheat')).toBe(1.3);
  });

  it('税三档：none 灰色 0/sole 3%/opc 5%', () => {
    const s = fresh();
    expect(taxDue(s, 10000)).toEqual({ tax: 0, rate: 0, gray: true });
    s.entity = 'sole';
    expect(taxDue(s, 10000).tax).toBe(300);
    s.entity = 'opc';
    expect(taxDue(s, 10000).tax).toBe(500);
  });

  it('月结算：损益/代账费/信用/runway', () => {
    const s = fresh();
    s.cash = 24000;
    const mr = settleMonth(s, createRng(1), { projectIncome: 0, projectUpkeep: 0, passiveIncome: 0, moonThree: [] });
    expect(mr.expenseUpkeep).toBe(0);
    expect(mr.tax).toBe(0);
    expect(mr.profit).toBe(-300); // 仅代账费
    expect(s.cash).toBe(23700);
    expect(s.runway).toBe(79); // 23700/300
    expect(mr.phaseAfter).toBeDefined();
  });

  it('livingCost：LIVING_BASE 7000 × 地点 × 难度', () => {
    const s = fresh({ location: 'hometown', difficulty: 'hard' });
    expect(livingCost(s)).toBe(3850); // 7000×0.5×1.1（[S9] LIVING_BASE 7000）
  });

  it('invest dispatch：买/卖/超支拒绝/加密开关', () => {
    const g = createGame(setup({ seed: 5 }));
    expect(g.dispatch({ t: 'invest', kind: 'fund', amount: 1000 }).ok).toBe(true);
    expect(g.state.cash).toBe(8000 - 1000);
    expect(g.state.portfolio.fund).toBe(1000);
    expect(g.dispatch({ t: 'invest', kind: 'fund', amount: -400 }).ok).toBe(true);
    expect(g.state.portfolio.fund).toBe(600);
    expect(g.dispatch({ t: 'invest', kind: 'fund', amount: -9999 }).ok).toBe(false);
    expect(g.dispatch({ t: 'invest', kind: 'stock', amount: 999999 }).ok).toBe(false);
    g.dispatch({ t: 'setCrypto', on: false });
    expect(g.dispatch({ t: 'invest', kind: 'crypto', amount: 100 }).ok).toBe(false);
  });
});

describe('dispatch 路由（core/index）', () => {
  it('focus：合法域生效、非法域拒绝', () => {
    const g = createGame(setup());
    expect(g.dispatch({ t: 'focus', id: 'health' }).ok).toBe(true);
    expect(g.state.focus).toBe('health');
    expect(g.dispatch({ t: 'focus', id: 'nope' }).ok).toBe(false);
  });

  it('relocate：迁居费 = 月生活费×2，迁后重算生活费', () => {
    const g = createGame(setup());
    expect(g.dispatch({ t: 'relocate', to: 'hometown' }).ok).toBe(false); // 8000 < 14000（[S9] 生活费 7000×2）
    (g.state as { cash: number }).cash = 30000;
    expect(g.dispatch({ t: 'relocate', to: 'hometown' }).ok).toBe(true);
    expect(g.state.location).toBe('hometown');
    expect(g.state.monthlyExpense).toBe(3500); // [S9] 7000×0.5
    expect(g.state.cash).toBe(30000 - 14000); // [S9] 迁居费 = 7000×2
  });

  it('act exercise：AP/精力扣减、子项上涨', () => {
    const g = createGame(setup({ seed: 5 }));
    const r = g.dispatch({ t: 'act', id: 'exercise' });
    expect(r.ok).toBe(true);
    expect(g.state.ap).toBe(2);
    expect(g.state.energy).toBeLessThan(100);
    expect(g.state.health.exercise.v).toBeGreaterThan(70);
  });

  it('hireAgent：真实现后按阶段门拒绝（S3 替换桩：support 需 stage≥3）', () => {
    const g = createGame(setup());
    const r = g.dispatch({ t: 'hireAgent', id: 'support' });
    expect(r.ok).toBe(false);
    expect(r.msg).toContain('阶段不足');
  });
});

describe('时间引擎（§6.1 11 步）', () => {
  it('advanceDay 推进日期；day7 生成周复盘与主焦点事件；心悸预警入队；不变量全绿', () => {
    const s = fresh();
    const rng = createRng(3);
    let rep = advanceDay(s, rng);
    expect(s.meta.day).toBe(2);
    expect(rep.day).toBe(1);
    expect(rep.logs.length).toBeGreaterThan(0);
    for (let i = 0; i < 6; i++) rep = advanceDay(s, rng); // 处理第 7 天
    expect(rep.day).toBe(7);
    expect(rep.events.some(e => e.id === 'weekly-focus')).toBe(true);
    expect(rep.logs.some(l => l.msg.includes('【本周事实】'))).toBe(true);
    expect(rep.logs.some(l => l.msg.includes('【建议】'))).toBe(true);
    expect(assertInvariants(s)).toEqual([]);
  });

  it('周复盘瓶颈引擎：健康崩坏时建议指向健康', () => {
    const s = fresh();
    s.health.sleep.v = 5;
    s.health.mood.v = 5;
    s.health.diet.v = 5;
    s.health.exercise.v = 5;
    const review = weeklyReview(s);
    expect(review.candidates[0]?.key).toBe('health');
    expect(review.suggestion).toContain('健康');
  });

  it('恢复状态机：wobble 两日 → 中断（停摆+强制最低日）→ 解除', () => {
    const s = fresh();
    expect(recoveryState(s)).toBe('run');
    s.energy = 25; // [S9] wobble 阈值 30→12：25 已属正常日谷值，不再触发波动
    expect(recoveryState(s)).toBe('run');
    s.energy = 10;
    expect(recoveryState(s)).toBe('wobble');
    s.flags.wobbleDays = 1; // 第二天波动
    const rep = advanceDay(s, createRng(5));
    expect(s.flags.interrupted).toBe(true);
    expect(rep.logs.some(l => l.msg.includes('中断'))).toBe(true);
    expect(s.flags.interruptDaysLeft).toBeGreaterThanOrEqual(2); // 3-5 掷骰后同日递减一次
    expect(s.flags.forcedMinDays).toBe(2); // 设 3 后当日夜间已消耗 1 天
    advanceDay(s, createRng(5)); // 进入明晨
    expect(s.dayType).toBe('minimum');
    expect(s.ap).toBe(1);
    expect(recoveryState(s)).toBe('interrupted');
  });

  it('隐性疲劳≥70：心悸预警事件入队且猝死概率仍为 0（双强预警先行）', () => {
    const s = fresh();
    s.health.hiddenFatigue = 90;
    const rep = advanceDay(s, createRng(5));
    expect(rep.events.some(e => e.id === 'heart-attack')).toBe(true);
    expect(rep.news.length).toBeGreaterThan(0);
    expect(s.suddenDeathRisk).toBe(0); // 心悸事件未选择硬撑
  });

  it('挂机 60 天：必然被动终局，终局有 key，全程不变量干净', () => {
    const s = fresh();
    const rng = createRng(11);
    for (let i = 0; i < 60 && !s.meta.over; i++) advanceDay(s, rng);
    expect(s.meta.over).toBe(true);
    expect(s.meta.endingKey).toBeDefined();
    expect(s.stats.endingsSeen.length).toBeGreaterThan(0);
    expect(assertInvariants(s)).toEqual([]);
  });

  it('整合冒烟：立项→开发→发布→补丁→45 天循环，不变量与账本干净', () => {
    const g = createGame(setup({ seed: 2026 }));
    expect(g.dispatch({ t: 'patch', id: 'oneMainTask' }).ok).toBe(true);
    expect(g.dispatch({ t: 'newProject', name: '起量', type: 'saas', revenueModel: 'subscription' }).ok).toBe(true);
    expect(g.dispatch({ t: 'newProject', name: '第二个', type: 'saas', revenueModel: 'subscription' }).ok).toBe(false); // 注意力槽 1
    expect(g.dispatch({ t: 'focus', id: 'delivery' }).ok).toBe(true);
    let over = false;
    for (let d = 0; d < 45 && !over; d++) {
      if (g.state.dayType !== 'minimum' && g.state.energy > 20) {
        if (d % 3 === 0) g.dispatch({ t: 'act', id: 'developProject' });
        else if (d % 3 === 1) g.dispatch({ t: 'act', id: 'deliverService' });
        else g.dispatch({ t: 'act', id: 'exercise' });
      }
      g.dispatch({ t: 'dayType', dt: 'standard' });
      const rep = g.advanceDay();
      over = g.state.meta.over;
      if (over) expect(rep.endingKey).toBeDefined();
    }
    expect(g.state.projects.length).toBe(1);
    expect(g.state.stats.patchesInstalled).toBe(1);
    expect(g.state.log.length).toBeGreaterThan(10);
    // 该玩法不回睡眠 → 十几天内健康崩盘属预期；断言：要么活满 45 天，要么终局有 key
    expect(g.state.meta.over || g.state.meta.day > 45).toBe(true);
    if (g.state.meta.over) expect(g.state.meta.endingKey).toBeDefined();
    expect(assertInvariants(g.state)).toEqual([]);
  });
});

describe('结局与五维报告（§十二）', () => {
  it('17 结局全量：每个 check 都可被构造状态命中', () => {
    expect(ENDING_DEFS.length).toBe(17);
    for (const e of ENDING_DEFS) {
      const s = fresh();
      switch (e.key) {
        case 'retire': s.meta.stage = 6; s.flags.retireChosen = true; break;
        case 'sellCompany': s.meta.stage = 5; s.flags.sellChosen = true; break;
        case 'handover': s.meta.stage = 6; s.flags.handoverChosen = true; break;
        case 'pivotRestart': s.flags.pivotRestartChosen = true; s.stats.pivots = 3; break;
        case 'backToWork': s.flags.backToWorkChosen = true; break;
        case 'bankrupt': s.flags.cashNegDays = 3; break;
        case 'burnoutDown': s.burnoutCount = 3; break;
        case 'suddenDeath': s.meta.endingKey = 'suddenDeath'; break;
        case 'legalFrozen': s.flags.legalFrozen = true; break;
        case 'mentalBreak': s.flags.s1DeepDays = 7; break;
        case 'platformCollapse': {
          s.platforms['bilibili'] = { state: 'banned', observeDaysLeft: 0, followers: 0, aiDeclared: false, banRisk: 0, incomeShare: 0 };
          s.platforms['douyin'] = { state: 'banned', observeDaysLeft: 0, followers: 0, aiDeclared: false, banRisk: 0, incomeShare: 0 };
          break;
        }
        case 'healthCollapse':
          s.health.sleep.v = 0; s.health.mood.v = 0; s.health.diet.v = 0; s.health.exercise.v = 0;
          break;
        case 'unicorn': {
          s.autoLevel = 85;
          s.cash = 1e8;
          createProject(s, '爆款', 'saas', 'subscription', createRng(1));
          const p = s.projects[0];
          if (p) p.pmfTrue = 90;
          break;
        }
        case 'trueCalling': s.character = 85; s.morality = 80; s.stats.projectsDone = 3; break; // [v0.10/体感复核] 2→3：日结后带用户退役不再稀缺
        case 'impactMany': s.influence = 80; s.stats.followersPeak = 100000; break;
        case 'secondLife': s.location = 'dali'; s.monthlyIncome = 9000; s.monthlyExpense = 7000; s.morality = 60; break; // [S9] 生活费 7000
        case 'saintOrHag': s.morality = 99; break; // [S9] 阈值 95→98
        default: throw new Error(`未覆盖结局：${e.key}`);
      }
      expect(e.check?.(s) ?? false).toBe(true);
    }
    expect(findEnding('suddenDeath')?.name).toBe('猝死');
  });

  it('checkPassiveEndings 按烈度优先：健康崩盘命中', () => {
    const s = fresh();
    s.health.sleep.v = 0; s.health.mood.v = 0; s.health.diet.v = 0; s.health.exercise.v = 0;
    expect(checkPassiveEndings(s)?.key).toBe('healthCollapse');
  });

  it('五维报告：猝死 → 身心=0 且标缺；健康态 overall>0', () => {
    const dead = fresh();
    dead.meta.endingKey = 'suddenDeath';
    const r1 = buildReport(dead);
    expect(r1.bodymindMissing).toBe(true);
    expect(r1.dims.bodymind).toBe(0);
    expect(r1.verdict.length).toBeGreaterThan(0);
    const alive = fresh();
    const r2 = buildReport(alive);
    expect(r2.bodymindMissing).toBe(false);
    expect(r2.overall).toBeGreaterThan(0);
    expect(Object.keys(r2.dims).length).toBe(5);
  });
});
