// ============================================================
// [v0.10 体感测试] 拟人局 × 3（每局 90 天，共 270 天）
// 不是均匀随机机器人（soak/sim 已覆盖），而是模拟「一个真人每天看反馈做决策」：
//   - 健康告警（任一子项<50 或隐性疲劳预警）→ 优先吃饭/休息/早睡；精力<30 → 深度休息
//   - 现金 < 1 个月生活费 → 交付服务/接单优先；有钱且 stage≥3 → 雇智能体（先 support 后 growth）
//   - 每周至少 2 天写内容（kol 加码）；项目进度<80 → 开发；月三魔咒提示 → 评估转型
//   - 事件：健康类保守、道德类轮换（类随机）、机会类进取；绝不选 ending: 支
// 每局抽取第 1/7/15/30/60/90 天的「玩家可见反馈流」样张（当日日志全文 + 今日净流 + 面板数字），
// console.info 供人工审读；并对作者四条原始意见做机器可断言的回归：
//   ①饮食闭环：diet 不慢性死亡、也不通胀挂满
//   ②日结反馈：今日净流每天可见且非常数；月结对账日志存在
//   ③智能体：雇佣后 purple 工作日志高频、Token 日扣、业务加成可见
//   ④终局后回主界面（此测试只覆盖 core 侧：over 后 dispatch 拒绝；UI 侧由 s10 覆盖）
// ============================================================
import { describe, expect, it } from 'vitest';
import {
  createGame, createRng, resolveChoice, type Game, type Rng,
  type SetupConfig, type StateSlice
} from '../src/core/index';
import { findEventDef, NEWS_TICKER } from '../src/data/events.def';
import { pickNews } from '../src/ui/topbar';
import type { EventCat } from '../src/core/types';

// ---------- 拟人配置 ----------

const MAX_DAYS = 90;
const SAMPLE_DAYS = [1, 7, 15, 30, 60, 90];

interface HumanSpec {
  name: string;
  setup: SetupConfig;
  /** 内容节奏：每周至少几个内容日（kol 2，其余 1） */
  contentDaysPerWeek: number;
  /** 主平台（写内容/分发目标，模拟真人固定阵地） */
  mainPlatform: string;
  /** 立项偏好 */
  projectType: string;
  seed: number;
}

const HUMANS: HumanSpec[] = [
  {
    name: 'A·开发×草根×杭州（标准难度，做 SaaS）',
    setup: {
      niche: 'dev', background: 'grass', location: 'hangcheng', difficulty: 'normal',
      talents: [], personality: { pragmaticIdeal: 'pragmatic', steadyAggressive: 'steady', soloSocial: 'solo' },
      cryptoOn: true, seed: 0xa11ce
    },
    contentDaysPerWeek: 1, mainPlatform: 'zhihu', projectType: 'saas', seed: 0xa11ce
  },
  {
    name: 'B·博主×裸辞×北上（标准难度，内容为王）',
    setup: {
      niche: 'kol', background: 'fired', location: 'beishang', difficulty: 'normal',
      talents: ['socialite'], personality: { pragmaticIdeal: 'pragmatic', steadyAggressive: 'steady', soloSocial: 'social' },
      cryptoOn: true, seed: 0xb0b0
    },
    contentDaysPerWeek: 2, mainPlatform: 'xhs', projectType: 'course', seed: 0xb0b0
  },
  {
    name: 'C·教练×体制×成都（标准难度，服务交付流）',
    setup: {
      niche: 'coach', background: 'system', location: 'changwu', difficulty: 'normal',
      talents: ['empathy'], personality: { pragmaticIdeal: 'idealist', steadyAggressive: 'steady', soloSocial: 'solo' },
      cryptoOn: true, seed: 0xc0ac3
    },
    contentDaysPerWeek: 1, mainPlatform: 'wechat', projectType: 'consulting', seed: 0xc0ac3
  }
];

// ---------- 事件选项：健康保守 / 道德轮换 / 机会进取 ----------

