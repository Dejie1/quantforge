import { validateAnswer } from "../domain/answers";
import type { Question } from "../domain/questions/types";
import { getPreset } from "../domain/session/presets";
import { createSession, sessionReducer } from "../domain/session/session";
import type {
  SessionAnswer,
  SessionState,
} from "../domain/session/types";
import {
  createDefaultProgress,
  parseProgress,
  type ProgressDataV1,
} from "./progress-schema";

function activeUntimedSession(): SessionState {
  return sessionReducer(createSession(getPreset("probability-10"), 91), {
    type: "start",
    nowMs: 1_000,
  });
}

function activeTimedSession(seed = 92): SessionState {
  return sessionReducer(createSession(getPreset("mental-2m"), seed), {
    type: "start",
    nowMs: 1_000,
  });
}

function correctInputFor(question: Question): string {
  switch (question.answer.kind) {
    case "number":
    case "estimate":
      return String(question.answer.value);

    case "fraction":
      return `${question.answer.numerator}/${question.answer.denominator}`;

    case "choice":
      return question.answer.value;
  }
}

function incorrectInputFor(question: Question): string {
  switch (question.answer.kind) {
    case "number":
      return String(question.answer.value + 1);

    case "fraction":
      return `${
        question.answer.numerator + question.answer.denominator
      }/${question.answer.denominator}`;

    case "estimate": {
      const offset =
        Math.max(1, Math.abs(question.answer.value)) *
        (question.answer.toleranceRatio + 1);
      return String(question.answer.value + offset);
    }

    case "choice":
      return `${question.answer.value}-incorrect`;
  }
}

function submitValidatedAnswer(
  state: SessionState,
  nowMs: number,
  correct: boolean,
  inputOverride?: string,
): SessionState {
  const question = state.questions[state.currentIndex];
  const input =
    inputOverride ??
    (correct ? correctInputFor(question) : incorrectInputFor(question));
  const validation = validateAnswer(input, question.answer);

  if (validation.status !== "valid" || validation.correct !== correct) {
    throw new Error("Failed to create a validated answer fixture");
  }

  return sessionReducer(state, {
    type: "submit",
    input,
    validation,
    nowMs,
  });
}

function completeSequentialSession(
  presetId: "mental-2m" | "probability-10",
  seed: number,
): SessionState {
  let state = sessionReducer(createSession(getPreset(presetId), seed), {
    type: "start",
    nowMs: 1_000,
  });

  for (let index = 0; index < state.questions.length; index += 1) {
    state = submitValidatedAnswer(state, 2_000 + index * 1_000, true);
  }

  return state;
}

function reducerProducedNoPausePrefix(): SessionState {
  let state = activeUntimedSession();
  state = submitValidatedAnswer(state, 2_000, true);
  return submitValidatedAnswer(state, 4_000, false);
}

function withAnswer(
  state: SessionState,
  {
    index = 0,
    outcome = "correct",
    answeredAtMs = 2_000,
  }: {
    index?: number;
    outcome?: SessionAnswer["outcome"];
    answeredAtMs?: number;
  } = {},
): SessionState {
  const question = state.questions[index];
  const answers = {
    ...state.answers,
    [question.id]: {
      input:
        outcome === "skipped"
          ? ""
          : outcome === "correct"
            ? correctInputFor(question)
            : incorrectInputFor(question),
      outcome,
      answeredAtMs,
      responseTimeMs:
        state.startedAtMs === null ? 0 : answeredAtMs - state.startedAtMs,
    },
  };
  const answerCount = Object.keys(answers).length;

  return {
    ...state,
    answers,
    currentIndex:
      state.phase === "ready" || state.config.allowNavigation
        ? state.currentIndex
        : Math.min(answerCount, state.questions.length - 1),
  };
}

function withEveryQuestionAnswered(state: SessionState): SessionState {
  const startedAtMs = state.startedAtMs ?? 1_000;
  const answers = Object.fromEntries(
    state.questions.map((question, index) => [
      question.id,
      {
        input: correctInputFor(question),
        outcome: "correct" as const,
        answeredAtMs: startedAtMs + index + 1,
        responseTimeMs: 1,
      },
    ]),
  );

  return {
    ...state,
    answers,
    currentIndex: state.config.allowNavigation
      ? state.currentIndex
      : state.questions.length - 1,
  };
}

function progressWithSession(activeSession: SessionState): ProgressDataV1 {
  return { ...createDefaultProgress(), activeSession };
}

