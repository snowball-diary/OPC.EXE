// 老张台词池（S4 内容数据层；技术文档 §7.4 / 设计方案 §2.6）
// 老张=虚构毒舌导师 NPC（名字致张雪峰 2026-04 猝死事件语境，非本人）。
// 四戒（技术文档 §18.1）：只说事实与代价 / 不评价人 / 不阻止选择 / 每句 ≤40 字。
// 出现位：过劳预警/心悸/猝死终局/破产边缘/道德抉择/倦怠退场/封号/灰产诱惑——只在「快要付出不可逆代价」时出现。
// 引擎已接线：events.ts resolveChoice 将 EventDef.oldZhang 以「老张：…」写入日志（cls purple）。

export type ZhangSituation =
  | 'overwork'       // 扩展日/硬撑（过劳预警）
  | 'heartAttack'    // 心悸预警事件
  | 'suddenDeath'    // 猝死终局
  | 'bankrupt'       // 破产边缘
  | 'moralChoice'    // 重大道德抉择
  | 'burnoutEnd'     // 过劳倒下终局
  | 'platformBan'    // 平台限流/封号
  | 'grayTemptation'; // 灰产诱惑

export interface ZhangLine {
  situation: ZhangSituation;
  text: string;
}

export const ZHANG_LINES: ZhangLine[] = [
  // ---------- overwork ----------
  { situation: 'overwork', text: '又是扩展日。多赚的四个小时，是从隐性疲劳里赊的，利息照算。' },
  { situation: 'overwork', text: '连续硬撑第七天。身体不催债，它只记账，一次结清。' },

  // ---------- heartAttack ----------
  { situation: 'heartAttack', text: '同学，心电图和现金流一个样：都在借贷周转，都撑不了几次。' },
  { situation: 'heartAttack', text: '现在退出去，亏的是进度。现在硬撑，押的是本金。' },
  { situation: 'heartAttack', text: '心悸不是玄学，是账单。你的隐性疲劳已经排队到 85 了。' },

  // ---------- suddenDeath ----------
  { situation: 'suddenDeath', text: '四月的事刚过去半年。黑屏之后没有下一行，日志也不会再翻页。' },
  { situation: 'suddenDeath', text: '这一次没有存档点。之前存下的所有钱，都取不回来了。' },

  // ---------- bankrupt ----------
  { situation: 'bankrupt', text: '账本合上之前，先写下三个数字：收入、支出、欠谁的。' },
  { situation: 'bankrupt', text: '现金连续三天为负，规则就要收牌。跑道还剩几个月，你算过吗。' },
  { situation: 'bankrupt', text: '现在停叫止损，现在硬撑叫加仓。牌桌上没有对错，只有代价。' },

  // ---------- moralChoice ----------
  { situation: 'moralChoice', text: '选哪个都行。只是其中一条路，会一直记在账上，等你到阶段五。' },
  { situation: 'moralChoice', text: '快钱和慢钱的区别不在金额，在收回来的那天睡不睡得着。' },

  // ---------- burnoutEnd ----------
  { situation: 'burnoutEnd', text: '第三次硬撑，身体替你踩了刹车。医院的账单，比扩展日的贵。' },
  { situation: 'burnoutEnd', text: '你不在的这一小时，公司照转。有些账，现在才看得清。' },

  // ---------- platformBan ----------
  { situation: 'platformBan', text: '账号是租的，作品是自己的。封号通知不带感情，政策也不带。' },
  { situation: 'platformBan', text: '申诉通道只在工作日开放。你的收入，不挑工作日。' },
  { situation: 'platformBan', text: '单平台占比过六成那天，就该想到今天。数据没骗你，是你没看。' },

  // ---------- grayTemptation ----------
  { situation: 'grayTemptation', text: '这单毛利六成。剩下四成，是给将来的稽查预留的。' },
  { situation: 'grayTemptation', text: '上游一封封号邮件，库存就归零。这生意没有复利，只有倒计时。' },
  { situation: 'grayTemptation', text: '不敢报税的钱不算收入，算倒计时。' },

  // ---------- [v0.10/W9] 作者典故（克制：只在闲笔处提一句，不破坏毒舌风格） ----------
  { situation: 'overwork', text: '我认识一个叫赖嘉诚的年轻人，也爱把一天掰成 48 小时用。后来他学会了早睡。' },
  { situation: 'bankrupt', text: '我认识一个叫赖嘉诚的年轻人，第一家公司也死在现金流上。他把账本裱起来了。' },
  { situation: 'platformBan', text: '我认识一个叫赖嘉诚的年轻人，封号后自己去搭了独立站。域名备案是自己的那种。' }
];

/** 简单选择器：同 situation 池内按 rng 抽一条（池空返回空串） */
export function pickZhang(situation: ZhangSituation, rng: { next(): number }): string {
  const pool = ZHANG_LINES.filter(l => l.situation === situation);
  if (pool.length === 0) return '';
  const idx = Math.floor(rng.next() * pool.length);
  return pool[idx]?.text ?? '';
}
