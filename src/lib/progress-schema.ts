import { validateAnswer } from "../domain/answers";
import type {
  AnswerSpec,
  Question,
  QuestionCategory,
} from "../domain/questions/types";
import type {
  SessionAnswer,
  SessionConfig,
  SessionState,
} from "../domain/session/types";
import { getPreset } from "../domain/session/presets";
import { createSession } from "../domain/session/session";

export interface CategoryStats {
  answered: number;
  correct: number;
  totalResponseTimeMs: number;
  bestStreak: number;
}

export interface SessionSummary {
  id: string;
  presetId: string;
  completedAtMs: number;
  correct: number;
  total: number;
  accuracy: number | null;
  medianResponseTimeMs: number | null;
}

export interface ProgressDataV1 {
  version: 1;
  preferences: {
    theme: "dark" | "light";
    reducedMotion: boolean;
    dailyGoal: number;
  };
  difficulty: Record<QuestionCategory, number>;
  categoryStats: Record<QuestionCategory, CategoryStats>;
  dailyActivity: Record<
    string,
    { questions: number; correct: number; milliseconds: number }
  >;
  recentSessions: SessionSummary[];
  activeSession: SessionState | null;
}

const CATEGORIES = [
  "arithmetic",
  "probability",
  "sequences",
  "estimation",
] as const satisfies ReadonlyArray<QuestionCategory>;

function createEmptyCategoryStats(): CategoryStats {
  return {
    answered: 0,
    correct: 0,
    totalResponseTimeMs: 0,
    bestStreak: 0,
  };
}

export function createDefaultProgress(): ProgressDataV1 {
  return {
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
      arithmetic: createEmptyCategoryStats(),
      probability: createEmptyCategoryStats(),
      sequences: createEmptyCategoryStats(),
      estimation: createEmptyCategoryStats(),
    },
    dailyActivity: {},
    recentSessions: [],
    activeSession: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return isSafeInteger(value) && value >= 0;
}

function isDifficulty(value: unknown): value is number {
  return isSafeInteger(value) && value >= 1 && value <= 10;
}

function isRatio(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

function isNullableNonNegativeNumber(value: unknown): value is number | null {
  return value === null || isNonNegativeNumber(value);
}

function isQuestionCategory(value: unknown): value is QuestionCategory {
  return (
    typeof value === "string" &&
    CATEGORIES.some((category) => category === value)
  );
}

function parseAnswerSpec(value: unknown): AnswerSpec | undefined {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.display) ||
    typeof value.kind !== "string"
  ) {
    return undefined;
  }

  switch (value.kind) {
    case "number":
      return isFiniteNumber(value.value)
        ? { kind: "number", value: value.value, display: value.display }
        : undefined;

    case "fraction":
      return isFiniteNumber(value.numerator) &&
        isFiniteNumber(value.denominator) &&
        value.denominator !== 0
        ? {
            kind: "fraction",
            numerator: value.numerator,
            denominator: value.denominator,
            display: value.display,
          }
        : undefined;

    case "estimate":
      return isFiniteNumber(value.value) &&
        isRatio(value.toleranceRatio)
        ? {
            kind: "estimate",
            value: value.value,
            toleranceRatio: value.toleranceRatio,
            display: value.display,
          }
        : undefined;

    case "choice":
      return isNonEmptyString(value.value)
        ? {
            kind: "choice",
            value: value.value,
            display: value.display,
          }
        : undefined;

    default:
      return undefined;
  }
}

function parseChoice(
  value: unknown,
): { id: string; label: string } | undefined {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.label)
  ) {
    return undefined;
  }

  return { id: value.id, label: value.label };
}

