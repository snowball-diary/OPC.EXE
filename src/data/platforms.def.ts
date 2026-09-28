// 平台政策表（设计方案 §七：接入操作手册 v1.1 真实调研；技术文档 §10）
// banRiskBase=政策风险系数（xhs 最危险 1.6；site=0 封不了号）；mRate=日变现系数（元/粉/日）
// delayHours=一鱼八吃分发延迟：0/24/72 → 当日/次日/三日三批
import type { PlatformDef } from '../core/types';

export const PLATFORM_DEFS: PlatformDef[] = [
  {
    id: 'bilili', name: 'B站', flowMult: 1.2, delayHours: 0, banRiskBase: 0.5,
    monetize: ['充电', '广告分层'], mRate: 0.006,
    note: '中高流量，社区生态相对宽容，适合首发长内容。'
  },
  {
    id: 'wechat', name: '公众号', flowMult: 0.8, delayHours: 24, banRiskBase: 0.4,
    monetize: ['打赏', '付费阅读'], mRate: 0.008,
    note: '私域沉淀主阵地：粉丝留得住，封号损失最小。依托微信生态。'
  },
  {
    id: 'xhs', name: '小红书', flowMult: 1.4, delayHours: 72, banRiskBase: 1.6,
    monetize: ['带货'], mRate: 0.01,
    note: '最危险：限流/封号最狠（风险系数 1.6）。流量高，带货强，脖子也最容易被掐。'
  },
  {
    id: 'zhihu', name: '知乎', flowMult: 1.0, delayHours: 72, banRiskBase: 0.7,
    monetize: ['知+', '付费咨询'], mRate: 0.005,
    note: '内容质量权重高：长尾流量稳，爆发弱。'
  },
  {
    id: 'douyin', name: '抖音', flowMult: 2.0, flowVar: 2.5, delayHours: 0, banRiskBase: 1.0,
    monetize: ['广告', '电商'], mRate: 0.008,
    note: '流量极高但头部效应最强：方差大，要么起飞要么石沉大海。'
  },
  {
    id: 'weibo', name: '微博', flowMult: 1.0, delayHours: 0, banRiskBase: 0.8,
    monetize: ['广告'], mRate: 0.004,
    note: '热点驱动：蹭对热搜一夜起量，蹭不对就是自言自语。'
  },
  {
    id: 'youtube', name: 'YouTube', flowMult: 1.6, delayHours: 24, banRiskBase: 0.3,
    monetize: ['广告分成（最高）'], mRate: 0.012,
    note: '出海线：广告分成最高，政策最稳。需海外/游牧 location，国内运营流量×0.3。'
  },
  {
    id: 'site', name: '独立站', flowMult: 0.5, delayHours: 24, banRiskBase: 0,
    monetize: ['全部归自己'], mRate: 0.01,
    note: '低启动慢增长：靠 SEO/GEO 慢慢熬，但没有平台能封你的号（banRisk=0），费率为零。'
  }
];

export function findPlatform(id: string): PlatformDef | undefined {
  return PLATFORM_DEFS.find(p => p.id === id);
}
