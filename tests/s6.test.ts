// S6 验收测试：UI 壳层纯逻辑（无 DOM 依赖，vitest node 环境）
// 覆盖：icons 完整性 / sfx 乐谱 / float 上限 / registry 注册与门控 /
//       modal 队列优先级 / topbar 模型与新闻窗口 / 疲劳横幅模型 / scene 映射表
import { describe, expect, it } from 'vitest';
import { createInitialSlice } from '../src/core/state';
import type { AgentId, SetupConfig, StateSlice } from '../src/core/types';
import { NEWS_TICKER } from '../src/data/events.def';
import { ICONS, REQUIRED_ICON_KEYS, iconIssues } from '../src/ui/icons';
import { capFloats, FLOAT_MAX } from '../src/ui/float';
import {
  MODAL_PRIORITY, modalPriorityOf, sortModalQueue, type ModalKind
} from '../src/ui/modal';
import {
  TAB_DEFS, depHit, getView, isTabEnabled, registerView, registeredViewIds,
  resolveTab, tabLockedHtml, tabPlaceholderHtml
} from '../src/ui/registry';
import { REQUIRED_SCENE_KEYS, AGENT_COLORS, SCENE_MAP, dayPhaseOf } from '../src/ui/scene';
import { REQUIRED_SFX, SFX_SCORES } from '../src/ui/sfx';
import { makeFatigueModel, makeTopbarModel, PHASE_LABELS, pickNews, stageVersion } from '../src/ui/topbar';

// ---------- 夹具 ----------

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

function slice(mutate?: (s: StateSlice) => void): StateSlice {
  const s = createInitialSlice(setup());
  mutate?.(s);
  return s;
}

// ---------- 1. 像素图标库 ----------

describe('icons：字符画完整性（全代码像素零图片）', () => {
  it('iconIssues 为空：所有 icon 8×8 且字符全在调色板内', () => {
    expect(iconIssues()).toEqual([]);
  });

  it('UI 引用到的每个 icon key 都有像素数据', () => {
    for (const key of REQUIRED_ICON_KEYS) {
      expect(ICONS[key], `缺 icon：${key}`).toBeTruthy();
      expect(ICONS[key]?.length).toBe(8);
    }
  });
});

// ---------- 2. 音效乐谱 ----------

describe('sfx：方波乐谱表（8 迁移 + alarm/heartbeat/tinnitus）', () => {
  it('每个必备音效都有 ≥1 个音符且参数合法', () => {
    for (const name of REQUIRED_SFX) {
      const notes = SFX_SCORES[name] ?? [];
      expect(notes.length, `缺音效：${name}`).toBeGreaterThan(0);
      for (const n of notes) {
        expect(n.f).toBeGreaterThan(0);
        expect(n.d).toBeGreaterThan(0);
      }
    }
  });

  it('alarm 是双低音（<200Hz），tinnitus 高频（>2000Hz）', () => {
    expect(SFX_SCORES.alarm?.every(n => n.f < 200)).toBe(true);
    expect(SFX_SCORES.tinnitus?.[0]?.f).toBeGreaterThan(2000);
  });
});

// ---------- 3. 飘字 ----------

describe('float：同屏上限 6 条', () => {
  it('capFloats 截断到 FLOAT_MAX', () => {
    const list = Array.from({ length: 9 }, (_, i) => ({ text: `+${i}`, cls: 'gold' }));
    expect(FLOAT_MAX).toBe(6);
    expect(capFloats(list)).toHaveLength(6);
    expect(capFloats([])).toHaveLength(0);
    expect(capFloats(list)[0]?.text).toBe('+0');
  });
});

// ---------- 4. 视图注册表 ----------

