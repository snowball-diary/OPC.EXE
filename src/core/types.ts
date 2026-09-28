// ============================================================
// OPC.exe 全项目类型契约（S1 定稿，S2-S8 依此编码，只增不改）
// 依据：技术文档.md §四/§五/§八/§九/§十一；设计方案.md §二/§四/§十三
// 纪律：禁 any；数值条目除 cash/debt/mrr/users 外均按 0-100 钳制
// ============================================================

// ---------- 基础枚举 ----------

export type Stage = 1 | 2 | 3 | 4 | 5 | 6;
export type SkillDim = 'craft' | 'expression' | 'marketing' | 'operation' | 'business'; // 造物/表达/营销/运营/商业
export type SkillLevel = 0 | 1 | 2 | 3 | 4;
export type EconomyPhase = 'boom' | 'overheat' | 'recession' | 'recovery';
export type DayType = 'minimum' | 'standard' | 'extended'; // 最低日/标准日/扩展日
export type DecisionMode = 'system2' | 'system1' | 'system1Deep';

export type LocationId = string;
export type PlatformId = string;
export type AgentId = 'support' | 'growth' | 'content' | 'sales' | 'legalfin' | 'regagent' | 'butler';
export type NicheId = string;
export type BackgroundId = string;
export type DifficultyId = string;
export type TalentId = string;
export type PersonalityId = string;
export type ProjectTypeId = string;
export type EntityForm = 'none' | 'sole' | 'opc'; // 无主体/个体户/一人有限公司

// ---------- 基础部件 ----------

/** 0-100 子条目 + 每日自然漂移（负值=衰退，行动补正） */
export interface SubBar {
  v: number;
  drift: number;
}

/** 健康四子项 + 隐性疲劳（hiddenFatigue 不可见，0-100） */
export interface HealthState {
  sleep: SubBar;
  mood: SubBar;
  diet: SubBar;
  exercise: SubBar;
  hiddenFatigue: number;
}

export interface LogEntry {
  day: number;
  msg: string;
  cls: 'sys' | 'good' | 'bad' | 'gold' | 'purple' | 'pink';
}

export interface Contact {
  id: string;
  name: string;
  type: 'peer' | 'client' | 'mentor' | 'vendor' | 'investor';
  relation: number; // 0-100
  lastTouch: number; // 最近互动日
}

export type AssetKind =
  | 'work' | 'code' | 'template' | 'course' | 'copyright'
  | 'clientList' | 'brand' | 'equipment' | 'other';

export interface AssetItem {
  id: string;
  name: string;
  kind: AssetKind;
  value: number;
  day: number; // 获得日
}

/** 结局报告用累计量（宁多勿少，缺的字段 S8 结局系统再增） */
export interface LifeStats {
  totalRevenue: number;
  totalExpense: number;
  taxesPaid: number;
  tokenSpent: number;
  orders: number;
  contentPublished: number;
  projectsDone: number;
  projectsFailed: number;
  pivots: number;
  daysWorkedOut: number; // 扩展日天数
  minDays: number; // 最低日天数
  s1Days: number; // System1 天数
  healthBadDays: number; // 任一健康子项 <20 的天数
  maxCash: number;
  maxRunway: number;
  grayDeals: number; // 灰产交易次数
  audits: number; // 被稽查次数
  accidents: number; // 智能体事故次数
  contactsMade: number;
  followersPeak: number;
  bigHits: number; // 大爆次数
  eventsSeen: number;
  patchesInstalled: number;
  agentsHired: number;
  endingsSeen: string[];
}

// ---------- 项目 ----------

export type ProjectStage = 'idea' | 'validate' | 'build' | 'launch' | 'grow' | 'mature' | 'decline';
export type RevenueModelId =
  | 'buyout' | 'subscription' | 'usage' | 'ads'
  | 'commission' | 'service' | 'tip' | 'license';

