// S4 验收测试：知识点词条（数量/来源/长度/键唯一）/ 老张台词池（四戒·≤40 字·每景≥2·pickZhang）/
// 成就系统（24 条 check 纯函数可执行 / firstOrder 幂等解锁 / advanceDay 接线日志 / 图鉴成就）/ suddenDeath 时代锚点
import { describe, expect, it } from 'vitest';
import { createInitialSlice } from '../src/core/state';
import { createRng } from '../src/core/rng';
import { advanceDay } from '../src/core/time';
import { achCount, checkAchievements } from '../src/core/achievements';
import { KP, KP_DEFS } from '../src/data/kp.def';
import { pickZhang, ZHANG_LINES, type ZhangSituation } from '../src/data/zhang.def';
import { ACHIEVEMENT_DEFS } from '../src/data/achievements.def';
import { ENDING_DEFS } from '../src/data/endings.def';
import type { SetupConfig, StateSlice } from '../src/core/types';

const PERS = { pragmaticIdeal: 'pragmatic', steadyAggressive: 'steady', soloSocial: 'solo' } as const;

function fresh(): StateSlice {
  const setup: SetupConfig = {
    niche: 'dev', background: 'grass', location: 'hangcheng', difficulty: 'normal',
    talents: [], personality: { ...PERS }, cryptoOn: true, seed: 42
  };
  return createInitialSlice(setup);
}

/** 混沌态：把所有口径都推到极端，验证 24 个 check 在任何状态下都不抛异常 */
function chaos(): StateSlice {
  const s = fresh();
  s.meta.day = 500; s.meta.stage = 6;
  s.stats.orders = 99; s.stats.bigHits = 3; s.stats.projectsFailed = 9; s.stats.minDays = 10;
  s.stats.grayDeals = 2; s.stats.endingsSeen = ['retire', 'unicorn'];
  s.rep = 90; s.autoLevel = 95; s.morality = 10; s.burnoutCount = 2;
  s.monthlyExpense = 9000;
  s.flags.heartAttackWarn = true;
  s.flags.lastPassiveIncome = 12000;
  s.log.push({ day: 1, msg: '迁居完成（¥9000）：新城市，新的成本与节奏。', cls: 'good' });
  s.log.push({ day: 2, msg: '老张：「又是扩展日。」', cls: 'purple' });
  return s;
}

const ZHANG_SITUATIONS: ZhangSituation[] = [
  'overwork', 'heartAttack', 'suddenDeath', 'bankrupt',
  'moralChoice', 'burnoutEnd', 'platformBan', 'grayTemptation'
];

// ============================================================
// 一、知识点词条 KP
// ============================================================

