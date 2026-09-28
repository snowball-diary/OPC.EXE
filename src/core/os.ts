// OS 补丁引擎：安装（同层槽位）/ 每日执行记账（7 天内化，中断清半）/ 内化乘子（设计 §2.5）
import { findPatch, PATCH_MULTS } from '../data/patches.def';
import { pushLog } from './state';
import type { ActionResult, OSRuleState, StateSlice } from './types';

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

/** 同层槽位：stage 1-2 共 2 / 3-4 共 4 / 5-6 共 6 */
export function layerSlots(stage: number): number {
  if (stage <= 2) return 2;
  if (stage <= 4) return 4;
  return 6;
}

/** 安装补丁：槽位/AP/精力校验 → streak=0 未内化 */
export function installPatch(s: StateSlice, id: string): ActionResult {
  if (s.meta.over) return { ok: false, msg: '生涯已结束' };
  const def = findPatch(id);
  if (!def) return { ok: false, msg: `未知补丁：${id}` };
  if (s.osRules.some(r => r.id === id)) return { ok: false, msg: `「${def.name}」已安装` };
  const sameLayer = s.osRules.filter(r => r.layer === def.layer).length;
  const slots = layerSlots(s.meta.stage);
  if (sameLayer >= slots) return { ok: false, msg: `${def.layer} 层槽位已满（${sameLayer}/${slots}）：stage 提升可扩容` };
  if (s.ap < def.installCost.ap) return { ok: false, msg: 'AP 不足，装不了补丁' };
  if (s.energy < def.installCost.energy) return { ok: false, msg: '精力不足，装不了补丁' };
  const cash = def.installCost.cash ?? 0;
  if (cash > 0 && s.cash < cash) return { ok: false, msg: '现金不足' };
  s.ap -= def.installCost.ap;
  s.energy = Math.max(0, s.energy - def.installCost.energy);
  if (cash > 0) s.cash -= cash;
  const st: OSRuleState = { id: def.id, layer: def.layer, installedDay: s.meta.day, internalized: false, streak: 0 };
  s.osRules.push(st);
  s.stats.patchesInstalled += 1;
  pushLog(s, `安装补丁「${def.name}」：连续执行 7 天才算内化。`, 'good');
  return { ok: true, msg: `已安装「${def.name}」（${def.layer}层）`, floatTexts: [{ text: '补丁+', cls: 'good' }] };
}

/** 当日行为记账 flag 判定（effectFlags 全部满足才算执行；空表 = 有任意行动即算） */
function flagCheck(s: StateSlice, flag: string): boolean {
  switch (flag) {
    case 'act_any': return num(s.flags.actsToday) > 0;
    case 'act_learn_output': return s.flags.learnedToday === true && num(s.flags.lastOutputDay) === s.meta.day;
    case 'act_deliver': return s.flags.deliveredToday === true;
    case 'act_within_ap': return num(s.flags.actsToday) > 0 && s.flags.hardPressedToday !== true;
    case 'act_min_day': return s.dayType === 'minimum' && num(s.flags.actsSelf) > 0;
    case 'sleep_ok': return s.health.sleep.v >= 40;
    case 'pricing_set': return typeof s.flags.pricing === 'number';
    case 'tax_current': return s.flags.taxCurrent === true;
    default: return num(s.flags.actsToday) > 0;
  }
}

function patchDone(s: StateSlice, rule: OSRuleState): boolean {
  const def = findPatch(rule.id);
  const flags = def?.effectFlags ?? [];
  if (flags.length === 0) return num(s.flags.actsToday) > 0;
  return flags.every(f => flagCheck(s, f));
}

/** 每日补丁记账：执行 → streak+1（7 天内化）；中断 → streak 清半，返部分现金成本 */
export function tickPatchesDay(s: StateSlice): string[] {
  const msgs: string[] = [];
  for (const rule of s.osRules) {
    if (rule.internalized) continue;
    const def = findPatch(rule.id);
    if (patchDone(s, rule)) {
      rule.streak += 1;
      if (rule.streak >= 7) {
        rule.internalized = true;
        msgs.push(`补丁「${def?.name ?? rule.id}」已内化——它不再需要意志力了。`);
      }
    } else if (rule.streak > 0) {
      rule.streak = Math.floor(rule.streak / 2);
      const refund = Math.round((def?.installCost.cash ?? 0) / 4);
      if (refund > 0) s.cash += refund;
      msgs.push(`补丁「${def?.name ?? rule.id}」今天没执行，内化进度清半。`);
    }
  }
  for (const m of msgs) pushLog(s, m, 'sys');
  return msgs;
}

/** 内化补丁的行动乘子（按行动 domain 合成；未内化不生效） */
export function patchMult(s: StateSlice, domain?: string): number {
  if (!domain) return 1;
  let m = 1;
  for (const rule of s.osRules) {
    if (!rule.internalized) continue;
    for (const pm of PATCH_MULTS) {
      if (pm.id === rule.id && pm.domain === domain) m *= pm.mult;
    }
  }
  return m;
}
