import type { RandomSource } from "../random";
import { combination, reduceFraction } from "./math";
import type { AnswerSpec, Question } from "./types";

interface ProbabilityContext {
  rng: RandomSource;
  difficulty: number;
  index: number;
}

interface ProbabilityFields {
  topic: string;
  prompt: string;
  answer: AnswerSpec;
  explanation: string;
  choices?: ReadonlyArray<{ id: string; label: string }>;
}

interface ProbabilityTemplate {
  minimumDifficulty: number;
  build(context: ProbabilityContext): Question;
}

interface BayesScenario {
  aRed: number;
  aBlue: number;
  bRed: number;
  bBlue: number;
}

const SUITS = [
  { singular: "heart", plural: "hearts" },
  { singular: "diamond", plural: "diamonds" },
  { singular: "club", plural: "clubs" },
  { singular: "spade", plural: "spades" },
] as const;

const BAYES_SCENARIOS: ReadonlyArray<BayesScenario> = [
  { aRed: 3, aBlue: 1, bRed: 1, bBlue: 1 },
  { aRed: 4, aBlue: 1, bRed: 2, bBlue: 3 },
  { aRed: 3, aBlue: 2, bRed: 1, bBlue: 4 },
  { aRed: 2, aBlue: 3, bRed: 1, bBlue: 4 },
];

function fractionDisplay(numerator: number, denominator: number): string {
  return denominator === 1 ? String(numerator) : `${numerator}/${denominator}`;
}

function reducedFraction(numerator: number, denominator: number): {
  numerator: number;
  denominator: number;
  display: string;
} {
  const reduced = reduceFraction(numerator, denominator);

  return {
    ...reduced,
    display: fractionDisplay(reduced.numerator, reduced.denominator),
  };
}

function fractionAnswer(numerator: number, denominator: number): AnswerSpec {
  const reduced = reducedFraction(numerator, denominator);

  return { kind: "fraction", ...reduced };
}

function numberAnswer(value: number): AnswerSpec {
  return { kind: "number", value, display: String(value) };
}

function buildQuestion(
  context: ProbabilityContext,
  fields: ProbabilityFields,
): Question {
  return {
    id: `probability-${context.index}`,
    category: "probability",
    difficulty: context.difficulty,
    targetTimeMs: 12_000 + context.difficulty * 3_000,
    ...fields,
  };
}

function factorial(value: number): number {
  let result = 1;

  for (let factor = 2; factor <= value; factor += 1) {
    result *= factor;
  }

  return result;
}

function tokenPhrase(count: number, color: string): string {
  return `${count} ${color} ${count === 1 ? "token" : "tokens"}`;
}

function singleDie(context: ProbabilityContext): Question {
  const target = context.rng.int(1, 6);

  return buildQuestion(context, {
    topic: "Single-die probability",
    prompt:
      "A fair six-sided die is rolled once. " +
      `What is the probability of rolling a ${target}?`,
    answer: fractionAnswer(1, 6),
    explanation:
      "There is 1 favorable face out of 6 equally likely faces, " +
      "so the probability is 1/6.",
  });
}

function complementCards(context: ProbabilityContext): Question {
  const suit = context.rng.pick(SUITS);

  return buildQuestion(context, {
    topic: "Complement probability",
    prompt:
      "One card is drawn from a standard 52-card deck. " +
      `What is the probability it is not a ${suit.singular}?`,
    answer: fractionAnswer(39, 52),
    explanation:
      `There are 13 ${suit.plural}, so 52 - 13 = 39 cards are not ` +
      `${suit.plural}; 39/52 reduces to 3/4.`,
  });
}

function permutations(context: ProbabilityContext): Question {
  const count = context.rng.int(3, 5);
  const result = factorial(count);
  const factors = Array.from(
    { length: count },
    (_, index) => count - index,
  ).join(" x ");
  const remainingChoices = Array.from(
    { length: count - 1 },
    (_, index) => count - index - 1,
  ).join(", then ");

  return buildQuestion(context, {
    topic: "Permutations",
    prompt:
      `In how many orders can ${count} distinct books be placed on a shelf?`,
    answer: numberAnswer(result),
    explanation:
      `There are ${count} choices, then ${remainingChoices}: ` +
      `${factors} = ${result}.`,
  });
}

