import { createRng } from "../random";
import { generateQuestion } from "./generate";
import type { GeneratorFactories } from "./generate";
import type { GenerateRequest, Question } from "./types";

function validSequenceQuestion(difficulty: number, index: number): Question {
  return {
    id: `sequences-${index}`,
    category: "sequences",
    topic: "Injected sequence",
    difficulty,
    prompt: "Find the next term: 1, 2, 3, 4, 5, ?",
    answer: { kind: "number", value: 6, display: "6" },
    explanation: "Arithmetic rule: add one each time, so the answer is 6.",
    targetTimeMs: 10_000,
  };
}

function expectFallback(
  question: Question,
  index: number,
  difficulty: number,
): void {
  expect(question).toEqual({
    id: `fallback-${index}`,
    category: "arithmetic",
    topic: "Addition",
    difficulty,
    prompt: "12 + 19 = ?",
    answer: { kind: "number", value: 31, display: "31" },
    explanation: "Add the two operands: 12 + 19 = 31.",
    targetTimeMs: 8_000 + difficulty * 2_000,
  });
}

function withUnsafeAnswer(
  question: Question,
  answer: unknown,
  choices?: Question["choices"],
): Question {
  return {
    ...question,
    answer,
    ...(choices === undefined ? {} : { choices }),
  } as unknown as Question;
}

