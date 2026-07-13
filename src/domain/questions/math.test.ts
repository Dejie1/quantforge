import { combination, gcd, reduceFraction } from "./math";

it("reduces signed fractions canonically", () => {
  expect(reduceFraction(18, -24)).toEqual({ numerator: -3, denominator: 4 });
  expect(reduceFraction(0, -5)).toEqual({ numerator: 0, denominator: 1 });
});

it("calculates combinations without factorial overflow for trainer ranges", () => {
  expect(combination(10, 3)).toBe(120);
  expect(combination(20, 18)).toBe(190);
  expect(gcd(84, 30)).toBe(6);
});
