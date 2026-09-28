// 存档管理 UI（S7）：3 存档槽（摘要/保存/读取/覆盖确认）+ 导出 JSON / 导入。
// 挂在状态视图底部；localStorage 只经 save/save.ts（全项目唯一触点）。
import { loadGame } from '../../core/index';
import type { SaveGame, StateSlice } from '../../core/types';
import { findEnding } from '../../data/endings.def';
import { yuan } from '../fmt';
import { getGame, setGame } from '../runtime';
import { getCtx as ctxOf } from '../registry';
import { importJson, isOfficialSave, loadSlot, saveToSlot, type SlotId } from '../../save/save';
import { SFX } from '../sfx';
import { enqueueNotice, processQueue } from '../modal';

// ---------- 纯函数（tests/s7.test.ts 覆盖） ----------

/** 槽位摘要（纯函数）：第 N 天 · 现金 · 结局态 · 保存时间 */
export function slotSummary(sv: SaveGame | null): string {
  if (!sv) return '空槽位';
  try {
    const s = JSON.parse(sv.game) as StateSlice;
    const state = s.meta.over && s.meta.endingKey
      ? `终局 · ${findEnding(s.meta.endingKey)?.name ?? s.meta.endingKey}`
      : `经营中 · 第 ${s.meta.day} 天`;
    const cash = `现金 ${yuan(Math.round(s.cash))}`;
    const t = new Date(sv.createdAt);
    const pad = (n: number): string => String(n).padStart(2, '0');
    const when = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}`;
    return `${state} · ${cash} · ${when}`;
  } catch {
    return '存档损坏（校验未过）';
  }
}

/** 读取动作的可用性（纯函数）：空槽不可读；终局档可读（用于查看报告） */
export function slotActions(sv: SaveGame | null): { canSave: boolean; canLoad: boolean } {
  return { canSave: true, canLoad: sv !== null };
}

// ---------- 渲染 ----------

/** 全量 UI 刷新（借用 ctx.dispatch 的 uiDispatch 尾部 refreshUi；dayType 幂等无副作用） */
function fullRefresh(): void {
  const ctx = ctxOf();
  if (ctx) ctx.dispatch({ t: 'dayType', dt: ctx.state.dayType });
}

function armOnce(btn: HTMLButtonElement, armedText: string, fn: () => void): void {
  if (btn.dataset.armed === '1') {
    btn.dataset.armed = '';
    fn();
    return;
  }
  btn.dataset.armed = '1';
  btn.dataset.restore = btn.textContent ?? '';
  btn.textContent = armedText;
  window.setTimeout(() => {
    if (btn.isConnected && btn.dataset.armed === '1') {
      btn.dataset.armed = '';
      btn.textContent = btn.dataset.restore ?? btn.textContent;
    }
  }, 2600);
}

export function renderSaveSection(el: HTMLElement): void {
  const g = getGame();
  if (!g) return;
  const slots: SlotId[] = ['1', '2', '3'];
  const auto = loadSlot('auto');
  const rows = slots.map(slot => {
    const sv = loadSlot(slot);
    return `
      <div class="save-slot">
        <div class="slot-head"><b>槽位 ${slot}</b><span class="slot-sum">${slotSummary(sv)}</span></div>
        <div class="slot-btns">
          <button class="px-btn" data-save="${slot}">保存${sv ? '（覆盖）' : ''}</button>
          <button class="px-btn" data-load="${slot}" ${sv ? '' : 'disabled title="空槽位"'}>读取</button>
        </div>
      </div>`;
  }).join('');
  el.innerHTML = `
    <div class="panel-title">// 存档与系统</div>
    <p class="s7-hint">自动档：${slotSummary(auto)}（每次「结束今天」与每 3 次操作静默写入）</p>
    <div class="save-grid">${rows}</div>
    <div class="save-io">
      <button class="px-btn" id="btn-export-json">导出当前存档 JSON</button>
      <label class="px-btn file-btn">导入存档 JSON<input type="file" id="file-import" accept=".json,application/json" /></label>
    </div>`;

  el.querySelectorAll<HTMLButtonElement>('button[data-save]').forEach(b => {
    b.addEventListener('click', () => {
      const game = getGame();
      if (!game) return;
      armOnce(b, '再次点击确认覆盖', () => {
        const slot = (b.dataset.save ?? '1') as SlotId;
        const ok = saveToSlot(slot, game.state);
        SFX.coin();
        enqueueNotice('存档', ok ? `已写入槽位 ${slot}。` : '浏览器存储不可用（隐私模式/已满）：已降级内存，请尽快导出 JSON。', ok ? 'good' : 'bad');
        processQueue();
        renderSaveSection(el);
      });
    });
  });
  el.querySelectorAll<HTMLButtonElement>('button[data-load]').forEach(b => {
    b.addEventListener('click', () => {
      const game = getGame();
      if (!game) return;
      armOnce(b, '读取会盖掉当前进度，确认？', () => {
        const slot = (b.dataset.load ?? '1') as SlotId;
        const sv = loadSlot(slot);
        if (!sv) return;
        try {
          setLoaded(sv);
        } catch {
          SFX.bad();
          enqueueNotice('读档失败', '存档校验未通过（可能来自旧版本）。', 'bad');
          processQueue();
        }
      });
    });
  });
  el.querySelector<HTMLButtonElement>('#btn-export-json')?.addEventListener('click', () => {
    const game = getGame();
    if (!game) return;
    SFX.coin();
    const blob = new Blob([JSON.stringify(game.serialize(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `opc-save-day${game.state.meta.day}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  el.querySelector<HTMLInputElement>('#file-import')?.addEventListener('change', async ev => {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const sv = importJson(text);
      // [v0.10/W9] 溯源校验：非官方存档（缺 author/product 标记）警告后仍可载入
      if (!isOfficialSave(sv)) {
        SFX.alarm();
        enqueueNotice('存档溯源', '这不是 OPC.exe 的官方存档（缺少作者溯源字段）——载入后果自负。', 'bad');
      }
      setLoaded(sv);
      processQueue();
    } catch {
      SFX.bad();
      enqueueNotice('导入失败', '非法存档：schema 或校验和不对。', 'bad');
      processQueue();
    }
    input.value = '';
  });
}

function setLoaded(sv: SaveGame): void {
  const loaded = loadGame(sv);
  // 经 runtime 换游戏实例（provideCtx 工厂每次取 getGame()，无需重建 ctx）
  setGame(loaded);
  SFX.good();
  fullRefresh();
}
