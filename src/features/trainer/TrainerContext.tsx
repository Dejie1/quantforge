import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { validateAnswer } from "../../domain/answers";
import type { QuestionCategory } from "../../domain/questions/types";
import { adaptDifficulty } from "../../domain/session/adaptation";
import { buildSessionResult } from "../../domain/session/results";
import {
  createSession as createDomainSession,
  sessionReducer,
} from "../../domain/session/session";
import type {
  ReviewRow,
  SessionAction,
  SessionConfig,
  SessionResult,
  SessionState,
} from "../../domain/session/types";
import {
  createDefaultProgress,
  parseProgress,
  type ProgressDataV1,
  type SessionSummary,
} from "../../lib/progress-schema";
import {
  createProgressStore,
  type ProgressStore,
} from "../../lib/progress-store";
import type { TrainerController } from "./useTrainer";

const CATEGORIES = [
  "arithmetic",
  "probability",
  "sequences",
  "estimation",
] as const satisfies ReadonlyArray<QuestionCategory>;

interface ControllerState {
  progress: ProgressDataV1;
  session: SessionState | null;
  result: SessionResult | null;
  input: string;
  inputError: string | null;
  storageWarning: boolean;
  saveRevision: number;
}

type ControllerAction =
  | { type: "create-session"; session: SessionState }
  | { type: "session-action"; action: SessionAction }
  | { type: "set-input"; value: string; nowMs: number }
  | { type: "abandon-session"; nowMs: number }
  | { type: "clear-result" }
  | {
      type: "update-preferences";
      patch: Partial<ProgressDataV1["preferences"]>;
    }
  | { type: "reset-progress"; storageFailed: boolean }
  | { type: "storage-failed" }
  | { type: "dismiss-storage-warning" };

export interface TrainerProviderProps {
  children: ReactNode;
  storage?: Storage;
  now?: () => number;
}

export const TrainerContext = createContext<TrainerController | null>(null);

function storedInputFor(session: SessionState): string {
  const question = session.questions[session.currentIndex];
  return question === undefined ? "" : (session.answers[question.id]?.input ?? "");
}

