// 结局表：17 结局全量（技术文档 §十二映射 / 设计 §十二）
// active 5：玩家主动触发（S4 结算面板写对应 flags）；passive 7：被动轮询；hidden 5：条件隐藏
import { composeHealth } from '../core/health';
import type { EndingDef, StateSlice } from '../core/types';

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

export function netWorth(s: StateSlice): number {
  const p = s.portfolio;
  const assets = s.assets.reduce((a, x) => a + x.value, 0);
  return s.cash + p.cash + p.fund + p.bond + p.indexFund + p.stock + p.crypto + p.realEstate + assets - s.debt;
}

export const ENDING_DEFS: EndingDef[] = [
  // ---------- 主动（5） ----------
  { key: 'retire', name: '功成身退', type: 'active', desc: 'stage6 且 flags.retireChosen（结算面板触发）', check: s => s.meta.stage === 6 && s.flags.retireChosen === true, text: '你把公司交给了一套系统，把自己还给了生活。锻炼、写书、晒太阳——公司还在运转，只是不再需要你坐在桌前。', color: 'gold' },
  { key: 'sellCompany', name: '出售公司', type: 'active', desc: 'stage≥5 且 flags.sellChosen', check: s => s.meta.stage >= 5 && s.flags.sellChosen === true, text: '收购协议签完那天，你请老张吃了顿饭。他说：「卖掉不丢人，丢人的是贱卖。你这价，还行。」', color: 'gold' },
  { key: 'handover', name: '交棒', type: 'active', desc: 'stage6 且 flags.handoverChosen', check: s => s.meta.stage === 6 && s.flags.handoverChosen === true, text: '你花了两年时间，把脑子里的东西搬进流程和别人的手里。公司换了个坐姿的人，还在往前走。', color: 'gold' },
  { key: 'pivotRestart', name: '转型再出发', type: 'active', desc: 'flags.pivotRestartChosen 且 pivots≥3', check: s => s.flags.pivotRestartChosen === true && s.stats.pivots >= 3, text: '第 N 次转型。这次你没有豪言壮语，只是把新方向写进了不做清单的背面。', color: 'gold' },
  { key: 'backToWork', name: '回归职场', type: 'active', desc: 'flags.backToWorkChosen（体面版）', check: s => s.flags.backToWorkChosen === true, text: '你把这段日子写进简历：「独立经营，盈亏自负」。面试官问亏了多少钱，你笑而不语——有些课，市场替你付了学费。', color: 'sys' },

  // ---------- 被动（7） ----------
  { key: 'bankrupt', name: '破产', type: 'passive', desc: 'cash<0 连续 3 天', check: s => num(s.flags.cashNegDays) >= 3, text: '现金断流第三天，房东、收款码和信用卡同时到账。你数了数还能变现的东西，决定先停下来。', color: 'bad' },
  { key: 'burnoutDown', name: '过劳倒下', type: 'passive', desc: 'burnoutCount≥3（精力见底硬撑 3 次）', check: s => s.burnoutCount >= 3, text: '第三次硬撑之后，身体替你踩下了最后一次刹车。医院的天花板很白，你终于有了无所事事的理由。', color: 'bad' },
  { key: 'suddenDeath', name: '猝死', type: 'passive', desc: '隐性疲劳≥85+睡眠<15+心悸仍硬撑+过劳≥1 后掷骰命中', check: s => s.meta.endingKey === 'suddenDeath', text: '黑屏。\n老张说过：「我早说过，命是唯一不可再生的生产资料。其他都可以再来，这个不行。」\n2026 年 4 月的事，你没忘吧。', color: 'bad' },
  { key: 'legalFrozen', name: '法律冻结', type: 'passive', desc: 'flags.legalFrozen（灰产史+合规<40 的稽查连锁触发）', check: s => s.flags.legalFrozen === true, text: '账户被冻结那天早上，你还在给客户回消息。灰色的钱来得快，去得更快——连本带利。', color: 'bad' },
  { key: 'mentalBreak', name: '倦怠退场', type: 'passive', desc: '连续 7 天 System1 深度（s1DeepDays≥7）', check: s => num(s.flags.s1DeepDays) >= 7, text: '连续一周，你做的每个决定都是情绪替你做的。你看着屏幕，突然不知道自己在干嘛——身体先于大脑举手投降。', color: 'bad' },
  { key: 'platformCollapse', name: '平台覆灭', type: 'passive', desc: '全部平台 banned 且无私域', check: s => { const accs = Object.values(s.platforms); return accs.length > 0 && accs.every(a => a.state === 'banned') && s.flags.privateDomain !== true; }, text: '最后一个账号被封的那天，你才明白：你从来不是在经营粉丝，你是在替平台打工。流量退潮，你连泳裤都没有。', color: 'bad' },
  { key: 'healthCollapse', name: '健康崩盘', type: 'passive', desc: '健康合成<10（强制长期休养）', check: s => composeHealth(s.health) < 10, text: '体检单像一份判决书。医生说「再熬就真的起不来了」，你第一次发现，原来「休息」也需要下决心。', color: 'bad' },

  // ---------- 隐藏（5） ----------
  { key: 'unicorn', name: '一人独角兽', type: 'hidden', desc: 'autoLevel≥85 且存在 pmfTrue≥90 存活项目 且净资产≥1亿', check: s => s.autoLevel >= 85 && s.projects.some(p => p.alive && p.pmfTrue >= 90) && netWorth(s) >= 1e8, text: '公司没有第二个员工，账户里躺着九位数。Sam 说过 2026 年会有一人十亿美元公司——他猜早了几年，也猜错了人。', color: 'purple' },
  { key: 'trueCalling', name: '找到真正热爱', type: 'hidden', desc: 'character≥85 且 morality≥80 且完成项目≥3（[v0.10/体感复核] 2→3：日结后项目逐日涨用户，「带用户退役×2」不再稀缺——sim 实测 7.2%→15.1% 翻倍，超 ±50% 带）', check: s => s.character >= 85 && s.morality >= 80 && s.stats.projectsDone >= 3, text: '钱没大到改变阶层，但你发现自己不再想「逃离周一」。手艺、客户、作品——你把它们连成了一条自己的路。', color: 'purple' },
  { key: 'impactMany', name: '影响了一批人', type: 'hidden', desc: 'influence≥80 且粉丝峰值≥10万', check: s => s.influence >= 80 && s.stats.followersPeak >= 100000, text: '后台收到一条私信：「因为你写的东西，我今年也开始做了。」你数了数，这样的消息有一百多条。', color: 'purple' },
  { key: 'secondLife', name: '第二人生', type: 'hidden', desc: '旅居地+被动覆盖生活+morality≥60', check: s => (s.location === 'dali' || s.location === 'nomad') && s.monthlyIncome >= s.monthlyExpense && s.monthlyIncome > 0 && s.morality >= 60, text: '你把公司搬进了背包。早上写代码，下午晒被子，收入不多不少刚好够活。有人问你图什么，你说：图我的人生我自己排版。', color: 'purple' },
  { key: 'saintOrHag', name: '圣人或奸商', type: 'hidden', desc: '道德极值双结局：morality≥98 圣人 / ≤2 奸商（[S9] 95/5→98/2：sim 实测 safe 局 10% 触发圣人，极值应当更极）', check: s => s.morality >= 98 || s.morality <= 2, text: s => s.morality >= 95 ? '你拒绝过太多「就这一次」，也因此错过太多。但深夜睡前，你从不复盘良心。' : '每一笔钱你都能讲出一个让旁观者沉默的故事。账面很好看，名片上不敢印公司全名。', color: 'pink' }
];

export function findEnding(key: string): EndingDef | undefined {
  return ENDING_DEFS.find(e => e.key === key);
}
