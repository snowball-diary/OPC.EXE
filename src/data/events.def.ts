// 事件数据全量（S5：80 条正式事件 + [v0.10/W9] 1 条作者彩蛋 = 81 条；NEWS_TICKER 顶栏新闻条 30 条）
//
// 写作规范（技术文档 §9.4/§18.1；设计方案 §十）：
//   - 基调：真实、克制、具体（有数字有场景）；禁鸡汤禁说教；每条事件必须有独特触发条件或独特后果
//   - 老张台词（oldZhang）四戒：只说事实与代价 / 不评价人 / 不阻止选择 / 每句 ≤40 字；只在不可逆代价前出现
//   - when 全部用结构化 Cond；flag 条件只允许引擎已知 flag（KNOWN_FLAGS ∪ ev_*），否则 validateWhenReachable 报警
//   - ['random','<',p] 每事件至多 1 个；chain.event 必须指向本文件存在的 id（DAG，validateChains 把关）
//   - choice.id 以 'ending:' 开头 = 直接终局（endingKey 取冒号后缀，如 ending:backToWork）
//   - 引擎定向入队的保留 id（enqueueEvent 不检查 when）：when 首条统一写 ['random','<',0]（恒假），
//     使其永不进入随机池，只由引擎 forced 入队——weight 照常填写
//   - 效果键契约：事件层禁用 {k:'energy'}（applyEffects 对 energy 的 '+' 按 '=' 处理，引擎怪癖）；
//     tokenPriceIndex='tokenBill.priceIndex 落点'，flag.<名称>=flag 记账（引擎 handler 见 S5 报告）
//   - 时代锚点：2026 年 4 月张雪峰过劳猝死（NEWS_TICKER day1 + 心悸/猝死线克制回响，不调侃）
//
// 配额（恰 80）：保留 7 + 智能体事故 10 + Token 价格 4 + 猝死/过劳链 5 + 灰产 8 + 平台政策 8 +
//               道德 8 + AI 浪潮 6 + 金融 6 + 人际 6 + 机会危机 12 = 80
import type { EventDef } from '../core/types';

// ============================================================
// NEWS_TICKER：顶栏新闻条（技术文档 §7.4；day1 必含时代锚点）
// ============================================================

export const NEWS_TICKER: { day: number; text: string }[] = [
  { day: 1, text: '2026 年 4 月，考研名师张雪峰因过劳猝死。行业在讨论速度的代价。' },
  { day: 2, text: '灵活就业社保补贴新政落地：自缴社保的三成由就业补助金兜底，个体经营者可线上申报。' },
  { day: 3, text: '某头部实验室深夜发布新模型，长文写作类外包报价一夜腰斩。' },
  { day: 5, text: '知乎热帖：《我靠一门 Notion 模板课，第 7 个月流水过了 4 万》——评论区吵的是幸存者偏差。' },
  { day: 8, text: 'API 价格战开打：输入 Token 降 40%，输出端部分厂商被曝暗涨 15%。' },
  { day: 11, text: '三地发布 AI 智能体创业补贴：单个团队最高 20 万，要求本地注册主体与半年以上社保记录。' },
  { day: 15, text: '多平台同步执行 AI 生成内容标识新规：未声明限流，谐音变体加重处罚。' },
  { day: 18, text: '某独立开发者的 SaaS 订阅数破千：客单价 39 元/月，MRR 约 4.7 万——他晒出的是三年迭代日志。' },
  { day: 24, text: '2026 创作者生态报告：70% 全职创作者月入不足 3000 元，月入过万者不足 8%。' },
  { day: 30, text: '个体户减税细则出台：月销售额 10 万以下继续免征增值税，代账费也降了一档。' },
  { day: 39, text: '一人公司数量创历史新高：新注册「一人有限公司」同比 +37%，注册资本普遍认缴 100 万。' },
  { day: 45, text: '大厂 Agent 平台调整分成政策：开发者得七成、平台抽三成，独家入驻再让五个点。' },
  { day: 57, text: '一位独行创始人的自动化工具公司被收购，价格未披露。他在评论区只回了四个字：跑道没骗我。' },
  { day: 62, text: '调研：智能体外包市场规模同比 +180%，但六成项目交付后三个月内被客户停用。' },
  { day: 70, text: '代运营工作室新样本：一个人管 20 家小店，AI 出内容、人盯数据，人效是三年前的 6 倍。' },
  { day: 80, text: '智能体可靠性争论再起：某厂客服智能体批量幻觉承诺订单，涉事企业公开致歉并下线整改。' },
  { day: 95, text: '「烧 Token 的都是给显卡打工」：一篇单位经济分析长文刷屏，评论区一半在算账一半在骂账。' },
  { day: 110, text: '加密市场单日震荡 22%，全网杠杆爆仓 4.7 亿美元。有人清零离场，有人连夜搬砖回本。' },
  { day: 125, text: '地方创业者补贴申报指南走红：一次性创业补贴 5000-10000 元，条件是「正常经营满一年」。' },
  { day: 135, text: '内容工厂的内卷与现实：日更 40 条的矩阵号月流水 12 万，人力成本 9 万，老板说再卷就要亏了。' },
  { day: 150, text: 'GEO/独立站流量首次反超头部平台推荐流？数据存疑，但 SEO 服务商的订单已排到三个月后。' },
  { day: 165, text: '某知识博主公开收入结构：一门课占流水六成，涨价两次，退款率反而从 8% 降到 3%。' },
  { day: 180, text: '一人公司注册量半年报：存活一年以上的占 61%，死因第一名是现金流断流，不是没生意。' },
  { day: 200, text: '某内容平台限流潮持续三周，中腰部创作者集体把粉丝往公众号和邮件列表里搬。' },
  { day: 220, text: '付费社群新数据：年费制社群续费率中位数 43%，能做到 70% 的主理人都有一个共同点：亲自答疑。' },
  { day: 240, text: 'Agent 平台上线「用量账单日结」功能，开发者终于能按天看到自己在给哪家显卡厂打工。' },
  { day: 260, text: '「一人独角兽」首个候选出现：一家只有创始人的 AI 公司宣布年收入破 1 亿美元，正在审计。' },
  { day: 280, text: '外卖平台上「一人餐饮店」占比创新高：店主白天备菜、晚上直播，平台抽成 18% 是最大成本项。' },
  { day: 310, text: '独立开发者工具榜单：付费用户破千的工具平均开发周期 14 个月，其中 11 个月在改第一版。' },
  { day: 330, text: '灵活就业者养老账本：按最低档自缴 20 年，退休月领约 2100 元——比多数人想的可靠，也比多数人想的少。' }
];

// ============================================================
// 一、保留 id（引擎硬编码定向入队，id 一个字符都不能改）：7 条
// ============================================================

