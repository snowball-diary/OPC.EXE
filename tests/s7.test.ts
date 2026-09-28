// S7 验收测试：玩家可见面板的纯逻辑（无 DOM 依赖，vitest node 环境）
// 覆盖：向导草稿校验（特质超预算/未选完不能下一步/draft→SetupConfig 含 cryptoOn）/
//       技能四级进度换算 / runway 颜色分档 / 单位经济面板映射 / 五维雷达坐标 /
//       结局屏猝死分支 / 存档槽摘要 / 日志颜色映射与 KP 识别 / 行动禁用判定
import { describe, expect, it } from 'vitest';
import { createInitialSlice } from '../src/core/state';
import type { Project, SetupConfig, StateSlice } from '../src/core/types';
import { unitEconomics } from '../src/core/agents';
import { findAction } from '../src/data/actions.def';
import { findProjectType } from '../src/data/projects.def';
import { serialize } from '../src/save/save';
// 结局屏纯函数
import {
  endingFlow, endingIntroLine, isActiveEnding, radarPoints, unlockedAchievementNames
} from '../src/ui/ending';
// 日志颜色与 KP 识别
import { logAccent, logColor, yuan } from '../src/ui/fmt';
import { kpKeyFromLog, kpKeyFromTitle } from '../src/ui/kpseen';
// 向导
import {
  TALENT_BUDGET, buildSetupConfig, canPickTalent, emptyDraft,
  setupStepComplete, talentBudgetLeft
} from '../src/ui/views/setup';
// 状态视图
import { decisionBadge, fatigueReadout, recoveryLabel, skillProgress } from '../src/ui/views/status';
// 项目视图
import { marginBand, needsUnitEconomics, revenueModelLabel } from '../src/ui/views/projects';
// 行动视图
import { actionDisabled, entityStatusText } from '../src/ui/views/actions';
// 智能体视图
import { ghostCompanyModel, priceIndexLabel } from '../src/ui/views/agents';
// 财务视图
import { entityNote, financeSheet, passiveCoverage, runwayBand } from '../src/ui/views/finance';
// 图鉴视图
import { achievementRows, endingRows, kpRows } from '../src/ui/views/codex';
// 存档管理
import { slotActions, slotSummary } from '../src/ui/views/saves';

// ---------- 夹具 ----------

const PERS = { pragmaticIdeal: 'pragmatic', steadyAggressive: 'steady', soloSocial: 'solo' } as const;

function setup(over: Partial<SetupConfig> = {}): SetupConfig {
  return {
    niche: 'dev', background: 'grass', location: 'hangcheng', difficulty: 'normal',
    talents: [], personality: { ...PERS }, cryptoOn: true, seed: 42,
    ...over
  };
}

function slice(mutate?: (s: StateSlice) => void): StateSlice {
  const s = createInitialSlice(setup());
  mutate?.(s);
  return s;
}

function proj(over: Partial<Project> = {}): Project {
  return {
    id: 'p1', name: '测试项目', type: 'aiSupport', revenueModel: 'usage', stage: 'grow',
    progress: 100, quality: 60, pmfTrue: 50, pmfEstimate: { v: 50, noise: 10 },
    risk: 40, maintenance: 10, users: 100, mrr: 5000, ageMonths: 4, version: 1,
    alive: true, decayRate: 2, lastMonthMrr: undefined, stalledMonths: 0,
    ...over
  };
}

// ---------- 1. 向导：特质点数预算 ----------

describe('S7 向导：特质预算制（预算 3 点，负消耗/正返还）', () => {
  it('预算余量 = 3 + Σ(cost)', () => {
    expect(TALENT_BUDGET).toBe(3);
    expect(talentBudgetLeft([])).toBe(3);
    expect(talentBudgetLeft(['workaholic'])).toBe(1); // -2
    expect(talentBudgetLeft(['workaholic', 'zen'])).toBe(2); // -2 +1
  });

  it('超预算禁选并提示，返还型不受预算限制，重复点击=取消', () => {
    const picked = ['workaholic', 'geek']; // -2 -1 → 余 0
    expect(talentBudgetLeft(picked)).toBe(0);
    const deny = canPickTalent(picked, 'ironman'); // 再 -2 → 超预算
    expect(deny.ok).toBe(false);
    expect(deny.reason).toContain('点数不足');
    expect(canPickTalent(picked, 'spendthrift').ok).toBe(true); // +1 返还
    expect(canPickTalent(picked, 'workaholic').ok).toBe(true); // 已选=取消
    expect(canPickTalent([], 'unknown-talent').ok).toBe(false);
  });
});

