import type { FastMove } from "../types";

export enum TTFlag {
  Exact = 0,
  Lower = 1,
  Upper = 2,
}

export interface TTEntry {
  readonly key: number;
  readonly depth: number;
  readonly flag: TTFlag;
  readonly score: number;
  readonly bestMove: FastMove | null;
  readonly age: number;
}

export interface TTStoreInput {
  readonly depth: number;
  readonly flag: TTFlag;
  readonly score: number;
  readonly bestMove: FastMove | null;
}

export class TranspositionTable {
  private readonly entries: Array<TTEntry | undefined>;
  private age = 0;

  constructor(size = 1 << 20) {
    this.entries = new Array(Math.max(1, size));
  }

  clear(): void {
    this.entries.fill(undefined);
    this.age = 0;
  }

  nextSearch(): void {
    this.age++;
  }

  probe(key: number): TTEntry | null {
    const entry = this.entries[this.indexFor(key)];
    return entry?.key === key ? entry : null;
  }

  store(key: number, input: TTStoreInput): void {
    const index = this.indexFor(key);
    const existing = this.entries[index];
    if (existing && existing.key === key && existing.depth > input.depth) {
      return;
    }
    if (existing && existing.key !== key && existing.depth > input.depth) {
      return;
    }

    this.entries[index] = {
      key,
      depth: input.depth,
      flag: input.flag,
      score: input.score,
      bestMove: input.bestMove,
      age: this.age,
    };
  }

  private indexFor(key: number): number {
    return (key >>> 0) % this.entries.length;
  }
}