export const EVENT_DEFS: EventDef[] = [
  // ---------- 心悸预警（hiddenFatigue≥70 置顶必出，cooldown 5；猝死链前置 §7.3） ----------
  {
    id: 'heartAttackWarn',
    title: '心悸预警：凌晨两点的心跳声',
    body: '凌晨两点，屏幕的光打在脸上，你突然听见自己的心跳——不是比喻，是耳鸣一样一声一声的咚。顶栏挂着黑底红字的双强预警，状态页写着当前猝死风险——那个数字每天更新，从不装饰。现金还剩 {cash}，第 {day} 天，你在为一个什么样的事熬成这样？四月的事，行业讨论过一轮「速度的代价」，当时你也点了个「在看」。',
    cat: 'health',
    when: [['random', '<', 0]], // 引擎 forced 入队（hiddenFatigue≥70 置顶），永不随机抽样
    weight: 30,
    cooldownDays: 5,
    choices: [
      {
        id: 'hard-push',
        label: '硬撑：把这版赶完再说',
        hint: '当前猝死风险开始掷骰。身体只记账，一次结清',
        effects: [
          { k: 'flag.heartAttackWarn', op: '=', v: 1 }, // 置位：猝死掷骰门控（health.ts canRollSuddenDeath）
          { k: 'hiddenFatigue', op: '+', v: 6 },
          { k: 'stress', op: '+', v: 8 }
        ],
        results: '你按住胸口，继续敲键盘。心跳慢慢平了——这次。账已经记下，只等你状态最差的那一天。'
      },
      {
        id: 'rest-now',
        label: '立刻关机，今晚就睡',
        hint: '清预警标记，隐性疲劳还上一笔',
        effects: [
          { k: 'flag.heartAttackWarn', op: '=', v: 0 }, // 清位
          { k: 'hiddenFatigue', op: '+', v: [-10, -18] },
          { k: 'sleep', op: '+', v: 6 },
          { k: 'stress', op: '+', v: -5 }
        ],
        results: '你合上电脑躺平。天花板上什么都没有，这很好。进度没了半天，人还在。'
      },
      {
        id: 'hospital',
        label: '现在就去急诊',
        hint: '花几百块，买一张确定的心电图',
        effects: [
          { k: 'flag.heartAttackWarn', op: '=', v: 0 },
          { k: 'cash', op: '+', v: [-600, -1600] },
          { k: 'hiddenFatigue', op: '+', v: [-15, -25] },
          { k: 'info', op: '+', v: 4 }
        ],
        results: '心电图、抽血、医生皱着眉。结论是「注意休息」——你知道这三个字还有另一种读法。'
      }
    ],
    oldZhang: '四月的事刚上过热搜。心电图和现金流一样，都撑不了几次。'
  },

  // ---------- 强化预警（hf≥85 时引擎 forced，二选一：就医或硬撑 §7.3） ----------
  {
    id: 'heart-attack',
    title: '心悸加重：胸口像压了一块板',
    body: '楼梯爬到一半你停下来喘——不是累，是胸口压着一块板。顶栏的红色倒计时比昨天更刺眼，当前猝死风险一栏的数字已经不是 0，还在往上爬。账上还有 {cash}，精力 {energy}/100——这两个数字救不了心口这块板。这次不是「注意休息」能糊弄过去的等级。',
    cat: 'health',
    when: [['random', '<', 0]], // 引擎 forced 入队（hf≥85 或心悸已硬撑）
    weight: 40,
    cooldownDays: 5,
    choices: [
      {
        id: 'see-doctor',
        label: '就医：明天开始遵医嘱',
        hint: '花几千块，把猝死掷骰的门重新关上',
        effects: [
          { k: 'flag.heartAttackWarn', op: '=', v: 0 },
          { k: 'cash', op: '+', v: [-800, -2000] },
          { k: 'hiddenFatigue', op: '+', v: [-25, -35] },
          { k: 'healthWhole', op: '+', v: 6 }
        ],
        results: '动态心电图、急诊观察、一张假条。你把手机调成勿扰——公司两天不回消息，塌不了。'
      },
      {
        id: 'push-through',
        label: '硬撑：死亡掷骰开始',
        hint: '置位心悸标记：hf≥85+睡眠<15 时每日按公开概率掷猝死',
        requires: 'system2',
        s1Variant: '没时间了，干完再说',
        effects: [
          { k: 'flag.heartAttackWarn', op: '=', v: 1 },
          { k: 'hiddenFatigue', op: '+', v: 8 },
          { k: 'stress', op: '+', v: 12 }
        ],
        results: '你吞了半片止痛片继续干。从今晚起，每一次入睡都像掷骰子——骰子是透明的，你看得见点数。'
      }
    ],
    oldZhang: '现在退出去，亏的是进度。现在硬撑，押的是本金。'
  },

  // ---------- AI 检测限流（content 智能体在岗未声明时 publishContent forced，cooldown 7） ----------
  {
    id: 'aiUndeclared',
    title: 'AI 检测命中：内容被标记限流',
    body: '后台弹出一条站内信：你有一条内容被 AI 检测模型命中，且发布时未勾选「AI 生成」。限流已生效，曝光曲线像被剪了一刀——粉丝 {followers} 人的账号，说限就限。评论区已经有人问：「这是 AI 写的吧？」——不声明，检测命中就限流，这是 2026 年的平台常识。',
    cat: 'platform',
    when: [['random', '<', 0]], // 引擎 forced 入队（publishContent 检测命中）
    weight: 20,
    cooldownDays: 7,
    choices: [
      {
        id: 'declare',
        label: '补声明：把标识全补上',
        hint: '合规 +4，短期流量受损，账号长期安全',
        s1Variant: '先补标识再说',
        effects: [
          { k: 'compliance', op: '+', v: 4 },
          { k: 'followers.bilili', op: '+', v: -40 },
          { k: 'stress', op: '+', v: 2 }
        ],
        results: '你把近 30 条内容补上了标识。曝光掉了一截，但站内信没有再来。慢就是快。'
      },
      {
        id: 'appeal',
        label: '申诉：人工复核通道',
        hint: '花 800 元加急，成功率一般，涨信息',
        effects: [
          { k: 'cash', op: '+', v: -800 },
          { k: 'info', op: '+', v: 3 },
          { k: 'stress', op: '+', v: 4 }
        ],
        results: '申诉工单、材料、三天的等待。限流解除了，你也顺带摸清了平台的检测边界。'
      },
      {
        id: 'wait',
        label: '装死：赌它查不到下一条',
        hint: '未声明状态检测概率 ×3，粉丝继续流失',
        requires: 'system2',
        s1Variant: '应该没事吧',
        effects: [
          { k: 'followers.bilili', op: '+', v: -120 },
          { k: 'stress', op: '+', v: 8 }
        ],
        results: '你划走了站内信。限流像滴水，一滴不疼，天天滴。'
      }
    ],
    oldZhang: '不敢声明的稿子，和不敢报税的收入，是同一种东西。'
  },

  // ---------- 烧钱警报（连续 2 月账单>上月收入 60% 时 agents.ts forced，cooldown 30） ----------
  {
    id: 'token-burn-warning',
    title: '烧钱警报：Token 账单连吃两个月',
    body: '账单出来了：Token 支出连续第 2 个月超过上月收入的 60%。智能体们不睡觉也不喊累，只是每天准时把日扣单拍在你桌上——现金 {cash}，跑道 {runway} 个月。烧 Token 的生意，毛利 = 客单价 − Token 成本×价格指数——价格指数不归你管，用量归你管。',
    cat: 'crisis',
    when: [['random', '<', 0]], // 引擎 forced 入队（tokenBurnStreak≥2）
    weight: 25,
    cooldownDays: 30,
    choices: [
      {
        id: 'cut-usage',
        label: '降配：usageScale 全线下调',
        hint: '本月账单立减，自动化程度回撤',
        effects: [
          { k: 'tokenBill', op: '+', v: [-800, -2000] },
          { k: 'autoLevel', op: '+', v: -2 },
          { k: 'stress', op: '+', v: 3 }
        ],
        results: '你把三台智能体的用量拧小了一格。账单薄了，流水线的噪音也轻了——有点空，但账是平的。'
      },
      {
        id: 'raise-price',
        label: '涨价对冲：客单价上调',
        hint: '项目 MRR ×1.15-1.3，口碑要付利息',
        effects: [
          { k: 'projectMrr', op: '*', v: [1.15, 1.3] },
          { k: 'rep', op: '+', v: -3 },
          { k: 'stress', op: '+', v: 4 }
        ],
        results: '新价目表发了出去。有两个客户没续费，留下的人替他们补上了缺口——勉强抹平账单。'
      },
      {
        id: 'keep-burn',
        label: '烧下去：赌规模摊薄成本',
        hint: '压力 +10，项目质量受损，赌的是下个月',
        requires: 'system2',
        s1Variant: '再烧一个月看看',
        effects: [
          { k: 'stress', op: '+', v: 10 },
          { k: 'projectQuality', op: '+', v: [-3, -8] },
          { k: 'info', op: '+', v: 2 }
        ],
        results: '你在账本上写：「烧钱买的是时间。」写完盯着这行字看了十秒，把账本合上了。'
      }
    ]
  },

  // ---------- 月三魔咒（moonThree 项目 forced，cooldown 30）：劝退/转型抉择 ----------
  {
    id: 'moon-three',
    title: '月三魔咒：第三个月，还是 ¥1000 以下',
    body: '第 {month} 个月月结跑完，那个项目 MRR 仍不足 ¥1000（当前在营 MRR 合计 {mrr}）。调研里 8600 个认真验证过的产品，只有 10.3% 摸到过 $1000 月收入；第 3 个月还没破的，此后能破的只剩 12.3%。你盯着曲线，它平得像一条规劝。',
    cat: 'crisis',
    when: [['random', '<', 0]], // 引擎 forced 入队（月结 moonThree 名单）
    weight: 20,
    cooldownDays: 30,
    choices: [
      {
        id: 'pivot',
        label: '转型：把验证过的一半拆出来重做',
        hint: '认知 +4、品性 +2，压力 +3——转型是止损不是认输',
        effects: [
          { k: 'cognition', op: '+', v: 4 },
          { k: 'character', op: '+', v: 2 },
          { k: 'stress', op: '+', v: 3 }
        ],
        results: '你把后台数据导出来看了一夜：用户只为一半功能付钱。那就只留那一半。'
      },
      {
        id: 'retire',
        label: '退役：停掉它，把维护欠账清零',
        hint: '情绪回升，项目欠账 -20，现金流止血',
        effects: [
          { k: 'projectMaintenance', op: '+', v: -20 },
          { k: 'stress', op: '+', v: -4 },
          { k: 'mood', op: '+', v: 4 }
        ],
        results: '你给它发了最后一版更新，公告只有一句：「感谢陪伴，服务器月底下线。」'
      },
      {
        id: 'persist',
        label: '死扛：再投一笔钱加功能',
        hint: '现金 -3000~-8000，进度 +8~15，魔咒不吃「再等等」',
        requires: 'system2',
        s1Variant: '再等一个月，说不定就起来了',
        effects: [
          { k: 'cash', op: '+', v: [-3000, -8000] },
          { k: 'projectProgress', op: '+', v: [8, 15] },
          { k: 'stress', op: '+', v: 8 }
        ],
        results: '你给 v2.0 排了三个新功能。12.3% 的故事里有没有你，曲线下个月说话。'
      }
    ],
    oldZhang: '三个月不见起色就换方向。牌桌上没有对错，只有代价。'
  },

  // ---------- 恢复中断（波动→中断时 time.ts forced，cooldown 10） ----------
  {
    id: 'recovery-interrupt',
    title: '中断协议：身心把项目按了暂停',
    body: '连续两天的低波动，在今天（第 {day} 天）落成了中断：日程表上接下来几天被系统标成了最低日。不是你决定停，是身体替你决定的——项目停摆 3-5 天，客户消息在收件箱里排着队，现金 {cash} 只出不进。恢复协议不删档，但代价是真的。',
    cat: 'health',
    when: [['random', '<', 0]], // 引擎 forced 入队（recoveryState 波动→中断）
    weight: 25,
    cooldownDays: 14, // [S9] 10→14：中断回调密度下调（情绪 wobble 链实证），deny 打击不再是过劳主因
    choices: [
      {
        id: 'follow-protocol',
        label: '遵医嘱：连续三天最低日',
        hint: '健康整体回升，隐性疲劳大幅还账',
        effects: [
          { k: 'healthWhole', op: '+', v: 6 },
          { k: 'hiddenFatigue', op: '+', v: [-12, -20] },
          { k: 'stress', op: '+', v: -5 }
        ],
        results: '睡觉、吃饭、散步，各 1 个行动点。第三天傍晚你发觉自己在哼歌——系统没断。'
      },
      {
        id: 'deny',
        label: '带病上阵：最低日照样加活',
        hint: '过劳计数 +1（3 次即倒下终局），代价立等可取',
        requires: 'system2',
        s1Variant: '就这么点事，撑一下过去了',
        effects: [
          { k: 'burnoutCount', op: '+', v: 1 },
          { k: 'hiddenFatigue', op: '+', v: 6 },
          { k: 'stress', op: '+', v: 8 }
        ],
        results: '你在最低日里塞了三个任务。身体没说话，只是在账本上又画了一道——第三次它不会再提醒。'
      }
    ],
    oldZhang: '你不在的这一小时，公司照转。有些账，现在才看得清。'
  },

  // ---------- 周焦点提醒（每 7 天 time.ts forced，cooldown 1）：轻量三选一 ----------
  {
    id: 'weekly-focus',
    title: '周复盘：给下周定一个主焦点',
    body: '周日晚上，三段复盘摆在面前：本周事实、几条假设、一个瓶颈排序。贪多无加成——主焦点类行动 +15%，其余 -10%。下一个七天，你想让哪条线往前挪？',
    cat: 'social',
    when: [['random', '<', 0]], // 引擎 forced 入队（day%7==0）
    weight: 15,
    cooldownDays: 1,
    choices: [
      {
        id: 'focus-health',
        label: '焦点：把睡眠还回来',
        hint: '轻量增益：健康与睡眠小幅回升',
        effects: [
          { k: 'healthWhole', op: '+', v: 2 },
          { k: 'sleep', op: '+', v: 2 }
        ],
        results: '你把「23:30 前上床」写进了下周第一格。'
      },
      {
        id: 'focus-cash',
        label: '焦点：现金流优先',
        hint: '轻量增益：信息 +3，下周先看账再看需求',
        effects: [{ k: 'info', op: '+', v: 3 }],
        results: '你把收款计划置顶，其余全部往后排了一格。'
      },
      {
        id: 'no-focus',
        label: '照旧：不定焦点',
        hint: '不增益也不惩罚，压力微涨',
        effects: [{ k: 'stress', op: '+', v: 1 }],
        results: '你关掉复盘面板。下周会自己来的，它总是这样。'
      }
    ]
  },

  // ============================================================
  // 二、智能体事故（agents.def riskEvents 全量落地）：10 条
  //     引擎 tickAgentsDay 按id forced 入队并在事故时已扣 trust -20；
  //     「人工接管」类选项消耗你的 AP/现金/精力，是事故的唯一止损阀
  // ============================================================

  {
    id: 'ag-support-hallucination',
    title: '事故：客服智能体承诺了「永久免费」',
    body: '工单记录里，客服智能体为了安抚一位客户，白纸黑字写下「后续所有版本永久免费升级」。对方已经截图发到了三个群。幻觉是它的原罪——它不知道承诺是要花钱的。',
    cat: 'ai',
    when: [['random', '<', 0]], // 引擎 forced 入队（support/butler 事故掷骰）
    weight: 25,
    cooldownDays: 5,
    choices: [
      {
        id: 'takeover-honor',
        label: '人工接管：兑现承诺，吃下成本',
        hint: 'AP -1，现金 -1500~-3000，口碑反而涨',
        effects: [
          { k: 'ap', op: '+', v: -1 },
          { k: 'cash', op: '+', v: [-1500, -3000] },
          { k: 'rep', op: '+', v: 2 }
        ],
        results: '你亲自回电，把「永久免费」四个字认了下来。客户把新截图也发到了群里——这次配的字是「担当」。'
      },
      {
        id: 'retract',
        label: '公告勘误 + 补偿券',
        hint: '现金 -500，诚实记账：道德 +2，口碑微跌',
        effects: [
          { k: 'cash', op: '+', v: -500 },
          { k: 'morality', op: '+', v: 2 },
          { k: 'rep', op: '+', v: -1 }
        ],
        results: '公告写得很体面：「系统勘误，以合同为准」。附了一张 50 元补偿券，两成人用了。'
      },
      {
        id: 'ignore',
        label: '装没看见：把三个群都设免打扰',
        hint: '口碑 -5，压力 +6，截图会自己传播',
        effects: [
          { k: 'rep', op: '+', v: -5 },
          { k: 'stress', op: '+', v: 6 }
        ],
        results: '你把群消息设了免打扰。截图自己长了腿，一周后出现在某个评测视频的背景里。'
      }
    ]
  },

  {
    id: 'ag-support-complaint',
    title: '事故：投诉升级，客户在社群挂了截图',
    body: '智能体用模板句式回了同一句话七遍，客户把七张截图拼成一张长图，配文「这就是你们说的智能客服」。长图正在你们最大的客户群里传播，已有两人在问「那我还续费吗」。',
    cat: 'ai',
    when: [['random', '<', 0]],
    weight: 25,
    cooldownDays: 5,
    choices: [
      {
        id: 'call-personally',
        label: '人工接管：亲自回电话',
        hint: 'AP -1，压力 +4，口碑 +2——真人道歉仍不可替代',
        effects: [
          { k: 'ap', op: '+', v: -1 },
          { k: 'stress', op: '+', v: 4 },
          { k: 'rep', op: '+', v: 2 }
        ],
        results: '十五分钟的电话，前五分钟挨骂，后十分钟听他骂产品。挂电话前他说：「你人还在线，续费吧。」'
      },
      {
        id: 'refund',
        label: '走退款：当月费用全退',
        hint: '现金 -800~-2000，口碑 +1，止损干净',
        effects: [
          { k: 'cash', op: '+', v: [-800, -2000] },
          { k: 'rep', op: '+', v: 1 },
          { k: 'stress', op: '+', v: 2 }
        ],
        results: '退款秒到。长图下面的讨论改了风向：「钱退得挺快。」'
      },
      {
        id: 'double-down',
        label: '让智能体再道歉一轮',
        hint: '口碑 -3——模板的道歉只会生成新的截图',
        effects: [
          { k: 'rep', op: '+', v: -3 },
          { k: 'stress', op: '+', v: 3 }
        ],
        results: '第八张截图在五分钟后出现，内容是同一句道歉。群里的气氛从愤怒转成了沉默。'
      }
    ]
  },

  {
    id: 'ag-growth-riskcontrol',
    title: '事故：获客智能体触发批量风控',
    body: '凌晨三点，获客智能体的第 417 次同模板互动被平台风控一网打尽：账号被限流 7 天，投放预算烧掉了三分之一。批量行为是风控的最爱——它只看得到「量」，看不到「局」。',
    cat: 'ai',
    when: [['random', '<', 0]],
    weight: 25,
    cooldownDays: 5,
    choices: [
      {
        id: 'takeover-pause',
        label: '人工接管：全面停投，人肉排查',
        hint: 'AP -1，压力 +3，止血优先',
        effects: [
          { k: 'ap', op: '+', v: -1 },
          { k: 'stress', op: '+', v: 3 },
          { k: 'followers.douyin', op: '+', v: -30 }
        ],
        results: '你花了一上午把它的行为日志翻了个底朝天，删掉了三条会再犯的规则。限流 7 天，认了。'
      },
      {
        id: 'new-materials',
        label: '换素材矩阵：把「批量」伪装成「人」',
        hint: '现金 -1200，信息 +2，治标也治半只本',
        effects: [
          { k: 'cash', op: '+', v: -1200 },
          { k: 'info', op: '+', v: 2 },
          { k: 'stress', op: '+', v: 2 }
        ],
        results: '素材库从 5 套扩到 40 套，文案拆成三种语气。风控的下一次点名，未必再点到你。'
      },
      {
        id: 'scale-up',
        label: '提量对冲：烧更多预算压过限流',
        hint: '抖音粉 -150，压力 +8——风控喜欢头铁的人',
        effects: [
          { k: 'followers.douyin', op: '+', v: -150 },
          { k: 'cash', op: '+', v: [-2000, -4000] },
          { k: 'stress', op: '+', v: 8 }
        ],
        results: '预算翻倍，曝光却更低了。风控没有跟你讲道理，它只是把阈值又降了一格。'
      }
    ]
  },

  {
    id: 'ag-growth-material',
    title: '事故：投放素材撞上违禁词库',
    body: '投放平台的新一轮扫描把获客智能体生成的 12 套素材全数标记：三套涉「最赚钱」，五套涉「保证见效」，四套直接撞医疗用语。账户信用分被扣，素材库进了人工审核队列。',
    cat: 'ai',
    when: [['random', '<', 0]],
    weight: 25,
    cooldownDays: 5,
    choices: [
      {
        id: 'full-audit',
        label: '人工接管：全线下架重审',
        hint: 'AP -1，小红书粉 -80，合规 +3',
        effects: [
          { k: 'ap', op: '+', v: -1 },
          { k: 'followers.xhs', op: '+', v: -80 },
          { k: 'compliance', op: '+', v: 3 }
        ],
        results: '你把素材库清空重建，每个词都对着新的违禁清单过了一遍。慢了一天，但审核队列里再也没有你。'
      },
      {
        id: 'partial-fix',
        label: '只删被点名的 12 套',
        hint: '合规 -2——剩下的素材不一定干净',
        effects: [
          { k: 'compliance', op: '+', v: -2 },
          { k: 'stress', op: '+', v: 4 }
        ],
        results: '你删了 12 套，又偷偷把另外 6 套改了两个词重新提交。审核队列提示：您有素材待复核。'
      },
      {
        id: 'appeal-scan',
        label: '申诉：要求人工复检误判',
        hint: '现金 -600，信息 +3，有一半是误判',
        effects: [
          { k: 'cash', op: '+', v: -600 },
          { k: 'info', op: '+', v: 3 },
          { k: 'stress', op: '+', v: 2 }
        ],
        results: '复检结果：12 套里 5 套误判解除。你顺带拿到了一份违禁词更新日志——比素材值钱。'
      }
    ]
  },

  {
    id: 'ag-content-aidetect',
    title: '事故：内容智能体的稿子被检测锁了',
    body: '内容智能体本周自动发布了 11 条内容，其中 3 条被 AI 检测命中且未声明，账号进入「待核实」状态。它产出内容的 aiDeclared 默认是 false——不补声明，检测限流 ×3，这是写在你签的平台协议里的。',
    cat: 'ai',
    when: [['random', '<', 0]],
    weight: 25,
    cooldownDays: 5,
    choices: [
      {
        id: 'declare-all',
        label: '补声明：把它的产出全部标识',
        hint: '合规 +4，B站粉 -60，一劳永逸',
        effects: [
          { k: 'compliance', op: '+', v: 4 },
          { k: 'followers.bilili', op: '+', v: -60 },
          { k: 'stress', op: '+', v: 2 }
        ],
        results: '你顺手改了智能体的发布配置：以后每条自动带标识。曝光掉了 15%，账号从「待核实」变回「正常」。'
      },
      {
        id: 'rewrite',
        label: '人工接管：逐条洗稿重发',
        hint: 'AP -1，现金 -300，压力 +5——手艺对抗检测',
        effects: [
          { k: 'ap', op: '+', v: -1 },
          { k: 'cash', op: '+', v: -300 },
          { k: 'stress', op: '+', v: 5 }
        ],
        results: '你把三条稿子各改了四成，加了两个只有你会写的段落。检测放行了两条——第三条仍在队列里。'
      },
      {
        id: 'tough',
        label: '硬刚：标注「人类创作」不改',
        hint: 'B站粉 -200，压力 +10——谎会被截图存档',
        effects: [
          { k: 'followers.bilili', op: '+', v: -200 },
          { k: 'stress', op: '+', v: 10 }
        ],
        results: '三天后，有人把你上周的视频和你智能体的生成日志放在了同一个帖子里。帖子比你的内容先热。'
      }
    ]
  },

  {
    id: 'ag-content-homogenize',
    title: '事故：你的内容，和首页撞衫了',
    body: '你刷到自己账号三条内容——和另外两个账号的标题、分镜、甚至停顿节奏几乎一样。都是内容智能体，都吃同一个语料池。同质化即天花板：规模上去了，辨识度下来了。',
    cat: 'ai',
    when: [['random', '<', 0]],
    weight: 25,
    cooldownDays: 5,
    choices: [
      {
        id: 'write-personally',
        label: '人工接管：这周亲自写三篇',
        hint: 'AP -2，表达经验 +8，压力 +4——差异化是人写出来的',
        effects: [
          { k: 'ap', op: '+', v: -2 },
          { k: 'skillExp.expression', op: '+', v: 8 },
          { k: 'stress', op: '+', v: 4 }
        ],
        results: '三篇手写的稿子发出去，数据平平。但评论区第一次有人问：「这个视角是你自己的吗？」'
      },
      {
        id: 'switch-track',
        label: '换赛道：把选题池整个换掉',
        hint: '认知 +4，B站粉 -40——旧粉会流失一部分',
        effects: [
          { k: 'cognition', op: '+', v: 4 },
          { k: 'followers.bilili', op: '+', v: -40 }
        ],
        results: '你把智能体的选题池从「热点解读」换到「亲手案例」。掉了几百个泛粉，留下的都更值钱。'
      },
      {
        id: 'more-volume',
        label: '提高频次：用量把同质压过去',
        hint: 'B站粉 -80，压力 +6——量解决不了「像」',
        effects: [
          { k: 'followers.bilili', op: '+', v: -80 },
          { k: 'stress', op: '+', v: 6 }
        ],
        results: '日更变日更×2。数据涨了一点，评论区开始有人给三条不同的内容回复同一句「又是你」。'
      }
    ]
  },

  {
    id: 'ag-sales-violation',
    title: '事故：销售智能体承诺了「包过保退」',
    body: '通话记录转写里，销售智能体对三意向客户说出「包过、不过全退、效果保证」——它从历史成交话术里学来的高转化句式。转化率确实高了，合规分却在流血：这些词写在广告法的禁用清单上。',
    cat: 'ai',
    when: [['random', '<', 0]],
    weight: 25,
    cooldownDays: 5,
    choices: [
      {
        id: 'takeover-audit',
        label: '人工接管：逐单核查，重签补充协议',
        hint: 'AP -2，现金 -500~-1500，合规 +4',
        effects: [
          { k: 'ap', op: '+', v: -2 },
          { k: 'cash', op: '+', v: [-500, -1500] },
          { k: 'compliance', op: '+', v: 4 }
        ],
        results: '你给三个客户各打了一通电话，把话术里的四个字当面收回。有一个人因此多问了一句——反而聊成了。'
      },
      {
        id: 'silent-fix',
        label: '静默撤回：更新它的话术库',
        hint: '合规 +1，压力 +3——已说出去的话收不回',
        effects: [
          { k: 'compliance', op: '+', v: 1 },
          { k: 'stress', op: '+', v: 3 }
        ],
        results: '你删掉了那四条话术，把「效果保证」加进了黑名单。电话录音还在别人的手机里。'
      },
      {
        id: 'let-it-go',
        label: '不管：先出单再说',
        hint: '合规 -6，口碑 -3，压力 +6——罚单在路上',
        requires: 'system2',
        s1Variant: '单子到手才是真的',
        effects: [
          { k: 'compliance', op: '+', v: -6 },
          { k: 'rep', op: '+', v: -3 },
          { k: 'stress', op: '+', v: 6 }
        ],
        results: '两周后一笔投诉到平台：「销售承诺保过」。你翻出录音，那四个字清晰得像罚单的编号。'
      }
    ]
  },

  {
    id: 'ag-sales-lost',
    title: '事故：一笔两万的单子跟丢了',
    body: '复盘时你才发现：销售智能体把报价单发错了版本——旧价高了 40%，客户已读不回。等你人工拨过去，对方采购流程已经走到竞品那一步。丢单的原因不在能力，在没人盯着它。',
    cat: 'ai',
    when: [['random', '<', 0]],
    weight: 25,
    cooldownDays: 5,
    choices: [
      {
        id: 'personal-follow',
        label: '人工接管：亲自复盘重谈',
        hint: 'AP -2，商业经验 +10，压力 +5——还有一线',
        effects: [
          { k: 'ap', op: '+', v: -2 },
          { k: 'skillExp.business', op: '+', v: 10 },
          { k: 'stress', op: '+', v: 5 }
        ],
        results: '你约到对方午休的二十分钟，承认失误、给出新价和里程碑。单子没死，进入「再议」——这已是最好的结果。'
      },
      {
        id: 'discount-rescue',
        label: '降价挽回：让利 15% 抢回来',
        hint: '现金 +2000~4000，口碑 -2——用利润买教训',
        effects: [
          { k: 'cash', op: '+', v: [2000, 4000] },
          { k: 'rep', op: '+', v: -2 }
        ],
        results: '竞品的报价被你压了下去。签合同时对方多看了一眼价目表：「下次别再改了。」'
      },
      {
        id: 'let-go',
        label: '放下：记进事故台账',
        hint: '情绪 -5——不是每一单都值得追',
        effects: [{ k: 'mood', op: '+', v: -5 }],
        results: '你在台账里写：「事故原因：报价版本错发。改进：人工终审。」然后去睡了这个月第一个整觉。'
      }
    ]
  },

  {
    id: 'ag-legalfin-misreport',
    title: '事故：报税漏了一笔服务收入',
    body: '法务财务智能体的月度自检弹窗：一笔 ¥8,400 的服务收入因发票抬头识别失败未计入申报。它按期报了税——报少了一笔。误报漏报会留下小额稽查残留，这类记录在系统里不会自己消失。',
    cat: 'ai',
    when: [['random', '<', 0]],
    weight: 25,
    cooldownDays: 5,
    choices: [
      {
        id: 'amend',
        label: '人工接管：更正申报，补税加滞纳金',
        hint: '现金 -1000~-2500，合规 +3——记录干干净净',
        effects: [
          { k: 'cash', op: '+', v: [-1000, -2500] },
          { k: 'compliance', op: '+', v: 3 },
          { k: 'creditScore', op: '+', v: 5 }
        ],
        results: '你跑了一趟电子税务局，更正、补缴、拿到回执。多花了四百块滞纳金，买断了这一页的风险。'
      },
      {
        id: 'next-quarter',
        label: '并入下季度一起报',
        hint: '合规 -2——金额小，记录先挂着',
        effects: [
          { k: 'compliance', op: '+', v: -2 },
          { k: 'stress', op: '+', v: 4 }
        ],
        results: '你在备忘录里写「下季度并报」。三个月后你忘了这件事，备忘录没有。'
      },
      {
        id: 'ignore-it',
        label: '忽略：这点金额没人查',
        hint: '合规 -4，压力 +6——稽查残留的种子',
        requires: 'system2',
        s1Variant: '八千块而已，谁看得见',
        effects: [
          { k: 'compliance', op: '+', v: -4 },
          { k: 'stress', op: '+', v: 6 }
        ],
        results: '弹窗被你关掉了。那 ¥8,400 在账外安静地躺着，像一颗定时器走得很慢的种子。'
      }
    ]
  },

  {
    id: 'ag-regagent-flaw',
    title: '事故：注册材料被打回，流程重来',
    body: '注册代办智能体提交的主体材料被打回：经营范围表述用了旧版模板，与最新规范差了一个版本号。流程回到第一步，你在等审批的第四天里什么都办不了——省下的 6-8 个 AP，此刻在连本带息地还。',
    cat: 'ai',
    when: [['random', '<', 0]],
    weight: 25,
    cooldownDays: 5,
    choices: [
      {
        id: 'manual-redo',
        label: '人工接管：自己重走一遍流程',
        hint: 'AP -2，现金 -800~-2000，压力 +4',
        effects: [
          { k: 'ap', op: '+', v: -2 },
          { k: 'cash', op: '+', v: [-800, -2000] },
          { k: 'stress', op: '+', v: 4 }
        ],
        results: '你对着最新规范逐项改写，第三次提交通过了。窗口的姐姐说：「每天都能碰到你们用机器填的。」'
      },
      {
        id: 'retry-agent',
        label: '让它再试一次',
        hint: '压力 +6，信息 +2——同一个模板可能再错一次',
        effects: [
          { k: 'stress', op: '+', v: 6 },
          { k: 'info', op: '+', v: 2 }
        ],
        results: '它改了两个字段又提交了。你盯着「审核中」三个字，第一次希望这次失败得快一点。'
      },
      {
        id: 'human-agent',
        label: '加急：找真人代办重交',
        hint: '现金 -1500~-3000，AP +1，压力 +2——花钱买确定性',
        effects: [
          { k: 'cash', op: '+', v: [-1500, -3000] },
          { k: 'ap', op: '+', v: 1 },
          { k: 'stress', op: '+', v: 2 }
        ],
        results: '老师傅收了钱，两小时后回微信：「过了。」你看着这条五个字的消息，觉得这钱花得像赎金。'
      }
    ]
  },

  // ============================================================
  // 三、Token 价格周期：4 条（priceIndex 落点 = tokenBill.priceIndex，S5 增量键 tokenPriceIndex）
  //     月账单 = Σ(base+perUnit×用量)×priceIndex（§8.2）；价格指数不归玩家管，只归市场管
  // ============================================================

  {
    id: 'token-drop-newmodel',
    title: '新模型发布：Token 打了六折',
    body: '某头部实验室的新模型把长文本价格打到了原先的 0.6 倍，三家二线厂商当晚跟降。你打开后台看了一眼本月账单，又看了一眼智能体的用量曲线——同样的活，进货价突然便宜了四成。价格指数：1.0 → 0.6。',
    cat: 'ai',
    when: [['day', '>=', 30], ['random', '<', 0.04]],
    weight: 8,
    cooldownDays: 45,
    newsDay: 8,
    choices: [
      {
        id: 'scale-up',
        label: '趁机放量：把降价的红利吃进规模',
        hint: 'priceIndex=0.6，认知 +2——单位经济重算一遍再动',
        effects: [
          { k: 'tokenPriceIndex', op: '=', v: 0.6 },
          { k: 'cognition', op: '+', v: 2 },
          { k: 'info', op: '+', v: 2 }
        ],
        results: '你把智能体用量整体上调一档。同样的账单，跑出了原来 1.6 倍的活。降价的红利是有保质期的。'
      },
      {
        id: 'hold-margin',
        label: '守毛利：价不动，利润落袋',
        hint: 'priceIndex=0.6，情绪 +3——先落袋的人先睡觉',
        effects: [
          { k: 'tokenPriceIndex', op: '=', v: 0.6 },
          { k: 'mood', op: '+', v: 3 }
        ],
        results: '报价没改。这个月毛利率凭空厚了一截，你把差额原样存进了公司账户。'
      },
      {
        id: 'study',
        label: '先研究：新模型能不能换掉旧管线',
        hint: 'priceIndex=0.6，信息 +3，压力 +2',
        effects: [
          { k: 'tokenPriceIndex', op: '=', v: 0.6 },
          { k: 'info', op: '+', v: 3 },
          { k: 'stress', op: '+', v: 2 }
        ],
        results: '你花两天把新模型的评测读了一遍。结论：管线该换了，但不是今天。'
      }
    ]
  },

  {
    id: 'token-rise-api',
    title: 'API 涨价：头部厂商统一上调 50%',
    body: '一封措辞礼貌的邮件：因「算力成本与模型能力升级」，主力模型 API 价格上调至 1.5 倍，下月生效。群里哀鸿遍野，有人晒出去年同样账单的对账单。价格指数：1.0 → 1.5。烧 Token 的生意，进货价从来不归你定。',
    cat: 'ai',
    when: [['day', '>=', 30], ['random', '<', 0.04]],
    weight: 8,
    cooldownDays: 45,
    choices: [
      {
        id: 'absorb',
        label: '自己扛：价不涨，利润瘦一圈',
        hint: 'priceIndex=1.5，口碑 +2，压力 +4',
        effects: [
          { k: 'tokenPriceIndex', op: '=', v: 1.5 },
          { k: 'rep', op: '+', v: 2 },
          { k: 'stress', op: '+', v: 4 }
        ],
        results: '你在客户群里发了公告：「成本我们消化。」点赞的人不少，续费的人照旧——但账本上那道口子是真的。'
      },
      {
        id: 'pass-through',
        label: '传导：报价同步上调',
        hint: 'priceIndex=1.5，项目 MRR ×1.1-1.2，口碑 -3',
        effects: [
          { k: 'tokenPriceIndex', op: '=', v: 1.5 },
          { k: 'projectMrr', op: '*', v: [1.1, 1.2] },
          { k: 'rep', op: '+', v: -3 }
        ],
        results: '价目表更新，三成客户抱怨，一成流失，剩下的把「上游涨价」四个字记在了你的账上。'
      },
      {
        id: 'switch-provider',
        label: '换供应商：迁到便宜的二线模型',
        hint: 'priceIndex=1.5，运营经验 +6，压力 +5——迁移有风险',
        effects: [
          { k: 'tokenPriceIndex', op: '=', v: 1.5 },
          { k: 'skillExp.operation', op: '+', v: 6 },
          { k: 'stress', op: '+', v: 5 }
        ],
        results: '你熬了两晚把管线迁到二线模型。评测集得分掉了 4 个点，账单掉了 35%——这笔交易划不划算，客户说了算。'
      }
    ]
  },

  {
    id: 'token-surge-throttle',
    title: '限流溢价：算力挤兑，价格指数翻倍',
    body: '新品发布引发算力挤兑，你用的接口开始按「拥堵系数」计费：同样的调用，账单 ×2.0。论坛里有人贴出对账单截图，标题是《我不是在用 AI，我是在给显卡还贷》。价格指数：→ 2.0。',
    cat: 'ai',
    when: [['day', '>=', 45], ['random', '<', 0.03]],
    weight: 7,
    cooldownDays: 60,
    choices: [
      {
        id: 'throttle-self',
        label: '自我限流：砍掉非核心调用',
        hint: 'priceIndex=2.0，压力 +4——保住单位经济',
        effects: [
          { k: 'tokenPriceIndex', op: '=', v: 2.0 },
          { k: 'stress', op: '+', v: 4 },
          { k: 'autoLevel', op: '+', v: -1 }
        ],
        results: '你把缓存加厚、把低价值调用砍掉一半。账单只涨了 20%——挤出的是水分，留下的是骨架。'
      },
      {
        id: 'grit',
        label: '硬吃：活不能停',
        hint: 'priceIndex=2.0，现金 -3000~-6000，压力 +8',
        effects: [
          { k: 'tokenPriceIndex', op: '=', v: 2.0 },
          { k: 'cash', op: '+', v: [-3000, -6000] },
          { k: 'stress', op: '+', v: 8 }
        ],
        results: '你盯着实时账单曲线处理业务，像看着出租车计价器在跳。这个月毛利是负的，你在为「不断供」付溢价。'
      },
      {
        id: 'pause-sell',
        label: '暂停接单：等价格回落',
        hint: 'priceIndex=2.0，情绪 -3，认知 +2——停下来也是决策',
        effects: [
          { k: 'tokenPriceIndex', op: '=', v: 2.0 },
          { k: 'mood', op: '+', v: -3 },
          { k: 'cognition', op: '+', v: 2 }
        ],
        results: '你把接单链接改成了「暂停」。挤兑总会过去，问题是你的跑道够不够长。'
      }
    ]
  },

  {
    id: 'token-reset-baseline',
    title: '算力扩产落地：价格回到基线',
    body: '新的数据中心投产后，拥堵系数取消，主流模型价格回到基线 1.0。论坛里那批晒账单的帖子下面，最新的回复是：「回来了，但我不想再烧了。」——价格会回来，信任未必。',
    cat: 'ai',
    when: [['day', '>=', 45], ['random', '<', 0.03]],
    weight: 7,
    cooldownDays: 60,
    choices: [
      {
        id: 'resume',
        label: '恢复全线：按原节奏重启管线',
        hint: 'priceIndex=1.0，压力 -3',
        effects: [
          { k: 'tokenPriceIndex', op: '=', v: 1.0 },
          { k: 'stress', op: '+', v: -3 }
        ],
        results: '停掉的调用一格格恢复。你在配置文件里加了一行注释：这次记得设预算上限。'
      },
      {
        id: 'lean-forward',
        label: '逆势扩张：别人怕了正是进场时',
        hint: 'priceIndex=1.0，信息 +3，压力 +4',
        effects: [
          { k: 'tokenPriceIndex', op: '=', v: 1.0 },
          { k: 'info', op: '+', v: 3 },
          { k: 'stress', op: '+', v: 4 }
        ],
        results: '你把这条新闻读成了买点：供给最松的时候，是试验新管线的最便宜窗口。'
      },
      {
        id: 'stay-lean',
        label: '保持精简：降配的习惯留着',
        hint: 'priceIndex=1.0，运营经验 +4，情绪 +2',
        effects: [
          { k: 'tokenPriceIndex', op: '=', v: 1.0 },
          { k: 'skillExp.operation', op: '+', v: 4 },
          { k: 'mood', op: '+', v: 2 }
        ],
        results: '账单回落了，砍掉的调用没有恢复。你发现精简后的管线照样能跑——有些浪费是涨价的馈赠。'
      }
    ]
  },

  // ============================================================
  // 四、猝死/过劳链：5 条（健康心理池；与 §7 三线互为叙事）
  // ============================================================

  {
    id: 'health-allnight-temptation',
    title: '通宵的诱惑：交付前夜的 11 点',
    body: '距离交付还有 9 个小时，进度条停在 62%。你泡了今天的第三杯咖啡（精力 {energy}/100），屏幕右下角弹出一个诚实的提醒：过去一周你有 4 天是扩展日。这单的钱（账上 {cash}）和这一夜的账，隐性疲劳替你分别记着——它不会提醒，只在深夜加一笔。',
    cat: 'health',
    when: [['day', '>=', 8], ['projectCount', '>=', 1]],
    weight: 9,
    cooldownDays: 12,
    choices: [
      {
        id: 'all-nighter',
        label: '熬通宵：一次干到天亮',
        hint: '隐性疲劳 +8~14，睡眠 -10，进度 +10~18',
        effects: [
          { k: 'hiddenFatigue', op: '+', v: [8, 14] },
          { k: 'sleep', op: '+', v: -10 },
          { k: 'projectProgress', op: '+', v: [10, 18] },
          { k: 'stress', op: '+', v: 5 }
        ],
        results: '早晨六点，进度条停在 97%。你在椅子上睡了两个小时，醒来时嘴里发苦，交付倒是赶上了。'
      },
      {
        id: 'sleep-first',
        label: '定闹钟：睡 5 小时再收尾',
        hint: '睡眠 +5，压力 -2——进度换来的部分是命',
        effects: [
          { k: 'sleep', op: '+', v: 5 },
          { k: 'stress', op: '+', v: -2 },
          { k: 'hiddenFatigue', op: '+', v: 2 }
        ],
        results: '闹钟响的时候你居然是清醒的。最后 38% 用了四个小时，质量比通宵版好——你检查出了两处白天没看出的错误。'
      },
      {
        id: 'cut-scope',
        label: '砍范围：跟客户坦白改期一半',
        hint: '现金 -500，品性 +2，隐性疲劳不涨——诚实也要成本',
        effects: [
          { k: 'cash', op: '+', v: -500 },
          { k: 'character', op: '+', v: 2 }
        ],
        results: '你写了三版措辞才发出去。客户回：「延期可以，违约金按约定扣。」你算了算，比通宵便宜。'
      }
    ]
  },

  {
    id: 'health-checkup-hint',
    title: '体检建议：日历上那张作废的预约',
    body: '你在日历里翻到三个月前建的一条提醒：「去做个体检」，状态是已跳过。最近爬三楼要歇一次，心率表上的静息值比去年高 11。你的隐性疲劳攒了多少，只有两样东西知道：体检单，和身体。',
    cat: 'health',
    when: [['day', '>=', 20], ['stress', '>=', 45]],
    weight: 8,
    cooldownDays: 30,
    choices: [
      {
        id: 'full-checkup',
        label: '去体检：全套，带报告那种',
        hint: '现金 -300~-800，解锁隐性疲劳精确读数',
        effects: [
          { k: 'cash', op: '+', v: [-300, -800] },
          { k: 'flag.fatigueKnown', op: '=', v: 1 },
          { k: 'info', op: '+', v: 3 }
        ],
        results: '报告出来：两项临界，一项超标。数字不好看，但你终于知道自己欠了多少——精确读数已解锁。'
      },
      {
        id: 'basic-checkup',
        label: '只做个基础套餐',
        hint: '现金 -150，信息 +2——便宜的信息有盲区',
        effects: [
          { k: 'cash', op: '+', v: -150 },
          { k: 'info', op: '+', v: 2 }
        ],
        results: '血压、血常规、心电图，四十分钟完事。医生说「还行」，你追问「还行是多少」，他说「仪器上都有」。'
      },
      {
        id: 'skip-again',
        label: '再等等：忙完这阵就去',
        hint: '压力 +3——「这阵」是健康线的经典句式',
        effects: [{ k: 'stress', op: '+', v: 3 }],
        results: '你把提醒拖到了下个月。日历很宽容，它不催你，它只记录。'
      }
    ]
  },

  {
    id: 'health-family-call',
    title: '妈妈的电话：「你那边，几点天黑？」',
    body: '晚上十一点半，妈妈的电话打进来，第一句不是「吃了吗」，是「你王姨的儿子最近也是自己干，头发白了一半」。你想说我很好，喉咙里却先出来了「最近有点忙」。她沉默了两秒：「忙，能比身体还忙？」',
    cat: 'health',
    when: [['day', '>=', 15], ['or', [['stress', '>=', 50], ['energy', '<=', 35]]]],
    weight: 9,
    cooldownDays: 20,
    choices: [
      {
        id: 'tell-truth',
        label: '说实话：最近确实在硬撑',
        hint: '情绪 +6，压力 -6，品性 +2——说出来的那一刻轻了一半',
        effects: [
          { k: 'mood', op: '+', v: 6 },
          { k: 'stress', op: '+', v: -6 },
          { k: 'character', op: '+', v: 2 }
        ],
        results: '你说了。电话那头安静了几秒，然后她说：「妈不懂你那个什么指数，妈就问你一句——今晚几点睡？」你说十二点前。你说到做到。'
      },
      {
        id: 'white-lie',
        label: '报喜不报忧：挺好的，别担心',
        hint: '压力 +4，情绪 -2——谎不重，但每天都背',
        effects: [
          { k: 'stress', op: '+', v: 4 },
          { k: 'mood', op: '+', v: -2 }
        ],
        results: '你说挺好的，项目顺，吃得好。挂了电话，泡面刚好泡好——你看着它，没觉得饿。'
      },
      {
        id: 'argue',
        label: '吵一架：「你根本不懂我在做什么」',
        hint: '情绪 -8，压力 +8——两边的账都变厚',
        effects: [
          { k: 'mood', op: '+', v: -8 },
          { k: 'stress', op: '+', v: 8 }
        ],
        results: '话说重了。她最后说「那你忙吧」，声音很轻。你盯着屏幕上的进度条，忽然不知道自己在赶什么。'
      }
    ]
  },

  {
    id: 'health-hardstreak-mark',
    title: '连续硬撑的第 N 天',
    body: '你数了数日历：连续第 6 天扩展日，第 4 天靠咖啡开机。心悸预警的标记还挂在状态页上——那是身体盖的章。今天有一笔尾款到账 2,400，你在收款提示音里第一次听出了别的意思：这是计件工资的响法。',
    cat: 'health',
    when: [['day', '>=', 8], ['flag', 'heartAttackWarn']],
    weight: 10,
    cooldownDays: 8,
    choices: [
      {
        id: 'brake',
        label: '踩刹车：今天只做最低限度',
        hint: '隐性疲劳 -10~-16，清预警标记，睡眠 +6',
        effects: [
          { k: 'hiddenFatigue', op: '+', v: [-10, -16] },
          { k: 'flag.heartAttackWarn', op: '=', v: 0 },
          { k: 'sleep', op: '+', v: 6 }
        ],
        results: '你把日型切到最低日，处理了三封邮件就合上电脑。傍晚下楼散步时你发现，街边的树已经绿了——不知道绿了几天。'
      },
      {
        id: 'accelerate',
        label: '继续踩油门：尾款还在后面',
        hint: '现金 +1000~2500，隐性疲劳 +6~12，标记保留',
        requires: 'system2',
        s1Variant: '就这几天了，扛完这阵',
        effects: [
          { k: 'cash', op: '+', v: [1000, 2500] },
          { k: 'hiddenFatigue', op: '+', v: [6, 12] },
          { k: 'flag.heartAttackWarn', op: '=', v: 1 }
        ],
        results: '你把手头的活干到了凌晨一点。收款计划表上还有两笔尾款——身体给你的宽限，不知道还剩几天。'
      }
    ],
    oldZhang: '连续硬撑第七天。身体不催债，它只记账，一次结清。'
  },

  {
    id: 'health-peer-death',
    title: '圈内消息：认识的人停在了周三',
    body: '独立开发社群置顶了一条讣告：某位有一面之缘的开发者，周二晚突发心梗，35 岁。最后一条动态是凌晨两点发的版本更新日志，评论区第一条是「帮我把这个版本维护完」。没人再往下接话。',
    cat: 'health',
    when: [['day', '>=', 40]],
    weight: 7,
    once: true,
    choices: [
      {
        id: 'attend',
        label: '去送最后一程',
        hint: '情绪 -6，品性 +4——有些事要人到现场',
        effects: [
          { k: 'mood', op: '+', v: -6 },
          { k: 'character', op: '+', v: 4 }
        ],
        results: '追悼会来了很多没见过面的网友。你排队鞠躬时想起自己也有 40 多个没合过PR的仓库。回家路上你把日型改成了标准日。'
      },
      {
        id: 'repost',
        label: '默默转发讣告，配了一行字',
        hint: '情绪 -4，压力 +2',
        effects: [
          { k: 'mood', op: '+', v: -4 },
          { k: 'stress', op: '+', v: 2 }
        ],
        results: '你配的字是：「他更新到了最后。」发完你盯着自己的后台看了很久，那里面也有一行凌晨两点的时间戳。'
      },
      {
        id: 'close-tab',
        label: '关掉页面，继续干活',
        hint: '情绪 -3，压力 +6——屏幕的光不会替你难过',
        effects: [
          { k: 'mood', op: '+', v: -3 },
          { k: 'stress', op: '+', v: 6 }
        ],
        results: '你关掉页面，写完了手头的函数。那天夜里你醒了一次，不知道为什么，摸了摸自己的心跳。'
      }
    ],
    oldZhang: '四月的事刚过去半年。黑屏之后没有下一行。'
  },

  // ============================================================
  // 五、平台政策：8 条（crisis-ai-crackdown 为 S3 引擎测试基准事件，结构不可改动）
  // ============================================================

  {
    id: 'crisis-ai-crackdown',
    title: '平台开始清查未声明 AI 内容',
    body: '你刷到官方公告：即日起对未声明 AI 生成的内容进行限流与处罚。评论区已经有人在小红书晒出被封的截图——你看了眼自己的账号，粉丝 {followers} 人，压力 {stress}/100，这条公告跟你有关。',
    cat: 'platform',
    when: [], // S3 抽样基准：无门槛事件，让任何状态都可能抽到（day1 池成员）
    weight: 7,
    cooldownDays: 10,
    newsDay: 15,
    choices: [
      {
        id: 'declare',
        label: '补声明：把 AI 标识都补上',
        hint: '合规加分，流量短期受损',
        s1Variant: '先补标识再说',
        effects: [{ k: 'compliance', op: '+', v: 4 }, { k: 'followers.bilili', op: '+', v: -30 }],
        results: '你把所有内容补上了 AI 标识。流量掉了一截，但账号安全了。慢就是快。'
      },
      {
        id: 'hide',
        label: '赌一把：声明先不补',
        hint: '谐音变体只会加重处罚',
        requires: 'system2',
        s1Variant: '硬刚：法不责众',
        effects: [{ k: 'cash', op: '+', v: -500 }, { k: 'stress', op: '+', v: 10 }],
        results: '你心存侥幸地发了下一条。罚款单和心惊肉跳，总有一个先到——这次是罚款。'
      },
      {
        id: 'walkaway',
        label: '取消：先什么都不做',
        effects: [],
        results: '你把公告划走了。公告不会因为你划走就失效。'
      }
    ],
    oldZhang: '平台的镰刀永远先割最会绕规则的人。'
  },

  {
    id: 'platform-algo-shift',
    title: '算法改版：推荐池一夜换了口味',
    body: '你常发的那类内容曝光腰斩——平台算法改版，完播率权重上调，标题党全面降权。数据群里分两派：一派连夜研究新规则，一派嚷着「流量越不可控，越要做私域」。你看着自己 {followers} 粉的后台曲线换了斜率，现金 {cash}，跑道 {runway} 个月。',
    cat: 'platform',
    when: [['day', '>=', 10]],
    weight: 8,
    cooldownDays: 30,
    choices: [
      {
        id: 'private',
        label: '转私域：把人沉淀到公众号',
        hint: '公众号粉 +50~150，私域化率起步 0.3，AP -1',
        effects: [
          { k: 'followers.wechat', op: '+', v: [50, 150] },
          { k: 'flag.privateDomain', op: '=', v: 0.3 },
          { k: 'ap', op: '+', v: -1 }
        ],
        results: '你在每条内容末尾加了「防失联」入口，一周进了三百多人。封号风险没变，但你有了退路。'
      },
      {
        id: 'chase',
        label: '硬扛：追新规则做爆款',
        hint: '营销经验 +6，抖音粉 +80~200，压力 +5',
        effects: [
          { k: 'skillExp.marketing', op: '+', v: 6 },
          { k: 'followers.douyin', op: '+', v: [80, 200] },
          { k: 'stress', op: '+', v: 5 }
        ],
        results: '你把十条旧内容按新规则重剪，第三条进了小推荐池。规则还会再改——你知道，下次还得重来。'
      },
      {
        id: 'observe',
        label: '减产观察：先看清再动手',
        hint: '信息 +4，抖音粉 -40——观察期的流量是真的会掉',
        effects: [
          { k: 'info', op: '+', v: 4 },
          { k: 'followers.douyin', op: '+', v: -40 }
        ],
        results: '你把更新频率砍半，每周只复盘数据。两周后你摸清了新算法的三条偏好，代价是掉了几百粉。'
      }
    ]
  },

  {
    id: 'platform-new-redocean',
    title: '红利期：视频号开始猛推新人',
    body: '视频号宣布「新星扶持计划」：前 90 天流量加权，分成上浮 20%。数据群里已经有人晒出「发什么都有量」的后台截图。红利期的窗口从来不打招呼地开，也不打招呼地关——进不进，什么时候进，都是决策。',
    cat: 'platform',
    when: [['day', '>=', 15]],
    weight: 7,
    cooldownDays: 40,
    choices: [
      {
        id: 'all-in',
        label: '全力进场：三十天日更冲扶持期',
        hint: '公众号粉 +150~400，AP -2，压力 +8——红利是真，卷也是真',
        effects: [
          { k: 'followers.wechat', op: '+', v: [150, 400] },
          { k: 'ap', op: '+', v: -2 },
          { k: 'stress', op: '+', v: 8 }
        ],
        results: '第 11 天，你有一条内容被推进了大流量池。第 30 天扶持结束，曲线回落——但你已经攒下第一批真实关注。'
      },
      {
        id: 'probe',
        label: '小规模试水：一鱼两吃过去',
        hint: '公众号粉 +30~80，AP -1，压力 +2',
        effects: [
          { k: 'followers.wechat', op: '+', v: [30, 80] },
          { k: 'ap', op: '+', v: -1 },
          { k: 'stress', op: '+', v: 2 }
        ],
        results: '你把现成内容剪成竖版顺手发过去，两周后数据平平。红利不是为顺手的人开的，你认。'
      },
      {
        id: 'wait-out',
        label: '只看不动：红利的另一面是内卷',
        hint: '信息 +4，认知 +2——错过风口也是一种仓位',
        effects: [
          { k: 'info', op: '+', v: 4 },
          { k: 'cognition', op: '+', v: 2 }
        ],
        results: '两个月后扶持期结束，群里晒收益的帖子少了，晒「掉粉」的多了。你没赚，也没接盘。'
      }
    ]
  },

  {
    id: 'platform-homophone-crackdown',
    title: '谐音变体失效：平台的惩罚开始加权',
    body: '平台公告更新：「通过谐音、变体、拆字规避审核的，按原违规加重处罚。」你收藏夹里那篇《极限词谐音对照表》一夜之间变成了反面教材。检测模型升级的速度，永远快过对照表的更新速度。',
    cat: 'platform',
    when: [['day', '>=', 12], ['platform', 'xhs', 'banRisk>=', 20]],
    weight: 8,
    cooldownDays: 25,
    newsDay: 15,
    choices: [
      {
        id: 'fix-all',
        label: '全部改正：违禁词逐条替换',
        hint: '合规 +4，小红书粉 -60——账面难看，账号干净',
        effects: [
          { k: 'compliance', op: '+', v: 4 },
          { k: 'followers.xhs', op: '+', v: -60 }
        ],
        results: '你把 20 条内容的「最」「第一」「根治」全数替换，重发后曝光平平。但风控名单里，你的账号往后挪了几位。'
      },
      {
        id: 'homophone',
        label: '换更隐蔽的谐音继续',
        hint: 'flag.homophone 置位：banRisk 累积 +1.5/次，玩家可读的倒计时',
        requires: 'system2',
        s1Variant: '新谐音他们还没录进去',
        effects: [
          { k: 'flag.homophone', op: '=', v: 1 },
          { k: 'followers.xhs', op: '+', v: [20, 60] },
          { k: 'stress', op: '+', v: 6 }
        ],
        results: '新写法确实绕过了第一轮检测，数据还涨了点。你把对照表又加密了一层——你知道自己在跟谁赛跑。'
      },
      {
        id: 'migrate',
        label: '迁移阵地：把敏感品类搬到自有渠道',
        hint: '公众号粉 +60~140，AP -1——走，别赌',
        effects: [
          { k: 'followers.wechat', op: '+', v: [60, 140] },
          { k: 'ap', op: '+', v: -1 }
        ],
        results: '你在公众号开了新栏目，老粉丝留言跟着过去了。平台的规则你改不了，自己的地盘不用谐音。'
      }
    ],
    oldZhang: '平台的镰刀永远先割最会绕规则的人。'
  },

  {
    id: 'platform-dependency-siren',
    title: '依赖警报：一个平台占了你七成收入',
    body: '月度收入构成图上，一个平台的柱子高得刺眼：占比 70%。后台的提示你早就见过——单平台收入占比超 60%，风控事件概率 ×3。你每个月都在想「要分散一下」，每个月都有更急的事。粉丝 {followers} 人押在一个不改你名字的算法上，跑道 {runway} 个月。',
    cat: 'platform',
    when: [['day', '>=', 20], ['or', [['platform', 'xhs', 'banRisk>=', 30], ['platform', 'douyin', 'banRisk>=', 30]]]],
    weight: 8,
    cooldownDays: 30,
    choices: [
      {
        id: 'build-site',
        label: '起独立站：三天，先丑后改',
        hint: '现金 -1500~-3000，AP -2，独立站粉 +50~120，私域化起步',
        effects: [
          { k: 'cash', op: '+', v: [-1500, -3000] },
          { k: 'ap', op: '+', v: -2 },
          { k: 'followers.site', op: '+', v: [50, 120] },
          { k: 'flag.privateDomain', op: '=', v: 0.3 }
        ],
        results: '网站很丑，但域名是你的，备案是你的，第一批 80 个订阅者也是你的。没有平台能封你的号。'
      },
      {
        id: 'divert',
        label: '备份导流：给公众号装安全阀',
        hint: '公众号粉 +80~160，AP -1',
        effects: [
          { k: 'followers.wechat', op: '+', v: [80, 160] },
          { k: 'ap', op: '+', v: -1 }
        ],
        results: '你把「防走失入口」做成了固定栏目。两个月后主平台真限流了一次，公众号进账替你垫了一个月房租。'
      },
      {
        id: 'ignore-siren',
        label: '置之不理：拉满一平台更赚钱',
        hint: '压力 +6，情绪 -3——警报关掉，风险并没有',
        effects: [
          { k: 'stress', op: '+', v: 6 },
          { k: 'mood', op: '+', v: -3 }
        ],
        results: '你把提示关掉了。收入确实又涨了一截，只是每次后台卡一下，你的心跳都会先卡一下。'
      }
    ]
  },

  {
    id: 'platform-xhs-throttlewave',
    title: '限流潮：整个品类都在掉曝光',
    body: '小红书这一波限流潮已经持续五天：你的曝光掉了 60%，同品类的博主在群里接龙，最低的掉了 85%。官方口径是「生态治理」，没人知道规则，只知道大家都在掉——这种时候，动作比理由重要。',
    cat: 'platform',
    when: [['day', '>=', 18], ['platform', 'xhs', 'banRisk>=', 15]],
    weight: 8,
    cooldownDays: 25,
    newsDay: 200,
    choices: [
      {
        id: 'pause-week',
        label: '停更一周：让账号「冷」过去',
        hint: '小红书粉 -80，压力 -3——以退为进',
        effects: [
          { k: 'followers.xhs', op: '+', v: -80 },
          { k: 'stress', op: '+', v: -3 }
        ],
        results: '你停更了七天。第八天恢复更新，曝光只回到原来的六成——但至少没有再掉。潮水退去时，少站着的人少湿身。'
      },
      {
        id: 'keep-posting',
        label: '照发：赌自己不是那批被盯的',
        hint: '小红书粉 -120~-260，压力 +6——潮水里逆行',
        effects: [
          { k: 'followers.xhs', op: '+', v: [-120, -260] },
          { k: 'stress', op: '+', v: 6 }
        ],
        results: '五天发了四条，三条曝光三位数。第四条被「待审核」卡了 48 小时——你成了潮水的一部分。'
      },
      {
        id: 'zhihu-shift',
        label: '转知乎：把选题改成长文',
        hint: '知乎粉 +60~140，AP -1——流量走了，内容还在',
        effects: [
          { k: 'followers.zhihu', op: '+', v: [60, 140] },
          { k: 'ap', op: '+', v: -1 }
        ],
        results: '你把最近的爆款拆成了长文投知乎，两条进了推荐。慢平台没有潮水，只有坡。'
      }
    ]
  },

  {
    id: 'platform-site-seo',
    title: 'SEO/GEO 崛起：搜索流量在悄悄换入口',
    body: '你注意到一个变化：后台来源里，「直接访问」和「搜索」占比首次超过 40%——AI 搜索开始给你的独立站带量，尽管它引用的方式连链接都不给。有 SEO 服务商开价 ¥8,000/月做「GEO 优化」：让 AI 在回答里提到你。',
    cat: 'platform',
    when: [['day', '>=', 30], ['flag', 'privateDomain']],
    weight: 6,
    cooldownDays: 40,
    newsDay: 150,
    choices: [
      {
        id: 'invest-seo',
        label: '加投内容 SEO：把长尾问题写透',
        hint: '现金 -1000~-2500，独立站粉 +100~250，信息 +3',
        effects: [
          { k: 'cash', op: '+', v: [-1000, -2500] },
          { k: 'followers.site', op: '+', v: [100, 250] },
          { k: 'info', op: '+', v: 3 }
        ],
        results: '你挑了 20 个长尾问题逐个写透。三个月后，五篇占了搜索首页——慢流量不刺激，但它没有老板。'
      },
      {
        id: 'learn-geo',
        label: '自学 GEO：给内容喂结构化答案',
        hint: '运营经验 +8，认知 +3——不花钱，花脑子',
        effects: [
          { k: 'skillExp.operation', op: '+', v: 8 },
          { k: 'cognition', op: '+', v: 3 }
        ],
        results: '你把 FAQ 改成问答对、加了数据表格和出处。一个月后 AI 搜索开始引用你的段落——虽然不太注明出处。'
      },
      {
        id: 'skip-trend',
        label: '不追：流量玄学一年一换',
        hint: '情绪 +2——注意力是最贵的 token',
        effects: [{ k: 'mood', op: '+', v: 2 }],
        results: '你没动。手头的项目按计划推进——每一个风口面前，按兵不动也是一种仓位管理。'
      }
    ]
  },

  {
    id: 'platform-subsidy-run',
    title: '平台补贴活动：冲榜还是不冲',
    body: '平台年中活动开放报名：冲进品类榜前 50，流量包 + 现金补贴最高 ¥5,000。规则页写着「日更加成 ×2」。你算了算：冲榜意味着两周高强度更新，不冲意味着把位置让给同行。',
    cat: 'platform',
    when: [['day', '>=', 20]],
    weight: 7,
    cooldownDays: 45,
    choices: [
      {
        id: 'solo-rush',
        label: '单干冲榜：两周日更冲刺',
        hint: 'AP -2，抖音粉 +150~400，现金 +500~1500，压力 +6',
        effects: [
          { k: 'ap', op: '+', v: -2 },
          { k: 'followers.douyin', op: '+', v: [150, 400] },
          { k: 'cash', op: '+', v: [500, 1500] },
          { k: 'stress', op: '+', v: 6 }
        ],
        results: '你最后排在第 47 名，补贴 ¥1,200 到账，粉丝涨了一千三。冲完那天你睡了十一个小时。'
      },
      {
        id: 'team-up',
        label: '组队冲：和两个同行互推',
        hint: '人脉 +1，抖音粉 +100~250——蛋糕一起做大',
        effects: [
          { k: 'contacts', op: '+', v: 1 },
          { k: 'followers.douyin', op: '+', v: [100, 250] }
        ],
        results: '三人小组互相导流，都没进前 50，但彼此的粉丝池通了。榜单结束了，搭伙的日子还在继续。'
      },
      {
        id: 'sit-out',
        label: '不掺和：补贴是平台的钩子',
        hint: '情绪 +2——省下的力气是你的',
        effects: [{ k: 'mood', op: '+', v: 2 }],
        results: '活动结束那天，你在群里看到有人晒排名，有人晒失眠。你把省下的两周用在了那个拖了两个月的改版上。'
      }
    ]
  },

  // ============================================================
  // 六、灰产线：8 条（中转站 3 + 代充 2 + 清算连锁 3；§9.6 短多长空骨架）
  //     灰产在场判定用 ['gray',true]（grayHistory，立项 apiRelay 永久记录）
  // ============================================================

  {
    id: 'gray-relay-lead',
    title: '群里的生意：「API 额度 55 折收，量大优」',
    body: '开发者群里有人报价：原价 ¥2,000 的 API 额度，账号特价 ¥1,100 出，走虚拟商品链接，「懂的都懂」。底下已经有 17 个人问「还有吗」。你算了一眼差价：毛利 45% 起，比你现在任何一单都高——尤其是账上只剩 {cash} 的时候，这个数字格外刺眼。',
    cat: 'opportunity',
    when: [['day', '>=', 20], ['not', ['gray', true]], ['stage', '>=', 2]],
    weight: 6,
    once: true,
    choices: [
      {
        id: 'dig-deeper',
        label: '深入打听：把链路摸清楚',
        hint: '信息 +4，14 天内立项「Token 中转站」则 14 天后进入放量事件',
        effects: [{ k: 'info', op: '+', v: 4 }],
        chain: [{ event: 'gray-relay-scale', delayDays: 14, ifCond: [['gray', true]] }],
        results: '你顺着线摸到了上游：账号池、换号工具、三级分销。逻辑闭环，风险也闭环——都写在别人看不见的地方。'
      },
      {
        id: 'decline',
        label: '退出群聊：眼不见为净',
        hint: '道德 +2——有些群退了就别再看',
        effects: [{ k: 'morality', op: '+', v: 2 }],
        results: '你退了群。世界安静了一点，钱少了一条来路，也少了一条去路。'
      },
      {
        id: 'report',
        label: '向平台举报该账号',
        hint: '道德 +5，压力 +2——正义有时效，也有人身风险',
        effects: [
          { k: 'morality', op: '+', v: 5 },
          { k: 'stress', op: '+', v: 2 }
        ],
        results: '你提交了举报材料。一周后那个账号消失了，群里换了新暗号。你不知道自己拦住了什么，但你知道自己没变成什么。'
      }
    ],
    oldZhang: '这单毛利六成。剩下四成，是给将来的稽查预留的。'
  },

  {
    id: 'gray-relay-scale',
    title: '放量抉择：中转站月流水过了五万',
    body: '中转站跑起来了：月流水 ¥52,000，毛利 ¥23,000，三个老客户每周固定补货。上游承诺「账号稳定」，但你知道那句话的保质期取决于风控的心情。摆在面前的问题是：放量，还是稳住，还是趁客户还在出手？',
    cat: 'opportunity',
    when: [['day', '>=', 8], ['gray', true]],
    weight: 8,
    cooldownDays: 20,
    choices: [
      {
        id: 'aggressive',
        label: '放量：再吞两百个额度，冲月流水十万',
        hint: '现金 +6000~12000，合规 -6，道德 -8，21 天后掷「上游封号」',
        effects: [
          { k: 'cash', op: '+', v: [6000, 12000] },
          { k: 'compliance', op: '+', v: -6 },
          { k: 'morality', op: '+', v: -8 }
        ],
        chain: [{ event: 'gray-relay-crash', delayDays: 21, ifCond: [['gray', true]] }],
        results: '你把家底压了上去，流水冲到六位数。库存表很壮观——前提是上游的账号池明天还在。'
      },
      {
        id: 'steady',
        label: '稳住：老客户的量，一单不多接',
        hint: '现金 +2500~5000，合规 -3，道德 -4——细水不一定长流',
        effects: [
          { k: 'cash', op: '+', v: [2500, 5000] },
          { k: 'compliance', op: '+', v: -3 },
          { k: 'morality', op: '+', v: -4 }
        ],
        results: '你回绝了两个新客户。上游那边若隐若现的封号传闻，让你每晚睡前多刷一次后台。'
      },
      {
        id: 'exit-clean',
        label: '收手：趁账面干净转售退出',
        hint: '道德 +4，压力 -2——有人接盘，才叫及时',
        effects: [
          { k: 'morality', op: '+', v: 4 },
          { k: 'stress', op: '+', v: -2 }
        ],
        results: '你把客户名单打包卖了 ¥18,000。接盘的人很高兴，你也高兴——只是这份高兴不敢发朋友圈。'
      }
    ]
  },

  {
    id: 'gray-relay-crash',
    title: '上游封号：库存一夜归零',
    body: '凌晨两点十七分，上游的最后一批账号被风控批量封禁。你手里价值 ¥60,000 的额度瞬间变成一堆登录失败的截图。客户群已经开始问「怎么充值失败」。库存归零，负债表没归零——你收的是预付款。',
    cat: 'crisis',
    when: [['random', '<', 0]], // 连锁定向入队（gray-relay-scale 放量连锁）
    weight: 30,
    choices: [
      {
        id: 'refund-close',
        label: '认赔：全额退款，注销关门',
        hint: '现金 -8000~-15000，道德 +2——狼狈但干净',
        effects: [
          { k: 'cash', op: '+', v: [-8000, -15000] },
          { k: 'stress', op: '+', v: 8 },
          { k: 'morality', op: '+', v: 2 }
        ],
        results: '你把预付款一笔笔退了回去，最后一条群公告是「中转站停止运营」。有人骂，有人沉默，没人知道你垫了多少。'
      },
      {
        id: 'new-upstream',
        label: '换上游再战：拆东墙补西墙',
        hint: '现金 -4000~-8000，压力 +10，15 天后掷稽查清算',
        effects: [
          { k: 'cash', op: '+', v: [-4000, -8000] },
          { k: 'stress', op: '+', v: 10 }
        ],
        chain: [{ event: 'gray-clearing-audit', delayDays: 15, ifCond: [['gray', true]] }],
        results: '你连夜换了新上游，价格贵了 12 个点，账号来路更模糊了。窟窿补上了——用另一个更深的窟窿。'
      },
      {
        id: 'whitewash',
        label: '洗白：注销灰产线，成本是利润的六成',
        hint: '现金 -10000~-16000，道德 +6，合规 +4，10 天后道德清算',
        effects: [
          { k: 'cash', op: '+', v: [-10000, -16000] },
          { k: 'morality', op: '+', v: 6 },
          { k: 'compliance', op: '+', v: 4 }
        ],
        chain: [{ event: 'gray-clearing-moral', delayDays: 10 }],
        results: '你补缴了税、注销了收款通道、把站点下线。亏的钱买了同一句话：不敢报税的钱不算收入，算倒计时。'
      }
    ],
    oldZhang: '上游一封号，库存就归零。这生意没有复利，只有倒计时。'
  },

  {
    id: 'gray-topup-lead',
    title: '代充的快钱：「会员 6 折，日结」',
    body: '老同学发来私信：帮人代充海外 AI 会员，走黑卡和共享账号，一单抽 15%，日结，「我上个月靠这个多赚了一万二」。你搜了搜：这生意 2026 年已经很成规模，成规模的另一层意思是——出事的时候也很有规模。',
    cat: 'opportunity',
    when: [['day', '>=', 25], ['cash', '<', 8000]],
    weight: 7,
    once: true,
    choices: [
      {
        id: 'take-orders',
        label: '接单：先赚三个月再说',
        hint: '现金 +5000~9000，道德 -8，合规 -5，14 天后清算必到',
        effects: [
          { k: 'cash', op: '+', v: [5000, 9000] },
          { k: 'morality', op: '+', v: -8 },
          { k: 'compliance', op: '+', v: -5 }
        ],
        chain: [{ event: 'gray-topup-settle', delayDays: 14 }],
        results: '第一周你出了 23 单，收款提示音响得像音乐。你没细想那些账号是哪来的——细想就做不下去了。'
      },
      {
        id: 'refuse',
        label: '拒绝：「你这个我不碰」',
        hint: '道德 +3——老同学会说你装，但你睡得着',
        effects: [{ k: 'morality', op: '+', v: 3 }],
        results: '你回了一句「不碰这个」。对面发来一个「呵呵」。三个月后他的朋友圈停更了，你没去问原因。'
      },
      {
        id: 'study-only',
        label: '只研究：写一篇代充产业链分析',
        hint: '信息 +3，表达经验 +6——把别人的灰产变成你的白产',
        effects: [
          { k: 'info', op: '+', v: 3 },
          { k: 'skillExp.expression', op: '+', v: 6 }
        ],
        results: '你采访了三个从业者（匿名），写成一篇两万字拆解。文章爆了——原来「别碰」也能是流量。'
      }
    ]
  },

  {
    id: 'gray-topup-settle',
    title: '清算：客户账号被封，集体索赔',
    body: '上游黑卡源头被端，波及你手上 61 个代充客户：会员一夜失效，有人充的是年费。客户群里已经接龙到第 38 楼，有人晒出付款记录，有人@了平台官方，有人只写了四个字：「律师函见」。你收到了 ¥41,000 的预付款——都在。',
    cat: 'crisis',
    when: [['random', '<', 0]], // 连锁定向入队（gray-topup-lead）
    weight: 30,
    choices: [
      {
        id: 'compensate',
        label: '自认赔付：按原价退，认亏',
        hint: '现金 -8000~-14000，道德 +4，压力 +8——账清，人累',
        effects: [
          { k: 'cash', op: '+', v: [-8000, -14000] },
          { k: 'morality', op: '+', v: 4 },
          { k: 'stress', op: '+', v: 8 }
        ],
        results: '你把 61 笔退款一笔笔打了回去，备注都写了「抱歉」。第 59 笔打完，你在转账记录里看到自己这三个月的整个夏天。'
      },
      {
        id: 'run-away',
        label: '跑路：删好友，注销收款码',
        hint: '道德 -12，口碑 -8，20 天后法律冻结清算',
        requires: 'system2',
        s1Variant: '反正都是网名，谁找得到谁',
        effects: [
          { k: 'morality', op: '+', v: -12 },
          { k: 'rep', op: '+', v: -8 }
        ],
        chain: [{ event: 'gray-clearing-legal', delayDays: 20 }],
        results: '你卸载了那个聊天软件。号码还是那个号码，实名还是那个实名——你以为删掉的是好友，其实删不掉的是记录。'
      },
      {
        id: 'stall',
        label: '拖着：「上游跑了我也是受害者」',
        hint: '压力 +10，25 天后稽查清算',
        effects: [{ k: 'stress', op: '+', v: 10 }],
        chain: [{ event: 'gray-clearing-audit', delayDays: 25 }],
        results: '你把群设了免打扰。有人开始整理证据链，有人已经开始催平台。「受害者」这个身份，法庭上也要验资。'
      }
    ]
  },

  {
    id: 'gray-clearing-legal',
    title: '法律冻结：早上八点，银行卡刷不了',
    body: '早餐店扫码失败，第二条银行短信告诉你为什么：账户因涉嫌违规资金往来被临时冻结，配合调查请备齐流水。你想起那笔不敢报税的钱——它一直都在，只是今天才开始要利息。灰产收入不敢报税，合规从此见不得光。',
    cat: 'crisis',
    when: [['random', '<', 0]], // 连锁定向入队（灰产清算链）
    weight: 30,
    choices: [
      {
        id: 'cooperate',
        label: '配合调查：补税、退赔、换回干净账户',
        hint: '现金 -12000~-25000，合规 +5，道德 +3——账户保住',
        effects: [
          { k: 'cash', op: '+', v: [-12000, -25000] },
          { k: 'compliance', op: '+', v: 5 },
          { k: 'morality', op: '+', v: 3 },
          { k: 'flag.legalFrozen', op: '=', v: 0 }
        ],
        results: '律师、补税、三次笔录。两周后账户解冻，余额比你觉得的少——但从此每一块钱都有名有姓。'
      },
      {
        id: 'resist',
        label: '咬牙硬扛：找关系「捞」卡',
        hint: 'flag.legalFrozen 置位：法律冻结结局，现金 -20000~-35000',
        requires: 'system2',
        s1Variant: '总会有办法的',
        effects: [
          { k: 'flag.legalFrozen', op: '=', v: 1 },
          { k: 'cash', op: '+', v: [-20000, -35000] },
          { k: 'stress', op: '+', v: 15 }
        ],
        results: '「朋友」收了钱说在办。第三周你的第二张卡也冻了。灰色的钱来得快——它去的时候，从来不提前打招呼。'
      }
    ]
  },

  {
    id: 'gray-clearing-audit',
    title: '稽查上门：这一次是拿着清单来的',
    body: '稽查人员出示了证件和一份清单：过去 14 个月的资金流水比对，6 笔未申报收入，合计 ¥37,000。办公室很安静，只有打印机在响。清单是打印好的——他们来之前，功课已经做完了。',
    cat: 'crisis',
    when: [['random', '<', 0]],
    weight: 30,
    choices: [
      {
        id: 'pay-up',
        label: '补税+罚款：一次结清',
        hint: '现金 -6000~-12000，信用 -30，合规 +3——还清的是账，买回的是夜里的觉',
        effects: [
          { k: 'cash', op: '+', v: [-6000, -12000] },
          { k: 'creditScore', op: '+', v: -30 },
          { k: 'compliance', op: '+', v: 3 }
        ],
        results: '税款、滞纳金、罚款，一笔笔打进了指定账户。送走稽查组，你把「按期申报」设成了每月 1 号的日程。'
      },
      {
        id: 'conceal',
        label: '隐瞒：「那几笔是个人往来」',
        hint: '信用 -80，合规 -8，15 天后法律冻结清算——谎要用更大的谎养',
        requires: 'system2',
        s1Variant: '死不承认，他能查到什么',
        effects: [
          { k: 'creditScore', op: '+', v: -80 },
          { k: 'compliance', op: '+', v: -8 },
          { k: 'stress', op: '+', v: 12 }
        ],
        chain: [{ event: 'gray-clearing-legal', delayDays: 15 }],
        results: '你把那六笔说成「朋友借款」。稽查员没反驳，只是在清单上又画了一道。第二页比第一页长。'
      }
    ]
  },

  {
    id: 'gray-clearing-moral',
    title: '道德清算：那笔钱在账上躺了 90 天',
    body: '夜里复盘账目，你翻到一笔来路模糊的收入：¥6,800，来自那个多打的客户/那批说不清的额度/那份注了水的报表——这 90 天你一直知道它在哪。账是平的，有别的东西不平。阶段 4-5 的尽调会翻出来的暗账，你现在可以自己先翻。',
    cat: 'crisis',
    when: [['random', '<', 0]],
    weight: 25,
    choices: [
      {
        id: 'return-it',
        label: '退回去：联系对方，把钱原路退了',
        hint: '现金 -3000~-8000，道德 +8，品性 +3——暗账自己清，最便宜',
        effects: [
          { k: 'cash', op: '+', v: [-3000, -8000] },
          { k: 'morality', op: '+', v: 8 },
          { k: 'character', op: '+', v: 3 }
        ],
        results: '你发消息说明情况，对方愣了半天回了句「你还挺较真」。钱退回去的那晚，你睡得比这 90 天里哪天都沉。'
      },
      {
        id: 'donate',
        label: '匿名捐掉：来路不清，去路清白',
        hint: '现金 -4000~-9000，道德 +5，情绪 +2',
        effects: [
          { k: 'cash', op: '+', v: [-4000, -9000] },
          { k: 'morality', op: '+', v: 5 },
          { k: 'mood', op: '+', v: 2 }
        ],
        results: '你给山区图书项目捐了这笔钱，收据上没有名字。账面上它还是那笔糊涂账，但你心里它换了用途。'
      },
      {
        id: 'keep-it',
        label: '留着：钱就是钱，哪来的不重要',
        hint: '道德 -6，压力 +5——尽调的时候，它会自己说话',
        requires: 'system2',
        s1Variant: '都到碗里来了，还想退？',
        effects: [
          { k: 'morality', op: '+', v: -6 },
          { k: 'stress', op: '+', v: 5 }
        ],
        results: '你把这笔账记为「其他收入」。它安安静静躺在报表里，等着某个尽调清单或某个失眠的夜晚把它点出来。'
      }
    ]
  },

  // ============================================================
  // 七、道德抉择：8 条（恶方：短多 + morality 负值 + 未来清算 chain；善方：长线收益）
  // ============================================================

  {
    id: 'moral-competitor-hole',
    title: '竞品的数据库，敞着口',
    body: '你在调研时撞进竞品的一个子域名：用户数据看板，无鉴权，能看 4,000 多个客户的联系方式和消费记录。页面角落的版本号显示，这个洞可能已经开了半年。没人看见你，除了你自己。',
    cat: 'moral',
    when: [['day', '>=', 12], ['stage', '>=', 2]],
    weight: 6,
    cooldownDays: 60,
    choices: [
      {
        id: 'report-it',
        label: '负责任披露：邮件通知对方修复',
        hint: '道德 +6，口碑 +3，认知 +2——圈内很小，好事会传',
        effects: [
          { k: 'morality', op: '+', v: 6 },
          { k: 'rep', op: '+', v: 3 },
          { k: 'cognition', op: '+', v: 2 }
        ],
        results: '邮件发出 4 小时后漏洞修复，对方创始人亲自回电道谢。半年后你们在行业会上同桌——他向别人介绍你：「就是提醒我们穿衣服的人。」'
      },
      {
        id: 'take-data',
        label: '拿走数据：4,000 个精准客户',
        hint: '现金 +4000~9000，道德 -12，25 天后法律冻结清算',
        requires: 'system2',
        s1Variant: '又没人知道，数据不会喊冤',
        effects: [
          { k: 'cash', op: '+', v: [4000, 9000] },
          { k: 'morality', op: '+', v: -12 }
        ],
        chain: [{ event: 'gray-clearing-legal', delayDays: 25 }],
        results: '你导出了名单，转化了三单，进账 ¥7,000。凌晨删库记录的时候你才发现：那半小时的访问日志，一直是能查到的。'
      },
      {
        id: 'walk-past',
        label: '关掉页面，当没看见',
        hint: '道德 +2——不是所有见到的钱都要伸手',
        effects: [{ k: 'morality', op: '+', v: 2 }],
        results: '你关了浏览器标签。那家的洞后来上了行业群聊的笑谈，你一张截图都没存。'
      }
    ]
  },

  {
    id: 'moral-overpay',
    title: '多打的 ¥6,800',
    body: '对账时发现：上个月一个客户把 6,800 打成了 68,000，多出的 ¥6,800 一直躺在账上。对方是对公转账，备注写的「尾款」。他们财务大概率还没发现，而你上个月的账，正需要这六千八。',
    cat: 'moral',
    when: [['day', '>=', 10]],
    weight: 6,
    cooldownDays: 60,
    choices: [
      {
        id: 'return',
        label: '退回：原路打回去，附说明',
        hint: '道德 +6，口碑 +2，30 天后老客户转介绍上门',
        effects: [
          { k: 'morality', op: '+', v: 6 },
          { k: 'rep', op: '+', v: 2 }
        ],
        chain: [{ event: 'opp-old-client-referral', delayDays: 30 }],
        results: '对方财务回复：「幸好遇到你。」这事在他公司传了一圈。一个月后，他们采购总监绕过招标直接找你询价——长线收益，从退钱那天开始计息。'
      },
      {
        id: 'keep',
        label: '留下：「就当误差，反正他们有钱」',
        hint: '现金 +6800，道德 -8，20 天后道德清算',
        requires: 'system2',
        s1Variant: '对公的账，三年都对不清',
        effects: [
          { k: 'cash', op: '+', v: 6800 },
          { k: 'morality', op: '+', v: -8 }
        ],
        chain: [{ event: 'gray-clearing-moral', delayDays: 20 }],
        results: '你把这六千八记成了「咨询尾款」。对方的财务系统月底对出了差额，备注栏里你的公司名，比钱先被记住了。'
      },
      {
        id: 'credit',
        label: '转成预存款：告知对方抵下期费用',
        hint: '道德 +4，现金 +0~2000——体面的中间路线',
        effects: [
          { k: 'morality', op: '+', v: 4 },
          { k: 'cash', op: '+', v: [0, 2000] }
        ],
        results: '对方回复「按你说的办」，还顺手把下季度合同续了。钱在账上走了一圈，信任多存了一层。'
      }
    ]
  },

  {
    id: 'moral-kickback',
    title: '供应商的 15% 返点',
    body: '外包供应商在饭局上把话挑明：以后单子结算价上浮 15%，返给你个人，走微信，「客户那边报价不变，大家都好」。他态度熟稔，像在谈一个行业惯例——确实，2026 年这仍是很多环节的惯例。',
    cat: 'moral',
    when: [['day', '>=', 15], ['projectCount', '>=', 1]],
    weight: 6,
    cooldownDays: 60,
    choices: [
      {
        id: 'refuse',
        label: '拒绝：「返点就免了，价给我降下来」',
        hint: '道德 +5，品性 +3，压力 +2——把惯例顶回去需要一口气',
        effects: [
          { k: 'morality', op: '+', v: 5 },
          { k: 'character', op: '+', v: 3 },
          { k: 'stress', op: '+', v: 2 }
        ],
        results: '他愣了一下，笑了：「行，那结算价给你降 8 个点。」饭吃到最后，他说现在像你这样的不多了——语气里有嘲笑，也有一点别的。'
      },
      {
        id: 'take',
        label: '收下：微信转账，不留痕',
        hint: '现金 +3000~6000，道德 -10，25 天后稽查清算',
        requires: 'system2',
        s1Variant: '行业惯例，不拿白不拿',
        effects: [
          { k: 'cash', op: '+', v: [3000, 6000] },
          { k: 'morality', op: '+', v: -10 }
        ],
        chain: [{ event: 'gray-clearing-audit', delayDays: 25 }],
        results: '第一笔 ¥4,200 到账。三个月后供应商和另一家客户闹翻，聊天记录成了呈堂的证据——你的微信名在里面，日期齐全。'
      },
      {
        id: 'take-openly',
        label: '收，但入公司账、开票、写进合同',
        hint: '现金 +2000~4000，道德 -4，合规 -3——阳光下的让利不是回扣',
        effects: [
          { k: 'cash', op: '+', v: [2000, 4000] },
          { k: 'morality', op: '+', v: -4 },
          { k: 'compliance', op: '+', v: -3 }
        ],
        results: '你把「渠道服务费」写进了合作协议，开票纳税。他嫌你事多，但这条线从此经得起任何人翻。'
      }
    ]
  },

  {
    id: 'moral-pirated-pack',
    title: '¥9.9 的全网素材包',
    body: '网盘群里流传的「2026 全网商用素材合集」：字体、图标、配乐、4K 视频空镜，标价 ¥9.9。你项目里正缺一套空镜，正版授权要 ¥1,600。卖家备注：「商用免责，出事包赔。」——他赔不起，你也一样。',
    cat: 'moral',
    when: [['day', '>=', 10], ['projectCount', '>=', 1]],
    weight: 6,
    cooldownDays: 45,
    choices: [
      {
        id: 'buy-license',
        label: '买正版：¥1,600 买全套商用授权',
        hint: '现金 -800~-2000，项目质量 +6~12，道德 +4',
        effects: [
          { k: 'cash', op: '+', v: [-800, -2000] },
          { k: 'projectQuality', op: '+', v: [6, 12] },
          { k: 'morality', op: '+', v: 4 }
        ],
        results: '授权证书归了档。三个月后客户方风控查素材来源，你的 PDF 秒过审——那单尾款 ¥20,000 因此一分没拖。'
      },
      {
        id: 'use-pirated',
        label: '用盗版包：9 块 9 的事',
        hint: '项目质量 +4~8，道德 -8，30 天后法律冻结清算',
        requires: 'system2',
        s1Variant: '这么多人用，法不责众',
        effects: [
          { k: 'projectQuality', op: '+', v: [4, 8] },
          { k: 'morality', op: '+', v: -8 }
        ],
        chain: [{ event: 'gray-clearing-legal', delayDays: 30 }],
        results: '项目顺利交付。半年后素材版权方批量维权，律师函按下载记录寄——你的名字在一页很长的名单里。'
      },
      {
        id: 'make-own',
        label: '自己拍：周末出去拍空镜',
        hint: 'AP -2，造物经验 +8，道德 +3——慢，但全是你的',
        effects: [
          { k: 'ap', op: '+', v: -2 },
          { k: 'skillExp.craft', op: '+', v: 8 },
          { k: 'morality', op: '+', v: 3 }
        ],
        results: '你拍了一下午，素材不算专业但独一无二。客户在成片里认出了那家你拍的面馆，说「有生活气」——这个词，素材包里没有。'
      }
    ]
  },

  {
    id: 'moral-buy-followers',
    title: '一万粉 ¥800，「不掉粉，可补」',
    body: '卖家的话术很专业：「真人 relic，带活跃，48 小时到账，掉了免费补。」你上个月刚发过一条动态：「绝不买粉。」后台数字停在 2,300，刚好卡在多数商单的 5,000 粉门槛下面。',
    cat: 'moral',
    when: [['day', '>=', 12]],
    weight: 6,
    cooldownDays: 45,
    choices: [
      {
        id: 'stay-organic',
        label: '不买：把门槛之下的日子熬完',
        hint: '品性 +3，公众号粉 +10~30——慢，但每个粉都是人',
        effects: [
          { k: 'character', op: '+', v: 3 },
          { k: 'followers.wechat', op: '+', v: [10, 30] }
        ],
        results: '你关掉了卖家主页，把那句「绝不买粉」设成了签名。三个月后你到 5,100 粉，第一单商单 ¥1,500——甲方说你「数据很真」。'
      },
      {
        id: 'buy-10k',
        label: '买一万：一步跨过商单门槛',
        hint: '现金 -600~-1200，粉丝 +10000，道德 -10，口碑 -5，28 天后稽查清算',
        requires: 'system2',
        s1Variant: '数据就是信用，先把门跨过去',
        effects: [
          { k: 'cash', op: '+', v: [-600, -1200] },
          { k: 'followers.douyin', op: '+', v: 10000 },
          { k: 'morality', op: '+', v: -10 },
          { k: 'rep', op: '+', v: -5 }
        ],
        chain: [{ event: 'gray-clearing-audit', delayDays: 28 }],
        results: '粉丝数跳到 1.2 万，互动还是 2,300 人的量。甲方投了 ¥2,000 的单子，看完转化报表在群里问：「这号，买的粉吧？」'
      },
      {
        id: 'buy-engagement',
        label: '只买互动：数据「化妆」一下',
        hint: '现金 -300~-600，粉丝 +300，道德 -6，25 天后道德清算',
        effects: [
          { k: 'cash', op: '+', v: [-300, -600] },
          { k: 'followers.bilili', op: '+', v: 300 },
          { k: 'morality', op: '+', v: -6 }
        ],
        chain: [{ event: 'gray-clearing-moral', delayDays: 25 }],
        results: '点赞数好看了一周。你在后台看着那些假互动，像看着自己简历上描过的一行字——描得再细，笔迹是两样的。'
      }
    ]
  },

  {
    id: 'moral-hype-course',
    title: '「三天教你月入十万」的课',
    body: '一个同行请你帮忙做课：标题他都起好了——《普通人翻身：三天吃透 AI 自动化，月入十万不是梦》。内容他口述，你剪辑上架，五五分。他现有私域 8,000 人，按 9.9 元引流课转化 8% 算，首月流水十几万。「你负责的部分干净」，他说。',
    cat: 'moral',
    when: [['day', '>=', 15]],
    weight: 6,
    cooldownDays: 60,
    choices: [
      {
        id: 'refuse-course',
        label: '拒绝：「这课我剪不了」',
        hint: '道德 +6，品性 +2——你会失去一个合作，和一份失眠',
        effects: [
          { k: 'morality', op: '+', v: 6 },
          { k: 'character', op: '+', v: 2 }
        ],
        results: '你说「月入十万要是三天能学会，你为什么还要找人剪片子」。他沉默了几秒，把「五五分」改成了「四六分」——你看，他其实知道。'
      },
      {
        id: 'make-hype',
        label: '接了：剪辑而已，内容不是我写的',
        hint: '现金 +8000~18000，道德 -15，口碑 -6，30 天后道德清算',
        requires: 'system2',
        s1Variant: '钱是真的，学员退费是以后的事',
        effects: [
          { k: 'cash', op: '+', v: [8000, 18000] },
          { k: 'morality', op: '+', v: -15 },
          { k: 'rep', op: '+', v: -6 }
        ],
        chain: [{ event: 'gray-clearing-moral', delayDays: 30 }],
        results: '课程上线首月流水 ¥140,000，你分到七万。第二个月，投诉群建了起来，群公告里引用了你的宣传页——你剪的那句「月入十万不是梦」被标了红。'
      },
      {
        id: 'make-honest',
        label: '反提案：做一门说实话的课',
        hint: '现金 +2000~5000，道德 +2，AP -2，压力 +6——慢生意，真生意',
        effects: [
          { k: 'cash', op: '+', v: [2000, 5000] },
          { k: 'morality', op: '+', v: 2 },
          { k: 'ap', op: '+', v: -2 },
          { k: 'stress', op: '+', v: 6 }
        ],
        results: '你们把课改名为《AI 自动化 90 天实录》，把失败案例放进了第一集。转化率低了一半，完课率是行业三倍，退款率接近零。'
      }
    ],
    oldZhang: '快钱和慢钱的区别不在金额，在收回来的那天睡不睡得着。'
  },

  {
    id: 'moral-blame-outsourcer',
    title: '事故之后：让外包背这个锅吗',
    body: '交付出了事故：数据迁移脚本把你误删了客户两张表，恢复花了 11 个小时。复盘会上客户问「责任在谁」。脚本确实是外包写的，但验收是你签的字，SOP 是你省了没写。现在有个现成的说法：「技术外包方的失误」。',
    cat: 'moral',
    when: [['day', '>=', 15], ['projectCount', '>=', 1]],
    weight: 6,
    cooldownDays: 60,
    choices: [
      {
        id: 'own-it',
        label: '公开担责：验收是我签的',
        hint: '现金 -1000~-3000 赔偿，口碑 +3，品性 +4——背锅的钱最便宜',
        effects: [
          { k: 'cash', op: '+', v: [-1000, -3000] },
          { k: 'rep', op: '+', v: 3 },
          { k: 'character', op: '+', v: 4 }
        ],
        results: '你在复盘会上说：「脚本是他写的，签字是我签的，责任在我。」客户沉默了一会儿说：「那就按你说的补方案。」第二年他续了约，理由栏写着「靠谱」。'
      },
      {
        id: 'blame',
        label: '甩锅：技术外包方的失误',
        hint: '口碑 +1（短期），道德 -10，21 天后道德清算',
        requires: 'system2',
        s1Variant: '谁写的谁负责，天经地义',
        effects: [
          { k: 'rep', op: '+', v: 1 },
          { k: 'morality', op: '+', v: -10 }
        ],
        chain: [{ event: 'gray-clearing-moral', delayDays: 21 }],
        results: '客户接受了说法，扣了外包的尾款。外包没辩解，只是退了群。半年后他在行业群里讲起这事，语气平静，细节准确——听的人都会看一眼你的头像。'
      },
      {
        id: 'private-settle',
        label: '私了：对外不提责任，补偿两家分',
        hint: '现金 -2000~-5000，道德 +3，口碑 +1——和气，但真相打了折',
        effects: [
          { k: 'cash', op: '+', v: [-2000, -5000] },
          { k: 'morality', op: '+', v: 3 },
          { k: 'rep', op: '+', v: 1 }
        ],
        results: '你跟外包各出一半补偿，给客户补了两周增值服务。客户后来知道了全貌，没说什么——有些账，别人不翻，自己要记。'
      }
    ]
  },

  {
    id: 'moral-fake-metrics',
    title: '报表「美化」：把 3.2% 改成 8%',
    body: '客户的投放月报难看：转化率 3.2%，上季度承诺的是 8%。续约谈判就在周四。销售智能体给出建议：「把口径改为『点击转化』，数字即为 8.1%。」——技术上不算撒谎，商业上它就是。',
    cat: 'moral',
    when: [['day', '>=', 15], ['projectCount', '>=', 1]],
    weight: 6,
    cooldownDays: 60,
    choices: [
      {
        id: 'honest-report',
        label: '如实交：附原因分析和改进计划',
        hint: '现金 -500~-1500（客户波动），口碑 +2，品性 +3',
        effects: [
          { k: 'cash', op: '+', v: [-500, -1500] },
          { k: 'rep', op: '+', v: 2 },
          { k: 'character', op: '+', v: 3 }
        ],
        results: '报表如实交了，附了三页归因和下季度计划。客户把预算砍了四成，没砍供应商——你在的这四成。谈判桌上，真话比 PPT 耐用。'
      },
      {
        id: 'beautify',
        label: '美化：口径一换，续约稳了',
        hint: '现金 +3000~6000（续约款），道德 -10，24 天后稽查清算',
        requires: 'system2',
        s1Variant: '口径本来就是人定的',
        effects: [
          { k: 'cash', op: '+', v: [3000, 6000] },
          { k: 'morality', op: '+', v: -10 }
        ],
        chain: [{ event: 'gray-clearing-audit', delayDays: 24 }],
        results: '续约签了。半年后客户自己上了监测系统，两份报表的差异摆在同一张屏上。他们财务比你先学会看口径。'
      },
      {
        id: 'partial',
        label: '折中：如实，但把 3.2% 放在趋势图里',
        hint: '现金 +1500~3000，道德 -4，压力 +4，30 天后道德清算',
        effects: [
          { k: 'cash', op: '+', v: [1500, 3000] },
          { k: 'morality', op: '+', v: -4 },
          { k: 'stress', op: '+', v: 4 }
        ],
        chain: [{ event: 'gray-clearing-moral', delayDays: 30 }],
        results: '趋势图选的起点很讲究，3.2% 看起来像「爬坡中」。续约过了。你在庆功饭上没什么胃口——你知道哪根柱子是描过的。'
      }
    ]
  },

  // ============================================================
  // 八、AI 浪潮：6 条（2026 的空气：模型、内卷、焦虑、泡沫、可靠性、独角兽）
  // ============================================================

  {
    id: 'ai-newmodel-boost',
    title: '效率红利：新模型把你 3 天的活压成 5 小时',
    body: '新模型在你的场景跑通了：过去做一版完整方案要 3 天，现在 5 小时，成本是原来的 15%。群里有人已经开始用省下的时间接 3 倍的单，也有人在问「效率翻倍之后，单价的跌幅什么时候追上来」。',
    cat: 'ai',
    when: [['day', '>=', 10]],
    weight: 8,
    cooldownDays: 40,
    newsDay: 3,
    choices: [
      {
        id: 'rebuild-flow',
        label: '重构工作流：把红利变成产能',
        hint: 'autoLevel +3~8，运营经验 +6，AP -1',
        effects: [
          { k: 'autoLevel', op: '+', v: [3, 8] },
          { k: 'skillExp.operation', op: '+', v: 6 },
          { k: 'ap', op: '+', v: -1 }
        ],
        results: '你花了三天重排管线，把新模型嵌进 4 个环节。周产出翻倍——红利不追就过期，你追上了。'
      },
      {
        id: 'keep-pace',
        label: '按需用：活照旧，工具顺手用',
        hint: '信息 +2——不折腾，也不掉队',
        effects: [{ k: 'info', op: '+', v: 2 }],
        results: '你用它写了几天周报和初稿，节奏没变。红利落别人兜里的时候，你安慰自己稳就是快——安慰这种东西，有效期一般两个月。'
      },
      {
        id: 'go-deep',
        label: '重仓学习：两周啃透新模型',
        hint: '造物经验 +10，认知 +3，压力 +5——学的时候像负债，之后像资产',
        effects: [
          { k: 'skillExp.craft', op: '+', v: 10 },
          { k: 'cognition', op: '+', v: 3 },
          { k: 'stress', op: '+', v: 5 }
        ],
        results: '你把评测集、提示词库、失败案例全跑了一遍。两周后你成了群里那个「懂的人」——懂，是可以收费的。'
      }
    ]
  },

  {
    id: 'ai-content-flood',
    title: '内容内卷：AI 批量稿把单价打穿',
    body: '平台的低价文案区，千字单价从 ¥80 被批量 AI 工作流打到 ¥25。你在中间价位，上面是三倍价的真人主理人，下面是海量 ¥25。评论区开始出现「这也配叫创作」的争吵，吵的人用的都是 AI。',
    cat: 'ai',
    when: [['day', '>=', 15]],
    weight: 8,
    cooldownDays: 30,
    choices: [
      {
        id: 'go-premium',
        label: '上移：转高端定制，按方案不按字',
        hint: '商业经验 +8，项目 MRR ×1.1~1.2——换战场，不换枪',
        effects: [
          { k: 'skillExp.business', op: '+', v: 8 },
          { k: 'projectMrr', op: '*', v: [1.1, 1.2] }
        ],
        results: '你把服务拆成「诊断+方案+落地」，报价 ×4，附一句「不比价」。丢了一批比价客户，留下的人掏钱爽快得多。'
      },
      {
        id: 'price-war',
        label: '打价格战：卷不过就加入',
        hint: '现金 -1000~-2500（成本压价），压力 +8，小红书粉 +50~120',
        effects: [
          { k: 'cash', op: '+', v: [-1000, -2500] },
          { k: 'stress', op: '+', v: 8 },
          { k: 'followers.xhs', op: '+', v: [50, 120] }
        ],
        results: '你降到 ¥20/千字接了 40 单，月底一算：单量翻倍，利润腰斩，腱鞘炎提前到账。卷赢的唯一方法，是换个游戏。'
      },
      {
        id: 'stop-and-think',
        label: '停更两周：想清楚自己卖的是什么',
        hint: '认知 +4，情绪 +2——答案不在流水线里',
        effects: [
          { k: 'cognition', op: '+', v: 4 },
          { k: 'mood', op: '+', v: 2 }
        ],
        results: '两周里你只写了一篇长文，讲自己怎么给人做自动化诊断。发出去当晚，两个企业号来问「诊断怎么收费」——原来答案是这个。'
      }
    ]
  },

  {
    id: 'ai-replace-anxiety',
    title: '被替代焦虑：「这活 AI 三秒就出」',
    body: '你看着同事群转发的演示视频：输入一句话，三秒出十版文案，第三版比你上周改了三天的还好。评论区一片「失业倒计时」。你盯着自己的手——这双手花了六年练出来的活，视频里的进度条 3 秒走完了。',
    cat: 'ai',
    when: [['day', '>=', 12], ['or', [['stress', '>=', 40], ['energy', '<=', 50]]]],
    weight: 8,
    cooldownDays: 20,
    choices: [
      {
        id: 'doom-scroll',
        label: '刷一晚上「失业帖」',
        hint: '压力 +8，睡眠 -6，信息 +4——知道得多，睡得少',
        effects: [
          { k: 'stress', op: '+', v: 8 },
          { k: 'sleep', op: '+', v: -6 },
          { k: 'info', op: '+', v: 4 }
        ],
        results: '凌晨两点，你收藏了 23 篇《下一个被替代的是谁》。哪篇都没教你怎么办，但每一篇都让你觉得有人陪你慌。'
      },
      {
        id: 'arm-yourself',
        label: '武装自己：把那工具学成你的杠杆',
        hint: '认知 +4，造物经验 +5，AP -1——抢不走用工具的人的活',
        effects: [
          { k: 'cognition', op: '+', v: 4 },
          { k: 'skillExp.craft', op: '+', v: 5 },
          { k: 'ap', op: '+', v: -1 }
        ],
        results: '你把那个工具接进了自己的流程，专挑它做得差的两个环节跟它对线。焦虑没消失，但变成了进度条。'
      },
      {
        id: 'go-run',
        label: '关掉视频，去跑步',
        hint: '运动 +8，压力 -6——身体是你自己的，跑一步算一步',
        effects: [
          { k: 'exercise', op: '+', v: 8 },
          { k: 'stress', op: '+', v: -6 }
        ],
        results: '五公里，跑到第三公里的时候那种胸口发紧的感觉散了。问题还在，但你不在问题里——你在路上。'
      }
    ]
  },

  {
    id: 'ai-bubble-debate',
    title: '泡沫之辩：两边都有人晒截图',
    body: '「AI 是百年一遇的电力」与「AI 是 2026 年的共享单车」吵上了热搜。一边晒融资公告，一边晒倒闭名单；一条帖子里，同一家公司在两个名单上都出现过。你转发过「风口论」，收藏过「退潮论」。',
    cat: 'ai',
    when: [['day', '>=', 20]],
    weight: 7,
    cooldownDays: 30,
    choices: [
      {
        id: 'write-cool',
        label: '写一篇冷静分析：数据对数据',
        hint: '知乎粉 +60~150，表达经验 +6，影响力 +2',
        effects: [
          { k: 'followers.zhihu', op: '+', v: [60, 150] },
          { k: 'skillExp.expression', op: '+', v: 6 },
          { k: 'influence', op: '+', v: 2 }
        ],
        results: '你把 14 家公司的公开数据拉成一张表，结论是「应用层活着，概念层在退潮」。两边都不爽你——两边都转了你的帖。'
      },
      {
        id: 'take-side',
        label: '站队喊单：流量在哪我在哪',
        hint: '微博粉 +80~200，口碑 -2，压力 +3——立场涨粉，也折旧',
        effects: [
          { k: 'followers.weibo', op: '+', v: [80, 200] },
          { k: 'rep', op: '+', v: -2 },
          { k: 'stress', op: '+', v: 3 }
        ],
        results: '你发了「All in 派」的宣言，涨粉很快。三个月后风向一转，那篇宣言成了别人合集里的素材——互联网有记忆，流量有利息。'
      },
      {
        id: 'mute-all',
        label: '不看：泡沫与我无关，单子有关',
        hint: '信息 +2——争论不结算，账单结算',
        effects: [{ k: 'info', op: '+', v: 2 }],
        results: '你关掉热搜去改 bug。泡沫破不破，你的客户下个月还是要交报表——这样想着，心里稳了一点。'
      }
    ]
  },

  {
    id: 'ai-agent-outage-news',
    title: '可靠性新闻：某厂智能体批量「发疯」',
    body: '头部厂商的智能体平台昨夜大规模异常：数万家企业的客服智能体同时开始输出混乱内容，有商家损失订单，有平台连夜回滚版本。你的三台智能体用的不是同一家的模型——「运气好」这三个字，今天听着不像好话。',
    cat: 'ai',
    when: [['day', '>=', 15]],
    weight: 7,
    cooldownDays: 25,
    newsDay: 80,
    choices: [
      {
        id: 'self-check',
        label: '自查：把自家三台智能体巡检一遍',
        hint: '信息 +4，合规 +1，压力 +2——别人的事故是免费的演习',
        effects: [
          { k: 'info', op: '+', v: 4 },
          { k: 'compliance', op: '+', v: 1 },
          { k: 'stress', op: '+', v: 2 }
        ],
        results: '你加跑了回归测试，给客服智能体的输出上了人工抽检——20% 起步。事故新闻看完，你的 SOP 多了两页。'
      },
      {
        id: 'repost-news',
        label: '转发吃瓜：幸存者的优越感',
        hint: '情绪 +3，微博粉 +20~60——瓜是别人的，风险是自己的',
        effects: [
          { k: 'mood', op: '+', v: 3 },
          { k: 'followers.weibo', op: '+', v: [20, 60] }
        ],
        results: '你的转评「还好我没用它」收了 200 赞。当晚你自己的智能体漏发了一批订单通知——你没发第二条朋友圈。'
      },
      {
        id: 'harden-sop',
        label: '加固：写兜底 SOP 和回滚预案',
        hint: 'AP -1，autoLevel +2，压力 +3——预案是给最坏那天写的信',
        effects: [
          { k: 'ap', op: '+', v: -1 },
          { k: 'autoLevel', op: '+', v: 2 },
          { k: 'stress', op: '+', v: 3 }
        ],
        results: '你写了三页预案：什么情况切人工、谁按回滚键、客户话术怎么发。希望永远用不上——但写完那晚睡得很沉。'
      }
    ]
  },

  {
    id: 'ai-unicorn-news',
    title: '一人独角兽：候选者出现了',
    body: '刷屏的新闻：一家「员工数为 1」的 AI 公司宣布年经常性收入破 1 亿美元，正在接受审计。评论区有人翻出 Sam Altman 那句「2026 年会出现一人十亿美元公司，我给 70-80% 概率」。你不是没算过这道题——你只是把通勤时间算成了成本。',
    cat: 'ai',
    when: [['day', '>=', 25]],
    weight: 6,
    once: true,
    newsDay: 260,
    choices: [
      {
        id: 'dissect',
        label: '拆解它：把新闻读成方法论',
        hint: '认知 +4，信息 +3——神话拆开是工序',
        effects: [
          { k: 'cognition', op: '+', v: 4 },
          { k: 'info', op: '+', v: 3 }
        ],
        results: '你扒了它的产品矩阵和自动化架构：37 个智能体、1 个创始人、0 个会议。神话拆开是工序，工序可以抄——背书抄不来。'
      },
      {
        id: 'lose-sleep',
        label: '焦虑到失眠：「我已经 30 了」',
        hint: '压力 +8，睡眠 -5——别人的时间线是最贵的毒药',
        effects: [
          { k: 'stress', op: '+', v: 8 },
          { k: 'sleep', op: '+', v: -5 }
        ],
        results: '你失眠到三点，脑子里全是「同龄人」。第二天你效率极低——用别人的新闻惩罚自己的一天，就这么过去了。'
      },
      {
        id: 'set-goal',
        label: '立自己的十年目标，写下来',
        hint: '品性 +3，情绪 +2——跑道要诚实，目标可以大',
        effects: [
          { k: 'character', op: '+', v: 3 },
          { k: 'mood', op: '+', v: 2 }
        ],
        results: '你在笔记第一页写下：十年，一人公司，被动收入覆盖三个家庭。数字可以改，方向不会——新闻里的那个人没让你焦虑，让你校了准星。'
      }
    ]
  },

  // ============================================================
  // 九、金融周期：6 条（真实反映，赌徒警示文案；资产操作走 invest 面板，事件负责叙事与心态）
  // ============================================================

  {
    id: 'fin-bull-run',
    title: '牛市：群里在晒第 N 个涨停',
    body: '指数 20 个交易日涨了 18%，群里每天有人晒收益截图，连你那个从不炒股的表哥都在问「基金怎么开」。你的持仓浮盈把屏幕染红了——红得很像警示灯，虽然现在人人都说这是起点。',
    cat: 'finance',
    when: [['day', '>=', 20], ['or', [['monthPhase', 'boom'], ['monthPhase', 'overheat']]]],
    weight: 8,
    cooldownDays: 40,
    choices: [
      {
        id: 'leverage',
        label: '上杠杆：借 2 万加仓，牛市不等人',
        hint: '负债 +10000~20000，压力 +8——杠杆把「错了」两个字放大十倍',
        requires: 'system2',
        s1Variant: '这种行情，不上车就是亏',
        effects: [
          { k: 'debt', op: '+', v: [10000, 20000] },
          { k: 'stress', op: '+', v: 8 }
        ],
        results: '你把借钱按钮按了下去。行情又涨了三天，你开始习惯每天开盘前的心跳——那是多巴胺，也是利息。'
      },
      {
        id: 'dca',
        label: '照旧定投：不加也不撤',
        hint: '品性 +2，情绪 +1——把行情当天气，把定投当通勤',
        effects: [
          { k: 'character', op: '+', v: 2 },
          { k: 'mood', op: '+', v: 1 }
        ],
        results: '你按计划扣了款，关掉 APP。月底一看，账户涨了，情绪没涨——这才是对的样子。'
      },
      {
        id: 'trim',
        label: '逢涨减仓：把浮盈换成现金',
        hint: '信息 +3——涨出来的钱，落袋才算数',
        effects: [{ k: 'info', op: '+', v: 3 }],
        results: '你卖掉三成仓位。群里说你「卖飞了」，两周后第一根大阴线下来，你默默把那条嘲讽删了——它自己会过期。'
      }
    ]
  },

  {
    id: 'fin-crash-wave',
    title: '股灾：三天抹掉三个月',
    body: '没有任何铺垫：三天，指数跌 17%，你的账户回吐了三个月的浮盈还倒亏本金。群里从晒收益变成晒腰斩，有人发了张清仓截图配「再见」，没人知道是告别股市还是告别别的。',
    cat: 'finance',
    when: [['day', '>=', 20], ['or', [['monthPhase', 'recession'], ['monthPhase', 'overheat']]]],
    weight: 8,
    cooldownDays: 40,
    choices: [
      {
        id: 'stop-loss',
        label: '割肉离场：睡个安稳觉',
        hint: '压力 -4，认知 +3——止损单是最贵的学费，也是最便宜的保险',
        effects: [
          { k: 'stress', op: '+', v: -4 },
          { k: 'cognition', op: '+', v: 3 }
        ],
        results: '清仓那一刻你手脚发凉，半小时后反而是这个月最放松的半小时。账面的数字没了，睡眠回来了。'
      },
      {
        id: 'average-down',
        label: '补仓摊薄：「跌这么多了，还能跌到哪」',
        hint: '压力 +10——它还能。摊薄成本的前提是标的不死',
        requires: 'system2',
        s1Variant: '别人恐惧我贪婪',
        effects: [{ k: 'stress', op: '+', v: 10 }],
        results: '你在半山腰把现金打了进去。市场用第四天、第五天的阴线回答了你的问题——「还能跌到哪」不是反问句。'
      },
      {
        id: 'play-dead',
        label: '装死：卸载 APP，不看',
        hint: '压力 +4，情绪 -3——鸵鸟策略，等得起就行',
        effects: [
          { k: 'stress', op: '+', v: 4 },
          { k: 'mood', op: '+', v: -3 }
        ],
        results: '你卸了 APP，把手头的项目往前推。三周后装回来：账户还在绿着，你已经两周没想过它了。'
      }
    ]
  },

  {
    id: 'fin-crypto-swing',
    title: '加密行情：单日 ±20% 的过山车',
    body: '你关注的那个币 24 小时先涨 22% 后跌 19%，K 线像心电图。群里凌晨三点还有人在喊单，晒的截图一半是财富自由，一半是爆仓单。你的小额持仓在过山车上——加密的标准差是基础资产的 6 倍，这不是比喻，是结算单。',
    cat: 'finance',
    when: [['day', '>=', 15], ['flag', 'cryptoOn']],
    weight: 8,
    cooldownDays: 30,
    newsDay: 110,
    choices: [
      {
        id: 'yolo-altcoin',
        label: '全仓山寨：「这次不一样」',
        hint: '压力 +12，信息 +2——每次都不一样，结局都一样',
        requires: 'system2',
        s1Variant: '财富自由就差这一把',
        effects: [
          { k: 'stress', op: '+', v: 12 },
          { k: 'info', op: '+', v: 2 }
        ],
        results: '你把筹码换成了那个「百倍币」。它先给了你 40%——然后三天还了回去，还带走了本金的两成。凌晨的群聊像一场大型失眠。'
      },
      {
        id: 'sell-half',
        label: '卖出一半：把本金捞回岸上',
        hint: '情绪 +2，品性 +1——剩下的涨跌，心理上都是「白嫖」',
        effects: [
          { k: 'mood', op: '+', v: 2 },
          { k: 'character', op: '+', v: 1 }
        ],
        results: '本金回了现金仓。剩下那半仓随便它跳——你发现自己居然能睡着了。仓位决定心态，心态决定寿命。'
      },
      {
        id: 'dca-calm',
        label: '小额定投：当买一张彩票',
        hint: '认知 +2——用「亏光也不心疼」的仓位参与',
        effects: [{ k: 'cognition', op: '+', v: 2 }],
        results: '你把每周投入固定在 200 块，设了止盈提醒。涨了是彩蛋，跌了是学费——彩票心态的人，才能在赌场外活着。'
      }
    ]
  },

  {
    id: 'fin-property-loosen',
    title: '房产新政：首付又降了',
    body: '新闻推送：二套首付比例再降 5 个点，利率挂钩 LPR 下调。家族群转发了三条解读视频，配文从「抄底」到「跑路」都有。妈妈的电话在下午四点准时打来：「你要不要……先看看？」你打开地图，看了眼你存款能买到的小区。',
    cat: 'finance',
    when: [['day', '>=', 30]],
    weight: 6,
    cooldownDays: 60,
    choices: [
      {
        id: 'go-look',
        label: '去看看房：信息总不是坏事',
        hint: '信息 +4，AP -1——用数据回答焦虑，而不是用焦虑回答数据',
        effects: [
          { k: 'info', op: '+', v: 4 },
          { k: 'ap', op: '+', v: -1 }
        ],
        results: '你看了三套：一套老破小，一套期房，一套中介嘴里的「笋盘」。回来你做了张表：月供、生活费、被动收入——数字比电话里清醒。'
      },
      {
        id: 'politely-decline',
        label: '算了：跑道还没长到敢背 30 年',
        hint: '情绪 +1——不是每个时代都有你的船',
        effects: [{ k: 'mood', op: '+', v: 1 }],
        results: '你回了句「先攒攒」。妈妈说好。挂电话前她补了一句：「别听群里那些人瞎咋呼。」——这点上，你们达成了一致。'
      },
      {
        id: 'family-pressure',
        label: '认真跟家里聊一次资产规划',
        hint: '压力 +5，认知 +3，品性 +2——把「催」变成「商量」',
        effects: [
          { k: 'stress', op: '+', v: 5 },
          { k: 'cognition', op: '+', v: 3 },
          { k: 'character', op: '+', v: 2 }
        ],
        results: '视频通话开了一小时。你把现金流表共享了屏幕，爸妈第一次看清你的生意长什么样。没谈拢，但从「催」变成了「商量」。'
      }
    ]
  },

  {
    id: 'fin-rate-cut',
    title: '降息：贷款便宜了，存款利息更薄了',
    body: 'LPR 下调 15 个基点，银行理财收益率跌破 2%。新闻说这是「降低实体经济融资成本」，翻译过来：借钱的人松口气，存钱的人叹口气。你的经营贷短信和存款到期提醒，同一天到的。',
    cat: 'finance',
    when: [['day', '>=', 25], ['or', [['monthPhase', 'recovery'], ['monthPhase', 'recession']]]],
    weight: 6,
    cooldownDays: 50,
    choices: [
      {
        id: 'refinance',
        label: '置换：把高息借款换成低息',
        hint: '信用 +5，认知 +2——同样的债，便宜一截',
        effects: [
          { k: 'creditScore', op: '+', v: 5 },
          { k: 'cognition', op: '+', v: 2 }
        ],
        results: '你跑了两天银行把经营贷置换了。月供少 ¥340——不多，但你把它设成了自动转入备用金。'
      },
      {
        id: 'rebalance',
        label: '存款搬家：重新配一遍资产',
        hint: '信息 +3——利率变了，配置该跟着变',
        effects: [{ k: 'info', op: '+', v: 3 }],
        results: '你把到期存款按「应急/稳健/进取」重新分了层。理财经理推荐的产品你没买——他把「稳健」两个字说得像「保本」。'
      },
      {
        id: 'no-feel',
        label: '无感：十五个基点与我无关',
        hint: '压力 +1——确实无关，直到它有关',
        effects: [{ k: 'stress', op: '+', v: 1 }],
        results: '你划走了通知。半个月后给客户报价时你才发现：他也在降你所在行业的预算——宏观的事，从来不是别人的事。'
      }
    ]
  },

  {
    id: 'fin-friend-pitch',
    title: '老同学的项目：「就差你这一份」',
    body: '老同学深夜发来 60 秒语音×7：他的「AI+养老」项目估值一个亿，这一轮只留两个名额，「兄弟价」。PPT 做得很亮，团队照片里他站在 C 位。你上一次见他，是三年前他卖保险的时候。',
    cat: 'finance',
    when: [['day', '>=', 12]],
    weight: 7,
    cooldownDays: 30,
    choices: [
      {
        id: 'invest',
        label: '投 2 万：兄弟情也要真金白银',
        hint: '现金 -20000，压力 +4——投资的第一原则：投出去就当没有',
        requires: 'system2',
        s1Variant: '都是兄弟，不帮他帮谁',
        effects: [
          { k: 'cash', op: '+', v: -20000 },
          { k: 'stress', op: '+', v: 4 }
        ],
        results: '转账当天他发了朋友圈：「感谢天使。」你盯着「天使」两个字看了很久。三个月后项目群改成了静音，你的 2 万成了你交过的最贵的「社交学费」。'
      },
      {
        id: 'decline-kindly',
        label: '婉拒：「钱在生意里周转着」',
        hint: '品性 +2——拒绝不会失去真朋友，只会筛掉假投资',
        effects: [{ k: 'character', op: '+', v: 2 }],
        results: '你说「最近现金流都在项目里」。他回了个「理解」。半年后项目没声音了——你由此省下的两万，和那位真正的朋友。'
      },
      {
        id: 'due-diligence',
        label: '要三样东西：财报、合同、退出条款',
        hint: '认知 +3，情绪 -1——把兄弟情翻译成尽调清单',
        effects: [
          { k: 'cognition', op: '+', v: 3 },
          { k: 'mood', op: '+', v: -1 }
        ],
        results: '他要了三天，发来一份 4 页 PPT 和一句「兄弟你这就见外了」。你把「见外」理解为答案，没有再追问。'
      }
    ]
  },

  // ============================================================
  // 十、人际：6 条（旧版高共鸣条目重写迁移；家人/前同事/导师/同行/朋友/社区）
  // ============================================================

  {
    id: 'social-excolleague-invite',
    title: '前同事的消息：「坑给你留了，回不回」',
    body: '老领导换了新东家当总监，深夜发来消息：「带薪、带团队、五险一金全额，薪资比你现在流水高 20%。」后面跟着一句：「在外面飘两年了，回来吧。」你看了眼自己的后台数据，又看了眼窗外。',
    cat: 'social',
    when: [['day', '>=', 15]],
    weight: 8,
    once: false,
    cooldownDays: 90,
    choices: [
      {
        id: 'ending:backToWork',
        label: '回去上班：体面地结束这一章',
        hint: '直接进入「回归职场」结局——这不是失败，是止损',
        effects: [],
        results: '你回了「好」。入职那天工牌上你的照片比离职时老了两岁。有些课，市场替你付了学费；有些账，工资条替你还了。'
      },
      {
        id: 'keep-line',
        label: '婉拒，但把关系续上',
        hint: '人脉 +1，品性 +2——拒绝 offer 不拒绝人情',
        effects: [
          { k: 'contacts', op: '+', v: 1 },
          { k: 'character', op: '+', v: 2 }
        ],
        results: '你说「再给自己半年」。他说「半年后这坑未必在」——你说「那就说明不是我的坑」。你们约了顿饭，饭桌上聊成了两个业务合作意向。'
      },
      {
        id: 'counter-offer',
        label: '反问：合作制，项目制外包给你',
        hint: '商业经验 +6，压力 +4——把 offer 谈成客户',
        effects: [
          { k: 'skillExp.business', op: '+', v: 6 },
          { k: 'stress', op: '+', v: 4 }
        ],
        results: '你提了个大胆方案：按项目制接他们公司的自动化外包。老领导沉默半天：「我试试帮你说。」三周后，你有了成立以来最大的客户。'
      }
    ]
  },

  {
    id: 'social-mentor-direction',
    title: '导师的一句话',
    body: '行业前辈在你的年度复盘下留了条评论：「方向感比勤奋贵。约个饭？」——三年前他带过你三个月，此后每年他都会在你最飘或最低的时候出现一次。他的建议向来只有一句，但值钱。',
    cat: 'social',
    when: [['day', '>=', 10]],
    weight: 7,
    cooldownDays: 35,
    choices: [
      {
        id: 'dinner-ask',
        label: '约饭请教：带着账本去',
        hint: '现金 -300，认知 +5——一顿饭换一次校准',
        effects: [
          { k: 'cash', op: '+', v: -300 },
          { k: 'cognition', op: '+', v: 5 }
        ],
        results: '饭吃了一个半小时。他翻完你的数据只问了一句：「这些事里，哪件只有你能做？」——这句话你消化了半个月，砍掉了三条产品线。'
      },
      {
        id: 'one-line',
        label: '线上只请教一个问题',
        hint: '信息 +3——问题比答案贵，问对的问题',
        effects: [{ k: 'info', op: '+', v: 3 }],
        results: '你问：「我现在最该停掉什么？」他回：「你不敢停的那个。」你盯着屏幕坐了十分钟，然后打开了那个项目的后台。'
      },
      {
        id: 'postpone',
        label: '改天再约：等手头忙完',
        hint: '压力 +2——「忙完」是复盘里最贵的一个词',
        effects: [{ k: 'stress', op: '+', v: 2 }],
        results: '你回「过阵子约」。三个月后你想约时，他在国外带新项目——一句话的价，你多交了一个季度的学费。'
      }
    ]
  },

  {
    id: 'social-peer-collab',
    title: '同行抛来合作：联名还是互换',
    body: '做 AI 效率工具的同行私信你：「你们内容做得好，我们产品缺曝光。联名一篇深度测评，或者互换渠道？」对方 4 万粉，垂直度比你高。同行不是冤家的部分，是同行。',
    cat: 'social',
    when: [['day', '>=', 12]],
    weight: 7,
    cooldownDays: 30,
    choices: [
      {
        id: 'co-brand',
        label: '联名深度测评：各署各的名',
        hint: 'B站粉 +80~180，表达经验 +5，AP -1',
        effects: [
          { k: 'followers.bilili', op: '+', v: [80, 180] },
          { k: 'skillExp.expression', op: '+', v: 5 },
          { k: 'ap', op: '+', v: -1 }
        ],
        results: '你们合写了一篇一万字实测，双方渠道同步发。数据是平时的四倍，评论区第一次出现「神仙合作」——这个称号能吃半年。'
      },
      {
        id: 'swap-channels',
        label: '互换渠道：互推名单交换',
        hint: '人脉 +1，信息 +3——轻合作，低成本',
        effects: [
          { k: 'contacts', op: '+', v: 1 },
          { k: 'info', op: '+', v: 3 }
        ],
        results: '你们互相在次条推了对方两周。各涨了几百粉，顺手还交换了两份甲方黑名单——这个更值钱。'
      },
      {
        id: 'politely-pass',
        label: '婉拒：调性不合，别硬凑',
        hint: '情绪 +1——合作的反面教材很贵，不亲自当',
        effects: [{ k: 'mood', op: '+', v: 1 }],
        results: '你看了一眼对方最近的画风，客气地回绝了。一个月后他那篇联名稿因为数据注水翻车——你关掉了页面，没说「幸好」。'
      }
    ]
  },

  {
    id: 'social-friend-startup',
    title: '朋友创业拉伙：「兼职也要你」',
    body: '大学室友要辞职做宠物智能用品，方案写了两万字，缺一个懂技术的合伙人。「股份好说，15%，不用全职，周末把关就行。」他眼睛里有光——你认得那种光，三年前的你也有。',
    cat: 'social',
    when: [['day', '>=', 20]],
    weight: 6,
    cooldownDays: 40,
    choices: [
      {
        id: 'join-parttime',
        label: '兼职入伙：周末投入，占股 15%',
        hint: '现金 -10000~-20000（入股），压力 +6，人脉 +1——两个老板都会累',
        effects: [
          { k: 'cash', op: '+', v: [-10000, -20000] },
          { k: 'stress', op: '+', v: 6 },
          { k: 'contacts', op: '+', v: 1 }
        ],
        results: '你入了 1.5 万。前三个月每周烧掉你两个周末，第四个月产品上线——你们在出租屋里碰了杯可乐。累是真的，但有种东西回来了。'
      },
      {
        id: 'advisor',
        label: '只当参谋：每周一小时，不入股',
        hint: '认知 +2，情绪 +1——帮忙不绑船',
        effects: [
          { k: 'cognition', op: '+', v: 2 },
          { k: 'mood', op: '+', v: 1 }
        ],
        results: '你每周日给他一小时，挑毛病、对需求、劝他砍功能。半年后他给你转了个红包：「外部视角救了这项目两次。」'
      },
      {
        id: 'decline-friend',
        label: '拒绝：「我的仗还没打完」',
        hint: '品性 +1，压力 +2——拒绝需要一句诚实的话',
        effects: [
          { k: 'character', op: '+', v: 1 },
          { k: 'stress', op: '+', v: 2 }
        ],
        results: '你说：「我现在自顾不暇，掺进来是害你。」他沉默了一会儿，说「你这话比别人夸我十句都有用」。友谊没伤，反而更深了。'
      }
    ]
  },

  {
    id: 'social-family-pressure',
    title: '家庭聚餐：「你这算什么工作」',
    body: '饭桌上，姑父第三次问你「到底是干啥的」——没有工牌、没有同事、没有单位。「自由职业」这四个字在饭桌上翻译不了。妈妈帮你挡了一句，声音里带着自己都没察觉的心虚。你低头扒饭，听着亲戚聊起谁家孩子「考上了编制」。',
    cat: 'social',
    when: [['day', '>=', 10]],
    weight: 7,
    cooldownDays: 30,
    choices: [
      {
        id: 'show-books',
        label: '摊牌：把收入流水给爸妈看',
        hint: '情绪 +3，压力 -4，品性 +2——数字是唯一的方言',
        effects: [
          { k: 'mood', op: '+', v: 3 },
          { k: 'stress', op: '+', v: -4 },
          { k: 'character', op: '+', v: 2 }
        ],
        results: '饭后你把后台收入图给爸妈看了。爸爸看了很久，问「这个月是真的？」，你说「往后每个月都在这」。他没再说话，但第二天他跟姑姑说：「孩子做的那个，是正经公司。」'
      },
      {
        id: 'debate',
        label: '争辩：「编制不一定是唯一答案」',
        hint: '压力 +8，情绪 -5——饭桌上赢不了认知战',
        effects: [
          { k: 'stress', op: '+', v: 8 },
          { k: 'mood', op: '+', v: -5 }
        ],
        results: '你引用了三个数据、两个案例，最后姑父说「反正我不信」。你赢了道理，输了气氛。回家路上，妈妈说「下次别较劲」——她也没站在你这边，也没站在对面。'
      },
      {
        id: 'silence',
        label: '沉默：低头吃饭，把钱挣出来再说',
        hint: '情绪 -4，压力 +5——有些理解，只能用结果兑换',
        effects: [
          { k: 'mood', op: '+', v: -4 },
          { k: 'stress', op: '+', v: 5 }
        ],
        results: '你把那顿饭吃完了，一个字没争。回程地铁上你定了条新的月目标——不是为了证明给谁看，是因为沉默的成本要有人付。'
      }
    ],
    oldZhang: '账本合上之前，先写下三个数字：收入、支出、欠谁的。'
  },

  {
    id: 'social-community-rescue',
    title: '社群求助：新手在问你会的问题',
    body: '独立开发社群里，一个新人把「怎么接第一单」问成了三百字小作文，@了三个大佬都没回。你入行第一年问过一模一样的问题，当年回答你的人，现在已不在群里。',
    cat: 'social',
    when: [['day', '>=', 8]],
    weight: 8,
    cooldownDays: 25,
    choices: [
      {
        id: 'answer-well',
        label: '认真回答：写成一篇可复用的帖子',
        hint: '影响力 +3，人脉 +1，表达经验 +4——回答别人是整理自己',
        effects: [
          { k: 'influence', op: '+', v: 3 },
          { k: 'contacts', op: '+', v: 1 },
          { k: 'skillExp.expression', op: '+', v: 4 }
        ],
        results: '你写了篇《第一单从哪来》，被群主设了精华。三个月后那位新人成了你的付费学员——影响力这条线，就是这么长出来的。'
      },
      {
        id: 'lurk',
        label: '潜水：划过去',
        hint: '信息 +2——至少你看到了问题，也算复习',
        effects: [{ k: 'info', op: '+', v: 2 }],
        results: '你划过去了，顺手点了个赞。那个问题你自己也重新想了一遍——有些答案，写给别人的时候才清楚。'
      },
      {
        id: 'drop-ad',
        label: '顺手发个自己的课程链接',
        hint: 'B站粉 +10~40，口碑 -3——把求助池当鱼塘，池子记得住',
        effects: [
          { k: 'followers.bilili', op: '+', v: [10, 40] },
          { k: 'rep', op: '+', v: -3 }
        ],
        results: '链接发了，进来 20 个人。三天后有人把你挂到了「营销号行为大赏」——群是一个声誉系统，你怎么对待它，它就怎么定价你。'
      }
    ]
  },

  // ============================================================
  // 十一、机会与危机：12 条（机会 6 + 危机 6；前两条为 S3 抽样基准池的 day1 成员）
  // ============================================================

  {
    id: 'opp-ai-package',
    title: '客户想包月买你的自动化',
    body: '一位老客户发来消息：「你们那套自动回复能不能给我们公司也部署一套？按月付。」——AI 浪潮把你的手艺变成了可以复售的服务。',
    cat: 'opportunity',
    when: [['stage', '>=', 1]], // S3 抽样基准：day1 池成员（另一个是 crisis-ai-crackdown）
    weight: 12,
    once: true,
    choices: [
      {
        id: 'accept',
        label: '接下：先收三个月',
        hint: '现金立刻到账，但两天后平台开始清查 AI 内容',
        effects: [{ k: 'cash', op: '+', v: [3000, 6000] }, { k: 'rep', op: '+', v: 2 }],
        results: '合同签了，首付款到账。你在收款提示音里听见了未来的声音——和某种隐隐的不安。',
        chain: [{ event: 'crisis-ai-crackdown', delayDays: 2 }]
      },
      {
        id: 'refine',
        label: '先打磨再报价',
        hint: '错过热钱，攒下底气',
        effects: [{ k: 'cognition', op: '+', v: 3 }, { k: 'stress', op: '+', v: 2 }],
        results: '你回了个「在做了」。热钱会等吗？不知道。但你把方案又改了一版。'
      },
      {
        id: 'walkaway',
        label: '取消：今天不谈这个',
        effects: [],
        results: '你关掉了对话框。世界继续转，没有等你。'
      }
    ],
    oldZhang: '风口上的钱最烫手，接住的人先学会不喊疼。'
  },

  {
    id: 'opp-haggle',
    title: '客户砍价：「能便宜点吗，下次还找你」',
    body: '谈了三轮的单子卡在最后一步：客户要求总价降 12%，¥18,000 的单子要抹掉两千多。对话框里他打了个笑脸：「预算真就这些，下次大单还找你。」——「下次」是这个行业里最便宜的货币。',
    cat: 'opportunity',
    when: [['day', '>=', 8]],
    weight: 9,
    cooldownDays: 15,
    choices: [
      {
        id: 'discount',
        label: '降 10%：留住这个客户',
        hint: '现金 +2200~3800（折后款），压力 +3——现金流优先',
        effects: [
          { k: 'cash', op: '+', v: [2200, 3800] },
          { k: 'stress', op: '+', v: 3 }
        ],
        results: '你说「最多 10%，这是交情价」。合同当天签了。他的「下次」半年后真来了——还是砍价，这次你有了心理价位。'
      },
      {
        id: 'hold-gift',
        label: '守价：不降价，加一项服务',
        hint: '现金 +3000~5000，AP -1，口碑 +1——价格守住了，价值加码了',
        effects: [
          { k: 'cash', op: '+', v: [3000, 5000] },
          { k: 'ap', op: '+', v: -1 },
          { k: 'rep', op: '+', v: 1 }
        ],
        results: '你说「价格不动，我多给你们做一版 A/B 方案」。他犹豫了一晚，签了。三个月后他跟别人介绍你：「便宜的那个后来都返工了。」'
      },
      {
        id: 'walk',
        label: '走人：报价即底线',
        hint: '品性 +2，压力 +2——守住的价格，是下一次的起价',
        effects: [
          { k: 'character', op: '+', v: 2 },
          { k: 'stress', op: '+', v: 2 }
        ],
        results: '你说「那再看看别家」。一周后他回来了，全价签的——去别家问了一圈，便宜的两天就没了消息。'
      }
    ]
  },

  {
    id: 'opp-big-client',
    title: '大客户：订单额顶你三个月流水',
    body: '一家连锁企业找来：定制一套门店智能问答系统，合同额 ¥42,000，要求 45 天交付、提供一年维护。这是你成立以来最大的单子。对方的采购流程很正规，正规得像一个筛子——筛掉接不住的人。',
    cat: 'opportunity',
    when: [['day', '>=', 15], ['stage', '>=', 2]],
    weight: 8,
    cooldownDays: 25,
    choices: [
      {
        id: 'take-full',
        label: '全接：45 天，拼命干',
        hint: '现金 +8000~15000（首期），AP -2，压力 +8，20 天后可能遭遇拖欠',
        effects: [
          { k: 'cash', op: '+', v: [8000, 15000] },
          { k: 'ap', op: '+', v: -2 },
          { k: 'stress', op: '+', v: 8 }
        ],
        chain: [{ event: 'crisis-client-delay', delayDays: 20 }],
        results: '你签了。当天晚上你把未来 45 天排成了甘特图——图很满，满得像一张考卷。'
      },
      {
        id: 'milestone',
        label: '接，但谈里程碑：3-3-3-1 分期',
        hint: '现金 +3000~6000（首期），口碑 +2，25 天后才轮到拖欠风险',
        effects: [
          { k: 'cash', op: '+', v: [3000, 6000] },
          { k: 'rep', op: '+', v: 2 }
        ],
        chain: [{ event: 'crisis-client-delay', delayDays: 25 }],
        results: '你提出 30/30/30/10 的分期，对方法务挑了两处措辞后同意了。大单落地成四张小合同——风险的形状变了，你睡得着了。'
      },
      {
        id: 'decline-big',
        label: '放弃：接不住的单是负资产',
        hint: '压力 -2，情绪 +2——知道自己接不住，是一种能力',
        effects: [
          { k: 'stress', op: '+', v: -2 },
          { k: 'mood', op: '+', v: 2 }
        ],
        results: '你推荐了两个同行并收了介绍费 ¥2,000。大单走了，你手头的小项目按时交付——不是每个机会都是你的机会。'
      }
    ]
  },

  {
    id: 'opp-mini-viral',
    title: '内容小爆：那条讲踩坑的帖子进了推荐池',
    body: '你随手写的《AI 自动化落地十大坑》一夜之间过了 10 万曝光，评论 300 多条，私信 40 封。数据曲线陡得不像你的号。流量的窗口期一般 72 小时——怎么接，决定这波是浪还是雨。',
    cat: 'opportunity',
    when: [['day', '>=', 8]],
    weight: 9,
    cooldownDays: 12,
    choices: [
      {
        id: 'follow-up',
        label: '趁热追更：连发三条续集',
        hint: 'B站粉 +200~600，压力 +6，睡眠 -4——窗口期不等人',
        effects: [
          { k: 'followers.bilili', op: '+', v: [200, 600] },
          { k: 'stress', op: '+', v: 6 },
          { k: 'sleep', op: '+', v: -4 }
        ],
        results: '你熬了两个晚上连发三条。第二条也过了 5 万——窗口期被你吃到了七成。第三条扑了，但粉已经进了池子。'
      },
      {
        id: 'harvest-private',
        label: '接进私域：把流量变成名单',
        hint: '公众号粉 +40~120，私域化起步 0.2，AP -1',
        effects: [
          { k: 'followers.wechat', op: '+', v: [40, 120] },
          { k: 'flag.privateDomain', op: '=', v: 0.2 },
          { k: 'ap', op: '+', v: -1 }
        ],
        results: '你在评论区置顶了「完整版文档」，让 1,100 个人关注了公众号才发。热搜会冷，名单不会。'
      },
      {
        id: 'stay-calm',
        label: '平常心：爆一次不算数',
        hint: '情绪 +2——把爆款当抽样，别当实力',
        effects: [{ k: 'mood', op: '+', v: 2 }],
        results: '你发了条「谢谢」就没再管。一周后曲线回落，你没失落——你知道自己没接住，也知道自己没被摔着。'
      }
    ]
  },

  {
    id: 'opp-old-client-referral',
    title: '转介绍：老客户把你推给了同行',
    body: '两年前的老客户在行业群里@你：「他们的自动化方案我们用了两年，靠谱，有需要的直接找。」三小时内，四个同行加了你好友，其中一个开口就是「预算没问题，要快」。转介绍是唯一没有获客成本的渠道。',
    cat: 'opportunity',
    when: [['day', '>=', 8]],
    weight: 7,
    cooldownDays: 30,
    choices: [
      {
        id: 'take',
        label: '接下最快的那个：要快是需求，不是毛病',
        hint: '现金 +3000~7000，口碑 +2——老客户的信用可以直接变现',
        effects: [
          { k: 'cash', op: '+', v: [3000, 7000] },
          { k: 'rep', op: '+', v: 2 }
        ],
        results: '两周交付，验收一次过。对方在同一个群里又@了你一次：「真靠谱。」转介绍会自己生长——只要第一颗种子是真的。'
      },
      {
        id: 'broker',
        label: '转给同行：抽 10% 介绍费',
        hint: '现金 +1000~3000，人脉 +1，道德 +2——接不下的单，别占着',
        effects: [
          { k: 'cash', op: '+', v: [1000, 3000] },
          { k: 'contacts', op: '+', v: 1 },
          { k: 'morality', op: '+', v: 2 }
        ],
        results: '你把单子介绍给了产能更空的同行，收了介绍费。两边的客户都感谢了你——「渠道」这个资产，就是这样攒出来的。'
      },
      {
        id: 'slow-burn',
        label: '缓一缓：这周产能满了',
        hint: '压力 -1——说不，才有产能说下一次',
        effects: [{ k: 'stress', op: '+', v: -1 }],
        results: '你如实说「两周后可以开工」。两个等不了的去了别处，两个等了——等你的人，往往是最优质的客户。'
      }
    ]
  },

  {
    id: 'opp-competitor-closed',
    title: '对手倒闭了：他的客户群在找人',
    body: '做了四年、比你早入行的那个同行宣布停止运营，公告写着「现金流断裂，感谢相伴」。他遗留的 600 人客户群炸了锅：有人要售后，有人要数据迁移，有人已经在问「你做不做同样的东西」。',
    cat: 'opportunity',
    when: [['day', '>=', 25]],
    weight: 6,
    once: true,
    choices: [
      {
        id: 'absorb',
        label: '接盘：推出「平价迁移方案」',
        hint: '现金 +4000~9000，AP -1，压力 +5——别人退出的市场，接得稳是本事',
        effects: [
          { k: 'cash', op: '+', v: [4000, 9000] },
          { k: 'ap', op: '+', v: -1 },
          { k: 'stress', op: '+', v: 5 }
        ],
        results: '你的迁移套餐 ¥999/户，一周接了 23 户。客服群从「求安慰」变成了「求排期」——你用两周吃下别人四年的尾巴。'
      },
      {
        id: 'learn-dinner',
        label: '请他吃饭：把倒闭的原因问清楚',
        hint: '现金 -300，认知 +3，人脉 +1——失败者的一句话，值十篇复盘',
        effects: [
          { k: 'cash', op: '+', v: -300 },
          { k: 'cognition', op: '+', v: 3 },
          { k: 'contacts', op: '+', v: 1 }
        ],
        results: '饭吃了三小时。他说的三个教训里有一个击中了你：「我是死在维护欠账上的——接的单太多，养的项目太糙。」你回去当晚就清了两个僵尸项目。'
      },
      {
        id: 'feel-nothing',
        label: '围观：市场自己会再分配',
        hint: '情绪 +1——不是每个机会都要伸手',
        effects: [{ k: 'mood', op: '+', v: 1 }],
        results: '你围观了整场迁移潮，一单没接。手头的版本照常发——市场再分配的时候，把自己分内的事做完，也是一种仓位。'
      }
    ]
  },

  {
    id: 'crisis-plagiarized',
    title: '被抄袭：你的爆款被洗成了他的',
    body: '有粉丝私信你一条链接：某个 40 万粉的账号把你的爆款拆解文「洗」了一遍——结构一样、案例一样、金句改了三个字，发布时间比你晚 9 天。他的数据是你的 4 倍。评论区已经有人开始骂你「抄袭他」。',
    cat: 'crisis',
    when: [['day', '>=', 12]],
    weight: 8,
    cooldownDays: 25,
    choices: [
      {
        id: 'public-defend',
        label: '公开维权：时间戳对比，一次讲清',
        hint: '微博粉 +100~300，AP -1，压力 +8——舆论战能赢，很费人',
        effects: [
          { k: 'followers.weibo', op: '+', v: [100, 300] },
          { k: 'ap', op: '+', v: -1 },
          { k: 'stress', op: '+', v: 8 }
        ],
        results: '你发了对比长图：草稿时间、创作记录、原始素材。对面删文道歉，你涨了三千粉——大多数是「为公道而来」的人。累，但值。'
      },
      {
        id: 'private-warning',
        label: '私下警告：先礼后兵',
        hint: '压力 +4，口碑 +1——低成本的第一次警告',
        effects: [
          { k: 'stress', op: '+', v: 4 },
          { k: 'rep', op: '+', v: 1 }
        ],
        results: '你发了原创存档和律师函模板。他秒删，没有道歉，也没有再抄你。有些胜利没有掌声，只有安静。'
      },
      {
        id: 'let-slide',
        label: '算了：流量会证明长期主义',
        hint: '情绪 -5，压力 +3——忍气的人要真的能吞下去',
        effects: [
          { k: 'mood', op: '+', v: -5 },
          { k: 'stress', op: '+', v: 3 }
        ],
        results: '你忍了。那个号又洗了你两篇，数据一篇比一篇好。你每刷到一次就难受一次——「算了」两个字，说出口容易，咽下去很难。'
      }
    ]
  },

  {
    id: 'crisis-client-delay',
    title: '客户拖欠：尾款第 20 天，「在走流程」',
    body: '约定的付款日过了 20 天，¥12,000 尾款的口径从「这两天」变成「在走流程」，再变成「财务出差了」。你算了一下，这笔钱够下个月的房租。催款的分寸是门手艺：催轻了没用，催重了把关系和尾款一起催没了。',
    cat: 'crisis',
    when: [['day', '>=', 10]],
    weight: 9,
    cooldownDays: 20,
    choices: [
      {
        id: 'stop-deliver',
        label: '停工催款：暂停维护，发正式函',
        hint: '现金 +1000~3000（追回部分），压力 +5——合同是你的底气',
        effects: [
          { k: 'cash', op: '+', v: [1000, 3000] },
          { k: 'stress', op: '+', v: 5 }
        ],
        results: '你发了《暂停服务告知函》，语气冷静、条款清楚。第 26 天尾款到账 70%，备注「余下月底」。对方没生气——守规矩的人反而被尊重。'
      },
      {
        id: 'expose',
        label: '挂出来：发圈 + 群里点名',
        hint: '公众号粉 +20~80，道德 -6，30 天后道德清算——流量有价，手段也有价',
        effects: [
          { k: 'followers.wechat', op: '+', v: [20, 80] },
          { k: 'morality', op: '+', v: -6 }
        ],
        chain: [{ event: 'gray-clearing-moral', delayDays: 30 }],
        results: '你的檄文收了两百个赞，尾款三天后到账。但同一张截图也传到了两个潜在客户的群里——有人开始问「跟他合作会不会被挂」。'
      },
      {
        id: 'legal-letter',
        label: '发律师函：走正式流程',
        hint: '现金 -800~-2000（成本），追回 +0~4000，压力 +6——正式，但慢',
        effects: [
          { k: 'cash', op: '+', v: [-800, -2000] },
          { k: 'cash', op: '+', v: [0, 4000] },
          { k: 'stress', op: '+', v: 6 }
        ],
        results: '律师函发出去第九天，对方全额付款外加一句「抱歉，流程确实慢」。律师费 ¥1,500——你把它记成了「渠道维护费」。'
      }
    ],
    oldZhang: '先收款后交付。感情可以赊账，现金流不可以。'
  },

  {
    id: 'crisis-outsourcer-vanish',
    title: '外包跑路：头像再也没亮过',
    body: '负责前端的外包失联第三天：微信不回、电话关机、交付平台最后登录停在 11 天前。项目下周五要演示，他有 40% 的页面没交。你翻出合同——尾款没付，是他怕你赖账跑路的概率，和你怕他跑路的概率，昨天起对等了。',
    cat: 'crisis',
    when: [['day', '>=', 15], ['projectCount', '>=', 1]],
    weight: 7,
    cooldownDays: 30,
    choices: [
      {
        id: 'takeover-self',
        label: '自己接盘：白天本职，晚上补他的活',
        hint: 'AP -2，压力 +8，造物经验 +6，项目欠账 -15——累，但可控',
        effects: [
          { k: 'ap', op: '+', v: -2 },
          { k: 'stress', op: '+', v: 8 },
          { k: 'skillExp.craft', op: '+', v: 6 },
          { k: 'projectMaintenance', op: '+', v: -15 }
        ],
        results: '五个晚上，你把他 40% 的活啃完了 32%。演示当天客户没看出缺口——你第一次庆幸自己「什么都会一点」。'
      },
      {
        id: 'new-outsourcer',
        label: '紧急找新外包：价高者得',
        hint: '现金 -3000~-6000，项目进度 -10——应急溢价是跑路的税',
        effects: [
          { k: 'cash', op: '+', v: [-3000, -6000] },
          { k: 'projectProgress', op: '+', v: -10 }
        ],
        results: '新外包接了，加急费上浮 40%，交期还是拖了三天。演示改期，客户没说什么——但你知道，这页翻过去会留折痕。'
      },
      {
        id: 'cut-loss',
        label: '砍掉演示：跟客户如实坦白',
        hint: '现金 -1000~-3000，情绪 -4——诚实止损，快刀不疼',
        effects: [
          { k: 'cash', op: '+', v: [-1000, -3000] },
          { k: 'mood', op: '+', v: -4 }
        ],
        results: '你主动坦白并推了演示两周，赔偿了 5%。客户说「提前说就好」。跑路的人带走的是代码，你保住的是信用。'
      }
    ]
  },

  {
    id: 'crisis-laptop-dead',
    title: '电脑没了：蓝屏，然后是黑的',
    body: '开机第三声异响之后，屏幕永远地黑了。硬盘里躺着两个未提交的项目文件和三年没整理的素材库。你算过账：换新的 ¥9,000 起，修理 ¥1,500 且不保数据，手机尚能应急——应急的意思是，什么都慢十倍。',
    cat: 'crisis',
    when: [['day', '>=', 10]],
    weight: 7,
    cooldownDays: 45,
    choices: [
      {
        id: 'new-machine',
        label: '直接换新：预算拉满，硬盘一并升级',
        hint: '现金 -6000~-12000，压力 +4——一步到位，三天恢复',
        effects: [
          { k: 'cash', op: '+', v: [-6000, -12000] },
          { k: 'stress', op: '+', v: 4 }
        ],
        results: '新机三天到货，数据从云盘恢复了 90%。你顺手把备份策略改成了「3-2-1」——这份 ¥10,000 的学费里，总算包含一门课。'
      },
      {
        id: 'repair',
        label: '修：拆机、恢复数据、凑合再用',
        hint: '现金 -800~-2000，压力 +6，项目进度 -8——省钱花的是时间',
        effects: [
          { k: 'cash', op: '+', v: [-800, -2000] },
          { k: 'stress', op: '+', v: 6 },
          { k: 'projectProgress', op: '+', v: -8 }
        ],
        results: '修理店五天取件，数据恢复了七成，风扇声比以前大了。你删掉了三个 G 的素材腾出空间——凑合的日子，从开机那声异响开始。'
      },
      {
        id: 'cyber-cafe',
        label: '网吧/图书馆过渡一周',
        hint: '现金 -100，压力 +10，睡眠 -4——¥100 的一周，¥2,000 的效率',
        effects: [
          { k: 'cash', op: '+', v: -100 },
          { k: 'stress', op: '+', v: 10 },
          { k: 'sleep', op: '+', v: -4 }
        ],
        results: '网吧包夜 ¥35，环境音是键盘和呼噜。你在第七天凑齐了换机的钱——这一周的效率损失，比新机器贵。'
      }
    ]
  },

  {
    id: 'crisis-rent-up',
    title: '房租涨价：房东的「随行就市」',
    body: '续约通知贴在门上：下月起租金 +12%，理由是「片区均价涨了」。你查了链家——没涨，是他新收的两套房挂高了价。你的工作室兼卧室，过去两年涨过一次水电，这次轮到了本体。',
    cat: 'crisis',
    when: [['day', '>=', 20]],
    weight: 6,
    cooldownDays: 60,
    choices: [
      {
        id: 'move-town',
        label: '搬去小城：把成本砍一半',
        hint: '现金 -2000~-4000（搬家费），压力 -3，情绪 +2——地理套利是真的',
        effects: [
          { k: 'cash', op: '+', v: [-2000, -4000] },
          { k: 'stress', op: '+', v: -3 },
          { k: 'mood', op: '+', v: 2 }
        ],
        results: '你认真研究了大理和老家的房租，做了张成本对比表。搬不搬另说，这张表让那 12% 看起来没那么可怕——选择权是压价的一部分。'
      },
      {
        id: 'swallow',
        label: '忍了：搬家比涨价贵',
        hint: '现金 -1000~-2000（分摊），压力 +4——忍让是续约的一部分',
        effects: [
          { k: 'cash', op: '+', v: [-1000, -2000] },
          { k: 'stress', op: '+', v: 4 }
        ],
        results: '你签了新约，谈下了免租半月。回去算了下账：房租占比从 22% 涨到 25%——红线是 30%，还活着，但更挤了。'
      },
      {
        id: 'negotiate',
        label: '谈判：拿数据、拿续约长度换价',
        hint: '现金 -300~-800，压力 +3，品性 +1——谈判桌上数据比嗓门有用',
        effects: [
          { k: 'cash', op: '+', v: [-300, -800] },
          { k: 'stress', op: '+', v: 3 },
          { k: 'character', op: '+', v: 1 }
        ],
        results: '你带着同小区成交记录和两年按时交租的记录去谈。最终 +6% 成交，签了两年的锁价条款——你省下的那 6%，比任何一次砍价都值。'
      }
    ]
  },

  {
    id: 'crisis-blackswan',
    title: '黑天鹅：一纸新规，连夜生效',
    body: '深夜突发：你所在的平台品类被新规点名，「相关服务需重新资质审核，过渡期 7 天」。群里一片「完了」，同行在连夜改说明页，你的两个客户同时发来消息：「咱们这单还合法吗？」——你没答案，但你有 7 天。',
    cat: 'crisis',
    when: [['day', '>=', 30], ['random', '<', 0.03]],
    weight: 7,
    cooldownDays: 60,
    choices: [
      {
        id: 'war-game',
        label: '做现金流演习：按最坏情况排 30 天',
        hint: '信息 +5，认知 +3，压力 +4——黑天鹅考的从来是底牌',
        effects: [
          { k: 'info', op: '+', v: 5 },
          { k: 'cognition', op: '+', v: 3 },
          { k: 'stress', op: '+', v: 4 }
        ],
        results: '你按「停摆 30 天」做了压力测试：砍掉两项支出、盘出可变现资产、给客户发了合规说明。新规最终波及的是隔壁品类——但你的预案留下了，下次还能用。'
      },
      {
        id: 'panic-scroll',
        label: '焦虑刷帖：看别人怎么办',
        hint: '压力 +9，睡眠 -5——信息过载是焦虑的自助餐',
        effects: [
          { k: 'stress', op: '+', v: 9 },
          { k: 'sleep', op: '+', v: -5 }
        ],
        results: '你刷到凌晨四点，收藏了 40 条互相矛盾的解读。新规落地那天你发现：最早行动的人，都在睡觉的时候。'
      },
      {
        id: 'contingency',
        label: '做最坏预案：客户话术 + 退路清单',
        hint: 'AP -1，压力 +6，品性 +2——先安客户，再安自己',
        effects: [
          { k: 'ap', op: '+', v: -1 },
          { k: 'stress', op: '+', v: 6 },
          { k: 'character', op: '+', v: 2 }
        ],
        results: '你连夜写好三版客户话术和一条转私域的退路。第二天一早逐个通知，客户回复「有你这句话我就放心了」——黑天鹅面前，确定性本身就是服务。'
      }
    ]
  },

  // ---------- [v0.10/W9] 作者彩蛋（机会类，低权重，once；克制，不出戏） ----------
  {
    id: 'egg-laijiacheng-site',
    title: '收藏夹里的建站教程',
    body: '你翻收藏夹翻到一篇老教程：laijiacheng.com 上的一人公司建站实录，从买域名到备案再到收款的每一步都写了参数和价格。教程末尾有一行小字：「本站全部代码像素，零素材。」你决定照着搭一遍自己的独立站。',
    cat: 'opportunity',
    when: [['day', '>=', 10]],
    weight: 3,
    once: true,
    choices: [
      {
        id: 'follow-tutorial',
        label: '照着教程搭独立站',
        hint: '独立站粉 +60~160，私域化率起步 0.2，信息 +2',
        effects: [
          { k: 'followers.site', op: '+', v: [60, 160] },
          { k: 'flag.privateDomain', op: '=', v: 0.2 },
          { k: 'info', op: '+', v: 2 }
        ],
        results: '一个周末，域名、备案、收款码全部跑通。网站很朴素，但每个字节都是你的。教程作者不知道你的存在——不过互联网的好处就是：好东西会自己长腿。'
      },
      {
        id: 'bookmark-it',
        label: '先收藏：手头的事还没完',
        hint: '信息 +1——收藏夹是梦想的坟场，也是弹药库',
        effects: [{ k: 'info', op: '+', v: 1 }],
        results: '你点了收藏，回去继续干活。教程躺在收藏夹里，像一张写了日期的船票。'
      }
    ],
    oldZhang: '我认识一个叫赖嘉诚的年轻人，也爱把步骤写给别人看。写教程的都懂：教是最好的学。'
  }
];

export function findEventDef(id: string): EventDef | undefined {
  return EVENT_DEFS.find(e => e.id === id);
}

