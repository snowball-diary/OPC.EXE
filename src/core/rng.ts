// 种子 RNG：mulberry32（技术文档 §二：全部随机经此，可复现、可模拟、可序列化）
import type { RngState } from './types';

export interface Rng {
  next(): number; // [0, 1)
  int(min: number, max: number): number; // 双端闭区间整数
  pick<T>(arr: readonly T[]): T;
  chance(p: number): boolean;
  powerLaw(alpha: number, min: number): number; // Pareto 幂律抽样，输出 ≥ min
  getState(): RngState;
}

export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  static fromState(rs: RngState): Rng {
    const r = new Rng(0);
    r.s = rs.s >>> 0;
    return r;
  }

  next(): number {
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(arr: readonly T[]): T {
    const i = this.int(0, arr.length - 1);
    const v = arr[i];
    if (v === undefined) throw new Error('RNG_PICK_EMPTY');
    return v;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** 幂律（Pareto）逆变换抽样：X = min × (1-U)^(-1/(α-1))，域 [min, ∞) */
  powerLaw(alpha: number, min: number): number {
    if (alpha <= 1) throw new Error('POWER_LAW_ALPHA_MUST_EXCEED_1');
    const u = this.next();
    return min * Math.pow(1 - u, -1 / (alpha - 1));
  }

  getState(): RngState {
    return { s: this.s };
  }
}

/** 文档签名 createRng(seed): Rng */
export function createRng(seed: number): Rng {
  return new Rng(seed);
}

/** 技术文档 §三 使用 RNG 泛指；别名保持一致 */
export type RNG = Rng;
