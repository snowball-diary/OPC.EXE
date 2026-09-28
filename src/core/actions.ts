// 行动执行器（技术文档 §5.4）：cond 检查 → S1 衰减 → healthMult → 特质/补丁/地点乘子 → effects 落账 → special 分支 → 日志飘字
import { findAction, pricingMult } from '../data/actions.def';
import { findLocation } from '../data/locations.def';
import { healthMult, num } from './health';
import { patchMult } from './os';
import { publishContent } from './platforms';
import { clampAll, pushLog } from './state';
import type { Rng } from './rng';
import type {
  ActionResult, Effect, EffectKey, PlatformAccount, Project, Range, SkillDim, StateSlice
} from './types';
import { targetProject } from './projects';

const clamp100 = (n: number): number => Math.max(0, Math.min(100, n));

export const weekOf = (day: number): number => Math.floor((Math.max(0, day - 1)) / 7);

const STAGE_ORDER = ['idea', 'validate', 'build', 'launch', 'grow', 'mature', 'decline'] as const;
export function stageIdx(st: (typeof STAGE_ORDER)[number]): number {
  return STAGE_ORDER.indexOf(st);
}

const NAMES = ['老周', '阿岚', 'Kevin', '小赵', '陈姐', '老高', 'Yuki', '大鹏'] as const;
let contactSeq = 0;

function addContact(s: StateSlice, type: 'peer' | 'client' | 'mentor' | 'vendor' | 'investor'): void {
  contactSeq += 1;
  s.contacts.push({
    id: `c${s.meta.day}_${contactSeq}_${s.contacts.length}`, // [S8] 追加 length 分量：读档后计数器归零也能免 id 撞车
    name: NAMES[contactSeq % NAMES.length] ?? '路人',
    type,
    relation: 40,
    lastTouch: s.meta.day
  });
  s.stats.contactsMade += 1;
}

// ---------- 通用效果落账（导出供事件引擎复用） ----------

export interface EffectCtx {
  projectId?: string;
  platformId?: string; // [S8] 内容营销选定的主平台（writeContent 官方管线发布目标）
  rng?: Rng;
  mult?: number; // 行动乘子（S1 衰减/健康/焦点/补丁/特质合成）
}

function rollVal(v: number | Range, rng?: Rng): number {
  if (typeof v === 'number') return v;
  if (!rng) return (v[0] + v[1]) / 2;
  return rng.int(Math.round(v[0]), Math.round(v[1]));
}