function independentEvents(context: ProbabilityContext): Question {
  const firstTarget = context.rng.int(1, 6);
  const secondTarget = context.rng.int(1, 6);

  return buildQuestion(context, {
    topic: "Independent events",
    prompt:
      "Two fair six-sided dice are rolled. What is the probability the " +
      `first shows ${firstTarget} and the second shows ${secondTarget}?`,
    answer: fractionAnswer(1, 36),
    explanation:
      "The rolls are independent, so multiply: 1/6 x 1/6 = 1/36.",
  });
}

function combinations(context: ProbabilityContext): Question {
  const people = context.rng.int(5, 8);
  const committeeSize = context.rng.int(2, 3);
  const result = combination(people, committeeSize);
  const remainder = people - committeeSize;

  return buildQuestion(context, {
    topic: "Combinations",
    prompt:
      `How many different ${committeeSize}-person committees can be chosen ` +
      `from ${people} people?`,
    answer: numberAnswer(result),
    explanation:
      `Order does not matter: C(${people}, ${committeeSize}) = ` +
      `${people}! / (${committeeSize}! x ${remainder}!) = ${result}.`,
  });
}

function withoutReplacement(context: ProbabilityContext): Question {
  const red = context.rng.int(3, 6);
  const blue = context.rng.int(2, 5);
  const total = red + blue;
  const numerator = red * (red - 1);
  const denominator = total * (total - 1);
  const result = reducedFraction(numerator, denominator);

  return buildQuestion(context, {
    topic: "Without replacement",
    prompt:
      `An urn contains ${red} red and ${blue} blue tokens. Two tokens are ` +
      "drawn without replacement. What is the probability both are red?",
    answer: { kind: "fraction", ...result },
    explanation:
      `The probability is ${red}/${total} x ${red - 1}/${total - 1} = ` +
      `${numerator}/${denominator}, which reduces to ${result.display}.`,
  });
}

function expectedValue(context: ProbabilityContext): Question {
  const reward = context.rng.int(2, 12);
  const winningFace = context.rng.int(1, 6);
  const result = reducedFraction(reward, 6);
  const unit = result.numerator === result.denominator ? "point" : "points";

  return buildQuestion(context, {
    topic: "Expected value",
    prompt:
      `A fair six-sided die pays ${reward} points when it shows ` +
      `${winningFace} and 0 points otherwise. What is the expected payout?`,
    answer: { kind: "fraction", ...result },
    explanation:
      `The expected payout is ${reward} x 1/6 + 0 x 5/6 = ` +
      `${result.display} ${unit}.`,
  });
}

function conditionalCards(context: ProbabilityContext): Question {
  const suit = context.rng.pick(SUITS);

  return buildQuestion(context, {
    topic: "Conditional probability",
    prompt:
      "Given that the first card drawn from a standard deck is a " +
      `${suit.singular}, what is the probability the second card is also a ` +
      `${suit.singular}? The cards are drawn without replacement.`,
    answer: fractionAnswer(12, 51),
    explanation:
      `After one ${suit.singular} is drawn, 12 ${suit.plural} remain among ` +
      "51 cards, so the probability is 12/51 = 4/17.",
  });
}

function multiStageCounting(context: ProbabilityContext): Question {
  const people = context.rng.int(5, 7);
  const remaining = people - 2;
  const presenterGroups = combination(remaining, 2);
  const result = people * (people - 1) * presenterGroups;

  return buildQuestion(context, {
    topic: "Multi-stage counting",
    prompt:
      `From a team of ${people} people, choose a captain, then a deputy, ` +
      "then 2 of the remaining people as presenters. How many outcomes are " +
      "possible?",
    answer: numberAnswer(result),
    explanation:
      `Choose the captain in ${people} ways, the deputy in ${people - 1} ` +
      `ways, and 2 of the remaining ${remaining} people: ${people} x ` +
      `${people - 1} x C(${remaining}, 2) = ${result}.`,
  });
}

