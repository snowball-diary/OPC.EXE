// 平台与分发引擎（技术文档 §10；设计方案 §七）——S3 真实现，替换 S2 桩
//
// 职责：
//   ensureAccount        无账号则创建 observe 状态（30 天，流量×0.4，违规惩罚×2）
//   rollPlatformDay      observe 计时 / throttled 7 天计时 / 粉丝自然漂移 / 日变现入账 /
//                        一鱼八吃延迟队列（dist: 前缀链种子）/ banRiskRoll / 收入占比与依赖警戒
//   publishContent       大爆小爆抽样（§5.7：90% 平庸 / 9% ×3 / 1% ×15）+ AI 未声明检测×3 + banRisk 累积
//   distributeContent    一鱼八吃：按 delayHours 分当日/次日/三日三批，各平台独立抽样
//   banRiskRoll          normal→throttled（7 天流量×0.3）→banned（粉丝按私域化率清算，收入停）
//   banChance            概率纯函数：单平台收入占比>60% → ×3（依赖警戒）
import { findEventDef } from '../data/events.def';
import { findLocation } from '../data/locations.def';
import { findPlatform, PLATFORM_DEFS } from '../data/platforms.def';
import { num, phaseMult } from './economy';
import { enqueueEvent } from './events';
import { grantKp, pushLog } from './state';
import type { Rng } from './rng';
import type { PlatformAccount, PlatformId, StateSlice } from './types';

const clamp01 = (n: number): number => Math.max(0, Math.min(100, n));

/** 确保平台账号存在（observe 30 天起：流量×0.4，违规惩罚×2） */
export function ensureAccount(s: StateSlice, pid: string): PlatformAccount {
  let acc = s.platforms[pid];
  if (!acc) {
    acc = { state: 'observe', observeDaysLeft: 30, followers: 0, aiDeclared: false, banRisk: 0, incomeShare: 0 };
    s.platforms[pid] = acc;
  }
  return acc;
}

// ---------- 纯函数工具 ----------

/** 大爆小爆分段：u<0.90 平庸×1 / <0.99 小爆×3 / 其余大爆×15（§5.7 幂律） */
export function plTier(u: number): 1 | 3 | 15 {
  return u < 0.9 ? 1 : u < 0.99 ? 3 : 15;
}

/** 账号状态流量乘子：observe 0.4 / throttled 0.3 / banned 0 / normal 1（§10.1） */
export function stateFlowMult(acc: PlatformAccount): number {
  if (acc.state === 'observe') return 0.4;
  if (acc.state === 'throttled') return 0.3;
  if (acc.state === 'banned') return 0;
  return 1;
}

/** 出海线：海外/游牧 location 视作出海，否则 youtube 流量×0.3（设计方案 §七） */
export function isOverseas(s: StateSlice): boolean {
  const tier = findLocation(s.location)?.tier ?? '';
  return tier.includes('海外') || tier.includes('游牧');
}

/** 私域化率：数字 0-1 直接用；布尔 true（结局系统口径）按 0.5 */
export function privateDomainRate(s: StateSlice): number {
  const v = s.flags.privateDomain;
  if (typeof v === 'number') return Math.max(0, Math.min(1, v));
  return v === true ? 0.5 : 0;
}

function agentScale(s: StateSlice, id: string): number {
  return s.agents.find(a => a.id === id)?.usageScale ?? 0;
}

// ---------- 收入占比与单平台依赖 ----------

/** 由本月各平台收入累加器（flags.pl_inc_*）重算 incomeShare */
export function computeIncomeShares(s: StateSlice): void {
  let total = 0;
  for (const pid of Object.keys(s.platforms)) total += num(s.flags[`pl_inc_${pid}`]);
  for (const [pid, acc] of Object.entries(s.platforms)) {
    if (!acc) continue;
    acc.incomeShare = total > 0 ? Math.max(0, Math.min(1, num(s.flags[`pl_inc_${pid}`]) / total)) : 0;
  }
}

/** 单平台依赖：某平台收入占比>60% 且仍有粉丝 → 返回该平台 id（否则 null） */
export function platformDependency(s: StateSlice): PlatformId | null {
  for (const [pid, acc] of Object.entries(s.platforms)) {
    if (acc && acc.state !== 'banned' && acc.followers > 0 && acc.incomeShare > 0.6) return pid;
  }
  return null;
}