export function applyEffects(s: StateSlice, effects: readonly Effect[], ctx: EffectCtx = {}): void {
  const mult = ctx.mult ?? 1;
  const rng = ctx.rng;
  const proj = (): Project | undefined => targetProject(s, ctx.projectId);
  for (const e of effects) {
    const raw = rollVal(e.v, rng);
    const k = e.k as string;
    if (k.startsWith('skillExp.')) {
      const dim = k.slice(9) as SkillDim;
      if (e.op === '*') s.skillExp[dim] *= raw;
      else s.skillExp[dim] += e.op === '=' ? raw : raw * mult;
      checkSkillUp(s, dim);
      continue;
    }
    if (k.startsWith('skillLevel.')) {
      const dim = k.slice(11) as SkillDim;
      s.skills[dim] = clamp100(raw) as StateSlice['skills'][SkillDim];
      continue;
    }
    if (k.startsWith('deliveries.')) {
      const dim = k.slice(11) as SkillDim;
      s.deliveries[dim] += Math.max(0, Math.round(e.op === '=' ? raw : raw * mult));
      continue;
    }
    if (k.startsWith('followers.')) {
      const pid = k.slice(10);
      const acc = ensurePlatform(s, pid);
      acc.followers = Math.max(0, e.op === '=' ? raw : acc.followers + Math.round(raw * mult));
      s.stats.followersPeak = Math.max(s.stats.followersPeak, acc.followers);
      continue;
    }
    if (k.startsWith('flag.')) {
      // op '+' 置位；'=' 时 v=1→true / v=0→false / 其他数值原样存（如 privateDomain=0.3）
      s.flags[k.slice(5)] = e.op === '+' ? true : (raw === 1 ? true : raw === 0 ? false : raw);
      continue;
    }
    if (k.startsWith('project')) {
      const p = proj();
      if (!p) continue;
      switch (k) {
        case 'projectProgress': p.progress = clamp100(e.op === '*' ? p.progress * raw : e.op === '=' ? raw : p.progress + raw * mult); break;
        case 'projectQuality': p.quality = clamp100(e.op === '*' ? p.quality * raw : e.op === '=' ? raw : p.quality + raw * mult); break;
        case 'projectPmfTrue': p.pmfTrue = clamp100(e.op === '*' ? p.pmfTrue * raw : e.op === '=' ? raw : p.pmfTrue + raw); break;
        case 'projectPmfNoise': p.pmfEstimate.noise = clamp100(e.op === '*' ? p.pmfEstimate.noise * raw : e.op === '=' ? raw : p.pmfEstimate.noise + raw); break;
        case 'projectUsers': p.users = Math.max(0, e.op === '*' ? p.users * raw : e.op === '=' ? raw : p.users + raw); break;
        case 'projectMrr': p.mrr = Math.max(0, e.op === '*' ? p.mrr * raw : e.op === '=' ? raw : p.mrr + raw); break;
        case 'projectMaintenance': p.maintenance = clamp100(e.op === '*' ? p.maintenance * raw : e.op === '=' ? raw : p.maintenance + raw * mult); break;
        default: break;
      }
      continue;
    }
    const val = e.op === '=' ? raw : raw * mult;
    switch (k as EffectKey) {
      case 'cash': {
        let v = val;
        if (e.op === '+' && v > 0 && s.flags.zen === true) v *= 0.9; // 佛系：收入×0.9
        s.cash = e.op === '=' ? v : s.cash + v;
        s.flags.weekCashDelta = num(s.flags.weekCashDelta) + v;
        break;
      }
      case 'debt': s.debt = Math.max(0, e.op === '=' ? val : s.debt + val); break;
      case 'energy': s.energy = clamp100(e.op === '*' ? s.energy * val : val); break;
      case 'ap': s.ap = Math.max(0, s.ap + val); break;
      case 'stress': s.stress = clamp100(e.op === '*' ? s.stress * val : s.stress + val); break;
      case 'hiddenFatigue': s.health.hiddenFatigue = clamp100(e.op === '*' ? s.health.hiddenFatigue * val : s.health.hiddenFatigue + val); break;
      case 'burnoutCount': s.burnoutCount = Math.max(0, s.burnoutCount + Math.round(val)); break;
      case 'sleep': s.health.sleep.v = clamp100(e.op === '*' ? s.health.sleep.v * val : s.health.sleep.v + val); break;
      case 'mood': s.health.mood.v = clamp100(e.op === '*' ? s.health.mood.v * val : s.health.mood.v + val); break;
      case 'diet': s.health.diet.v = clamp100(e.op === '*' ? s.health.diet.v * val : s.health.diet.v + val); break;
      case 'exercise': s.health.exercise.v = clamp100(e.op === '*' ? s.health.exercise.v * val : s.health.exercise.v + val); break;
      case 'healthWhole': {
        const w: [number, number, number, number] = [0.4, 0.25, 0.2, 0.15];
        const keys = ['sleep', 'mood', 'diet', 'exercise'] as const;
        for (let i = 0; i < 4; i++) {
          const key = keys[i];
          const wi = w[i];
          if (key && wi !== undefined) s.health[key].v = clamp100(s.health[key].v + val * wi);
        }
        break;
      }
      case 'info': s.info = clamp100(e.op === '*' ? s.info * val : s.info + val); break;
      case 'cognition': s.cognition = clamp100(e.op === '*' ? s.cognition * val : s.cognition + val); break;
      case 'character': s.character = clamp100(e.op === '*' ? s.character * val : s.character + val); break;
      case 'rep': s.rep = clamp100((typeof s.rep === 'number' ? s.rep : 0) + val); break;
      case 'influence': s.influence = clamp100(e.op === '*' ? s.influence * val : s.influence + val); break;
      case 'power': s.power = clamp100(e.op === '*' ? s.power * val : s.power + val); break;
      case 'compliance': s.compliance = clamp100(e.op === '*' ? s.compliance * val : s.compliance + val); break;
      case 'creditScore': s.creditScore = Math.max(0, Math.min(1000, Math.round(e.op === '*' ? s.creditScore * val : s.creditScore + val))); break;
      case 'morality': s.morality = clamp100(e.op === '*' ? s.morality * val : s.morality + val); break;
      case 'autoLevel': s.autoLevel = clamp100(e.op === '*' ? s.autoLevel * val : s.autoLevel + val); break;
      case 'tokenBill': s.tokenBill.lastMonth = Math.max(0, s.tokenBill.lastMonth + val); break;
      case 'tokenPriceIndex': s.tokenBill.priceIndex = e.op === '=' ? raw : s.tokenBill.priceIndex + val; break;
      case 'attentionCap': s.attentionCap = Math.max(1, s.attentionCap + Math.round(val)); break;
      case 'contacts': for (let i = 0; i < Math.max(0, Math.round(val)); i++) addContact(s, 'peer'); break;
      case 'assetAdd': {
        s.assets.push({ id: `a${s.meta.day}_${s.assets.length + 1}`, name: '作品资产', kind: 'work', value: Math.max(0, Math.round(raw)), day: s.meta.day });
        break;
      }
      default: break; // rep 之外的未知键忽略（S3 事件扩展点）
    }
  }
}

