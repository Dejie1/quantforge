import type { RandomSource } from "../random";
import { formatNumber, reduceFraction } from "./math";
import type { AnswerSpec, Question } from "./types";

interface ArithmeticContext {
  rng: RandomSource;
  difficulty: number;
  index: number;
}

interface ArithmeticFields {
  topic: string;
  prompt: string;
  answer: AnswerSpec;
  explanation: string;
}

interface ArithmeticTemplate {
  minimumDifficulty: number;
  build(context: ArithmeticContext): Question;
}

const COMMON_PERCENTAGES = [10, 20, 25, 50, 75] as const;

const TERMINATING_FRACTIONS = [
  { numerator: 1, denominator: 2, value: 0.5 },
  { numerator: 1, denominator: 4, value: 0.25 },
  { numerator: 3, denominator: 4, value: 0.75 },
  { numerator: 1, denominator: 5, value: 0.2 },
  { numerator: 2, denominator: 5, value: 0.4 },
  { numerator: 3, denominator: 5, value: 0.6 },
  { numerator: 4, denominator: 5, value: 0.8 },
  { numerator: 1, denominator: 10, value: 0.1 },
  { numerator: 3, denominator: 20, value: 0.15 },
  { numerator: 7, denominator: 20, value: 0.35 },
] as const;

function numberAnswer(value: number): AnswerSpec {
  return { kind: "number", value, display: formatNumber(value) };
}

function fractionDisplay(numerator: number, denominator: number): string {
  return denominator === 1
    ? formatNumber(numerator)
    : `${formatNumber(numerator)}/${formatNumber(denominator)}`;
}

function buildQuestion(
  context: ArithmeticContext,
  fields: ArithmeticFields,
): Question {
  return {
    id: `arithmetic-${context.index}`,
    category: "arithmetic",
    difficulty: context.difficulty,
    targetTimeMs: 8_000 + context.difficulty * 2_000,
    ...fields,
  };
}

function integerOperand(rng: RandomSource, difficulty: number): number {
  if (difficulty <= 4) {
    return rng.int(2, 99);
  }

  return rng.int(10, 99) * 10;
}

function addition(context: ArithmeticContext): Question {
  const left = integerOperand(context.rng, context.difficulty);
  const right = integerOperand(context.rng, context.difficulty);
  const result = left + right;

  return buildQuestion(context, {
    topic: "Addition",
    prompt: `${left} + ${right} = ?`,
    answer: numberAnswer(result),
    explanation: `Add the two operands: ${left} + ${right} = ${result}.`,
  });
}

function subtraction(context: ArithmeticContext): Question {
  const first = integerOperand(context.rng, context.difficulty);
  const second = integerOperand(context.rng, context.difficulty);
  const left = Math.max(first, second);
  const right = Math.min(first, second);
  const result = left - right;

  return buildQuestion(context, {
    topic: "Subtraction",
    prompt: `${left} - ${right} = ?`,
    answer: numberAnswer(result),
    explanation: `Subtract the smaller number: ${left} - ${right} = ${result}.`,
  });
}

function smallMultiplication(context: ArithmeticContext): Question {
  const left = context.rng.int(2, 12);
  const right = context.rng.int(2, 12);
  const result = left * right;

  return buildQuestion(context, {
    topic: "Multiplication",
    prompt: `${left} × ${right} = ?`,
    answer: numberAnswer(result),
    explanation: `Multiply the factors: ${left} × ${right} = ${result}.`,
  });
}

function exactDivision(context: ArithmeticContext): Question {
  const divisor = context.rng.int(2, 12);
  const quotient = context.rng.int(2, 20);
  const dividend = divisor * quotient;

  return buildQuestion(context, {
    topic: "Exact division",
    prompt: `${dividend} ÷ ${divisor} = ?`,
    answer: numberAnswer(quotient),
    explanation:
      `The dividend was built as ${divisor} × ${quotient}, so ` +
      `${dividend} ÷ ${divisor} = ${quotient}.`,
  });
}

function percentage(context: ArithmeticContext): Question {
  const percent = context.rng.pick(COMMON_PERCENTAGES);
  const base = context.rng.int(2, 20) * 20;
  const result = (percent * base) / 100;

  return buildQuestion(context, {
    topic: "Percentages",
    prompt: `What is ${percent}% of ${base}?`,
    answer: numberAnswer(result),
    explanation: `Compute ${percent}/100 × ${base} = ${result}.`,
  });
}

function missingNumber(context: ArithmeticContext): Question {
  const unknown = context.rng.int(10, 99);
  const addend = context.rng.int(10, 99);
  const total = unknown + addend;

  return buildQuestion(context, {
    topic: "Missing number",
    prompt: `? + ${addend} = ${total}`,
    answer: numberAnswer(unknown),
    explanation:
      `Subtract ${addend} from both sides: ${total} - ${addend} = ${unknown}.`,
  });
}

function fractionArithmetic(context: ArithmeticContext): Question {
  const firstDenominator = context.rng.int(2, 6);
  const denominatorMultiplier = context.rng.pick([2, 3] as const);
  const secondDenominator = firstDenominator * denominatorMultiplier;
  const firstNumerator = context.rng.int(1, firstDenominator - 1);
  const secondNumerator = context.rng.int(1, secondDenominator - 1);
  const firstCommonNumerator = firstNumerator * denominatorMultiplier;
  const commonNumerator = firstCommonNumerator + secondNumerator;
  const result = reduceFraction(commonNumerator, secondDenominator);
  const display = fractionDisplay(result.numerator, result.denominator);

  return buildQuestion(context, {
    topic: "Fraction arithmetic",
    prompt:
      `${firstNumerator}/${firstDenominator} + ` +
      `${secondNumerator}/${secondDenominator} = ?`,
    answer: {
      kind: "fraction",
      numerator: result.numerator,
      denominator: result.denominator,
      display,
    },
    explanation:
      `Convert ${firstNumerator}/${firstDenominator} to ` +
      `${firstCommonNumerator}/${secondDenominator}, then add: ` +
      `${firstCommonNumerator}/${secondDenominator} + ` +
      `${secondNumerator}/${secondDenominator} = ` +
      `${commonNumerator}/${secondDenominator} = ${display}.`,
  });
}

