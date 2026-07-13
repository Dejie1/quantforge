import { createRng } from "../random";
import { validateAnswer } from "../answers";
import { fixedRng } from "../../test/fixed-rng";
import { gcd } from "./math";
import { generateProbability } from "./probability";
import type { Question } from "./types";

const TOPICS_BY_BAND = new Map<number, ReadonlyArray<string>>([
  [
    1,
    ["Single-die probability", "Complement probability", "Permutations"],
  ],
  [3, ["Independent events", "Combinations"]],
  [5, ["Without replacement", "Expected value"]],
  [7, ["Conditional probability", "Multi-stage counting"]],
  [9, ["Bayes theorem", "Mixed counting probability"]],
]);

function expectExactAnswer(question: Question): void {
  const { answer } = question;

  expect(answer.kind).not.toBe("estimate");

  if (answer.kind === "number") {
    expect(Number.isFinite(answer.value)).toBe(true);
    expect(Number.isInteger(answer.value)).toBe(true);
    expect(answer.display).toBe(String(answer.value));
    expect(question.choices).toBeUndefined();
    return;
  }

  if (answer.kind === "fraction") {
    expect(Number.isInteger(answer.numerator)).toBe(true);
    expect(Number.isInteger(answer.denominator)).toBe(true);
    expect(answer.denominator).toBeGreaterThan(0);
    expect(gcd(answer.numerator, answer.denominator)).toBe(1);
    expect(Number.isFinite(answer.numerator / answer.denominator)).toBe(true);
    expect(answer.display).toBe(
      answer.denominator === 1
        ? String(answer.numerator)
        : `${answer.numerator}/${answer.denominator}`,
    );
    expect(question.choices).toBeUndefined();
    return;
  }

  if (answer.kind === "choice") {
    const choices = question.choices ?? [];

    expect(choices.length).toBeGreaterThanOrEqual(3);
    expect(new Set(choices.map((choice) => choice.id)).size).toBe(
      choices.length,
    );
    expect(new Set(choices.map((choice) => choice.label)).size).toBe(
      choices.length,
    );
    expect(
      choices.filter((choice) => choice.id === answer.value),
    ).toHaveLength(1);
    expect(
      choices.find((choice) => choice.id === answer.value)?.label,
    ).toBe(answer.display);
    expect(answer.display).toMatch(/^\d+(?:\/[1-9]\d*)?$/);
    return;
  }

  throw new Error("Probability generators must return an exact answer");
}

