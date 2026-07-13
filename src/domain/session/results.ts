import type { QuestionCategory } from "../questions/types";
import type {
  CategoryResult,
  ReviewRow,
  SessionResult,
  SessionState,
} from "./types";

function median(values: ReadonlyArray<number>): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function categoryOrder(state: SessionState): QuestionCategory[] {
  const categories = new Set<QuestionCategory>(state.config.categories);

  for (const question of state.questions) {
    categories.add(question.category);
  }

  return [...categories];
}

function categoryResult(
  category: QuestionCategory,
  review: ReadonlyArray<ReviewRow>,
): CategoryResult {
  const rows = review.filter(({ question }) => question.category === category);
  const attemptedRows = rows.filter(
    ({ outcome }) => outcome === "correct" || outcome === "incorrect",
  );
  const correct = attemptedRows.filter(
    ({ outcome }) => outcome === "correct",
  ).length;
  const responseTimes = attemptedRows.flatMap(({ responseTimeMs }) =>
    responseTimeMs === null ? [] : [responseTimeMs],
  );

  return {
    category,
    correct,
    attempted: attemptedRows.length,
    total: rows.length,
    accuracy: attemptedRows.length === 0 ? null : correct / attemptedRows.length,
    medianResponseTimeMs: median(responseTimes),
  };
}

function longestCorrectStreak(review: ReadonlyArray<ReviewRow>): number {
  let current = 0;
  let longest = 0;

  for (const row of review) {
    if (row.outcome === "correct") {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }

  return longest;
}

export function buildSessionResult(state: SessionState): SessionResult {
  if (
    state.phase !== "completed" ||
    state.startedAtMs === null ||
    state.completedAtMs === null
  ) {
    throw new Error("Cannot build a result for an incomplete session");
  }

  const review: ReviewRow[] = state.questions.map((question) => {
    const answer = state.answers[question.id];

    return answer === undefined
      ? {
          question,
          input: null,
          outcome: "unanswered",
          responseTimeMs: null,
        }
      : {
          question,
          input: answer.input,
          outcome: answer.outcome,
          responseTimeMs: answer.responseTimeMs,
        };
  });
  const correct = review.filter(({ outcome }) => outcome === "correct").length;
  const incorrect = review.filter(
    ({ outcome }) => outcome === "incorrect",
  ).length;
  const skipped = review.filter(({ outcome }) => outcome === "skipped").length;
  const unanswered = review.filter(
    ({ outcome }) => outcome === "unanswered",
  ).length;
  const attempted = correct + incorrect;
  const responseTimes = review.flatMap(({ outcome, responseTimeMs }) =>
    (outcome === "correct" || outcome === "incorrect") &&
    responseTimeMs !== null
      ? [responseTimeMs]
      : [],
  );
  const activeElapsedMs = Math.max(
    0,
    state.completedAtMs - state.startedAtMs - state.accumulatedPauseMs,
  );
  const difficultyTransitions =
    state.config.mode === "mock"
      ? []
      : [...new Set(state.config.categories)].map((category) => ({
          category,
          startingDifficulty: state.config.startingDifficulty,
          endingDifficulty: state.config.startingDifficulty,
          adaptive: state.config.adaptive,
          evaluated: false,
        }));

  return {
    sessionId: state.id,
    presetId: state.config.presetId,
    startedAtMs: state.startedAtMs,
    completedAtMs: state.completedAtMs,
    correct,
    incorrect,
    skipped,
    unanswered,
    accuracy: attempted === 0 ? null : correct / attempted,
    completionRate:
      review.length === 0 ? 0 : (review.length - unanswered) / review.length,
    medianResponseTimeMs: median(responseTimes),
    correctPerMinute:
      activeElapsedMs === 0 ? 0 : (correct * 60_000) / activeElapsedMs,
    longestStreak: longestCorrectStreak(review),
    difficultyTransitions,
    categories: categoryOrder(state).map((category) =>
      categoryResult(category, review),
    ),
    review,
  };
}