function parseQuestion(value: unknown): Question | undefined {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isQuestionCategory(value.category) ||
    !isNonEmptyString(value.topic) ||
    !isDifficulty(value.difficulty) ||
    !isNonEmptyString(value.prompt) ||
    !isNonEmptyString(value.explanation) ||
    !isNonNegativeNumber(value.targetTimeMs)
  ) {
    return undefined;
  }

  const answer = parseAnswerSpec(value.answer);
  if (answer === undefined) {
    return undefined;
  }

  let choices: Array<{ id: string; label: string }> | undefined;
  if (value.choices !== undefined) {
    if (!Array.isArray(value.choices)) {
      return undefined;
    }

    choices = [];
    for (const candidate of value.choices) {
      const choice = parseChoice(candidate);
      if (choice === undefined) {
        return undefined;
      }
      choices.push(choice);
    }

    if (new Set(choices.map(({ id }) => id)).size !== choices.length) {
      return undefined;
    }
  }

  if (answer.kind === "choice") {
    const matches = choices?.filter(
      ({ id, label }) => id === answer.value && label === answer.display,
    );
    if (matches?.length !== 1) {
      return undefined;
    }
  }

  const question: Question = {
    id: value.id,
    category: value.category,
    topic: value.topic,
    difficulty: value.difficulty,
    prompt: value.prompt,
    answer,
    explanation: value.explanation,
    targetTimeMs: value.targetTimeMs,
  };

  if (choices !== undefined) {
    question.choices = choices;
  }

  return question;
}

function haveSameAnswerSpec(left: AnswerSpec, right: AnswerSpec): boolean {
  if (left.kind !== right.kind || left.display !== right.display) {
    return false;
  }

  switch (left.kind) {
    case "number":
      return right.kind === "number" && left.value === right.value;

    case "fraction":
      return (
        right.kind === "fraction" &&
        left.numerator === right.numerator &&
        left.denominator === right.denominator
      );

    case "estimate":
      return (
        right.kind === "estimate" &&
        left.value === right.value &&
        left.toleranceRatio === right.toleranceRatio
      );

    case "choice":
      return right.kind === "choice" && left.value === right.value;
  }
}

function haveSameChoices(
  left: Question["choices"],
  right: Question["choices"],
): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }

  return (
    left.length === right.length &&
    left.every(
      (choice, index) =>
        choice.id === right[index].id && choice.label === right[index].label,
    )
  );
}

function haveSameQuestion(left: Question, right: Question): boolean {
  return (
    left.id === right.id &&
    left.category === right.category &&
    left.topic === right.topic &&
    left.difficulty === right.difficulty &&
    left.prompt === right.prompt &&
    haveSameAnswerSpec(left.answer, right.answer) &&
    left.explanation === right.explanation &&
    left.targetTimeMs === right.targetTimeMs &&
    haveSameChoices(left.choices, right.choices)
  );
}

function hasDeterministicSessionSnapshot(
  id: string,
  seed: number,
  config: SessionConfig,
  questions: ReadonlyArray<Question>,
): boolean {
  let expected: SessionState;

  try {
    expected = createSession(config, seed);
  } catch {
    return false;
  }

  return (
    id === expected.id &&
    questions.length === expected.questions.length &&
    questions.every((question, index) =>
      haveSameQuestion(question, expected.questions[index]),
    )
  );
}

function parseSessionConfig(value: unknown): SessionConfig | undefined {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.presetId) ||
    (value.mode !== "mental-math" &&
      value.mode !== "probability" &&
      value.mode !== "sequences-estimation" &&
      value.mode !== "mock") ||
    !isSafeNonNegativeInteger(value.questionCount) ||
    value.questionCount === 0 ||
    !isNullableNonNegativeNumber(value.durationMs) ||
    !Array.isArray(value.categories) ||
    value.categories.length === 0 ||
    !value.categories.every(isQuestionCategory) ||
    !isDifficulty(value.startingDifficulty) ||
    typeof value.adaptive !== "boolean" ||
    (value.feedback !== "immediate" && value.feedback !== "deferred") ||
    typeof value.allowPause !== "boolean" ||
    typeof value.allowSkip !== "boolean" ||
    typeof value.allowNavigation !== "boolean"
  ) {
    return undefined;
  }

  return {
    presetId: value.presetId,
    mode: value.mode,
    questionCount: value.questionCount,
    durationMs: value.durationMs,
    categories: [...value.categories],
    startingDifficulty: value.startingDifficulty,
    adaptive: value.adaptive,
    feedback: value.feedback,
    allowPause: value.allowPause,
    allowSkip: value.allowSkip,
    allowNavigation: value.allowNavigation,
  };
}