function ensurePlatform(s: StateSlice, pid: string): PlatformAccount {
  let acc = s.platforms[pid];
  if (!acc) {
    acc = { state: 'observe', observeDaysLeft: 30, followers: 0, aiDeclared: false, banRisk: 0, incomeShare: 0 };
    s.platforms[pid] = acc;
  }
  return acc;
}

// ---------- 技能升级（§5.5） ----------

const EXP_THRESHOLDS = [50, 120, 260, 480];

/** exp 阈值 [50,120,260,480]；L3 需 deliveries≥3、L4 需 ≥6（未达标经验挂账，交付后补升） */
export function checkSkillUp(s: StateSlice, dim: SkillDim): boolean {
  let up = false;
  while (s.skills[dim] < 4) {
    const lv = s.skills[dim];
    const need = EXP_THRESHOLDS[lv];
    if (need === undefined || s.skillExp[dim] < need) break;
    const needDlv = lv === 2 ? 3 : lv === 3 ? 6 : 0;
    if (s.deliveries[dim] < needDlv) break;
    s.skills[dim] = (lv + 1) as StateSlice['skills'][SkillDim];
    pushLog(s, `技能成长：「${SKILL_NAMES[dim]}」升到 L${s.skills[dim]}（${LEVEL_NAMES[s.skills[dim]]}）`, 'good');
    up = true;
  }
  return up;
}

const SKILL_NAMES: Record<SkillDim, string> = { craft: '造物', expression: '表达', marketing: '营销', operation: '运营', business: '商业' };
const LEVEL_NAMES = ['能模仿', '能独立完成', '能稳定交付', '能改进和教别人', '能改进和教别人'] as const;

// ---------- special 分支 ----------

interface SpecialResult {
  msg?: string;
  floats?: { text: string; cls: string }[];
  fail?: string;
}

function pickPlatformId(s: StateSlice): string {
  const entries = Object.entries(s.platforms);
  if (entries.length === 0) return 'wechat';
  let best = entries[0];
  for (const e of entries) {
    if (best && e[1].followers > best[1].followers) best = e;
  }
  return best?.[0] ?? 'wechat';
}

