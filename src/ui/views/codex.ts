// 图鉴视图（S7）：成就 24（解锁态）+ 结局图鉴 17（stats.endingsSeen 点亮）+ 知识点 32
//（见过=展开全文+来源；未见过=灰显标题）+ LifeStats 统计摘要。
import type { UiCtx } from '../registry';
import { registerView } from '../registry';
import { achCount } from '../../core/achievements';
import type { StateSlice } from '../../core/types';
import { ACHIEVEMENT_DEFS } from '../../data/achievements.def';
import { ENDING_DEFS } from '../../data/endings.def';
import { KP_DEFS } from '../../data/kp.def';
import { numFmt, yuan } from '../fmt';
import { isKpSeen, markKpSeen } from '../kpseen';
import { SFX } from '../sfx';

// ---------- 纯函数（tests/s7.test.ts 覆盖） ----------

/** 成就图鉴行模型（纯函数） */
export function achievementRows(s: Readonly<StateSlice>): { id: string; name: string; desc: string; on: boolean }[] {
  return ACHIEVEMENT_DEFS.map(d => ({ id: d.id, name: d.name, desc: d.desc, on: s.flags[`ach_${d.id}`] === true }));
}

/** 结局图鉴行模型（纯函数）：见过亮起（名称+描述），未见过灰显「？？？」 */
export function endingRows(s: Readonly<StateSlice>): { key: string; name: string; desc: string; type: string; on: boolean }[] {
  const typeName = { active: '主动', passive: '被动', hidden: '隐藏' };
  return ENDING_DEFS.map(d => ({
    key: d.key,
    name: s.stats.endingsSeen.includes(d.key) ? d.name : '？？？',
    desc: s.stats.endingsSeen.includes(d.key) ? d.desc : '尚未走到这一步。',
    type: typeName[d.type] ?? d.type,
    on: s.stats.endingsSeen.includes(d.key)
  }));
}

/** KP 图鉴行模型（纯函数）：seen 展开，未 seen 只留标题 */
export function kpRows(s: Readonly<StateSlice>, seenFn: (key: string) => boolean): { key: string; title: string; text: string; source: string; on: boolean }[] {
  void s;
  return KP_DEFS.map(d => ({
    key: d.key, title: d.title,
    text: seenFn(d.key) ? d.text : '',
    source: seenFn(d.key) ? d.source : '',
    on: seenFn(d.key)
  }));
}

/** 统计摘要行（纯函数） */
export function statSummary(s: Readonly<StateSlice>): { label: string; value: string }[] {
  return [
    { label: '生涯天数', value: numFmt(s.meta.day) },
    { label: '累计收入 / 支出', value: `${yuan(Math.round(s.stats.totalRevenue))} / ${yuan(Math.round(s.stats.totalExpense))}` },
    { label: '缴税 / Token', value: `${yuan(Math.round(s.stats.taxesPaid))} / ${yuan(Math.round(s.stats.tokenSpent))}` },
    { label: '项目 完成/失败/转型', value: `${s.stats.projectsDone} / ${s.stats.projectsFailed} / ${s.stats.pivots}` },
    { label: '真实订单 / 大爆', value: `${numFmt(s.stats.orders)} / ${s.stats.bigHits}` },
    { label: '发布内容 / 见过事件', value: `${numFmt(s.stats.contentPublished)} / ${s.stats.eventsSeen}` },
    { label: '最低日 / 扩展日', value: `${s.stats.minDays} / ${s.stats.daysWorkedOut}` },
    { label: 'System1 / 健康崩坏日', value: `${s.stats.s1Days} / ${s.stats.healthBadDays}` },
    { label: '灰产交易 / 稽查', value: `${s.stats.grayDeals} / ${s.stats.audits}` },
    { label: '智能体 雇佣/事故', value: `${s.stats.agentsHired} / ${s.stats.accidents}` },
    { label: '补丁安装', value: `${s.stats.patchesInstalled}` },
    { label: '现金峰值 / 跑道峰值', value: `${yuan(s.stats.maxCash)} / ${s.stats.maxRunway} 月` }
  ];
}

// ---------- 渲染 ----------

function register(el: HTMLElement, ctx: UiCtx): void {
  const s = ctx.state;
  const ach = achievementRows(s);
  const ends = endingRows(s);
  const kps = kpRows(s, isKpSeen);
  el.innerHTML = `
    <div class="codex-view">
      <div class="panel-title">// 成就（${achCount(s)}/${ACHIEVEMENT_DEFS.length}）</div>
      <div class="ach-grid">
        ${ach.map(a => `
          <div class="ach-cell ${a.on ? 'on' : 'off'}" title="${a.desc}">
            <b>${a.on ? '★' : '☆'} ${a.name}</b>
            <small>${a.on ? a.desc : '未解锁'}</small>
          </div>`).join('')}
      </div>
      <div class="panel-title">// 结局图鉴（${s.stats.endingsSeen.length}/${ENDING_DEFS.length}）</div>
      <div class="end-grid-codex">
        ${ends.map(e => `
          <div class="end-cell ${e.on ? 'on' : 'off'}">
            <b>${e.name}</b><span class="badge">${e.type}</span>
            <small>${e.desc}</small>
          </div>`).join('')}
      </div>
      <div class="panel-title">// 知识点图鉴（灰色=未解锁，点开的与弹窗里读过的会点亮）</div>
      <div class="kp-list">
        ${kps.map(k => `
          <button class="kp-cell ${k.on ? 'on' : 'off'}" data-kp="${k.key}" ${k.on ? '' : 'disabled'}>
            <b>[${k.on ? '已解锁' : '未解锁'}] ${k.title}</b>
            ${k.on ? `<small>${k.text}</small><i class="kp-src">来源：${k.source}</i>` : '<small>在经营中遇到对应情境时，系统会把词条递到你面前。</small>'}
          </button>`).join('')}
      </div>
      <div class="panel-title">// 人生统计</div>
      <div class="stat-grid">
        ${statSummary(s).map(r => `<div class="kv"><span>${r.label}</span><b>${r.value}</b></div>`).join('')}
      </div>
      <div class="panel-title">// 关于作者</div>
      <div class="about-author px-frame">
        <p><b>赖嘉诚</b> · <a href="https://laijiacheng.com" target="_blank" rel="noopener">laijiacheng.com</a></p>
        <p>本游戏全代码像素、零素材美术、自作曲 BGM、200+ 项测试——一个人做的游戏，讲一个人做公司这件事。</p>
        <p class="dim-line">OPC.exe © 2026 Lai Jiacheng · 存档内嵌溯源字段，非官方档导入会有提示。</p>
      </div>
    </div>`;

  el.querySelectorAll<HTMLButtonElement>('button[data-kp]').forEach(b => {
    b.addEventListener('click', () => {
      markKpSeen(b.dataset.kp ?? '');
      SFX.kp();
      ctx.rerender();
    });
  });
}

registerView({
  id: 'codex',
  deps: ['stats', 'flags'],
  render: register
});