// ---------- 2. 向导：步骤校验与 SetupConfig 组装 ----------

describe('S7 向导：未选完不能下一步 / draft→SetupConfig', () => {
  it('空草稿前三步全部未完成，选完即通过', () => {
    const d = emptyDraft();
    expect(setupStepComplete(0, d)).toBe(false);
    expect(setupStepComplete(1, d)).toBe(false);
    expect(setupStepComplete(2, d)).toBe(false);
    expect(setupStepComplete(3, d)).toBe(false);
    expect(setupStepComplete(4, d)).toBe(true); // 特质可空
    expect(setupStepComplete(5, d)).toBe(false); // 性格三轴未选
    d.niche = 'dev';
    d.background = 'grass';
    d.location = 'hangcheng';
    d.difficulty = 'insane';
    d.personality = { pragmaticIdeal: 'idealist', steadyAggressive: 'aggressive', soloSocial: 'social' };
    expect([0, 1, 2, 3, 5].every(i => setupStepComplete(i, d))).toBe(true);
  });

  it('buildSetupConfig 产出完整 SetupConfig（含 cryptoOn 与种子）', () => {
    const d = emptyDraft();
    d.niche = 'kol';
    d.background = 'fired';
    d.location = 'dali';
    d.difficulty = 'hard';
    d.talents = ['workaholic', 'quickLearner'];
    d.personality = { pragmaticIdeal: '', steadyAggressive: 'aggressive', soloSocial: 'solo' };
    d.cryptoOn = false;
    d.seed = 123456;
    const cfg = buildSetupConfig(d);
    expect(cfg.cryptoOn).toBe(false);
    expect(cfg.seed).toBe(123456);
    expect(cfg.niche).toBe('kol');
    expect(cfg.difficulty).toBe('hard');
    expect(cfg.talents).toEqual(['workaholic', 'quickLearner']);
    expect(cfg.personality.pragmaticIdeal).toBe('pragmatic'); // 缺省落默认端
    expect(cfg.personality.steadyAggressive).toBe('aggressive');
    expect(createInitialSlice(cfg).flags.cryptoOn).toBe(false); // 引擎消费同一开关
  });
});

// ---------- 3. 技能四级进度换算 ----------

describe('S7 状态页：技能四级进度换算', () => {
  it('经验进度按阈值折算，L3/L4 有真实交付门槛', () => {
    expect(skillProgress(0, 25, 0)).toMatchObject({ pct: 50, blocked: undefined });
    expect(skillProgress(2, 260, 0).pct).toBe(100); // 经验够
    expect(skillProgress(2, 260, 0).blocked).toContain('3 次真实交付'); // 但差交付
    expect(skillProgress(2, 260, 3).blocked).toBeUndefined(); // 交付够了
    expect(skillProgress(3, 480, 2).blocked).toContain('4 次真实交付');
    const max = skillProgress(4, 999, 99);
    expect(max.pct).toBe(100);
    expect(max.label).toContain('满级');
  });
});

// ---------- 4. Runway 颜色分档 + 被动覆盖 ----------

describe('S7 财务页：runway 分档 / 自由线覆盖率', () => {
  it('runway <3 红 / <6 橙 / 其余绿，负值红色警报', () => {
    expect(runwayBand(2.9).cls).toBe('red');
    expect(runwayBand(3.5).cls).toBe('orange');
    expect(runwayBand(12).cls).toBe('green');
    expect(runwayBand(-1).cls).toBe('red');
    expect(runwayBand(2).label).toContain('警报');
  });

  it('被动覆盖率 100% = 自由线（被动 ≥ 生活费）', () => {
    expect(passiveCoverage(8000, 8000)).toEqual({ pct: 100, free: true });
    expect(passiveCoverage(4000, 8000)).toEqual({ pct: 50, free: false });
    expect(passiveCoverage(12000, 8000).pct).toBe(100); // 封顶
  });
});

