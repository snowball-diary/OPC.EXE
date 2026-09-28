// 三级弹窗队列（S6）：事件 > KP > 结算提示（技术文档 §12；原型 modalQueue 模式迁移）
// 事件弹窗必须选一项（filterChoicesForUI 过滤 → resolveChoice 结算 → 结果弹层 → 飘字 → renderAll）；
// KP / Notice 可 ESC 或点背景关闭。弹窗打开时场景动画暂停（纯视觉，不阻塞引擎）。
// EventDef.oldZhang 存在时渲染专属老张台词块（深色底+左侧竖线+「老张」署名）。
// 队列排序抽成纯函数 sortModalQueue / MODAL_PRIORITY 供单测。

import type { EventDef, StateSlice } from '../core/index';
import { filterChoicesForUI, resolveChoice } from '../core/index';
import { KP } from '../data/kp.def';
import { getGame, getRng } from './runtime';
import { SFX } from './sfx';
import { floatText } from './float';
import { iconHtml, renderIcons } from './icons';

// ---------- 队列模型（纯逻辑） ----------

export type ModalKind = 'event' | 'kp' | 'notice';

/** 优先级数值：小者先出（事件 > KP > 结算提示） */
export const MODAL_PRIORITY: Record<ModalKind, number> = {
  event: 0,
  kp: 1,
  notice: 2
};

export function modalPriorityOf(kind: ModalKind): number {
  return MODAL_PRIORITY[kind] ?? 99;
}

/** 稳定排序（纯函数）：同优先级保持入队顺序 */
export function sortModalQueue<T extends { kind: ModalKind }>(list: readonly T[]): T[] {
  return list
    .map((item, i) => ({ item, i }))
    .sort((a, b) => modalPriorityOf(a.item.kind) - modalPriorityOf(b.item.kind) || a.i - b.i)
    .map(x => x.item);
}

type ModalEntry =
  | { kind: 'event'; ev: EventDef; s: StateSlice }
  | { kind: 'kp'; key: string }
  | { kind: 'notice'; title: string; body: string; cls: string };

// ---------- 队列运行时 ----------

const queue: ModalEntry[] = [];
let showing: ModalEntry | null = null;
let hooks: { renderAll: () => void; onEnding: (key: string) => void } | null = null;
let initialized = false;

/** main.ts 挂载游戏屏时注入（renderAll 用于选项结算后刷新；onEnding 用于结局接管） */
export function setModalHooks(h: { renderAll: () => void; onEnding: (key: string) => void } | null): void {
  hooks = h;
}

export function enqueueEventModal(ev: EventDef, s: StateSlice): void {
  queue.push({ kind: 'event', ev, s });
}

export function enqueueKpModal(key: string): void {
  queue.push({ kind: 'kp', key });
}

export function enqueueNotice(title: string, body: string, cls = 'sys'): void {
  queue.push({ kind: 'notice', title, body, cls });
}

export function queueSnapshot(): ModalKind[] {
  return sortModalQueue(queue).map(m => m.kind);
}

export function queueLength(): number {
  return queue.length;
}

export function isOpen(): boolean {
  return showing !== null;
}

export function clearModals(): void {
  queue.length = 0;
  showing = null;
  const mask = document.getElementById('modal-mask');
  if (mask) mask.style.display = 'none';
}

/** 队列泵：按优先级弹出下一个（重排后取队首） */
export function processQueue(): void {
  if (showing) return;
  if (queue.length === 0) {
    const mask = document.getElementById('modal-mask');
    if (mask) mask.style.display = 'none';
    return;
  }
  const next = sortModalQueue(queue)[0];
  if (!next) return;
  const idx = queue.indexOf(next);
  if (idx >= 0) queue.splice(idx, 1);
  showing = next;
  renderModal(next);
}

function closeCurrent(): void {
  showing = null;
  const mask = document.getElementById('modal-mask');
  if (mask) mask.style.display = 'none';
  processQueue();
}

/** ESC / 点背景关闭（仅 KP/Notice；事件弹窗必须选一项） */
export function initModal(): void {
  if (initialized) return;
  initialized = true;
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (showing && showing.kind !== 'event') {
      SFX.click();
      closeCurrent();
    }
  });
  const mask = document.getElementById('modal-mask');
  mask?.addEventListener('click', e => {
    if (e.target === mask && showing && showing.kind !== 'event') {
      SFX.click();
      closeCurrent();
    }
  });
}

// ---------- 渲染 ----------

function baseModal(title: string, icon: string): { mask: HTMLElement; modal: HTMLElement } | null {
  const mask = document.getElementById('modal-mask');
  const modal = document.getElementById('modal');
  const titleEl = document.getElementById('modal-title-text');
  if (!mask || !modal || !titleEl) return null;
  titleEl.innerHTML = `${iconHtml(icon)}<span>${title}</span>`;
  const body = document.getElementById('modal-body');
  const kp = document.getElementById('modal-kp');
  const zhang = document.getElementById('modal-zhang');
  const btns = document.getElementById('modal-btns');
  if (body) body.innerHTML = '';
  if (kp) { kp.style.display = 'none'; kp.innerHTML = ''; }
  if (zhang) { zhang.style.display = 'none'; zhang.innerHTML = ''; }
  if (btns) btns.innerHTML = '';
  mask.style.display = 'flex';
  return { mask, modal };
}

