// 地理 8 地（设计方案 §8.2 / 技术文档 §一 locations.def）
// costMult：月生活费系数（月生活费 = 1000 × costMult × 难度 livingCostMult）
// creative/stress：创作类行动加成与每日压力修正（-10~+10），引擎 §6 流水线取用
import type { LocationDef } from '../core/types';

export const LOCATION_DEFS: LocationDef[] = [
  {
    id: 'beishang',
    name: '北京 / 上海',
    icon: '京',
    tier: '一线',
    desc: '机会最多，房租最狠。离钱近，离生活远。',
    costMult: 1.6,
    taxNote: '代账 200-500/月；核定征收基本无门',
    marketMult: 1.35,
    timezone: 'UTC+8 · 通勤地狱',
    creative: 2,
    stress: 5,
    eventFlags: ['tier1_bigclient', 'tier1_rent_pressure']
  },
  {
    id: 'hangcheng',
    name: '杭州 / 成都',
    icon: '杭',
    tier: '新一线',
    desc: '电商与直播之都，生活与生意平衡得刚好。',
    costMult: 1.0,
    taxNote: '新一线文创补贴多，个体户核定可谈',
    marketMult: 1.2,
    timezone: 'UTC+8 · 电商与直播生态',
    creative: 5,
    stress: 2,
    eventFlags: ['new1_ecom_boom', 'new1_livestream']
  },
  {
    id: 'guangshen',
    name: '广深',
    icon: '湾',
    tier: '一线（大湾区）',
    desc: '靠近供应链与出海口岸，务实主义大本营。',
    costMult: 1.4,
    taxNote: '外贸与出海通道，跨境合规复杂',
    marketMult: 1.25,
    timezone: 'UTC+8 · 与制造业零距离',
    creative: 3,
    stress: 4,
    eventFlags: ['gba_cross_border', 'gba_supply_chain']
  },
  {
    id: 'changwu',
    name: '长沙 / 武汉',
    icon: '湘',
    tier: '二线',
    desc: '房价友好，夜经济发达，媒体艺术之都。',
    costMult: 0.8,
    taxNote: '个体户核定征收友好',
    marketMult: 0.95,
    timezone: 'UTC+8 · 不夜城节奏',
    creative: 4,
    stress: -2,
    eventFlags: ['changwu_evening_economy']
  },
  {
    id: 'hometown',
    name: '小城家乡',
    icon: '乡',
    tier: '小城',
    desc: '最低成本，最低天花板。亲戚总在问你做什么工作。',
    costMult: 0.5,
    taxNote: '县城代账便宜；关系社会，办事看人情',
    marketMult: 0.6,
    timezone: 'UTC+8 · 早睡早起',
    creative: 0,
    stress: -6,
    eventFlags: ['hometown_gossip', 'family_dinner']
  },
  {
    id: 'dali',
    name: '大理旅居',
    icon: '理',
    tier: '旅居',
    desc: '苍山洱海，数字游民。创作力上限，生意半径有限。',
    costMult: 0.6,
    taxNote: '灵活就业社保自缴；游民聚落互助',
    marketMult: 0.7,
    timezone: 'UTC+8 · 面朝洱海',
    creative: 10,
    stress: -8,
    eventFlags: ['dali_nomad', 'dali_rain_season']
  },
  {
    id: 'singapore',
    name: '新加坡',
    icon: '狮',
    tier: '海外',
    desc: '出海第一站。合规天堂，生活成本也天堂级地高。',
    costMult: 1.6,
    taxNote: '税制简单低税率；需出海主体与收款通道',
    marketMult: 1.3,
    timezone: 'UTC+8 · 出海跳板',
    creative: 1,
    stress: 4,
    eventFlags: ['sg_outbound', 'sg_compliance']
  },
  {
    id: 'nomad',
    name: '全球游牧',
    icon: '游',
    tier: '游牧',
    desc: '地理套利极限玩法。护照就是工位。',
    costMult: 0.9,
    taxNote: '税务居民身份模糊——省税与稽查风险并存',
    marketMult: 0.9,
    timezone: '漂移 · UTC+0 ~ +8',
    creative: 8,
    stress: 3,
    eventFlags: ['nomad_visa_run', 'nomad_loneliness']
  }
];

export function findLocation(id: string): LocationDef | undefined {
  return LOCATION_DEFS.find(d => d.id === id);
}
