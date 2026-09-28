// 行动表 ~32 条（技术文档 §5.4；设计 §五）——四类：输入/输出/经营/身心，全中文文案
// domain = 瓶颈域（周复盘焦点 +15%/-10% 也按此判定，AgentDef.replaces 未来按此接管）
import type { ActionDef } from '../core/types';

export const ACTION_DEFS: ActionDef[] = [
  // ---------- 输入（i+1 三档走 tier 参数） ----------
  { id: 'deepLearnEasy', name: '深度学习·入门', desc: 'i+1 太易档：安全无挫折，但经验+0——卡在舒适区没有成长。', cat: 'input', ap: 1, energy: 8, special: 'learn', domain: 'skill', skill: 'craft', tier: 'easy', effects: [{ k: 'info', op: '+', v: [2, 4] }] },
  { id: 'deepLearnFit', name: '深度学习·适中', desc: 'i+1 适中档：标准经验收益。本周没有输出行动则经验×0.2。', cat: 'input', ap: 1, energy: 12, special: 'learn', domain: 'skill', skill: 'craft', tier: 'fit', effects: [{ k: 'stress', op: '+', v: 2 }] },
  { id: 'deepLearnHard', name: '深度学习·攻坚', desc: 'i+1 过难档：70% 挫折（压力+8），30% 顿悟（经验×1.6）。', cat: 'input', ap: 1, energy: 13, special: 'learn', domain: 'skill', skill: 'craft', tier: 'hard', effects: [{ k: 'stress', op: '+', v: 2 }] },
  { id: 'readIndustry', name: '读行业信息', desc: '读行业报告与竞品动态。信息节食：只读对决策有用的。', cat: 'input', ap: 1, energy: 5, special: 'research', domain: 'skill', effects: [{ k: 'info', op: '+', v: [4, 8] }] },
  { id: 'userInterview', name: '用户访谈', desc: '访谈真实用户：PMF 读数向真实收敛，估计噪声减半。', cat: 'input', ap: 1, energy: 10, special: 'userInterview', domain: 'skill', needsProject: true, effects: [{ k: 'info', op: '+', v: [3, 6] }] },
  { id: 'askMentor', name: '请教导师', desc: '约导师聊半小时。需要一位关系≥30 的导师人脉。', cat: 'input', ap: 1, energy: 6, special: 'consult', domain: 'skill', effects: [{ k: 'cognition', op: '+', v: [3, 6] }] },
  { id: 'joinCommunity', name: '参加社群', desc: '混对圈子：认识同行，偶尔有单子从群里来。', cat: 'input', ap: 1, energy: 8, cash: 200, special: 'community', domain: 'marketing', effects: [{ k: 'contacts', op: '+', v: 1 }, { k: 'info', op: '+', v: [2, 4] }] },

  // ---------- 输出 ----------
  { id: 'developProject', name: '开发项目', desc: '给项目推进度。进度≥80 自动进入发布，之后开发变成迭代。', cat: 'output', ap: 1, energy: 12, special: 'developProject', domain: 'delivery', needsProject: true, skill: 'craft', effects: [{ k: 'projectProgress', op: '+', v: [8, 15] }] },
  { id: 'writeContent', name: '写内容', desc: '三层同心圆创作（引流层/手艺层/身份层），发布到平台。', cat: 'output', ap: 1, energy: 10, special: 'publishContent', domain: 'marketing', skill: 'expression', effects: [{ k: 'stress', op: '+', v: 2 }] },
  { id: 'deliverService', name: '交付服务', desc: '接单交付收现金。需项目进入开发后阶段，或已有订单渠道。', cat: 'output', ap: 1, energy: 15, special: 'deliver', domain: 'cash', needsProject: true, skill: 'craft', effects: [] },
  { id: 'makeCourse', name: '制作课程', desc: '课程是项目型创作：请先立项「录播课程」类型项目。', cat: 'output', ap: 1, energy: 12, special: 'makeCourse', domain: 'delivery', needsProject: true, skill: 'expression', effects: [{ k: 'projectProgress', op: '+', v: [6, 12] }] },
  { id: 'polishQuality', name: '打磨质量', desc: '打磨作品质量，顺带偿还维护欠账。', cat: 'output', ap: 1, energy: 10, special: 'polishQuality', domain: 'delivery', needsProject: true, skill: 'craft', effects: [{ k: 'projectQuality', op: '+', v: [4, 8] }, { k: 'projectMaintenance', op: '+', v: -5 }] },

  // ---------- 经营 ----------
  { id: 'marketingDistribution', name: '营销分发', desc: '一鱼八吃：把已有内容分发到多平台（走平台 hook）。', cat: 'biz', ap: 1, energy: 8, special: 'market', domain: 'marketing', skill: 'marketing', effects: [{ k: 'stress', op: '+', v: 1 }] },
  { id: 'negotiatePriceLow', name: '定价·亲民', desc: '三档定价之一：低价走量转化高（收款系数 0.8）。', cat: 'biz', ap: 1, energy: 4, special: 'setPrice', domain: 'cash', effects: [] },
  { id: 'negotiatePriceStd', name: '定价·标准', desc: '三档定价之二：市场价，平衡之选（收款系数 1.0）。', cat: 'biz', ap: 1, energy: 4, special: 'setPrice', domain: 'cash', effects: [] },
  { id: 'negotiatePriceHigh', name: '定价·高端', desc: '三档定价之三：高单价低转化（收款系数 1.35）。', cat: 'biz', ap: 1, energy: 6, special: 'setPrice', domain: 'cash', effects: [] },
  { id: 'bookkeeping', name: '自记账', desc: '自己记账报税，每月省下代账费 ¥300（耗时耗神）。', cat: 'biz', ap: 1, energy: 8, special: 'bookkeeping', domain: 'compliance', effects: [{ k: 'skillExp.operation', op: '+', v: 6 }] },
  { id: 'payTax', name: '报税', desc: '按期报税：信用+2、合规+3。逾期信用-30。', cat: 'biz', ap: 1, energy: 4, special: 'payTax', domain: 'compliance', effects: [] },
  { id: 'registerSole', name: '注册个体户', desc: '¥500 低成本合规：核定征收 3%，摆脱无主体接单的灰色。', cat: 'biz', ap: 1, energy: 8, cash: 500, minStage: 2, special: 'registerEntity', domain: 'compliance', effects: [{ k: 'compliance', op: '+', v: 5 }] },
  { id: 'registerOPC', name: '注册一人有限公司', desc: '¥3000：小微优惠税率 5%，有限责任，资质前置。（彩蛋：作者的真公司就注册在南京江宁，字号用的本名）', cat: 'biz', ap: 2, energy: 15, cash: 3000, minStage: 3, special: 'registerEntity', domain: 'compliance', effects: [{ k: 'compliance', op: '+', v: 10 }, { k: 'rep', op: '+', v: 3 }] },
  { id: 'fileTrademark', name: '商标注册', desc: '¥3000 注册 41/9/42 类：品牌护城河，防抢注。', cat: 'biz', ap: 1, energy: 6, cash: 3000, minStage: 3, special: 'trademark', domain: 'compliance', effects: [{ k: 'compliance', op: '+', v: 3 }, { k: 'rep', op: '+', v: 2 }] },
  { id: 'fileIcp', name: 'ICP 备案', desc: '¥1000：网站类项目的前置资质。', cat: 'biz', ap: 1, energy: 6, cash: 1000, minStage: 3, special: 'icpFiling', domain: 'compliance', effects: [{ k: 'compliance', op: '+', v: 2 }] },
  { id: 'outsourceHire', name: '招外包', desc: '单次外包 ¥500-3000：换进度，质量方差大。', cat: 'biz', ap: 1, energy: 6, special: 'outsource', domain: 'delivery', needsProject: true, effects: [{ k: 'cash', op: '+', v: [-3000, -500] }, { k: 'projectProgress', op: '+', v: [8, 18] }] },
  { id: 'writeSop', name: '写 SOP', desc: '把重复流程写下来：维护欠账-10，自动化的地基。', cat: 'biz', ap: 1, energy: 10, special: 'writeSop', domain: 'delivery', effects: [{ k: 'projectMaintenance', op: '+', v: -10 }, { k: 'autoLevel', op: '+', v: 3 }, { k: 'skillExp.operation', op: '+', v: 5 }] },
  { id: 'buildAutomation', name: '自动化搭建', desc: '¥2000 搭自动化流程：autoLevel+6~12（≥85 即幽灵公司）。', cat: 'biz', ap: 2, energy: 15, cash: 2000, minStage: 3, special: 'automationBuild', domain: 'delivery', effects: [{ k: 'autoLevel', op: '+', v: [6, 12] }, { k: 'projectMaintenance', op: '+', v: -8 }] },
  { id: 'businessCoop', name: '商务合作', desc: '找同行联营：人脉+1，影响力+。', cat: 'biz', ap: 1, energy: 10, special: 'bizCoop', domain: 'marketing', effects: [{ k: 'contacts', op: '+', v: 1 }, { k: 'influence', op: '+', v: [2, 5] }, { k: 'skillExp.business', op: '+', v: 5 }] },

  // ---------- 身心（OS 维护） ----------
  // [S8] 平衡急救（浸泡实测：睡眠 -8/日 vs 深度休息 +6 → 睡眠/饮食两条线只跌不涨，
  // 标准局 ~15 天 healthCollapse 团灭，17 结局全部不可达）。只改数值不改逻辑：
  // 深度休息升级为「睡好+吃好」（睡眠+10、饮食+4），就医补饮食（遵医嘱好好吃饭）。
  // [S9] 二次调参（sim 首轮：workaholic 中位 13 天 healthCollapse、balanced 睡眠 23 天归零、
  // mentalBreak 占 22.7%——恢复侧经济仍入不敷出）：deepRest 睡眠 +14/饮食 +6/压力 -8，
  // 运动 +10~16，就医睡眠 +16/隐性疲劳 -10，冥想压力 -16~-11。漂移与 AP 口径未动。
  { id: 'exercise', name: '运动', desc: '出出汗：运动子项+，压力-。铁不是钢，但铁要练。', cat: 'self', ap: 1, energy: 10, special: 'exercise', domain: 'health', effects: [{ k: 'exercise', op: '+', v: [10, 16] }, { k: 'stress', op: '+', v: -4 }, { k: 'mood', op: '+', v: 2 }] },
  { id: 'meditate', name: '冥想', desc: '十分钟呼吸：压力显著下降，System1 的解药。', cat: 'self', ap: 1, energy: 4, special: 'meditate', domain: 'health', effects: [{ k: 'stress', op: '+', v: [-16, -11] }, { k: 'mood', op: '+', v: 3 }, { k: 'cognition', op: '+', v: 1 }] },
  { id: 'deepRest', name: '深度休息', desc: '半天彻底离线：睡到自然醒、好好吃一顿。精力大回复，隐性疲劳-15。', cat: 'self', ap: 1, energy: 0, special: 'deepRest', domain: 'health', effects: [{ k: 'energy', op: '+', v: 30 }, { k: 'sleep', op: '+', v: 16 }, { k: 'diet', op: '+', v: 6 }, { k: 'stress', op: '+', v: -8 }] },
  { id: 'socialize', name: '社交养关系', desc: '约朋友或客户吃饭：关系值+，情绪+，顺带吃了顿好的。', cat: 'self', ap: 1, energy: 8, cash: 300, special: 'socialize', domain: 'health', effects: [{ k: 'mood', op: '+', v: 7 }, { k: 'diet', op: '+', v: 2 }, { k: 'stress', op: '+', v: -2 }] },
  { id: 'travel', name: '旅行换环境', desc: '¥3000 出走：情绪大补压力清空，创作 buff 14 天。', cat: 'self', ap: 1, energy: 10, cash: 3000, special: 'travel', domain: 'health', effects: [{ k: 'mood', op: '+', v: 10 }, { k: 'stress', op: '+', v: -10 }] },
  { id: 'healthCheckup', name: '体检', desc: '¥500：解锁隐性疲劳精确读数。看不见的账单最贵。', cat: 'self', ap: 1, energy: 4, cash: 500, special: 'medical', domain: 'health', effects: [{ k: 'info', op: '+', v: 2 }] },
  { id: 'seekDoctor', name: '就医', desc: '¥800：睡眠情绪补正+遵医嘱吃饭，隐性疲劳-8。命是唯一不可再生的生产资料。', cat: 'self', ap: 1, energy: 4, cash: 800, special: 'medical', domain: 'health', effects: [{ k: 'sleep', op: '+', v: 16 }, { k: 'mood', op: '+', v: 3 }, { k: 'diet', op: '+', v: 4 }, { k: 'hiddenFatigue', op: '+', v: -10 }] }
];

export function findAction(id: string): ActionDef | undefined {
  return ACTION_DEFS.find(a => a.id === id);
}

/** 定价系数（flags.pricing：1 亲民 / 2 标准 / 3 高端；默认标准） */
export function pricingMult(s: { flags: Record<string, boolean | number> }): number {
  const p = s.flags.pricing;
  if (p === 1) return 0.8;
  if (p === 3) return 1.35;
  return 1.0;
}
