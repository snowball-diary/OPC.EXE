// 七维开局数据（设计方案 §十三；赛道6 × 背景6 × 难度4+custom × 特质14 × 性格3轴）
// 特质点数制：cost 负数=消耗点数（增益），正数=返还点数（负担），预算 3 点（向导 S6 校验）
import type {
  BackgroundDef, DifficultyDef, NicheDef, PersonalityDef, TalentDef
} from '../core/types';

// ---------- 赛道（6） ----------

export const NICHE_DEFS: NicheDef[] = [
  {
    id: 'dev',
    name: '独立开发者',
    icon: '码',
    desc: '写代码卖软件，把手艺变成订阅。',
    bonusText: '造物 Lv1 起步，造物经验+20，信息+5（引擎钩子 flag:niche_dev：首个项目开发费-10%）',
    flags: ['niche_dev'],
    startSkills: { craft: 1 },
    effects: [
      { k: 'skillExp.craft', op: '+', v: 20 },
      { k: 'info', op: '+', v: 5 }
    ]
  },
  {
    id: 'design',
    name: '自由设计师',
    icon: '设',
    desc: '接单做设计，审美就是生产力。',
    bonusText: '造物 Lv1 起步，表达经验+15，品性+5（flag:niche_design：设计类单价+）',
    flags: ['niche_design'],
    startSkills: { craft: 1 },
    effects: [
      { k: 'skillExp.expression', op: '+', v: 15 },
      { k: 'character', op: '+', v: 5 }
    ]
  },
  {
    id: 'kol',
    name: '内容创作者',
    icon: '播',
    desc: '镜头即店面，流量即现金流。',
    bonusText: '表达 Lv1 起步，小红书自带 500 粉（flag:niche_kol：内容流量+）',
    flags: ['niche_kol'],
    startSkills: { expression: 1 },
    effects: [
      // [S8] 修 S1 数据缝：平台 id 是 'xhs'（platforms.def），原 'xiaohongshu' 会开出幽灵账号不参与任何结算
      { k: 'followers.xhs', op: '+', v: 500 },
      { k: 'skillExp.expression', op: '+', v: 10 }
    ]
  },
  {
    id: 'coach',
    name: '独立教练',
    icon: '导',
    desc: '一对一陪跑，把经验卖成课时费。',
    bonusText: '表达 Lv1 起步，商业经验+20（flag:niche_coach：谈单成功率+）',
    flags: ['niche_coach'],
    startSkills: { expression: 1 },
    effects: [
      { k: 'skillExp.business', op: '+', v: 20 },
      { k: 'contacts', op: '+', v: 2 }
    ]
  },
  {
    id: 'maker',
    name: '独立制客',
    icon: '造',
    desc: '小批量实体，从打样到发货一手包办。',
    bonusText: '造物 Lv1 起步，运营经验+15（flag:niche_maker：供应链事件友好）',
    flags: ['niche_maker'],
    startSkills: { craft: 1 },
    effects: [
      { k: 'skillExp.operation', op: '+', v: 15 },
      { k: 'character', op: '+', v: 3 }
    ]
  },
  {
    id: 'writer',
    name: '独立写作者',
    icon: '写',
    desc: '以字为生，慢，但有复利。',
    bonusText: '表达 Lv1 起步，认知+5（flag:niche_writer：出版物类项目+）',
    flags: ['niche_writer'],
    startSkills: { expression: 1 },
    effects: [
      { k: 'skillExp.expression', op: '+', v: 20 },
      { k: 'cognition', op: '+', v: 5 }
    ]
  }
];

// ---------- 背景（6） ----------

export const BACKGROUND_DEFS: BackgroundDef[] = [
  {
    id: 'grass',
    name: '草根',
    icon: '泥',
    desc: '口袋比脸干净，但没人管你怎么活。',
    baseCash: 6000,
    skills: {},
    flags: ['grass'],
    hiddenText: '无退路，也无包袱——失败成本天然最低。',
    effects: []
  },
  {
    id: 'fired',
    name: '大厂裸辞',
    icon: '辞',
    desc: '拿着 N+1 离开大厂，简历好看，心态未愈。',
    baseCash: 60000,
    skills: { craft: 2, operation: 1 },
    flags: ['severance', 'exBigTech'],
    hiddenText: '离职补偿金 + 前同事通讯录（危机时人脉事件解锁）。',
    effects: [
      { k: 'skillExp.craft', op: '+', v: 30 }
    ]
  },
  {
    id: 'system',
    name: '体制内出走',
    icon: '编',
    desc: '辞掉编制，把安全感换成可能性。',
    baseCash: 40000,
    skills: { operation: 1, business: 1 },
    flags: ['exSystem'],
    hiddenText: '单位积累的行政人脉——合规线事件可动用。',
    effects: [
      { k: 'compliance', op: '+', v: 5 }
    ]
  },
  {
    id: 'student',
    name: '学生创业',
    icon: '学',
    desc: '宿舍里开始的第一家公司。',
    baseCash: 5000,
    skills: { craft: 1 },
    flags: ['student'],
    hiddenText: '试错成本低；家人反对高（家庭电话事件加权）。',
    effects: [
      { k: 'info', op: '+', v: 10 },
      { k: 'energy', op: '+', v: 10 }
    ]
  },
  {
    id: 'second',
    name: '二次创业',
    icon: '再',
    desc: '再来一次。这次你知道哪些坑是真的。',
    baseCash: 30000,
    skills: { craft: 1, business: 1, operation: 1 },
    flags: ['secondTime'],
    hiddenText: '上一次失败的复盘笔记：同类项目风险读数更准（引擎钩子）。',
    effects: [
      { k: 'cognition', op: '+', v: 10 }
    ]
  },
  {
    id: 'veteran',
    name: '转行老兵',
    icon: '转',
    desc: '从旧行业带着手艺和焦虑转场。',
    baseCash: 35000,
    skills: { craft: 1, expression: 1 },
    flags: ['careerChanger'],
    hiddenText: '十年行业经验的可迁移部分：客户资源冷启动。',
    effects: [
      { k: 'character', op: '+', v: 8 }
    ]
  }
];