function runSpecial(s: StateSlice, def: NonNullable<ReturnType<typeof findAction>>, proj: Project | undefined, rng: Rng, mult: number, platformId?: string): SpecialResult {
  const floats: { text: string; cls: string }[] = [];
  switch (def.special) {
    case 'learn': {
      const dim = def.skill ?? 'craft';
      const tier = def.tier ?? 'fit';
      let exp = 0;
      let msg = '';
      if (tier === 'easy') {
        msg = '安全档完成：经验+0（舒适区没有成长）';
      } else if (tier === 'fit') {
        exp = rng.int(10, 25);
        msg = `理解+消化：经验+${exp}`;
      } else if (rng.chance(0.7)) {
        s.stress = clamp100(s.stress + 8);
        exp = rng.int(0, 4);
        msg = '有点难，受挫了：压力+8';
      } else {
        exp = Math.round(rng.int(10, 25) * 1.6);
        msg = `顿悟！经验+${exp}`;
      }
      if (exp > 0) {
        const last = num(s.flags.lastOutputDay);
        const bound = last > 0 && weekOf(last) === weekOf(s.meta.day); // 输入绑定输出（同周；0=从未输出）
        if (!bound) exp = Math.round(exp * 0.2);
        exp = Math.max(1, Math.round(exp * mult));
        if (!bound) msg += `（本周尚无输出：经验×0.2 → +${exp}）`;
        s.skillExp[dim] += exp;
        checkSkillUp(s, dim);
      }
      s.flags.learnedToday = true;
      return { msg, floats: [{ text: `经验+${exp}`, cls: 'good' }] };
    }
    case 'research':
      return { msg: '信息入库' };
    case 'userInterview': {
      if (!proj) return { fail: '需要项目' };
      const noise = proj.pmfEstimate.noise;
      proj.pmfEstimate.v = clamp100(proj.pmfEstimate.v + (proj.pmfTrue - proj.pmfEstimate.v) * Math.min(0.5, (noise / 100) * 0.8));
      proj.pmfEstimate.noise = clamp100(noise * 0.5);
      return { msg: `PMF 读数校准：估计 ${Math.round(proj.pmfEstimate.v)}（噪声 ${Math.round(proj.pmfEstimate.noise)}）`, floats: [{ text: 'PMF 校准', cls: 'good' }] };
    }
    case 'consult': {
      const mentor = s.contacts.find(c => c.type === 'mentor' && c.relation >= 30);
      if (!mentor) return { fail: '没有关系≥30 的导师人脉' };
      mentor.relation = clamp100(mentor.relation + 2);
      mentor.lastTouch = s.meta.day;
      return { msg: `${mentor.name}点了你两句` };
    }
    case 'community': {
      if (rng.chance(0.2)) {
        s.flags.ordersChannel = true;
        return { msg: '群里来了个单子线索：订单渠道解锁' };
      }
      return { msg: '认识了几位同行' };
    }
    case 'developProject': {
      if (!proj) return { fail: '需要项目' };
      if (proj.stage === 'idea' || proj.stage === 'validate') proj.stage = 'build';
      if (proj.progress >= 80 && proj.stage === 'build') {
        proj.stage = 'launch';
        proj.users = Math.round(5 + proj.pmfTrue * 0.3 + rng.int(0, 20));
        pushLog(s, `「${proj.name}」发布！首批用户 ${Math.round(proj.users)} 人进场。`, 'gold');
        return { msg: '发布上线', floats: [{ text: '发布', cls: 'gold' }] };
      }
      if (stageIdx(proj.stage) >= 3) proj.version += 1;
      return { msg: `进度 ${Math.round(proj.progress)}%` };
    }
    case 'publishContent': {
      // [S8] 选定主平台优先（一鱼八吃源头即首发平台）；未选则回退粉丝最多平台
      const pid = platformId ?? pickPlatformId(s);
      const r = publishContent(s, pid, rng);
      s.stats.contentPublished += 1;
      const dim = def.skill ?? 'expression';
      s.skillExp[dim] += Math.max(1, Math.round(6 * mult));
      checkSkillUp(s, dim);
      floats.push({ text: `粉丝+${r.followers}`, cls: 'good' });
      return { msg: `发布到 ${pid}：${r.msg}`, floats };
    }
    case 'market': {
      const pid = pickPlatformId(s);
      const r = publishContent(s, pid, rng);
      s.skillExp.marketing += Math.max(1, Math.round(5 * mult));
      checkSkillUp(s, 'marketing');
      floats.push({ text: `曝光+${r.followers * 10}`, cls: 'good' });
      return { msg: `分发到 ${pid}：${r.msg}`, floats };
    }
    case 'deliver': {
      if (!proj) return { fail: '需要项目' };
      const earnable = stageIdx(proj.stage) >= 2 || s.flags.ordersChannel === true;
      if (!earnable) return { fail: '项目需进入开发后阶段（或先建立订单渠道）' };
      // [S9] 地点市场规模参与：一线单子更大（marketMult 1.35），小城 0.6——地理套利的手感落到实处
      const market = findLocation(s.location)?.marketMult ?? 1;
      const base = rng.int(1200, 2400);
      const income = Math.max(0, Math.round(base * (0.6 + 0.15 * s.skills.business) * pricingMult(s) * (0.7 + 0.3 * proj.quality / 100) * market));
      s.cash += income;
      s.stats.orders += 1;
      s.stats.totalRevenue += income;
      s.flags.monthRevenueAcc = num(s.flags.monthRevenueAcc) + income;
      s.flags.weekCashDelta = num(s.flags.weekCashDelta) + income;
      s.flags.weekDeliveries = num(s.flags.weekDeliveries) + 1;
      s.flags.deliveredToday = true;
      const dim = def.skill ?? 'craft';
      s.deliveries[dim] += 1;
      checkSkillUp(s, dim);
      floats.push({ text: `+¥${income}`, cls: 'gold' });
      return { msg: `交付完成，入账 ¥${income}`, floats };
    }
    case 'makeCourse': {
      if (!proj) return { fail: '需要项目' };
      if (proj.type !== 'course') return { fail: '课程需立项「录播课程」类型项目' };
      return { msg: `课程进度 ${Math.round(proj.progress)}%` };
    }
    case 'polishQuality': {
      if (!proj) return { fail: '需要项目' };
      return { msg: `质量 ${Math.round(proj.quality)}，维护欠账 ${Math.round(proj.maintenance)}` };
    }
    case 'setPrice': {
      const tier = def.id === 'negotiatePriceLow' ? 1 : def.id === 'negotiatePriceHigh' ? 3 : 2;
      s.flags.pricing = tier;
      return { msg: `定价策略：${tier === 1 ? '亲民（×0.8）' : tier === 3 ? '高端（×1.35）' : '标准（×1.0）'}` };
    }
    case 'bookkeeping':
      s.flags.selfBookkeeping = true;
      return { msg: '自记账开启：每月省下代账费 ¥300' };
    case 'payTax':
      s.flags.taxCurrent = true;
      s.compliance = clamp100(s.compliance + 3);
      s.creditScore = Math.min(1000, s.creditScore + 2);
      return { msg: '按期报税：信用+2、合规+3' };
    case 'registerEntity': {
      if (def.id === 'registerSole') {
        if (s.entity === 'opc') return { fail: '已是一人有限公司，无需回退' };
        s.entity = 'sole';
        return { msg: '个体户注册完成：核定征收 3%，灰色接单成为历史' };
      }
      if (s.entity === 'opc') return { fail: '已注册一人有限公司' };
      s.entity = 'opc';
      return { msg: '一人有限公司设立：小微税率 5%，有限责任护体' };
    }
    case 'trademark':
      s.flags.trademark = true;
      return { msg: '商标申请受理（41/9/42 类）' };
    case 'icpFiling':
      s.flags.icp = true;
      return { msg: 'ICP 备案通过：网站类项目前置解锁' };
    case 'outsource': {
      if (!proj) return { fail: '需要项目' };
      if (s.skills.operation < 2 && rng.chance(0.25)) {
        proj.quality = clamp100(proj.quality - 5);
        return { msg: '外包质量翻车：质量-5（运营能力不足时方差大）', floats: [{ text: '质量-5', cls: 'bad' }] };
      }
      return { msg: `外包交付：进度 ${Math.round(proj.progress)}%` };
    }
    case 'writeSop':
      return { msg: 'SOP 归档：自动化程度提升' };
    case 'automationBuild':
      return { msg: `自动化建设：autoLevel ${Math.round(s.autoLevel)}` };
    case 'bizCoop':
      return { msg: '合作意向达成' };
    case 'exercise':
      return { msg: '练完了，汗是免费的' };
    case 'meditate':
      return { msg: '呼吸落定，System1 退潮' };
    case 'deepRest':
      s.flags.deepRestedToday = true;
      return { msg: '彻底离线半天：隐性疲劳-15' };
    case 'socialize': {
      let target = s.contacts[0];
      for (const c of s.contacts) if (target && c.relation > target.relation) target = c;
      if (target) {
        target.relation = clamp100(target.relation + 6);
        target.lastTouch = s.meta.day;
        return { msg: `${target.name}关系+6` };
      }
      addContact(s, 'peer');
      return { msg: '认识了一位新朋友' };
    }
    case 'travel':
      s.flags.travelBuffUntil = s.meta.day + 14;
      return { msg: '换环境 14 天：创作 buff 生效' };
    case 'medical': {
      if (def.id === 'healthCheckup') {
        s.flags.fatigueKnown = true;
        return { msg: `体检完成：隐性疲劳精确读数 ${Math.round(s.health.hiddenFatigue)}/100 已解锁` };
      }
      return { msg: '看完医生：遵医嘱休息' };
    }
    default:
      return { msg: def.name + '完成' };
  }
}

