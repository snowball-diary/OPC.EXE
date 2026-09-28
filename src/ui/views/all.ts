// 视图装配桶（S7）：import 即注册 8 个 Tab 视图 + 日志面板增强。
// main.ts 只需 `import './ui/views/all'`（壳层结构零改动）。
//
// 日志增强（不改动 main.ts renderLog）：
//   ①MutationObserver 给【月结】【成就解锁】【知识点】等系统行加彩色徽标（颜色映射）
//   ②点击日志中的知识点条目 → enqueueKpModal 弹 KP 弹窗
import './status';
import './projects';
import './actions';
import './agents';
import './contacts';
import './finance';
import './invest';
import './codex';
import { enqueueKpModal, processQueue } from '../modal';
import { logAccent } from '../fmt';
import { SFX } from '../sfx';
import { kpKeyFromLog, watchKpModal } from '../kpseen';

function decorateLogList(list: HTMLElement): void {
  list.querySelectorAll<HTMLParagraphElement>('p').forEach(p => {
    if (p.dataset.s7 === '1') return;
    p.dataset.s7 = '1';
    const accent = logAccent(p.textContent ?? '');
    if (accent) {
      const chip = document.createElement('span');
      chip.className = 'log-chip';
      chip.textContent = accent.tag;
      chip.style.color = accent.color;
      chip.style.borderColor = accent.color;
      p.prepend(chip);
      p.style.borderLeft = `6px solid ${accent.color}`;
    }
  });
}

let bound = false;

function bindLogEnhancer(): void {
  if (bound) return;
  bound = true;
  // 点击知识点日志行 → KP 弹窗（事件委托，日志面板由 main.ts 反重建也无需重绑）
  document.addEventListener('click', e => {
    const target = e.target as HTMLElement;
    const p = target.closest?.('#log-list p');
    if (!p) return;
    const key = kpKeyFromLog(p.textContent ?? '');
    if (key) {
      SFX.kp();
      enqueueKpModal(key);
      processQueue();
    }
  });
  // 日志重渲后补徽标（颜色映射）
  const obs = new MutationObserver(() => {
    const list = document.getElementById('log-list');
    if (list) decorateLogList(list);
  });
  obs.observe(document.body, { childList: true, subtree: true });
  // 首次挂载后补一次
  window.setTimeout(() => {
    const list = document.getElementById('log-list');
    if (list) decorateLogList(list);
  }, 0);
}

watchKpModal();
bindLogEnhancer();