describe('kp.def：知识点词条（§18.1 可溯源）', () => {
  it('≥28 条且全部有非空 source（每条注明现实来源）', () => {
    expect(KP_DEFS.length).toBeGreaterThanOrEqual(28);
    expect(Object.keys(KP).length).toBe(KP_DEFS.length); // Record 与数组同构
    for (const kp of KP_DEFS) {
      expect(kp.key.length, `key 空：${JSON.stringify(kp)}`).toBeGreaterThan(0);
      expect(kp.title.length, `${kp.key} title 空`).toBeGreaterThan(0);
      expect(kp.source.length, `${kp.key} 缺 source`).toBeGreaterThan(6);
    }
  });

  it('键无重复，且必含词条清单全数覆盖（32 主题）', () => {
    const keys = KP_DEFS.map(d => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    const required = [
      'niche', 'mvp', 'pmf', 'cashflow', 'runway', 'content', 'mrr', 'pricing',
      'productize', 'automation', 'system1', 'health', 'hiddenFatigue', 'recovery',
      'inputOutput', 'skill4', 'osPatch', 'powerLaw', 'agent', 'tokenEcon',
      'ghostCompany', 'relay', 'topup', 'platformRisk', 'aiDeclare', 'newAccount',
      'geoArbitrage', 'fireLine', 'entity', 'taxThree', 'unicorn', 'moralValue'
    ];
    for (const k of required) expect(KP[k], `缺必含词条：${k}`).toBeDefined();
  });

  it('每条 text 60-120 字、含数字或案例（硬性规范）', () => {
    for (const kp of KP_DEFS) {
      const len = Array.from(kp.text).length;
      expect(len, `${kp.key} text 长度 ${len}`).toBeGreaterThanOrEqual(60);
      expect(len, `${kp.key} text 长度 ${len}`).toBeLessThanOrEqual(120);
      expect(/\d/.test(kp.text), `${kp.key} 缺数字或案例`).toBe(true);
    }
  });
});

// ============================================================
// 二、老张台词池
// ============================================================

describe('zhang.def：老张台词池（§7.4 四戒）', () => {
  it('≥15 条，每个 situation ≥2', () => {
    expect(ZHANG_LINES.length).toBeGreaterThanOrEqual(15);
    for (const sit of ZHANG_SITUATIONS) {
      const n = ZHANG_LINES.filter(l => l.situation === sit).length;
      expect(n, `${sit} 仅 ${n} 条`).toBeGreaterThanOrEqual(2);
    }
  });

  it('逐条长度 ≤40 字（四戒硬约束）', () => {
    for (const l of ZHANG_LINES) {
      expect(Array.from(l.text).length, `${l.situation}: ${l.text}（${Array.from(l.text).length} 字）`).toBeLessThanOrEqual(40);
    }
  });

  it('pickZhang：每个 situation 抽得到非空台词，且属于该 situation 的池', () => {
    for (const sit of ZHANG_SITUATIONS) {
      const pool = ZHANG_LINES.filter(l => l.situation === sit).map(l => l.text);
      for (let seed = 1; seed <= 20; seed++) {
        const line = pickZhang(sit, createRng(seed));
        expect(line.length).toBeGreaterThan(0);
        expect(pool).toContain(line);
      }
    }
  });
});

// ============================================================
// 三、成就系统
// ============================================================

describe('achievements.def：24 条 check 全部可执行（纯函数不抛异常）', () => {
  it('数量 =24，check 对初始态与混沌态均返回 boolean', () => {
    expect(ACHIEVEMENT_DEFS.length).toBe(24);
    expect(new Set(ACHIEVEMENT_DEFS.map(a => a.id)).size).toBe(24);
    for (const state of [fresh(), chaos()]) {
      for (const def of ACHIEVEMENT_DEFS) {
        const r = def.check(state);
        expect(typeof r, `${def.id} 未返回 boolean`).toBe('boolean');
      }
    }
  });

  it('firstOrder：制造订单后解锁，flags 记账且不重复解锁', () => {
    const s = fresh();
    expect(checkAchievements(s).map(a => a.id)).not.toContain('firstOrder');
    s.stats.orders = 1;
    const unlocked = checkAchievements(s);
    expect(unlocked.map(a => a.id)).toContain('firstOrder');
    expect(s.flags.ach_firstOrder).toBe(true);
    // 幂等：再次检查不返回已解锁项，achCount 不变
    expect(checkAchievements(s)).toHaveLength(0);
    expect(achCount(s)).toBe(1);
    s.stats.orders = 5;
    expect(checkAchievements(s)).toHaveLength(0);
  });

  it('风格线：grayBlood 讽刺解锁 / cleanExit 查灰产史+道德 / collectorHidden 读 endingsSeen', () => {
    const s = fresh();
    s.stats.grayDeals = 1;
    expect(checkAchievements(s).map(a => a.id)).toContain('grayBlood');
    expect(s.flags.ach_cleanExit).toBeUndefined(); // 有灰产史永不解锁
    // 干净通关：终局 + 零灰产 + 道德 80
    const t = fresh();
    t.meta.over = true;
    t.morality = 80;
    expect(checkAchievements(t).map(a => a.id)).toContain('cleanExit');
    // 图鉴：5 隐藏结局集齐
    const c = fresh();
    c.stats.endingsSeen = ['unicorn', 'trueCalling', 'impactMany', 'secondLife', 'saintOrHag'];
    expect(checkAchievements(c).map(a => a.id)).toContain('collectorHidden');
  });

  it('接线：advanceDay 日志含「成就解锁」条目（cls gold），且次日不重复', () => {
    const s = fresh();
    s.stats.orders = 1;
    const rep1 = advanceDay(s, createRng(7));
    const hit1 = rep1.logs.filter(l => l.cls === 'gold' && l.msg.includes('成就解锁') && l.msg.includes('第一桶金'));
    expect(hit1.length).toBe(1);
    const rep2 = advanceDay(s, createRng(7));
    const hit2 = rep2.logs.filter(l => l.msg.includes('成就解锁') && l.msg.includes('第一桶金'));
    expect(hit2).toHaveLength(0); // 不重复解锁
    expect(achCount(s)).toBe(1);
  });
});

// ============================================================
// 四、一致性：suddenDeath 时代锚点（§7.4）
// ============================================================

describe('endings.def：时代锚点巡检', () => {
  it('suddenDeath 文案含「2026 年 4 月」锚点措辞', () => {
    const def = ENDING_DEFS.find(e => e.key === 'suddenDeath');
    expect(def).toBeDefined();
    const text = typeof def?.text === 'function' ? '' : def?.text ?? '';
    expect(text).toContain('2026 年 4 月');
    expect(text).toContain('不可再生');
  });
});
