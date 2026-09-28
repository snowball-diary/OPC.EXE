// S1 验收测试：RNG / powerLaw / 七维开局 / 存档 roundtrip / localStorage 降级
import { describe, expect, it, vi } from 'vitest';
import { createRng, Rng } from '../src/core/rng';
import { assertInvariants, createInitialSlice } from '../src/core/state';
import { createGame, loadGame } from '../src/core/index';
import {
  exportJson, importJson, listSlots, loadSlot, migrate, migrations, saveToSlot, serialize, validate
} from '../src/save/save';
import type { SetupConfig } from '../src/core/types';

const PERS = { pragmaticIdeal: 'pragmatic', steadyAggressive: 'steady', soloSocial: 'solo' } as const;

function setup(over: Partial<SetupConfig> = {}): SetupConfig {
  return {
    niche: 'dev',
    background: 'grass',
    location: 'hangcheng',
    difficulty: 'normal',
    talents: [],
    personality: { ...PERS },
    cryptoOn: true,
    seed: 42,
    ...over
  };
}

describe('RNG：mulberry32 同种子一致、可序列化恢复', () => {
  it('同种子序列完全一致，异种子不同', () => {
    const a = createRng(42);
    const b = createRng(42);
    const c = createRng(43);
    const seqA = Array.from({ length: 100 }, () => a.next());
    const seqB = Array.from({ length: 100 }, () => b.next());
    const seqC = Array.from({ length: 100 }, () => c.next());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
  });

  it('getState → fromState 无缝续接', () => {
    const r1 = createRng(7);
    for (let i = 0; i < 5; i++) r1.next();
    const r2 = Rng.fromState(r1.getState());
    expect(Array.from({ length: 10 }, () => r2.next()))
      .toEqual(Array.from({ length: 10 }, () => r1.next()));
  });

  it('int 双端闭区间、pick 出自数组、chance 边界', () => {
    const r = createRng(1);
    for (let i = 0; i < 500; i++) {
      const v = r.int(3, 9);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(9);
    }
    expect(r.int(5, 5)).toBe(5);
    const arr = [10, 20, 30] as const;
    for (let i = 0; i < 100; i++) expect(arr).toContain(r.pick(arr));
    expect(r.chance(0)).toBe(false);
    expect(r.chance(1)).toBe(true);
  });
});

describe('RNG：powerLaw 输出域正确', () => {
  it('全部 ≥ min，有扩散尾部，最小值贴近 min', () => {
    const r = createRng(2026);
    const xs = Array.from({ length: 2000 }, () => r.powerLaw(2.2, 5));
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(5);
      expect(Number.isFinite(x)).toBe(true);
    }
    expect(Math.min(...xs)).toBeLessThanOrEqual(7.5);
    expect(xs.some(x => x > 50)).toBe(true); // 长尾存在（P≈4%）
  });

  it('alpha≤1 直接拒绝', () => {
    expect(() => createRng(1).powerLaw(1, 5)).toThrow();
  });
});

describe('createInitialSlice：七维开局应用', () => {
  it('不同背景初始现金不同（grass vs fired）', () => {
    const grass = createInitialSlice(setup());
    const fired = createInitialSlice(setup({ background: 'fired' }));
    // grass 6000×1.0 + 务实性格 +2000 = 8000；fired 60000×1.0 + 2000 = 62000
    expect(grass.cash).toBe(8000);
    expect(fired.cash).toBe(62000);
    // dev 赛道自带 craft1；fired 背景 craft2 取 max
    expect(grass.skills.craft).toBe(1);
    expect(fired.skills.craft).toBe(2);
    expect(grass.skills.expression).toBe(0);
  });

  it('难度倍率与地点生活费生效，runway 正确', () => {
    const insane = createInitialSlice(setup({ difficulty: 'insane' }));
    expect(insane.monthlyExpense).toBe(8750); // [S2] LIVING_BASE × 杭州1.0 × 1.25（[S9] LIVING_BASE 8000→7000）
    const hometown = createInitialSlice(setup({ location: 'hometown' }));
    expect(hometown.monthlyExpense).toBe(3500); // [S2] 7000 × 0.5 × 1.0（[S9] LIVING_BASE 7000）
    expect(hometown.runway).toBe(2.3); // (6000+2000)/3500
  });

  it('特质 flags 与数值落地（负债开局/夜猫子）', () => {
    const s = createInitialSlice(setup({ talents: ['debtStart', 'nightOwl'] }));
    expect(s.flags.debtStart).toBe(true);
    expect(s.flags.nightOwl).toBe(true);
    expect(s.debt).toBe(20000);
    expect(s.creditScore).toBe(570);
    expect(s.health.sleep.v).toBe(60); // '=' 直接置值
  });

  it('cryptoOn 开关落 flags（默认开）', () => {
    expect(createInitialSlice(setup()).flags.cryptoOn).toBe(true);
    expect(createInitialSlice(setup({ cryptoOn: false })).flags.cryptoOn).toBe(false);
  });

  it('赛道开局粉丝生效：kol → 小红书(xhs) observe 账号 500 粉（S8 修：平台 id 对齐 platforms.def）', () => {
    const s = createInitialSlice(setup({ niche: 'kol' }));
    const acc = s.platforms['xhs'];
    expect(acc).toBeDefined();
    expect(acc?.followers).toBe(500);
    expect(acc?.state).toBe('observe');
  });

  it('基线与不变量：S2 起步、健康漂移按 §5.1、无不变量违规', () => {
    const s = createInitialSlice(setup());
    expect(s.meta.stage).toBe(1);
    expect(s.meta.day).toBe(1);
    expect(s.meta.schemaVersion).toBe(1);
    expect(s.decisionMode).toBe('system2');
    expect(s.dayType).toBe('standard');
    expect(s.energy).toBe(100);
    expect(s.attentionCap).toBe(1);
    expect(s.creditScore).toBe(600);
    expect(s.health.sleep.drift).toBe(-8);
    expect(s.health.diet.drift).toBe(-5);
    expect(s.focus).toBeNull();
    expect(assertInvariants(s)).toEqual([]);
  });

  it('未知开局维度抛出可读错误', () => {
    expect(() => createInitialSlice(setup({ niche: 'nope' }))).toThrow('UNKNOWN_NICHE');
    expect(() => createInitialSlice(setup({ background: 'nope' }))).toThrow('UNKNOWN_BACKGROUND');
  });
});

