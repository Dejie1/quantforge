import { reduceFraction } from "./questions/math";
import type { AnswerSpec } from "./questions/types";

export type AnswerValidation =
  | { status: "invalid"; message: string }
  | { status: "valid"; correct: boolean; normalized: string };

const DECIMAL_PATTERN = /^[+-]?\d+(?:\.\d+)?$/;
const INTEGER_PATTERN = /^[+-]?\d+$/;
const EXACT_EPSILON = 1e-9;

function parseDecimal(input: string): number | undefined {
  if (!DECIMAL_PATTERN.test(input)) {
    return undefined;
  }

  const value = Number(input);
  return Number.isFinite(value) ? value : undefined;
}

function validateFraction(
  input: string,
  spec: Extract<AnswerSpec, { kind: "fraction" }>,
): AnswerValidation {
  const parts = input.split("/");
  const isIntegerInput = INTEGER_PATTERN.test(input);

  if (
    !isIntegerInput &&
    (parts.length !== 2 ||
      !INTEGER_PATTERN.test(parts[0]) ||
      !INTEGER_PATTERN.test(parts[1]))
  ) {
    return {
      status: "invalid",
      message: "Use one fraction bar, like 3/8",
    };
  }

  const numerator = Number(isIntegerInput ? input : parts[0]);
  const denominator = isIntegerInput ? 1 : Number(parts[1]);

  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    return {
      status: "invalid",
      message: "Use one fraction bar, like 3/8",
    };
  }

  if (
    !Number.isSafeInteger(numerator) ||
    !Number.isSafeInteger(denominator)
  ) {
    return {
      status: "invalid",
      message: "Use whole numbers up to 9,007,199,254,740,991",
    };
  }

  if (denominator === 0) {
    return {
      status: "invalid",
      message: "The denominator cannot be zero",
    };
  }

  const parsed = reduceFraction(numerator, denominator);
  const expected = reduceFraction(spec.numerator, spec.denominator);

  return {
    status: "valid",
    correct:
      parsed.numerator === expected.numerator &&
      parsed.denominator === expected.denominator,
    normalized: `${parsed.numerator}/${parsed.denominator}`,
  };
}

export function validateAnswer(
  input: string,
  spec: AnswerSpec,
): AnswerValidation {
  const trimmed = input.trim();

  if (spec.kind === "choice") {
    if (trimmed.length === 0) {
      return { status: "invalid", message: "Choose an answer" };
    }

    return {
      status: "valid",
      correct: trimmed === spec.value,
      normalized: trimmed,
    };
  }

  if (spec.kind === "fraction") {
    return validateFraction(trimmed, spec);
  }

  const parsed = parseDecimal(trimmed);

  if (parsed === undefined) {
    return { status: "invalid", message: "Enter a number" };
  }

  if (spec.kind === "number") {
    return {
      status: "valid",
      correct: Math.abs(parsed - spec.value) <= EXACT_EPSILON,
      normalized: String(parsed),
    };
  }

  const relativeError =
    spec.value === 0
      ? Math.abs(parsed)
      : Math.abs(parsed - spec.value) / Math.abs(spec.value);

  return {
    status: "valid",
    correct: relativeError <= spec.toleranceRatio + Number.EPSILON,
    normalized: String(parsed),
  };
}

export function isSubmittableAnswer(
  input: string,
  spec: AnswerSpec,
): boolean {
  return validateAnswer(input, spec).status === "valid";
}
