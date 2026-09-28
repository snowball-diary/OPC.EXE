// 经济常量与周期参数（技术文档 §6.3/§6.4；设计 §六）——全部数值可调参
import type { EconomyPhase } from '../core/types';

export const LIVING_BASE = 7000; // 月生活费基数（2026 物价口径；S2 修正 S1 的 1000 临时值）
// [S9] 8000→7000：sim 实测标准局月毛利中位 8000-12000，8000 生活费把平凡线（设计目标 55%）的
// 盈亏平衡窗压得过窄——bot 中位 ~150 天后事件/维护/税费的任一波动即滑向破产。7000 对应新一线
// 节俭独居者 2026 口径，平凡线可长期维持，成长期门槛不变。
export const SUB_BASE = 200; // 工具订阅基础/月（设计 §6.2）
export const AI_SUB = 800; // AI 全家桶订阅/月（flags.aiSub 时叠加）
export const BOOKKEEPING_FEE = 300; // 代账月费（自记账行动可省）
export const RELOCATE_MULT = 2; // 迁居费 = 月生活费 × 2

/** 经济周期转移矩阵（月掷，每行和 = 1，技术文档 §6.4 精确数字） */
export const PHASE_TRANSITIONS: Record<EconomyPhase, [EconomyPhase, number][]> = {
  boom: [['boom', 0.55], ['overheat', 0.35], ['recession', 0.10]],
  overheat: [['overheat', 0.4], ['recession', 0.5], ['boom', 0.1]],
  recession: [['recession', 0.5], ['recovery', 0.45], ['overheat', 0.05]],
  recovery: [['recovery', 0.4], ['boom', 0.5], ['overheat', 0.1]]
};

/** 订单量与广告单价乘子（0.7-1.3，§6.4） */
export const PHASE_ORDER_MULT: Record<EconomyPhase, number> = {
  overheat: 1.3,
  boom: 1.15,
  recovery: 1.0,
  recession: 0.7
};

/** 各资产月度收益 [期望, 标准差]；crypto 标准差为基础资产 ×6（高波动，09-28 裁决） */
export const ASSET_RET: Record<'fund' | 'bond' | 'indexFund' | 'stock' | 'crypto' | 'realEstate', [number, number]> = {
  fund: [0.004, 0.02],
  bond: [0.003, 0.008],
  indexFund: [0.006, 0.03],
  stock: [0.008, 0.06],
  crypto: [0.02, 0.36],
  realEstate: [0.004, 0.02]
};