// ---------- 5. 单位经济面板映射 ----------

describe('S7 项目页：单位经济面板（autoSrv/灰产 Token 进货口径）', () => {
  it('毛利率 = (价−Token×指数−费率×价)/价，色条按档位', () => {
    const s = slice();
    const ue = unitEconomics(s, proj({ type: 'aiSupport' }));
    expect(ue.price).toBe(1750); // [500,3000] 中点
    expect(ue.priceIndex).toBe(1);
    expect(ue.grossMargin).toBeCloseTo((1750 - 80 - 87.5) / 1750, 6);
    expect(ue.overTrustCapacity).toBe(false);
    expect(marginBand(0.9).cls).toBe('green');
    expect(marginBand(0.4).label).toBe('正常');
    expect(marginBand(0.1).cls).toBe('orange');
    expect(marginBand(-0.2).label).toContain('负毛利');
  });

  it('面板只给 Token 成本>0 的类型（autoSrv/灰产），纯卖时间不给', () => {
    expect(needsUnitEconomics(findProjectType('aiSupport'))).toBe(true);
    expect(needsUnitEconomics(findProjectType('apiRelay'))).toBe(true);
    expect(needsUnitEconomics(findProjectType('saas'))).toBe(false);
    expect(needsUnitEconomics(findProjectType('consulting'))).toBe(false);
    expect(revenueModelLabel('subscription')).toBe('订阅');
  });
});

// ---------- 6. 五维雷达坐标 ----------

describe('S7 结局屏：五维雷达坐标（纯 CSS/SVG）', () => {
  it('五顶点、起始角正上、半径按值缩放', () => {
    const vals = [
      { label: '财务', value: 100 }, { label: '事业', value: 50 }, { label: '关系', value: 0 },
      { label: '身心', value: 50 }, { label: '意义', value: 100 }
    ];
    const pts = radarPoints(vals, 100, 100, 78);
    expect(pts).toHaveLength(5);
    expect(pts[0]!.x).toBeCloseTo(100, 5); // 顶部
    expect(pts[0]!.y).toBeCloseTo(22, 5);  // 100 - 78
    expect(pts[2]!.value).toBe(0);
    expect(pts[2]!.x).toBeCloseTo(100, 1); // value 0 → 圆心（第三顶点在正下方）
    expect(pts[2]!.y).toBeCloseTo(100, 1);
    const half = radarPoints([{ label: 'x', value: 50 }], 0, 0, 40);
    expect(half[0]!.y).toBeCloseTo(-20, 5); // 半径减半
  });
});

// ---------- 7. 结局屏：猝死分支 / 主动结局 ----------

describe('S7 结局屏：猝死特殊处理与主动结局判定', () => {
  it('suddenDeath → 黑屏 2s 引入 + 一行白字；其余直出报告', () => {
    expect(endingFlow('suddenDeath')).toBe('suddenIntro');
    expect(endingIntroLine('suddenDeath')).toContain('没有下一行');
    expect(endingFlow('bankrupt')).toBe('direct');
    expect(endingIntroLine('retire')).toBeNull();
  });

  it('主动结局可「继续经营」，被动/隐藏不可', () => {
    expect(isActiveEnding('retire')).toBe(true);
    expect(isActiveEnding('sellCompany')).toBe(true);
    expect(isActiveEnding('bankrupt')).toBe(false);
    expect(isActiveEnding('suddenDeath')).toBe(false);
    expect(isActiveEnding('unicorn')).toBe(false);
  });

  it('成就清单与猝死身心维度标缺走 buildReport 同源数据', () => {
    const s = slice(x => {
      x.flags.ach_firstOrder = true;
      x.meta.endingKey = 'suddenDeath';
    });
    expect(unlockedAchievementNames(s)).toContain('第一桶金');
    expect(endingRows(s).find(e => e.key === 'suddenDeath')?.on).toBe(false); // 未写入 endingsSeen
    const seen = slice(x => {
      x.stats.endingsSeen.push('unicorn');
      x.flags.ach_ghost = true;
    });
    expect(endingRows(seen).find(e => e.key === 'unicorn')).toMatchObject({ on: true });
    expect(endingRows(seen).find(e => e.key === 'bankrupt')?.name).toBe('？？？');
    expect(achievementRows(seen).find(a => a.id === 'ghost')?.on).toBe(true);
  });
});

