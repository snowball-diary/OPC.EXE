// 结局判定 + 五维人生报告
import { ENDING_DEFS, findEnding, netWorth } from '../data/endings.def';
import { composeHealth } from './health';
import { pushLog } from './state';
import type { EndingDef, LifeReport, StateSlice } from './types';

/** 被动结局轮询：按烈度优先级返回第一个命中的结局 */
export function checkPassiveEndings(s: StateSlice): EndingDef | null {
  const priority = [
    'suddenDeath', 'burnoutDown', 'healthCollapse', 'bankrupt',
    'legalFrozen', 'mentalBreak', 'platformCollapse',
    'unicorn', 'trueCalling', 'impactMany', 'secondLife', 'saintOrHag',
    'retire', 'sellCompany', 'handover', 'pivotRestart', 'backToWork'
  ];
  for (const key of priority) {
    const def = ENDING_DEFS.find(e => e.key === key);
    if (def?.check && def.check(s)) return def;
  }
  return null;
}

/** 应用结局：over+endingKey+图鉴去重记录 */
export function applyEnding(s: StateSlice, def: EndingDef): void {
  s.meta.over = true;
  s.meta.endingKey = def.key;
  if (!s.stats.endingsSeen.includes(def.key)) s.stats.endingsSeen.push(def.key);
  pushLog(s, `【终局】${def.name}：${typeof def.text === 'function' ? def.text(s) : def.text}`, def.color);
}

/** 五个主动结局的触发 flag（endings.def 约定；「继续经营」回头时统一清场，防被动轮询立刻再终局） */
const ACTIVE_ENDING_FLAGS = ['retireChosen', 'sellChosen', 'handoverChosen', 'pivotRestartChosen', 'backToWorkChosen'] as const;

/**
 * 主动结局回头收口（core 唯一写者；「继续经营」原局回场入口，仅用于主动结局）：
 * 校验结局 key 存在 → 清 over/endingKey/五个主动结局触发 flag/burnoutCount
 * （不清则下一天被动轮询会立刻把玩家拖回终局）。返回 false = key 不存在，调用方忽略即可。
 */
export function chooseEnding(s: StateSlice, key: string): boolean {
  if (!findEnding(key)) return false;
  s.meta.over = false;
  s.meta.endingKey = undefined;
  for (const f of ACTIVE_ENDING_FLAGS) delete s.flags[f];
  s.burnoutCount = 0;
  return true;
}

/**
 * 主动结局触发收口：置 endings.def 约定 flag → checkPassiveEndings 按烈度优先级命中
 * （口径与 time.ts 步 11 一致：触发 flag 之外若有更高烈度被动结局同时命中，以先者为准；
 * 无命中回退按 key 直取）→ applyEnding 记账。返回实际落地的结局 key（null = 未命中）。
 */
export function triggerActiveEnding(s: StateSlice, flag: string, key: string): string | null {
  s.flags[flag] = true;
  const def = checkPassiveEndings(s) ?? findEnding(key);
  if (!def) return null;
  applyEnding(s, def);
  return def.key;
}

const clamp100 = (n: number): number => Math.max(0, Math.min(100, n));

/** 五维人生报告：财务/事业/关系/身心/意义 + verdict 一句话 + overall；猝死时身心=0 且标缺 */
export function buildReport(s: StateSlice): LifeReport {
  // 财务：净资产对数分段（1 亿 = 100 分）
  const nw = netWorth(s);
  const finance = nw <= 0 ? 0 : clamp100(Math.round((Math.log10(nw) / 8) * 100));
  // 事业：项目组合与真实交付
  const aliveProjects = s.projects.filter(p => p.alive).length;
  const dlv = (Object.values(s.deliveries) as number[]).reduce((a, b) => a + b, 0);
  const career = clamp100(s.stats.projectsDone * 10 + aliveProjects * 8 + dlv * 3 + (s.meta.stage - 1) * 8);
  // 关系：contacts 加权（均值 × 规模加成）
  const relAvg = s.contacts.length > 0 ? s.contacts.reduce((a, c) => a + c.relation, 0) / s.contacts.length : 0;
  const relations = s.contacts.length === 0 ? 0 : clamp100(Math.round(relAvg * 0.7 + Math.min(30, s.contacts.length * 2)));
  // 身心：健康 + 压力；猝死 → 0 且标缺
  const bodymindMissing = s.meta.endingKey === 'suddenDeath';
  const bodymind = bodymindMissing ? 0 : clamp100(Math.round(composeHealth(s.health) * 0.6 + (100 - s.stress) * 0.4));
  // 意义：道德 + 真实交付占比
  const meaning = clamp100(Math.round(s.morality * 0.6 + Math.min(40, s.stats.orders * 2)));
  const dims = [finance, career, relations, meaning, bodymind];
  const overall = Math.round(dims.reduce((a, b) => a + b, 0) / dims.length);
  const ending = s.meta.endingKey ? ENDING_DEFS.find(e => e.key === s.meta.endingKey) : undefined;
  const verdict = ending
    ? `结局「${ending.name}」：${typeof ending.text === 'function' ? ending.text(s) : ending.text}`
    : overall >= 80
      ? '一台运转良好的人-OS，就是一人公司最强大的资产。'
      : overall >= 55
        ? '还在牌桌上：不体面，但活着。'
        : '公司还在，你快不在了。先把自己修好。';
  return {
    dims: { finance, career, relations, bodymind, meaning },
    bodymindMissing,
    verdict,
    overall,
    endingKey: s.meta.endingKey
  };
}
