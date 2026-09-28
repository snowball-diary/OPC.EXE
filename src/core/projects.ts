// 项目引擎（技术文档 §5.6）：立项幂律抽取 / 每日被动流 / 月度收入结算（churn·月三魔咒·灰产合规）/ pivot / 退役
import { findProjectType, PROJECT_TYPES } from '../data/projects.def';
import { num, phaseMult } from './economy';
import { grantKp, pushLog } from './state';
import type { Rng } from './rng';
import type { ActionResult, Project, ProjectTypeId, RevenueModelId, StateSlice } from './types';

const clamp100 = (n: number): number => Math.max(0, Math.min(100, n));

const STAGE_ORDER = ['idea', 'validate', 'build', 'launch', 'grow', 'mature', 'decline'] as const;
export function stageIdx(st: Project['stage']): number {
  return STAGE_ORDER.indexOf(st);
}

/** 目标项目：指定 id 或「最新活跃」；供行动与效果落账使用 */
export function targetProject(s: StateSlice, projectId?: string): Project | undefined {
  if (projectId) return s.projects.find(p => p.id === projectId && p.alive);
  const alive = s.projects.filter(p => p.alive);
  return alive.length > 0 ? alive[alive.length - 1] : undefined;
}

const RISK_BY_CLASS: Record<string, number> = { ai: 45, svc: 25, content: 35, edu: 30, ecom: 40, autoSrv: 40, gray: 60 };

let projectSeq = 0;

/** 立项：pmfTrue ~ powerLaw(2.2, 5) 钳 [5,95]（对玩家不可见）；noise = max(2, 30-认知×0.25) */
export function createProject(
  s: StateSlice,
  name: string,
  typeId: ProjectTypeId,
  revenueModel: RevenueModelId,
  rng: Rng
): ActionResult & { project?: Project } {
  if (s.meta.over) return { ok: false, msg: '生涯已结束' };
  const t = findProjectType(typeId);
  if (!t) return { ok: false, msg: `未知项目类型：${typeId}` };
  const alive = s.projects.filter(p => p.alive).length;
  if (alive >= s.attentionCap) return { ok: false, msg: `注意力槽已满（${alive}/${s.attentionCap}）：先退役或 pivot 一个` };
  const pmfTrue = Math.max(5, Math.min(95, rng.powerLaw(2.2, 5)));
  const noise = Math.max(2, 30 - s.cognition * 0.25);
  projectSeq += 1;
  const p: Project = {
    id: `p${s.meta.day}_${projectSeq}_${s.projects.length}`, // [S8] 追加 length 分量：读档后模块计数器归零也能免 id 撞车
    name: name.trim() === '' ? `${t.name}#${projectSeq}` : name.trim(),
    type: t.id,
    revenueModel,
    stage: 'idea',
    progress: 0,
    quality: 50,
    pmfTrue,
    pmfEstimate: { v: clamp100(pmfTrue + (rng.next() * 2 - 1) * noise), noise },
    risk: RISK_BY_CLASS[t.potentialClass] ?? 40,
    maintenance: 0,
    users: 0,
    mrr: 0,
    ageMonths: 0,
    version: 1,
    alive: true,
    decayRate: 2,
    gray: t.gray,
    lastMonthMrr: undefined,
    stalledMonths: 0
  };
  s.projects.push(p);
  grantKp(s, 'mvp'); // [S8] 首次立项必送：最小可行产品词条（grantKp 幂等，只送一次）
  if (p.gray) {
    s.flags.grayHistory = true; // 永久记录：尽调/稽查/道德线全部回查
    s.stats.grayDeals += 1;
    s.compliance = Math.max(0, s.compliance - 5);
    grantKp(s, 'relay');
    pushLog(s, `立项「${p.name}」（${t.name}）——灰产线：合规-5，稽查权重×2。短多长空，自己掂量。`, 'purple');
  } else {
    pushLog(s, `立项「${p.name}」（${t.name}）：PMF 预估 ${Math.round(p.pmfEstimate.v)}±${Math.round(noise)}。真实潜力未知。`);
  }
  return { ok: true, msg: `立项「${p.name}」`, project: p, floatTexts: [{ text: '立项', cls: 'gold' }] };
}

/** 项目日：被动收入按日折算（mrr×被动占比/30），维护欠账每日 +0.2；中断（停摆）时无被动流 */
export function tickProjectsDay(s: StateSlice, rng: Rng): void {
  void rng;
  for (const p of s.projects) {
    if (!p.alive) continue;
    if (s.flags.interrupted !== true) {
      const t = findProjectType(p.type);
      const share = t?.passiveShare ?? 0;
      const flow = (p.mrr * share) / 30; // 被动部分按日到账；非被动部分月结入账
      if (flow > 0) {
        s.cash += flow;
        s.stats.totalRevenue += flow;
        s.flags.monthRevenueAcc = num(s.flags.monthRevenueAcc) + flow;
      }
    }
    p.maintenance = clamp100(p.maintenance + 0.2);
  }
}

export interface ProjectMonthResult {
  income: number; // 本月 MRR 全额
  passiveIncome: number; // 被动部分（自由期判定）
  upkeep: number; // 月维护支出（已扣现金）
  moonThree: string[]; // 月三魔咒项目名
}

