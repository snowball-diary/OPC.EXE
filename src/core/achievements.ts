// 成就引擎（S4）：checkAchievements 返回本轮新解锁并写 flags 记账；achCount 统计已解锁数
// 接线：time.ts advanceDay 末尾调用，新解锁以 cls 'gold' 写入日志（存档天然携带 flags，无需额外序列化）
import { ACHIEVEMENT_DEFS } from '../data/achievements.def';
import type { AchDef } from '../data/achievements.def';
import type { StateSlice } from './types';

/** 检查全部成就：check 命中且未解锁 → 记 flags['ach_'+id] 并返回（幂等：重复调用返回空） */
export function checkAchievements(s: StateSlice): AchDef[] {
  const unlocked: AchDef[] = [];
  for (const def of ACHIEVEMENT_DEFS) {
    const key = `ach_${def.id}`;
    if (s.flags[key] === true) continue;
    if (def.check(s)) {
      s.flags[key] = true;
      unlocked.push(def);
    }
  }
  return unlocked;
}

/** 已解锁成就数（UI 角标/结算页用） */
export function achCount(s: StateSlice): number {
  return ACHIEVEMENT_DEFS.reduce((n, d) => (s.flags[`ach_${d.id}`] === true ? n + 1 : n), 0);
}
