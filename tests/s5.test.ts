// S5 验收测试：80 条事件数据完整性 / 保留 id 契约 / 智能体事故 id 双向对齐 /
// 静态校验（真实 EVENT_DEFS 喂 validateChains·validateWhenReachable）/ 道德与灰产配额 /
// NEWS_TICKER 时代锚点 / evalCond 冒烟
import { describe, expect, it } from 'vitest';
import { EVENT_DEFS, NEWS_TICKER, findEventDef } from '../src/data/events.def';
import { AGENT_DEFS } from '../src/data/agents.def';
import { PLATFORM_DEFS } from '../src/data/platforms.def';
import { evalCond, validateChains, validateWhenReachable } from '../src/core/events';
import { createInitialSlice } from '../src/core/state';
import type { Cond, Effect, SetupConfig } from '../src/core/types';

const PERS = { pragmaticIdeal: 'pragmatic', steadyAggressive: 'steady', soloSocial: 'solo' } as const;

function setup(over: Partial<SetupConfig> = {}): SetupConfig {
  return {
    niche: 'dev', background: 'grass', location: 'hangcheng', difficulty: 'normal',
    talents: [], personality: { ...PERS }, cryptoOn: true, seed: 2026, ...over
  };
}

/** 递归统计 when 里的 ['random','<',p]（含嵌套 and/or/not） */
function countRandom(c: Cond): number {
  if (c[0] === 'random') return 1;
  if (c[0] === 'and' || c[0] === 'or') return (c[1] as Cond[]).reduce((a, x) => a + countRandom(x), 0);
  if (c[0] === 'not') return countRandom(c[1]);
  return 0;
}

/** 递归查找 when 里是否出现 ['gray', true] */
function hasGrayTrue(c: Cond): boolean {
  if (c[0] === 'gray') return c[1] === true;
  if (c[0] === 'and' || c[0] === 'or') return (c[1] as Cond[]).some(hasGrayTrue);
  if (c[0] === 'not') return hasGrayTrue(c[1]);
  return false;
}

/** 合法 EffectKey 白名单（与 applyEffects 支持键 + S5 增量键对齐） */
const OK_EFFECT_KEY = new RegExp(
  '^(cash|debt|ap|stress|hiddenFatigue|burnoutCount|mood|sleep|diet|exercise|healthWhole|' +
  'info|cognition|character|rep|influence|power|compliance|creditScore|morality|' +
  'autoLevel|tokenBill|tokenPriceIndex|contacts|attentionCap|assetAdd|' +
  'skillExp\\.(craft|expression|marketing|operation|business)|' +
  'deliveries\\.(craft|expression|marketing|operation|business)|' +
  'followers\\.(bilili|wechat|xhs|zhihu|douyin|weibo|youtube|site)|' +
  'project(Progress|Quality|PmfTrue|PmfNoise|Users|Mrr|Maintenance)|' +
  'flag\\.[a-zA-Z][a-zA-Z0-9_-]*)$'
);

// 引擎保留 id（events.ts / time.ts / agents.ts / platforms.ts 硬编码引用，一个字符都不能改）
const RESERVED_IDS = [
  'heartAttackWarn', 'aiUndeclared', 'token-burn-warning',
  'moon-three', 'heart-attack', 'recovery-interrupt', 'weekly-focus'
] as const;

// 智能体事故 id（agents.def riskEvents 全量）
const AG_IDS = [
  'ag-support-hallucination', 'ag-support-complaint',
  'ag-growth-riskcontrol', 'ag-growth-material',
  'ag-content-aidetect', 'ag-content-homogenize',
  'ag-sales-violation', 'ag-sales-lost',
  'ag-legalfin-misreport', 'ag-regagent-flaw'
] as const;

// 灰产线 id（中转站 3 + 代充 2 + 清算连锁 3）
const GRAY_IDS = [
  'gray-relay-lead', 'gray-relay-scale', 'gray-relay-crash',
  'gray-topup-lead', 'gray-topup-settle',
  'gray-clearing-legal', 'gray-clearing-audit', 'gray-clearing-moral'
] as const;

const byId = new Map(EVENT_DEFS.map(d => [d.id, d]));

// ============================================================
// 一、总量与去重
// ============================================================

