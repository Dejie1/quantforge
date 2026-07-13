import { createRng } from "../random";
import { fixedRng } from "../../test/fixed-rng";
import { generateArithmetic } from "./arithmetic";

describe("generateArithmetic", () => {
  it("generates addition", () => {
    const question = generateArithmetic(fixedRng([0, 0, 0.5]), 1, 1);

    expect(question).toEqual({
      id: "arithmetic-1",
      category: "arithmetic",
      topic: "Addition",
      difficulty: 1,
      prompt: "2 + 51 = ?",
      answer: { kind: "number", value: 53, display: "53" },
      explanation: "Add the two operands: 2 + 51 = 53.",
      targetTimeMs: 10_000,
    });
  });

  it("generates subtraction without a negative result at low difficulty", () => {
    const question = generateArithmetic(fixedRng([0.4, 0.2, 0.8]), 1, 2);

    expect(question).toEqual({
      id: "arithmetic-2",
      category: "arithmetic",
      topic: "Subtraction",
      difficulty: 1,
      prompt: "80 - 21 = ?",
      answer: { kind: "number", value: 59, display: "59" },
      explanation: "Subtract the smaller number: 80 - 21 = 59.",
      targetTimeMs: 10_000,
    });
  });

  it("generates small multiplication", () => {
    const question = generateArithmetic(fixedRng([0.8, 0.2, 0.8]), 1, 3);

    expect(question).toEqual({
      id: "arithmetic-3",
      category: "arithmetic",
      topic: "Multiplication",
      difficulty: 1,
      prompt: "4 × 10 = ?",
      answer: { kind: "number", value: 40, display: "40" },
      explanation: "Multiply the factors: 4 × 10 = 40.",
      targetTimeMs: 10_000,
    });
  });

  it("constructs exact division from a divisor and integral quotient", () => {
    const question = generateArithmetic(fixedRng([0, 0.3, 0.7]), 3, 4);

    expect(question).toEqual({
      id: "arithmetic-4",
      category: "arithmetic",
      topic: "Exact division",
      difficulty: 3,
      prompt: "75 ÷ 5 = ?",
      answer: { kind: "number", value: 15, display: "15" },
      explanation:
        "The dividend was built as 5 × 15, so 75 ÷ 5 = 15.",
      targetTimeMs: 14_000,
    });

    const [dividend, divisor] = question.prompt
      .replace(" = ?", "")
      .split(" ÷ ")
      .map(Number);
    expect(dividend % divisor).toBe(0);
  });

  it("generates a common percentage", () => {
    const question = generateArithmetic(fixedRng([0.4, 0.5, 0.25]), 3, 5);

    expect(question).toEqual({
      id: "arithmetic-5",
      category: "arithmetic",
      topic: "Percentages",
      difficulty: 3,
      prompt: "What is 25% of 120?",
      answer: { kind: "number", value: 30, display: "30" },
      explanation: "Compute 25/100 × 120 = 30.",
      targetTimeMs: 14_000,
    });
  });

  it("generates a missing-number equation", () => {
    const question = generateArithmetic(fixedRng([0.8, 0.2, 0.6]), 3, 6);

    expect(question).toEqual({
      id: "arithmetic-6",
      category: "arithmetic",
      topic: "Missing number",
      difficulty: 3,
      prompt: "? + 64 = 92",
      answer: { kind: "number", value: 28, display: "28" },
      explanation: "Subtract 64 from both sides: 92 - 64 = 28.",
      targetTimeMs: 14_000,
    });
  });

  it("generates reduced fraction arithmetic", () => {
    const question = generateArithmetic(
      fixedRng([0, 0.25, 0, 0, 0]),
      5,
      7,
    );

    expect(question).toEqual({
      id: "arithmetic-7",
      category: "arithmetic",
      topic: "Fraction arithmetic",
      difficulty: 5,
      prompt: "1/3 + 1/6 = ?",
      answer: {
        kind: "fraction",
        numerator: 1,
        denominator: 2,
        display: "1/2",
      },
      explanation:
        "Convert 1/3 to 2/6, then add: 2/6 + 1/6 = 3/6 = 1/2.",
      targetTimeMs: 18_000,
    });
  });

  it("generates a ratio equation", () => {
    const question = generateArithmetic(fixedRng([0.4, 0.25, 0.5, 0.25]), 5, 8);

    expect(question).toEqual({
      id: "arithmetic-8",
      category: "arithmetic",
      topic: "Ratios",
      difficulty: 5,
      prompt: "4:6 = ?:18",
      answer: { kind: "number", value: 12, display: "12" },
      explanation:
        "The second term was multiplied by 3, so multiply the first term too: 4 × 3 = 12.",
      targetTimeMs: 18_000,
    });
  });

  it("generates larger multiplication with a round operand", () => {
    const question = generateArithmetic(fixedRng([0.8, 0.5, 0.5]), 5, 9);

    expect(question).toEqual({
      id: "arithmetic-9",
      category: "arithmetic",
      topic: "Larger multiplication",
      difficulty: 5,
      prompt: "560 × 6 = ?",
      answer: { kind: "number", value: 3360, display: "3360" },
      explanation:
        "Multiply 56 × 6, then append the zero: 560 × 6 = 3360.",
      targetTimeMs: 18_000,
    });
  });

  it("generates a fraction-to-decimal conversion with at most two places", () => {
    const question = generateArithmetic(fixedRng([0, 0.25]), 7, 10);

    expect(question).toEqual({
      id: "arithmetic-10",
      category: "arithmetic",
      topic: "Decimal conversion",
      difficulty: 7,
      prompt: "Convert 3/4 to a decimal.",
      answer: { kind: "number", value: 0.75, display: "0.75" },
      explanation:
        "Divide the numerator by the denominator: 3 ÷ 4 = 0.75.",
      targetTimeMs: 22_000,
    });
  });

  it("generates a reverse percentage from a chosen base", () => {
    const question = generateArithmetic(fixedRng([0.4, 0.5, 0.25]), 7, 11);

    expect(question).toEqual({
      id: "arithmetic-11",
      category: "arithmetic",
      topic: "Reverse percentages",
      difficulty: 7,
      prompt: "25% of what number is 30?",
      answer: { kind: "number", value: 120, display: "120" },
      explanation: "Divide 30 by 0.25: 30 ÷ 0.25 = 120.",
      targetTimeMs: 22_000,
    });
  });

  it("generates subtraction with a negative result", () => {
    const question = generateArithmetic(fixedRng([0.8, 0.2, 0.5]), 7, 12);

    expect(question).toEqual({
      id: "arithmetic-12",
      category: "arithmetic",
      topic: "Negative results",
      difficulty: 7,
      prompt: "20 - 41 = ?",
      answer: { kind: "number", value: -21, display: "-21" },
      explanation: "41 is 21 greater than 20, so 20 - 41 = -21.",
      targetTimeMs: 22_000,
    });
  });

  it("generates a two-step expression with built-in cancellation", () => {
    const question = generateArithmetic(fixedRng([0.99, 0.25, 0.5]), 9, 13);

    expect(question).toEqual({
      id: "arithmetic-13",
      category: "arithmetic",
      topic: "Mixed operations",
      difficulty: 9,
      prompt: "34 × 6 - 170 = ?",
      answer: { kind: "number", value: 34, display: "34" },
      explanation:
        "Rewrite 170 as 34 × 5: 34 × 6 - 34 × 5 = 34.",
      targetTimeMs: 26_000,
    });
  });

  it("clamps external difficulty values while preserving levels one through ten", () => {
    expect(generateArithmetic(fixedRng([0, 0, 0]), -20, 14).difficulty).toBe(1);
    expect(generateArithmetic(fixedRng([0, 0, 0]), 99, 15).difficulty).toBe(10);

    for (let difficulty = 1; difficulty <= 10; difficulty += 1) {
      const question = generateArithmetic(
        fixedRng([0, 0, 0, 0, 0]),
        difficulty,
        difficulty,
      );
      expect(question.difficulty).toBe(difficulty);
    }
  });

  it("selects the first and last template from each current difficulty band", () => {
    const bands = [
      { difficulties: [1, 2], first: "Addition", last: "Multiplication" },
      {
        difficulties: [3, 4],
        first: "Exact division",
        last: "Missing number",
      },
      {
        difficulties: [5, 6],
        first: "Fraction arithmetic",
        last: "Larger multiplication",
      },
      {
        difficulties: [7, 8],
        first: "Decimal conversion",
        last: "Negative results",
      },
      {
        difficulties: [9, 10],
        first: "Mixed operations",
        last: "Mixed operations",
      },
    ] as const;

    for (const band of bands) {
      for (const difficulty of band.difficulties) {
        const first = generateArithmetic(
          fixedRng([0, 0, 0, 0, 0]),
          difficulty,
          difficulty * 10,
        );
        const last = generateArithmetic(
          fixedRng([0.999, 0, 0, 0, 0]),
          difficulty,
          difficulty * 10 + 1,
        );

        expect(first.topic).toBe(band.first);
        expect(last.topic).toBe(band.last);
      }
    }
  });

  it("never emits a lower-band family at difficulty nine or ten", () => {
    for (const difficulty of [9, 10]) {
      for (const selector of [0, 0.25, 0.5, 0.75, 0.999]) {
        const question = generateArithmetic(
          fixedRng([selector, 0, 0]),
          difficulty,
          difficulty,
        );

        expect(question.topic).toBe("Mixed operations");
      }
    }
  });

  it("satisfies invariants across 1,000 seeded questions", () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const rng = createRng(seed);

      for (let difficulty = 1; difficulty <= 10; difficulty += 1) {
        const question = generateArithmetic(
          rng,
          difficulty,
          seed * 10 + difficulty,
        );

        expect(question.category).toBe("arithmetic");
        expect(question.prompt).not.toMatch(/NaN|Infinity/);
        expect(question.explanation.length).toBeGreaterThan(12);
        expect(question.difficulty).toBe(difficulty);
      }
    }
  });
});