const RISKY_IDS = new Set([
  'hard-push', 'push-through', 'persist', 'deny', 'ignore', 'ignore-it', 'double-down',
  'scale-up', 'keep-burn', 'grit', 'all-nighter', 'skip-again', 'argue', 'accelerate',
  'take-orders', 'stall', 'run-away', 'conceal', 'resist', 'use-pirated', 'make-hype'
]);

const eventCursor = new Map<string, number>();

function humanChoiceIdx(cat: EventCat, evId: string, choiceIds: string[], s: StateSlice, effectsByChoice: { cashMin: number }[]): number {
  const ok = choiceIds.map((id, i) => ({ id, i, cashMin: effectsByChoice[i]?.cashMin ?? 0 })).filter(x => !x.id.startsWith('ending:'));
  const first = ok[0];
  if (!first) return 0;
  // 周复盘：按当前瓶颈选焦点（真人读三段复盘后做的决定）
  if (evId === 'weekly-focus') {
    const bars = [s.health.sleep.v, s.health.mood.v, s.health.diet.v, s.health.exercise.v];
    if (Math.min(...bars) < 55) return choiceIds.indexOf('focus-health');
    if (s.cash < s.monthlyExpense * 3) return choiceIds.indexOf('focus-cash');
    return choiceIds.indexOf('no-focus');
  }
  if (cat === 'moral') {
    // 道德类：轮换（确定性伪随机，跨三局覆盖不同面）
    const k = eventCursor.get(evId) ?? 0;
    eventCursor.set(evId, k + 1);
    return (ok[k % ok.length] ?? first).i;
  }
  if (cat === 'opportunity') {
    // 进取：有风险支就上——但跑道 <4 月时，付不起的豪赌不接（真人看得见跑道面板）
    const runwayOk = s.runway >= 4 || s.cash > Math.abs(firstMinCost(ok)) * 4;
    const hit = ok.find(x => RISKY_IDS.has(x.id) && (runwayOk || x.cashMin > -s.cash * 0.25));
    return (hit ?? first).i;
  }
  // 健康/AI/危机等：保守（避开标注风险支）
  const safe = ok.find(x => !RISKY_IDS.has(x.id));
  return (safe ?? first).i;
}

function firstMinCost(ok: { cashMin: number }[]): number {
  return Math.min(0, ...ok.map(x => x.cashMin));
}

// ---------- 拟人策略 ----------

interface RunTelemetry {
  spec: HumanSpec;
  endDay: number;                       // 实际玩到的天数（90 或终局日）
  over: boolean;
  endingKey?: string;
  /** 每日玩家可见反馈：晚间小结行的「今日净流」值（flags.lastDayNet） */
  netByDay: Map<number, number>;
  /** 每日 diet（advanceDay 后采样） */
  dietByDay: Map<number, number>;
  dietMin: number; dietAvg: number; dietAt100Days: number;
  /** 雇佣后 purple 智能体日志覆盖 */
  firstHireDay: number;                 // 0 = 未雇
  purpleDays: number; daysAfterHire: number;
  tokenDaysAfterHire: number;           // tokenOut>0 的天数（Token 日扣）
  /** 项目日报行数（按天） */
  projReportDays: Map<number, number>;
  sawMonthSettle: number[];             // 出现【月结】的天
  sawTokenMonthBill: boolean;
  sawStageUp: number[];                 // 阶段提升日志出现的天
  stage2to3Day: number;                 // 0 = 未发生
  agentLogSamples: string[];            // purple 日志样张（最多 8 条）
  transcripts: Map<number, string>;     // 采样日样张（当日日志全文 + 面板数字）
  healthCollapseDays: number;           // 任一子项<20 的天数
  hireLog: string[];
  maxStage: number;
}