/** 封号掷骰概率（纯函数，测试直接断言 ×3）：banRisk/100 × 0.04 × observe×2 × 依赖×3 */
export function banChance(s: StateSlice, pid: string): number {
  const acc = s.platforms[pid];
  if (!acc || acc.state === 'banned') return 0;
  let p = (acc.banRisk / 100) * 0.04;
  if (acc.state === 'observe') p *= 2; // 观察期违规惩罚×2
  if (acc.incomeShare > 0.6) p *= 3; // 单平台依赖警戒
  return p;
}

// ---------- 发布（大爆小爆在这里抽样） ----------

export function publishContent(s: StateSlice, pid: string, rng: Rng): { ok: boolean; msg: string; followers: number; income: number } {
  const def = findPlatform(pid);
  if (!def) return { ok: false, msg: `未知平台：${pid}`, followers: 0, income: 0 };
  const acc = ensureAccount(s, pid);
  if (acc.state === 'banned') {
    return { ok: false, msg: `${def.name}账号已被封禁：收入停摆，换平台或转私域重建`, followers: 0, income: 0 };
  }
  const obs = acc.state === 'observe' ? 2 : 1;
  const contentOn = s.agents.some(a => a.id === 'content');
  const growthOn = s.agents.some(a => a.id === 'growth');

  // --- AI 未声明检测：content agent 在岗且未声明 → 概率×3（§8.5/§10） ---
  let aiFlagged = false;
  const detectP = acc.aiDeclared ? 0 : contentOn ? 0.02 * 3 : 0.02; // 2026 AI 标识义务
  if (detectP > 0 && rng.chance(detectP)) {
    aiFlagged = true;
    enqueueEvent(s, 'aiUndeclared', 'forced', { cooldownDays: 7 });
    if (!findEventDef('aiUndeclared')) {
      // S5 未落地该事件 → 内部小惩罚先行（限流：banRisk+、粉丝小幅流失）
      acc.banRisk = clamp01(acc.banRisk + 4 * def.banRiskBase * obs);
      acc.followers = Math.max(0, Math.round(acc.followers * 0.95));
      pushLog(s, `【${def.name}】AI 未声明被检测标记：限流惩罚（补声明可消除）。`, 'bad');
    }
  }

  // --- banRisk 累积：平台底噪 + growth/content 用量（§8.5）+ 未声明 + 谐音变体（§七：规避反而加重） ---
  let add = 0.4 * def.banRiskBase * obs;
  if (growthOn) add += 0.3 * agentScale(s, 'growth') * obs;
  if (contentOn) add += 0.3 * agentScale(s, 'content') * obs;
  if (!acc.aiDeclared) add += 0.8;
  if (s.flags.homophone === true) add += 1.5;
  if (def.banRiskBase > 0) acc.banRisk = clamp01(acc.banRisk + add);

  // --- 大爆小爆幂律抽样（各平台独立） ---
  const tier = plTier(rng.next());
  const base = rng.int(3, 14) + acc.followers * 0.015;
  const variance = 1 + (rng.next() - 0.5) * 0.4 * (def.flowVar ?? 1); // douyin 头部效应：方差大
  let gain = Math.round(base * def.flowMult * stateFlowMult(acc) * tier * variance);
  if (pid === 'youtube' && !isOverseas(s)) gain = Math.round(gain * 0.3); // 国内运营出海平台
  if (gain < 1) gain = 1;
  acc.followers += gain;
  s.stats.followersPeak = Math.max(s.stats.followersPeak, acc.followers);

  // --- 即时变现（observe 期不变现；大爆/小爆有爆发系数）[S9] 地点市场规模参与 ---
  let income = 0;
  if (acc.state !== 'observe') {
    const burst = tier === 15 ? 30 : tier === 3 ? 8 : 1;
    const market = findLocation(s.location)?.marketMult ?? 1; // 一线广告单价高（机会补偿）
    income = Math.round(gain * def.mRate * burst * phaseMult(s.economyPhase) * market);
  }
  if (income > 0) {
    s.cash += income;
    s.stats.totalRevenue += income;
    if (tier === 15) s.stats.bigHits += 1;
    s.flags.monthRevenueAcc = num(s.flags.monthRevenueAcc) + income;
    s.flags[`pl_inc_${pid}`] = num(s.flags[`pl_inc_${pid}`]) + income;
    s.dailyFlow.passiveIn += income; // [v0.10/W2] 发布即时变现 → 今日净流
  }

  const aiNote = aiFlagged ? '（AI 未声明被标记！）' : '';
  const msg = tier === 15
    ? `大爆！内容冲上${def.name}热门（×15 流量）${aiNote}`
    : tier === 3
      ? `小爆：进入${def.name}推荐池（×3 流量）${aiNote}`
      : `发布完成：平平淡淡的次曝光${aiNote}`;
  return { ok: true, msg, followers: gain, income };
}