export interface Project {
  id: string;
  name: string;
  type: ProjectTypeId;
  revenueModel: RevenueModelId;
  stage: ProjectStage;
  progress: number; // 0-100
  quality: number; // 0-100
  pmfTrue: number; // 真实潜力，对玩家不可见（立项时幂律抽取）
  pmfEstimate: { v: number; noise: number }; // 认知越高 noise 越小
  risk: number; // 0-100
  maintenance: number; // 维护欠账 0-100
  users: number;
  mrr: number;
  ageMonths: number;
  version: number;
  alive: boolean;
  decayRate: number; // 每月自然衰减
  gray?: boolean; // 灰产项目（中转站等）：compliance 月度-3、稽查×2、grayHistory 永久记录
  lastMonthMrr?: number; // [S2+] 上月 MRR（decline 检测：连续 2 月增长<2%）
  stalledMonths?: number; // [S2+] 连续低增长月数
}

export interface ProjectType {
  id: ProjectTypeId;
  name: string;
  devCost: number;
  baseCost: number; // 月维护基线
  price: [number, number]; // 客单价区间
  potentialClass: 'ai' | 'svc' | 'content' | 'edu' | 'ecom' | 'autoSrv' | 'gray';
  passiveShare: number; // 0-1 被动收入占比
  cogsToken: number; // 每单 Token 成本（autoSrv/gray 类 >0）
  gray?: boolean;
  desc?: string;
}

// ---------- 智能体与 Token（技术文档 §8.1） ----------

export interface AgentDef {
  id: AgentId;
  name: string;
  deployCost: number;
  monthlyTokenBase: number; // 月基础 Token 费
  tokenPerUnit: number; // 每单位业务量追加
  replaces: string[]; // 替代的行动域（对应 ActionDef.domain）
  efficiency: number; // 替代行动效果倍率（0-1）
  riskEvents: string[]; // 关联风险事件 id
  unlockStage: Stage; // 雇佣解锁阶段
  desc?: string;
}

export interface AgentInstance {
  id: AgentId;
  hiredDay: number;
  usageScale: number; // 用量规模（业务量系数）
  trust: number; // 0-100；<40 效率减半
}

// ---------- 平台 ----------

export interface PlatformAccount {
  state: 'observe' | 'normal' | 'throttled' | 'banned';
  observeDaysLeft: number;
  followers: number;
  aiDeclared: boolean;
  banRisk: number; // 0-100
  incomeShare: number; // 0-1，该平台收入占比（>0.6 触发依赖警戒）
}

// ---------- OS 补丁（四层） ----------

export type OSRuleLayer = 'principle' | 'rule' | 'env' | 'feedback';

export interface OSRuleDef {
  id: string;
  name: string;
  layer: OSRuleLayer;
  desc: string;
  installCost: { ap: number; energy: number; cash?: number };
  upkeep: number; // 月维护成本（cash）
  effectFlags?: string[]; // [S2+] 行为记账 flag（当日执行判定 → streak 内化）
  effects?: Effect[];
}

export interface OSRuleState {
  id: string;
  layer: OSRuleLayer;
  installedDay?: number;
  internalized: boolean; // 连续 7 天执行 → true
  streak: number; // 连续执行天数
}

// ---------- 效果（Effect）与条件（Cond）DSL ----------

export type Range = [number, number];

/**
 * EffectKey ≈40+：标量键 + 模板字面量键（skillExp/skillLevel/deliveries/followers）。
 * project* 类效果作用于 Action.projectId 指定（或缺省为最新活跃）项目。
 */