describe('registry：注册 / stage 门控 / 占位解析', () => {
  it('8 个 Tab：状态/项目/行动/智能体/人脉/财务/金融/图鉴', () => {
    expect(TAB_DEFS.map(t => t.id)).toEqual([
      'status', 'projects', 'actions', 'agents', 'contacts', 'finance', 'invest', 'codex'
    ]);
  });

  it('stage 门控：智能体 ≥3、金融 ≥5、图鉴常驻', () => {
    expect(isTabEnabled('agents', 2)).toBe(false);
    expect(isTabEnabled('agents', 3)).toBe(true);
    expect(isTabEnabled('invest', 4)).toBe(false);
    expect(isTabEnabled('invest', 5)).toBe(true);
    expect(isTabEnabled('codex', 1)).toBe(true);
    expect(isTabEnabled('status', 1)).toBe(true);
  });

  it('resolveTab：locked > view > placeholder 三态', () => {
    expect(resolveTab('agents', 2, true)).toBe('locked');
    expect(resolveTab('agents', 3, true)).toBe('view');
    expect(resolveTab('projects', 4, false)).toBe('placeholder');
    expect(resolveTab('invest', 1, false)).toBe('locked'); // 锁定优先于占位
  });

  it('registerView 注册 / 查询 / 列举', () => {
    const view = { id: 'projects', deps: ['projects', 'cash'], render: () => undefined };
    registerView(view);
    expect(getView('projects')).toBe(view);
    expect(registeredViewIds()).toContain('projects');
  });

  it('deps 脏键命中：空 deps 恒命中', () => {
    expect(depHit([], ['anything'])).toBe(true);
    expect(depHit(['cash'], ['stress'])).toBe(false);
    expect(depHit(['cash', 'projects'], ['stress', 'projects'])).toBe(true);
  });

  it('占位/锁定文案生成（S7 接入指引）', () => {
    expect(tabPlaceholderHtml('finance')).toContain('施工中 · S7');
    expect(tabPlaceholderHtml('finance')).toContain('finance');
    expect(tabLockedHtml('invest', 2)).toContain('第 5 阶段解锁');
  });
});

// ---------- 5. 弹窗队列优先级 ----------

describe('modal：三级队列 事件 > KP > 结算提示', () => {
  it('优先级数值排序正确', () => {
    expect(modalPriorityOf('event')).toBeLessThan(modalPriorityOf('kp'));
    expect(modalPriorityOf('kp')).toBeLessThan(modalPriorityOf('notice'));
    const order: ModalKind[] = ['notice', 'event', 'notice', 'kp'];
    expect(MODAL_PRIORITY.event).toBe(0);
    expect(sortModalQueue(order.map(kind => ({ kind }))).map(m => m.kind)).toEqual([
      'event', 'kp', 'notice', 'notice'
    ]);
  });

  it('同优先级保持入队顺序（稳定排序）', () => {
    const list: { kind: ModalKind; tag: number }[] = [
      { kind: 'notice', tag: 1 }, { kind: 'notice', tag: 2 }, { kind: 'kp', tag: 3 }
    ];
    expect(sortModalQueue(list).map(x => x.tag)).toEqual([3, 1, 2]);
  });
});

// ---------- 6. 顶栏模型 ----------

describe('topbar：makeTopbarModel / stageVersion / pickNews', () => {
  it('顶栏模型：日/年/版本/现金/模式标签', () => {
    const m = makeTopbarModel(slice());
    expect(m.day).toBe(1);
    expect(m.year).toBe(1);
    expect(m.version).toBe('v0.1');
    expect(m.cashText).toContain('¥');
    expect(m.cashNegative).toBe(false);
    expect(m.phaseLabel).toBe(PHASE_LABELS[m.phase]);
    expect(m.apMax).toBe(3); // 标准日
  });

  it('OS 版本按 stage 映射 v0.1→v3.0', () => {
    expect(stageVersion(1)).toBe('v0.1');
    expect(stageVersion(3)).toBe('v1.0');
    expect(stageVersion(6)).toBe('v3.0');
  });

  it('负债现金标记为负', () => {
    const m = makeTopbarModel(slice(s => { s.cash = -500; s.debt = 3000; }));
    expect(m.cashNegative).toBe(true);
    expect(m.cashText).toContain('负债');
  });

  it('pickNews：只显示当天及 3 日内（day-2 ≤ newsDay ≤ day）', () => {
    const ticker = [
      { day: 1, text: 'A' }, { day: 2, text: 'B' }, { day: 5, text: 'C' }, { day: 9, text: 'D' }
    ];
    expect(pickNews(ticker, 1)).toEqual(['A']);
    expect(pickNews(ticker, 3)).toEqual(['A', 'B']); // day1 距今 2 天仍在窗口内
    expect(pickNews(ticker, 4)).toEqual(['B']); // day1 距今 3 天出窗，day2 仍在
    expect(pickNews(ticker, 6)).toEqual(['C']);
    expect(pickNews(ticker, 30)).toEqual([]);
  });

  it('NEWS_TICKER day1 时代锚点必出（day1-3 窗口）', () => {
    const d1 = pickNews(NEWS_TICKER, 1);
    expect(d1.length).toBeGreaterThan(0);
    expect(d1[0]).toContain('张雪峰');
    expect(pickNews(NEWS_TICKER, 7)).toHaveLength(0); // day3 条目也已出窗，day8 未到
  });
});