// ---------- 一鱼八吃（§10.2 瀑布分发） ----------

export interface DistributeResult {
  ok: boolean;
  msg: string;
  batches: { pid: PlatformId; delayDays: number }[];
}

/** 一次创作 → 其余平台按 delayHours 分三批：当日(0h)/次日(24h)/三日(72h)，各平台独立抽样 */
export function distributeContent(s: StateSlice, primaryId: string, rng: Rng): DistributeResult {
  if (s.meta.over) return { ok: false, msg: '生涯已结束', batches: [] };
  const primaryAcc = s.platforms[primaryId];
  if (!primaryAcc || primaryAcc.state === 'banned') {
    return { ok: false, msg: '主平台不可用：先发布到一个可用平台', batches: [] };
  }
  const batches: { pid: PlatformId; delayDays: number }[] = [];
  for (const def of PLATFORM_DEFS) {
    if (def.id === primaryId) continue;
    const acc = ensureAccount(s, def.id);
    if (acc.state === 'banned') continue;
    const delayDays = def.delayHours === 0 ? 0 : def.delayHours <= 24 ? 1 : 3;
    if (delayDays === 0) publishContent(s, def.id, rng);
    else s.pending.chains.push({ event: `dist:${def.id}`, delayDays }); // 延迟队列（rollPlatformDay 消费）
    batches.push({ pid: def.id, delayDays });
  }
  pushLog(s, `一鱼八吃：内容从「${findPlatform(primaryId)?.name ?? primaryId}」瀑布分发到 ${batches.length} 个平台（当日/次日/三日三批）。`, 'good');
  return { ok: true, msg: `已分发 ${batches.length} 个平台`, batches };
}

// ---------- 状态机与每日结算 ----------

function toBanned(s: StateSlice, pid: string, acc: PlatformAccount): 'banned' {
  const name = findPlatform(pid)?.name ?? pid;
  const rate = privateDomainRate(s);
  const kept = Math.round(acc.followers * rate);
  acc.state = 'banned';
  acc.followers = kept;
  acc.incomeShare = 0;
  pushLog(s, `【封号】${name}账号被封：粉丝清零×(1-私域化率)，收入停摆。${rate > 0 ? `私域帮你保住了 ${kept} 人。` : '没有私域，一夜归零。'}`, 'bad');
  return 'banned';
}

/** 账号迁移掷骰：normal→throttled（7 天流量×0.3）→banned；banRisk≥85 直接封 */
export function banRiskRoll(s: StateSlice, pid: string, rng: Rng): PlatformAccount['state'] {
  const acc = s.platforms[pid];
  if (!acc || acc.state === 'banned') return acc?.state ?? 'normal';
  if (!rng.chance(banChance(s, pid))) return acc.state;
  if (acc.state === 'normal') {
    if (acc.banRisk >= 85) return toBanned(s, pid, acc);
    acc.state = 'throttled';
    s.flags[`pl_throttle_${pid}`] = 7;
    grantKp(s, 'platformRisk'); // [S8] 首次限流送平台风险词条
    pushLog(s, `【限流】${findPlatform(pid)?.name ?? pid}触发风控：7 天流量×0.3（banRisk ${Math.round(acc.banRisk)}）。收手或转平台，自己选。`, 'bad');
    return 'throttled';
  }
  return toBanned(s, pid, acc); // throttled 再犯 → banned
}

