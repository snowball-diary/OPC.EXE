// ============================================================
// 视图注册表（S6 壳层）——技术文档 §12「registerView + deps 脏键重渲」
// ============================================================
//
// ---------------- S6 → S7 交接（API 签名 + 挂载点 id 清单） ----------------
//
// 【挂载点 DOM id】（全部由 S6 main.ts/styles.css 提供，S7 直接填充内容）
//   #screen-title          标题屏（S6 完成，S7 一般不动）
//   #screen-setup          开局向导容器（S6 桩：默认配置直接开局；S7 换成七步向导，
//                          在 src/main.ts 的 mountSetupWizard() 替换实现即可，签名不变）
//   #screen-game           游戏屏
//   #topbar                顶栏（S6 完成：日/版本/现金/精力/AP/注意力/压力/周期/新闻条/静音）
//   #fatigue-banner        双强预警横幅（S6 完成，topbar 渲染）
//   #scene                 192×108 像素场景 canvas（S6 完成）
//   #float-layer           飘字层（S6 完成）
//   #phase-badge/#ap-badge 场景角标（S6 完成）
//   #tab-row               8 个 Tab 按钮条（S6 完成，stage 门控已做）
//   #tab-content           Tab 视图容器（S7 的 8 个 View 渲染到这里）
//   #log-panel #log-list   经营日志面板（容器已搭好并内置基础渲染，S7 可美化/过滤）
//   #bottombar             底栏：日型三态钮 #dt-minimum/#dt-standard/#dt-extended +
//                          #btn-endday「结束今天」（S6 完成）
//   #modal-mask #modal     弹窗队列容器（S6 完成）
//   #screen-end            结局屏（S6 桩：结局名+文案+重开按钮；S7 替换为完整人生报告）
//
// 【S7 注册视图】src/ui/registry.ts：
//   import { registerView } from '../ui/registry';
//   registerView({ id: 'projects', deps: ['projects', 'cash'], render(el, ctx) { ... } });
//   —— id 必须是 TAB_IDS 之一：'status' | 'projects' | 'actions' | 'agents'
//                           | 'contacts' | 'finance' | 'invest' | 'codex'
//   —— deps: 状态脏键列表（键名自由约定，如 'cash'/'projects'/'health'/'agents'）。
//            当前实现 dispatch 后统一 renderAll（性能足够），deps 字段已保留供优化：
//            depHit(deps, dirtyKeys) 纯函数已导出，接入点在 main.ts 的 uiDispatch。
//   —— ctx: UiCtx { state: Readonly<StateSlice>; dispatch(a: Action): ActionResult;
//                   rerender(): void; sfx: typeof SFX }
//            state 只读纪律：core 是唯一写者，S7 一律走 ctx.dispatch。
//            选项过滤请调 ctx 内不经手的 core API：filterChoicesForUI(state, ev)（core/events）。
//   —— 未注册的 Tab 自动渲染「施工中 · S7」占位；stage 未达显示「第 X 阶段解锁」。
//      门控表：agents minStage 3 / invest minStage 5 / codex 常驻 / 其余常驻。
//
// 【S7 还要接的 S6 API】
//   floatText(text, cls)                      飘字（src/ui/float.ts）
//   enqueueNotice(title, body, cls)           提示弹层（src/ui/modal.ts）
//   enqueueKpModal(key) / enqueueEventModal(ev, s)（src/ui/modal.ts）
//   setSceneActivity('idle'|'build'|'market'|'deliver'|'auto'|'rest'|'learn'|'network')
//                                             显示器屏幕动画（src/ui/scene.ts）
//   SFX.play('coin') 等 12 个具名音效（src/ui/sfx.ts）
//   getRng()                                  UI 视觉随机源（绝不可传给 core）
// -----------------------------------------------------------

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

/** deps 脏键命中（纯函数，S7 优化重渲用）：空 deps = 永远命中 */
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
    <div class="ph-big">施工中 · S7</div>
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