function hasSameCategories(
  left: ReadonlyArray<QuestionCategory>,
  right: ReadonlyArray<QuestionCategory>,
): boolean {
  return (
    left.length === right.length &&
    left.every((category, index) => category === right[index])
  );
}

function hasAllowedPracticeCategories(
  config: SessionConfig,
  canonical: SessionConfig,
): boolean {
  if (hasSameCategories(config.categories, canonical.categories)) {
    return true;
  }

  const [category] = config.categories;
  return (
    canonical.mode === "sequences-estimation" &&
    config.categories.length === 1 &&
    (category === "sequences" || category === "estimation")
  );
}

function hasCanonicalSessionConfig(config: SessionConfig): boolean {
  let canonical: SessionConfig;

  try {
    canonical = getPreset(config.presetId);
  } catch {
    return false;
  }

  if (
    config.mode !== canonical.mode ||
    config.questionCount !== canonical.questionCount ||
    config.durationMs !== canonical.durationMs ||
    !hasAllowedPracticeCategories(config, canonical) ||
    config.feedback !== canonical.feedback ||
    config.allowPause !== canonical.allowPause ||
    config.allowSkip !== canonical.allowSkip ||
    config.allowNavigation !== canonical.allowNavigation
  ) {
    return false;
  }

  return canonical.mode !== "mock" ||
    (config.startingDifficulty === canonical.startingDifficulty &&
      config.adaptive === canonical.adaptive);
}

function parseSessionAnswer(value: unknown): SessionAnswer | undefined {
  if (
    !isRecord(value) ||
    typeof value.input !== "string" ||
    (value.outcome !== "correct" &&
      value.outcome !== "incorrect" &&
      value.outcome !== "skipped") ||
    !isNonNegativeNumber(value.answeredAtMs) ||
    !isNonNegativeNumber(value.responseTimeMs)
  ) {
    return undefined;
  }

  if (value.outcome === "skipped" && value.input !== "") {
    return undefined;
  }

  return {
    input: value.input,
    outcome: value.outcome,
    answeredAtMs: value.answeredAtMs,
    responseTimeMs: value.responseTimeMs,
  };
}

function haveAnswersWithinSessionLifetime(state: SessionState): boolean {
  if (state.startedAtMs === null) {
    return Object.keys(state.answers).length === 0;
  }

  const answerLimitMs =
    state.phase === "paused"
      ? state.pausedAtMs
      : state.phase === "completed"
        ? state.completedAtMs
        : null;

  const answers = state.questions.flatMap((question) => {
    const answer = state.answers[question.id];
    return answer === undefined ? [] : [answer];
  });
  let latestAnswerMs = state.startedAtMs;
  let totalResponseTimeMs = 0;

  for (const answer of answers) {
    if (
      answer.answeredAtMs < state.startedAtMs! ||
      (state.deadlineMs !== null &&
        answer.answeredAtMs >= state.deadlineMs) ||
      (answerLimitMs !== null && answer.answeredAtMs > answerLimitMs) ||
      (answer.outcome === "skipped" && !state.config.allowSkip) ||
      answer.responseTimeMs > answer.answeredAtMs - state.startedAtMs
    ) {
      return false;
    }

    latestAnswerMs = Math.max(latestAnswerMs, answer.answeredAtMs);
    totalResponseTimeMs += answer.responseTimeMs;
  }

  if (!state.config.allowNavigation && state.accumulatedPauseMs === 0) {
    let segmentStartedAtMs = state.startedAtMs;

    for (const answer of answers) {
      if (
        answer.responseTimeMs !== answer.answeredAtMs - segmentStartedAtMs
      ) {
        return false;
      }

      segmentStartedAtMs = answer.answeredAtMs;
    }
  }

  if (totalResponseTimeMs > latestAnswerMs - state.startedAtMs) {
    return false;
  }

  const activeLifetimeEndMs =
    state.phase === "paused"
      ? state.pausedAtMs
      : state.phase === "completed"
        ? state.completedAtMs
        : state.deadlineMs;

  return (
    activeLifetimeEndMs === null ||
    totalResponseTimeMs <=
      activeLifetimeEndMs - state.startedAtMs - state.accumulatedPauseMs
  );
}