// ---------- 执行入口 ----------

const STAGE_NAMES: Record<number, string> = { 1: 'v0.1 萌芽', 2: 'v0.2 求生', 3: 'v0.5 立定', 4: 'v1.0 成长', 5: 'v2.0 自由', 6: 'v3.0 传承' };

/** 行动执行（§5.4 顺序）。硬撑路径：AP 不足仍执行非恢复行动 → 隐性疲劳+6；energy≤5 → burnoutCount+1 */
export function executeAction(
  s: StateSlice,
  a: { t: 'act'; id: string; projectId?: string; platformId?: string },
  rng: Rng
): ActionResult {
  if (s.meta.over) return { ok: false, msg: '生涯已结束' };
  const def = findAction(a.id);
  if (!def) return { ok: false, msg: `未知行动：${a.id}` };

  // --- cond 检查 ---
  if (def.minStage && s.meta.stage < def.minStage) {
    return { ok: false, msg: `阶段不足：需 ${STAGE_NAMES[def.minStage] ?? def.minStage}（当前 ${STAGE_NAMES[s.meta.stage] ?? s.meta.stage}）` };
  }
  if (s.dayType === 'minimum' && def.cat !== 'self') {
    return { ok: false, msg: '最低日：只做恢复类行动（身心在充电）' };
  }
  const proj = targetProject(s, a.projectId);
  if (def.needsProject && !proj) return { ok: false, msg: '需要先立项一个项目' };
  const nonRecovery = def.cat !== 'self';
  if (s.energy <= 0 && nonRecovery) return { ok: false, msg: '精力见底：请选最低日或恢复类行动' };
  const cost = Math.round((def.cash ?? 0) * (s.flags.spendthrift === true ? 1.1 : 1));
  if (cost > 0 && s.cash < cost) return { ok: false, msg: `现金不足（需 ¥${cost}）` };
  const apShort = s.ap < def.ap;
  if (apShort && !nonRecovery) return { ok: false, msg: 'AP 不足：恢复类行动不硬撑' };
  // special 前置校验（在扣费之前拒绝）
  if (def.special === 'consult' && !s.contacts.some(c => c.type === 'mentor' && c.relation >= 30)) {
    return { ok: false, msg: '没有关系≥30 的导师人脉' };
  }
  if (def.special === 'makeCourse' && proj && proj.type !== 'course') {
    return { ok: false, msg: '课程需立项「录播课程」类型项目' };
  }
  if (def.special === 'deliver' && proj && stageIdx(proj.stage) < 2 && s.flags.ordersChannel !== true) {
    return { ok: false, msg: '项目需进入开发后阶段（或先建立订单渠道）' };
  }
  if (def.special === 'registerEntity' && def.id === 'registerOPC' && s.entity === 'opc') {
    return { ok: false, msg: '已注册一人有限公司' };
  }

  // --- 硬撑判定（先于扣费：energy≤5 仍执行非恢复行动） ---
  const hardEnergy = s.energy <= 5 && nonRecovery;

  // --- 扣费 ---
  s.cash -= cost;
  s.flags.weekCashDelta = num(s.flags.weekCashDelta) - cost;
  s.energy = clamp100(s.energy - def.energy);
  s.ap = Math.max(0, s.ap - def.ap);

  // --- 硬撑记账 ---
  if (apShort && nonRecovery) {
    s.health.hiddenFatigue = clamp100(s.health.hiddenFatigue + 6);
    s.flags.hardPressedToday = true;
    s.flags.weekHardPress = num(s.flags.weekHardPress) + 1;
    pushLog(s, '硬撑：AP 已经见底还在干，隐性疲劳+6', 'bad');
  }
  if (hardEnergy) {
    s.burnoutCount += 1;
    pushLog(s, `精力见底仍在硬撑（过劳计数 ${s.burnoutCount}/3）——身体在替你记账`, 'bad');
  }

  // --- 乘子链 ---
  let mult = 1;
  if (s.decisionMode !== 'system2') mult *= 0.75; // S1 效果衰减
  mult *= healthMult(s);
  if (s.focus) mult *= s.focus === def.domain ? 1.15 : 0.9; // 周焦点
  mult *= patchMult(s, def.domain); // OS 补丁（内化生效）
  if (s.flags.socialite === true && (def.special === 'socialize' || def.special === 'community')) mult *= 1.2;
  if (s.flags.phobia === true && (def.special === 'socialize' || def.special === 'community')) mult *= 0.8;
  if (s.flags.perfectionist === true && def.special === 'polishQuality') mult *= 1.3;
  const loc = findLocation(s.location);
  if (def.cat === 'output' && loc) mult *= 1 + loc.creative * 0.02; // 地点创作加成
  if (def.cat === 'output' && num(s.flags.travelBuffUntil) >= s.meta.day && num(s.flags.travelBuffUntil) > 0) mult *= 1.1;

  // --- effects 落账 ---
  applyEffects(s, def.effects, { projectId: proj?.id, rng, mult });

  // --- special 分支 ---
  const res = runSpecial(s, def, proj, rng, mult, a.platformId);
  if (res.fail !== undefined) {
    clampAll(s);
    return { ok: false, msg: res.fail };
  }

  // --- 日记账 ---
  s.flags.actsToday = num(s.flags.actsToday) + 1;
  if (def.cat === 'self') s.flags.actsSelf = num(s.flags.actsSelf) + 1;
  if (def.cat === 'output') s.flags.lastOutputDay = s.meta.day; // 输入绑定输出的周判定依据
  s.flags.weekActs = num(s.flags.weekActs) + 1;

  // --- 过劳终局 ---
  if (s.burnoutCount >= 3 && !s.meta.over) {
    s.meta.over = true;
    s.meta.endingKey = 'burnoutDown';
    if (!s.stats.endingsSeen.includes('burnoutDown')) s.stats.endingsSeen.push('burnoutDown');
    pushLog(s, '第 3 次硬撑后，身体替你踩下了最后一次刹车——过劳倒下。', 'bad');
    clampAll(s);
    return { ok: false, msg: '过劳倒下：被动终局', floatTexts: [{ text: '过劳倒下', cls: 'bad' }] };
  }

  const msg = res.msg ?? `${def.name}完成`;
  pushLog(s, `${def.name}：${msg}`, def.cat === 'self' ? 'good' : 'sys');
  clampAll(s);
  return { ok: true, msg, floatTexts: res.floats ?? [{ text: def.name, cls: 'sys' }] };
}

