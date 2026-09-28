// OS 补丁数据：24 条四层各 6（技术文档 §5.2/设计 §2.5）——安装成本+月维护+行为记账 flag
// effectFlags：当日判定补丁「被执行」的 flag 清单（os.ts 的 FLAG_CHECKS 解释；空 = 有任意行动即算）
import type { OSRuleDef } from '../core/types';

export const PATCH_DEFS: OSRuleDef[] = [
  // ---------- 原则层 ----------
  { id: 'noList', name: '不做清单', layer: 'principle', desc: '写下今年不做的三件事。锁死部分坏选项（道德事件优化，flag:noListActive）。', installCost: { ap: 1, energy: 6 }, upkeep: 0, effectFlags: ['act_any'] },
  { id: 'serviceFirst', name: '先服务后产品', layer: 'principle', desc: '先有客户问题，再做产品。交付类行动+10%。', installCost: { ap: 1, energy: 8 }, upkeep: 0, effectFlags: ['act_deliver'] },
  { id: 'sincere', name: '真诚为本', layer: 'principle', desc: '不吹不黑。信任账户类事件自动加分（flag:sincereActive）。', installCost: { ap: 1, energy: 4 }, upkeep: 0, effectFlags: ['act_any'] },
  { id: 'infoDiet', name: '信息节食', layer: 'principle', desc: '只读对决策有用的。技能类行动+10%。', installCost: { ap: 1, energy: 4 }, upkeep: 20, effectFlags: ['act_any'] },
  { id: 'bigRock', name: '抓大放小', layer: 'principle', desc: '每天先做最重要的那件。周焦点加成期间压力增速降低。', installCost: { ap: 1, energy: 6 }, upkeep: 0, effectFlags: ['act_any'] },
  { id: 'compounding', name: '复利思维', layer: 'principle', desc: '选能积累的事做。项目月度质量衰减减缓（月结读取）。', installCost: { ap: 1, energy: 6 }, upkeep: 0, effectFlags: ['act_any'] },
  // ---------- 规则层 ----------
  { id: 'oneMainTask', name: '每日一主任务', layer: 'rule', desc: '一天只定一件必须完成的事。完成即日清。', installCost: { ap: 1, energy: 5 }, upkeep: 0, effectFlags: ['act_any'] },
  { id: 'inputBindOutput', name: '输入必绑输出', layer: 'rule', desc: '学完就要用：当天有学习且有输出，技能+15%。', installCost: { ap: 1, energy: 6 }, upkeep: 0, effectFlags: ['act_learn_output'] },
  { id: 'threeTierPricing', name: '三档定价', layer: 'rule', desc: '报价永远给三档。交付类行动+10%。', installCost: { ap: 1, energy: 6 }, upkeep: 0, effectFlags: ['pricing_set'] },
  { id: 'fridayReview', name: '周五复盘', layer: 'rule', desc: '每周五花 30 分钟回看。周复盘事实层更细。', installCost: { ap: 1, energy: 6 }, upkeep: 0, effectFlags: ['act_any'] },
  { id: 'dailyClose', name: '日清结账', layer: 'rule', desc: '当天账当天平。现金流类行动+5%。', installCost: { ap: 1, energy: 5 }, upkeep: 0, effectFlags: ['act_within_ap'] },
  { id: 'noZfb', name: 'NoZFB 先收款', layer: 'rule', desc: '先收款后交付。现金流类行动+5%。', installCost: { ap: 1, energy: 4 }, upkeep: 0, effectFlags: ['act_deliver'] },
  // ---------- 环境层 ----------
  { id: 'phoneAway', name: '物理隔离手机', layer: 'env', desc: '手机放另一个房间。技能类行动+5%。', installCost: { ap: 1, energy: 5 }, upkeep: 0, effectFlags: ['act_within_ap'] },
  { id: 'fixedWake', name: '固定起床', layer: 'env', desc: '每天同一时间起床：睡眠漂移减半。', installCost: { ap: 1, energy: 5 }, upkeep: 0, effectFlags: ['sleep_ok'] },
  { id: 'toolPreset', name: '工具预设', layer: 'env', desc: '工作环境一键就位：交付类行动+5%。', installCost: { ap: 1, energy: 8 }, upkeep: 0, effectFlags: ['act_any'] },
  { id: 'whiteList', name: '白名单通知', layer: 'env', desc: '只留 3 个人的提醒。每日压力额外-1（driftDay 读取）。', installCost: { ap: 1, energy: 3 }, upkeep: 0, effectFlags: ['act_any'] },
  { id: 'studyRitual', name: '书房仪式', layer: 'env', desc: '固定角落固定开场：技能类行动+5%。', installCost: { ap: 1, energy: 8 }, upkeep: 0, effectFlags: ['act_any'] },
  { id: 'offlineSlots', name: '断网时段', layer: 'env', desc: '每天两小时飞行模式。当日不硬撑即算执行。', installCost: { ap: 1, energy: 4 }, upkeep: 0, effectFlags: ['act_within_ap'] },
  // ---------- 反馈层 ----------
  { id: 'weeklyReviewPad', name: '每周复盘', layer: 'feedback', desc: '周结算三段复盘（事实/假设/建议）自动生成。', installCost: { ap: 1, energy: 6 }, upkeep: 0, effectFlags: ['act_any'] },
  { id: 'failTemplate', name: '失败记录模板', layer: 'feedback', desc: '失败只记录不反刍。身心类行动+5%。', installCost: { ap: 1, energy: 5 }, upkeep: 0, effectFlags: ['act_any'] },
  { id: 'dashBoard', name: '数据看板', layer: 'feedback', desc: '关键指标上墙。营销类行动+10%。', installCost: { ap: 1, energy: 8 }, upkeep: 30, effectFlags: ['act_any'] },
  { id: 'monthlyAudit', name: '月度盘点', layer: 'feedback', desc: '每月对账一次。现金流类行动+5%。', installCost: { ap: 1, energy: 8 }, upkeep: 0, effectFlags: ['act_any'] },
  { id: 'trustAccount', name: '信任账户', layer: 'feedback', desc: '每次交付都往信任账户存一笔。交付类行动+5%。', installCost: { ap: 1, energy: 6 }, upkeep: 0, effectFlags: ['act_deliver'] },
  { id: 'minExperiment', name: '最小实验', layer: 'feedback', desc: '新想法先跑两周最小实验。营销类行动+5%。', installCost: { ap: 1, energy: 6 }, upkeep: 0, effectFlags: ['act_any'] }
];