function hasReachableSequentialProgress(state: SessionState): boolean {
  if (state.config.allowNavigation) {
    return true;
  }

  const answerCount = Object.keys(state.answers).length;
  const answersFormPrefix = state.questions.every((question, index) =>
    index < answerCount
      ? Object.hasOwn(state.answers, question.id)
      : !Object.hasOwn(state.answers, question.id),
  );
  const expectedIndex =
    answerCount === state.questions.length
      ? state.questions.length - 1
      : answerCount;

  return answersFormPrefix && state.currentIndex === expectedIndex;
}

function hasValidSessionLifecycle(state: SessionState): boolean {
  const { phase, config } = state;
  const answerCount = Object.keys(state.answers).length;
  const allQuestionsAnswered = answerCount === state.questions.length;

  if (phase === "ready") {
    return (
      state.startedAtMs === null &&
      state.deadlineMs === null &&
      state.pausedAtMs === null &&
      state.accumulatedPauseMs === 0 &&
      state.completedAtMs === null &&
      answerCount === 0 &&
      state.currentIndex === 0
    );
  }

  if (
    state.startedAtMs === null ||
    (state.accumulatedPauseMs > 0 && !config.allowPause)
  ) {
    return false;
  }

  const expectedDeadlineMs =
    config.durationMs === null
      ? null
      : state.startedAtMs + config.durationMs + state.accumulatedPauseMs;

  if (
    state.deadlineMs !== expectedDeadlineMs ||
    !haveAnswersWithinSessionLifetime(state)
  ) {
    return false;
  }

  if (phase === "active") {
    return (
      state.pausedAtMs === null &&
      state.completedAtMs === null &&
      !allQuestionsAnswered
    );
  }

  if (phase === "paused") {
    return (
      config.allowPause &&
      state.pausedAtMs !== null &&
      state.pausedAtMs >= state.startedAtMs &&
      (state.deadlineMs === null || state.pausedAtMs < state.deadlineMs) &&
      state.completedAtMs === null &&
      !allQuestionsAnswered
    );
  }

  if (
    state.pausedAtMs !== null ||
    state.completedAtMs === null ||
    state.completedAtMs < state.startedAtMs ||
    (state.deadlineMs !== null && state.completedAtMs > state.deadlineMs)
  ) {
    return false;
  }

  if (!allQuestionsAnswered) {
    return (
      state.deadlineMs !== null &&
      (state.completedAtMs === state.deadlineMs ||
        (config.mode === "mock" &&
          config.presetId === "mixed-quant" &&
          state.completedAtMs < state.deadlineMs))
    );
  }

  const latestAnswerMs = Math.max(
    ...Object.values(state.answers).map(({ answeredAtMs }) => answeredAtMs),
  );

  return state.completedAtMs === latestAnswerMs;
}

