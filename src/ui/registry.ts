// 视图注册表：registerView + 按脏键重渲
// 挂载点 #tab-row / #tab-content 由 main.ts 提供；视图实现在 src/ui/views/，views/all.ts import 即装配。
// 纪律：View.render 收到的 state 只读，一切写操作走 ctx.dispatch（core 是唯一写者）。

import type { Action, ActionResult, StateSlice } from '../core/index';
import type { Stage } from '../core/types';
import { SFX } from './sfx';
import { iconHtml, renderIcons } from './icons';

export interface UiCtx {
  state: Readonly<StateSlice>;
  dispatch(a: Action): ActionResult;
  rerender(): void;
  sfx: typeof SFX;
}

export interface View {
  id: string;
  deps: string[]; // 状态脏键（供 dispatch 后按命中重渲；当前统一 renderAll，字段保留）
  render(el: HTMLElement, ctx: UiCtx): void;
}

export interface TabDef {
  id: ViewId;
  label: string;
  icon: string;
  minStage: Stage; // 1 = 常驻
}

export type ViewId =
  | 'status' | 'projects' | 'actions' | 'agents'
  | 'contacts' | 'finance' | 'invest' | 'codex';

export const TAB_DEFS: TabDef[] = [
  { id: 'status', label: '状态', icon: 'star', minStage: 1 },
  { id: 'projects', label: '项目', icon: 'box', minStage: 1 },
  { id: 'actions', label: '行动', icon: 'hammer', minStage: 1 },
  { id: 'agents', label: '智能体', icon: 'bot', minStage: 3 },
  { id: 'contacts', label: '人脉', icon: 'users', minStage: 1 },
  { id: 'finance', label: '财务', icon: 'coin', minStage: 1 },
  { id: 'invest', label: '金融', icon: 'bolt', minStage: 5 },
  { id: 'codex', label: '图鉴', icon: 'book', minStage: 1 }
];

const VIEWS = new Map<string, View>();
let activeTab: ViewId = 'status';
let ctxProvider: (() => UiCtx | null) | null = null;

/** main.ts 启动游戏屏时注入 ctx 工厂 */
export function provideCtx(p: (() => UiCtx | null) | null): void {
  ctxProvider = p;
}

export function getCtx(): UiCtx | null {
  return ctxProvider ? ctxProvider() : null;
}

export function registerView(v: View): void {
  VIEWS.set(v.id, v);
}

export function getView(id: string): View | undefined {
  return VIEWS.get(id);
}

/** stage 门控（纯函数） */
export function isTabEnabled(id: string, stage: Stage): boolean {
  const tab = TAB_DEFS.find(t => t.id === id);
  return tab ? stage >= tab.minStage : false;
}

/** deps 脏键命中（纯函数）：空 deps = 永远命中 */
export function depHit(deps: readonly string[], dirtyKeys: readonly string[]): boolean {
  if (deps.length === 0 || dirtyKeys.length === 0) return true;
  return deps.some(d => dirtyKeys.includes(d));
}

/** Tab 解析（纯函数）：locked > view > placeholder */
export function resolveTab(id: string, stage: Stage, hasView: boolean): 'view' | 'placeholder' | 'locked' {
  if (!isTabEnabled(id, stage)) return 'locked';
  return hasView ? 'view' : 'placeholder';
}

export function tabPlaceholderHtml(id: string): string {
  return `<div class="tab-placeholder">
    <div class="ph-big">施工中</div>
    <div class="ph-small">视图槽位「${id}」已就绪：registerView({ id: '${id}', deps: [...], render })</div>
  </div>`;
}

export function tabLockedHtml(id: string, stage: Stage): string {
  const tab = TAB_DEFS.find(t => t.id === id);
  return `<div class="tab-placeholder">
    <div class="ph-big">第 ${tab?.minStage ?? '?'} 阶段解锁</div>
    <div class="ph-small">当前阶段 ${stage}：「${tab?.label ?? id}」模块尚未亮起</div>
  </div>`;
}

export function getActiveTab(): ViewId {
  return activeTab;
}

export function setTab(id: ViewId): void {
  activeTab = id;
}

/** 渲染单个 Tab（默认当前激活 Tab）到 #tab-content */
export function renderTab(id: ViewId = activeTab): void {
  const el = document.getElementById('tab-content');
  const ctx = getCtx();
  if (!el || !ctx) return;
  const view = VIEWS.get(id);
  const mode = resolveTab(id, ctx.state.meta.stage, !!view);
  el.innerHTML = '';
  if (mode === 'view' && view) {
    view.render(el, ctx);
    renderIcons(el);
    return;
  }
  el.innerHTML = mode === 'locked' ? tabLockedHtml(id, ctx.state.meta.stage) : tabPlaceholderHtml(id);
}

/** 重建 Tab 按钮条（stage 门控点亮） */
export function renderTabRow(): void {
  const row = document.getElementById('tab-row');
  const ctx = getCtx();
  if (!row || !ctx) return;
  const stage = ctx.state.meta.stage;
  row.innerHTML = TAB_DEFS.map(t => {
    const enabled = isTabEnabled(t.id, stage);
    const view = VIEWS.get(t.id);
    const filled = !!view;
    return `<button class="tab-btn${t.id === activeTab ? ' active' : ''}${filled ? ' filled' : ''}"
      data-tab="${t.id}" ${enabled ? '' : 'disabled'}
      title="${enabled ? t.label : `第 ${t.minStage} 阶段解锁`}">${iconHtml(t.icon)}<span>${t.label}</span></button>`;
  }).join('');
  renderIcons(row);
  row.querySelectorAll<HTMLButtonElement>('button.tab-btn').forEach(b => {
    b.addEventListener('click', () => {
      const id = b.dataset.tab as ViewId | undefined;
      if (!id || b.disabled) return;
      ctx.sfx.click();
      setTab(id);
      renderTabRow();
      renderTab(id);
    });
  });
}

/** dispatch 后统一重渲入口（渲染当前 Tab；顶栏/底栏由 main.ts 的 refreshUi 一并刷） */
export function renderAll(): void {
  renderTabRow();
  renderTab();
}

/** 供测试/调试：当前已注册视图 id 列表 */
export function registeredViewIds(): string[] {
  return [...VIEWS.keys()];
}
