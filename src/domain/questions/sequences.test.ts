import { createRng } from "../random";
import { fixedRng } from "../../test/fixed-rng";
import { generateSequence } from "./sequences";
import type { Question } from "./types";

const TOPIC_BY_BAND = new Map<number, ReadonlyArray<string>>([
  [1, ["Arithmetic sequence", "Geometric sequence"]],
  [3, ["Alternating sequence"]],
  [5, ["Increasing-difference sequence"]],
  [7, ["Interleaved sequence"]],
  [9, ["Recurrence sequence"]],
]);

function visibleTerms(question: Question): number[] {
  return [...question.prompt.matchAll(/-?\d+/g)].map((match) =>
    Number(match[0]),
  );
}

function expectSequence(
  question: Question,
  topic: string,
  terms: ReadonlyArray<number>,
  next: number,
  namedRule: string,
): void {
  expect(question).toMatchObject({
    category: "sequences",
    topic,
    prompt: `Find the next term: ${terms.join(", ")}, ?`,
    answer: { kind: "number", value: next, display: String(next) },
  });
  expect(visibleTerms(question)).toEqual(terms);
  expect(question.explanation).toContain(namedRule);
  expect(question.explanation).toContain(String(next));
}

describe("generateSequence", () => {
  it("builds an arithmetic sequence from its selected rule", () => {
    const question = generateSequence(fixedRng([0, 0, 0]), 1, 1);

    expectSequence(
      question,
      "Arithmetic sequence",
      [2, 4, 6, 8, 10],
      12,
      "Arithmetic rule",
    );
  });

  it("builds a geometric sequence from its selected rule", () => {
    const question = generateSequence(fixedRng([0.999, 0, 0]), 1, 2);

    expectSequence(
      question,
      "Geometric sequence",
      [1, 2, 4, 8, 16],
      32,
      "Geometric rule",
    );
  });

  it("builds an alternating sequence from its selected rule", () => {
    const question = generateSequence(fixedRng([0, 0, 0, 0]), 3, 3);

    expectSequence(
      question,
      "Alternating sequence",
      [20, 23, 22, 25, 24],
      27,
      "Alternating rule",
    );
  });

  it("builds an increasing-difference sequence from its selected rule", () => {
    const question = generateSequence(fixedRng([0, 0, 0, 0]), 5, 4);

    expectSequence(
      question,
      "Increasing-difference sequence",
      [3, 5, 8, 12, 17],
      23,
      "Increasing-difference rule",
    );
  });

  it("builds a two-rule interleaved sequence only in the high bands", () => {
    const question = generateSequence(fixedRng([0, 0, 0, 0, 0]), 7, 5);

    expectSequence(
      question,
      "Interleaved sequence",
      [-12, 5, -10, 8, -8],
      11,
      "Interleaved rule",
    );
  });

  it("builds a non-trivial recurrence sequence in the top band", () => {
    const question = generateSequence(fixedRng([0, 0, 0, 0]), 9, 6);

    expectSequence(
      question,
      "Recurrence sequence",
      [2, 3, 6, 10, 17],
      28,
      "Recurrence rule",
    );
  });

  it("clamps difficulty and never relabels a low-band rule as level ten", () => {
    expect(generateSequence(fixedRng([0, 0, 0]), -20, 7).difficulty).toBe(1);

    const topBand = generateSequence(fixedRng([0, 0, 0, 0]), 99, 8);
    expect(topBand.difficulty).toBe(10);
    expect(topBand.topic).toBe("Recurrence sequence");
  });

  it("keeps negative visible terms and interleaving out of levels one to six", () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const rng = createRng(seed);

      for (let difficulty = 1; difficulty <= 6; difficulty += 1) {
        const question = generateSequence(rng, difficulty, seed * 10 + difficulty);

        expect(question.topic).not.toBe("Interleaved sequence");
        expect(visibleTerms(question).every((term) => term >= 0)).toBe(true);
      }
    }
  });

  it("satisfies sequence invariants across 1,000 seeded questions", () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const rng = createRng(seed);

      for (let difficulty = 1; difficulty <= 10; difficulty += 1) {
        const index = seed * 10 + difficulty;
        const question = generateSequence(rng, difficulty, index);
        const bandMinimum = Math.floor((difficulty - 1) / 2) * 2 + 1;

        expect(question.id).toBe(`sequences-${index}`);
        expect(question.category).toBe("sequences");
        expect(question.difficulty).toBe(difficulty);
        expect(TOPIC_BY_BAND.get(bandMinimum)).toContain(question.topic);
        expect(visibleTerms(question)).toHaveLength(5);
        expect(visibleTerms(question).every(Number.isInteger)).toBe(true);
        expect(question.prompt).not.toMatch(/NaN|Infinity/);
        expect(question.explanation.length).toBeGreaterThan(30);
        expect(question.explanation).not.toMatch(/NaN|Infinity/);
        expect(question.targetTimeMs).toBeGreaterThan(0);
        expect(question.answer.kind).toBe("number");

        if (question.answer.kind !== "number") {
          throw new Error("Sequence generators must return numeric answers");
        }

        expect(Number.isFinite(question.answer.value)).toBe(true);
        expect(Number.isInteger(question.answer.value)).toBe(true);
        expect(question.answer.display).toBe(String(question.answer.value));
      }
    }
  });
});