describe("generateQuestion", () => {
  it("is deterministic and preserves the successful category-index id", () => {
    const request = {
      seed: 73_021,
      index: 4,
      category: "sequences" as const,
      difficulty: 7,
    };

    expect(generateQuestion(request)).toEqual(generateQuestion(request));
    expect(generateQuestion(request).id).toBe("sequences-4");
  });

  it("calls only the requested category factory", () => {
    let selectedCalls = 0;
    let unexpectedCalls = 0;
    const unexpected = (): Question => {
      unexpectedCalls += 1;
      throw new Error("Unexpected category factory call");
    };
    const factories: GeneratorFactories = {
      arithmetic: unexpected,
      probability: unexpected,
      estimation: unexpected,
      sequences: (_rng, difficulty, index) => {
        selectedCalls += 1;
        return validSequenceQuestion(difficulty, index);
      },
    };

    const result = generateQuestion(
      { seed: 41, index: 9, category: "sequences", difficulty: 5 },
      factories,
    );

    expect(result.id).toBe("sequences-9");
    expect(selectedCalls).toBe(1);
    expect(unexpectedCalls).toBe(0);
  });

  it("uses an initial attempt plus three deterministic retries before falling back", () => {
    const request: GenerateRequest = {
      seed: 12_345,
      index: 7,
      category: "sequences",
      difficulty: 7,
    };
    const observedValues: number[] = [];
    const factories: GeneratorFactories = {
      sequences: (rng) => {
        observedValues.push(rng.next());
        throw new Error("Injected failure");
      },
    };

    const question = generateQuestion(request, factories);
    const baseSeed = request.seed + request.index * 2_654_435_761;
    const expectedValues = [0, 1, 2, 3].map((offset) =>
      createRng(baseSeed + offset).next(),
    );

    expect(observedValues).toEqual(expectedValues);
    expectFallback(question, request.index, request.difficulty);
  });

  it("retries and falls back when a factory returns a non-finite answer", () => {
    let attempts = 0;
    const request: GenerateRequest = {
      seed: 88,
      index: 12,
      category: "sequences",
      difficulty: 4,
    };
    const factories: GeneratorFactories = {
      sequences: (_rng, difficulty, index) => {
        attempts += 1;
        return {
          ...validSequenceQuestion(difficulty, index),
          answer: { kind: "number", value: Number.POSITIVE_INFINITY, display: "Infinity" },
        };
      },
    };

    const question = generateQuestion(request, factories);

    expect(attempts).toBe(4);
    expectFallback(question, request.index, request.difficulty);
  });

  it("rejects a fraction whose finite fields produce a non-finite value", () => {
    let attempts = 0;
    const request: GenerateRequest = {
      seed: 89,
      index: 13,
      category: "sequences",
      difficulty: 4,
    };
    const factories: GeneratorFactories = {
      sequences: (_rng, difficulty, index) => {
        attempts += 1;
        return {
          ...validSequenceQuestion(difficulty, index),
          answer: {
            kind: "fraction",
            numerator: Number.MAX_VALUE,
            denominator: Number.MIN_VALUE,
            display: "overflow",
          },
        };
      },
    };

    const question = generateQuestion(request, factories);

    expect(attempts).toBe(4);
    expectFallback(question, request.index, request.difficulty);
  });

  it("rejects an unknown answer kind instead of treating it as a choice", () => {
    let attempts = 0;
    const request: GenerateRequest = {
      seed: 90,
      index: 15,
      category: "sequences",
      difficulty: 4,
    };
    const factories: GeneratorFactories = {
      sequences: (_rng, difficulty, index) => {
        attempts += 1;
        return withUnsafeAnswer(
          validSequenceQuestion(difficulty, index),
          { kind: "unknown", value: "answer-id", display: "6" },
          [{ id: "answer-id", label: "6" }],
        );
      },
    };

    const question = generateQuestion(request, factories);

    expect(attempts).toBe(4);
    expectFallback(question, request.index, request.difficulty);
  });

  it("rejects missing required fields for every answer kind", () => {
    const invalidAnswers: ReadonlyArray<readonly [string, unknown]> = [
      ["number value", { kind: "number", display: "6" }],
      ["fraction denominator", { kind: "fraction", numerator: 1, display: "1/2" }],
      ["estimate tolerance", { kind: "estimate", value: 6, display: "6" }],
      ["choice value", { kind: "choice", display: "6" }],
    ];

    for (const [label, answer] of invalidAnswers) {
      let attempts = 0;
      const request: GenerateRequest = {
        seed: 91,
        index: 16,
        category: "sequences",
        difficulty: 4,
      };
      const factories: GeneratorFactories = {
        sequences: (_rng, difficulty, index) => {
          attempts += 1;
          return withUnsafeAnswer(
            validSequenceQuestion(difficulty, index),
            answer,
          );
        },
      };

      const question = generateQuestion(request, factories);

      expect(attempts, label).toBe(4);
      expectFallback(question, request.index, request.difficulty);
    }
  });

  it("rejects an empty display for every answer kind", () => {
    const invalidAnswers: ReadonlyArray<
      readonly [string, unknown, Question["choices"]?]
    > = [
      ["number", { kind: "number", value: 6, display: "   " }],
      [
        "fraction",
        { kind: "fraction", numerator: 1, denominator: 2, display: "" },
      ],
      [
        "estimate",
        { kind: "estimate", value: 6, toleranceRatio: 0.1, display: "" },
      ],
      [
        "choice",
        { kind: "choice", value: "answer-id", display: "" },
        [{ id: "answer-id", label: "" }],
      ],
    ];

    for (const [label, answer, choices] of invalidAnswers) {
      let attempts = 0;
      const request: GenerateRequest = {
        seed: 92,
        index: 17,
        category: "sequences",
        difficulty: 4,
      };
      const factories: GeneratorFactories = {
        sequences: (_rng, difficulty, index) => {
          attempts += 1;
          return withUnsafeAnswer(
            validSequenceQuestion(difficulty, index),
            answer,
            choices,
          );
        },
      };

      const question = generateQuestion(request, factories);

      expect(attempts, label).toBe(4);
      expectFallback(question, request.index, request.difficulty);
    }
  });

  it.each([
    ["wrong category", (question: Question) => ({ ...question, category: "arithmetic" as const })],
    ["blank prompt", (question: Question) => ({ ...question, prompt: "   " })],
    ["blank explanation", (question: Question) => ({ ...question, explanation: "" })],
    ["wrong difficulty", (question: Question) => ({ ...question, difficulty: question.difficulty + 1 })],
  ])("rejects a generated question with %s", (_label, makeInvalid) => {
    const request: GenerateRequest = {
      seed: 99,
      index: 14,
      category: "sequences",
      difficulty: 6,
    };
    let attempts = 0;
    const factories: GeneratorFactories = {
      sequences: (_rng, difficulty, index) => {
        attempts += 1;
        return makeInvalid(validSequenceQuestion(difficulty, index));
      },
    };

    const question = generateQuestion(request, factories);

    expect(attempts).toBe(4);
    expectFallback(question, request.index, request.difficulty);
  });

  it("dispatches every production category without falling back", () => {
    const categories = [
      "arithmetic",
      "probability",
      "sequences",
      "estimation",
    ] as const;

    for (const [index, category] of categories.entries()) {
      const question = generateQuestion({
        seed: 54_321,
        index,
        category,
        difficulty: 10,
      });

      expect(question.id).toBe(`${category}-${index}`);
      expect(question.category).toBe(category);
      expect(question.difficulty).toBe(10);
    }
  });
});
