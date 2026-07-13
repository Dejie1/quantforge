import { createRng } from "./random";

it("replays the same sequence from the same seed", () => {
  const first = createRng(481516);
  const second = createRng(481516);
  const a = Array.from({ length: 12 }, () => first.int(3, 99));
  const b = Array.from({ length: 12 }, () => second.int(3, 99));
  expect(a).toEqual(b);
});

it("keeps inclusive integers in bounds", () => {
  const rng = createRng(42);
  const values = Array.from({ length: 200 }, () => rng.int(-4, 7));
  expect(values.every((value) => value >= -4 && value <= 7)).toBe(true);
});
