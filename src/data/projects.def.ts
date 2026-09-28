// 项目类型表：10 基础类型 + 4 个 autoSrv 组内建 = 14 条（技术文档 §5.6/§8.3/§8.6；设计 §四）
// devCost=满进度所需进度点；baseCost=月维护基线；cogsToken=每单 Token 成本（autoSrv/gray>0）
import type { ProjectType } from '../core/types';

export const PROJECT_TYPES: ProjectType[] = [
  { id: 'saas', name: 'SaaS 工具', devCost: 100, baseCost: 300, price: [30, 300], potentialClass: 'ai', passiveShare: 0.8, cogsToken: 0, desc: '订阅制软件：慢启动，复利，养出来的护城河。' },
  { id: 'plugin', name: '浏览器插件', devCost: 60, baseCost: 150, price: [30, 128], potentialClass: 'ai', passiveShare: 0.2, cogsToken: 0, desc: '买断制小工具：船小好调头，天花板也低。' },
  { id: 'template', name: '数字模板', devCost: 30, baseCost: 50, price: [9, 199], potentialClass: 'content', passiveShare: 0.5, cogsToken: 0, desc: '买断制模板：第一次「睡后收入」的最佳教具。' },
  { id: 'course', name: '录播课程', devCost: 80, baseCost: 100, price: [99, 999], potentialClass: 'edu', passiveShare: 0.6, cogsToken: 0, desc: '造一次卖无数次，但内容会过时——衰减快。' },
  { id: 'bootcamp', name: '训练营', devCost: 90, baseCost: 300, price: [999, 4999], potentialClass: 'edu', passiveShare: 0.1, cogsToken: 20, desc: '服务型教培：单价高，吃交付时间，不是被动收入。' },
  { id: 'community', name: '付费社群', devCost: 40, baseCost: 200, price: [20, 99], potentialClass: 'edu', passiveShare: 0.5, cogsToken: 0, desc: '订阅制圈子：续费率就是生命线。' },
  { id: 'consulting', name: '1v1 咨询', devCost: 20, baseCost: 100, price: [300, 2000], potentialClass: 'svc', passiveShare: 0, cogsToken: 0, desc: '卖时间：启动最快，完全不被动，刻意限量。' },
  { id: 'publishing', name: '出版物', devCost: 70, baseCost: 80, price: [30, 150], potentialClass: 'content', passiveShare: 0.7, cogsToken: 0, desc: '书/专栏授权：慢，但版税是真的复利。' },
  { id: 'physical', name: '实体产品', devCost: 110, baseCost: 500, price: [50, 500], potentialClass: 'ecom', passiveShare: 0.1, cogsToken: 15, desc: '打样到发货一手包办：现金流生意，库存是暗礁。' },
  { id: 'apiRelay', name: 'Token 中转站', devCost: 50, baseCost: 400, price: [50, 500], potentialClass: 'gray', passiveShare: 0.3, cogsToken: 40, gray: true, desc: '灰产：低价囤额度转卖开发者。毛利高，上游封号即断粮，稽查×2。' },
  // ---------- autoSrv 组（§8.3 自动化服务，收入=按量，COGS=Token） ----------
  { id: 'aiSupport', name: 'AI 客服外包', devCost: 70, baseCost: 300, price: [500, 3000], potentialClass: 'autoSrv', passiveShare: 0.5, cogsToken: 80, desc: '帮中小企业跑 AI 客服：按量收费，Token 是你的进货价。' },
  { id: 'growthAgency', name: '获客代运营', devCost: 80, baseCost: 350, price: [1000, 5000], potentialClass: 'autoSrv', passiveShare: 0.4, cogsToken: 120, desc: 'AI 投放与分发代运营：效果对赌，风控风险在平台侧。' },
  { id: 'agentDev', name: '智能体定制', devCost: 120, baseCost: 300, price: [5000, 30000], potentialClass: 'autoSrv', passiveShare: 0.2, cogsToken: 200, desc: '给公司搭智能体工作流：单价最高，交付最重。' },
  { id: 'contentFactory', name: '内容工厂', devCost: 90, baseCost: 400, price: [300, 2000], potentialClass: 'autoSrv', passiveShare: 0.5, cogsToken: 60, desc: '批量内容生产：规模即毛利率，同质化即天花板。' }
];

export function findProjectType(id: string): ProjectType | undefined {
  return PROJECT_TYPES.find(t => t.id === id);
}
