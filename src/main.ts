// OPC.exe 壳层启动（S6）：标题屏 → 开局向导桩（S7 替换为七步向导）→ 游戏屏
// （顶栏 / 像素场景 / 8 Tab / 日志 / 底栏）→ 结局屏桩（S7 替换为人生报告）。
// 纪律：所有玩家操作走 uiDispatch 包装（飘字/音效/自动存档/renderAll）；
//       advanceDay 的 DayReport 在 onEndDay 消费（日志/新闻/事件弹窗/KP/结局）。
import '@fontsource/press-start-2p';
import './ui/styles.css';
import './ui/views/all'; // S7：8 Tab 视图注册 + 日志增强（import 即装配）
import {
  createGame, createRng, loadGame,
  type Action, type ActionResult, type SetupConfig, type StateSlice
} from './core/index';
import { apMaxFor } from './core/health';
import { ACTION_DEFS } from './data/actions.def';
import { findEventDef } from './data/events.def';
import { canContinueFromSlot, loadSlot, saveToSlot } from './save/save';
import { renderEndingScreen } from './ui/ending';
import { bindFloatLayer, capFloats, FLOAT_MAX, floatText } from './ui/float';
import {
  clearModals, enqueueEventModal, enqueueKpModal, enqueueNotice,
  initModal, processQueue, setModalHooks
} from './ui/modal';
import { provideCtx, renderAll } from './ui/registry';
import { getGame, requireGame, setGame } from './ui/runtime';
import { dayPhaseOf, setSceneActivity, startScene, stopScene, type SceneMode } from './ui/scene';
import { SFX } from './ui/sfx';
import { makeFatigueModel, renderTopbar } from './ui/topbar';
import { mountSetupWizard } from './ui/views/setup';
const app = document.querySelector<HTMLDivElement>('#app');

// ---------- 会话级 UI 状态 ----------

let dispatchCount = 0;
let prevMode: StateSlice['decisionMode'] = 'system2';
let extraNews: { day: number; text: string }[] = [];

// ---------- 行动 → 场景屏幕动画映射 ----------

const SPECIAL_SCENE: Record<string, SceneMode> = {
  learn: 'learn', research: 'learn',
  market: 'market', publishContent: 'market',
  deliver: 'deliver', consult: 'deliver',
  developProject: 'build', validateProject: 'build', polishQuality: 'build', makeCourse: 'build',
  userInterview: 'network', community: 'network', bizCoop: 'network',
  outsource: 'auto', writeSop: 'auto', automationBuild: 'auto',
  exercise: 'rest', meditate: 'rest', deepRest: 'rest', socialize: 'rest', travel: 'rest', medical: 'rest',
  earlySleep: 'rest' // [v0.10/W1] 22:30 早睡
};

function sceneModeForAction(id: string): SceneMode {
  const def = ACTION_DEFS.find(d => d.id === id);
  return (def?.special && SPECIAL_SCENE[def.special]) || 'other';
}

// ---------- 通用 UI 刷新 ----------

function refreshUi(): void {
  const g = getGame();
  if (!g) return;
  const s = g.state;
  // System1 视觉 + s1-deep 耳鸣（进入时一声）
  document.body.classList.toggle('s1', s.decisionMode === 'system1');
  document.body.classList.toggle('s1-deep', s.decisionMode === 'system1Deep');
  if (s.decisionMode === 'system1Deep' && prevMode !== 'system1Deep') SFX.tinnitus();
  prevMode = s.decisionMode;
  // 幽灵公司低鸣（结局后关）
  SFX.hum(s.flags.ghostCompany === true && !s.meta.over);
  // 场景角标：昼夜相 + AP
  const apMax = apMaxFor(s.dayType, s);
  const pb = document.getElementById('phase-badge');
  if (pb) pb.textContent = ['白 天', '午 后', '黄 昏', '深 夜'][dayPhaseOf(s.ap, apMax)] ?? '白 天';
  const ab = document.getElementById('ap-badge');
  if (ab) ab.textContent = `AP ${s.ap}/${apMax}`;
  renderTopbar(s, extraNews);
  renderAll();
  renderBottombar();
  renderLog();
}

function renderLog(): void {
  const el = document.getElementById('log-list');
  const g = getGame();
  if (!el || !g) return;
  const tail = g.state.log.slice(-60).reverse();
  el.innerHTML = tail
    .map(e => `<p class="${e.cls}">&gt; 第${e.day}天 ${escapeHtml(e.msg)}</p>`)
    .join('');
}