describe('S5 数据总量', () => {
  it('EVENT_DEFS 恰 80 条，id 无重复，findEventDef 可查', () => {
    expect(EVENT_DEFS.length).toBe(80);
    expect(new Set(EVENT_DEFS.map(d => d.id)).size).toBe(80);
    for (const d of EVENT_DEFS) expect(findEventDef(d.id)).toBe(d);
    expect(findEventDef('definitely-not-exist')).toBeUndefined();
  });

  it('配额核对：保留 7 + 事故 10 + Token 4 + 猝死链 5 + 灰产 8 + 平台 8 + 道德 8 + AI 6 + 金融 6 + 人际 6 + 机会危机 12 = 80', () => {
    const n = (ids: readonly string[]): number => ids.filter(id => byId.has(id)).length;
    expect(n(RESERVED_IDS)).toBe(7);
    expect(n(AG_IDS)).toBe(10);
    expect(n(['token-drop-newmodel', 'token-rise-api', 'token-surge-throttle', 'token-reset-baseline'])).toBe(4);
    expect(n(['health-allnight-temptation', 'health-checkup-hint', 'health-family-call', 'health-hardstreak-mark', 'health-peer-death'])).toBe(5);
    expect(n(GRAY_IDS)).toBe(8);
    expect(EVENT_DEFS.filter(d => d.cat === 'platform').length).toBeGreaterThanOrEqual(8); // 平台政策（含 aiUndeclared/crisis-ai-crackdown）
    expect(EVENT_DEFS.filter(d => d.cat === 'moral').length).toBe(8);
    expect(EVENT_DEFS.filter(d => d.cat === 'ai').length).toBe(20); // 事故 10 + Token 4 + AI 浪潮 6
    expect(EVENT_DEFS.filter(d => d.cat === 'finance').length).toBe(6);
    expect(EVENT_DEFS.filter(d => d.cat === 'social').length).toBeGreaterThanOrEqual(7);
    expect(EVENT_DEFS.filter(d => d.cat === 'opportunity').length).toBeGreaterThanOrEqual(9);
    expect(EVENT_DEFS.filter(d => d.cat === 'crisis').length).toBeGreaterThanOrEqual(12);
    expect(EVENT_DEFS.filter(d => d.cat === 'health').length).toBe(8); // 保留 3 + 猝死链 5
  });
});

// ============================================================
// 二、NEWS_TICKER：顶栏新闻条（§7.4）
// ============================================================

describe('NEWS_TICKER', () => {
  it('≥10 条；day1 必含时代锚点：张雪峰 / 2026 / 4 月', () => {
    expect(NEWS_TICKER.length).toBeGreaterThanOrEqual(10);
    const day1 = NEWS_TICKER.find(n => n.day === 1);
    expect(day1).toBeDefined();
    expect(day1?.text).toContain('张雪峰');
    expect(day1?.text).toContain('2026');
    expect(day1?.text).toContain('4 月');
    expect(day1?.text).toContain('过劳猝死');
  });

  it('day 严格递增且 ≥1；text 均为非空克制陈述；事件 newsDay 引用的播报日存在', () => {
    for (let i = 0; i < NEWS_TICKER.length; i++) {
      const n = NEWS_TICKER[i];
      expect(n?.day).toBeGreaterThanOrEqual(1);
      expect(n?.text.length).toBeGreaterThan(15);
      const prev = NEWS_TICKER[i - 1];
      if (prev) expect(n?.day).toBeGreaterThan(prev.day);
    }
    const days = new Set(NEWS_TICKER.map(n => n.day));
    for (const d of EVENT_DEFS) {
      if (d.newsDay !== undefined) {
        expect(days.has(d.newsDay), `${d.id} newsDay=${d.newsDay} 缺少对应 NEWS_TICKER 条目`).toBe(true);
      }
    }
  });
});

// ============================================================
// 三、保留 id 契约（引擎定向入队）
// ============================================================

