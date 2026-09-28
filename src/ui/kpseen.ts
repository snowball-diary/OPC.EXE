// KP 词条「已见」记录（S7 建立，S8 持久化改造）：
// [S8] 「已读」不再存会话级内存，而是经 core/state.grantKp 落 state.flags['kp_'+key]
//      ——存档天然携带，刷新/读档后图鉴点亮不丢。
// 记录两个来源：①core 引擎投递（事件入队 → pending.kpQueue → main.ts 弹窗）
//              ②图鉴页主动展开全文（codex 视图点击，只记账不入队，避免重复弹窗）。
// kpKeyFromTitle / kpKeyFromLog 纯函数保留（tests/s7.test.ts 覆盖）。
import { grantKp } from '../core/index';
import { KP_DEFS } from '../data/kp.def';
import { getGame } from './runtime';
import { logAccent } from './fmt';

/** 无游戏实例时的会话级兜底（标题屏等场景） */
const fallbackSeen = new Set<string>();

/** 标记「已读」：写 flags['kp_'+key]（deliver=false：只记账，不入弹窗队列） */
export function markKpSeen(key: string): void {
  const g = getGame();
  if (g) grantKp(g.state, key, false);
  else fallbackSeen.add(key);
}

export function isKpSeen(key: string): boolean {
  const g = getGame();
  if (g) return g.state.flags[`kp_${key}`] === true;
  return fallbackSeen.has(key);
}

export function kpSeenCount(): number {
  const g = getGame();
  if (!g) return fallbackSeen.size;
  return KP_DEFS.reduce((n, d) => (g.state.flags[`kp_${d.key}`] === true ? n + 1 : n), 0);
}

/** 从弹窗 KP 标题文本还原 key（纯函数）：`OPC 知识点 · 利基定位` → 'niche' */
export function kpKeyFromTitle(title: string): string | undefined {
  return KP_DEFS.find(d => title.includes(d.title))?.key;
}

/** 日志文本 → KP key（纯函数）：命中【知识点…】徽标或包含词条标题标记 */
export function kpKeyFromLog(text: string): string | undefined {
  const accent = logAccent(text);
  if (accent?.kpKey) {
    const hit = KP_DEFS.find(d => d.key === accent.kpKey || d.title === accent.kpKey);
    if (hit) return hit.key;
  }
  return KP_DEFS.find(d => text.includes(`【${d.title}】`) || text.includes(`知识点：${d.title}`))?.key;
}

let watching = false;

/** 监听 S6 弹窗的 #modal-kp：内容一填充即视为「已读」（经 flags 持久记账） */
export function watchKpModal(): void {
  if (watching) return;
  watching = true;
  const obs = new MutationObserver(() => {
    const el = document.getElementById('modal-kp');
    if (!el || el.style.display === 'none' || el.innerHTML === '') return;
    const tag = el.querySelector<HTMLElement>('.kp-tag');
    const key = tag ? kpKeyFromTitle(tag.textContent ?? '') : undefined;
    if (key) markKpSeen(key);
  });
  obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
}