// ---------- 8. 存档槽摘要 ----------

describe('S7 存档管理：槽位摘要格式化', () => {
  it('空槽位与损坏档', () => {
    expect(slotSummary(null)).toBe('空槽位');
    expect(slotSummary({ schemaVersion: 1, createdAt: 0, game: '{bad', checksum: 0 })).toBe('存档损坏（校验未过）');
  });

  it('经营中档显示 第 N 天 · 现金；终局档显示 结局态', () => {
    const live = serialize(slice(x => {
      x.cash = 6000;
      x.meta.day = 12;
    }));
    expect(slotSummary(live)).toContain('第 12 天');
    expect(slotSummary(live)).toContain('¥6,000');
    const dead = serialize(slice(x => {
      x.meta.over = true;
      x.meta.endingKey = 'bankrupt';
    }));
    expect(slotSummary(dead)).toContain('终局 · 破产');
    expect(slotActions(live)).toEqual({ canSave: true, canLoad: true });
    expect(slotActions(null).canLoad).toBe(false);
  });
});

// ---------- 9. 日志颜色映射与 KP 识别 ----------

describe('S7 日志区：颜色映射 / 徽标 / 知识点点击识别', () => {
  it('cls → 颜色变量，未知落灰', () => {
    expect(logColor('good')).toBe('var(--green)');
    expect(logColor('bad')).toBe('var(--red)');
    expect(logColor('gold')).toBe('var(--gold)');
    expect(logColor('whatever')).toBe('var(--dim)');
  });

  it('系统行徽标：月结/成就/终局；知识点行可还原 KP key', () => {
    expect(logAccent('【月结】收入 ¥1｜支出 ¥2')?.tag).toBe('月结');
    expect(logAccent('【成就解锁】第一桶金')?.color).toBe('var(--gold)');
    expect(logAccent('【终局】破产')?.tag).toBe('终局');
    expect(logAccent('交付服务：入账 ¥800')).toBeNull();
    expect(kpKeyFromTitle('OPC 知识点 · 利基定位')).toBe('niche');
    expect(kpKeyFromLog('【知识点·现金流为王】今天学到…')).toBe('cashflow');
    expect(kpKeyFromLog('普通经营日志')).toBeUndefined();
  });

  it('金额统一 ¥ 千分位', () => {
    expect(yuan(1234567)).toBe('¥1,234,567');
    expect(yuan(-800)).toBe('-¥800');
  });
});

// ---------- 10. 行动禁用判定 ----------

describe('S7 行动页：禁用态与原因（镜像 executeAction 前置检查）', () => {
  it('阶段不足 / 需要项目 / 最低日限制', () => {
    const s0 = slice();
    expect(actionDisabled(s0, findAction('registerOPC')!)).toContain('阶段不足');
    expect(actionDisabled(s0, findAction('deliverService')!)).toContain('立项');
    expect(actionDisabled(s0, findAction('exercise')!)).toBeNull(); // 身心恢复永远可做
    const sMin = slice(x => { x.dayType = 'minimum'; });
    expect(actionDisabled(sMin, findAction('deepLearnFit')!)).toContain('最低日');
    expect(actionDisabled(sMin, findAction('meditate')!)).toBeNull();
    const poor = slice(x => { x.cash = 0; });
    expect(actionDisabled(poor, findAction('travel')!)).toContain('现金不足');
  });

  it('实体状态条与注册类行动的去重禁用', () => {
    const s0 = slice();
    expect(entityStatusText(s0)).toContain('无主体');
    expect(actionDisabled(s0, findAction('fileTrademark')!)).toContain('阶段不足'); // 商标需第 3 阶段
    const done = slice(x => {
      x.meta.stage = 3; // 注册/商标/ICP 均需第 3 阶段
      x.entity = 'opc';
      x.flags.trademark = true;
      x.flags.icp = true;
    });
    expect(entityStatusText(done)).toContain('一人有限公司');
    expect(actionDisabled(done, findAction('registerOPC')!)).toContain('已是');
    expect(actionDisabled(done, findAction('fileTrademark')!)).toContain('商标');
    expect(actionDisabled(done, findAction('fileIcp')!)).toContain('ICP');
  });
});