// ---------- 7. 疲劳横幅模型（双强预警 §7.3） ----------

describe('topbar：makeFatigueModel', () => {
  it('隐性疲劳 <70 且无心悸 → 不显示横幅', () => {
    expect(makeFatigueModel(slice())).toBeNull();
    expect(makeFatigueModel(slice(s => { s.health.hiddenFatigue = 60; }))).toBeNull();
  });

  it('hiddenFatigue≥70 → level1；风险未掷骰前置时显示 0%', () => {
    const m = makeFatigueModel(slice(s => { s.health.hiddenFatigue = 75; }));
    expect(m?.level).toBe(1);
    expect(m?.riskPct).toBe(0); // sleep<15/心悸硬撑/过劳≥1 前置不满足
    expect(m?.text).toContain('隐性疲劳');
  });

  it('hiddenFatigue≥85 + 心悸已见 → level2 且风险为公开概率', () => {
    const m = makeFatigueModel(slice(s => {
      s.health.hiddenFatigue = 90;
      s.flags.heartAttackWarn = true;
      s.health.sleep.v = 10;
      s.burnoutCount = 1;
    }));
    expect(m?.level).toBe(2);
    expect(m?.riskPct).toBeGreaterThan(0);
    expect(m?.riskPct).toBeLessThanOrEqual(12);
  });

  it('心悸已见但疲劳 <70 → level2（心悸线兜底）', () => {
    const m = makeFatigueModel(slice(s => { s.flags.heartAttackWarn = true; }));
    expect(m?.level).toBe(2);
  });
});

// ---------- 8. 场景状态→视觉映射表 ----------

describe('scene：SCENE_MAP 完整性 + 昼夜四相 + 智能体配色', () => {
  it('每个必需映射键都有非空渲染分支描述', () => {
    for (const key of REQUIRED_SCENE_KEYS) {
      expect(typeof SCENE_MAP[key], `缺场景分支：${key}`).toBe('string');
      expect(SCENE_MAP[key]?.length).toBeGreaterThan(0);
    }
  });

  it('映射表覆盖规格要求的全部状态族', () => {
    const keys = Object.keys(SCENE_MAP);
    for (const family of ['phase0', 'phase3', 'skyline_', 'stress_', 'energy_', 'fatigue_', 's1', 'agent_', 'ghost_', 'ending_', 'modal_', 'hidden_']) {
      expect(keys.some(k => k.startsWith(family)), `缺映射族：${family}`).toBe(true);
    }
  });

  it('昼夜四相按 AP 余量（3AP 标准日）', () => {
    expect(dayPhaseOf(3, 3)).toBe(0);
    expect(dayPhaseOf(2, 3)).toBe(1);
    expect(dayPhaseOf(1, 3)).toBe(2);
    expect(dayPhaseOf(0, 3)).toBe(3);
  });

  it('扩展日 4AP / 最低日 1AP 也按比例分相', () => {
    expect(dayPhaseOf(4, 4)).toBe(0);
    expect(dayPhaseOf(2, 4)).toBe(1);
    expect(dayPhaseOf(1, 4)).toBe(2);
    expect(dayPhaseOf(0, 4)).toBe(3);
    expect(dayPhaseOf(1, 1)).toBe(0);
  });

  it('7 个智能体都有专属色相', () => {
    const ids: AgentId[] = ['support', 'growth', 'content', 'sales', 'legalfin', 'regagent', 'butler'];
    for (const id of ids) expect(AGENT_COLORS[id]).toMatch(/^#/);
  });
});