function parseSessionState(value: unknown): SessionState | undefined {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isSafeInteger(value.seed) ||
    (value.phase !== "ready" &&
      value.phase !== "active" &&
      value.phase !== "paused" &&
      value.phase !== "completed") ||
    !Array.isArray(value.questions) ||
    !isRecord(value.answers) ||
    !isSafeNonNegativeInteger(value.currentIndex) ||
    !isNullableNonNegativeNumber(value.startedAtMs) ||
    !isNullableNonNegativeNumber(value.deadlineMs) ||
    !isNullableNonNegativeNumber(value.pausedAtMs) ||
    !isNonNegativeNumber(value.accumulatedPauseMs) ||
    !isNullableNonNegativeNumber(value.completedAtMs)
  ) {
    return undefined;
  }

  const config = parseSessionConfig(value.config);
  if (config === undefined || !hasCanonicalSessionConfig(config)) {
    return undefined;
  }

  const questions: Question[] = [];
  for (const candidate of value.questions) {
    const question = parseQuestion(candidate);
    if (question === undefined) {
      return undefined;
    }
    questions.push(question);
  }

  if (
    questions.length !== config.questionCount ||
    value.currentIndex >= questions.length ||
    new Set(questions.map(({ id }) => id)).size !== questions.length ||
    !hasDeterministicSessionSnapshot(
      value.id,
      value.seed,
      config,
      questions,
    )
  ) {
    return undefined;
  }

  const questionsById = new Map(
    questions.map((question) => [question.id, question]),
  );
  const answerEntries: Array<[string, SessionAnswer]> = [];
  for (const [questionId, candidate] of Object.entries(value.answers)) {
    const question = questionsById.get(questionId);
    const answer = parseSessionAnswer(candidate);
    if (question === undefined || answer === undefined) {
      return undefined;
    }

    if (answer.outcome !== "skipped") {
      const validation = validateAnswer(answer.input, question.answer);
      if (
        validation.status !== "valid" ||
        validation.correct !== (answer.outcome === "correct")
      ) {
        return undefined;
      }
    }

    answerEntries.push([questionId, answer]);
  }

  const state: SessionState = {
    id: value.id,
    seed: value.seed,
    phase: value.phase,
    config,
    questions,
    answers: Object.fromEntries(answerEntries),
    currentIndex: value.currentIndex,
    startedAtMs: value.startedAtMs,
    deadlineMs: value.deadlineMs,
    pausedAtMs: value.pausedAtMs,
    accumulatedPauseMs: value.accumulatedPauseMs,
    completedAtMs: value.completedAtMs,
  };

  return hasValidSessionLifecycle(state) &&
    hasReachableSequentialProgress(state)
    ? state
    : undefined;
}

function parsePreferences(
  value: unknown,
): ProgressDataV1["preferences"] | undefined {
  if (
    !isRecord(value) ||
    (value.theme !== "dark" && value.theme !== "light") ||
    typeof value.reducedMotion !== "boolean" ||
    !isSafeInteger(value.dailyGoal) ||
    value.dailyGoal < 1
  ) {
    return undefined;
  }

  return {
    theme: value.theme,
    reducedMotion: value.reducedMotion,
    dailyGoal: value.dailyGoal,
  };
}

function parseDifficulty(
  value: unknown,
): ProgressDataV1["difficulty"] | undefined {
  if (
    !isRecord(value) ||
    !isDifficulty(value.arithmetic) ||
    !isDifficulty(value.probability) ||
    !isDifficulty(value.sequences) ||
    !isDifficulty(value.estimation)
  ) {
    return undefined;
  }

  return {
    arithmetic: value.arithmetic,
    probability: value.probability,
    sequences: value.sequences,
    estimation: value.estimation,
  };
}

function parseCategoryStats(value: unknown): CategoryStats | undefined {
  if (
    !isRecord(value) ||
    !isSafeNonNegativeInteger(value.answered) ||
    !isSafeNonNegativeInteger(value.correct) ||
    value.correct > value.answered ||
    !isNonNegativeNumber(value.totalResponseTimeMs) ||
    !isSafeNonNegativeInteger(value.bestStreak) ||
    value.bestStreak > value.correct
  ) {
    return undefined;
  }

  return {
    answered: value.answered,
    correct: value.correct,
    totalResponseTimeMs: value.totalResponseTimeMs,
    bestStreak: value.bestStreak,
  };
}

