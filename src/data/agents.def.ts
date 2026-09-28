// 智能体矩阵（技术文档 §8.1，数字严格对齐表格；设计 §九）
// replaces = 被接管的 ActionDef.domain；风险事件 id 由 S5 events.def 落地（引擎按 id 引用入队）
import type { AgentDef } from '../core/types';

export const AGENT_DEFS: AgentDef[] = [
  {
    id: 'support', name: '客服智能体',
    deployCost: 2000, monthlyTokenBase: 300, tokenPerUnit: 0.8, // 0.8/工单 [S9] base 400→300：智能体线回本期实测过长（sim 轮 1）
    replaces: ['cash'], efficiency: 0.9, unlockStage: 3,
    riskEvents: ['ag-support-hallucination', 'ag-support-complaint'], // 幻觉承诺/投诉升级
    desc: '自动消化客服答疑与工单：项目维护欠账每日自动下降。幻觉承诺是它的原罪。'
  },
  {
    id: 'growth', name: '获客智能体',
    deployCost: 5000, monthlyTokenBase: 1000, tokenPerUnit: 2.0, // 2.0/千次触达
    replaces: ['marketing'], efficiency: 1.0, unlockStage: 3, // [S9] 0.8→1.0：日均拉新 3-10 偏弱，账单/产出比失衡（sim 首轮）
    riskEvents: ['ag-growth-riskcontrol', 'ag-growth-material'], // 批量行为风控/素材违规
    desc: '自动投放分发，每天给主平台拉新。批量行为是平台风控的最爱——banRisk 随用量累积。'
  },
  {
    id: 'content', name: '内容智能体',
    deployCost: 3000, monthlyTokenBase: 600, tokenPerUnit: 1.5, // 1.5/篇
    replaces: ['marketing'], efficiency: 0.75, unlockStage: 4,
    riskEvents: ['ag-content-aidetect', 'ag-content-homogenize'], // AI 检测限流（未声明）/同质化
    desc: '自动产出内容发到主平台。产出的内容 aiDeclared=false 起步，不补声明→检测限流×3。'
  },
  {
    id: 'sales', name: '销售智能体',
    deployCost: 4000, monthlyTokenBase: 800, tokenPerUnit: 3.0, // 3.0/百次跟进
    replaces: ['cash'], efficiency: 0.7, unlockStage: 4,
    riskEvents: ['ag-sales-violation', 'ag-sales-lost'], // 违规话术（合规-）/大单丢单
    desc: '自动跟进谈单，偶尔自动成单入账。违规话术会啃食你的合规分。'
  },
  {
    id: 'legalfin', name: '法务财务智能体',
    deployCost: 3500, monthlyTokenBase: 500, tokenPerUnit: 0, // —
    replaces: ['compliance'], efficiency: 0.85, unlockStage: 4,
    riskEvents: ['ag-legalfin-misreport'], // 误报漏报（稽查风险小额残留）
    desc: '替代记账报税与合同初审：每月自动按期报税，合规缓升。误报漏报留有小额稽查残留。'
  },
  {
    id: 'regagent', name: '注册代办智能体',
    deployCost: 1500, monthlyTokenBase: 300, tokenPerUnit: 0, // —
    replaces: ['compliance'], efficiency: 0.95, unlockStage: 4,
    riskEvents: ['ag-regagent-flaw'], // 材料瑕疵（流程返工事件）
    desc: '替代主体注册/商标/备案流程，省下 6-8 AP。材料瑕疵会有返工风险。'
  },
  {
    id: 'butler', name: '全能管家',
    deployCost: 12000, monthlyTokenBase: 2500, tokenPerUnit: 0, // 编排抽成 10% 另计
    replaces: ['skill', 'marketing', 'delivery', 'cash', 'compliance'], efficiency: 1, unlockStage: 5,
    riskEvents: [ // 风险聚合：以上全部
      'ag-support-hallucination', 'ag-support-complaint',
      'ag-growth-riskcontrol', 'ag-growth-material',
      'ag-content-aidetect', 'ag-content-homogenize',
      'ag-sales-violation', 'ag-sales-lost',
      'ag-legalfin-misreport', 'ag-regagent-flaw'
    ],
    desc: '编排以上六类：全部关键流程接管度拉满（幽灵公司通路），并对其他智能体账单抽成 10%。'
  }
];

export function findAgent(id: string): AgentDef | undefined {
  return AGENT_DEFS.find(a => a.id === id);
}
