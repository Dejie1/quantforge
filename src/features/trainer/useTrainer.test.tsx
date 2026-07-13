import { StrictMode, type PropsWithChildren } from "react";
import { act, renderHook } from "@testing-library/react";
import { validateAnswer } from "../../domain/answers";
import type { AnswerSpec, Question } from "../../domain/questions/types";
import { getPreset } from "../../domain/session/presets";
import { createSession, sessionReducer } from "../../domain/session/session";
import type { SessionState } from "../../domain/session/types";
import {
  createDefaultProgress,
  type ProgressDataV1,
  type SessionSummary,
} from "../../lib/progress-schema";
import {
  createProgressStore,
  PROGRESS_STORAGE_KEY,
} from "../../lib/progress-store";
import { TrainerProvider } from "./TrainerContext";
import { useTrainer, type TrainerController } from "./useTrainer";

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();
  setCalls = 0;
  removeCalls = 0;
  failGet = false;
  failSet = false;
  failRemove = false;

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    if (this.failGet) {
      throw new DOMException("Storage unavailable", "SecurityError");
    }

    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.removeCalls += 1;
    if (this.failRemove) {
      throw new DOMException("Storage unavailable", "SecurityError");
    }

    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.setCalls += 1;
    if (this.failSet) {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    }

    this.values.set(key, value);
  }
}

interface MutableClock {
  value: number;
  read(): number;
}

function clock(value: number): MutableClock {
  return {
    value,
    read() {
      return this.value;
    },
  };
}

function renderTrainer({
  storage = new MemoryStorage(),
  now = clock(1_000),
  strict = false,
}: {
  storage?: MemoryStorage;
  now?: MutableClock;
  strict?: boolean;
} = {}) {
  function Wrapper({ children }: PropsWithChildren) {
    const provider = (
      <TrainerProvider storage={storage} now={() => now.read()}>
        {children}
      </TrainerProvider>
    );

    return strict ? <StrictMode>{provider}</StrictMode> : provider;
  }

  return {
    storage,
    now,
    ...renderHook(() => useTrainer(), { wrapper: Wrapper }),
  };
}

function renderTrainerWithDefaultStorage({
  now = clock(1_000),
  strict = false,
}: {
  now?: MutableClock;
  strict?: boolean;
} = {}) {
  function Wrapper({ children }: PropsWithChildren) {
    const provider = (
      <TrainerProvider now={() => now.read()}>{children}</TrainerProvider>
    );

    return strict ? <StrictMode>{provider}</StrictMode> : provider;
  }

  return {
    now,
    ...renderHook(() => useTrainer(), { wrapper: Wrapper }),
  };
}

function correctInput(answer: AnswerSpec): string {
  switch (answer.kind) {
    case "choice":
      return answer.value;
    case "fraction":
      return `${answer.numerator}/${answer.denominator}`;
    case "number":
    case "estimate":
      return String(answer.value);
  }
}

function incorrectInput(question: Question): string {
  const { answer } = question;

  switch (answer.kind) {
    case "choice":
      return "definitely-not-the-correct-choice";
    case "fraction":
      return `${answer.numerator + answer.denominator}/${answer.denominator}`;
    case "number":
      return String(answer.value + 1);
    case "estimate":
      return String(answer.value === 0 ? 1_000_000 : answer.value * 1_000_000);
  }
}

function submit(
  controller: { current: TrainerController },
  input: string,
): void {
  act(() => controller.current.setInput(input));
  act(() => controller.current.submitAnswer());
}

function storedProgress(storage: MemoryStorage): ProgressDataV1 {
  const value = storage.values.get(PROGRESS_STORAGE_KEY);
  if (value === undefined) {
    throw new Error("Expected progress to be stored");
  }

  return JSON.parse(value) as ProgressDataV1;
}

function progressWithSession(activeSession: SessionState): ProgressDataV1 {
  return { ...createDefaultProgress(), activeSession };
}

