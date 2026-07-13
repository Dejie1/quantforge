import type { QuestionCategory } from "../questions/types";
import type { QuestionOutcome, ReviewRow, SessionResult } from "./types";
import { adaptDifficulty } from "./adaptation";

let rowId = 0;

function row(
  outcome: QuestionOutcome,
  responseTimeMs: number | null,
  targetTimeMs: number,
  category: QuestionCategory = "arithmetic",
): ReviewRow {
  rowId += 1;

  return {
    question: {
      id: `${category}-${rowId}`,
      category,
      topic: "Test topic",
      difficulty: 3,
      prompt: "1 + 1 = ?",
      answer: { kind: "number", value: 2, display: "2" },
      explanation: "One plus one is two.",
      targetTimeMs,
    },
    input: outcome === "unanswered" ? null : "2",
    outcome,
    responseTimeMs,
  };
}

function result(review: ReviewRow[]): SessionResult {
  const correct = review.filter(({ outcome }) => outcome === "correct").length;
  const incorrect = review.filter(({ outcome }) => outcome === "incorrect").length;
  const skipped = review.filter(({ outcome }) => outcome === "skipped").length;
  const unanswered = review.filter(
    ({ outcome }) => outcome === "unanswered",
  ).length;
  const attempted = correct + incorrect;

  return {
    sessionId: "adaptation-fixture",
    presetId: "practice-fixture",
    startedAtMs: 1_000,
    completedAtMs: 20_000,
    correct,
    incorrect,
    skipped,
    unanswered,
    accuracy: attempted === 0 ? null : correct / attempted,
    completionRate: review.length === 0 ? 0 : 1 - unanswered / review.length,
    medianResponseTimeMs: null,
    correctPerMinute: 0,
    longestStreak: 0,
    categories: [],
    difficultyTransitions: [],
    review,
  };
}

const FAST_WINDOW = result([
  row("correct", 1_000, 8_000),
  row("correct", 1_100, 8_000),
  row("correct", 1_200, 8_000),
  row("correct", 1_300, 8_000),
  row("incorrect", 1_400, 8_000),
]);

const LOW_ACCURACY_WINDOW = result([
  row("correct", 1_000, 8_000),
  row("correct", 1_000, 8_000),
  row("incorrect", 1_000, 8_000),
  row("incorrect", 1_000, 8_000),
  row("incorrect", 1_000, 8_000),
]);

describe("adaptDifficulty", () => {
  it("increases one level at 80% when the median correct time beats its targets", () => {
    const withIgnoredHistory = result([
      row("incorrect", 30_000, 8_000),
      FAST_WINDOW.review[0],
      row("correct", 500, 500, "probability"),
      FAST_WINDOW.review[1],
      row("skipped", 100, 8_000),
      FAST_WINDOW.review[2],
      row("unanswered", null, 8_000),
      FAST_WINDOW.review[3],
      FAST_WINDOW.review[4],
      row("incorrect", 500, 500, "probability"),
    ]);

    expect(
      adaptDifficulty({
        currentDifficulty: 4,
        result: withIgnoredHistory,
        category: "arithmetic",
        adaptive: true,
      }),
    ).toBe(5);
  });

  it("requires the median correct time to be strictly below the corresponding median target", () => {
    const tied = result([
      row("correct", 2_000, 1_000),
      row("correct", 2_000, 2_000),
      row("correct", 2_000, 2_000),
      row("correct", 2_000, 3_000),
      row("incorrect", 100, 9_000),
    ]);

    expect(
      adaptDifficulty({
        currentDifficulty: 4,
        result: tied,
        category: "arithmetic",
        adaptive: true,
      }),
    ).toBe(4);
  });

  it("decreases one level below 50% accuracy", () => {
    expect(
      adaptDifficulty({
        currentDifficulty: 4,
        result: LOW_ACCURACY_WINDOW,
        category: "arithmetic",
        adaptive: true,
      }),
    ).toBe(3);
  });

  it("keeps the level for middle accuracy and for fewer than five samples", () => {
    const middle = result([
      row("correct", 1_000, 8_000),
      row("correct", 1_000, 8_000),
      row("correct", 1_000, 8_000),
      row("incorrect", 1_000, 8_000),
      row("incorrect", 1_000, 8_000),
    ]);
    const insufficient = result(FAST_WINDOW.review.slice(0, 4));

    expect(
      adaptDifficulty({
        currentDifficulty: 4,
        result: middle,
        category: "arithmetic",
        adaptive: true,
      }),
    ).toBe(4);
    expect(
      adaptDifficulty({
        currentDifficulty: 4,
        result: insufficient,
        category: "arithmetic",
        adaptive: true,
      }),
    ).toBe(4);
  });

  it("enforces the 1-10 bounds", () => {
    expect(
      adaptDifficulty({
        currentDifficulty: 10,
        result: FAST_WINDOW,
        category: "arithmetic",
        adaptive: true,
      }),
    ).toBe(10);
    expect(
      adaptDifficulty({
        currentDifficulty: 1,
        result: LOW_ACCURACY_WINDOW,
        category: "arithmetic",
        adaptive: true,
      }),
    ).toBe(1);
  });

  it("does not adapt mocks and still clamps their configured level", () => {
    expect(
      adaptDifficulty({
        currentDifficulty: 20,
        result: FAST_WINDOW,
        category: "arithmetic",
        adaptive: false,
      }),
    ).toBe(10);
    expect(
      adaptDifficulty({
        currentDifficulty: -5,
        result: LOW_ACCURACY_WINDOW,
        category: "arithmetic",
        adaptive: false,
      }),
    ).toBe(1);
  });
});
