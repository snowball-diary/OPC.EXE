// 七步开局向导（S7）：赛道 → 背景 → 地点 → 难度 → 特质（3 点预算）→ 性格 → 确认。
// 替换 main.ts 的 mountSetupWizard 桩（签名不变：mountSetupWizard(container, onDone)）。
// 纯逻辑（预算校验/步骤完成判定/SetupConfig 组装）全部抽函数，tests/s7.test.ts 覆盖。
import type { SetupConfig } from '../../core/types';
import {
  BACKGROUND_DEFS, DIFFICULTY_DEFS, NICHE_DEFS, PERSONALITY_DEFS, TALENT_DEFS,
  findBackground, findDifficulty, findNiche, findPersonality, findTalent
} from '../../data/openings.def';
import { LOCATION_DEFS, findLocation } from '../../data/locations.def';
import { SFX } from '../sfx';
import { escapeHtml, yuan } from '../fmt';

const SKILL_DIM_LABELS: Record<string, string> = {
  craft: '造物', expression: '表达', marketing: '营销', operation: '运营', business: '商业'
};

// ---------- 纯逻辑（测试直打） ----------

export const TALENT_BUDGET = 3;

export const WIZARD_STEPS: readonly string[] = ['赛道', '背景', '地点', '难度', '特质', '性格', '确认'];

export interface SetupDraft {
  niche: string;
  background: string;
  location: string;
  difficulty: string;
  talents: string[];
  personality: { pragmaticIdeal: string; steadyAggressive: string; soloSocial: string };
  cryptoOn: boolean;
  seed: number;
}

export function randomSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

export function emptyDraft(): SetupDraft {
  return {
    niche: '', background: '', location: '', difficulty: '',
    talents: [],
    personality: { pragmaticIdeal: '', steadyAggressive: '', soloSocial: '' },
    cryptoOn: true,
    seed: randomSeed()
  };
}

/** 预算余量 = 3 + Σ(所选特质 cost)（负消耗/正返还，openings.def 口径） */
export function talentBudgetLeft(talents: readonly string[]): number {
  return TALENT_BUDGET + talents.reduce((a, id) => a + (findTalent(id)?.cost ?? 0), 0);
}

/** 特质可选判定：重复=取消；增益超预算拒绝并给出提示语 */
export function canPickTalent(talents: readonly string[], id: string): { ok: boolean; reason?: string } {
  const def = findTalent(id);
  if (!def) return { ok: false, reason: '未知特质' };
  if (talents.includes(id)) return { ok: true };
  if (def.cost < 0) {
    const left = talentBudgetLeft(talents);
    if (left + def.cost < 0) {
      return { ok: false, reason: `点数不足：「${def.name}」需要 ${-def.cost} 点，当前剩余 ${left} 点（可选返还点数的负担特质腾出预算）` };
    }
  }
  return { ok: true };
}

/** 步骤完成判定（纯函数）：未选完不能下一步 */
export function setupStepComplete(step: number, d: SetupDraft): boolean {
  switch (step) {
    case 0: return !!findNiche(d.niche);
    case 1: return !!findBackground(d.background);
    case 2: return !!findLocation(d.location);
    case 3: return !!findDifficulty(d.difficulty);
    case 4: return d.talents.every(t => !!findTalent(t)) && talentBudgetLeft(d.talents) >= 0;
    case 5: return !!findPersonality(d.personality.pragmaticIdeal)
      && !!findPersonality(d.personality.steadyAggressive)
      && !!findPersonality(d.personality.soloSocial);
    default: return true;
  }
}

/** 草稿 → SetupConfig（性格轴缺省落默认端，兜底不抛错） */
export function buildSetupConfig(d: SetupDraft): SetupConfig {
  const axis = (v: string, fallback: string): string => findPersonality(v) ? v : fallback;
  return {
    niche: findNiche(d.niche) ? d.niche : 'dev',
    background: findBackground(d.background) ? d.background : 'grass',
    location: findLocation(d.location) ? d.location : 'hangcheng',
    difficulty: findDifficulty(d.difficulty) ? d.difficulty : 'normal',
    talents: d.talents.filter(t => !!findTalent(t)),
    personality: {
      pragmaticIdeal: axis(d.personality.pragmaticIdeal, 'pragmatic'),
      steadyAggressive: axis(d.personality.steadyAggressive, 'steady'),
      soloSocial: axis(d.personality.soloSocial, 'solo')
    },
    cryptoOn: d.cryptoOn,
    seed: d.seed >>> 0
  };
}

