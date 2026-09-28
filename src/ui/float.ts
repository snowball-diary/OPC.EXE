// 飘字（S6 DOM 版，技术文档 §12：快照 diff 自动生成由 main.ts 的 uiDispatch 接线）
// 叠在像素场景上方（#float-layer），右上起，向上淡出 1.6s；同屏最多 6 条，超出排队。
export const FLOAT_MAX = 6;
export const FLOAT_LIFE_MS = 1600;

interface FloatItem {
  text: string;
  cls: string;
}

let layer: HTMLElement | null = null;
let activeCount = 0;
const pending: FloatItem[] = [];

/** 游戏屏挂载时绑定漂浮层容器 */
export function bindFloatLayer(el: HTMLElement | null): void {
  layer = el;
  activeCount = 0;
  pending.length = 0;
}

/** 纯函数：把一批 floatTexts 截到同屏上限（超出者应由调用方交给 floatText 的排队机制） */
export function capFloats(list: readonly FloatItem[], max: number = FLOAT_MAX): FloatItem[] {
  return list.slice(0, Math.max(0, max));
}

function clsToColor(cls: string): string {
  switch (cls) {
    case 'good': return 'var(--green)';
    case 'bad': return 'var(--red)';
    case 'gold': case 'cash': return 'var(--gold)';
    case 'purple': return 'var(--purple)';
    case 'pink': return 'var(--pink)';
    case 'sys': return 'var(--cyan)';
    default: return 'var(--gold)';
  }
}

function spawn(item: FloatItem): void {
  if (!layer) return;
  activeCount += 1;
  const tag = document.createElement('span');
  tag.className = `float-tag ${item.cls}`;
  tag.textContent = item.text;
  tag.style.color = clsToColor(item.cls);
  // 右上区域随机落点（视觉随机，用 Math.random 即可，不污染引擎 RNG）
  tag.style.right = `${8 + Math.random() * 26}%`;
  tag.style.top = `${18 + Math.random() * 30}%`;
  layer.appendChild(tag);
  window.setTimeout(() => {
    tag.remove();
    activeCount -= 1;
    const next = pending.shift();
    if (next) spawn(next);
  }, FLOAT_LIFE_MS);
}

/** 对外入口：floatText('+¥800', 'gold')；超过 6 条自动排队 */
export function floatText(text: string, cls = 'gold'): void {
  if (!layer) return;
  const item: FloatItem = { text, cls };
  if (activeCount >= FLOAT_MAX) {
    if (pending.length < FLOAT_MAX * 2) pending.push(item); // 队列防失控
    return;
  }
  spawn(item);
}
