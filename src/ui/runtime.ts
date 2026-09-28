// 运行时容器（S6）：模块级单例，持有当前 Game 与 UI 专属 RNG。
// 纪律：core 是唯一写者，UI 只经 dispatch/advanceDay 触碰状态。
import type { Game } from '../core/index';
import { createRng, type Rng } from '../core/index';

let game: Game | null = null;
let uiRng: Rng = createRng((Date.now() ^ 0x5f3759df) >>> 0);

/** 游戏就绪时调用（createGame / loadGame 之后）；同时重置 UI 视觉随机源（不与引擎 RNG 共享，保证确定性不受视觉污染） */
export function setGame(g: Game | null): void {
  game = g;
  uiRng = createRng(((g?.state.meta.seedState.s ?? Date.now()) ^ 0x9e3779b9) >>> 0);
}

export function getGame(): Game | null {
  return game;
}

/** 游戏屏内使用；标题屏等未开局阶段不要调用 */
export function requireGame(): Game {
  if (!game) throw new Error('GAME_NOT_READY');
  return game;
}

/** UI 视觉专用 RNG（场景抖动/飘字落点等），独立于引擎 RNG，绝不传进 core */
export function getRng(): Rng {
  return uiRng;
}