function localDateKey(timestampMs: number): string {
  const date = new Date(timestampMs);
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function categoryBestStreak(
  review: ReadonlyArray<ReviewRow>,
  category: QuestionCategory,
): number {
  let current = 0;
  let best = 0;

  for (const row of review) {
    if (row.question.category !== category) {
      continue;
    }

    if (row.outcome === "correct") {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }

  return best;
}

function normalizeRecentSessions(
  summaries: ReadonlyArray<SessionSummary>,
): SessionSummary[] {
  const newestById = new Map<string, SessionSummary>();

  for (const summary of [...summaries].sort(
    (left, right) => right.completedAtMs - left.completedAtMs,
  )) {
    if (!newestById.has(summary.id)) {
      newestById.set(summary.id, summary);
    }
  }

  return [...newestById.values()].slice(0, 50);
}

function applyDifficultyTransitions(
  progress: ProgressDataV1,
  session: SessionState,
  result: SessionResult,
): SessionResult {
  if (!session.config.adaptive) {
    return result;
  }

  return {
    ...result,
    difficultyTransitions: result.difficultyTransitions.map((transition) => {
      const attempted = result.review.filter(
        (row) =>
          row.question.category === transition.category &&
          (row.outcome === "correct" || row.outcome === "incorrect"),
      ).length;
      const endingDifficulty =
        attempted < 5
          ? progress.difficulty[transition.category]
          : adaptDifficulty({
              currentDifficulty: transition.startingDifficulty,
              result,
              category: transition.category,
              adaptive: true,
            });

      return {
        ...transition,
        endingDifficulty,
        evaluated: attempted >= 5,
      };
    }),
  };
}

function aggregateCompletion(
  progress: ProgressDataV1,
  session: SessionState,
  result: SessionResult,
): ProgressDataV1 {
  const dateKey = localDateKey(result.completedAtMs);
  const previousDaily = progress.dailyActivity[dateKey] ?? {
    questions: 0,
    correct: 0,
    milliseconds: 0,
  };
  const attempted = result.correct + result.incorrect;
  const activeMilliseconds = Math.max(
    0,
    result.completedAtMs - result.startedAtMs - session.accumulatedPauseMs,
  );
  const categoryStats = { ...progress.categoryStats };

  for (const category of CATEGORIES) {
    const rows = result.review.filter(
      (row) => row.question.category === category,
    );
    const attemptedRows = rows.filter(
      ({ outcome }) => outcome === "correct" || outcome === "incorrect",
    );

    if (rows.length === 0) {
      continue;
    }

    const correct = attemptedRows.filter(
      ({ outcome }) => outcome === "correct",
    ).length;
    const totalResponseTimeMs = attemptedRows.reduce(
      (total, { responseTimeMs }) => total + (responseTimeMs ?? 0),
      0,
    );
    const previous = progress.categoryStats[category];

    categoryStats[category] = {
      answered: previous.answered + attemptedRows.length,
      correct: previous.correct + correct,
      totalResponseTimeMs: previous.totalResponseTimeMs + totalResponseTimeMs,
      bestStreak: Math.max(
        previous.bestStreak,
        categoryBestStreak(result.review, category),
      ),
    };
  }

  let difficulty = progress.difficulty;
  if (session.config.adaptive) {
    difficulty = { ...progress.difficulty };
    for (const transition of result.difficultyTransitions) {
      difficulty[transition.category] = transition.endingDifficulty;
    }
  }

  const summary: SessionSummary = {
    id: result.sessionId,
    presetId: result.presetId,
    completedAtMs: result.completedAtMs,
    correct: result.correct,
    total: result.review.length,
    accuracy: result.accuracy,
    medianResponseTimeMs: result.medianResponseTimeMs,
  };

  return {
    ...progress,
    difficulty,
    categoryStats,
    dailyActivity: {
      ...progress.dailyActivity,
      [dateKey]: {
        questions: previousDaily.questions + attempted,
        correct: previousDaily.correct + result.correct,
        milliseconds: previousDaily.milliseconds + activeMilliseconds,
      },
    },
    recentSessions: normalizeRecentSessions([
      summary,
      ...progress.recentSessions,
    ]),
    activeSession: null,
  };
}

function finalizeCompletedSession(
  state: ControllerState,
  session: SessionState,
): ControllerState {
  if (
    state.result?.sessionId === session.id &&
    state.progress.activeSession === null
  ) {
    return state;
  }

  const result = applyDifficultyTransitions(
    state.progress,
    session,
    buildSessionResult(session),
  );
  const alreadyRecorded = state.progress.recentSessions.some(
    ({ id }) => id === session.id,
  );
  let progress: ProgressDataV1;

  if (alreadyRecorded) {
    const recentSessions = normalizeRecentSessions(
      state.progress.recentSessions,
    );
    const historyChanged =
      recentSessions.length !== state.progress.recentSessions.length ||
      recentSessions.some(
        (summary, index) => summary !== state.progress.recentSessions[index],
      );
    progress =
      state.progress.activeSession === null && !historyChanged
        ? state.progress
        : { ...state.progress, recentSessions, activeSession: null };
  } else {
    progress = aggregateCompletion(state.progress, session, result);
  }
  const shouldSave = progress !== state.progress;

  return {
    ...state,
    progress,
    session,
    result,
    inputError: null,
    saveRevision: shouldSave ? state.saveRevision + 1 : state.saveRevision,
  };
}

function createInitialState(
  store: ProgressStore,
  now: () => number,
  storageFailed: () => boolean,
): ControllerState {
  const progress = store.load(now());
  const session = progress.activeSession;
  const initial: ControllerState = {
    progress,
    session,
    result: null,
    input: session === null ? "" : storedInputFor(session),
    inputError: null,
    storageWarning: storageFailed(),
    saveRevision: 0,
  };

  return session?.phase === "completed"
    ? finalizeCompletedSession(initial, session)
    : initial;
}

function transitionSession(
  state: ControllerState,
  action: SessionAction,
): ControllerState {
  const current = state.session;
  if (current === null) {
    return state;
  }

  const next = sessionReducer(current, action);
  let input = state.input;
  let inputError = state.inputError;

  if (action.type === "submit") {
    if (action.validation.status === "invalid" && next === current) {
      return state.inputError === action.validation.message
        ? state
        : { ...state, inputError: action.validation.message };
    }

    if (action.validation.status === "valid") {
      const question = current.questions[current.currentIndex];
      const recorded =
        question !== undefined &&
        next.answers[question.id] !== current.answers[question.id];

      if (recorded) {
        input = current.config.allowNavigation ? action.input : "";
        inputError = null;
      }
    }
  } else if (
    (action.type === "navigate" || action.type === "skip") &&
    next !== current
  ) {
    input = storedInputFor(next);
    inputError = null;
  }

  if (next === current) {
    return state;
  }

  const transitioned: ControllerState = {
    ...state,
    session: next,
    input,
    inputError,
  };

  if (next.phase === "completed") {
    return finalizeCompletedSession(transitioned, next);
  }

  return {
    ...transitioned,
    progress: { ...state.progress, activeSession: next },
    saveRevision: state.saveRevision + 1,
  };
}

function preferencesMatch(
  left: ProgressDataV1["preferences"],
  right: ProgressDataV1["preferences"],
): boolean {
  return (
    left.theme === right.theme &&
    left.reducedMotion === right.reducedMotion &&
    left.dailyGoal === right.dailyGoal
  );
}

function deadlinePreflight(
  state: ControllerState,
  nowMs: number,
): ControllerState {
  return state.session?.phase === "active"
    ? transitionSession(state, { type: "expire", nowMs })
    : state;
}

function controllerReducer(
  state: ControllerState,
  action: ControllerAction,
): ControllerState {
  switch (action.type) {
    case "create-session":
      return {
        ...state,
        progress: { ...state.progress, activeSession: action.session },
        session: action.session,
        result: null,
        input: "",
        inputError: null,
        saveRevision: state.saveRevision + 1,
      };

    case "session-action":
      return transitionSession(state, action.action);

    case "set-input": {
      const checked = deadlinePreflight(state, action.nowMs);
      if (checked !== state) {
        return checked;
      }

      return state.input === action.value && state.inputError === null
        ? state
        : { ...state, input: action.value, inputError: null };
    }

    case "abandon-session": {
      const checked = deadlinePreflight(state, action.nowMs);
      if (checked !== state) {
        return checked;
      }

      const progress =
        state.progress.activeSession === null
          ? state.progress
          : { ...state.progress, activeSession: null };
      const shouldSave = progress !== state.progress;

      if (
        state.session === null &&
        state.result === null &&
        state.input === "" &&
        state.inputError === null &&
        !shouldSave
      ) {
        return state;
      }

      return {
        ...state,
        progress,
        session: null,
        result: null,
        input: "",
        inputError: null,
        saveRevision: shouldSave ? state.saveRevision + 1 : state.saveRevision,
      };
    }

    case "clear-result":
      if (
        state.result === null &&
        state.session?.phase !== "completed"
      ) {
        return state;
      }

      return {
        ...state,
        session: state.session?.phase === "completed" ? null : state.session,
        result: null,
        input: "",
        inputError: null,
      };

    case "update-preferences": {
      const preferences = {
        ...state.progress.preferences,
        ...action.patch,
      };
      const reconstructed = parseProgress({
        ...createDefaultProgress(),
        preferences,
      });

      if (
        !preferencesMatch(reconstructed.preferences, preferences) ||
        preferencesMatch(state.progress.preferences, reconstructed.preferences)
      ) {
        return state;
      }

      return {
        ...state,
        progress: {
          ...state.progress,
          preferences: reconstructed.preferences,
        },
        saveRevision: state.saveRevision + 1,
      };
    }

    case "reset-progress":
      return {
        progress: createDefaultProgress(),
        session: null,
        result: null,
        input: "",
        inputError: null,
        storageWarning: action.storageFailed,
        saveRevision: state.saveRevision,
      };

    case "storage-failed":
      return state.storageWarning ? state : { ...state, storageWarning: true };

    case "dismiss-storage-warning":
      return state.storageWarning ? { ...state, storageWarning: false } : state;
  }
}

function scheduleDeadline(
  deadlineMs: number,
  now: () => number,
  expire: (nowMs: number) => void,
): () => void {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;

  const schedule = () => {
    const delayMs = Math.max(0, deadlineMs - now());
    timeoutId = setTimeout(() => {
      const currentNow = now();
      if (cancelled) {
        return;
      }

      if (currentNow < deadlineMs) {
        schedule();
        return;
      }

      expire(currentNow);
    }, delayMs);
  };

  schedule();

  return () => {
    cancelled = true;
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  };
}

interface GuardedStorage {
  storage: Storage;
  hasFailed(): boolean;
}

function createGuardedStorage(candidate?: Storage): GuardedStorage {
  let target: Storage | null = null;
  let failed = false;

  try {
    target = candidate ?? window.localStorage;
  } catch {
    failed = true;
  }

  const access = <Value,>(operation: (storage: Storage) => Value): Value => {
    try {
      if (target === null) {
        throw new DOMException("Storage unavailable", "SecurityError");
      }

      return operation(target);
    } catch (error) {
      failed = true;
      throw error;
    }
  };

  return {
    storage: {
      get length() {
        return access(({ length }) => length);
      },
      clear() {
        access((storage) => storage.clear());
      },
      getItem(key) {
        return access((storage) => storage.getItem(key));
      },
      key(index) {
        return access((storage) => storage.key(index));
      },
      removeItem(key) {
        access((storage) => storage.removeItem(key));
      },
      setItem(key, value) {
        access((storage) => storage.setItem(key, value));
      },
    },
    hasFailed() {
      return failed;
    },
  };
}

export function TrainerProvider({
  children,
  storage,
  now,
}: TrainerProviderProps) {
  const guardedStorageRef = useRef<GuardedStorage | null>(null);
  const nowRef = useRef<(() => number) | null>(null);
  const storeRef = useRef<ProgressStore | null>(null);

  if (guardedStorageRef.current === null) {
    guardedStorageRef.current = createGuardedStorage(storage);
  }
  if (nowRef.current === null) {
    nowRef.current = now ?? Date.now;
  }
  if (storeRef.current === null) {
    storeRef.current = createProgressStore(guardedStorageRef.current.storage);
  }

  const [state, dispatch] = useReducer(
    controllerReducer,
    undefined,
    () =>
      createInitialState(
        storeRef.current!,
        nowRef.current!,
        () => guardedStorageRef.current!.hasFailed(),
      ),
  );
  const lastSavedRevisionRef = useRef(0);

  useEffect(() => {
    if (
      state.saveRevision === 0 ||
      state.saveRevision === lastSavedRevisionRef.current
    ) {
      return;
    }

    lastSavedRevisionRef.current = state.saveRevision;
    if (!storeRef.current!.save(state.progress).ok) {
      dispatch({ type: "storage-failed" });
    }
  }, [state.progress, state.saveRevision]);

  const sessionId = state.session?.id;
  const sessionPhase = state.session?.phase;
  const deadlineMs = state.session?.deadlineMs;

  useEffect(() => {
    if (sessionPhase !== "active" || deadlineMs === null || deadlineMs === undefined) {
      return;
    }

    return scheduleDeadline(deadlineMs, nowRef.current!, (currentNow) => {
      dispatch({
        type: "session-action",
        action: { type: "expire", nowMs: currentNow },
      });
    });
  }, [deadlineMs, sessionId, sessionPhase]);

  const createSession = useCallback((config: SessionConfig) => {
    const seed = nowRef.current!();
    dispatch({
      type: "create-session",
      session: createDomainSession(config, seed),
    });
  }, []);

  const startSession = useCallback(() => {
    dispatch({
      type: "session-action",
      action: { type: "start", nowMs: nowRef.current!() },
    });
  }, []);

  const setInput = useCallback((value: string) => {
    dispatch({ type: "set-input", value, nowMs: nowRef.current!() });
  }, []);

  const submitAnswer = useCallback(() => {
    const nowMs = nowRef.current!();
    const question = state.session?.questions[state.session.currentIndex];
    if (question === undefined) {
      return;
    }

    dispatch({
      type: "session-action",
      action: {
        type: "submit",
        input: state.input,
        validation: validateAnswer(state.input, question.answer),
        nowMs,
      },
    });
  }, [state.input, state.session]);

  const skipQuestion = useCallback(() => {
    dispatch({
      type: "session-action",
      action: { type: "skip", nowMs: nowRef.current!() },
    });
  }, []);

  const navigateQuestion = useCallback((index: number) => {
    dispatch({
      type: "session-action",
      action: { type: "navigate", index, nowMs: nowRef.current!() },
    });
  }, []);

  const pauseSession = useCallback(() => {
    dispatch({
      type: "session-action",
      action: { type: "pause", nowMs: nowRef.current!() },
    });
  }, []);

  const resumeSession = useCallback(() => {
    dispatch({
      type: "session-action",
      action: { type: "resume", nowMs: nowRef.current!() },
    });
  }, []);

  const finishSession = useCallback(() => {
    dispatch({
      type: "session-action",
      action: { type: "finish", nowMs: nowRef.current!() },
    });
  }, []);

  const abandonSession = useCallback(() => {
    dispatch({ type: "abandon-session", nowMs: nowRef.current!() });
  }, []);

  const clearResult = useCallback(() => {
    dispatch({ type: "clear-result" });
  }, []);

  const updatePreferences = useCallback(
    (patch: Partial<ProgressDataV1["preferences"]>) => {
      dispatch({ type: "update-preferences", patch });
    },
    [],
  );

  const resetProgress = useCallback(() => {
    const storageFailed = !storeRef.current!.reset().ok;
    dispatch({ type: "reset-progress", storageFailed });
  }, []);

  const dismissStorageWarning = useCallback(() => {
    dispatch({ type: "dismiss-storage-warning" });
  }, []);

  const controller = useMemo<TrainerController>(
    () => ({
      progress: state.progress,
      session: state.session,
      result: state.result,
      input: state.input,
      inputError: state.inputError,
      storageWarning: state.storageWarning,
      createSession,
      startSession,
      setInput,
      submitAnswer,
      skipQuestion,
      navigateQuestion,
      pauseSession,
      resumeSession,
      finishSession,
      abandonSession,
      clearResult,
      updatePreferences,
      resetProgress,
      dismissStorageWarning,
    }),
    [
      abandonSession,
      clearResult,
      createSession,
      dismissStorageWarning,
      finishSession,
      navigateQuestion,
      pauseSession,
      resetProgress,
      resumeSession,
      setInput,
      skipQuestion,
      startSession,
      state,
      submitAnswer,
      updatePreferences,
    ],
  );

  return (
    <TrainerContext.Provider value={controller}>
      {children}
    </TrainerContext.Provider>
  );
}