export type EffectKey =
  | 'cash' | 'debt' | 'energy' | 'ap' | 'stress' | 'hiddenFatigue' | 'burnoutCount'
  | 'mood' | 'sleep' | 'diet' | 'exercise' | 'healthWhole'
  | 'info' | 'cognition' | 'character'
  | `skillExp.${SkillDim}`
  | `skillLevel.${SkillDim}`
  | `deliveries.${SkillDim}`
  | `followers.${PlatformId}`
  | 'rep' | 'influence' | 'power' | 'compliance' | 'creditScore' | 'morality'
  | 'projectProgress' | 'projectQuality' | 'projectPmfTrue' | 'projectPmfNoise'
  | 'projectUsers' | 'projectMrr' | 'projectMaintenance'
  | 'autoLevel' | 'tokenBill' | 'contacts' | 'attentionCap'
  | 'assetAdd'
  // [S5+] 事件层增量键（engine owner 注意：applyEffects 目前走 default 静默忽略，需各补一行 case，规格见 S5 验收报告）
  | 'tokenPriceIndex' // Token 价格指数落点 = tokenBill.priceIndex：op '=' 直接写绝对值（0.6 降价 / 1.0 基线 / 1.5 涨价 / 2.0 限流溢价）
  | `flag.${string}`; // flag 记账：k = 'flag.<名称>'；op '=' 时 v=1→true、v=0→false、其余数值原样存（如 flag.privateDomain=0.5）；op '+' 一律置 true

export interface Effect {
  k: EffectKey;
  op: '+' | '=' | '*';
  v: number | Range; // Range：引擎在该区间内经 RNG 抽值
}

/** 触发谓词（结构化 tuple，禁 eval；技术文档 §9.1） */
export type Cond =
  | ['stage', '>=', Stage]
  | ['cash', '<', number]
  | ['flag', string] // flag 存在且为真值
  | ['flag', '==', string, number | boolean]
  | ['stress', '>=', number]
  | ['energy', '<=', number]
  | ['platform', PlatformId, 'banRisk>=', number]
  | ['agent', AgentId]
  | ['project', 'mrr<', number] // 任一存活项目 mrr < n
  | ['projectCount', '>=', number]
  | ['gray', boolean] // grayHistory 是否存在
  | ['and', Cond[]]
  | ['or', Cond[]]
  | ['not', Cond]
  | ['random', '<', number]
  | ['day', '>=', number]
  | ['monthPhase', EconomyPhase];

// ---------- 事件（技术文档 §九） ----------

export type EventCat =
  | 'opportunity' | 'crisis' | 'platform' | 'finance'
  | 'social' | 'health' | 'moral' | 'ai';

export interface ChainSeed {
  event: string; // 目标事件 id
  delayDays: number;
  ifCond?: Cond[];
}

/** 入队待处理事件（弹窗队列用） */
export interface PendingEvent {
  id: string;
  day: number; // 入队日
  source: 'sample' | 'chain' | 'forced';
  resolved: boolean;
}

export interface ChoiceDef {
  id: string;
  label: string;
  hint?: string;
  requires?: 'system2'; // System1 下隐藏
  s1Variant?: string; // System1 下替换文案（或替换为该 choiceId）
  effects: Effect[];
  results: string; // 结果文案
  chain?: ChainSeed[];
}

export interface EventDef {
  id: string;
  title: string;
  body: string;
  cat: EventCat;
  when: Cond[];
  weight: number;
  once?: boolean;
  cooldownDays?: number;
  choices: ChoiceDef[];
  chain?: ChainSeed[];
  oldZhang?: string; // 老张台词槽（≤40字，克制）
  newsDay?: number; // 作为新闻播报的固定日（NEWS_TICKER 联动）
}

// ---------- 行动 ----------

export type ActionCat = 'input' | 'output' | 'biz' | 'self';

/** 特殊结算逻辑：引擎 switch 分发；普通数值效果走 effects */
export type ActionSpecial =
  | 'learn' | 'market' | 'deliver' | 'developProject' | 'validateProject'
  | 'publishContent' | 'userInterview' | 'polishQuality' | 'makeCourse'
  | 'research' | 'consult' | 'community'
  | 'taxEvade' | 'registerEntity' | 'trademark' | 'icpFiling'
  | 'outsource' | 'writeSop' | 'automationBuild' | 'bizCoop'
  | 'exercise' | 'meditate' | 'deepRest' | 'socialize' | 'travel' | 'medical'
  | 'setPrice' | 'bookkeeping' | 'payTax'; // [S2+] 三档定价 / 自记账 / 报税

