import type { AnswerValidation } from "../answers";
import { getPreset } from "./presets";
import { buildSessionResult } from "./results";
import { createSession, remainingMs, sessionReducer } from "./session";
import type { SessionAction, SessionConfig } from "./types";

const CORRECT: AnswerValidation = {
  status: "valid",
  correct: true,
  normalized: "correct",
};
const INCORRECT: AnswerValidation = {
  status: "valid",
  correct: false,
  normalized: "incorrect",
};
const INVALID: AnswerValidation = {
  status: "invalid",
  message: "Enter a number",
};

function practiceConfig(
  overrides: Partial<SessionConfig> = {},
): SessionConfig {
  return {
    presetId: "test-practice",
    mode: "mental-math",
    questionCount: 3,
    durationMs: null,
    categories: ["arithmetic"],
    startingDifficulty: 4,
    adaptive: true,
    feedback: "immediate",
    allowPause: true,
    allowSkip: true,
    allowNavigation: false,
    ...overrides,
  };
}

function categoryCounts(categories: string[]): Record<string, number> {
  return categories.reduce<Record<string, number>>((counts, category) => {
    counts[category] = (counts[category] ?? 0) + 1;
    return counts;
  }, {});
}

const DEADLINE_ACTION_SCENARIOS: ReadonlyArray<{
  label: string;
  presetId: "mental-2m" | "mixed-quant";
  action(nowMs: number): SessionAction;
  eligible: {
    phase: "active" | "paused";
    currentIndex: number;
    answerCount: number;
    sameState?: boolean;
  };
}> = [
  {
    label: "valid submit",
    presetId: "mental-2m",
    action: (nowMs) => ({
      type: "submit",
      input: "answer",
      validation: CORRECT,
      nowMs,
    }),
    eligible: { phase: "active", currentIndex: 1, answerCount: 1 },
  },
  {
    label: "invalid submit",
    presetId: "mental-2m",
    action: (nowMs) => ({
      type: "submit",
      input: "invalid",
      validation: INVALID,
      nowMs,
    }),
    eligible: {
      phase: "active",
      currentIndex: 0,
      answerCount: 0,
      sameState: true,
    },
  },
  {
    label: "skip",
    presetId: "mental-2m",
    action: (nowMs) => ({ type: "skip", nowMs }),
    eligible: { phase: "active", currentIndex: 1, answerCount: 1 },
  },
  {
    label: "navigation",
    presetId: "mixed-quant",
    action: (nowMs) => ({ type: "navigate", index: 1, nowMs }),
    eligible: { phase: "active", currentIndex: 1, answerCount: 0 },
  },
  {
    label: "pause",
    presetId: "mental-2m",
    action: (nowMs) => ({ type: "pause", nowMs }),
    eligible: { phase: "paused", currentIndex: 0, answerCount: 0 },
  },
];

const DEADLINE_BOUNDARIES = [
  { timing: "immediately before the deadline", offsetMs: -1 },
  { timing: "exactly at the deadline", offsetMs: 0 },
  { timing: "after the deadline", offsetMs: 1 },
] as const;

