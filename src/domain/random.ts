export interface RandomSource {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(items: ReadonlyArray<T>): T;
  shuffle<T>(items: ReadonlyArray<T>): T[];
}

const ZERO_SEED_FALLBACK = 0x6d2b79f5;

export function createRng(seed: number): RandomSource {
  let state = seed >>> 0;

  if (state === 0) {
    state = ZERO_SEED_FALLBACK;
  }

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };

  const int = (min: number, max: number): number =>
    Math.floor(next() * (max - min + 1)) + min;

  return {
    next,
    int,
    pick<T>(items: ReadonlyArray<T>): T {
      if (items.length === 0) {
        throw new RangeError("Cannot pick from an empty array");
      }

      return items[int(0, items.length - 1)];
    },
    shuffle<T>(items: ReadonlyArray<T>): T[] {
      const shuffled = [...items];

      for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = int(0, index);
        [shuffled[index], shuffled[swapIndex]] = [
          shuffled[swapIndex],
          shuffled[index],
        ];
      }

      return shuffled;
    },
  };
}