export interface ActionDef {
  id: string;
  name: string;
  desc: string;
  cat: ActionCat;
  ap: number;
  energy: number;
  cash?: number;
  minStage?: Stage;
  needsProject?: boolean;
  cond?: Cond[];
  special?: ActionSpecial;
  domain?: string; // 行动域：AgentDef.replaces 按此接管
  skill?: SkillDim; // 学习/交付对应的技能维
  tier?: 'easy' | 'fit' | 'hard'; // learn 类 i+1 三档
  effects: Effect[];
}

// ---------- 状态切片 ----------

export interface StateSlice {
  meta: {
    day: number;
    week: number;
    month: number;
    year: number;
    stage: Stage;
    over: boolean;
    endingKey?: string;
    seedState: RngState;
    schemaVersion: number;
    difficulty: DifficultyId; // [S2+] 难度 id（livingCost 需要难度系数）
  };
  // 本体五元
  health: HealthState;
  info: number;
  cognition: number;
  character: number;
  skills: Record<SkillDim, SkillLevel>;
  skillExp: Record<SkillDim, number>;
  deliveries: Record<SkillDim, number>; // L3 需 3 次 / L4 需 6 次真实交付
  // 衍生四元
  assets: AssetItem[];
  contacts: Contact[];
  power: number;
  influence: number;
  rep: number; // [S2+] 口碑/品牌 0-100（EffectKey 'rep' 的落点；§5.7 影响力合成用）
  // 资源层
  cash: number; // 允许负（负债另记 debt）
  energy: number; // 0-100
  ap: number;
  attentionCap: number;
  stress: number;
  morality: number;
  compliance: number;
  creditScore: number; // 0-1000，开局 600
  // 世界
  location: LocationId;
  economyPhase: EconomyPhase;
  entity: EntityForm;
  platforms: Record<PlatformId, PlatformAccount>;
  projects: Project[];
  agents: AgentInstance[];
  autoLevel: number; // 0-100，≥85 幽灵公司
  osRules: OSRuleState[];
  tokenBill: { lastMonth: number; priceIndex: number };
  portfolio: { cash: number; fund: number; bond: number; indexFund: number; stock: number; crypto: number; realEstate: number };
  debt: number;
  runway: number; // 月
  monthlyIncome: number;
  monthlyExpense: number;
  // 决策与三线
  decisionMode: DecisionMode;
  dayType: DayType;
  burnoutCount: number; // ==3 → 被动终局
  hardStreakDays: number; // 连续硬撑天数（猝死概率累积）
  suddenDeathRisk: number; // 当前概率，对玩家公开显示（§7.3）
  focus: string | null; // 本周主焦点 actionId（+15%，其余 -10%）
  // 轨迹
  log: LogEntry[];
  stats: LifeStats;
  pending: { events: PendingEvent[]; chains: ChainSeed[]; kpQueue: string[] };
  newsSeen: number;
  flags: Record<string, boolean | number>; // 含 grayHistory/cryptoOn 等
}

// ---------- 开局七维（设计方案 §十三） ----------

export interface SetupConfig {
  niche: NicheId;
  background: BackgroundId;
  location: LocationId;
  difficulty: DifficultyId;
  talents: TalentId[];
  personality: Record<'pragmaticIdeal' | 'steadyAggressive' | 'soloSocial', PersonalityId>;
  cryptoOn: boolean; // 默认 true（09-28 裁决）
  seed: number;
}

export interface NicheDef {
  id: NicheId;
  name: string;
  icon: string; // 1-2 个文字字符（像素风禁 emoji/外部图）
  desc: string;
  bonusText: string; // 开局加成的玩家可读描述
  flags: string[];
  startSkills?: Partial<Record<SkillDim, SkillLevel>>;
  effects: Effect[];
}

