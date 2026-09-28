// 结局判定 + 五维人生报告（技术文档 §十二 / 设计 §十二）
import { ENDING_DEFS, netWorth } from '../data/endings.def';
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