function expectSessionRejected(state: SessionState): void {
  expect(parseProgress(progressWithSession(state))).toEqual(
    createDefaultProgress(),
  );
}

type AnswerKind = SessionState["questions"][number]["answer"]["kind"];

function sessionThroughAnswerKind(kind: AnswerKind): SessionState {
  const presetId =
    kind === "number" || kind === "estimate"
      ? "sequences-estimation-10"
      : "probability-10";
  const config = getPreset(presetId);
  config.startingDifficulty = kind === "choice" ? 9 : 3;

  let state = createSession(config, 1);
  const targetIndex = state.questions.findIndex(
    (question) => question.answer.kind === kind,
  );
  if (targetIndex < 0) {
    throw new Error(`Missing deterministic ${kind} answer fixture`);
  }

  state = sessionReducer(state, { type: "start", nowMs: 1_000 });
  for (let index = 0; index <= targetIndex; index += 1) {
    state = submitValidatedAnswer(
      state,
      2_000 + index * 1_000,
      index % 2 === 0,
    );
  }

  return state;
}

function replaceQuestion(
  state: SessionState,
  index: number,
  replacement: SessionState["questions"][number],
): SessionState {
  return {
    ...state,
    questions: state.questions.map((question, questionIndex) =>
      questionIndex === index ? replacement : question,
    ),
  };
}

function populatedProgress(): ProgressDataV1 {
  const progress = createDefaultProgress();

  progress.preferences.theme = "light";
  progress.preferences.reducedMotion = true;
  progress.preferences.dailyGoal = 12;
  progress.difficulty.arithmetic = 7;
  progress.categoryStats.arithmetic = {
    answered: 8,
    correct: 6,
    totalResponseTimeMs: 24_000,
    bestStreak: 4,
  };
  progress.dailyActivity["2026-07-12"] = {
    questions: 8,
    correct: 6,
    milliseconds: 24_000,
  };
  progress.recentSessions.push({
    id: "session-1",
    presetId: "probability-10",
    completedAtMs: 30_000,
    correct: 6,
    total: 8,
    accuracy: 0.75,
    medianResponseTimeMs: 3_000,
  });
  progress.activeSession = activeUntimedSession();

  return progress;
}

function corrupt(
  progress: ProgressDataV1,
  mutation: (value: Record<string, any>) => void,
): unknown {
  const value = structuredClone(progress) as unknown as Record<string, any>;
  mutation(value);
  return value;
}

describe("createDefaultProgress", () => {
  it("creates the complete v1 defaults", () => {
    expect(createDefaultProgress()).toEqual({
      version: 1,
      preferences: {
        theme: "dark",
        reducedMotion: false,
        dailyGoal: 20,
      },
      difficulty: {
        arithmetic: 3,
        probability: 3,
        sequences: 3,
        estimation: 3,
      },
      categoryStats: {
        arithmetic: {
          answered: 0,
          correct: 0,
          totalResponseTimeMs: 0,
          bestStreak: 0,
        },
        probability: {
          answered: 0,
          correct: 0,
          totalResponseTimeMs: 0,
          bestStreak: 0,
        },
        sequences: {
          answered: 0,
          correct: 0,
          totalResponseTimeMs: 0,
          bestStreak: 0,
        },
        estimation: {
          answered: 0,
          correct: 0,
          totalResponseTimeMs: 0,
          bestStreak: 0,
        },
      },
      dailyActivity: {},
      recentSessions: [],
      activeSession: null,
    });
  });

  it("never shares mutable nested defaults", () => {
    const first = createDefaultProgress();
    const second = createDefaultProgress();

    first.preferences.theme = "light";
    first.categoryStats.arithmetic.answered = 99;
    first.dailyActivity.today = { questions: 1, correct: 1, milliseconds: 10 };
    first.recentSessions.push({
      id: "one",
      presetId: "one",
      completedAtMs: 1,
      correct: 1,
      total: 1,
      accuracy: 1,
      medianResponseTimeMs: 1,
    });

    expect(second).toEqual(createDefaultProgress());
    expect(second.preferences).not.toBe(first.preferences);
    expect(second.categoryStats.arithmetic).not.toBe(
      first.categoryStats.arithmetic,
    );
  });
});

