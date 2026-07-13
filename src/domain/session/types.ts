import type { AnswerValidation } from "../answers";
import type { Question, QuestionCategory } from "../questions/types";

export type SessionPhase = "ready" | "active" | "paused" | "completed";
export type QuestionOutcome =
  | "correct"
  | "incorrect"
  | "skipped"
  | "unanswered";
export type SessionMode =
  | "mental-math"
  | "probability"
  | "sequences-estimation"
  | "mock";

export interface SessionConfig {
  presetId: string;
  mode: SessionMode;
  questionCount: number;
  durationMs: number | null;
  categories: QuestionCategory[];
  startingDifficulty: number;
  adaptive: boolean;
  feedback: "immediate" | "deferred";
  allowPause: boolean;
  allowSkip: boolean;
  allowNavigation: boolean;
}

export interface SessionAnswer {
  input: string;
  outcome: Exclude<QuestionOutcome, "unanswered">;
  answeredAtMs: number;
  responseTimeMs: number;
}

export interface SessionState {
  id: string;
  seed: number;
  phase: SessionPhase;
  config: SessionConfig;
  questions: Question[];
  answers: Record<string, SessionAnswer>;
  currentIndex: number;
  startedAtMs: number | null;
  deadlineMs: number | null;
  pausedAtMs: number | null;
  accumulatedPauseMs: number;
  completedAtMs: number | null;
}

export interface CategoryResult {
  category: QuestionCategory;
  correct: number;
  attempted: number;
  total: number;
  accuracy: number | null;
  medianResponseTimeMs: number | null;
}

export interface ReviewRow {
  question: Question;
  input: string | null;
  outcome: QuestionOutcome;
  responseTimeMs: number | null;
}

export interface DifficultyTransition {
  category: QuestionCategory;
  startingDifficulty: number;
  endingDifficulty: number;
  adaptive: boolean;
  evaluated: boolean;
}

export interface SessionResult {
  sessionId: string;
  presetId: string;
  startedAtMs: number;
  completedAtMs: number;
  correct: number;
  incorrect: number;
  skipped: number;
  unanswered: number;
  accuracy: number | null;
  completionRate: number;
  medianResponseTimeMs: number | null;
  correctPerMinute: number;
  longestStreak: number;
  difficultyTransitions: DifficultyTransition[];
  categories: CategoryResult[];
  review: ReviewRow[];
}

export type SessionAction =
  | { type: "start"; nowMs: number }
  | {
      type: "submit";
      input: string;
      validation: AnswerValidation;
      nowMs: number;
    }
  | { type: "skip"; nowMs: number }
  | { type: "navigate"; index: number; nowMs: number }
  | { type: "pause"; nowMs: number }
  | { type: "resume"; nowMs: number }
  | { type: "finish"; nowMs: number }
  | { type: "expire"; nowMs: number };