describe("createSession", () => {
  it("creates a ready deterministic session without mutating its config", () => {
    const config = getPreset("probability-10");
    const originalCategories = [...config.categories];

    const first = createSession(config, 48_151_623);
    const second = createSession(config, 48_151_623);

    expect(first).toMatchObject({
      phase: "ready",
      seed: 48_151_623,
      answers: {},
      currentIndex: 0,
      startedAtMs: null,
      deadlineMs: null,
      pausedAtMs: null,
      accumulatedPauseMs: 0,
      completedAtMs: null,
    });
    expect(first.questions).toEqual(second.questions);
    expect(first.questions).toHaveLength(10);
    expect(first.questions.every(({ category }) => category === "probability")).toBe(
      true,
    );
    expect(config.categories).toEqual(originalCategories);
    expect(first.config).not.toBe(config);
    expect(first.config.categories).not.toBe(config.categories);

    config.questionCount = 1;
    config.categories.push("arithmetic");
    expect(first.config.questionCount).toBe(10);
    expect(first.config.categories).toEqual(["probability"]);
  });

  it("builds the monotonic 3-to-9 Speed Arithmetic difficulty ramp", () => {
    const session = createSession(getPreset("speed-arithmetic"), 99);
    const difficulties = session.questions.map(({ difficulty }) => difficulty);

    expect(session.questions).toHaveLength(80);
    expect(session.questions.every(({ category }) => category === "arithmetic")).toBe(
      true,
    );
    expect(difficulties[0]).toBe(3);
    expect(difficulties.at(-1)).toBe(9);
    expect(
      difficulties.every(
        (difficulty, index) => index === 0 || difficulty >= difficulties[index - 1],
      ),
    ).toBe(true);
  });

  it("builds and deterministically shuffles the exact Mixed Quant composition", () => {
    const first = createSession(getPreset("mixed-quant"), 2_026);
    const replay = createSession(getPreset("mixed-quant"), 2_026);
    const other = createSession(getPreset("mixed-quant"), 2_027);
    const categories = first.questions.map(({ category }) => category);

    expect(categoryCounts(categories)).toEqual({
      arithmetic: 12,
      probability: 8,
      sequences: 5,
      estimation: 5,
    });
    expect(replay.questions).toEqual(first.questions);
    expect(other.questions.map(({ category }) => category)).not.toEqual(categories);
    expect(new Set(first.questions.map(({ id }) => id)).size).toBe(30);
  });

  it.each(["sequences-estimation-10", "sequences-estimation-20"] as const)(
    "splits %s evenly between sequences and estimation",
    (presetId) => {
      const session = createSession(getPreset(presetId), 730_021);
      const half = session.config.questionCount / 2;

      expect(categoryCounts(session.questions.map(({ category }) => category))).toEqual({
        sequences: half,
        estimation: half,
      });
    },
  );
});