function escapeHtml(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------- dispatch 包装 ----------

function autoSave(): void {
  const g = getGame();
  if (g) saveToSlot('auto', g.state);
}

function uiDispatch(a: Action): ActionResult {
  const g = requireGame();
  const r = g.dispatch(a);
  if (r.ok) {
    SFX.click();
    if (a.t === 'act') setSceneActivity(sceneModeForAction(a.id));
    for (const f of capFloats(r.floatTexts ?? [], FLOAT_MAX)) floatText(f.text, f.cls);
    dispatchCount += 1;
    if (dispatchCount % 3 === 0) autoSave(); // 每 3 次操作静默自动存档
  } else {
    SFX.bad();
    if (r.msg) {
      enqueueNotice('无法执行', r.msg, 'bad');
      processQueue();
    }
  }
  refreshUi();
  // [v0.10/W1] 22:30 早睡：立即结束今天（走既有「结束今天」入口，引擎标记由 UI 消费）
  if (r.ok && a.t === 'act' && a.id === 'earlySleep' && g.state.flags.earlySleptToday === true) {
    onEndDay();
  }
  return r;
}

// ---------- 标题屏 ----------

function showTitle(): void {
  stopScene();
  clearModals();
  setModalHooks(null);
  provideCtx(null);
  setGame(null);
  document.body.className = '';
  if (!app) return;
  // [v0.10/W5] 有档 **且** 未终局才可继续：终局后 auto 槽已清（或残留旧终局档）→ 禁用并说明
  const cont = canContinueFromSlot(loadSlot('auto'));
  app.innerHTML = `
    <section id="screen-title" class="screen active">
      <div class="game-logo">OPC.exe<span class="cursor"></span></div>
      <div class="game-sub">一人公司物语 · 人生操作系统</div>
      <div class="version-tag">one-person-company os · 全代码像素 · 零素材 · build by 赖嘉诚</div>
      <div class="title-author">by 赖嘉诚 · <a href="https://laijiacheng.com" target="_blank" rel="noopener">laijiacheng.com</a></div>
      <div class="title-tip px-frame">
        <p>&gt; 你是一人公司的全部：唯一的员工、唯一的资产、唯一的风险敞口。</p>
        <p>&gt; 经营 <b>现金流、项目、平台、智能体</b>，同时经营 <b>睡眠、情绪、隐性疲劳</b>。</p>
        <p>&gt; 系统会提前预警，从不突然袭击——但每一个账单，最终都会寄到。</p>
      </div>
      <div class="title-btns">
        <button class="px-btn gold" id="btn-new">新的公司<span class="blink">_</span></button>
        <button class="px-btn" id="btn-continue" ${cont.ok ? '' : `disabled title="${cont.reason}"`}>继续经营</button>
      </div>
    </section>`;
  app.querySelector<HTMLButtonElement>('#btn-new')?.addEventListener('click', () => {
    SFX.click();
    showSetup();
  });
  app.querySelector<HTMLButtonElement>('#btn-continue')?.addEventListener('click', () => {
    SFX.click();
    continueGame();
  });
}

// ---------- 开局向导（S7：七步向导在 src/ui/views/setup.ts，签名不变） ----------

function showSetup(): void {
  if (!app) return;
  mountSetupWizard(app, setup => beginGame(setup));
}

// ---------- 游戏屏 ----------

function beginGame(setup: SetupConfig): void {
  setGame(createGame(setup, createRng(setup.seed)));
  showGame();
}

function continueGame(): void {
  const sv = loadSlot('auto');
  if (!sv) {
    enqueueNotice('读档失败', '没有可用的自动存档。', 'bad');
    processQueue();
    return;
  }
  // [v0.10/W5] 双保险：终局档不允许从这里继续（结局屏会另开人生报告入口）
  const cont = canContinueFromSlot(sv);
  if (!cont.ok) {
    enqueueNotice('无法继续', cont.reason, 'bad');
    processQueue();
    return;
  }
  try {
    setGame(loadGame(sv));
    showGame();
  } catch {
    enqueueNotice('读档失败', '存档校验未通过（可能来自旧版本）。', 'bad');
    processQueue();
  }
}

function showGame(): void {
  if (!app) return;
  dispatchCount = 0;
  extraNews = [];
  prevMode = 'system2';
  document.body.className = '';
  app.innerHTML = `
    <section id="screen-game" class="screen active">
      <header id="topbar"></header>
      <div id="main-row">
        <div id="scene-col" class="px-frame">
          <canvas id="scene" class="pix" width="192" height="108"></canvas>
          <div id="float-layer"></div>
          <div id="phase-badge">白 天</div>
          <div id="ap-badge">AP 0/3</div>
        </div>
        <div id="side-col">
          <div id="tab-row"></div>
          <div id="tab-content" class="px-frame"></div>
          <div id="log-panel" class="px-frame">
            <div class="panel-title">// 经营日志</div>
            <div id="log-list"></div>
          </div>
        </div>
      </div>
      <div id="bottombar" class="px-frame"></div>
    </section>`;
  provideCtx(() => {
    const g = getGame();
    return g ? { state: g.state, dispatch: uiDispatch, rerender: refreshUi, sfx: SFX } : null;
  });
  setModalHooks({ renderAll: refreshUi, onEnding: showEnding });
  initModal();
  bindFloatLayer(document.getElementById('float-layer'));
  const canvas = document.getElementById('scene');
  if (canvas) startScene(canvas as HTMLCanvasElement);
  refreshUi();
}

function renderBottombar(): void {
  const el = document.getElementById('bottombar');
  const g = getGame();
  if (!el || !g) return;
  const s = g.state;
  const forced = (typeof s.flags.forcedMinDays === 'number' && s.flags.forcedMinDays > 0) || s.meta.over;
  const dtBtn = (dt: StateSlice['dayType'], label: string): string =>
    `<button class="px-btn dt-btn${s.dayType === dt ? ' active' : ''}" id="dt-${dt}"
      ${forced && dt !== 'minimum' ? 'disabled title="身体强制最低日"' : ''}>${label}</button>`;
  el.innerHTML = `
    <span class="bt-label">今日日型</span>
    ${dtBtn('minimum', '最低日')}
    ${dtBtn('standard', '标准日')}
    ${dtBtn('extended', '扩展日')}
    ${forced ? '<span class="bt-label" style="color:var(--red)">（身体强制最低日）</span>' : ''}
    <button class="px-btn gold" id="btn-endday" ${s.meta.over ? 'disabled' : ''}>结束今天 → 第 ${s.meta.day + 1} 天</button>`;
  for (const dt of ['minimum', 'standard', 'extended'] as const) {
    el.querySelector<HTMLButtonElement>(`#dt-${dt}`)?.addEventListener('click', () => {
      uiDispatch({ t: 'dayType', dt });
    });
  }
  el.querySelector<HTMLButtonElement>('#btn-endday')?.addEventListener('click', () => {
    onEndDay();
  });
}

// ---------- 结束今天：DayReport 消费 ----------

function onEndDay(): void {
  const g = requireGame();
  if (g.state.meta.over) return;
  SFX.click();
  const before = makeFatigueModel(g.state);
  const rep = g.advanceDay();
  setSceneActivity('idle');
  renderLog();
  // 新闻（双强预警文案等）叠加进顶栏新闻条
  for (const n of rep.news) extraNews.push({ day: g.state.meta.day, text: n });
  // 疲劳升级 → alarm（level1→2 首次出现）
  const after = makeFatigueModel(g.state);
  if (after && (!before || after.level > before.level)) SFX.alarm();
  // 事件 → 弹窗队列（心悸预警敲心跳）
  // [S8] 修「幽灵事件」缝：不止 rep.events——advanceDay 半程（tickAgentsDay 事故/烧钱警报）
  // 与白天 dispatch（publishContent → aiUndeclared）直接入 pending.events 的事件也必须浮出，
  // 否则玩家永远看不到弹窗、事件永远未决（还会被 enqueueEvent 去重挡住重发）。
  {
    const surfaced = new Set<string>();
    const surface = (pe: { id: string; resolved: boolean }): void => {
      if (pe.resolved || surfaced.has(pe.id)) return;
      surfaced.add(pe.id);
      const def = findEventDef(pe.id);
      if (!def) return;
      if (pe.id === 'heartAttackWarn') SFX.heartbeat();
      enqueueEventModal(def, g.state);
    };
    for (const pe of rep.events) surface(pe);
    for (const pe of g.state.pending.events) surface(pe);
  }
  // KP 队列消费（UI 是唯一消费者，取完即清）
  for (const key of g.state.pending.kpQueue.splice(0)) enqueueKpModal(key);
  autoSave();
  // 结局分流（suddenDeath → scene 黑屏渐隐；其余定格）
  if (rep.endingKey || rep.deathCheck?.died) {
    clearModals();
    showEnding(rep.endingKey ?? (rep.deathCheck?.cause === 'burnout' ? 'burnoutDown' : 'suddenDeath'));
    return;
  }
  refreshUi();
  processQueue();
}

// ---------- 结局屏（S7：五维人生报告在 src/ui/ending.ts，签名不变） ----------

function showEnding(key: string): void {
  renderEndingScreen(key);
}

// ---------- 启动 ----------

SFX.init();
showTitle();