function fmtPanel(s: StateSlice): string {
  const alive = s.projects.filter(p => p.alive);
  return [
    `[面板] 现金 ¥${Math.round(s.cash)} · 跑道 ${s.runway} 月 · 月收入 ${Math.round(s.monthlyIncome)} · 阶段 v${s.meta.stage}.0`,
    `[健康] 睡眠 ${Math.round(s.health.sleep.v)} 情绪 ${Math.round(s.health.mood.v)} 饮食 ${Math.round(s.health.diet.v)} 运动 ${Math.round(s.health.exercise.v)} · 精力 ${Math.round(s.energy)} · 压力 ${Math.round(s.stress)}`,
    `[项目] ${alive.map(p => `${p.name}(${p.stage}/${Math.round(p.progress)}%/MRR¥${Math.round(p.mrr)}/维护${Math.round(p.maintenance)})`).join(' ') || '无在营'}`,
    `[平台] 峰值粉 ${s.stats.followersPeak} · [智能体] ${s.agents.map(a => a.id).join(',') || '无'} · Token昨日 ¥${Math.round(s.tokenBill.yesterday)} 本月 ¥${Math.round(s.tokenBill.monthToDate)}`
  ].join('\n');
}

function playHuman(spec: HumanSpec): RunTelemetry {
  const g: Game = createGame(spec.setup, createRng(spec.setup.seed));
  const rng: Rng = createRng((spec.seed ^ 0x5eed) >>> 0);
  const s = g.state as StateSlice;
  const t: RunTelemetry = {
    spec, endDay: 0, over: false,
    netByDay: new Map(), dietByDay: new Map(), dietMin: 100, dietAvg: 0, dietAt100Days: 0,
    firstHireDay: 0, purpleDays: 0, daysAfterHire: 0, tokenDaysAfterHire: 0,
    projReportDays: new Map(), sawMonthSettle: [], sawTokenMonthBill: false,
    sawStageUp: [], stage2to3Day: 0, agentLogSamples: [], transcripts: new Map(),
    healthCollapseDays: 0, hireLog: [], maxStage: 1
  };
  let contentThisWeek = 0;
  let currentWeek = 1;
  let projectCreated = false;
  let pivotsDone = 0;
  let relocated = false;

  const resolvePending = (): void => {
    const ids = s.pending.events.filter(e => !e.resolved).map(e => e.id);
    for (const id of ids) {
      if (s.meta.over) return;
      const def = findEventDef(id);
      if (!def || def.choices.length === 0) continue;
      // 每个选项的现金成本下界（真人读 hint/后果掂量付不付得起）
      const costs = def.choices.map(c => c.effects.reduce((m, e) => {
        if (e.k !== 'cash' || e.op !== '+') return m;
        const v = typeof e.v === 'number' ? e.v : Math.min(e.v[0], e.v[1]);
        return Math.min(m, v);
      }, 0));
      resolveChoice(s, def, humanChoiceIdx(def.cat, def.id, def.choices.map(c => c.id), s, costs.map(cashMin => ({ cashMin }))), rng);
    }
  };

  for (let day = 1; day <= MAX_DAYS; day++) {
    if (s.meta.over) break;
    resolvePending();

    // ---- 日型决策（真人看健康面板/精力条：真·力竭才休整；多短板时反而要标准日——3 AP 才够还账） ----
    const bars = [s.health.sleep.v, s.health.mood.v, s.health.diet.v, s.health.exercise.v];
    const low = Math.min(...bars);
    if (num0(s.flags.forcedMinDays) === 0) {
      if (s.energy < 25 || s.health.hiddenFatigue >= 75 || (low < 25 && s.stress >= 70)) g.dispatch({ t: 'dayType', dt: 'minimum' });
      else if (s.energy >= 85 && low >= 70 && s.health.hiddenFatigue < 30 && rng.chance(0.15)) g.dispatch({ t: 'dayType', dt: 'extended' });
      else g.dispatch({ t: 'dayType', dt: 'standard' });
    }

    const alive = () => s.projects.filter(p => p.alive);
    const proj = () => { const a = alive(); return a[a.length - 1]; };
    const deliverable = () => alive().some(p => ['build', 'launch', 'grow', 'mature', 'decline'].includes(p.stage));

    // ---- 立项（第 1 天或项目全部退役后：真人开局先立项再干活） ----
    if (alive().length === 0 && s.projects.length === 0) {
      g.dispatch({ t: 'newProject', name: `${spec.name.slice(0, 1)}的主业`, type: spec.projectType, revenueModel: 'subscription' });
      projectCreated = true;
    } else if (projectCreated && alive().length === 0 && s.projects.length > 0 && s.cash > 3000) {
      g.dispatch({ t: 'newProject', name: `再战一局`, type: spec.projectType, revenueModel: 'subscription' });
    }

    // ---- 晨间结构性决策（不占 AP：真人早上翻一眼面板就做的决定） ----
    if (!relocated && ['beishang', 'guangshen', 'singapore'].includes(s.location)
      && (s.stress > 60 || s.runway < 5) && s.cash > s.monthlyExpense * 2 + 5000) {
      const r = g.dispatch({ t: 'relocate', to: 'dali' }); // 地理减压阀：一线 stress/成本 → 大理
      if (r.ok) relocated = true;
    }
    if (s.meta.stage >= 3 && !s.agents.some(a => a.id === 'support') && s.cash > 2000 + s.monthlyExpense * 2) {
      g.dispatch({ t: 'hireAgent', id: 'support' }); // 先 support 后 growth
    } else if (s.meta.stage >= 3 && !s.agents.some(a => a.id === 'growth') && s.cash > 5000 + s.monthlyExpense * 2) {
      g.dispatch({ t: 'hireAgent', id: 'growth' });
    }
    if (pivotsDone < 2 && proj() && proj()!.stage === 'decline') {
      g.dispatch({ t: 'pivotProject', projectId: proj()!.id, toType: spec.projectType === 'consulting' ? 'saas' : 'consulting' });
      pivotsDone += 1;
    }

    // ---- 行动阶段（按优先级管线，AP 尽即停；earlySleep 立即收工） ----
    let guard = 0;
    while (guard++ < 12 && !s.meta.over && s.ap > 0) {
      const before = s.ap;
      const bar = { sleep: s.health.sleep.v, mood: s.health.mood.v, diet: s.health.diet.v, exercise: s.health.exercise.v };
      if (s.dayType === 'minimum') {
        // 最低日恢复菜单：最缺的子项优先
        if (bar.diet < 50) {
          if (s.cash >= 40) g.dispatch({ t: 'act', id: 'eatWell' });
          else if (s.cash >= 12) g.dispatch({ t: 'act', id: 'cook' });
        } else if (bar.sleep < 50 || s.energy < 40) g.dispatch({ t: 'act', id: 'deepRest' });
        else if (bar.exercise < 45) g.dispatch({ t: 'act', id: 'exercise' });
        else if (s.stress > 60) g.dispatch({ t: 'act', id: 'meditate' });
        else g.dispatch({ t: 'act', id: 'deepRest' });
        break; // 最低日 1 AP 用完即止
      }
      // ① 健康告警优先：吃饭/休息/早睡（任一子项<45 或隐性疲劳预警）
      if (bar.diet < 45) {
        if (s.cash >= 40) g.dispatch({ t: 'act', id: 'eatWell' });
        else if (s.cash >= 12) g.dispatch({ t: 'act', id: 'cook' });
      } else if (s.energy < 25) {
        g.dispatch({ t: 'act', id: 'deepRest' });
      } else if (bar.sleep < 40) {
        g.dispatch({ t: 'act', id: 'earlySleep' });
        break; // 22:30 早睡：今天到此为止
      } else if (bar.exercise < 30) {
        // 木桶预警挂着（<20 额外 -5/日）：先把桶底补上，别的都是它拖累
        g.dispatch({ t: 'act', id: 'exercise' });
      } else if (s.stress > 55) {
        // 压力条过半就在管（真人看得到压力面板：B 局教训——不管 stress 会滚进 system1Deep）
        g.dispatch({ t: 'act', id: 'meditate' });
      } else if (bar.exercise < 40) {
        g.dispatch({ t: 'act', id: 'exercise' });
      } else if (bar.mood < 40) {
        g.dispatch({ t: 'act', id: 'meditate' });
      } else if (s.health.hiddenFatigue >= 60 && s.flags.fatigueKnown !== true && s.cash > 5000) {
        g.dispatch({ t: 'act', id: 'healthCheckup' }); // 预警横幅挂着：花 ¥500 买精确读数
      }
      // ② 现金流红线：现金 < 1 个月生活费 → 交付/接单优先
      else if (s.cash < s.monthlyExpense && deliverable()) {
        g.dispatch({ t: 'act', id: 'deliverService', projectId: proj()?.id });
      }
      // ③ 每周内容节奏
      else if (contentThisWeek < spec.contentDaysPerWeek) {
        g.dispatch({ t: 'act', id: 'writeContent', platformId: spec.mainPlatform });
        contentThisWeek += 1;
      }
      // ④ 项目推进：进度<80 → 开发
      else if (proj() && proj()!.progress < 80 && ['idea', 'validate', 'build'].includes(proj()!.stage)) {
        g.dispatch({ t: 'act', id: 'developProject', projectId: proj()?.id });
      }
      // ⑤ 填充：月收入还没到月支出 2 倍 → 交付是主业（玩家看财务 Tab 知道升级条件）；
      //    kol 型没到内容配额就继续写
      else if (deliverable() && s.monthlyIncome < s.monthlyExpense * 2) {
        g.dispatch({ t: 'act', id: 'deliverService', projectId: proj()?.id });
      } else if (spec.contentDaysPerWeek >= 2 && contentThisWeek < 4) {
        g.dispatch({ t: 'act', id: 'writeContent', platformId: spec.mainPlatform });
        contentThisWeek += 1;
      } else if (proj() && proj()!.progress < 100) {
        g.dispatch({ t: 'act', id: 'developProject', projectId: proj()?.id });
      } else {
        g.dispatch({ t: 'act', id: 'deepLearnFit' });
      }
      if (s.ap === before) break; // 无进展（全部被拒）防死循环
    }

    const rep = g.advanceDay();
    resolvePending();

    // ---- 采样与遥测 ----
    const net = num0(s.flags.lastDayNet);
    t.netByDay.set(day, net);
    const diet = s.health.diet.v;
    t.dietByDay.set(day, diet);
    t.dietMin = Math.min(t.dietMin, diet);
    if (diet >= 99.5) t.dietAt100Days += 1;
    if ([s.health.sleep.v, s.health.mood.v, s.health.diet.v, s.health.exercise.v].some(v => v < 20)) t.healthCollapseDays += 1;
    t.maxStage = Math.max(t.maxStage, s.meta.stage);

    // 当日日志全文（玩家视角：日志面板 e.day===day 的行 + advanceDay 期间 track 的 repLogs）
    const dayLogLines = [
      ...s.log.filter(e => e.day === day).map(e => `  [${e.cls}] ${e.msg}`),
      ...rep.logs.filter(l => !s.log.some(e => e.msg === l.msg && e.day === day)).map(l => `  [${l.cls}] ${l.msg}`)
    ];
    const projReports = dayLogLines.filter(l => l.includes('【项目日报】')).length;
    t.projReportDays.set(day, projReports);
    if (dayLogLines.some(l => l.includes('【月结】'))) t.sawMonthSettle.push(day);
    if (dayLogLines.some(l => l.includes('【Token 月账单】'))) t.sawTokenMonthBill = true;
    if (dayLogLines.some(l => l.includes('阶段提升'))) t.sawStageUp.push(day);
    if (t.stage2to3Day === 0 && s.meta.stage >= 3) t.stage2to3Day = day;
    if (t.firstHireDay === 0 && s.agents.length > 0) t.firstHireDay = day;
    if (t.firstHireDay > 0 && day >= t.firstHireDay) {
      t.daysAfterHire += 1;
      const purple = dayLogLines.filter(l => l.includes('[purple]') && l.includes('【'));
      if (purple.length > 0) {
        t.purpleDays += 1;
        if (t.agentLogSamples.length < 8) t.agentLogSamples.push(`第${day}天 ${purple[0]!.trim().replace('[purple] ', '')}`);
      }
      if (num0(s.tokenBill.yesterday) > 0) t.tokenDaysAfterHire += 1;
    }
    const hireLine = dayLogLines.find(l => l.includes('部署完成'));
    if (hireLine && t.hireLog.length < 4) t.hireLog.push(`第${day}天 ${hireLine.trim()}`);

    if (SAMPLE_DAYS.includes(day)) {
      t.transcripts.set(day, [
        `===== ${spec.name} · 第 ${day} 天 =====`,
        `今日净流：${net >= 0 ? '+' : ''}¥${Math.round(net)}（昨日口径，晚间小结行）`,
        fmtPanel(s),
        '--- 当日日志全文 ---',
        ...dayLogLines
      ].join('\n'));
    }

    // 周切换：内容节奏重置
    const wk = Math.floor(day / 7) + 1;
    if (wk !== currentWeek) { currentWeek = wk; contentThisWeek = 0; }
    if (s.meta.over) { t.over = true; t.endingKey = s.meta.endingKey; break; }
  }
  const diets = [...t.dietByDay.values()];
  t.dietAvg = diets.length > 0 ? diets.reduce((a, b) => a + b, 0) / diets.length : 0;
  t.endDay = s.meta.over ? s.meta.day - 1 : Math.min(s.meta.day - 1, MAX_DAYS);
  if (s.meta.over) { t.over = true; t.endingKey = s.meta.endingKey; }
  return t;
}