export interface BackgroundDef {
  id: BackgroundId;
  name: string;
  icon: string;
  desc: string;
  baseCash: number; // 初始现金基数（×难度 cashMult）
  skills: Partial<Record<SkillDim, SkillLevel>>;
  flags: string[];
  hiddenText: string; // 隐藏资源文案
  effects: Effect[];
}

export interface LocationDef {
  id: LocationId;
  name: string;
  icon: string;
  tier: string; // 一线/新一线/二线/小城/旅居/海外/游牧
  desc: string;
  costMult: number; // 生活费系数（月生活费 = 1000 × costMult × 难度系数）
  taxNote: string;
  marketMult: number; // 市场规模/订单系数
  timezone: string;
  creative: number; // 创作类行动加成（-10~+10）
  stress: number; // 每日压力修正（-10~+10）
  eventFlags: string[]; // 专署事件 flag
}

export interface DifficultyDef {
  id: DifficultyId;
  name: string;
  icon: string;
  desc: string;
  cashMult: number; // 初始现金倍率
  livingCostMult: number; // 生活费系数
  eventFriendliness: number; // 事件友好度（>1 更温和，乘在负面事件权重）
  eventFrequency: number; // 事件频率（乘在每日抽样概率）
  custom?: boolean; // custom 预留位
}

/** 特质：cost 负数=消耗点数（增益），正数=返还点数（负担）；预算 3 点 */
export interface TalentDef {
  id: TalentId;
  name: string;
  icon: string;
  cost: number;
  desc: string;
  flags: string[];
  effects: Effect[];
}

export type PersonalityAxisId = 'pragmaticIdeal' | 'steadyAggressive' | 'soloSocial';

/** 性格轴端点（每轴 2 端选 1，效果落 flags） */
export interface PersonalityDef {
  id: PersonalityId;
  axis: PersonalityAxisId;
  name: string;
  icon: string;
  desc: string;
  flags: string[];
  effects: Effect[];
}

// ---------- 结算与操作 ----------

export interface DayReport {
  day: number;
  logs: LogEntry[];
  events: PendingEvent[];
  news: string[];
  deathCheck?: { died: boolean; cause?: 'suddenDeath' | 'burnout' };
  endingKey?: string;
}

export interface ActionResult {
  ok: boolean;
  msg?: string;
  floatTexts?: { text: string; cls: string }[];
}

/** 全部玩家操作（ui 只 dispatch，core 唯一写者） */
export type Action =
  | { t: 'act'; id: string; projectId?: string; platformId?: PlatformId } // [S8] platformId：内容营销选主平台（writeContent 官方管线发布到该平台）
  | { t: 'invest'; kind: 'save' | 'fund' | 'bond' | 'indexFund' | 'stock' | 'crypto' | 'realEstate' | 'insurance' | 'repay' | 'funding'; amount: number }
  | { t: 'patch'; id: string }
  | { t: 'relocate'; to: LocationId }
  | { t: 'hireAgent'; id: AgentId }
  | { t: 'fireAgent'; id: AgentId }
  | { t: 'focus'; id: string }
  | { t: 'dayType'; dt: DayType }
  | { t: 'newProject'; name: string; type: ProjectTypeId; revenueModel: RevenueModelId }
  | { t: 'pivotProject'; projectId: string; toType: ProjectTypeId }
  | { t: 'retireProject'; projectId: string }
  | { t: 'declareAI'; platform: PlatformId }
  | { t: 'setCrypto'; on: boolean };

// ---------- 存档与随机（技术文档 §十一） ----------

/** RngState：mulberry32 内部状态（可序列化） */
export interface RngState {
  s: number;
}

export type SerializedState = string; // StateSlice 的 JSON 串

export interface SaveGame {
  schemaVersion: number; // 当前 =1
  createdAt: number;
  game: SerializedState;
  checksum: number; // FNV-1a(game)
}