describe('存档：serialize → validate roundtrip', () => {
  it('合法存档校验通过，数据无损', () => {
    const s = createInitialSlice(setup({ talents: ['debtStart'] }));
    const sv = serialize(s);
    expect(sv.schemaVersion).toBe(1);
    expect(validate(sv)).toBe(true);
    const restored = JSON.parse(sv.game) as typeof s;
    expect(restored.cash).toBe(s.cash);
    expect(restored.debt).toBe(s.debt);
    expect(restored.meta.seedState.s).toBe(s.meta.seedState.s);
    expect(restored.flags.nightOwl === undefined).toBe(true);
  });

  it('篡改内容 → checksum 失配 → 拒绝', () => {
    const sv = serialize(createInitialSlice(setup()));
    const tampered = { ...sv, game: sv.game.slice(0, 30) + 'X' + sv.game.slice(31) };
    expect(validate(tampered)).toBe(false);
  });

  it('schemaVersion 不符拒绝；migrate 链 v1 为空', () => {
    const sv = serialize(createInitialSlice(setup()));
    expect(validate({ ...sv, schemaVersion: 99 })).toBe(false);
    expect(migrations.length).toBe(0);
    expect(migrate(sv)).toBe(sv);
  });

  it('exportJson → importJson roundtrip', () => {
    const s = createInitialSlice(setup({ background: 'fired' }));
    const sv = importJson(exportJson(s));
    expect(validate(sv)).toBe(true);
    expect(JSON.parse(sv.game).cash).toBe(s.cash);
  });
});

describe('localStorage 不可用：降级内存，不抛异常', () => {
  it('getItem/setItem 抛异常时写槽降级且可读回', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('SecurityError'); },
      removeItem: () => { throw new Error('SecurityError'); },
      clear: () => undefined,
      key: () => null,
      length: 0
    });
    try {
      const s = createInitialSlice(setup());
      expect(() => saveToSlot('1', s)).not.toThrow();
      expect(saveToSlot('1', s)).toBe(false); // false = 已降级内存
      const slot1 = listSlots().find(x => x.slot === '1');
      expect(slot1?.degraded).toBe(true);
      const loaded = loadSlot('1');
      expect(loaded).not.toBeNull();
      expect(loaded === null ? null : JSON.parse(loaded.game).cash).toBe(s.cash);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('createGame / loadGame（S2 起接入真实引擎）', () => {
  it('dispatch 未知行动返回 ok:false，advanceDay 返回带日志的报告', () => {
    const g = createGame(setup());
    expect(g.dispatch({ t: 'act', id: 'deep_work' }).ok).toBe(false); // [S2] 不再是 NOT_IMPLEMENTED 桩
    const rep = g.advanceDay();
    expect(rep.day).toBe(1);
    expect(rep.logs.length).toBeGreaterThan(0);
    expect(rep.events).toEqual([]);
  });

  it('serialize → loadGame 状态一致', () => {
    const g = createGame(setup({ seed: 99 }));
    const g2 = loadGame(g.serialize());
    expect(g2.state.cash).toBe(g.state.cash);
    expect(g2.state.meta.seedState.s).toBe(g.state.meta.seedState.s);
    expect(assertInvariants(g2.state)).toEqual([]);
  });
});