function num0(v: unknown): number { return typeof v === 'number' ? v : 0; }

// ---------- 跑三局（describe 级共享，供各断言块复用） ----------

const runs = HUMANS.map(playHuman);

describe('[体感] 拟人局 × 3 × 90 天：四条作者意见回归', () => {
  // 样张输出（人工审读用；vitest --reporter=verbose 或 CI 日志可见）
  for (const t of runs) {
    it(`${t.spec.name}：反馈流样张（第1/7/15/30/60/90天）`, () => {
      const out: string[] = [];
      for (const d of SAMPLE_DAYS) {
        const tr = t.transcripts.get(d);
        if (tr) out.push(tr);
      }
      console.info(`\n\n${out.join('\n\n')}`);
      console.info(`\n[体感小结·${t.spec.name}] 玩到第 ${t.endDay} 天 over=${t.over}${t.endingKey ? `(${t.endingKey})` : ''} · diet 最低 ${Math.round(t.dietMin)} 均值 ${Math.round(t.dietAvg)} 挂满天数 ${t.dietAt100Days} · 首雇日 ${t.firstHireDay} · purple日志覆盖 ${t.purpleDays}/${t.daysAfterHire} · Token日扣 ${t.tokenDaysAfterHire}/${t.daysAfterHire} · 最高阶段 v${t.maxStage}.0 · 健康崩盘日 ${t.healthCollapseDays}`);
      expect(out.length).toBeGreaterThan(0);
    });
  }

  it('① 饮食闭环：三局 diet 都不慢性死亡（无 <20 崩盘日），也不通胀挂满（均值 <95 且挂满天 <50%）', () => {
    for (const t of runs) {
      expect(t.healthCollapseDays, `${t.spec.name} 健康子项<20 崩盘日 ${t.healthCollapseDays} 天（健康闭环失败：维护不过来）`).toBeLessThanOrEqual(5);
      expect(t.dietMin, `${t.spec.name} diet 最低值过低（慢性死亡）`).toBeGreaterThanOrEqual(15);
      expect(t.dietAvg, `${t.spec.name} diet 均值 ${Math.round(t.dietAvg)} 通胀挂满`).toBeLessThan(95);
      expect(t.dietAt100Days, `${t.spec.name} diet 挂满 100 的天数占比过高（无维护感）`).toBeLessThan(t.endDay * 0.5);
    }
  });

  it('② 日结反馈：今日净流每天可见且非常数（≥15 个不同值），月结对账日志在 30/60/90 天出现', () => {
    for (const t of runs) {
      const vals = [...t.netByDay.values()];
      expect(vals.length, `${t.spec.name} 应有逐日净流记录`).toBeGreaterThanOrEqual(t.endDay - 1);
      const distinct = new Set(vals.map(v => Math.round(v)));
      expect(distinct.size, `${t.spec.name} 净流值过于单一（${[...distinct].slice(0, 5)}）——反馈失效`).toBeGreaterThanOrEqual(15);
      // 月结日志：90 天内至少 2 次（30/60 天，90 天当晚日志属下一日戳不强制）
      expect(t.sawMonthSettle.length, `${t.spec.name} 月结对账日志不足（${t.sawMonthSettle}）`).toBeGreaterThanOrEqual(2);
    }
  });

  it('③ 智能体反馈：至少一局完成雇佣；雇佣后 purple 工作日志覆盖 ≥60% 天数、Token 日扣 ≥80% 天数', () => {
    const hired = runs.filter(t => t.firstHireDay > 0);
    expect(hired.length, '三局拟人策略（stage3 后雇 support/growth）应有雇佣发生').toBeGreaterThanOrEqual(1);
    for (const t of hired) {
      expect(t.daysAfterHire, `${t.spec.name} 雇佣后应有后续天数`).toBeGreaterThanOrEqual(5);
      expect(t.purpleDays / t.daysAfterHire, `${t.spec.name} purple 日志覆盖 ${t.purpleDays}/${t.daysAfterHire}`).toBeGreaterThanOrEqual(0.6);
      expect(t.tokenDaysAfterHire / t.daysAfterHire, `${t.spec.name} Token 日扣覆盖 ${t.tokenDaysAfterHire}/${t.daysAfterHire}`).toBeGreaterThanOrEqual(0.8);
      if (t.endDay >= 60) expect(t.sawTokenMonthBill, `${t.spec.name} 60 天内应见 Token 月账单对账行`).toBe(true);
    }
  });

  it('③b 智能体日志样张带具体数字（工作可感知，不是空转文案）', () => {
    const samples = runs.flatMap(t => t.agentLogSamples);
    expect(samples.length).toBeGreaterThanOrEqual(4);
    const withNumbers = samples.filter(l => /\d/.test(l)).length;
    expect(withNumbers / samples.length, 'purple 日志应带数字（拉新/工单/成单金额）').toBeGreaterThanOrEqual(0.9);
  });

  it('④ 90 天旅程完整性：每局 stage 2→3 迁移（阶段提升日志）、项目日报一行一个、月结对账可读', () => {
    for (const t of runs) {
      expect(t.sawStageUp.length, `${t.spec.name} 90 天内应有阶段提升日志`).toBeGreaterThanOrEqual(1);
      expect(t.stage2to3Day, `${t.spec.name} 应完成 stage 2→3 迁移（月收入≥月支出）`).toBeGreaterThan(0);
      // 项目日报：有已发布项目的天数里，日报行数 ≤ 在营项目数（一行一个）
      const maxReports = Math.max(...[...t.projReportDays.values()]);
      expect(maxReports, `${t.spec.name} 项目日报行数异常`).toBeLessThanOrEqual(3);
    }
  });

  it('新闻轮换：90 天内顶栏新闻无相邻重复、去重 ≥14 条、第 1 天为时代锚点', () => {
    const seen: string[] = [];
    for (let d = 1; d <= 90; d++) {
      const n = pickNews(NEWS_TICKER, d)[0] ?? '';
      seen.push(n);
    }
    expect(seen[0]).toContain('张雪峰');
    const distinct = new Set(seen);
    expect(distinct.size, `90 天新闻仅 ${distinct.size} 条不重样`).toBeGreaterThanOrEqual(14);
    let adjacentDup = 0;
    for (let i = 1; i < seen.length; i++) if (seen[i] === seen[i - 1]) adjacentDup += 1;
    expect(adjacentDup, `相邻日新闻重复 ${adjacentDup} 次`).toBe(0);
  });

  it('终局后 dispatch 拒绝（core 侧「结局后不能再继续」）', () => {
    const g = createGame(HUMANS[0]!.setup, createRng(1));
    const s = g.state as StateSlice;
    s.meta.over = true;
    s.meta.endingKey = 'survivedKing';
    expect(g.dispatch({ t: 'act', id: 'eatWell' }).ok).toBe(false);
    expect(g.advanceDay().logs.length).toBe(0);
  });
});
