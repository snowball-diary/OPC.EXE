// 人脉视图（S7）：联系人列表（类型徽章/关系值条/lastTouch）+ 粉丝与私域化率
// + 单平台依赖警告（platformDependency）+ 8 平台账号状态表。
import type { UiCtx } from '../registry';
import { registerView } from '../registry';
import { platformDependency } from '../../core/platforms';
import { privateDomainRate } from '../../core/platforms';
import type { Contact, StateSlice } from '../../core/types';
import { PLATFORM_DEFS } from '../../data/platforms.def';
import { numFmt, pct, segHtml } from '../fmt';

// ---------- 纯函数（tests/s7.test.ts 覆盖） ----------

export const CONTACT_TYPE_LABELS: Record<Contact['type'], string> = {
  peer: '同行', client: '客户', mentor: '导师', vendor: '供应商', investor: '投资人'
};

/** lastTouch 文案（纯函数） */
export function lastTouchText(day: number, lastTouch: number): string {
  if (lastTouch <= 0) return '从未互动';
  const gap = day - lastTouch;
  return gap <= 0 ? '今天' : `${gap} 天前`;
}

/** 粉丝合计（纯函数） */
export function totalFollowers(s: Readonly<StateSlice>): number {
  return Object.values(s.platforms).reduce((a, acc) => a + (acc?.followers ?? 0), 0);
}

/** 平台状态表行模型（纯函数） */
export function platformRow(s: Readonly<StateSlice>, pid: string): {
  id: string; exists: boolean; state: string; label: string; followers: number; banRisk: number; ai: boolean; share: number;
} {
  const acc = s.platforms[pid];
  if (!acc) return { id: pid, exists: false, state: 'none', label: '未开通', followers: 0, banRisk: 0, ai: false, share: 0 };
  const label = acc.state === 'observe'
    ? `观察期 ${acc.observeDaysLeft} 天`
    : acc.state === 'throttled' ? '限流中（×0.3）'
      : acc.state === 'banned' ? '已封禁' : '正常';
  return {
    id: pid, exists: true, state: acc.state, label,
    followers: Math.round(acc.followers), banRisk: Math.round(acc.banRisk),
    ai: acc.aiDeclared, share: acc.incomeShare
  };
}

// ---------- 渲染 ----------

function contactRow(c: Contact, day: number): string {
  const cls = c.relation >= 60 ? 'green' : c.relation < 30 ? 'orange' : '';
  return `
    <div class="ct-row">
      <span class="ct-type t-${c.type}">${CONTACT_TYPE_LABELS[c.type]}</span>
      <b class="ct-name">${c.name}</b>
      ${segHtml(c.relation, c.relation < 30 ? 'warn' : '')}
      <span class="ct-rel c-${cls}">${Math.round(c.relation)}</span>
      <span class="ct-touch dim-line">${lastTouchText(day, c.lastTouch)}</span>
    </div>`;
}

function register(el: HTMLElement, ctx: UiCtx): void {
  const s = ctx.state;
  const dep = platformDependency(s);
  const followers = totalFollowers(s);
  const rate = privateDomainRate(s);
  el.innerHTML = `
    <div class="ct-view">
      <div class="ct-summary">
        <div class="kv-grid">
          <div class="kv"><span>联系人</span><b>${s.contacts.length} 人</b></div>
          <div class="kv"><span>粉丝合计</span><b>${numFmt(followers)}</b></div>
          <div class="kv"><span>私域化率</span><b class="${rate > 0 ? 'c-green' : 'c-red'}">${pct(rate * 100)}</b></div>
          <div class="kv"><span>粉丝峰值</span><b>${numFmt(s.stats.followersPeak)}</b></div>
        </div>
        ${dep ? `<div class="dep-warn">⚠ 单平台依赖警戒：「${PLATFORM_DEFS.find(p => p.id === dep)?.name ?? dep}」收入占比 &gt;60%——该平台风控事件概率 ×3。鸡蛋别放一个篮子里，沉淀私域。</div>` : ''}
      </div>
      <div class="panel-title">// 联系人（${s.contacts.length}）</div>
      <div class="ct-list">${s.contacts.length === 0 ? '<p class="s7-hint">通讯录是空的。参加社群、商务合作、社交养关系都会往这里加人——关系是最早的护城河。</p>' : s.contacts.map(c => contactRow(c, s.meta.day)).join('')}</div>
      <div class="panel-title">// 平台账号</div>
      <div class="plat-table">
        <div class="pt-head"><span>平台</span><span>状态</span><span>粉丝</span><span>banRisk</span><span>收入占比</span><span>AI 声明</span></div>
        ${PLATFORM_DEFS.map(p => {
          const r = platformRow(s, p.id);
          return `<div class="pt-row ${r.state}">
            <span>${p.name}</span>
            <span class="${r.state === 'banned' ? 'c-red' : r.state === 'normal' ? 'c-green' : r.state === 'none' ? 'c-dim' : 'c-orange'}">${r.label}</span>
            <span>${numFmt(r.followers)}</span>
            <span class="${r.banRisk >= 60 ? 'c-red' : ''}">${r.banRisk}</span>
            <span>${pct(r.share * 100)}</span>
            <span>${!r.exists ? '—' : r.ai ? '√' : '<b class="c-orange">未声明（检测×3）</b>'}</span>
          </div>`;
        }).join('')}
      </div>
      <p class="s7-hint">平台是租来的：粉丝数不是你的资产，账号才是平台的资产。私域化率来自「沉淀私域」类事件与独立站经营，封号时按它清算粉丝。</p>
    </div>`;
}

registerView({
  id: 'contacts',
  deps: ['contacts', 'platforms', 'flags'],
  render: register
});