// ---------- 渲染 ----------

let draft: SetupDraft = emptyDraft();
let step = 0;

function cardHtml(attrs: string, icon: string, name: string, desc: string, meta: string, selected: boolean, extraCls = ''): string {
  return `<button class="opt-card ${extraCls}${selected ? ' sel' : ''}" ${attrs}>
    <span class="opt-icon">${escapeHtml(icon)}</span>
    <span class="opt-name">${escapeHtml(name)}</span>
    <span class="opt-desc">${escapeHtml(desc)}</span>
    ${meta ? `<span class="opt-meta">${meta}</span>` : ''}
  </button>`;
}

function metaRow(k: string, v: string, cls = ''): string {
  return `<span class="mrow${cls ? ` ${cls}` : ''}"><b>${escapeHtml(k)}</b>${v}</span>`;
}

function renderCards(): string {
  switch (step) {
    case 0:
      return `<div class="card-grid cols3">${NICHE_DEFS.map(n => cardHtml(
        `data-niche="${n.id}"`, n.icon, n.name, n.desc,
        metaRow('加成', n.bonusText), draft.niche === n.id
      )).join('')}</div>`;
    case 1:
      return `<div class="card-grid cols3">${BACKGROUND_DEFS.map(b => cardHtml(
        `data-bg="${b.id}"`, b.icon, b.name, b.desc,
        metaRow('开局现金', yuan(b.baseCash) + ' ×难度系数') + metaRow('起步技能', Object.keys(b.skills).length > 0 ? Object.keys(b.skills).map(k => SKILL_DIM_LABELS[k] ?? k).join('/') : '无') + metaRow('隐藏资源', b.hiddenText, 'dim'),
        draft.background === b.id
      )).join('')}</div>`;
    case 2:
      return `<div class="card-grid cols2">${LOCATION_DEFS.map(l => cardHtml(
        `data-loc="${l.id}"`, l.icon, `${l.name} · ${l.tier}`, l.desc,
        metaRow('生活费系数', `×${l.costMult}`) + metaRow('市场规模', `×${l.marketMult}`) + metaRow('创作/压力', `${l.creative >= 0 ? '+' : ''}${l.creative} / ${l.stress >= 0 ? '+' : ''}${l.stress}`) + metaRow('税注', l.taxNote, 'dim'),
        draft.location === l.id
      )).join('')}</div>`;
    case 3:
      return `<div class="card-grid cols2">${DIFFICULTY_DEFS.filter(x => !x.custom).map(x => cardHtml(
        `data-diff="${x.id}"`, x.icon, x.name, x.desc,
        metaRow('初始现金', `×${x.cashMult}`) + metaRow('生活费', `×${x.livingCostMult}`) + metaRow('事件', `友好×${x.eventFriendliness} / 频率×${x.eventFrequency}`),
        draft.difficulty === x.id
      )).join('')}</div>`;
    case 4: {
      const left = talentBudgetLeft(draft.talents);
      return `
        <p class="wiz-note">点数预算 <b class="${left > 0 ? 'c-gold' : left === 0 ? 'c-green' : 'c-red'}">${left}</b> / ${TALENT_BUDGET} 点——增益特质消耗点数，负担特质（债/佛系/社恐/大手大脚）返还点数。特质可选空。</p>
        <div class="card-grid cols2">${TALENT_DEFS.map(t => {
          const sel = draft.talents.includes(t.id);
          const pick = canPickTalent(draft.talents, t.id);
          return cardHtml(
            `data-talent="${t.id}"`, t.icon, `${t.name}（${t.cost < 0 ? `耗 ${-t.cost} 点` : `返 +${t.cost} 点`}）`, t.desc,
            pick.ok ? '' : metaRow('禁选', pick.reason ?? '', 'red'),
            sel, t.cost < 0 ? '' : 'refund'
          );
        }).join('')}</div>`;
    }
    case 5: {
      const axes: { key: 'pragmaticIdeal' | 'steadyAggressive' | 'soloSocial'; title: string }[] = [
        { key: 'pragmaticIdeal', title: '务实 ↔ 理想' },
        { key: 'steadyAggressive', title: '稳健 ↔ 激进' },
        { key: 'soloSocial', title: '独行 ↔ 社交' }
      ];
      return axes.map(a => `
        <div class="axis-row">
          <div class="axis-title">${escapeHtml(a.title)}</div>
          <div class="card-grid cols2">${PERSONALITY_DEFS.filter(p => p.axis === a.key).map(p => cardHtml(
            `data-axis="${a.key}" data-pers="${p.id}"`, p.icon, p.name, p.desc,
            '', draft.personality[a.key] === p.id
          )).join('')}</div>
        </div>`).join('');
    }
    default: return '';
  }
}