/** 平台日（time.ts 步 5 调用点，保持 S2 函数名）：状态机计时 / 漂移 / 日变现 / 延迟队列 / 掷骰 */
export function rollPlatformDay(s: StateSlice, rng: Rng): void {
  if (s.meta.over) return;
  const monthBoundary = s.meta.day % 30 === 0;
  const overseas = isOverseas(s);

  // --- 一鱼八吃延迟队列：dist:<pid> 递减，到期发布（独立抽样） ---
  const due: string[] = [];
  s.pending.chains = s.pending.chains.filter(c => {
    if (!c.event.startsWith('dist:')) return true;
    c.delayDays -= 1;
    if (c.delayDays <= 0) {
      due.push(c.event.slice(5));
      return false;
    }
    return true;
  });
  for (const pid of due) publishContent(s, pid, rng);

  // --- 各账号状态机 + 自然漂移 + 日变现 ---
  for (const [pid, acc] of Object.entries(s.platforms)) {
    const def = findPlatform(pid);
    if (!acc || !def || acc.state === 'banned') continue;
    if (acc.state === 'observe') {
      acc.observeDaysLeft = Math.max(0, acc.observeDaysLeft - 1);
      if (acc.observeDaysLeft === 0) {
        acc.state = 'normal';
        grantKp(s, 'newAccount'); // [S8] 首个观察期结束送平台冷启动词条
        pushLog(s, `【${def.name}】30 天观察期结束：流量恢复正常，变现开启。`, 'good');
      }
    } else if (acc.state === 'throttled') {
      const left = num(s.flags[`pl_throttle_${pid}`]) - 1;
      if (left <= 0) {
        delete s.flags[`pl_throttle_${pid}`];
        acc.state = 'normal';
        pushLog(s, `【${def.name}】限流解除：流量恢复。别再头铁。`, 'sys');
      } else {
        s.flags[`pl_throttle_${pid}`] = left;
      }
    }
    acc.followers = Math.max(0, Math.round(acc.followers * 0.998)); // 自然漂移 -0.2%/日
    if (acc.state !== 'observe') {
      const market = findLocation(s.location)?.marketMult ?? 1; // [S9] 日变现同享地点市场规模
      let inc = acc.followers * def.mRate * phaseMult(s.economyPhase) * market * (acc.state === 'throttled' ? 0.3 : 1);
      if (pid === 'youtube' && !overseas) inc *= 0.3;
      inc = Math.round(inc);
      if (inc > 0) {
        s.cash += inc;
        s.stats.totalRevenue += inc;
        s.flags.monthRevenueAcc = num(s.flags.monthRevenueAcc) + inc;
        s.flags[`pl_inc_${pid}`] = num(s.flags[`pl_inc_${pid}`]) + inc;
        s.dailyFlow.passiveIn += inc; // [v0.10/W2] 平台日变现 → 今日净流
      }
    }
    if (acc.banRisk > 0) acc.banRisk = Math.max(0, acc.banRisk - 0.3); // 改过自新缓降
    banRiskRoll(s, pid, rng);
  }

  // --- 收入占比重算（依赖警戒）+ 月度累加器清零 ---
  computeIncomeShares(s);
  if (monthBoundary) {
    for (const pid of Object.keys(s.platforms)) s.flags[`pl_inc_${pid}`] = 0;
  }
  const dep = platformDependency(s);
  // [v0.10/体感修复] 依赖警戒加收入地板：月入不足 ¥500 时占比>60% 只是噪声
  // （样张实证：观察期刚结束、平台月入 ¥7 也弹「依赖警戒」，玩家被假警报练出免疫）
  if (dep && num(s.flags[`pl_inc_${dep}`]) >= 500 && num(s.flags.plDepWarnDay) < s.meta.day - 6) {
    s.flags.plDepWarnDay = s.meta.day;
    pushLog(s, `单平台依赖警戒：「${findPlatform(dep)?.name ?? dep}」收入占比 >60%，该平台风控事件概率 ×3。鸡蛋别放一个篮子里。`, 'bad');
  }
}

/** 任务书口径别名（与 rollPlatformDay 同一实现） */
export const tickPlatformsDay = rollPlatformDay;
