// 成就表 24 条（S4 内容数据层；check 全部为纯函数：只读状态切片，不写不改）
// 解锁记账在 core/achievements.ts（flags['ach_'+id]=true），接线在 time.ts advanceDay 末尾（cls gold 日志）。
// 口径说明（check 依赖的引擎事实）：
//  - stats.orders：actions.deliver / agents 自动成单时 +1
//  - flags.heartAttackWarn：心悸预警事件「硬撑」时置位（health.ts 双强预警用）
//  - flags.lastPassiveIncome：月结时写入的上月被动收入（economy.settleMonth）
//  - 「迁居完成」日志：index.ts relocate 路由写入；「老张：」日志：events.ts resolveChoice 写入
//  - stats.endingsSeen：applyEnding 去重归档（collectorHidden 读 5 隐藏结局键）
import type { StateSlice } from '../core/types';
import { netWorth } from './endings.def';

export interface AchDef {
  id: string;
  name: string;
  desc: string;
  check: (s: StateSlice) => boolean;
}

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

/** 已上线过的项目阶段（含衰退——曾经活着就算上线） */
const LAUNCHED: readonly string[] = ['launch', 'grow', 'mature', 'decline'];

/** 5 个隐藏结局键（endings.def hidden 组，顺序对应图鉴） */
export const HIDDEN_ENDING_KEYS: readonly string[] = ['unicorn', 'trueCalling', 'impactMany', 'secondLife', 'saintOrHag'];

export const ACHIEVEMENT_DEFS: AchDef[] = [
  // ---------- 生意线 ----------
  { id: 'firstOrder', name: '第一桶金', desc: '完成第一笔真实收款：有人为你的东西付了钱。', check: s => s.stats.orders >= 1 },
  { id: 'mvpLive', name: '首次上线', desc: '第一个项目走到发布：能被用到的东西才算作品。', check: s => s.projects.some(p => LAUNCHED.includes(p.stage)) },
  { id: 'mrr1k', name: '月入四位数', desc: '任一存活项目 MRR≥¥1000：月三魔咒，你跨过去了。', check: s => s.projects.some(p => p.alive && p.mrr >= 1000) },
  { id: 'rep80', name: '金字招牌', desc: '口碑≥80：客户开始把你当品牌引用。', check: s => s.rep >= 80 },
  { id: 'contentViral', name: '一夜爆了', desc: '内容大爆 1 次：流量退潮前，记得捞点东西上岸。', check: s => s.stats.bigHits >= 1 },
  { id: 'fireLine', name: '自由线', desc: '被动收入≥生活费：辞职信写在你自己的规则里。', check: s => s.monthlyExpense > 0 && num(s.flags.lastPassiveIncome) >= s.monthlyExpense },
  { id: 'fiveProjects', name: '五次学费', desc: '五个项目失败收场：市场替你付了学费，笔记别白记。', check: s => s.stats.projectsFailed >= 5 },

  // ---------- 规模线 ----------
  { id: 'auto60', name: '半自动', desc: '自动化≥60：一半以上的流程不再需要你动手。', check: s => s.autoLevel >= 60 },
  { id: 'ghost', name: '幽灵公司', desc: '自动化≥85：公司几乎自转。意义的空虚事件线已解锁。', check: s => s.autoLevel >= 85 },
  { id: 'unicorn', name: '一人独角兽', desc: '净资产≥¥1 亿：Altman 预测的那个人是你。', check: s => netWorth(s) >= 1e8 },
  { id: 'networker', name: '人脉广布', desc: '联系人≥50：关系网是最早的护城河。', check: s => s.contacts.length >= 50 },
  { id: 'tenure360', name: '满勤一年', desc: '第 360 天仍有存活项目：一年了，公司还开着门。', check: s => s.meta.day >= 360 && s.projects.some(p => p.alive) },
  { id: 'survivor', name: '活过一年', desc: '第 360 天：还在牌桌上，无论以什么姿势。', check: s => s.meta.day >= 360 },
  { id: 'globeRing', name: '三个工位', desc: '完成 3 次迁居：护照就是工位。', check: s => s.log.filter(l => l.msg.includes('迁居完成')).length >= 3 },

  // ---------- 成长线 ----------
  { id: 'skillAnyL4', name: '大师级', desc: '任一技能到 4 级：6 次真实交付换来的，不是刷出来的。', check: s => Object.values(s.skills).some(lv => lv >= 4) },
  { id: 'patch6', name: '六补丁内化', desc: '6 个 OS 补丁内化（连续执行 7 天）：系统长在了你身上。', check: s => s.osRules.filter(r => r.internalized).length >= 6 },
  { id: 'minimal3', name: '最低日×3', desc: '累计 3 个最低日：敢于少做是运营能力，不是懒。', check: s => s.stats.minDays >= 3 },
  { id: 'oldZhangFan', name: '老张听众', desc: '听过老张 8 次大实话：他没帮过你，但每句都对。', check: s => s.log.filter(l => l.msg.startsWith('老张：')).length >= 8 },

  // ---------- 身心线 ----------
  { id: 'burnEdge', name: '悬崖边上', desc: '过劳计数到过 2 且没倒下：铁不是钢，但你还没断。', check: s => s.burnoutCount >= 2 && s.burnoutCount < 3 },
  { id: 'suddenSurvivor', name: '心悸幸存者', desc: '心悸预警后把隐性疲劳拉回安全线：你听见了刹车声。', check: s => s.flags.heartAttackWarn === true && s.health.hiddenFatigue < 70 },

  // ---------- 风格线 ----------
  { id: 'buyCrypto', name: '币圈入场', desc: '持有加密资产：波动×6 的资产，心脏也是成本。', check: s => s.portfolio.crypto > 0 },
  { id: 'grayBlood', name: '灰色首单', desc: '恭喜，第一笔快钱入账。账单已在路上，注意查收。', check: s => s.stats.grayDeals >= 1 },
  { id: 'cleanExit', name: '干净离场', desc: '零灰产记录走完生涯且道德≥80：你没有需要删的聊天记录。', check: s => s.meta.over && s.stats.grayDeals === 0 && s.morality >= 80 },
  { id: 'collectorHidden', name: '图鉴收藏家', desc: '5 个隐藏结局全部达成：这个游戏被你玩穿了。', check: s => HIDDEN_ENDING_KEYS.every(k => s.stats.endingsSeen.includes(k)) }
];
