import { createRng } from "../random";
import { fixedRng } from "../../test/fixed-rng";
import {
  estimationToleranceForDifficulty,
  generateEstimation,
} from "./estimation";
import type { Question } from "./types";

function expectEstimate(
  question: Question,
  expected: {
    topic: string;
    prompt: string;
    value: number;
    toleranceRatio: number;
    roundedEstimate: number;
  },
): void {
  expect(question).toMatchObject({
    category: "estimation",
    topic: expected.topic,
    prompt: expected.prompt,
    answer: {
      kind: "estimate",
      value: expected.value,
      toleranceRatio: expected.toleranceRatio,
      display: String(expected.value),
    },
  });
  expect(question.explanation).toContain(String(expected.roundedEstimate));
  expect(question.explanation).toContain(
    `The unrounded target is ${String(expected.value)}`,
  );
}

describe("generateEstimation", () => {
  it.each([
    [1, 0.15],
    [2, 0.15],
    [3, 0.1],
    [5, 0.1],
    [6, 0.07],
    [8, 0.07],
    [9, 0.05],
    [10, 0.05],
  ])("discloses the level %i tolerance as %s", (difficulty, tolerance) => {
    expect(estimationToleranceForDifficulty(difficulty)).toBe(tolerance);
  });

  it("builds a percentage estimate from an exact target", () => {
    const question = generateEstimation(fixedRng([0, 0, 0]), 1, 1);

    expectEstimate(question, {
      topic: "Percentage estimation",
      prompt: "Estimate 21% of 120.",
      value: 25.2,
      toleranceRatio: 0.15,
      roundedEstimate: 24,
    });
    expect(question.explanation).toContain("Percentage rounding rule");
  });

  it("builds a multiplication estimate by rounding both factors", () => {
    const question = generateEstimation(
      fixedRng([0.3, 0, 0, 0, 0]),
      3,
      2,
    );

    expectEstimate(question, {
      topic: "Multiplication rounding",
      prompt: "Estimate 49 x 49.",
      value: 2401,
      toleranceRatio: 0.1,
      roundedEstimate: 2500,
    });
    expect(question.explanation).toContain("Multiplication rounding rule");
  });

  it("builds a division estimate from nearby compatible numbers", () => {
    const target = 319 / 39;
    const question = generateEstimation(
      fixedRng([0.6, 0, 0, 0, 0]),
      6,
      3,
    );

    expectEstimate(question, {
      topic: "Division estimation",
      prompt: "Estimate 319 / 39.",
      value: target,
      toleranceRatio: 0.07,
      roundedEstimate: 8,
    });
    expect(question.explanation).toContain("Division estimation rule");
  });

  it("builds an order-of-magnitude estimate for a large total", () => {
    const question = generateEstimation(
      fixedRng([0.999, 0, 0, 0, 0]),
      9,
      4,
    );

    expectEstimate(question, {
      topic: "Order of magnitude",
      prompt: "Estimate the total for 19900 items per day over 199 days.",
      value: 3_960_100,
      toleranceRatio: 0.05,
      roundedEstimate: 4_000_000,
    });
    expect(question.explanation).toContain("Order-of-magnitude rule");
  });

  it.each([
    [1, 0.15],
    [2, 0.15],
    [3, 0.1],
    [5, 0.1],
    [6, 0.07],
    [8, 0.07],
    [9, 0.05],
    [10, 0.05],
  ])("uses the exact level %i tolerance", (difficulty, toleranceRatio) => {
    const question = generateEstimation(createRng(300 + difficulty), difficulty, 5);

    expect(question.answer.kind).toBe("estimate");
    if (question.answer.kind !== "estimate") {
      throw new Error("Estimation generators must return estimate answers");
    }
    expect(question.answer.toleranceRatio).toBe(toleranceRatio);
  });

  it("clamps external difficulty before assigning tolerance", () => {
    const low = generateEstimation(fixedRng([0, 0, 0]), Number.NaN, 6);
    const high = generateEstimation(
      fixedRng([0, 0, 0, 0, 0]),
      99,
      7,
    );

    expect(low.difficulty).toBe(1);
    expect(high.difficulty).toBe(10);
    expect(low.answer).toMatchObject({ toleranceRatio: 0.15 });
    expect(high.answer).toMatchObject({ toleranceRatio: 0.05 });
  });

  it.each([
    [2.5, "Multiplication rounding", 0.1],
    [5.5, "Division estimation", 0.07],
    [8.5, "Order of magnitude", 0.05],
  ])(
    "routes fractional difficulty %s without leaving a template gap",
    (difficulty, topic, toleranceRatio) => {
      const question = generateEstimation(createRng(700 + difficulty), difficulty, 8);

      expect(question.difficulty).toBe(difficulty);
      expect(question.topic).toBe(topic);
      expect(question.answer).toMatchObject({ toleranceRatio });
    },
  );

  it("satisfies estimation invariants across 1,000 seeded questions", () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const rng = createRng(seed);

      for (let difficulty = 1; difficulty <= 10; difficulty += 1) {
        const index = seed * 10 + difficulty;
        const question = generateEstimation(rng, difficulty, index);

        expect(question.id).toBe(`estimation-${index}`);
        expect(question.category).toBe("estimation");
        expect(question.difficulty).toBe(difficulty);
        expect(question.prompt.length).toBeGreaterThan(15);
        expect(question.prompt).not.toMatch(/NaN|Infinity/);
        expect(question.explanation.length).toBeGreaterThan(30);
        expect(question.explanation).not.toMatch(/NaN|Infinity/);
        expect(question.targetTimeMs).toBeGreaterThan(0);
        expect(question.answer.kind).toBe("estimate");

        if (question.answer.kind !== "estimate") {
          throw new Error("Estimation generators must return estimate answers");
        }

        expect(Number.isFinite(question.answer.value)).toBe(true);
        expect(question.answer.value).toBeGreaterThan(0);
        expect(question.answer.display).toBe(String(question.answer.value));
        expect(question.answer.toleranceRatio).toBeGreaterThanOrEqual(0.05);
        expect(question.answer.toleranceRatio).toBeLessThanOrEqual(0.15);
        expect(question.explanation).toContain(String(question.answer.value));
      }
    }
  });
});