function summaryHtml(): string {
  const n = findNiche(draft.niche);
  const b = findBackground(draft.background);
  const l = findLocation(draft.location);
  const x = findDifficulty(draft.difficulty);
  const talents = draft.talents.map(t => findTalent(t)).filter(t => !!t);
  const pers = (['pragmaticIdeal', 'steadyAggressive', 'soloSocial'] as const)
    .map(a => findPersonality(draft.personality[a]))
    .filter(p => !!p);
  const row = (k: string, v: string): string => `<div class="sum-row"><span>${escapeHtml(k)}</span><b>${v}</b></div>`;
  return `<div class="sum-grid">
    ${row('赛道', n ? `${n.icon} ${n.name}` : '——')}
    ${row('背景', b ? `${b.icon} ${b.name}（开局 ${yuan(Math.round((b.baseCash) * (x?.cashMult ?? 1)))}）` : '——')}
    ${row('地点', l ? `${l.icon} ${l.name} · ${l.tier}（生活费 ×${l.costMult}）` : '——')}
    ${row('难度', x ? `${x.icon} ${x.name}` : '——')}
    ${row('特质', talents.length > 0 ? talents.map(t => `${t?.icon}${t?.name}`).join('、') : '无（白板开局）')}
    ${row('性格', pers.map(p => p?.name ?? '——').join(' / '))}
    ${row('加密资产', draft.cryptoOn ? '开启（波动 ×6 的资产会出现在金融市场）' : '关闭（真实世界仍在继续，只是与你无关）')}
    ${row('随机种子', `<span class="px-num">${draft.seed}</span>`)}
  </div>`;
}

function render(container: HTMLElement, onDone: (setup: SetupConfig) => void): void {
  const last = step === WIZARD_STEPS.length - 1;
  const done = setupStepComplete(step, draft);
  const steps = WIZARD_STEPS.map((name, i) =>
    `<button class="wiz-step${i === step ? ' on' : ''}${i < step ? ' past' : ''}" data-goto="${i}" ${i <= maxReachableStep() ? '' : 'disabled'}>${i + 1}. ${escapeHtml(name)}</button>`
  ).join('');
  const tips: string[] = [
    '赛道决定你的第一门手艺与开局加成——窄门后面竞争少。',
    '背景决定口袋里有多少钱、会什么，以及藏在水面下的资源。',
    '地点是地理套利：赚哪里的钱，花哪里的价。',
    '难度不改规则，只改现实的松紧。现实无滤镜的那档叫地狱。',
    '特质是先天的你：3 点预算，有得必有失。',
    '性格三轴没有对错，只有你打算怎么活。',
    '确认档案。种子相同，命运相同——想换命就换种子。'
  ];
  container.innerHTML = `
    <section id="screen-setup" class="screen active">
      <h2 class="game-sub">创 建 你 的 一 人 公 司</h2>
      <div class="wiz-steps">${steps}</div>
      <div class="px-frame wiz-body">
        <p class="panel-title">// 第 ${step + 1} 步 · ${escapeHtml(WIZARD_STEPS[step] ?? '')}</p>
        <p class="wiz-tip">${escapeHtml(tips[step] ?? '')}</p>
        ${step === WIZARD_STEPS.length - 1 ? summaryHtml() + cryptoRowHtml() : renderCards()}
      </div>
      <div class="wiz-nav">
        <button class="px-btn" id="wiz-prev" ${step === 0 ? 'disabled' : ''}>← 上一步</button>
        ${last
          ? `<button class="px-btn gold" id="wiz-start" ${done ? '' : 'disabled'}>开始经营 →</button>`
          : `<button class="px-btn" id="wiz-next" ${done ? '' : 'disabled title="本步尚未选择完成"'}>下一步 →</button>`}
      </div>
      <p class="wiz-foot">种子 <span class="px-num">${draft.seed}</span> · 相同种子 = 相同命运流（图鉴向可复现）</p>
    </section>`;
  bind(container, onDone);
}

