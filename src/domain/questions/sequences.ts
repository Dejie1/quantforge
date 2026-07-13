import type { RandomSource } from "../random";
import type { Question } from "./types";

interface SequenceContext {
  rng: RandomSource;
  difficulty: number;
  index: number;
}

interface SequenceTemplate {
  bandMinimum: number;
  build(context: SequenceContext): Question;
}

function buildQuestion(
  context: SequenceContext,
  topic: string,
  terms: ReadonlyArray<number>,
  explanation: string,
): Question {
  const visibleTerms = terms.slice(0, 5);
  const next = terms[5];

  return {
    id: `sequences-${context.index}`,
    category: "sequences",
    topic,
    difficulty: context.difficulty,
    prompt: `Find the next term: ${visibleTerms.join(", ")}, ?`,
    answer: { kind: "number", value: next, display: String(next) },
    explanation,
    targetTimeMs: 10_000 + context.difficulty * 2_500,
  };
}

function arithmetic(context: SequenceContext): Question {
  const start = context.rng.int(2, 20);
  const difference = context.rng.int(2, 8);
  const terms = Array.from(
    { length: 6 },
    (_, position) => start + position * difference,
  );
  const next = terms[5];

  return buildQuestion(
    context,
    "Arithmetic sequence",
    terms,
    `Arithmetic rule: add ${difference} each time, so ${terms[4]} + ` +
      `${difference} = ${next}.`,
  );
}

function geometric(context: SequenceContext): Question {
  const start = context.rng.int(1, 5);
  const ratio = context.rng.int(2, 3);
  const terms = Array.from(
    { length: 6 },
    (_, position) => start * ratio ** position,
  );
  const next = terms[5];

  return buildQuestion(
    context,
    "Geometric sequence",
    terms,
    `Geometric rule: multiply by ${ratio} each time, so ${terms[4]} x ` +
      `${ratio} = ${next}.`,
  );
}

function alternating(context: SequenceContext): Question {
  const start = context.rng.int(20, 40);
  const increase = context.rng.int(3, 9);
  const decrease = context.rng.int(1, increase - 1);
  const terms = [start];

  for (let position = 1; position < 6; position += 1) {
    const previous = terms[position - 1];
    terms.push(
      position % 2 === 1 ? previous + increase : previous - decrease,
    );
  }

  return buildQuestion(
    context,
    "Alternating sequence",
    terms,
    `Alternating rule: add ${increase}, then subtract ${decrease}, and ` +
      `repeat. The next step adds ${increase}: ${terms[4]} + ${increase} = ` +
      `${terms[5]}.`,
  );
}

function increasingDifference(context: SequenceContext): Question {
  const start = context.rng.int(3, 15);
  const firstDifference = context.rng.int(2, 6);
  const differenceIncrease = context.rng.int(1, 4);
  const differences = Array.from(
    { length: 5 },
    (_, position) => firstDifference + position * differenceIncrease,
  );
  const terms = [start];

  for (const difference of differences) {
    terms.push(terms[terms.length - 1] + difference);
  }

  return buildQuestion(
    context,
    "Increasing-difference sequence",
    terms,
    `Increasing-difference rule: add ${differences.join(", ")}, increasing ` +
      `the difference by ${differenceIncrease} each time. Therefore ` +
      `${terms[4]} + ${differences[4]} = ${terms[5]}.`,
  );
}

function interleaved(context: SequenceContext): Question {
  const oddStart = context.rng.int(-12, -4);
  const evenStart = context.rng.int(5, 20);
  const oddDifference = context.rng.int(2, 6);
  const evenDifference = context.rng.int(3, 8);
  const terms = Array.from({ length: 6 }, (_, position) => {
    const subsequencePosition = Math.floor(position / 2);

    return position % 2 === 0
      ? oddStart + subsequencePosition * oddDifference
      : evenStart + subsequencePosition * evenDifference;
  });

  return buildQuestion(
    context,
    "Interleaved sequence",
    terms,
    `Interleaved rule: odd-position terms add ${oddDifference}, while ` +
      `even-position terms add ${evenDifference}. The next even-position ` +
      `term is ${terms[3]} + ${evenDifference} = ${terms[5]}.`,
  );
}

function recurrence(context: SequenceContext): Question {
  const first = context.rng.int(2, 8);
  const second = context.rng.int(3, 9);
  const offset = context.rng.int(1, 4);
  const terms = [first, second];

  while (terms.length < 6) {
    const last = terms[terms.length - 1];
    const secondLast = terms[terms.length - 2];
    terms.push(secondLast + last + offset);
  }

  return buildQuestion(
    context,
    "Recurrence sequence",
    terms,
    `Recurrence rule: each term is the sum of the previous two plus ` +
      `${offset}. Therefore ${terms[3]} + ${terms[4]} + ${offset} = ` +
      `${terms[5]}.`,
  );
}

const TEMPLATES: ReadonlyArray<SequenceTemplate> = [
  { bandMinimum: 1, build: arithmetic },
  { bandMinimum: 1, build: geometric },
  { bandMinimum: 3, build: alternating },
  { bandMinimum: 5, build: increasingDifference },
  { bandMinimum: 7, build: interleaved },
  { bandMinimum: 9, build: recurrence },
];

function clampDifficulty(difficulty: number): number {
  const comparableDifficulty = Number.isNaN(difficulty) ? 1 : difficulty;
  return Math.min(10, Math.max(1, comparableDifficulty));
}

export function generateSequence(
  rng: RandomSource,
  difficulty: number,
  index: number,
): Question {
  const clampedDifficulty = clampDifficulty(difficulty);
  const bandMinimum = Math.floor((clampedDifficulty - 1) / 2) * 2 + 1;
  const availableTemplates = TEMPLATES.filter(
    (template) => template.bandMinimum === bandMinimum,
  );
  const template = rng.pick(availableTemplates);

  return template.build({ rng, difficulty: clampedDifficulty, index });
}