function bayes(context: ProbabilityContext): Question {
  const scenario = context.rng.pick(BAYES_SCENARIOS);
  const aTotal = scenario.aRed + scenario.aBlue;
  const bTotal = scenario.bRed + scenario.bBlue;
  const correct = reducedFraction(
    scenario.aRed * bTotal,
    scenario.aRed * bTotal + scenario.bRed * aTotal,
  );
  const complement = reducedFraction(
    correct.denominator - correct.numerator,
    correct.denominator,
  );
  const likelihoodA = reducedFraction(scenario.aRed, aTotal);
  const equalPrior = reducedFraction(1, 2);
  const answerId = `probability-${context.index}-choice-1`;
  const choices = context.rng.shuffle([
    { id: answerId, label: correct.display },
    {
      id: `probability-${context.index}-choice-2`,
      label: complement.display,
    },
    {
      id: `probability-${context.index}-choice-3`,
      label: likelihoodA.display,
    },
    {
      id: `probability-${context.index}-choice-4`,
      label: equalPrior.display,
    },
  ]);

  return buildQuestion(context, {
    topic: "Bayes theorem",
    prompt:
      "One of two bags is chosen with equal probability. Bag A has " +
      `${tokenPhrase(scenario.aRed, "red")} and ` +
      `${tokenPhrase(scenario.aBlue, "blue")}; Bag B has ` +
      `${tokenPhrase(scenario.bRed, "red")} and ` +
      `${tokenPhrase(scenario.bBlue, "blue")}. A red token is drawn. ` +
      "What is the probability it came from Bag A?",
    answer: { kind: "choice", value: answerId, display: correct.display },
    explanation:
      "With equal priors, compare the red likelihoods: " +
      `(${likelihoodA.display}) / (${likelihoodA.display} + ` +
      `${reducedFraction(scenario.bRed, bTotal).display}) = ` +
      `${correct.display}.`,
    choices,
  });
}

function mixedCountingProbability(context: ProbabilityContext): Question {
  const red = context.rng.int(3, 5);
  const blue = context.rng.int(3, 5);
  const total = red + blue;
  const redPairs = combination(red, 2);
  const blueSingles = combination(blue, 1);
  const favorable = redPairs * blueSingles;
  const possible = combination(total, 3);
  const result = reducedFraction(favorable, possible);

  return buildQuestion(context, {
    topic: "Mixed counting probability",
    prompt:
      `A box contains ${red} red and ${blue} blue cards. Three cards are ` +
      "chosen at once. What is the probability exactly two are red?",
    answer: { kind: "fraction", ...result },
    explanation:
      `There are C(${red}, 2) x C(${blue}, 1) = ${favorable} favorable ` +
      `hands and C(${total}, 3) = ${possible} total hands, so ` +
      `${favorable}/${possible} = ${result.display}.`,
  });
}

const TEMPLATES: ReadonlyArray<ProbabilityTemplate> = [
  { minimumDifficulty: 1, build: singleDie },
  { minimumDifficulty: 1, build: complementCards },
  { minimumDifficulty: 1, build: permutations },
  { minimumDifficulty: 3, build: independentEvents },
  { minimumDifficulty: 3, build: combinations },
  { minimumDifficulty: 5, build: withoutReplacement },
  { minimumDifficulty: 5, build: expectedValue },
  { minimumDifficulty: 7, build: conditionalCards },
  { minimumDifficulty: 7, build: multiStageCounting },
  { minimumDifficulty: 9, build: bayes },
  { minimumDifficulty: 9, build: mixedCountingProbability },
];

function clampDifficulty(difficulty: number): number {
  const comparableDifficulty = Number.isNaN(difficulty) ? 1 : difficulty;
  return Math.min(10, Math.max(1, comparableDifficulty));
}

export function generateProbability(
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
