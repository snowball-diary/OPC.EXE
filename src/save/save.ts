// 存档系统（技术文档 §十一）——全项目唯一允许触碰 localStorage 的文件
// localStorage 抛异常（隐私模式/满）→ 降级内存 Map，isDegraded()/listSlots() 标记
import type { SaveGame, SerializedState, StateSlice } from '../core/types';

export type SlotId = 'auto' | '1' | '2' | '3';

export const SAVE_SCHEMA_VERSION = 1;
const KEY_PREFIX = 'opc-os-slot-';
const SLOTS: readonly SlotId[] = ['auto', '1', '2', '3'];

const memory = new Map<string, SaveGame>();
let degraded = false;

export function isDegraded(): boolean {
  return degraded;
}

// ---------- 校验和与序列化（纯函数，core/index 复用） ----------

/** FNV-1a 32bit */
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function serialize(s: StateSlice): SaveGame {
  const game: SerializedState = JSON.stringify(s);
  return {
    schemaVersion: SAVE_SCHEMA_VERSION, createdAt: Date.now(), game, checksum: fnv1a(game),
    author: AUTHOR_TAG, product: PRODUCT_TAG // [v0.10/W9] 溯源字段
  };
}

/** [v0.10/W9] 存档溯源标记 */
export const AUTHOR_TAG = 'Lai Jiacheng (c) 2026';
export const PRODUCT_TAG = 'OPC.exe';

/** [v0.10/W9] 官方存档判定：author/product 溯源字段齐全（旧版/第三方档缺失 → 导入时警告） */
export function isOfficialSave(sv: SaveGame | null | undefined): boolean {
  return !!sv && sv.author === AUTHOR_TAG && sv.product === PRODUCT_TAG;
}

/**
 * [v0.10/W5] 继续经营可用性（纯函数）：有档 **且** 未终局才可用。
 * 终局档（meta.over）→ 不可继续（上一段人生已落幕）；主动结局回头后 over=false 恢复可用。
 */
export function canContinueFromSlot(sv: SaveGame | null): { ok: boolean; reason: string } {
  if (!sv) return { ok: false, reason: '没有自动存档' };
  try {
    const s = JSON.parse(sv.game) as { meta?: { over?: boolean } };
    if (s.meta?.over === true) return { ok: false, reason: '上一段人生已落幕——开一家新公司吧' };
    return { ok: true, reason: '' };
  } catch {
    return { ok: false, reason: '存档损坏（校验未过）' };
  }
}

/** 校验失败一律拒绝（导入时调用方 catch） */
export function validate(sv: SaveGame): boolean {
  if (!sv || typeof sv !== 'object') return false;
  if (sv.schemaVersion !== SAVE_SCHEMA_VERSION) return false; // 未来版本须先跑 migrate 归一
  if (typeof sv.game !== 'string' || typeof sv.checksum !== 'number') return false;
  if (fnv1a(sv.game) !== sv.checksum) return false;
  try {
    const o = JSON.parse(sv.game) as { meta?: { schemaVersion?: number } };
    return !!o.meta;
  } catch {
    return false;
  }
}

/** 迁移链：v1→v2→…，新版本只 append，不改历史 */
export const migrations: ((sv: SaveGame) => SaveGame)[] = [];

export function migrate(sv: SaveGame): SaveGame {
  let out = sv;
  for (const m of migrations) out = m(out);
  return out;
}

// ---------- localStorage 隔离层（全部 try/catch） ----------

function storageGet(key: string): string | null {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    return ls.getItem(key);
  } catch {
    degraded = true;
    return null;
  }
}

function storageSet(key: string, val: string): boolean {
  try {
    const ls = globalThis.localStorage;
    if (!ls) {
      degraded = true;
      return false;
    }
    ls.setItem(key, val);
    return true;
  } catch {
    degraded = true;
    return false;
  }
}

// ---------- 槽位操作 ----------

/** 写槽；返回 false = 已降级内存（UI 应提示导出） */
export function saveToSlot(slot: SlotId, s: StateSlice): boolean {
  const sv = serialize(s);
  const ok = storageSet(KEY_PREFIX + slot, JSON.stringify(sv));
  if (!ok) memory.set(slot, sv);
  return ok;
}

export function loadSlot(slot: SlotId): SaveGame | null {
  const raw = storageGet(KEY_PREFIX + slot);
  if (raw !== null) {
    try {
      const sv = JSON.parse(raw) as SaveGame;
      return validate(sv) ? migrate(sv) : null;
    } catch {
      return null;
    }
  }
  return memory.get(slot) ?? null;
}

/** [v0.10/W5] 清槽：终局型结局落幕后清除 auto 槽（storage + 内存降级双清） */
export function clearSlot(slot: SlotId): void {
  try {
    globalThis.localStorage?.removeItem(KEY_PREFIX + slot);
  } catch {
    degraded = true;
  }
  memory.delete(slot);
}

export function listSlots(): { slot: SlotId; save: SaveGame | null; degraded: boolean }[] {
  return SLOTS.map(slot => ({ slot, save: loadSlot(slot), degraded }));
}

// ---------- 导入导出 ----------

export function exportJson(s: StateSlice): string {
  return JSON.stringify(serialize(s), null, 2);
}

/** 非法存档抛 Error('INVALID_SAVE')，由调用方处理 UI 提示 */
export function importJson(str: string): SaveGame {
  const sv = migrate(JSON.parse(str) as SaveGame);
  if (!validate(sv)) throw new Error('INVALID_SAVE');
  return sv;
}