/** 项目月度结算：users 生长 → churn → mrr → 衰减/灰产合规/decline 检测/月三魔咒 */
export function settleProjectsMonth(s: StateSlice, rng: Rng): ProjectMonthResult {
  let income = 0;
  let passiveIncome = 0;
  let upkeep = 0;
  const moonThree: string[] = [];
  for (const p of s.projects) {
    if (!p.alive) continue;
    const t = findProjectType(p.type);
    if (!t) continue;
    p.ageMonths += 1;
    const earning = stageIdx(p.stage) >= 3; // launch 之后才有收入
    // decline 检测：连续 2 月增长<2%
    const last = p.lastMonthMrr;
    if (earning && last !== undefined) {
      const growth = last <= 0 ? (p.mrr > 0 ? 1 : 0) : (p.mrr - last) / last;
      if (growth < 0.02) p.stalledMonths = (p.stalledMonths ?? 0) + 1;
      else p.stalledMonths = 0;
      if ((p.stalledMonths ?? 0) >= 2 && p.stage !== 'decline') {
        p.stage = 'decline';
        pushLog(s, `「${p.name}」连续两月增长乏力，进入衰退：pivot 或体面退役，二选一。`, 'bad');
      }
    }
    p.lastMonthMrr = p.mrr;
    if (earning) {
      const churn = 0.05 + Math.max(0, 60 - p.quality) / 200 + p.maintenance / 400;
      const target = p.pmfTrue * 10 * (p.quality / 100);
      p.users = Math.max(0, p.users + (target - p.users) * 0.15 + (rng.next() * 2 - 1) * 2);
      const price = (t.price[0] + t.price[1]) / 2;
      const gross = p.users * price * (p.quality / 100) * phaseMult(s.economyPhase);
      p.mrr = Math.max(0, gross * (1 - churn));
      let inc = p.mrr;
      if (s.flags.interrupted === true) inc *= 0.3; // 项目停摆：收入×0.3
      income += p.mrr;
      passiveIncome += p.mrr * t.passiveShare;
      s.cash += inc;
      s.stats.totalRevenue += inc;
      s.flags.monthRevenueAcc = num(s.flags.monthRevenueAcc) + inc * (1 - t.passiveShare);
      if (p.stage === 'launch' && p.mrr > 0) p.stage = 'grow';
      if (p.stage === 'grow' && p.mrr >= 10000) p.stage = 'mature';
    } else {
      p.mrr = 0;
    }
    // 月三魔咒：第 3 个月 MRR 仍 <1000（调研：此后仅 12.3% 能到 1K）
    if (p.ageMonths === 3 && p.mrr < 1000) moonThree.push(p.name);
    // 灰产：合规月度 -3（稽查×2 的权重由 S3 事件读 flags.grayHistory）
    if (p.gray) s.compliance = Math.max(0, s.compliance - 3);
    // 衰减：quality 自然下滑；幽灵公司 ×1.5；维护欠账>70 额外 -2
    p.quality = clamp100(p.quality - p.decayRate * (s.autoLevel >= 85 ? 1.5 : 1));
    if (p.maintenance > 70) p.quality = clamp100(p.quality - 2);
    p.maintenance = clamp100(p.maintenance + 4);
    // 月维护基线
    upkeep += t.baseCost;
    s.cash -= t.baseCost;
  }
  return { income, passiveIncome, upkeep, moonThree };
}

/** pivot：保留 quality 60% / pmfEstimate 50% / progress 30%，换类型重来 */
export function pivotProject(s: StateSlice, projectId: string, toType: ProjectTypeId, rng: Rng): ActionResult {
  void rng;
  if (s.meta.over) return { ok: false, msg: '生涯已结束' };
  const p = s.projects.find(x => x.id === projectId && x.alive);
  if (!p) return { ok: false, msg: '项目不存在或已退役' };
  const t = findProjectType(toType);
  if (!t) return { ok: false, msg: `未知项目类型：${toType}` };
  p.quality = clamp100(p.quality * 0.6);
  p.pmfEstimate.v = clamp100(p.pmfEstimate.v * 0.5);
  p.progress = clamp100(p.progress * 0.3);
  p.type = t.id;
  p.stage = 'idea';
  p.users = 0;
  p.mrr = 0;
  p.lastMonthMrr = undefined;
  p.stalledMonths = 0;
  p.version += 1;
  p.gray = t.gray;
  s.stats.pivots += 1;
  if (p.gray) s.flags.grayHistory = true;
  pushLog(s, `「${p.name}」转型为 ${t.name}：保留六成质量、三成进度。过去的积累没有白费。`, 'sys');
  return { ok: true, msg: `转型为 ${t.name}`, floatTexts: [{ text: 'Pivot', cls: 'gold' }] };
}

/** 体面退役：残值 = users×2 + quality×10 → 现金 + 资产项；槽位释放 */
export function retireProject(s: StateSlice, projectId: string): ActionResult {
  if (s.meta.over) return { ok: false, msg: '生涯已结束' };
  const p = s.projects.find(x => x.id === projectId && x.alive);
  if (!p) return { ok: false, msg: '项目不存在或已退役' };
  const residual = Math.round(p.users * 2 + p.quality * 10);
  p.alive = false;
  p.mrr = 0;
  p.users = Math.round(p.users);
  s.cash += residual;
  s.assets.push({ id: `a${p.id}`, name: `${p.name}（退役资产）`, kind: 'work', value: residual, day: s.meta.day });
  if (p.users > 0 || p.mrr > 0) s.stats.projectsDone += 1;
  else s.stats.projectsFailed += 1;
  pushLog(s, `「${p.name}」体面退役：回收残值 ¥${residual}。${p.users > 0 ? '它服务过真实的人。' : '它没能等到自己的用户。'}`, p.users > 0 ? 'gold' : 'sys');
  return { ok: true, msg: `退役回收 ¥${residual}`, floatTexts: [{ text: `+¥${residual}`, cls: 'gold' }] };
}

export { PROJECT_TYPES };