function ratio(context: ArithmeticContext): Question {
  const first = context.rng.int(2, 9);
  const second = context.rng.int(2, 9);
  const multiplier = context.rng.int(2, 6);
  const scaledFirst = first * multiplier;
  const scaledSecond = second * multiplier;

  return buildQuestion(context, {
    topic: "Ratios",
    prompt: `${first}:${second} = ?:${scaledSecond}`,
    answer: numberAnswer(scaledFirst),
    explanation:
      `The second term was multiplied by ${multiplier}, so multiply the ` +
      `first term too: ${first} × ${multiplier} = ${scaledFirst}.`,
  });
}

function largerMultiplication(context: ArithmeticContext): Question {
  const unscaled = context.rng.int(12, 99);
  const left = unscaled * 10;
  const right = context.rng.int(3, 9);
  const result = left * right;

  return buildQuestion(context, {
    topic: "Larger multiplication",
    prompt: `${left} × ${right} = ?`,
    answer: numberAnswer(result),
    explanation:
      `Multiply ${unscaled} × ${right}, then append the zero: ` +
      `${left} × ${right} = ${result}.`,
  });
}

function decimalConversion(context: ArithmeticContext): Question {
  const fraction = context.rng.pick(TERMINATING_FRACTIONS);

  return buildQuestion(context, {
    topic: "Decimal conversion",
    prompt:
      `Convert ${fraction.numerator}/${fraction.denominator} to a decimal.`,
    answer: numberAnswer(fraction.value),
    explanation:
      `Divide the numerator by the denominator: ${fraction.numerator} ÷ ` +
      `${fraction.denominator} = ${formatNumber(fraction.value)}.`,
  });
}

function reversePercentage(context: ArithmeticContext): Question {
  const percent = context.rng.pick(COMMON_PERCENTAGES);
  const base = context.rng.int(2, 20) * 20;
  const result = (percent * base) / 100;
  const decimalPercent = percent / 100;

  return buildQuestion(context, {
    topic: "Reverse percentages",
    prompt: `${percent}% of what number is ${result}?`,
    answer: numberAnswer(base),
    explanation:
      `Divide ${result} by ${formatNumber(decimalPercent)}: ` +
      `${result} ÷ ${formatNumber(decimalPercent)} = ${base}.`,
  });
}

function negativeResult(context: ArithmeticContext): Question {
  const left = context.rng.int(10, 60);
  const difference = context.rng.int(1, 40);
  const right = left + difference;
  const result = -difference;

  return buildQuestion(context, {
    topic: "Negative results",
    prompt: `${left} - ${right} = ?`,
    answer: numberAnswer(result),
    explanation:
      `${right} is ${difference} greater than ${left}, so ` +
      `${left} - ${right} = ${result}.`,
  });
}

function mixedOperations(context: ArithmeticContext): Question {
  const base = context.rng.int(12, 99);
  const multiplier = context.rng.int(3, 9);
  const cancellationMultiplier = multiplier - 1;
  const subtrahend = base * cancellationMultiplier;

  return buildQuestion(context, {
    topic: "Mixed operations",
    prompt: `${base} × ${multiplier} - ${subtrahend} = ?`,
    answer: numberAnswer(base),
    explanation:
      `Rewrite ${subtrahend} as ${base} × ${cancellationMultiplier}: ` +
      `${base} × ${multiplier} - ${base} × ${cancellationMultiplier} = ${base}.`,
  });
}

const TEMPLATES: ReadonlyArray<ArithmeticTemplate> = [
  { minimumDifficulty: 1, build: addition },
  { minimumDifficulty: 1, build: subtraction },
  { minimumDifficulty: 1, build: smallMultiplication },
  { minimumDifficulty: 3, build: exactDivision },
  { minimumDifficulty: 3, build: percentage },
  { minimumDifficulty: 3, build: missingNumber },
  { minimumDifficulty: 5, build: fractionArithmetic },
  { minimumDifficulty: 5, build: ratio },
  { minimumDifficulty: 5, build: largerMultiplication },
  { minimumDifficulty: 7, build: decimalConversion },
  { minimumDifficulty: 7, build: reversePercentage },
  { minimumDifficulty: 7, build: negativeResult },
  { minimumDifficulty: 9, build: mixedOperations },
];

function clampDifficulty(difficulty: number): number {
  const comparableDifficulty = Number.isNaN(difficulty) ? 1 : difficulty;
  return Math.min(10, Math.max(1, comparableDifficulty));
}

export function generateArithmetic(
  rng: RandomSource,
  difficulty: number,
  index: number,
): Question {
  const clampedDifficulty = clampDifficulty(difficulty);
  const bandMinimumDifficulty =
    Math.floor((clampedDifficulty - 1) / 2) * 2 + 1;
  const availableTemplates = TEMPLATES.filter(
    (template) => template.minimumDifficulty === bandMinimumDifficulty,
  );
  const template = rng.pick(availableTemplates);

  return template.build({
    rng,
    difficulty: clampedDifficulty,
    index,
  });
}