function maxReachableStep(): number {
  let i = 0;
  while (i < WIZARD_STEPS.length - 1 && setupStepComplete(i, draft)) i += 1;
  return i;
}

function cryptoRowHtml(): string {
  return `
    <div class="crypto-row">
      <button class="px-btn ${draft.cryptoOn ? 'gold' : ''}" id="wiz-crypto">
        ${draft.cryptoOn ? '加密资产：开' : '加密资产：关'}
        <small>${draft.cryptoOn ? '组合里会出现加密资产（月波动 ±36%）' : '已关闭（真实世界仍在继续）'}</small>
      </button>
      <button class="px-btn" id="wiz-seed">换一个种子<small class="px-num">${draft.seed}</small></button>
    </div>`;
}

function bind(container: HTMLElement, onDone: (setup: SetupConfig) => void): void {
  const click = (sel: string, fn: (el: HTMLButtonElement) => void): void => {
    container.querySelectorAll<HTMLButtonElement>(sel).forEach(b => b.addEventListener('click', () => fn(b)));
  };
  click('[data-niche]', b => { SFX.click(); draft.niche = b.dataset.niche ?? ''; rerender(container, onDone); });
  click('[data-bg]', b => { SFX.click(); draft.background = b.dataset.bg ?? ''; rerender(container, onDone); });
  click('[data-loc]', b => { SFX.click(); draft.location = b.dataset.loc ?? ''; rerender(container, onDone); });
  click('[data-diff]', b => { SFX.click(); draft.difficulty = b.dataset.diff ?? ''; rerender(container, onDone); });
  click('[data-talent]', b => {
    const id = b.dataset.talent ?? '';
    const pick = canPickTalent(draft.talents, id);
    if (!pick.ok) { SFX.bad(); window.alert(pick.reason ?? '不可选'); return; }
    SFX.click();
    draft.talents = draft.talents.includes(id) ? draft.talents.filter(t => t !== id) : [...draft.talents, id];
    rerender(container, onDone);
  });
  click('[data-axis]', b => {
    SFX.click();
    const axis = b.dataset.axis as keyof SetupDraft['personality'] | undefined;
    if (axis) draft.personality[axis] = b.dataset.pers ?? '';
    rerender(container, onDone);
  });
  click('[data-goto]', b => {
    const to = Number(b.dataset.goto ?? 0);
    if (to > maxReachableStep()) { SFX.bad(); return; }
    SFX.click();
    step = to;
    rerender(container, onDone);
  });
  click('#wiz-prev', () => { if (step > 0) { SFX.click(); step -= 1; rerender(container, onDone); } });
  click('#wiz-next', () => {
    if (!setupStepComplete(step, draft)) { SFX.bad(); return; }
    SFX.click();
    step = Math.min(WIZARD_STEPS.length - 1, step + 1);
    rerender(container, onDone);
  });
  click('#wiz-crypto', () => { SFX.click(); draft.cryptoOn = !draft.cryptoOn; rerender(container, onDone); });
  click('#wiz-seed', () => { SFX.coin(); draft.seed = randomSeed(); rerender(container, onDone); });
  click('#wiz-start', () => {
    for (let i = 0; i < WIZARD_STEPS.length - 1; i++) {
      if (!setupStepComplete(i, draft)) { SFX.bad(); step = i; rerender(container, onDone); return; }
    }
    SFX.levelup();
    onDone(buildSetupConfig(draft));
  });
}

function rerender(container: HTMLElement, onDone: (setup: SetupConfig) => void): void {
  render(container, onDone);
}

/** main.ts 调用入口（签名与 S6 桩一致） */
export function mountSetupWizard(container: HTMLElement, onDone: (setup: SetupConfig) => void): void {
  draft = emptyDraft();
  step = 0;
  render(container, onDone);
}
