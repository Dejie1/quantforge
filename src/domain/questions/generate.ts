import { createRng } from "../random";
import type { RandomSource } from "../random";
import { generateArithmetic } from "./arithmetic";
import { generateEstimation } from "./estimation";
import { generateProbability } from "./probability";
import { generateSequence } from "./sequences";
import type {
  GenerateRequest,
  Question,
  QuestionCategory,
} from "./types";

type QuestionFactory = (
  rng: RandomSource,
  difficulty: number,
  index: number,
) => Question;

export type GeneratorFactories = Readonly<
  Partial<Record<QuestionCategory, QuestionFactory>>
>;

const DEFAULT_FACTORIES: Readonly<Record<QuestionCategory, QuestionFactory>> = {
  arithmetic: generateArithmetic,
  probability: generateProbability,
  sequences: generateSequence,
  estimation: generateEstimation,
};

const SEED_INDEX_FACTOR = 2_654_435_761;
const MAX_RETRIES = 3;

function clampDifficulty(difficulty: number): number {
  const comparableDifficulty = Number.isNaN(difficulty) ? 1 : difficulty;
  return Math.min(10, Math.max(1, comparableDifficulty));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasValidAnswer(question: Question): boolean {
  const answer: unknown = question.answer;

  if (!isRecord(answer) || !isNonEmptyString(answer.display)) {
    return false;
  }

  const display = answer.display;

  switch (answer.kind) {
    case "number":
      return typeof answer.value === "number" && Number.isFinite(answer.value);

    case "fraction":
      return (
        typeof answer.numerator === "number" &&
        Number.isFinite(answer.numerator) &&
        typeof answer.denominator === "number" &&
        Number.isFinite(answer.denominator) &&
        answer.denominator !== 0 &&
        Number.isFinite(answer.numerator / answer.denominator)
      );

    case "estimate":
      return (
        typeof answer.value === "number" &&
        Number.isFinite(answer.value) &&
        typeof answer.toleranceRatio === "number" &&
        Number.isFinite(answer.toleranceRatio) &&
        answer.toleranceRatio > 0
      );

    case "choice": {
      if (!isNonEmptyString(answer.value)) {
        return false;
      }

      const answerValue = answer.value;
      const choices: unknown = question.choices;

      if (!Array.isArray(choices)) {
        return false;
      }

      const matchingChoices = choices.filter(
        (choice) =>
          isRecord(choice) &&
          choice.id === answerValue &&
          choice.label === display,
      );

      return matchingChoices.length === 1;
    }

    default:
      return false;
  }
}

function isValidQuestion(
  question: Question,
  request: GenerateRequest,
  difficulty: number,
): boolean {
  return (
    question.id === `${request.category}-${request.index}` &&
    question.category === request.category &&
    typeof question.prompt === "string" &&
    question.prompt.trim().length > 0 &&
    typeof question.explanation === "string" &&
    question.explanation.trim().length > 0 &&
    question.difficulty === difficulty &&
    hasValidAnswer(question)
  );
}

function fallbackQuestion(index: number, difficulty: number): Question {
  return {
    id: `fallback-${index}`,
    category: "arithmetic",
    topic: "Addition",
    difficulty,
    prompt: "12 + 19 = ?",
    answer: { kind: "number", value: 31, display: "31" },
    explanation: "Add the two operands: 12 + 19 = 31.",
    targetTimeMs: 8_000 + difficulty * 2_000,
  };
}

export function generateQuestion(
  request: GenerateRequest,
  factories?: GeneratorFactories,
): Question {
  const difficulty = clampDifficulty(request.difficulty);
  const factory =
    factories?.[request.category] ?? DEFAULT_FACTORIES[request.category];
  const baseSeed = request.seed + request.index * SEED_INDEX_FACTOR;

  if (factory !== undefined) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        const question = factory(
          createRng(baseSeed + attempt),
          difficulty,
          request.index,
        );

        if (isValidQuestion(question, request, difficulty)) {
          return question;
        }
      } catch {
        // A deterministic fresh RNG is used for the next bounded attempt.
      }
    }
  }

  return fallbackQuestion(request.index, difficulty);
}