describe("parseProgress", () => {
  it("contains hostile property access and returns defaults", () => {
    const hostile = Object.defineProperty({}, "version", {
      get(): never {
        throw new Error("hostile persisted value");
      },
    });

    expect(parseProgress(hostile)).toEqual(createDefaultProgress());
  });

  it.each(["sequences", "estimation"] as const)(
    "reconstructs a saved %s-focused sequences and estimation session",
    (category) => {
      const config = getPreset("sequences-estimation-10");
      config.categories = [category];
      const session = createSession(config, 90);

      expect(parseProgress(progressWithSession(session)).activeSession).toEqual(
        session,
      );
    },
  );

  it.each(["number", "fraction", "estimate", "choice"] as const)(
    "reconstructs a deterministic %s answer snapshot and its answer record",
    (kind) => {
      const activeSession = sessionThroughAnswerKind(kind);
      const original = progressWithSession(activeSession);

      const parsed = parseProgress(original);

      expect(parsed).toEqual(original);
      expect(parsed.activeSession!.answers).not.toBe(activeSession.answers);
      expect(parsed.activeSession!.questions).not.toBe(
        activeSession.questions,
      );

      const questionIndex = activeSession.questions.findIndex(
        (question) => question.answer.kind === kind,
      );
      expect(parsed.activeSession!.questions[questionIndex].answer).not.toBe(
        activeSession.questions[questionIndex].answer,
      );
      if (kind === "choice") {
        expect(
          parsed.activeSession!.questions[questionIndex].choices,
        ).not.toBe(activeSession.questions[questionIndex].choices);
      }
    },
  );

  it.each([
    [
      "an unknown preset ID",
      (value: Record<string, any>) =>
        (value.activeSession.config.presetId = "unknown-preset"),
    ],
    [
      "a changed mode",
      (value: Record<string, any>) =>
        (value.activeSession.config.mode = "mental-math"),
    ],
    [
      "a changed question count",
      (value: Record<string, any>) => {
        value.activeSession.config.questionCount += 1;
        const extra = structuredClone(value.activeSession.questions.at(-1));
        extra.id = `${extra.id}-extra`;
        value.activeSession.questions.push(extra);
      },
    ],
    [
      "a changed duration",
      (value: Record<string, any>) => {
        value.activeSession.config.durationMs = 60_000;
        value.activeSession.deadlineMs =
          value.activeSession.startedAtMs + 60_000;
      },
    ],
    [
      "changed categories",
      (value: Record<string, any>) =>
        (value.activeSession.config.categories = ["estimation"]),
    ],
    [
      "changed feedback",
      (value: Record<string, any>) =>
        (value.activeSession.config.feedback = "deferred"),
    ],
    [
      "changed pause permission",
      (value: Record<string, any>) =>
        (value.activeSession.config.allowPause = false),
    ],
    [
      "changed skip permission",
      (value: Record<string, any>) =>
        (value.activeSession.config.allowSkip = false),
    ],
    [
      "changed navigation permission",
      (value: Record<string, any>) =>
        (value.activeSession.config.allowNavigation = true),
    ],
  ])("rejects canonical-preset drift from %s", (_label, mutation) => {
    expect(parseProgress(corrupt(populatedProgress(), mutation))).toEqual(
      createDefaultProgress(),
    );
  });

  it("requires mock difficulty and adaptation to match the canonical preset", () => {
    const active = sessionReducer(
      createSession(getPreset("mixed-quant"), 94),
      { type: "start", nowMs: 1_000 },
    );

    expectSessionRejected({
      ...active,
      config: { ...active.config, startingDifficulty: 6 },
    });
    expectSessionRejected({
      ...active,
      config: { ...active.config, adaptive: true },
    });
  });

  it("preserves valid user-selected practice difficulty and adaptive locks", () => {
    const config = getPreset("probability-10");
    config.startingDifficulty = 8;
    config.adaptive = false;
    const active = sessionReducer(createSession(config, 95), {
      type: "start",
      nowMs: 1_000,
    });

    expect(parseProgress(progressWithSession(active)).activeSession).toEqual(
      active,
    );
  });

  it("rejects a practice difficulty override without its deterministic questions", () => {
    const active = activeUntimedSession();

    expectSessionRejected({
      ...active,
      config: { ...active.config, startingDifficulty: 8 },
    });
  });

  it("requires the deterministic session ID", () => {
    const active = activeUntimedSession();

    expectSessionRejected({ ...active, id: `${active.id}-tampered` });
  });

  it.each([
    [
      "question ID",
      (state: SessionState) =>
        replaceQuestion(state, 0, {
          ...state.questions[0],
          id: `${state.questions[0].id}-tampered`,
        }),
    ],
    [
      "category",
      (state: SessionState) =>
        replaceQuestion(state, 0, {
          ...state.questions[0],
          category:
            state.questions[0].category === "arithmetic"
              ? "probability"
              : "arithmetic",
        }),
    ],
    [
      "topic",
      (state: SessionState) =>
        replaceQuestion(state, 0, {
          ...state.questions[0],
          topic: `${state.questions[0].topic} tampered`,
        }),
    ],
    [
      "difficulty",
      (state: SessionState) =>
        replaceQuestion(state, 0, {
          ...state.questions[0],
          difficulty:
            state.questions[0].difficulty === 10
              ? 9
              : state.questions[0].difficulty + 1,
        }),
    ],
    [
      "prompt",
      (state: SessionState) =>
        replaceQuestion(state, 0, {
          ...state.questions[0],
          prompt: `${state.questions[0].prompt} tampered`,
        }),
    ],
    [
      "answer",
      (state: SessionState) =>
        replaceQuestion(state, 0, {
          ...state.questions[0],
          answer: {
            kind: "number",
            value: 987_654_321,
            display: "987654321",
          },
        }),
    ],
    [
      "explanation",
      (state: SessionState) =>
        replaceQuestion(state, 0, {
          ...state.questions[0],
          explanation: `${state.questions[0].explanation} tampered`,
        }),
    ],
    [
      "target time",
      (state: SessionState) =>
        replaceQuestion(state, 0, {
          ...state.questions[0],
          targetTimeMs: state.questions[0].targetTimeMs + 1,
        }),
    ],
    [
      "choice list",
      (state: SessionState) =>
        replaceQuestion(state, 0, {
          ...state.questions[0],
          choices: [
            ...(state.questions[0].choices ?? []),
            { id: "tampered-choice", label: "Tampered choice" },
          ],
        }),
    ],
    [
      "question order",
      (state: SessionState) => ({
        ...state,
        questions: [
          state.questions[1],
          state.questions[0],
          ...state.questions.slice(2),
        ],
      }),
    ],
  ])("rejects deterministic question drift in the %s", (_label, mutate) => {
    expectSessionRejected(mutate(activeTimedSession(109)));
  });

  it("restores the canonical Speed Arithmetic difficulty ramp", () => {
    const ready = createSession(getPreset("speed-arithmetic"), 110);

    expect(ready.questions[0].difficulty).toBe(3);
    expect(ready.questions.at(-1)!.difficulty).toBe(9);
    expect(parseProgress(progressWithSession(ready)).activeSession).toEqual(
      ready,
    );

    const lastIndex = ready.questions.length - 1;
    expectSessionRejected(
      replaceQuestion(ready, lastIndex, {
        ...ready.questions[lastIndex],
        difficulty: 8,
      }),
    );
  });

  it("rejects ready sessions with answers or accumulated pause time", () => {
    const ready = createSession(getPreset("probability-10"), 96);

    expectSessionRejected(withAnswer(ready, { answeredAtMs: 0 }));
    expectSessionRejected({ ...ready, accumulatedPauseMs: 1 });
  });

  it("rejects non-navigation answer holes and current-index drift", () => {
    const active = activeUntimedSession();
    expectSessionRejected({ ...active, currentIndex: 5 });

    const missingPrefix = withAnswer(active, { index: 1 });
    expectSessionRejected(missingPrefix);

    const oneAnswer = submitValidatedAnswer(active, 2_000, true);
    expect(oneAnswer.currentIndex).toBe(1);
    expectSessionRejected({ ...oneAnswer, currentIndex: 0 });
    expectSessionRejected({ ...oneAnswer, currentIndex: 2 });
  });

  it("restores reducer-produced non-navigation prefixes in every phase", () => {
    let active = activeUntimedSession();
    active = submitValidatedAnswer(active, 2_000, true);
    active = submitValidatedAnswer(active, 3_000, false);
    expect(parseProgress(progressWithSession(active)).activeSession).toEqual(
      active,
    );

    const paused = sessionReducer(active, { type: "pause", nowMs: 4_000 });
    expect(parseProgress(progressWithSession(paused)).activeSession).toEqual(
      paused,
    );

    let timed = activeTimedSession(111);
    timed = submitValidatedAnswer(timed, 2_000, true);
    timed = submitValidatedAnswer(timed, 3_000, true);
    const deadlineCompleted = sessionReducer(timed, {
      type: "expire",
      nowMs: timed.deadlineMs!,
    });
    expect(
      parseProgress(progressWithSession(deadlineCompleted)).activeSession,
    ).toEqual(deadlineCompleted);

    const allAnswered = completeSequentialSession("probability-10", 112);
    expect(
      parseProgress(progressWithSession(allAnswered)).activeSession,
    ).toEqual(allAnswered);
  });

  it("keeps arbitrary answered subsets and indices for navigable sessions", () => {
    let active = sessionReducer(
      createSession(getPreset("mixed-quant"), 113),
      { type: "start", nowMs: 1_000 },
    );
    active = sessionReducer(active, {
      type: "navigate",
      index: 5,
      nowMs: 1_500,
    });
    active = submitValidatedAnswer(active, 2_000, true);
    active = sessionReducer(active, {
      type: "navigate",
      index: 12,
      nowMs: 2_500,
    });
    active = submitValidatedAnswer(active, 3_000, false);
    active = sessionReducer(active, {
      type: "navigate",
      index: 1,
      nowMs: 3_500,
    });

    expect(Object.keys(active.answers)).toEqual([
      active.questions[5].id,
      active.questions[12].id,
    ]);
    expect(active.currentIndex).toBe(1);
    expect(parseProgress(progressWithSession(active)).activeSession).toEqual(
      active,
    );
  });

  it("requires paused sessions to be pausable and paused before the deadline", () => {
    const mock = sessionReducer(
      createSession(getPreset("mixed-quant"), 97),
      { type: "start", nowMs: 1_000 },
    );
    expectSessionRejected({ ...mock, phase: "paused", pausedAtMs: 2_000 });

    const timed = activeTimedSession(98);
    expectSessionRejected({
      ...timed,
      phase: "paused",
      pausedAtMs: timed.deadlineMs,
    });
  });

  it("requires an exact pause-adjusted timed deadline", () => {
    const active = activeTimedSession(99);

    expectSessionRejected({ ...active, deadlineMs: active.deadlineMs! + 1 });

    const paused = sessionReducer(active, { type: "pause", nowMs: 11_000 });
    const resumed = sessionReducer(paused, { type: "resume", nowMs: 21_000 });
    expect(parseProgress(progressWithSession(resumed)).activeSession).toEqual(
      resumed,
    );
  });

  it("rejects timed completion after the deadline", () => {
    const active = activeTimedSession(100);
    const expired = sessionReducer(active, {
      type: "expire",
      nowMs: active.deadlineMs!,
    });

    expectSessionRejected({
      ...expired,
      completedAtMs: expired.deadlineMs! + 1,
    });
  });

  it("rejects active or paused sessions with every question answered", () => {
    const active = activeTimedSession(101);
    expectSessionRejected(withEveryQuestionAnswered(active));

    const paused = sessionReducer(active, { type: "pause", nowMs: 11_000 });
    expectSessionRejected(withEveryQuestionAnswered(paused));
  });

  it("requires untimed completion to answer every question", () => {
    const active = activeUntimedSession();
    expectSessionRejected({
      ...active,
      phase: "completed",
      completedAtMs: 2_000,
    });

    const completed = completeSequentialSession("probability-10", 102);
    expect(parseProgress(progressWithSession(completed)).activeSession).toEqual(
      completed,
    );
  });

  it("allows incomplete timed completion only at the deadline", () => {
    const active = activeTimedSession(103);
    expectSessionRejected({
      ...active,
      phase: "completed",
      completedAtMs: active.deadlineMs! - 1,
    });

    const expired = sessionReducer(active, {
      type: "expire",
      nowMs: active.deadlineMs!,
    });
    expect(parseProgress(progressWithSession(expired)).activeSession).toEqual(
      expired,
    );
  });

  it("restores reducer-produced early Mixed Quant completion only", () => {
    const mixed = sessionReducer(
      sessionReducer(createSession(getPreset("mixed-quant"), 10_301), {
        type: "start",
        nowMs: 1_000,
      }),
      { type: "finish", nowMs: 5_000 },
    );

    expect(parseProgress(progressWithSession(mixed)).activeSession).toEqual(
      mixed,
    );

    const speed = sessionReducer(
      createSession(getPreset("speed-arithmetic"), 10_302),
      { type: "start", nowMs: 1_000 },
    );
    expectSessionRejected({
      ...speed,
      phase: "completed",
      completedAtMs: 5_000,
    });
  });

  it("requires answered completion to occur with the final answer", () => {
    const untimed = completeSequentialSession("probability-10", 104);
    expectSessionRejected({
      ...untimed,
      completedAtMs: untimed.completedAtMs! + 1,
    });

    const timed = completeSequentialSession("mental-2m", 105);
    expect(parseProgress(progressWithSession(timed)).activeSession).toEqual(
      timed,
    );
  });

  it("keeps answer timestamps inside the reducer-reachable lifetime", () => {
    const untimed = activeUntimedSession();
    expectSessionRejected(withAnswer(untimed, { answeredAtMs: 999 }));

    const timed = activeTimedSession(106);
    expectSessionRejected(
      withAnswer(timed, { answeredAtMs: timed.deadlineMs! }),
    );

    const paused = sessionReducer(timed, { type: "pause", nowMs: 11_000 });
    expectSessionRejected(
      withAnswer(paused, { answeredAtMs: paused.pausedAtMs! + 1 }),
    );

    const completed = completeSequentialSession("probability-10", 107);
    const firstQuestion = completed.questions[0];
    expectSessionRejected({
      ...completed,
      answers: {
        ...completed.answers,
        [firstQuestion.id]: {
          ...completed.answers[firstQuestion.id],
          answeredAtMs: completed.completedAtMs! + 1,
        },
      },
    });
  });

  it("restores reducer-produced outcomes and exact no-pause response segments", () => {
    const active = reducerProducedNoPausePrefix();

    expect(
      Object.values(active.answers).map(({ outcome, responseTimeMs }) => ({
        outcome,
        responseTimeMs,
      })),
    ).toEqual([
      { outcome: "correct", responseTimeMs: 1_000 },
      { outcome: "incorrect", responseTimeMs: 2_000 },
    ]);
    expect(parseProgress(progressWithSession(active)).activeSession).toEqual(
      active,
    );
  });

  it("rejects a shortened no-pause response segment", () => {
    const active = reducerProducedNoPausePrefix();
    const secondQuestion = active.questions[1];

    expectSessionRejected({
      ...active,
      answers: {
        ...active.answers,
        [secondQuestion.id]: {
          ...active.answers[secondQuestion.id],
          responseTimeMs: 1_999,
        },
      },
    });
  });

  it("rejects a lengthened no-pause segment hidden by redistribution", () => {
    const active = reducerProducedNoPausePrefix();
    const firstQuestion = active.questions[0];
    const secondQuestion = active.questions[1];

    expectSessionRejected({
      ...active,
      answers: {
        ...active.answers,
        [firstQuestion.id]: {
          ...active.answers[firstQuestion.id],
          responseTimeMs: 999,
        },
        [secondQuestion.id]: {
          ...active.answers[secondQuestion.id],
          responseTimeMs: 2_001,
        },
      },
    });
  });

  it("rejects response times beyond the answer or recorded session lifetime", () => {
    let oneAnswer = activeUntimedSession();
    oneAnswer = submitValidatedAnswer(oneAnswer, 2_000, true);
    const firstQuestion = oneAnswer.questions[0];
    expectSessionRejected({
      ...oneAnswer,
      answers: {
        ...oneAnswer.answers,
        [firstQuestion.id]: {
          ...oneAnswer.answers[firstQuestion.id],
          responseTimeMs: 1_001,
        },
      },
    });

    let twoAnswers = activeUntimedSession();
    twoAnswers = submitValidatedAnswer(twoAnswers, 2_000, true);
    twoAnswers = submitValidatedAnswer(twoAnswers, 3_000, true);
    const secondQuestion = twoAnswers.questions[1];
    expectSessionRejected({
      ...twoAnswers,
      answers: {
        ...twoAnswers.answers,
        [secondQuestion.id]: {
          ...twoAnswers.answers[secondQuestion.id],
          responseTimeMs: 2_000,
        },
      },
    });
  });

  it("restores reducer-produced response times across pause and resume", () => {
    let active = activeUntimedSession();
    active = submitValidatedAnswer(active, 2_000, true);
    active = sessionReducer(active, { type: "pause", nowMs: 3_000 });
    active = sessionReducer(active, { type: "resume", nowMs: 8_000 });
    active = submitValidatedAnswer(active, 10_000, true);

    expect(
      Object.values(active.answers).reduce(
        (total, answer) => total + answer.responseTimeMs,
        0,
      ),
    ).toBe(4_000);
    expect(parseProgress(progressWithSession(active)).activeSession).toEqual(
      active,
    );
  });

  it("rejects a wrong attempted answer stored as correct", () => {
    const active = submitValidatedAnswer(activeUntimedSession(), 2_000, false);
    const question = active.questions[0];

    expectSessionRejected({
      ...active,
      answers: {
        ...active.answers,
        [question.id]: {
          ...active.answers[question.id],
          outcome: "correct",
        },
      },
    });
  });

  it("rejects a correct attempted answer stored as incorrect", () => {
    const active = submitValidatedAnswer(activeUntimedSession(), 2_000, true);
    const question = active.questions[0];

    expectSessionRejected({
      ...active,
      answers: {
        ...active.answers,
        [question.id]: {
          ...active.answers[question.id],
          outcome: "incorrect",
        },
      },
    });
  });

  it("rejects an attempted input that answer validation considers invalid", () => {
    const active = sessionThroughAnswerKind("number");
    const question = active.questions.find(
      ({ answer }) => answer.kind === "number",
    )!;

    expectSessionRejected({
      ...active,
      answers: {
        ...active.answers,
        [question.id]: {
          ...active.answers[question.id],
          input: "not-a-number",
        },
      },
    });
  });

  it("requires answer input to agree with skipped and attempted outcomes", () => {
    let skipped = activeUntimedSession();
    skipped = sessionReducer(skipped, { type: "skip", nowMs: 2_000 });
    const skippedQuestion = skipped.questions[0];
    expectSessionRejected({
      ...skipped,
      answers: {
        ...skipped.answers,
        [skippedQuestion.id]: {
          ...skipped.answers[skippedQuestion.id],
          input: "not empty",
        },
      },
    });

    let correct = activeUntimedSession();
    correct = submitValidatedAnswer(correct, 2_000, true);
    const correctQuestion = correct.questions[0];
    expectSessionRejected({
      ...correct,
      answers: {
        ...correct.answers,
        [correctQuestion.id]: {
          ...correct.answers[correctQuestion.id],
          input: "",
        },
      },
    });

    let incorrect = activeUntimedSession();
    incorrect = submitValidatedAnswer(incorrect, 2_000, false);
    const incorrectQuestion = incorrect.questions[0];
    expectSessionRejected({
      ...incorrect,
      answers: {
        ...incorrect.answers,
        [incorrectQuestion.id]: {
          ...incorrect.answers[incorrectQuestion.id],
          input: "   ",
        },
      },
    });
  });

  it("restores reducer-produced skipped and non-blank attempted inputs", () => {
    let active = activeUntimedSession();
    const paddedInput = `  ${correctInputFor(active.questions[0])}  `;
    active = submitValidatedAnswer(active, 2_000, true, paddedInput);
    active = sessionReducer(active, { type: "skip", nowMs: 3_000 });

    expect(parseProgress(progressWithSession(active)).activeSession).toEqual(
      active,
    );
  });

  it("rejects skipped answers when the preset forbids skipping", () => {
    const mock = sessionReducer(
      createSession(getPreset("speed-arithmetic"), 108),
      { type: "start", nowMs: 1_000 },
    );

    expectSessionRejected(
      withAnswer(mock, { outcome: "skipped", answeredAtMs: 2_000 }),
    );
  });

  it("normalizes parsed session history newest-first and caps it at 50", () => {
    const progress = createDefaultProgress();
    progress.recentSessions = Array.from({ length: 55 }, (_, index) => {
      const value = (index * 17) % 55;
      return {
        id: `session-${value}`,
        presetId: "probability-10",
        completedAtMs: value * 1_000,
        correct: 8,
        total: 10,
        accuracy: 0.8,
        medianResponseTimeMs: 2_000,
      };
    });

    expect(
      parseProgress(progress).recentSessions.map(({ id }) => id),
    ).toEqual(
      Array.from({ length: 50 }, (_, index) => `session-${54 - index}`),
    );
  });

  it("reconstructs valid data and strips unknown properties at every level", () => {
    const original = populatedProgress();
    const value = {
      ...original,
      futureRoot: true,
      preferences: { ...original.preferences, futurePreference: true },
      categoryStats: {
        ...original.categoryStats,
        arithmetic: {
          ...original.categoryStats.arithmetic,
          futureStat: true,
        },
      },
      dailyActivity: {
        ...original.dailyActivity,
        "2026-07-12": {
          ...original.dailyActivity["2026-07-12"],
          futureActivity: true,
        },
      },
      recentSessions: [
        { ...original.recentSessions[0], futureSummary: true },
      ],
      activeSession: {
        ...original.activeSession!,
        futureSession: true,
        config: {
          ...original.activeSession!.config,
          futureConfig: true,
        },
        questions: original.activeSession!.questions.map((question, index) => ({
          ...question,
          ...(index === 0 ? { futureQuestion: true } : {}),
          answer: { ...question.answer, futureAnswer: true },
        })),
      },
    };

    const parsed = parseProgress(value);

    expect(parsed).toEqual(original);
    expect(parsed).not.toBe(original);
    expect(parsed.preferences).not.toBe(original.preferences);
    expect(parsed.activeSession).not.toBe(original.activeSession);
    expect(parsed.activeSession!.questions[0]).not.toBe(
      original.activeSession!.questions[0],
    );
    expect(parsed).not.toHaveProperty("futureRoot");
    expect(parsed.preferences).not.toHaveProperty("futurePreference");
    expect(parsed.categoryStats.arithmetic).not.toHaveProperty("futureStat");
    expect(parsed.dailyActivity["2026-07-12"]).not.toHaveProperty(
      "futureActivity",
    );
    expect(parsed.recentSessions[0]).not.toHaveProperty("futureSummary");
    expect(parsed.activeSession).not.toHaveProperty("futureSession");
    expect(parsed.activeSession!.config).not.toHaveProperty("futureConfig");
    expect(parsed.activeSession!.questions[0]).not.toHaveProperty(
      "futureQuestion",
    );
    expect(parsed.activeSession!.questions[0].answer).not.toHaveProperty(
      "futureAnswer",
    );
  });

  it.each([
    ["a wrong version", (value: Record<string, any>) => (value.version = 2)],
    [
      "a zero daily goal",
      (value: Record<string, any>) => (value.preferences.dailyGoal = 0),
    ],
    [
      "a fractional daily goal",
      (value: Record<string, any>) => (value.preferences.dailyGoal = 2.5),
    ],
    [
      "an out-of-range difficulty",
      (value: Record<string, any>) => (value.difficulty.probability = 11),
    ],
    [
      "a non-integer count",
      (value: Record<string, any>) =>
        (value.categoryStats.arithmetic.answered = 1.5),
    ],
    [
      "an infinite time",
      (value: Record<string, any>) =>
        (value.categoryStats.arithmetic.totalResponseTimeMs = Infinity),
    ],
    [
      "negative daily activity",
      (value: Record<string, any>) =>
        (value.dailyActivity["2026-07-12"].milliseconds = -1),
    ],
    [
      "an invalid recent-session accuracy",
      (value: Record<string, any>) =>
        (value.recentSessions[0].accuracy = 1.01),
    ],
    [
      "an invalid recent-session count",
      (value: Record<string, any>) =>
        (value.recentSessions[0].total = -1),
    ],
    [
      "an invalid active-session answer spec",
      (value: Record<string, any>) =>
        (value.activeSession.questions[0].answer = {
          kind: "estimate",
          value: 12,
          toleranceRatio: 1.1,
          display: "12",
        }),
    ],
    [
      "an invalid active-session answer record",
      (value: Record<string, any>) => {
        const questionId = value.activeSession.questions[0].id;
        value.activeSession.answers[questionId] = {
          input: "answer",
          outcome: "unanswered",
          answeredAtMs: 2_000,
          responseTimeMs: 1_000,
        };
      },
    ],
  ])("returns fresh defaults for %s", (_label, mutation) => {
    const first = parseProgress(corrupt(populatedProgress(), mutation));
    const second = parseProgress(corrupt(populatedProgress(), mutation));

    expect(first).toEqual(createDefaultProgress());
    expect(second).toEqual(createDefaultProgress());
    expect(first).not.toBe(second);
    expect(first.preferences).not.toBe(second.preferences);
    expect(first.categoryStats.arithmetic).not.toBe(
      second.categoryStats.arithmetic,
    );
  });

  it("rejects choice answers without a complete matching choice list", () => {
    const invalid = corrupt(populatedProgress(), (value) => {
      value.activeSession.questions[0].answer = {
        kind: "choice",
        value: "a",
        display: "A",
      };
      delete value.activeSession.questions[0].choices;
    });

    expect(parseProgress(invalid)).toEqual(createDefaultProgress());
  });
});