function summary(id: string, completedAtMs: number): SessionSummary {
  return {
    id,
    presetId: "probability-10",
    completedAtMs,
    correct: 8,
    total: 10,
    accuracy: 0.8,
    medianResponseTimeMs: 1_000,
  };
}

function localDateKey(timestampMs: number): string {
  const date = new Date(timestampMs);
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("TrainerProvider", () => {
  it("restores the exact active seed, question order, answers, and deadline", () => {
    const storage = new MemoryStorage();
    const ready = createSession(getPreset("mental-2m"), 48_151_623);
    let active = sessionReducer(ready, { type: "start", nowMs: 10_000 });
    const first = active.questions[0];
    const input = correctInput(first.answer);
    const validation = validateAnswer(input, first.answer);
    active = sessionReducer(active, {
      type: "submit",
      input,
      validation,
      nowMs: 12_500,
    });
    expect(createProgressStore(storage).save(progressWithSession(active))).toEqual({
      ok: true,
    });

    const now = clock(active.deadlineMs! - 1);
    const { result } = renderTrainer({ storage, now });

    expect(result.current.session).toMatchObject({
      id: active.id,
      seed: active.seed,
      phase: "active",
      currentIndex: 1,
      answers: active.answers,
      deadlineMs: active.deadlineMs,
    });
    expect(result.current.session!.questions).toEqual(active.questions);
    expect(result.current.progress.activeSession).toEqual(active);
    expect(result.current.input).toBe("");
  });

  it("creates and persists a ready session using now as its seed without starting time", () => {
    const storage = new MemoryStorage();
    const now = clock(73_002_100);
    const { result } = renderTrainer({ storage, now });

    act(() => result.current.createSession(getPreset("probability-10")));

    expect(result.current.session).toMatchObject({
      seed: 73_002_100,
      phase: "ready",
      startedAtMs: null,
      deadlineMs: null,
      answers: {},
    });
    expect(result.current.progress.activeSession).toEqual(result.current.session);
    expect(storedProgress(storage).activeSession).toMatchObject({
      seed: 73_002_100,
      phase: "ready",
      startedAtMs: null,
      deadlineMs: null,
    });
  });

  it("retains invalid input and its validator message, then records a valid timestamped submit", () => {
    const now = clock(1_000);
    const { result } = renderTrainer({ now });
    act(() => result.current.createSession(getPreset("mental-2m")));
    now.value = 5_000;
    act(() => result.current.startSession());

    now.value = 7_000;
    submit(result, "not a number");
    expect(result.current.input).toBe("not a number");
    expect(result.current.inputError).toBe("Enter a number");
    expect(result.current.session!.answers).toEqual({});

    const question = result.current.session!.questions[0];
    const input = correctInput(question.answer);
    now.value = 8_250;
    submit(result, input);

    expect(result.current.session!.answers[question.id]).toEqual({
      input,
      outcome: "correct",
      answeredAtMs: 8_250,
      responseTimeMs: 3_250,
    });
    expect(result.current.session!.currentIndex).toBe(1);
    expect(result.current.input).toBe("");
    expect(result.current.inputError).toBeNull();
  });

  it("expires from its single deadline timeout and records the deadline rather than callback lag", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const { result } = renderTrainer({
      now: { value: 0, read: () => Date.now() },
    });
    act(() => result.current.createSession(getPreset("mental-2m")));
    act(() => result.current.startSession());
    const deadlineMs = result.current.session!.deadlineMs!;

    vi.setSystemTime(deadlineMs + 5_000);
    act(() => vi.advanceTimersByTime(120_000));

    expect(result.current.session).toMatchObject({
      phase: "completed",
      completedAtMs: deadlineMs,
    });
    expect(result.current.result).toMatchObject({
      completedAtMs: deadlineMs,
      unanswered: 20,
    });
    expect(result.current.progress.activeSession).toBeNull();
    expect(result.current.progress.recentSessions).toHaveLength(1);
  });

  it("deadline-preflights a delayed interaction so an answer cannot land at expiry", () => {
    vi.useFakeTimers();
    const now = clock(1_000);
    const { result } = renderTrainer({ now });
    act(() => result.current.createSession(getPreset("mental-2m")));
    now.value = 2_000;
    act(() => result.current.startSession());
    const question = result.current.session!.questions[0];
    const deadlineMs = result.current.session!.deadlineMs!;

    now.value = deadlineMs;
    submit(result, correctInput(question.answer));

    expect(result.current.session).toMatchObject({
      phase: "completed",
      completedAtMs: deadlineMs,
      answers: {},
    });
    expect(result.current.result).not.toBeNull();
    expect(result.current.progress.recentSessions).toHaveLength(1);

    const completedProgress = result.current.progress;
    act(() => result.current.clearResult());
    expect(result.current.session).toBeNull();
    expect(result.current.result).toBeNull();
    expect(result.current.progress).toBe(completedProgress);
  });

  it("deadline-preflights delayed input changes and records completion exactly once", () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    const now = clock(1_000);
    const { result } = renderTrainer({ storage, now });
    act(() => result.current.createSession(getPreset("mental-2m")));
    now.value = 2_000;
    act(() => result.current.startSession());
    const sessionId = result.current.session!.id;
    const deadlineMs = result.current.session!.deadlineMs!;

    now.value = deadlineMs;
    act(() => result.current.setInput("too late"));

    expect(result.current.input).toBe("");
    expect(result.current.session).toMatchObject({
      phase: "completed",
      completedAtMs: deadlineMs,
    });
    expect(result.current.result?.sessionId).toBe(sessionId);
    expect(
      result.current.progress.recentSessions.filter(({ id }) => id === sessionId),
    ).toHaveLength(1);
  });

  it("deadline-preflights abandon while preserving normal pre-deadline discard", () => {
    vi.useFakeTimers();
    const expiredClock = clock(1_000);
    const expired = renderTrainer({ now: expiredClock });
    act(() => expired.result.current.createSession(getPreset("mental-2m")));
    expiredClock.value = 2_000;
    act(() => expired.result.current.startSession());
    const sessionId = expired.result.current.session!.id;
    const deadlineMs = expired.result.current.session!.deadlineMs!;

    expiredClock.value = deadlineMs + 1;
    act(() => expired.result.current.abandonSession());

    expect(expired.result.current.session).toMatchObject({
      phase: "completed",
      completedAtMs: deadlineMs,
    });
    expect(expired.result.current.result?.sessionId).toBe(sessionId);
    expect(
      expired.result.current.progress.recentSessions.filter(
        ({ id }) => id === sessionId,
      ),
    ).toHaveLength(1);
    expired.unmount();

    const activeClock = clock(1_000);
    const active = renderTrainer({ now: activeClock });
    act(() => active.result.current.createSession(getPreset("mental-2m")));
    activeClock.value = 2_000;
    act(() => active.result.current.startSession());
    activeClock.value = active.result.current.session!.deadlineMs! - 1;
    act(() => active.result.current.abandonSession());

    expect(active.result.current.session).toBeNull();
    expect(active.result.current.result).toBeNull();
    expect(active.result.current.progress.recentSessions).toEqual([]);
  });

  it("finalizes an expired restored snapshot once across StrictMode and a real remount", () => {
    const storage = new MemoryStorage();
    const active = sessionReducer(
      createSession(getPreset("mental-2m"), 42),
      { type: "start", nowMs: 1_000 },
    );
    expect(createProgressStore(storage).save(progressWithSession(active))).toEqual({
      ok: true,
    });
    const writesBeforeCompletion = storage.setCalls;
    const now = clock(active.deadlineMs! + 50_000);

    const firstMount = renderTrainer({ storage, now, strict: true });
    expect(firstMount.result.current.result).toMatchObject({
      sessionId: active.id,
      completedAtMs: active.deadlineMs,
    });
    expect(firstMount.result.current.progress.recentSessions).toHaveLength(1);
    expect(storedProgress(storage).activeSession).toBeNull();
    expect(storage.setCalls).toBe(writesBeforeCompletion + 1);
    firstMount.unmount();

    const secondMount = renderTrainer({ storage, now, strict: true });
    expect(secondMount.result.current.session).toBeNull();
    expect(secondMount.result.current.progress.recentSessions).toHaveLength(1);
    expect(
      secondMount.result.current.progress.recentSessions.filter(
        ({ id }) => id === active.id,
      ),
    ).toHaveLength(1);
    expect(storage.setCalls).toBe(writesBeforeCompletion + 1);
  });

  it("normalizes completed history in memory by newest ID and caps it at 50", () => {
    const storage = new MemoryStorage();
    const active = sessionReducer(
      createSession(getPreset("mental-2m"), 7_700),
      { type: "start", nowMs: 1_000 },
    );
    const progress = progressWithSession(active);
    progress.recentSessions = Array.from({ length: 50 }, (_, index) =>
      summary(
        index < 2 ? "duplicate-history" : `history-${index}`,
        active.deadlineMs! + 1_000 + index * 1_000,
      ),
    );
    expect(createProgressStore(storage).save(progress)).toEqual({ ok: true });

    const { result } = renderTrainer({
      storage,
      now: clock(active.deadlineMs!),
    });
    const recent = result.current.progress.recentSessions;

    expect(recent).toHaveLength(50);
    expect(new Set(recent.map(({ id }) => id)).size).toBe(50);
    expect(recent.map(({ completedAtMs }) => completedAtMs)).toEqual(
      [...recent]
        .sort((left, right) => right.completedAtMs - left.completedAtMs)
        .map(({ completedAtMs }) => completedAtMs),
    );
    expect(recent.at(-1)?.id).toBe(active.id);
  });

  it("records exact daily, category, and session aggregates and adapts practice once", () => {
    const storage = new MemoryStorage();
    const initial = createDefaultProgress();
    initial.difficulty.probability = 3;
    initial.categoryStats.probability = {
      answered: 4,
      correct: 4,
      totalResponseTimeMs: 100,
      bestStreak: 4,
    };
    const now = clock(new Date(2026, 6, 12, 12, 0, 0).getTime());
    const dateKey = localDateKey(now.value);
    initial.dailyActivity[dateKey] = {
      questions: 2,
      correct: 1,
      milliseconds: 500,
    };
    expect(createProgressStore(storage).save(initial)).toEqual({ ok: true });

    const { result } = renderTrainer({ storage, now, strict: true });
    act(() => result.current.createSession(getPreset("probability-10")));
    now.value += 100;
    act(() => result.current.startSession());

    for (let index = 0; index < 5; index += 1) {
      now.value += 100;
      const question = result.current.session!.questions[result.current.session!.currentIndex];
      submit(result, correctInput(question.answer));
    }

    now.value += 100;
    let question = result.current.session!.questions[result.current.session!.currentIndex];
    submit(result, incorrectInput(question));
    now.value += 100;
    act(() => result.current.skipQuestion());
    now.value += 100;
    act(() => result.current.pauseSession());
    now.value += 5_000;
    act(() => result.current.resumeSession());

    for (let index = 0; index < 3; index += 1) {
      now.value += 100;
      question = result.current.session!.questions[result.current.session!.currentIndex];
      submit(result, correctInput(question.answer));
    }

    const completed = result.current.session!;
    const sessionResult = result.current.result!;
    const attemptedRows = sessionResult.review.filter(
      ({ outcome }) => outcome === "correct" || outcome === "incorrect",
    );
    const attemptedResponseTimeMs = attemptedRows.reduce(
      (total, row) => total + row.responseTimeMs!,
      0,
    );
    const activeMilliseconds =
      sessionResult.completedAtMs -
      sessionResult.startedAtMs -
      completed.accumulatedPauseMs;

    expect(sessionResult).toMatchObject({
      correct: 8,
      incorrect: 1,
      skipped: 1,
      unanswered: 0,
      longestStreak: 5,
      difficultyTransitions: [
        {
          category: "probability",
          startingDifficulty: 3,
          endingDifficulty: 4,
          adaptive: true,
          evaluated: true,
        },
      ],
    });
    expect(result.current.progress.dailyActivity[dateKey]).toEqual({
      questions: 11,
      correct: 9,
      milliseconds: 500 + activeMilliseconds,
    });
    expect(result.current.progress.categoryStats.probability).toEqual({
      answered: 13,
      correct: 12,
      totalResponseTimeMs: 100 + attemptedResponseTimeMs,
      bestStreak: 5,
    });
    expect(result.current.progress.difficulty.probability).toBe(4);
    expect(result.current.progress.recentSessions).toEqual([
      {
        id: sessionResult.sessionId,
        presetId: "probability-10",
        completedAtMs: sessionResult.completedAtMs,
        correct: 8,
        total: 10,
        accuracy: 8 / 9,
        medianResponseTimeMs: sessionResult.medianResponseTimeMs,
      },
    ]);
    expect(result.current.progress.activeSession).toBeNull();
    expect(storedProgress(storage).activeSession).toBeNull();
  });

  it("adapts trained categories from the session starting level and preserves untrained levels", () => {
    const storage = new MemoryStorage();
    const progress = createDefaultProgress();
    progress.difficulty = {
      arithmetic: 9,
      probability: 2,
      sequences: 6,
      estimation: 4,
    };
    expect(createProgressStore(storage).save(progress)).toEqual({ ok: true });
    const now = clock(1_000);
    const { result } = renderTrainer({ storage, now });
    const config = getPreset("probability-10");
    config.startingDifficulty = 7;

    act(() => result.current.createSession(config));
    now.value = 2_000;
    act(() => result.current.startSession());

    for (let index = 0; index < 10; index += 1) {
      now.value += 100;
      const question = result.current.session!.questions[result.current.session!.currentIndex];
      submit(
        result,
        index === 1 || index === 5
          ? incorrectInput(question)
          : correctInput(question.answer),
      );
    }

    expect(result.current.result).toMatchObject({ correct: 8, incorrect: 2 });
    expect(result.current.result?.difficultyTransitions).toEqual([
      {
        category: "probability",
        startingDifficulty: 7,
        endingDifficulty: 8,
        adaptive: true,
        evaluated: true,
      },
    ]);
    expect(result.current.progress.difficulty).toEqual({
      arithmetic: 9,
      probability: 8,
      sequences: 6,
      estimation: 4,
    });
  });

  it.each([0, 4])(
    "preserves a combined category with %i attempts while an evidenced category adapts",
    (estimationAttempts) => {
      const storage = new MemoryStorage();
      const progress = createDefaultProgress();
      progress.difficulty.sequences = 2;
      progress.difficulty.estimation = 9;
      expect(createProgressStore(storage).save(progress)).toEqual({ ok: true });
      const now = clock(1_000);
      const { result } = renderTrainer({ storage, now });
      const config = getPreset("sequences-estimation-10");
      config.startingDifficulty = 7;

      act(() => result.current.createSession(config));
      now.value = 2_000;
      act(() => result.current.startSession());
      let remainingEstimationAttempts = estimationAttempts;

      for (let index = 0; index < 10; index += 1) {
        now.value += 100;
        const question = result.current.session!.questions[result.current.session!.currentIndex];
        if (question.category === "sequences" || remainingEstimationAttempts > 0) {
          submit(result, correctInput(question.answer));
          if (question.category === "estimation") {
            remainingEstimationAttempts -= 1;
          }
        } else {
          act(() => result.current.skipQuestion());
        }
      }

      expect(result.current.progress.difficulty.sequences).toBe(8);
      expect(result.current.progress.difficulty.estimation).toBe(9);
    },
  );

  it("preserves all stored category levels when practice adaptation is disabled", () => {
    const storage = new MemoryStorage();
    const progress = createDefaultProgress();
    progress.difficulty.sequences = 2;
    progress.difficulty.estimation = 9;
    expect(createProgressStore(storage).save(progress)).toEqual({ ok: true });
    const now = clock(1_000);
    const { result } = renderTrainer({ storage, now });
    const config = getPreset("sequences-estimation-10");
    config.startingDifficulty = 7;
    config.adaptive = false;

    act(() => result.current.createSession(config));
    now.value = 2_000;
    act(() => result.current.startSession());

    for (let index = 0; index < 10; index += 1) {
      now.value += 100;
      const question = result.current.session!.questions[result.current.session!.currentIndex];
      submit(result, correctInput(question.answer));
    }

    expect(result.current.progress.difficulty.sequences).toBe(2);
    expect(result.current.progress.difficulty.estimation).toBe(9);
    expect(result.current.result?.difficultyTransitions).toEqual([
      {
        category: "sequences",
        startingDifficulty: 7,
        endingDifficulty: 7,
        adaptive: false,
        evaluated: false,
      },
      {
        category: "estimation",
        startingDifficulty: 7,
        endingDifficulty: 7,
        adaptive: false,
        evaluated: false,
      },
    ]);
  });

  it("computes opposite two-category difficulty changes once and reuses them for progress", () => {
    const now = clock(1_000);
    const { result } = renderTrainer({ now });
    const config = getPreset("sequences-estimation-10");
    config.startingDifficulty = 7;

    act(() => result.current.createSession(config));
    now.value = 2_000;
    act(() => result.current.startSession());

    for (let index = 0; index < 10; index += 1) {
      now.value += 100;
      const question = result.current.session!.questions[result.current.session!.currentIndex];
      submit(
        result,
        question.category === "sequences"
          ? correctInput(question.answer)
          : incorrectInput(question),
      );
    }

    expect(result.current.result?.difficultyTransitions).toEqual([
      {
        category: "sequences",
        startingDifficulty: 7,
        endingDifficulty: 8,
        adaptive: true,
        evaluated: true,
      },
      {
        category: "estimation",
        startingDifficulty: 7,
        endingDifficulty: 6,
        adaptive: true,
        evaluated: true,
      },
    ]);
    expect(result.current.progress.difficulty.sequences).toBe(8);
    expect(result.current.progress.difficulty.estimation).toBe(6);
  });

  it("reports an unchanged adaptive difficulty when the threshold is not met", () => {
    const now = clock(1_000);
    const { result } = renderTrainer({ now });
    const config = getPreset("probability-10");
    config.startingDifficulty = 5;

    act(() => result.current.createSession(config));
    now.value = 2_000;
    act(() => result.current.startSession());

    for (let index = 0; index < 10; index += 1) {
      now.value += 100;
      const question = result.current.session!.questions[result.current.session!.currentIndex];
      submit(
        result,
        index >= 5 && (index === 6 || index === 8)
          ? incorrectInput(question)
          : correctInput(question.answer),
      );
    }

    expect(result.current.result?.difficultyTransitions).toEqual([
      {
        category: "probability",
        startingDifficulty: 5,
        endingDifficulty: 5,
        adaptive: true,
        evaluated: true,
      },
    ]);
    expect(result.current.progress.difficulty.probability).toBe(5);
  });

  it("never adapts mock difficulty even when its recent answers would qualify", () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    const progress = createDefaultProgress();
    progress.difficulty.arithmetic = 7;
    expect(createProgressStore(storage).save(progress)).toEqual({ ok: true });
    const now = clock(1_000);
    const { result } = renderTrainer({ storage, now });
    act(() => result.current.createSession(getPreset("speed-arithmetic")));
    now.value = 2_000;
    act(() => result.current.startSession());

    for (let index = 0; index < 5; index += 1) {
      now.value += 100;
      const question = result.current.session!.questions[result.current.session!.currentIndex];
      submit(result, correctInput(question.answer));
    }

    now.value = result.current.session!.deadlineMs!;
    const question = result.current.session!.questions[result.current.session!.currentIndex];
    submit(result, correctInput(question.answer));

    expect(result.current.result).toMatchObject({ correct: 5, unanswered: 75 });
    expect(result.current.progress.difficulty.arithmetic).toBe(7);
  });

  it("retains a navigable submitted response and restores it when returning", () => {
    vi.useFakeTimers();
    const now = clock(1_000);
    const { result } = renderTrainer({ now });
    act(() => result.current.createSession(getPreset("mixed-quant")));
    now.value = 2_000;
    act(() => result.current.startSession());
    const first = result.current.session!.questions[0];
    const firstInput = correctInput(first.answer);

    now.value = 3_000;
    submit(result, firstInput);
    expect(result.current.session!.currentIndex).toBe(0);
    expect(result.current.input).toBe(firstInput);

    now.value = 4_000;
    act(() => result.current.navigateQuestion(1));
    expect(result.current.input).toBe("");
    act(() => result.current.setInput("unsubmitted draft"));
    now.value = 5_000;
    act(() => result.current.navigateQuestion(0));
    expect(result.current.input).toBe(firstInput);
    now.value = 6_000;
    act(() => result.current.navigateQuestion(1));
    expect(result.current.input).toBe("");
  });

  it("finishes Mixed Quant early through the controller and records unanswered rows", () => {
    const trainer = renderTrainer();

    act(() => trainer.result.current.createSession(getPreset("mixed-quant")));
    act(() => trainer.result.current.startSession());
    const first = trainer.result.current.session!.questions[0];
    trainer.now.value = 6_000;
    submit(trainer.result, correctInput(first.answer));
    trainer.now.value = 7_000;
    act(() => trainer.result.current.finishSession());

    expect(trainer.result.current.result).toMatchObject({
      correct: 1,
      incorrect: 0,
      skipped: 0,
      unanswered: 29,
      completedAtMs: 7_000,
    });
    expect(trainer.result.current.session?.phase).toBe("completed");
    expect(trainer.result.current.progress.activeSession).toBeNull();
  });

  it("keeps playing in memory after write failures and exposes a dismissible warning", () => {
    const storage = new MemoryStorage();
    storage.failSet = true;
    const now = clock(1_000);
    const { result } = renderTrainer({ storage, now });

    act(() => result.current.createSession(getPreset("probability-10")));
    expect(result.current.session?.phase).toBe("ready");
    expect(result.current.storageWarning).toBe(true);
    now.value = 2_000;
    act(() => result.current.startSession());
    expect(result.current.session?.phase).toBe("active");
    expect(result.current.storageWarning).toBe(true);
    act(() => result.current.dismissStorageWarning());
    expect(result.current.storageWarning).toBe(false);

    storage.failRemove = true;
    act(() => result.current.resetProgress());
    expect(result.current.session).toBeNull();
    expect(result.current.progress).toEqual(createDefaultProgress());
    expect(result.current.storageWarning).toBe(true);
  });

  it("degrades a throwing passed-storage read to warned in-memory play", () => {
    const storage = new MemoryStorage();
    storage.failGet = true;
    const { result } = renderTrainer({ storage });

    expect(result.current.progress).toEqual(createDefaultProgress());
    expect(result.current.storageWarning).toBe(true);
    storage.failGet = false;
    act(() => result.current.createSession(getPreset("probability-10")));
    expect(result.current.session?.phase).toBe("ready");
    act(() => result.current.dismissStorageWarning());
    expect(result.current.storageWarning).toBe(false);
  });

  it("guards a throwing window.localStorage getter and continues in memory", () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("Storage unavailable", "SecurityError");
      },
    });
    let rendered!: ReturnType<typeof renderTrainerWithDefaultStorage>;

    try {
      rendered = renderTrainerWithDefaultStorage();
    } finally {
      if (descriptor === undefined) {
        Reflect.deleteProperty(window, "localStorage");
      } else {
        Object.defineProperty(window, "localStorage", descriptor);
      }
    }

    expect(rendered.result.current.progress).toEqual(createDefaultProgress());
    expect(rendered.result.current.storageWarning).toBe(true);
    act(() =>
      rendered.result.current.createSession(getPreset("probability-10")),
    );
    expect(rendered.result.current.session?.phase).toBe("ready");
    act(() => rendered.result.current.dismissStorageWarning());
    expect(rendered.result.current.storageWarning).toBe(false);
  });

  it("abandons without recording and reset removes storage and restores fresh defaults", () => {
    const storage = new MemoryStorage();
    const now = clock(1_000);
    const { result } = renderTrainer({ storage, now });
    act(() => result.current.createSession(getPreset("probability-10")));
    now.value = 2_000;
    act(() => result.current.startSession());
    const first = result.current.session!.questions[0];
    now.value = 3_000;
    submit(result, correctInput(first.answer));

    act(() => result.current.abandonSession());
    expect(result.current.session).toBeNull();
    expect(result.current.result).toBeNull();
    expect(result.current.progress.activeSession).toBeNull();
    expect(result.current.progress.recentSessions).toEqual([]);
    expect(storedProgress(storage).activeSession).toBeNull();

    act(() => result.current.updatePreferences({ theme: "light", dailyGoal: 40 }));
    act(() => result.current.createSession(getPreset("probability-10")));
    act(() => result.current.setInput("draft"));
    act(() => result.current.resetProgress());

    expect(storage.removeCalls).toBe(1);
    expect(storage.getItem(PROGRESS_STORAGE_KEY)).toBeNull();
    expect(result.current.progress).toEqual(createDefaultProgress());
    expect(result.current.session).toBeNull();
    expect(result.current.result).toBeNull();
    expect(result.current.input).toBe("");
  });

  it("reconstructs preference patches and ignores invalid runtime values", () => {
    const storage = new MemoryStorage();
    const { result } = renderTrainer({ storage });
    act(() => result.current.updatePreferences({ theme: "light", dailyGoal: 30 }));
    const valid = result.current.progress;
    expect(valid.preferences).toEqual({
      theme: "light",
      reducedMotion: false,
      dailyGoal: 30,
    });

    act(() => result.current.updatePreferences({ dailyGoal: 0 }));
    expect(result.current.progress).toEqual(valid);
    expect(storedProgress(storage).preferences.dailyGoal).toBe(30);
  });

  it("persists the first post-reset preference revision across remount", () => {
    const storage = new MemoryStorage();
    const first = renderTrainer({ storage });
    act(() => first.result.current.updatePreferences({ theme: "light" }));
    act(() => first.result.current.resetProgress());
    act(() => first.result.current.updatePreferences({ dailyGoal: 35 }));
    first.unmount();

    const second = renderTrainer({ storage });
    expect(second.result.current.progress.preferences).toEqual({
      theme: "dark",
      reducedMotion: false,
      dailyGoal: 35,
    });
  });

  it("owns only one timed deadline and clears it on phase changes and unmount", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const rendered = renderTrainer({
      now: { value: 0, read: () => Date.now() },
    });
    const { result } = rendered;
    expect(vi.getTimerCount()).toBe(0);
    act(() => result.current.createSession(getPreset("mental-2m")));
    expect(vi.getTimerCount()).toBe(0);
    act(() => result.current.startSession());
    expect(vi.getTimerCount()).toBe(1);
    act(() => result.current.pauseSession());
    expect(vi.getTimerCount()).toBe(0);
    vi.setSystemTime(11_000);
    act(() => result.current.resumeSession());
    expect(vi.getTimerCount()).toBe(1);
    act(() => result.current.abandonSession());
    expect(vi.getTimerCount()).toBe(0);

    act(() => result.current.createSession(getPreset("mental-2m")));
    act(() => result.current.startSession());
    expect(vi.getTimerCount()).toBe(1);
    rendered.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
