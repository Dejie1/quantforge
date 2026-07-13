import { getPreset } from "./presets";
import { buildSessionResult } from "./results";
import { createSession, sessionReducer } from "./session";
import type { SessionConfig, SessionState } from "./types";

const CORRECT = {
  status: "valid" as const,
  correct: true,
  normalized: "correct",
};
const INCORRECT = {
  status: "valid" as const,
  correct: false,
  normalized: "incorrect",
};

function resultConfig(
  overrides: Partial<SessionConfig> = {},
): SessionConfig {
  return {
    presetId: "result-fixture",
    mode: "mental-math",
    questionCount: 4,
    durationMs: 60_000,
    categories: ["arithmetic", "probability", "sequences", "estimation"],
    startingDifficulty: 4,
    adaptive: true,
    feedback: "immediate",
    allowPause: true,
    allowSkip: true,
    allowNavigation: true,
    ...overrides,
  };
}

function start(config: SessionConfig, seed = 1): SessionState {
  return sessionReducer(createSession(config, seed), {
    type: "start",
    nowMs: 1_000,
  });
}

describe("buildSessionResult", () => {
  it("reconciles every question and reports transparent aggregate metrics", () => {
    let state = start(resultConfig());
    state = sessionReducer(state, {
      type: "submit",
      input: "entered-correct",
      validation: CORRECT,
      nowMs: 2_000,
    });
    state = sessionReducer(state, { type: "navigate", index: 1, nowMs: 2_500 });
    state = sessionReducer(state, {
      type: "submit",
      input: "entered-wrong",
      validation: INCORRECT,
      nowMs: 5_000,
    });
    state = sessionReducer(state, { type: "navigate", index: 2, nowMs: 5_500 });
    state = sessionReducer(state, { type: "skip", nowMs: 7_000 });
    const completed = sessionReducer(state, { type: "expire", nowMs: 61_000 });

    const result = buildSessionResult(completed);

    expect(result).toMatchObject({
      sessionId: completed.id,
      presetId: "result-fixture",
      startedAtMs: 1_000,
      completedAtMs: 61_000,
      correct: 1,
      incorrect: 1,
      skipped: 1,
      unanswered: 1,
      accuracy: 0.5,
      completionRate: 0.75,
      medianResponseTimeMs: 2_000,
      correctPerMinute: 1,
      longestStreak: 1,
    });
    expect(result.difficultyTransitions).toEqual([
      {
        category: "arithmetic",
        startingDifficulty: 4,
        endingDifficulty: 4,
        adaptive: true,
        evaluated: false,
      },
      {
        category: "probability",
        startingDifficulty: 4,
        endingDifficulty: 4,
        adaptive: true,
        evaluated: false,
      },
      {
        category: "sequences",
        startingDifficulty: 4,
        endingDifficulty: 4,
        adaptive: true,
        evaluated: false,
      },
      {
        category: "estimation",
        startingDifficulty: 4,
        endingDifficulty: 4,
        adaptive: true,
        evaluated: false,
      },
    ]);
    expect(result.review).toHaveLength(4);
    expect(result.review.map(({ outcome }) => outcome)).toEqual([
      "correct",
      "incorrect",
      "skipped",
      "unanswered",
    ]);
    expect(result.review[0]).toEqual({
      question: completed.questions[0],
      input: "entered-correct",
      outcome: "correct",
      responseTimeMs: 1_000,
    });
    expect(result.review[2]).toMatchObject({
      input: "",
      outcome: "skipped",
      responseTimeMs: 2_000,
    });
    expect(result.review[3]).toMatchObject({
      input: null,
      outcome: "unanswered",
      responseTimeMs: null,
    });
  });

  it("reports category totals, attempted accuracy, and attempted median time", () => {
    let state = start(resultConfig(), 2);
    state = sessionReducer(state, {
      type: "submit",
      input: "right",
      validation: CORRECT,
      nowMs: 2_000,
    });
    state = sessionReducer(state, { type: "navigate", index: 1, nowMs: 2_500 });
    state = sessionReducer(state, {
      type: "submit",
      input: "wrong",
      validation: INCORRECT,
      nowMs: 5_000,
    });
    state = sessionReducer(state, { type: "navigate", index: 2, nowMs: 5_500 });
    state = sessionReducer(state, { type: "skip", nowMs: 7_000 });
    state = sessionReducer(state, { type: "expire", nowMs: 61_000 });

    expect(buildSessionResult(state).categories).toEqual([
      {
        category: "arithmetic",
        correct: 1,
        attempted: 1,
        total: 1,
        accuracy: 1,
        medianResponseTimeMs: 1_000,
      },
      {
        category: "probability",
        correct: 0,
        attempted: 1,
        total: 1,
        accuracy: 0,
        medianResponseTimeMs: 3_000,
      },
      {
        category: "sequences",
        correct: 0,
        attempted: 0,
        total: 1,
        accuracy: null,
        medianResponseTimeMs: null,
      },
      {
        category: "estimation",
        correct: 0,
        attempted: 0,
        total: 1,
        accuracy: null,
        medianResponseTimeMs: null,
      },
    ]);
  });

  it("returns null attempted metrics when a mock expires unanswered", () => {
    const active = sessionReducer(
      createSession(getPreset("speed-arithmetic"), 3),
      { type: "start", nowMs: 1_000 },
    );
    const expired = sessionReducer(active, { type: "expire", nowMs: 481_000 });
    const result = buildSessionResult(expired);

    expect(result).toMatchObject({
      correct: 0,
      incorrect: 0,
      skipped: 0,
      unanswered: 80,
      accuracy: null,
      completionRate: 0,
      medianResponseTimeMs: null,
      correctPerMinute: 0,
      longestStreak: 0,
    });
  });

  it("uses the middle value for odd medians and the mean for even medians", () => {
    let odd = start(
      resultConfig({
        questionCount: 3,
        durationMs: null,
        categories: ["arithmetic"],
        allowNavigation: false,
      }),
      4,
    );
    for (const nowMs of [2_000, 5_000, 10_000]) {
      odd = sessionReducer(odd, {
        type: "submit",
        input: "right",
        validation: CORRECT,
        nowMs,
      });
    }

    let even = start(
      resultConfig({
        questionCount: 2,
        durationMs: null,
        categories: ["arithmetic"],
        allowNavigation: false,
      }),
      5,
    );
    for (const nowMs of [2_000, 5_000]) {
      even = sessionReducer(even, {
        type: "submit",
        input: "right",
        validation: CORRECT,
        nowMs,
      });
    }

    expect(buildSessionResult(odd).medianResponseTimeMs).toBe(3_000);
    expect(buildSessionResult(even).medianResponseTimeMs).toBe(2_000);
  });

  it("breaks the longest streak on skipped, incorrect, and unanswered rows", () => {
    let state = start(
      resultConfig({
        questionCount: 6,
        categories: ["arithmetic"],
        allowNavigation: false,
      }),
      6,
    );
    for (const [index, outcome] of [
      "correct",
      "correct",
      "skipped",
      "correct",
      "incorrect",
    ].entries()) {
      const nowMs = 2_000 + index * 1_000;
      state =
        outcome === "skipped"
          ? sessionReducer(state, { type: "skip", nowMs })
          : sessionReducer(state, {
              type: "submit",
              input: outcome,
              validation: outcome === "correct" ? CORRECT : INCORRECT,
              nowMs,
            });
    }
    state = sessionReducer(state, { type: "expire", nowMs: 61_000 });

    expect(buildSessionResult(state).longestStreak).toBe(2);
  });

  it("uses active elapsed time for correct per minute and returns zero at zero time", () => {
    let paused = start(
      resultConfig({
        questionCount: 1,
        durationMs: null,
        categories: ["arithmetic"],
        allowNavigation: false,
      }),
      7,
    );
    paused = sessionReducer(paused, { type: "pause", nowMs: 2_000 });
    paused = sessionReducer(paused, { type: "resume", nowMs: 62_000 });
    paused = sessionReducer(paused, {
      type: "submit",
      input: "right",
      validation: CORRECT,
      nowMs: 63_000,
    });

    let zero = start(
      resultConfig({
        questionCount: 1,
        durationMs: null,
        categories: ["arithmetic"],
        allowNavigation: false,
      }),
      8,
    );
    zero = sessionReducer(zero, {
      type: "submit",
      input: "right",
      validation: CORRECT,
      nowMs: 1_000,
    });

    expect(buildSessionResult(paused).correctPerMinute).toBe(30);
    expect(buildSessionResult(zero).correctPerMinute).toBe(0);
  });

  it("rejects incomplete sessions", () => {
    expect(() => buildSessionResult(createSession(resultConfig(), 9))).toThrow(
      "Cannot build a result for an incomplete session",
    );
  });
});