// ---------- 11. 智能体面板与 Token 指数 ----------

describe('S7 智能体页：Token 价格指数档位 / 幽灵公司模型', () => {
  it('priceIndex 四档文案', () => {
    expect(priceIndexLabel(0.6).label).toContain('降价红利');
    expect(priceIndexLabel(1.0).label).toContain('基线');
    expect(priceIndexLabel(1.5).cls).toBe('orange');
    expect(priceIndexLabel(2.0).label).toContain('限流溢价');
  });

  it('空局：autoLevel 0、六流程全部未覆盖；雇佣管家后全覆盖', () => {
    const s0 = slice();
    const m0 = ghostCompanyModel(s0);
    expect(m0.score).toBe(0);
    expect(m0.ghost).toBe(false);
    expect(m0.covered.every(c => !c.on)).toBe(true);
    const s1 = slice(x => {
      x.agents.push({ id: 'butler', hiredDay: 1, usageScale: 1, trust: 60 });
    });
    const m1 = ghostCompanyModel(s1);
    expect(m1.score).toBe(100);
    expect(m1.covered.every(c => c.on)).toBe(true);
  });
});

// ---------- 12. 财务三张账 ----------

describe('S7 财务页：月损益三张账 / 主体税档', () => {
  it('开局月：支出 = 生活费 7000 + 订阅 200 + 代账 300，无主体为灰色税态', () => { // [S9] LIVING_BASE 7000
    const sheet = financeSheet(slice());
    expect(sheet.expenseTotal).toBe(7500); // [S9] 7000+200+300
    expect(sheet.incomeTotal).toBe(0);
    expect(sheet.profit).toBe(-7500); // [S9]
    expect(sheet.grayTax).toBe(true); // entity none
    expect(entityNote('none')).toContain('灰色');
    expect(entityNote('sole')).toContain('3%');
    expect(entityNote('opc')).toContain('5%');
  });
});

// ---------- 13. 状态页：疲劳读数 / 决策徽章 / 恢复状态 ----------

describe('S7 状态页：隐性疲劳模糊区间 / 决策模式徽章 / 恢复状态机', () => {
  it('未体检显示模糊区间，体检后显示精确值与猝死风险', () => {
    const blind = slice(x => { x.health.hiddenFatigue = 73; });
    const b = fatigueReadout(blind);
    expect(b.precise).toBe(false);
    expect(b.text).toContain('70-79');
    expect(b.riskPct).toBe(-1);
    const known = slice(x => {
      x.health.hiddenFatigue = 88;
      x.flags.fatigueKnown = true;
      x.flags.heartAttackWarn = true;
      x.burnoutCount = 1;
      x.health.sleep.v = 10;
      x.hardStreakDays = 1;
    });
    const k = fatigueReadout(known);
    expect(k.precise).toBe(true);
    expect(k.text).toBe('88/100');
    expect(k.riskPct).toBeGreaterThan(0); // 猝死前置全满足 → 公开风险
  });

  it('决策徽章三档与恢复状态机文案', () => {
    expect(decisionBadge('system2').cls).toBe('green');
    expect(decisionBadge('system1').note).toContain('疲惫使你的选项变形');
    expect(decisionBadge('system1Deep').cls).toBe('red');
    expect(recoveryLabel('run', false).label).toContain('运行');
    expect(recoveryLabel('wobble', false).cls).toBe('orange');
    expect(recoveryLabel('run', true).label).toContain('中断');
  });
});

// ---------- 14. 图鉴 KP 行模型 ----------

describe('S7 图鉴：知识点 32 条行模型', () => {
  it('seen 展开（全文+来源），未 seen 只留标题', () => {
    const rows = kpRows(slice(), key => key === 'niche');
    expect(rows).toHaveLength(32);
    const on = rows.find(r => r.key === 'niche');
    expect(on?.on).toBe(true);
    expect(on?.text).toContain('窄门');
    expect(on?.source).toContain('设计手记');
    const off = rows.find(r => r.key === 'pmf');
    expect(off?.text).toBe('');
  });
});