function parseCategoryStatsRecord(
  value: unknown,
): ProgressDataV1["categoryStats"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const arithmetic = parseCategoryStats(value.arithmetic);
  const probability = parseCategoryStats(value.probability);
  const sequences = parseCategoryStats(value.sequences);
  const estimation = parseCategoryStats(value.estimation);

  return arithmetic !== undefined &&
    probability !== undefined &&
    sequences !== undefined &&
    estimation !== undefined
    ? { arithmetic, probability, sequences, estimation }
    : undefined;
}

function parseDailyActivityEntry(
  value: unknown,
): ProgressDataV1["dailyActivity"][string] | undefined {
  if (
    !isRecord(value) ||
    !isSafeNonNegativeInteger(value.questions) ||
    !isSafeNonNegativeInteger(value.correct) ||
    value.correct > value.questions ||
    !isNonNegativeNumber(value.milliseconds)
  ) {
    return undefined;
  }

  return {
    questions: value.questions,
    correct: value.correct,
    milliseconds: value.milliseconds,
  };
}

function parseDailyActivity(
  value: unknown,
): ProgressDataV1["dailyActivity"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const entries: Array<
    [string, ProgressDataV1["dailyActivity"][string]]
  > = [];
  for (const [date, candidate] of Object.entries(value)) {
    const activity = parseDailyActivityEntry(candidate);
    if (activity === undefined) {
      return undefined;
    }
    entries.push([date, activity]);
  }

  return Object.fromEntries(entries);
}

function parseSessionSummary(value: unknown): SessionSummary | undefined {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.presetId) ||
    !isNonNegativeNumber(value.completedAtMs) ||
    !isSafeNonNegativeInteger(value.correct) ||
    !isSafeNonNegativeInteger(value.total) ||
    value.correct > value.total ||
    (value.accuracy !== null && !isRatio(value.accuracy)) ||
    !isNullableNonNegativeNumber(value.medianResponseTimeMs)
  ) {
    return undefined;
  }

  return {
    id: value.id,
    presetId: value.presetId,
    completedAtMs: value.completedAtMs,
    correct: value.correct,
    total: value.total,
    accuracy: value.accuracy,
    medianResponseTimeMs: value.medianResponseTimeMs,
  };
}

function parseRecentSessions(value: unknown): SessionSummary[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const summaries: SessionSummary[] = [];
  for (const candidate of value) {
    const summary = parseSessionSummary(candidate);
    if (summary === undefined) {
      return undefined;
    }
    summaries.push(summary);
  }

  return summaries
    .sort((left, right) => right.completedAtMs - left.completedAtMs)
    .slice(0, 50);
}

function reconstructProgress(value: unknown): ProgressDataV1 | undefined {
  if (!isRecord(value) || value.version !== 1) {
    return undefined;
  }

  const preferences = parsePreferences(value.preferences);
  const difficulty = parseDifficulty(value.difficulty);
  const categoryStats = parseCategoryStatsRecord(value.categoryStats);
  const dailyActivity = parseDailyActivity(value.dailyActivity);
  const recentSessions = parseRecentSessions(value.recentSessions);
  const activeSession =
    value.activeSession === null
      ? null
      : parseSessionState(value.activeSession);

  if (
    preferences === undefined ||
    difficulty === undefined ||
    categoryStats === undefined ||
    dailyActivity === undefined ||
    recentSessions === undefined ||
    activeSession === undefined
  ) {
    return undefined;
  }

  return {
    version: 1,
    preferences,
    difficulty,
    categoryStats,
    dailyActivity,
    recentSessions,
    activeSession,
  };
}

export function parseProgress(value: unknown): ProgressDataV1 {
  try {
    return reconstructProgress(value) ?? createDefaultProgress();
  } catch {
    return createDefaultProgress();
  }
}