// ---------- 难度（4 + custom 预留） ----------

export const DIFFICULTY_DEFS: DifficultyDef[] = [
  {
    id: 'story',
    name: '故事',
    icon: '叙',
    desc: '事件更友好，现金宽裕——以体验故事为主。',
    cashMult: 1.5,
    livingCostMult: 0.9,
    eventFriendliness: 1.3,
    eventFrequency: 0.85
  },
  {
    id: 'normal',
    name: '标准',
    icon: '衡',
    desc: '现实的默认档：不敢让大多数局平凡收场的经营游戏都是骗人。',
    cashMult: 1.0,
    livingCostMult: 1.0,
    eventFriendliness: 1.0,
    eventFrequency: 1.0
  },
  {
    id: 'hard',
    name: '硬核',
    icon: '棘',
    desc: '现金七折，事件更频更凶。',
    cashMult: 0.7,
    livingCostMult: 1.1,
    eventFriendliness: 0.8,
    eventFrequency: 1.2
  },
  {
    id: 'insane',
    name: '地狱',
    icon: '渊',
    desc: '现实无滤镜。四成现金，五成生活费上浮，事件不加修饰。',
    cashMult: 0.4,
    livingCostMult: 1.25,
    eventFriendliness: 0.6,
    eventFrequency: 1.5
  },
  {
    id: 'custom',
    name: '自定义',
    icon: '设',
    desc: '自定义参数（预留，暂同标准）。',
    cashMult: 1.0,
    livingCostMult: 1.0,
    eventFriendliness: 1.0,
    eventFrequency: 1.0,
    custom: true
  }
];

// ---------- 特质（14，预算 3 点） ----------

