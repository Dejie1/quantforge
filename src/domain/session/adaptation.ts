import type { QuestionCategory } from "../questions/types";
import type { ReviewRow, SessionResult } from "./types";

export interface AdaptDifficultyRequest {
  currentDifficulty: number;
  result: SessionResult;
  category: QuestionCategory;
  adaptive: boolean;
}

const WINDOW_SIZE = 5;

function clampDifficulty(difficulty: number): number {
  const comparableDifficulty = Number.isNaN(difficulty) ? 1 : difficulty;
  return Math.min(10, Math.max(1, comparableDifficulty));
}

function median(values: ReadonlyArray<number>): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function isAttemptedRow(row: ReviewRow): boolean {
  return row.outcome === "correct" || row.outcome === "incorrect";
}

export function adaptDifficulty({
  currentDifficulty,
  result,
  category,
  adaptive,
}: AdaptDifficultyRequest): number {
  const current = clampDifficulty(currentDifficulty);

  if (!adaptive) {
    return current;
  }

  const window = result.review
    .filter(
      (row) => row.question.category === category && isAttemptedRow(row),
    )
    .slice(-WINDOW_SIZE);

  if (window.length < WINDOW_SIZE) {
    return current;
  }

  const correctRows = window.filter(({ outcome }) => outcome === "correct");
  const accuracy = correctRows.length / WINDOW_SIZE;

  if (accuracy < 0.5) {
    return clampDifficulty(current - 1);
  }

  if (accuracy < 0.8) {
    return current;
  }

  const correctResponseTimes = correctRows.map(({ responseTimeMs }) =>
    responseTimeMs === null ? Number.POSITIVE_INFINITY : responseTimeMs,
  );
  const correspondingTargets = correctRows.map(
    ({ question }) => question.targetTimeMs,
  );

  return median(correctResponseTimes) < median(correspondingTargets)
    ? clampDifficulty(current + 1)
    : current;
}