// ---------- [S2+] 引擎结果类型（纯增量，不破坏既有契约） ----------

/** 周复盘瓶颈候选（§6.2：健康/现金流/获客/交付/技能/合规） */
export type BottleneckKey = 'health' | 'cash' | 'marketing' | 'delivery' | 'skill' | 'compliance';

/** 恢复状态机相位（§7.1：运行→波动→中断→最低日→稳定化→运行） */
export type RecoveryPhase = 'run' | 'wobble' | 'interrupted' | 'stabilized';

/** 双强预警（§7.3：顶栏黑底红字） */
export interface FatigueWarning {
  level: 1 | 2;
  text: string;
}

export interface BottleneckScore {
  key: BottleneckKey;
  label: string;
  score: number;
}

/** 三段复盘生成器输出（§6.2） */
export interface WeeklyReviewResult {
  facts: string[];
  hypotheses: string[];
  suggestion: string;
  candidates: BottleneckScore[];
}

/** 月结算报告（§6.3） */
export interface MonthReport {
  day: number;
  incomeProject: number;
  incomeService: number;
  incomeInvest: number;
  expenseLiving: number;
  expenseSubs: number;
  expenseUpkeep: number;
  expenseToken: number;
  expenseProject: number;
  tax: number;
  profit: number;
  phaseBefore: EconomyPhase;
  phaseAfter: EconomyPhase;
  moonThree: string[];
}

/** 结局定义（17 结局全量，endings.def.ts 数据用） */
export interface EndingDef {
  key: string;
  name: string;
  type: 'active' | 'passive' | 'hidden';
  desc: string;
  check?: (s: StateSlice) => boolean; // 被动轮询谓词
  text: string | ((s: StateSlice) => string);
  color: LogEntry['cls'];
}

/** 五维人生报告（§十二：猝死时身心=0 且标缺） */
export interface LifeReport {
  dims: { finance: number; career: number; relations: number; bodymind: number; meaning: number };
  bodymindMissing: boolean;
  verdict: string;
  overall: number;
  endingKey?: string;
}

// ---------- [S3+] 平台定义 / 单位经济面板 / 选项结算结果（纯增量，不破坏既有契约） ----------

/** 平台定义（data/platforms.def.ts 用；设计方案 §七 政策表） */
export interface PlatformDef {
  id: PlatformId;
  name: string;
  flowMult: number; // 流量系数（§5.7 单条内容流量乘子）
  flowVar?: number; // 流量方差（douyin 头部效应 >1；默认 1）
  delayHours: number; // 一鱼八吃分发延迟：0/24/72 → 当日/次日/三日三批
  banRiskBase: number; // 政策风险系数（xhs=1.6 最危险；site=0 封不了号）
  monetize: string[]; // 变现方式标签
  mRate: number; // 日变现系数（元/粉/日，×经济相位乘子；observe 期不变现）
  note: string;
}

/** 单位经济面板（§8.2，UI S7 常驻显示） */
export interface UnitEconomicsPanel {
  projectType: ProjectTypeId;
  price: number; // 客单价（类型价格区间中点）
  cogsToken: number; // 每单 Token 成本（×priceIndex）
  priceIndex: number;
  feeRate: number; // 平台费率（独立站 0，其余 0.05）
  grossMargin: number; // 毛利率 =(price−cogs×pi−fee×price)/price，可为负（越自动化越亏）
  usageScale: number;
  trustCapacity: number; // trust 承载 = max(1, trust/20)
  overTrustCapacity: boolean; // 超承载 → 项目 quality 月-5
  scaleCapNote: string;
}

/** 事件选项结算结果（UI S7 弹窗展示） */
export interface ChoiceResult {
  ok: boolean;
  msg: string; // results 文案
  ending?: string; // choice.id 以 'ending:' 开头 → 直接终局（如收购接受）
  eventId: string;
}