export const TALENT_DEFS: TalentDef[] = [
  {
    id: 'workaholic',
    name: '工作狂',
    icon: '狂',
    cost: -2,
    desc: '扩展日惩罚减半；但隐性疲劳积累更快，过劳线离你更近。',
    flags: ['workaholic'],
    effects: [
      { k: 'skillExp.craft', op: '+', v: 10 },
      { k: 'stress', op: '+', v: 5 }
    ]
  },
  {
    id: 'socialite',
    name: '社牛',
    icon: '缘',
    cost: -1,
    desc: '开局多 2 位人脉，社交类行动效果+。',
    flags: ['socialite'],
    effects: [
      { k: 'contacts', op: '+', v: 2 }
    ]
  },
  {
    id: 'geek',
    name: '技术极客',
    icon: '极',
    cost: -1,
    desc: '造物经验+30，学技术类行动永远不觉难。',
    flags: ['geek'],
    effects: [
      { k: 'skillExp.craft', op: '+', v: 30 }
    ]
  },
  {
    id: 'perfectionist',
    name: '完美主义',
    icon: '琢',
    cost: -1,
    desc: '质量类行动+，但交付更慢、压力+。',
    flags: ['perfectionist'],
    effects: [
      { k: 'character', op: '+', v: 5 },
      { k: 'stress', op: '+', v: 5 }
    ]
  },
  {
    id: 'nightOwl',
    name: '夜猫子',
    icon: '夜',
    cost: -1,
    desc: '深夜行动不限时，睡眠子项开局-10 且漂移更快。',
    flags: ['nightOwl'],
    effects: [
      { k: 'sleep', op: '=', v: 60 }
    ]
  },
  {
    id: 'empathy',
    name: '共情力',
    icon: '悯',
    cost: -1,
    desc: '品性+10，客户类事件更多善意分支。',
    flags: ['empathy'],
    effects: [
      { k: 'character', op: '+', v: 10 }
    ]
  },
  {
    id: 'mover',
    name: '行动派',
    icon: '迅',
    cost: -2,
    desc: '精力+10，计划到执行的衰减最小。',
    flags: ['mover'],
    effects: [
      { k: 'energy', op: '+', v: 10 }
    ]
  },
  {
    id: 'zen',
    name: '佛系',
    icon: '禅',
    cost: 1,
    desc: '压力-10，但收入类行动效果×0.9（引擎钩子）。',
    flags: ['zen'],
    effects: [
      { k: 'stress', op: '+', v: -10 }
    ]
  },
  {
    id: 'phobia',
    name: '社恐',
    icon: '默',
    cost: 1,
    desc: '社交类行动效果-，独处类行动效率+。',
    flags: ['phobia'],
    effects: [
      { k: 'character', op: '+', v: 5 }
    ]
  },
  {
    id: 'spendthrift',
    name: '大手大脚',
    icon: '阔',
    cost: 1,
    desc: '所有现金支出+10%（引擎钩子）。',
    flags: ['spendthrift'],
    effects: []
  },
  {
    id: 'debtStart',
    name: '负债开局',
    icon: '债',
    cost: 2,
    desc: '开局背 2 万消费贷（信用分-30），但手头多 1 万周转金。',
    flags: ['debtStart'],
    effects: [
      { k: 'debt', op: '+', v: 20000 },
      { k: 'cash', op: '+', v: 10000 },
      { k: 'creditScore', op: '+', v: -30 }
    ]
  },
  {
    id: 'ironman',
    name: '铁人',
    icon: '铁',
    cost: -2,
    desc: '精力与运动子项+，恢复更快；仍会猝死——铁不是钢。',
    flags: ['ironman'],
    effects: [
      { k: 'energy', op: '+', v: 5 },
      { k: 'exercise', op: '+', v: 10 }
    ]
  },
  {
    id: 'lucky',
    name: '幸运儿',
    icon: '运',
    cost: -1,
    desc: '事件与抽卡掷骰小幅偏移（引擎钩子）。',
    flags: ['lucky'],
    effects: []
  },
  {
    id: 'quickLearner',
    name: '学习机器',
    icon: '悟',
    cost: -1,
    desc: '信息+10，全技能经验+10。',
    flags: ['quickLearner'],
    effects: [
      { k: 'info', op: '+', v: 10 },
      { k: 'skillExp.craft', op: '+', v: 10 },
      { k: 'skillExp.expression', op: '+', v: 10 },
      { k: 'skillExp.marketing', op: '+', v: 10 },
      { k: 'skillExp.operation', op: '+', v: 10 },
      { k: 'skillExp.business', op: '+', v: 10 }
    ]
  }
];

// ---------- 性格 3 轴（各 2 端选 1） ----------

export const PERSONALITY_DEFS: PersonalityDef[] = [
  {
    id: 'pragmatic',
    axis: 'pragmaticIdeal',
    name: '务实',
    icon: '用',
    desc: '先活下来，理想以后再说。',
    flags: ['p_pragmatic'],
    effects: [
      { k: 'cash', op: '+', v: 2000 }
    ]
  },
  {
    id: 'idealist',
    axis: 'pragmaticIdeal',
    name: '理想',
    icon: '诗',
    desc: '为热爱发电，哪怕电费自付。',
    flags: ['p_idealist'],
    effects: [
      { k: 'character', op: '+', v: 8 }
    ]
  },
  {
    id: 'steady',
    axis: 'steadyAggressive',
    name: '稳健',
    icon: '盾',
    desc: '现金流优先于增长率。',
    flags: ['p_steady'],
    effects: [
      { k: 'stress', op: '+', v: -5 }
    ]
  },
  {
    id: 'aggressive',
    axis: 'steadyAggressive',
    name: '激进',
    icon: '矛',
    desc: 'All in 是一种生活方式。',
    flags: ['p_aggressive'],
    effects: [
      { k: 'energy', op: '+', v: 5 }
    ]
  },
  {
    id: 'solo',
    axis: 'soloSocial',
    name: '独行',
    icon: '影',
    desc: '一个人就是一支队伍。',
    flags: ['p_solo'],
    effects: [
      { k: 'cognition', op: '+', v: 5 }
    ]
  },
  {
    id: 'social',
    axis: 'soloSocial',
    name: '社交',
    icon: '网',
    desc: '关系网是最早的护城河。',
    flags: ['p_social'],
    effects: [
      { k: 'contacts', op: '+', v: 1 }
    ]
  }
];

// 便捷查找（state.ts / 向导 S6 用）
export function findNiche(id: string): NicheDef | undefined {
  return NICHE_DEFS.find(d => d.id === id);
}
export function findBackground(id: string): BackgroundDef | undefined {
  return BACKGROUND_DEFS.find(d => d.id === id);
}
export function findDifficulty(id: string): DifficultyDef | undefined {
  return DIFFICULTY_DEFS.find(d => d.id === id);
}
export function findTalent(id: string): TalentDef | undefined {
  return TALENT_DEFS.find(d => d.id === id);
}
export function findPersonality(id: string): PersonalityDef | undefined {
  return PERSONALITY_DEFS.find(d => d.id === id);
}