describe("generateProbability", () => {
  it("generates a single-die probability", () => {
    const question = generateProbability(fixedRng([0, 0.5]), 1, 1);

    expect(question).toMatchObject({
      id: "probability-1",
      category: "probability",
      topic: "Single-die probability",
      difficulty: 1,
      prompt:
        "A fair six-sided die is rolled once. What is the probability of rolling a 4?",
      answer: {
        kind: "fraction",
        numerator: 1,
        denominator: 6,
        display: "1/6",
      },
      explanation:
        "There is 1 favorable face out of 6 equally likely faces, so the probability is 1/6.",
    });
  });

  it("generates a complement question with cards", () => {
    const question = generateProbability(fixedRng([0.4, 0.25]), 1, 2);

    expect(question).toMatchObject({
      topic: "Complement probability",
      prompt:
        "One card is drawn from a standard 52-card deck. What is the probability it is not a diamond?",
      answer: {
        kind: "fraction",
        numerator: 3,
        denominator: 4,
        display: "3/4",
      },
      explanation:
        "There are 13 diamonds, so 52 - 13 = 39 cards are not diamonds; 39/52 reduces to 3/4.",
    });
  });

  it("generates basic permutation counting", () => {
    const question = generateProbability(fixedRng([0.8, 0.5]), 1, 3);

    expect(question).toMatchObject({
      topic: "Permutations",
      prompt: "In how many orders can 4 distinct books be placed on a shelf?",
      answer: { kind: "number", value: 24, display: "24" },
      explanation:
        "There are 4 choices, then 3, then 2, then 1: 4 x 3 x 2 x 1 = 24.",
    });
  });

  it("generates two independent die events", () => {
    const question = generateProbability(fixedRng([0, 0, 0.5]), 3, 4);

    expect(question).toMatchObject({
      topic: "Independent events",
      prompt:
        "Two fair six-sided dice are rolled. What is the probability the first shows 1 and the second shows 4?",
      answer: {
        kind: "fraction",
        numerator: 1,
        denominator: 36,
        display: "1/36",
      },
      explanation:
        "The rolls are independent, so multiply: 1/6 x 1/6 = 1/36.",
    });
  });

  it("generates combination counting", () => {
    const question = generateProbability(fixedRng([0.75, 0.5, 0.5]), 3, 5);

    expect(question).toMatchObject({
      topic: "Combinations",
      prompt:
        "How many different 3-person committees can be chosen from 7 people?",
      answer: { kind: "number", value: 35, display: "35" },
      explanation: "Order does not matter: C(7, 3) = 7! / (3! x 4!) = 35.",
    });
  });

  it("generates an urn draw without replacement", () => {
    const question = generateProbability(fixedRng([0, 0.5, 0.5]), 5, 6);

    expect(question).toMatchObject({
      topic: "Without replacement",
      prompt:
        "An urn contains 5 red and 4 blue tokens. Two tokens are drawn without replacement. What is the probability both are red?",
      answer: {
        kind: "fraction",
        numerator: 5,
        denominator: 18,
        display: "5/18",
      },
      explanation:
        "The probability is 5/9 x 4/8 = 20/72, which reduces to 5/18.",
    });
  });

  it("generates an exact expected value", () => {
    const question = generateProbability(fixedRng([0.75, 0.5, 0.5]), 5, 7);

    expect(question).toMatchObject({
      topic: "Expected value",
      prompt:
        "A fair six-sided die pays 7 points when it shows 4 and 0 points otherwise. What is the expected payout?",
      answer: {
        kind: "fraction",
        numerator: 7,
        denominator: 6,
        display: "7/6",
      },
      explanation:
        "The expected payout is 7 x 1/6 + 0 x 5/6 = 7/6 points.",
    });
  });

  it("uses a singular unit when the expected value is exactly one point", () => {
    const question = generateProbability(fixedRng([0.75, 0.4, 0]), 5, 70);

    expect(question.answer).toEqual({
      kind: "fraction",
      numerator: 1,
      denominator: 1,
      display: "1",
    });
    expect(question.explanation).toBe(
      "The expected payout is 6 x 1/6 + 0 x 5/6 = 1 point.",
    );
    expect(validateAnswer(question.answer.display, question.answer)).toEqual({
      status: "valid",
      correct: true,
      normalized: "1/1",
    });
  });

  it("generates a conditional card draw", () => {
    const question = generateProbability(fixedRng([0, 0.5]), 7, 8);

    expect(question).toMatchObject({
      topic: "Conditional probability",
      prompt:
        "Given that the first card drawn from a standard deck is a club, what is the probability the second card is also a club? The cards are drawn without replacement.",
      answer: {
        kind: "fraction",
        numerator: 4,
        denominator: 17,
        display: "4/17",
      },
      explanation:
        "After one club is drawn, 12 clubs remain among 51 cards, so the probability is 12/51 = 4/17.",
    });
  });

  it("generates multi-stage counting", () => {
    const question = generateProbability(fixedRng([0.75, 0.5]), 7, 9);

    expect(question).toMatchObject({
      topic: "Multi-stage counting",
      prompt:
        "From a team of 6 people, choose a captain, then a deputy, then 2 of the remaining people as presenters. How many outcomes are possible?",
      answer: { kind: "number", value: 180, display: "180" },
      explanation:
        "Choose the captain in 6 ways, the deputy in 5 ways, and 2 of the remaining 4 people: 6 x 5 x C(4, 2) = 180.",
    });
  });

  it("generates a Bayes question with shuffled plausible choices", () => {
    const question = generateProbability(
      fixedRng([0, 0, 0, 0, 0]),
      9,
      10,
    );

    expect(question).toMatchObject({
      topic: "Bayes theorem",
      prompt:
        "One of two bags is chosen with equal probability. Bag A has 3 red tokens and 1 blue token; Bag B has 1 red token and 1 blue token. A red token is drawn. What is the probability it came from Bag A?",
      answer: {
        kind: "choice",
        value: "probability-10-choice-1",
        display: "3/5",
      },
      explanation:
        "With equal priors, compare the red likelihoods: (3/4) / (3/4 + 1/2) = 3/5.",
      choices: [
        { id: "probability-10-choice-2", label: "2/5" },
        { id: "probability-10-choice-3", label: "3/4" },
        { id: "probability-10-choice-4", label: "1/2" },
        { id: "probability-10-choice-1", label: "3/5" },
      ],
    });
  });

  it("generates mixed counting and probability", () => {
    const question = generateProbability(fixedRng([0.75, 0.5, 0.5]), 9, 11);

    expect(question).toMatchObject({
      topic: "Mixed counting probability",
      prompt:
        "A box contains 4 red and 4 blue cards. Three cards are chosen at once. What is the probability exactly two are red?",
      answer: {
        kind: "fraction",
        numerator: 3,
        denominator: 7,
        display: "3/7",
      },
      explanation:
        "There are C(4, 2) x C(4, 1) = 24 favorable hands and C(8, 3) = 56 total hands, so 24/56 = 3/7.",
    });
  });

  it("clamps external difficulty values while preserving levels one through ten", () => {
    expect(generateProbability(fixedRng([0, 0]), -20, 12).difficulty).toBe(1);
    expect(generateProbability(fixedRng([0.99, 0, 0]), 99, 13).difficulty).toBe(
      10,
    );

    for (let difficulty = 1; difficulty <= 10; difficulty += 1) {
      const selector = difficulty >= 9 ? 0.99 : 0;
      const question = generateProbability(
        fixedRng([selector, 0, 0]),
        difficulty,
        difficulty,
      );

      expect(question.difficulty).toBe(difficulty);
    }
  });

  it("selects only templates from the current difficulty band", () => {
    const bands = [
      {
        difficulties: [1, 2],
        first: "Single-die probability",
        last: "Permutations",
        firstValues: [0, 0],
        lastValues: [0.999, 0],
      },
      {
        difficulties: [3, 4],
        first: "Independent events",
        last: "Combinations",
        firstValues: [0, 0, 0],
        lastValues: [0.999, 0, 0],
      },
      {
        difficulties: [5, 6],
        first: "Without replacement",
        last: "Expected value",
        firstValues: [0, 0, 0],
        lastValues: [0.999, 0, 0],
      },
      {
        difficulties: [7, 8],
        first: "Conditional probability",
        last: "Multi-stage counting",
        firstValues: [0, 0],
        lastValues: [0.999, 0],
      },
      {
        difficulties: [9, 10],
        first: "Bayes theorem",
        last: "Mixed counting probability",
        firstValues: [0, 0, 0, 0, 0],
        lastValues: [0.999, 0, 0],
      },
    ] as const;

    for (const band of bands) {
      for (const difficulty of band.difficulties) {
        expect(
          generateProbability(
            fixedRng(band.firstValues),
            difficulty,
            difficulty,
          ).topic,
        ).toBe(band.first);
        expect(
          generateProbability(
            fixedRng(band.lastValues),
            difficulty,
            difficulty + 100,
          ).topic,
        ).toBe(band.last);
      }
    }
  });

  it("satisfies exact-answer invariants across 1,000 seeded questions", () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const rng = createRng(seed);

      for (let difficulty = 1; difficulty <= 10; difficulty += 1) {
        const question = generateProbability(
          rng,
          difficulty,
          seed * 10 + difficulty,
        );
        const bandMinimum = Math.floor((difficulty - 1) / 2) * 2 + 1;

        expect(question.id).toBe(
          `probability-${seed * 10 + difficulty}`,
        );
        expect(question.category).toBe("probability");
        expect(question.difficulty).toBe(difficulty);
        expect(TOPICS_BY_BAND.get(bandMinimum)).toContain(question.topic);
        expect(question.prompt.length).toBeGreaterThan(30);
        expect(question.prompt).not.toMatch(/NaN|Infinity/);
        expect(question.explanation.length).toBeGreaterThan(30);
        expect(question.explanation).not.toMatch(/NaN|Infinity/);
        expect(Number.isFinite(question.targetTimeMs)).toBe(true);
        expect(question.targetTimeMs).toBeGreaterThan(0);
        expectExactAnswer(question);
      }
    }
  });
});