function setZhang(text: string): void {
  const zhang = document.getElementById('modal-zhang');
  if (!zhang) return;
  zhang.innerHTML = `<div class="zhang-line">「${text}」</div><div class="zhang-name">—— 老张</div>`;
  zhang.style.display = 'block';
}

function setKp(key: string): void {
  const kp = KP[key];
  const el = document.getElementById('modal-kp');
  if (!el || !kp) return;
  el.innerHTML = `<b class="kp-tag">[OPC 知识点 · ${kp.title}]</b><br>${kp.text}<div class="kp-source">来源：${kp.source}</div>`;
  el.style.display = 'block';
}

function renderModal(m: ModalEntry): void {
  switch (m.kind) {
    case 'event': renderEventModal(m.ev, m.s); break;
    case 'kp': renderKpModal(m.key); break;
    case 'notice': renderNoticeModal(m.title, m.body, m.cls); break;
  }
}

function renderEventModal(ev: EventDef, s: StateSlice): void {
  const ui = baseModal(ev.title, 'msg');
  if (!ui) return;
  const body = document.getElementById('modal-body');
  if (body) {
    const catTag = document.createElement('span');
    catTag.className = `ev-cat cat-${ev.cat}`;
    catTag.textContent = ev.cat;
    const p = document.createElement('p');
    p.className = 'ev-body-text';
    p.textContent = ev.body;
    body.appendChild(catTag);
    body.appendChild(p);
  }
  if (ev.oldZhang) setZhang(ev.oldZhang);
  // System1 过滤（core/events）——S7 复用时保持同一入口
  let choices = filterChoicesForUI(s, ev);
  if (choices.length === 0) choices = ev.choices; // 兜底：过滤后无选项绝不死锁
  const btns = document.getElementById('modal-btns');
  choices.forEach((c, i) => {
    // filterChoicesForUI 可能返回 {...c, label} 的拷贝（s1Variant），按 choice.id 映射回原索引
    const realIdx = ev.choices.findIndex(o => o.id === c.id);
    const b = document.createElement('button');
    b.className = 'px-btn choice-btn' + (c.id.startsWith('ending:') ? ' red' : '');
    b.innerHTML = `<span class="choice-label">${c.label}</span>${c.hint ? `<small>${c.hint}</small>` : ''}`;
    b.addEventListener('click', () => {
      const g = getGame();
      if (!g) return;
      SFX.click();
      const r = resolveChoice(g.state, ev, realIdx >= 0 ? realIdx : i, getRng());
      closeCurrent();
      // 结果文案弹层 → 飘字 → renderAll（终局直接交棒）
      if (r.ending) {
        clearModals();
        hooks?.onEnding(r.ending);
        return;
      }
      enqueueNotice(`「${ev.title}」之后`, r.msg, 'sys');
      floatText(r.msg.length <= 14 ? r.msg : ev.title, 'gold');
      hooks?.renderAll();
      processQueue();
    });
    btns?.appendChild(b);
  });
  renderIcons(document.getElementById('modal') ?? document.body);
}

function renderKpModal(key: string): void {
  const kp = KP[key];
  const title = kp ? `解锁知识点 · ${kp.title}` : `知识点 · ${key}`;
  const ui = baseModal(title, 'book');
  if (!ui) return;
  SFX.kp();
  const body = document.getElementById('modal-body');
  if (body) {
    const p = document.createElement('p');
    p.className = 'ev-body-text';
    p.textContent = kp ? kp.text : '词条缺失（数据层未收录该 key）。';
    body.appendChild(p);
  }
  if (kp) setKp(key);
  const btns = document.getElementById('modal-btns');
  const b = document.createElement('button');
  b.className = 'px-btn green';
  b.textContent = '收下了';
  b.addEventListener('click', () => {
    SFX.click();
    closeCurrent();
  });
  btns?.appendChild(b);
  renderIcons(document.getElementById('modal') ?? document.body);
}

function renderNoticeModal(title: string, bodyText: string, cls: string): void {
  const ui = baseModal(title, cls === 'bad' ? 'bolt' : 'star');
  if (!ui) return;
  const body = document.getElementById('modal-body');
  if (body) {
    const p = document.createElement('p');
    p.className = `ev-body-text notice-${cls}`;
    p.textContent = bodyText;
    body.appendChild(p);
  }
  const btns = document.getElementById('modal-btns');
  const b = document.createElement('button');
  b.className = 'px-btn';
  b.textContent = '知道了';
  b.addEventListener('click', () => {
    SFX.click();
    closeCurrent();
  });
  btns?.appendChild(b);
}
