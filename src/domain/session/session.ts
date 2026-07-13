import { generateQuestion } from "../questions/generate";
import type { QuestionCategory } from "../questions/types";
import { createRng } from "../random";
import type {
  SessionAction,
  SessionAnswer,
  SessionConfig,
  SessionState,
} from "./types";

const MIXED_COMPOSITION: ReadonlyArray<QuestionCategory> = [
  ...Array<QuestionCategory>(12).fill("arithmetic"),
  ...Array<QuestionCategory>(8).fill("probability"),
  ...Array<QuestionCategory>(5).fill("sequences"),
  ...Array<QuestionCategory>(5).fill("estimation"),
];

function cloneConfig(config: SessionConfig): SessionConfig {
  return {
    ...config,
    categories: [...config.categories],
  };
}

function categorySchedule(
  config: SessionConfig,
  seed: number,
): QuestionCategory[] {
  if (config.presetId === "speed-arithmetic") {
    return Array<QuestionCategory>(config.questionCount).fill("arithmetic");
  }

  if (config.presetId === "mixed-quant") {
    return createRng(seed).shuffle(MIXED_COMPOSITION);
  }

  if (config.categories.length === 0) {
    throw new RangeError("A session must include at least one question category");
  }

  return Array.from(
    { length: config.questionCount },
    (_, index) => config.categories[index % config.categories.length],
  );
}

function difficultyFor(
  config: SessionConfig,
  index: number,
): number {
  if (config.presetId !== "speed-arithmetic") {
    return config.startingDifficulty;
  }

  if (config.questionCount <= 1) {
    return 3;
  }

  return 3 + Math.floor((index * 6) / (config.questionCount - 1));
}

function latestAnswer(state: SessionState): SessionAnswer | undefined {
  let latest: SessionAnswer | undefined;

  for (const answer of Object.values(state.answers)) {
    if (latest === undefined || answer.answeredAtMs > latest.answeredAtMs) {
      latest = answer;
    }
  }

  return latest;
}

function responseTimeMs(state: SessionState, nowMs: number): number {
  if (state.startedAtMs === null) {
    return 0;
  }

  const latest = latestAnswer(state);

  // Navigable mocks use the most recently recorded answer as the timer origin,
  // independent of question order. Practice subtracts every accumulated pause
  // by comparing total active time with the response segments already stored.
  if (state.accumulatedPauseMs === 0) {
    return Math.max(
      0,
      nowMs - (latest?.answeredAtMs ?? state.startedAtMs),
    );
  }

  const activeElapsedMs = Math.max(
    0,
    nowMs - state.startedAtMs - state.accumulatedPauseMs,
  );
  const previouslyRecordedMs = Object.values(state.answers).reduce(
    (total, answer) => total + answer.responseTimeMs,
    0,
  );

  return Math.max(0, activeElapsedMs - previouslyRecordedMs);
}

function recordOutcome(
  state: SessionState,
  input: string,
  outcome: SessionAnswer["outcome"],
  nowMs: number,
): SessionState {
  const question = state.questions[state.currentIndex];

  if (question === undefined) {
    return state;
  }

  const answers = {
    ...state.answers,
    [question.id]: {
      input,
      outcome,
      answeredAtMs: nowMs,
      responseTimeMs: responseTimeMs(state, nowMs),
    },
  };
  const completed = Object.keys(answers).length === state.questions.length;
  const nextIndex = state.config.allowNavigation
    ? state.currentIndex
    : Math.min(state.currentIndex + 1, state.questions.length - 1);

  return {
    ...state,
    phase: completed ? "completed" : state.phase,
    answers,
    currentIndex: nextIndex,
    pausedAtMs: completed ? null : state.pausedAtMs,
    completedAtMs: completed ? nowMs : state.completedAtMs,
  };
}

function completeAtDeadline(state: SessionState): SessionState {
  if (state.deadlineMs === null) {
    return state;
  }

  return {
    ...state,
    phase: "completed",
    pausedAtMs: null,
    completedAtMs: state.deadlineMs,
  };
}

export function createSession(
  config: SessionConfig,
  seed: number,
): SessionState {
  const sessionConfig = cloneConfig(config);
  const categories = categorySchedule(sessionConfig, seed);
  const questions = categories.map((category, index) =>
    generateQuestion({
      seed,
      index,
      category,
      difficulty: difficultyFor(sessionConfig, index),
    }),
  );

  return {
    id: `session-${sessionConfig.presetId}-${seed}`,
    seed,
    phase: "ready",
    config: sessionConfig,
    questions,
    answers: {},
    currentIndex: 0,
    startedAtMs: null,
    deadlineMs: null,
    pausedAtMs: null,
    accumulatedPauseMs: 0,
    completedAtMs: null,
  };
}

export function remainingMs(
  state: SessionState,
  nowMs: number,
): number | null {
  if (state.deadlineMs === null) {
    return null;
  }

  const referenceMs =
    state.phase === "paused" && state.pausedAtMs !== null
      ? state.pausedAtMs
      : nowMs;

  return Math.max(0, state.deadlineMs - referenceMs);
}

export function sessionReducer(
  state: SessionState,
  action: SessionAction,
): SessionState {
  if (state.phase === "completed") {
    return state;
  }

  if (
    state.phase === "active" &&
    state.deadlineMs !== null &&
    action.nowMs >= state.deadlineMs
  ) {
    return completeAtDeadline(state);
  }

  switch (action.type) {
    case "start":
      if (state.phase !== "ready") {
        return state;
      }

      return {
        ...state,
        phase: "active",
        startedAtMs: action.nowMs,
        deadlineMs:
          state.config.durationMs === null
            ? null
            : action.nowMs + state.config.durationMs,
      };

    case "submit":
      if (state.phase !== "active" || action.validation.status === "invalid") {
        return state;
      }

      return recordOutcome(
        state,
        action.input,
        action.validation.correct ? "correct" : "incorrect",
        action.nowMs,
      );

    case "skip":
      if (state.phase !== "active" || !state.config.allowSkip) {
        return state;
      }

      return recordOutcome(state, "", "skipped", action.nowMs);

    case "navigate":
      if (
        state.phase !== "active" ||
        !state.config.allowNavigation ||
        !Number.isInteger(action.index) ||
        action.index < 0 ||
        action.index >= state.questions.length ||
        action.index === state.currentIndex
      ) {
        return state;
      }

      return { ...state, currentIndex: action.index };

    case "pause":
      if (state.phase !== "active" || !state.config.allowPause) {
        return state;
      }

      return {
        ...state,
        phase: "paused",
        pausedAtMs: action.nowMs,
      };

    case "resume": {
      if (state.phase !== "paused" || state.pausedAtMs === null) {
        return state;
      }

      const pauseMs = Math.max(0, action.nowMs - state.pausedAtMs);

      return {
        ...state,
        phase: "active",
        deadlineMs:
          state.deadlineMs === null ? null : state.deadlineMs + pauseMs,
        pausedAtMs: null,
        accumulatedPauseMs: state.accumulatedPauseMs + pauseMs,
      };
    }

    case "finish":
      if (
        state.phase !== "active" ||
        state.config.mode !== "mock" ||
        state.config.presetId !== "mixed-quant"
      ) {
        return state;
      }

      return {
        ...state,
        phase: "completed",
        pausedAtMs: null,
        completedAtMs: action.nowMs,
      };

    case "expire":
      if (
        state.phase !== "active" ||
        state.deadlineMs === null ||
        action.nowMs < state.deadlineMs
      ) {
        return state;
      }

      return completeAtDeadline(state);
  }
}