describe('保留 id（引擎硬编码）', () => {
  it('7 个保留 id 全部存在；when 首条为恒假 random<0（不占随机池）；weight>0', () => {
    for (const id of RESERVED_IDS) {
      const d = byId.get(id);
      expect(d, `保留 id 缺失：${id}`).toBeDefined();
      expect(d?.when[0]).toEqual(['random', '<', 0]);
      expect(d?.weight).toBeGreaterThan(0);
      expect(d?.choices.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('heartAttackWarn：cooldown 5、oldZhang 含「四月」回响、body 明示当前猝死风险、硬撑置位/休息清位 flag', () => {
    const d = byId.get('heartAttackWarn');
    expect(d).toBeDefined();
    expect(d?.cooldownDays).toBe(5);
    expect(d?.oldZhang).toContain('四月');
    expect(d?.body).toContain('当前猝死风险');
    const writes = (v: number): number =>
      d?.choices.filter(c => c.effects.some(e => e.k === 'flag.heartAttackWarn' && e.op === '=' && e.v === v)).length ?? 0;
    expect(writes(1)).toBeGreaterThanOrEqual(1); // 硬撑 → 置位（猝死掷骰门控）
    expect(writes(0)).toBeGreaterThanOrEqual(1); // 休息/就医 → 清位
    expect(d?.choices.some(c => c.effects.some(e => e.k === 'hiddenFatigue' && e.op === '+' && (e.v as number) > 0))).toBe(true);
  });

  it('heart-attack：恰好二选一（就医或硬撑）；aiUndeclared 含补声明选项', () => {
    const ha = byId.get('heart-attack');
    expect(ha?.choices.length).toBe(2);
    expect(ha?.choices.some(c => c.label.includes('就医'))).toBe(true);
    expect(ha?.choices.some(c => c.label.includes('硬撑'))).toBe(true);
    const au = byId.get('aiUndeclared');
    expect(au?.choices.some(c => c.label.includes('补声明'))).toBe(true);
  });
});

// ============================================================
// 四、智能体事故 id 与 agents.def 双向对齐
// ============================================================

describe('智能体事故 id 对齐', () => {
  it('agents.def riskEvents 全量 ⇄ EVENT_DEFS ag-* 双向差集为空', () => {
    const referenced = new Set(AGENT_DEFS.flatMap(a => a.riskEvents));
    const defined = new Set(EVENT_DEFS.filter(d => d.id.startsWith('ag-')).map(d => d.id));
    const missing = [...referenced].filter(id => !defined.has(id));
    const extra = [...defined].filter(id => !referenced.has(id));
    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
    expect(defined.size).toBe(10);
    for (const id of referenced) expect(byId.get(id)?.choices.length).toBeGreaterThanOrEqual(2);
  });

  it('每个事故事件含「人工接管」类选项（label 或 hint 命中），全部效果键合法', () => {
    for (const id of AG_IDS) {
      const d = byId.get(id);
      expect(d).toBeDefined();
      const takeover = d?.choices.some(c => /人工接管|亲自|自己接盘|人工/.test(`${c.label} ${c.hint ?? ''}`));
      expect(takeover, `${id} 缺少人工接管类选项`).toBe(true);
    }
  });
});

// ============================================================
// 五、静态校验（真实 EVENT_DEFS）
// ============================================================

describe('静态校验（真实数据全量）', () => {
  it('validateChains(EVENT_DEFS) 为空：无环、无自指', () => {
    expect(validateChains(EVENT_DEFS)).toEqual([]);
    for (const d of EVENT_DEFS) {
      for (const seed of [...(d.chain ?? []), ...d.choices.flatMap(c => c.chain ?? [])]) {
        expect(seed.event, `${d.id} 自指`).not.toBe(d.id);
      }
    }
  });

  it('validateWhenReachable(EVENT_DEFS) 为空：chain 目标存在、delay≥0、when flag 均有引擎来源', () => {
    expect(validateWhenReachable(EVENT_DEFS)).toEqual([]);
  });

  it('每事件 ≥2 选项；weight>0；label/results/body 具体非空；choice.id 事件内唯一', () => {
    for (const d of EVENT_DEFS) {
      expect(d.choices.length, `${d.id} 选项不足`).toBeGreaterThanOrEqual(2);
      expect(d.weight, `${d.id} weight 非法`).toBeGreaterThan(0);
      expect(d.title.length, `${d.id} 标题为空`).toBeGreaterThan(0);
      expect(d.body.length, `${d.id} 正文过短`).toBeGreaterThanOrEqual(30);
      const cids = new Set<string>();
      for (const c of d.choices) {
        expect(c.label.length, `${d.id}/${c.id} 选项文案过短`).toBeGreaterThanOrEqual(6);
        expect(c.results.length, `${d.id}/${c.id} 结果文案过短`).toBeGreaterThanOrEqual(8);
        expect(cids.has(c.id), `${d.id} 选项 id 重复：${c.id}`).toBe(false);
        cids.add(c.id);
      }
    }
  });

  it('效果键全部合法；禁用 {k:energy}（applyEffects 对 energy 的 + 按 = 处理的引擎怪癖）', () => {
    const platformIds = new Set(PLATFORM_DEFS.map(p => p.id));
    for (const d of EVENT_DEFS) {
      for (const c of d.choices) {
        for (const e of c.effects as Effect[]) {
          expect(OK_EFFECT_KEY.test(e.k), `${d.id}/${c.id} 非法效果键：${e.k}`).toBe(true);
          expect(e.k, `${d.id}/${c.id} 禁用 energy 键`).not.toBe('energy');
          if (e.k.startsWith('followers.')) {
            expect(platformIds.has(e.k.slice(10)), `${d.id} 未知平台：${e.k}`).toBe(true);
          }
        }
      }
    }
  });

  it("['random','<',p] 每事件至多 1 个（含嵌套）", () => {
    for (const d of EVENT_DEFS) {
      const n = d.when.reduce((a, c) => a + countRandom(c), 0);
      expect(n, `${d.id} random 条件超限：${n}`).toBeLessThanOrEqual(1);
    }
  });
});

// ============================================================
// 六、道德抉择配额（恶方：morality 负值 + 未来清算 chain）
// ============================================================

describe('道德抉择 8 条', () => {
  it('cat=moral 恰 8 条；每条含 morality 负效应选项且该选项带清算 chain（delay 7-30）', () => {
    const morals = EVENT_DEFS.filter(d => d.cat === 'moral');
    expect(morals.length).toBe(8);
    for (const d of morals) {
      const bad = d.choices.filter(c => {
        const neg = c.effects.some(e => e.k === 'morality' && e.op === '+' && typeof e.v === 'number' && (e.v as number) < 0);
        const chained = (c.chain?.length ?? 0) > 0;
        return neg && chained;
      });
      expect(bad.length, `${d.id} 缺少「morality 负值 + 清算 chain」的恶方选项`).toBeGreaterThanOrEqual(1);
      for (const c of bad) {
        for (const seed of c.chain ?? []) {
          expect(seed.delayDays).toBeGreaterThanOrEqual(7);
          expect(seed.delayDays).toBeLessThanOrEqual(30);
        }
      }
    }
  });
});

// ============================================================
// 七、灰产线（中转站 3 + 代充 2 + 清算连锁 3；['gray',true] 条件）
// ============================================================

describe('灰产线 5+3', () => {
  it('8 条全在；放量事件 when 含 [gray,true]；链路完整（发现→放量→封号/清算；快钱→集体索赔/稽查）', () => {
    for (const id of GRAY_IDS) expect(byId.get(id), `灰产事件缺失：${id}`).toBeDefined();
    const scale = byId.get('gray-relay-scale');
    expect(scale !== undefined && scale.when.some(hasGrayTrue)).toBe(true); // grayHistory 项目在场才可触发
    const chainOf = (id: string): string[] => {
      const d = byId.get(id);
      return [...(d?.chain ?? []), ...(d?.choices.flatMap(c => c.chain ?? []) ?? [])].map(s => s.event);
    };
    expect(chainOf('gray-relay-lead')).toContain('gray-relay-scale');
    expect(chainOf('gray-relay-scale')).toContain('gray-relay-crash');
    expect(chainOf('gray-relay-crash')).toContain('gray-clearing-audit');
    expect(chainOf('gray-topup-lead')).toContain('gray-topup-settle');
    expect(chainOf('gray-topup-settle')).toContain('gray-clearing-legal');
    // 清算链延迟 7-30 天（§9.6 集中清算）
    const relayScale = byId.get('gray-relay-scale');
    for (const c of relayScale?.choices ?? []) {
      for (const s of c.chain ?? []) if (s.event === 'gray-relay-crash') {
        expect(s.delayDays).toBeGreaterThanOrEqual(7);
        expect(s.delayDays).toBeLessThanOrEqual(30);
      }
    }
  });

  it('中转站连锁的 ifCond 使用 [gray,true]（放量→封号）', () => {
    const scale = byId.get('gray-relay-scale');
    const seed = scale?.choices.flatMap(c => c.chain ?? []).find(s => s.event === 'gray-relay-crash');
    expect(seed).toBeDefined();
    expect(seed?.ifCond && seed.ifCond.some(hasGrayTrue)).toBe(true);
  });
});

// ============================================================
// 八、evalCond 冒烟：真实状态可触发
// ============================================================

describe('evalCond 冒烟', () => {
  it('构造满足状态：至少 1 条事件 when 全过；保留 id 恒不进随机池', () => {
    const s = createInitialSlice(setup());
    s.meta.stage = 2;
    const passable = EVENT_DEFS.filter(d => d.when.every(c => evalCond(s, c)));
    expect(passable.length).toBeGreaterThanOrEqual(1);
    expect(passable.map(d => d.id)).toContain('opp-ai-package'); // day1 抽样基准池成员
    const warn = byId.get('heartAttackWarn');
    expect(warn?.when.every(c => evalCond(s, c))).toBe(false); // random<0 恒假
    // 灰产放量事件在无灰产史时不可触发
    const scale = byId.get('gray-relay-scale');
    expect(scale?.when.every(c => evalCond(s, c))).toBe(false);
  });

  it('灰产史状态下 gray 事件 when 可满足；homophone/privateDomain flag 通道合法', () => {
    const s = createInitialSlice(setup());
    s.meta.day = 60;
    s.flags.grayHistory = true;
    const scale = byId.get('gray-relay-scale');
    expect(scale?.when.every(c => evalCond(s, c))).toBe(true);
    s.flags.privateDomain = true;
    s.meta.day = 60;
    const seo = byId.get('platform-site-seo');
    expect(seo?.when.every(c => evalCond(s, c))).toBe(true);
  });
});
