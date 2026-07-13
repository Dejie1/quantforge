import type { RandomSource } from "../domain/random";

export function fixedRng(values: ReadonlyArray<number>): RandomSource {
  let cursor = 0;

  const next = (): number => {
    const value = values[cursor];

    if (value === undefined) {
      throw new RangeError("Fixed RNG has no values left");
    }

    if (value < 0 || value >= 1) {
      throw new RangeError("Fixed RNG values must be in the range [0, 1)");
    }

    cursor += 1;
    return value;
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