/** 内化补丁的行动乘子（patchMult 按 domain 合成） */
export const PATCH_MULTS: { id: string; domain: string; mult: number }[] = [
  { id: 'serviceFirst', domain: 'cash', mult: 1.1 },
  { id: 'infoDiet', domain: 'skill', mult: 1.1 },
  { id: 'inputBindOutput', domain: 'skill', mult: 1.15 },
  { id: 'threeTierPricing', domain: 'delivery', mult: 1.1 },
  { id: 'dailyClose', domain: 'cash', mult: 1.05 },
  { id: 'noZfb', domain: 'cash', mult: 1.05 },
  { id: 'phoneAway', domain: 'skill', mult: 1.05 },
  { id: 'toolPreset', domain: 'delivery', mult: 1.05 },
  { id: 'studyRitual', domain: 'skill', mult: 1.05 },
  { id: 'failTemplate', domain: 'health', mult: 1.05 },
  { id: 'dashBoard', domain: 'marketing', mult: 1.1 },
  { id: 'monthlyAudit', domain: 'cash', mult: 1.05 },
  { id: 'trustAccount', domain: 'delivery', mult: 1.05 },
  { id: 'minExperiment', domain: 'marketing', mult: 1.05 }
];

export function findPatch(id: string): OSRuleDef | undefined {
  return PATCH_DEFS.find(p => p.id === id);
}