describe("sessionReducer", () => {
  it("starts explicitly so time spent on the ready screen is never charged", () => {
    const ready = createSession(getPreset("mental-2m"), 1);
    const active = sessionReducer(ready, { type: "start", nowMs: 50_000 });

    expect(ready.startedAtMs).toBeNull();
    expect(ready.deadlineMs).toBeNull();
    expect(active.phase).toBe("active");
    expect(active.startedAtMs).toBe(50_000);
    expect(active.deadlineMs).toBe(170_000);
    expect(remainingMs(active, 50_500)).toBe(119_500);
    expect(sessionReducer(active, { type: "start", nowMs: 60_000 })).toBe(active);
  });

  it("leaves state unchanged for invalid submissions", () => {
    const active = sessionReducer(createSession(practiceConfig(), 2), {
      type: "start",
      nowMs: 1_000,
    });

    expect(
      sessionReducer(active, {
        type: "submit",
        input: "not a number",
        validation: INVALID,
        nowMs: 9_000,
      }),
    ).toBe(active);
  });

  it("advances Speed Arithmetic after every valid submission", () => {
    const ready = createSession(getPreset("speed-arithmetic"), 3);
    const active = sessionReducer(ready, { type: "start", nowMs: 1_000 });
    const questionId = active.questions[0].id;
    const submitted = sessionReducer(active, {
      type: "submit",
      input: " 41 ",
      validation: INCORRECT,
      nowMs: 3_500,
    });

    expect(submitted.currentIndex).toBe(1);
    expect(submitted.answers[questionId]).toEqual({
      input: " 41 ",
      outcome: "incorrect",
      answeredAtMs: 3_500,
      responseTimeMs: 2_500,
    });
    expect(active.answers).toEqual({});
    expect(submitted.answers).not.toBe(active.answers);
    expect(submitted.questions).toBe(active.questions);
  });

  it("ignores pause and skip for mocks", () => {
    const active = sessionReducer(
      createSession(getPreset("speed-arithmetic"), 4),
      { type: "start", nowMs: 1_000 },
    );

    expect(sessionReducer(active, { type: "pause", nowMs: 2_000 })).toBe(active);
    expect(sessionReducer(active, { type: "skip", nowMs: 2_000 })).toBe(active);
  });

  it("freezes a practice countdown while paused and extends its deadline", () => {
    const active = sessionReducer(
      createSession(getPreset("mental-2m"), 5),
      { type: "start", nowMs: 1_000 },
    );
    const paused = sessionReducer(active, { type: "pause", nowMs: 11_000 });

    expect(paused.phase).toBe("paused");
    expect(paused.pausedAtMs).toBe(11_000);
    expect(remainingMs(paused, 30_000)).toBe(110_000);

    const resumed = sessionReducer(paused, { type: "resume", nowMs: 31_000 });
    expect(resumed).toMatchObject({
      phase: "active",
      pausedAtMs: null,
      accumulatedPauseMs: 20_000,
      deadlineMs: 141_000,
    });
    expect(remainingMs(resumed, 31_000)).toBe(110_000);
  });

  it("measures sequential response time in active time across a pause", () => {
    let state = sessionReducer(
      createSession(practiceConfig({ questionCount: 2 }), 6),
      { type: "start", nowMs: 1_000 },
    );
    const firstId = state.questions[0].id;
    state = sessionReducer(state, {
      type: "submit",
      input: "first",
      validation: CORRECT,
      nowMs: 4_000,
    });
    state = sessionReducer(state, { type: "pause", nowMs: 5_000 });
    state = sessionReducer(state, { type: "resume", nowMs: 9_000 });
    const secondId = state.questions[1].id;
    state = sessionReducer(state, {
      type: "submit",
      input: "second",
      validation: CORRECT,
      nowMs: 12_000,
    });

    expect(state.answers[firstId].responseTimeMs).toBe(3_000);
    expect(state.answers[secondId].responseTimeMs).toBe(4_000);
    expect(state.phase).toBe("completed");
    expect(state.completedAtMs).toBe(12_000);
  });

  it("records an allowed practice skip with an empty input and advances", () => {
    const active = sessionReducer(createSession(practiceConfig(), 7), {
      type: "start",
      nowMs: 1_000,
    });
    const questionId = active.questions[0].id;
    const skipped = sessionReducer(active, { type: "skip", nowMs: 4_000 });

    expect(skipped.currentIndex).toBe(1);
    expect(skipped.answers[questionId]).toEqual({
      input: "",
      outcome: "skipped",
      answeredAtMs: 4_000,
      responseTimeMs: 3_000,
    });
  });

  it("preserves Mixed Quant answers while navigating in either direction", () => {
    let state = sessionReducer(createSession(getPreset("mixed-quant"), 8), {
      type: "start",
      nowMs: 1_000,
    });
    state = sessionReducer(state, { type: "navigate", index: 5, nowMs: 2_000 });
    const answeredId = state.questions[5].id;
    state = sessionReducer(state, {
      type: "submit",
      input: "choice-b",
      validation: CORRECT,
      nowMs: 6_000,
    });
    state = sessionReducer(state, { type: "navigate", index: 0, nowMs: 7_000 });
    state = sessionReducer(state, { type: "navigate", index: 5, nowMs: 8_000 });

    expect(state.currentIndex).toBe(5);
    expect(state.answers[answeredId]).toMatchObject({
      input: "choice-b",
      outcome: "correct",
      responseTimeMs: 5_000,
    });
  });

  it("uses the latest recorded answer as the deterministic Mixed Quant timer origin", () => {
    let state = sessionReducer(createSession(getPreset("mixed-quant"), 9), {
      type: "start",
      nowMs: 1_000,
    });
    state = sessionReducer(state, { type: "navigate", index: 7, nowMs: 2_000 });
    const firstId = state.questions[7].id;
    state = sessionReducer(state, {
      type: "submit",
      input: "first",
      validation: CORRECT,
      nowMs: 6_000,
    });
    state = sessionReducer(state, { type: "navigate", index: 2, nowMs: 7_000 });
    const secondId = state.questions[2].id;
    state = sessionReducer(state, {
      type: "submit",
      input: "second",
      validation: INCORRECT,
      nowMs: 9_000,
    });

    expect(state.answers[firstId].responseTimeMs).toBe(5_000);
    expect(state.answers[secondId].responseTimeMs).toBe(3_000);
  });

  it("finishes only an active Mixed Quant early and preserves unanswered questions", () => {
    let mixed = sessionReducer(createSession(getPreset("mixed-quant"), 91), {
      type: "start",
      nowMs: 1_000,
    });
    mixed = sessionReducer(mixed, {
      type: "submit",
      input: "first",
      validation: CORRECT,
      nowMs: 6_000,
    });
    const finished = sessionReducer(mixed, { type: "finish", nowMs: 7_000 });

    expect(finished).toMatchObject({
      phase: "completed",
      completedAtMs: 7_000,
      answers: mixed.answers,
      currentIndex: mixed.currentIndex,
    });
    expect(buildSessionResult(finished)).toMatchObject({
      correct: 1,
      incorrect: 0,
      skipped: 0,
      unanswered: 29,
    });

    const speed = sessionReducer(
      createSession(getPreset("speed-arithmetic"), 92),
      { type: "start", nowMs: 1_000 },
    );
    const practice = sessionReducer(
      createSession(getPreset("mental-2m"), 93),
      { type: "start", nowMs: 1_000 },
    );
    expect(sessionReducer(speed, { type: "finish", nowMs: 7_000 })).toBe(
      speed,
    );
    expect(sessionReducer(practice, { type: "finish", nowMs: 7_000 })).toBe(
      practice,
    );
  });

  it("ignores invalid or disallowed navigation", () => {
    const mixed = sessionReducer(createSession(getPreset("mixed-quant"), 10), {
      type: "start",
      nowMs: 1_000,
    });
    const sequential = sessionReducer(createSession(practiceConfig(), 11), {
      type: "start",
      nowMs: 1_000,
    });

    expect(
      sessionReducer(mixed, { type: "navigate", index: -1, nowMs: 2_000 }),
    ).toBe(mixed);
    expect(
      sessionReducer(mixed, { type: "navigate", index: 30, nowMs: 2_000 }),
    ).toBe(mixed);
    expect(
      sessionReducer(sequential, { type: "navigate", index: 1, nowMs: 2_000 }),
    ).toBe(sequential);
  });

  it.each(
    DEADLINE_ACTION_SCENARIOS.flatMap((scenario) =>
      DEADLINE_BOUNDARIES.map((boundary) => ({ ...scenario, ...boundary })),
    ),
  )(
    "$label is deadline-safe $timing",
    ({ presetId, action, eligible, offsetMs }) => {
      const active = sessionReducer(createSession(getPreset(presetId), 12), {
        type: "start",
        nowMs: 1_000,
      });
      const deadlineMs = active.deadlineMs;

      expect(deadlineMs).not.toBeNull();
      const next = sessionReducer(active, action(deadlineMs! + offsetMs));

      if (offsetMs === -1) {
        expect(next.phase).toBe(eligible.phase);
        expect(next.currentIndex).toBe(eligible.currentIndex);
        expect(Object.keys(next.answers)).toHaveLength(eligible.answerCount);
        if (eligible.sameState === true) {
          expect(next).toBe(active);
        }
        return;
      }

      expect(next).toMatchObject({
        phase: "completed",
        currentIndex: active.currentIndex,
        answers: active.answers,
        pausedAtMs: null,
        completedAtMs: deadlineMs,
      });
      expect(next.questions).toBe(active.questions);
    },
  );

  it("does not auto-expire legitimately paused practice", () => {
    const active = sessionReducer(
      createSession(getPreset("mental-2m"), 13),
      { type: "start", nowMs: 1_000 },
    );
    const paused = sessionReducer(active, { type: "pause", nowMs: 11_000 });

    expect(sessionReducer(paused, { type: "expire", nowMs: 200_000 })).toBe(
      paused,
    );
    const resumed = sessionReducer(paused, {
      type: "resume",
      nowMs: 200_000,
    });
    expect(resumed).toMatchObject({
      phase: "active",
      deadlineMs: 310_000,
      accumulatedPauseMs: 189_000,
      completedAtMs: null,
    });
  });

  it("expires only at the deadline and completes exactly once", () => {
    const active = sessionReducer(
      createSession(getPreset("speed-arithmetic"), 12),
      { type: "start", nowMs: 1_000 },
    );

    expect(sessionReducer(active, { type: "expire", nowMs: 480_999 })).toBe(
      active,
    );
    const expired = sessionReducer(active, { type: "expire", nowMs: 500_000 });
    expect(expired.phase).toBe("completed");
    expect(expired.completedAtMs).toBe(481_000);

    const completedActions: SessionAction[] = [
      { type: "start", nowMs: 600_000 },
      {
        type: "submit",
        input: "1",
        validation: CORRECT,
        nowMs: 600_000,
      },
      { type: "skip", nowMs: 600_000 },
      { type: "navigate", index: 1, nowMs: 600_000 },
      { type: "pause", nowMs: 600_000 },
      { type: "resume", nowMs: 600_000 },
      { type: "finish", nowMs: 600_000 },
      { type: "expire", nowMs: 600_000 },
    ];

    for (const action of completedActions) {
      expect(sessionReducer(expired, action)).toBe(expired);
    }
  });
});
