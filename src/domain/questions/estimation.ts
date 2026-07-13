import type { RandomSource } from "../random";
import type { AnswerSpec, Question } from "./types";

interface EstimationContext {
  rng: RandomSource;
  difficulty: number;
  index: number;
  toleranceRatio: number;
}

interface EstimationFields {
  topic: string;
  prompt: string;
  exactTarget: number;
  explanation: string;
}

interface EstimationTemplate {
  minimumDifficulty: number;
  build(context: EstimationContext): Question;
}

const PERCENTAGES = [21, 31, 41, 51, 61, 69, 79] as const;
const ADJUSTMENTS = [-1, 1] as const;

function estimateAnswer(
  value: number,
  toleranceRatio: number,
): AnswerSpec {
  return {
    kind: "estimate",
    value,
    toleranceRatio,
    display: String(value),
  };
}

function buildQuestion(
  context: EstimationContext,
  fields: EstimationFields,
): Question {
  return {
    id: `estimation-${context.index}`,
    category: "estimation",
    topic: fields.topic,
    difficulty: context.difficulty,
    prompt: fields.prompt,
    answer: estimateAnswer(fields.exactTarget, context.toleranceRatio),
    explanation: fields.explanation,
    targetTimeMs: 12_000 + context.difficulty * 2_500,
  };
}

function percentage(context: EstimationContext): Question {
  const percent = context.rng.pick(PERCENTAGES);
  const base = context.rng.int(12, 40) * 10;
  const exactTarget = (percent * base) / 100;
  const roundedPercent = Math.round(percent / 10) * 10;
  const roundedEstimate = (roundedPercent * base) / 100;

  return buildQuestion(context, {
    topic: "Percentage estimation",
    prompt: `Estimate ${percent}% of ${base}.`,
    exactTarget,
    explanation:
      `Percentage rounding rule: round ${percent}% to ${roundedPercent}%. ` +
      `Then ${roundedPercent}% of ${base} is about ${roundedEstimate}. ` +
      `The unrounded target is ${exactTarget}.`,
  });
}

function multiplication(context: EstimationContext): Question {
  const roundedLeft = context.rng.int(5, 9) * 10;
  const left = roundedLeft + context.rng.pick(ADJUSTMENTS);
  const roundedRight = context.rng.int(5, 9) * 10;
  const right = roundedRight + context.rng.pick(ADJUSTMENTS);
  const exactTarget = left * right;
  const roundedEstimate = roundedLeft * roundedRight;

  return buildQuestion(context, {
    topic: "Multiplication rounding",
    prompt: `Estimate ${left} x ${right}.`,
    exactTarget,
    explanation:
      `Multiplication rounding rule: round ${left} to ${roundedLeft} and ` +
      `${right} to ${roundedRight}, giving about ${roundedEstimate}. ` +
      `The unrounded target is ${exactTarget}.`,
  });
}

function division(context: EstimationContext): Question {
  const roundedDivisor = context.rng.int(4, 9) * 10;
  const roundedQuotient = context.rng.int(8, 24);
  const divisor = roundedDivisor + context.rng.pick(ADJUSTMENTS);
  const roundedDividend = roundedDivisor * roundedQuotient;
  const dividend = roundedDividend + context.rng.pick(ADJUSTMENTS);
  const exactTarget = dividend / divisor;

  return buildQuestion(context, {
    topic: "Division estimation",
    prompt: `Estimate ${dividend} / ${divisor}.`,
    exactTarget,
    explanation:
      `Division estimation rule: round ${dividend} to ${roundedDividend} ` +
      `and ${divisor} to ${roundedDivisor}, giving about ` +
      `${roundedQuotient}. The unrounded target is ${exactTarget}.`,
  });
}

function orderOfMagnitude(context: EstimationContext): Question {
  const magnitude = context.difficulty >= 10 ? 100_000 : 10_000;
  const roundedItems = context.rng.int(2, 9) * magnitude;
  const items =
    roundedItems + context.rng.pick(ADJUSTMENTS) * (magnitude / 100);
  const roundedDays = context.rng.int(2, 9) * 100;
  const days = roundedDays + context.rng.pick(ADJUSTMENTS);
  const exactTarget = items * days;
  const roundedEstimate = roundedItems * roundedDays;

  return buildQuestion(context, {
    topic: "Order of magnitude",
    prompt: `Estimate the total for ${items} items per day over ${days} days.`,
    exactTarget,
    explanation:
      `Order-of-magnitude rule: round ${items} to ${roundedItems} and ` +
      `${days} to ${roundedDays}, giving about ${roundedEstimate}. ` +
      `The unrounded target is ${exactTarget}.`,
  });
}

const TEMPLATES: ReadonlyArray<EstimationTemplate> = [
  { minimumDifficulty: 1, build: percentage },
  { minimumDifficulty: 3, build: multiplication },
  { minimumDifficulty: 6, build: division },
  { minimumDifficulty: 9, build: orderOfMagnitude },
];

function clampDifficulty(difficulty: number): number {
  const comparableDifficulty = Number.isNaN(difficulty) ? 1 : difficulty;
  return Math.min(10, Math.max(1, comparableDifficulty));
}

export function estimationToleranceForDifficulty(difficulty: number): number {
  const level = clampDifficulty(difficulty);

  if (level <= 2) {
    return 0.15;
  }

  if (level <= 5) {
    return 0.1;
  }

  if (level <= 8) {
    return 0.07;
  }

  return 0.05;
}

export function generateEstimation(
  rng: RandomSource,
  difficulty: number,
  index: number,
): Question {
  const clampedDifficulty = clampDifficulty(difficulty);
  const bandMinimum =
    clampedDifficulty <= 2
      ? 1
      : clampedDifficulty <= 5
        ? 3
        : clampedDifficulty <= 8
          ? 6
          : 9;
  const availableTemplates = TEMPLATES.filter(
    (template) => template.minimumDifficulty === bandMinimum,
  );
  const template = rng.pick(availableTemplates);

  return template.build({
    rng,
    difficulty: clampedDifficulty,
    index,
    toleranceRatio: estimationToleranceForDifficulty(clampedDifficulty),
  });
}
