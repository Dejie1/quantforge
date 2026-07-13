import { isSubmittableAnswer, validateAnswer } from "./answers";
import type { AnswerSpec } from "./questions/types";

function numberAnswer(value: number): AnswerSpec {
  return { kind: "number", value, display: String(value) };
}

function fractionAnswer(numerator: number, denominator: number): AnswerSpec {
  return {
    kind: "fraction",
    numerator,
    denominator,
    display: `${numerator}/${denominator}`,
  };
}

function estimateAnswer(value: number, toleranceRatio: number): AnswerSpec {
  return {
    kind: "estimate",
    value,
    toleranceRatio,
    display: String(value),
  };
}

describe("validateAnswer", () => {
  describe("exact numbers", () => {
    it("parses signed integers and decimals after trimming outer whitespace", () => {
      expect(validateAnswer("  -12  ", numberAnswer(-12))).toEqual({
        status: "valid",
        correct: true,
        normalized: "-12",
      });
      expect(validateAnswer(" +000.375 ", numberAnswer(0.375))).toEqual({
        status: "valid",
        correct: true,
        normalized: "0.375",
      });
    });

    it("uses an absolute epsilon of 1e-9", () => {
      expect(validateAnswer("0.000000001", numberAnswer(0))).toMatchObject({
        status: "valid",
        correct: true,
      });
      expect(validateAnswer("0.0000000011", numberAnswer(0))).toMatchObject({
        status: "valid",
        correct: false,
      });
    });

    it("returns a normalized value for a well-formed wrong answer", () => {
      expect(validateAnswer(" 009.50 ", numberAnswer(10))).toEqual({
        status: "valid",
        correct: false,
        normalized: "9.5",
      });
    });

    it.each([
      "",
      "   ",
      "1 + 2",
      "1,5",
      "3/8",
      "Infinity",
      "NaN",
      "1e309",
      "9".repeat(400),
    ])("rejects malformed or non-finite numeric input %j", (input) => {
      expect(validateAnswer(input, numberAnswer(3))).toEqual({
        status: "invalid",
        message: "Enter a number",
      });
    });
  });

  describe("fractions", () => {
    it("treats signed integer input as a denominator-one fraction", () => {
      expect(validateAnswer("1", fractionAnswer(1, 1))).toEqual({
        status: "valid",
        correct: true,
        normalized: "1/1",
      });
      expect(validateAnswer(" -2 ", fractionAnswer(-4, 2))).toEqual({
        status: "valid",
        correct: true,
        normalized: "-2/1",
      });
      expect(validateAnswer("+3", fractionAnswer(3, 8))).toEqual({
        status: "valid",
        correct: false,
        normalized: "3/1",
      });
    });

    it("reduces equivalent fractions and normalizes their signs", () => {
      expect(validateAnswer("  6/16  ", fractionAnswer(3, 8))).toEqual({
        status: "valid",
        correct: true,
        normalized: "3/8",
      });
      expect(validateAnswer("-6/-16", fractionAnswer(3, 8))).toEqual({
        status: "valid",
        correct: true,
        normalized: "3/8",
      });
      expect(validateAnswer("3/-8", fractionAnswer(-6, 16))).toEqual({
        status: "valid",
        correct: true,
        normalized: "-3/8",
      });
      expect(validateAnswer("0/-50", fractionAnswer(0, 7))).toEqual({
        status: "valid",
        correct: true,
        normalized: "0/1",
      });
    });

    it("returns a canonical value for a well-formed wrong fraction", () => {
      expect(validateAnswer(" 4/14 ", fractionAnswer(3, 8))).toEqual({
        status: "valid",
        correct: false,
        normalized: "2/7",
      });
    });

    it("rejects a zero denominator with a specific message", () => {
      expect(validateAnswer("3/0", fractionAnswer(3, 8))).toEqual({
        status: "invalid",
        message: "The denominator cannot be zero",
      });
      expect(validateAnswer("3/-0", fractionAnswer(3, 8))).toEqual({
        status: "invalid",
        message: "The denominator cannot be zero",
      });
    });

    it("rejects fraction components outside the safe-integer range", () => {
      const message = "Use whole numbers up to 9,007,199,254,740,991";

      expect(
        validateAnswer(
          "9007199254740993/9007199254740992",
          fractionAnswer(1, 1),
        ),
      ).toEqual({ status: "invalid", message });
      expect(
        validateAnswer("1/9007199254740992", fractionAnswer(1, 1)),
      ).toEqual({ status: "invalid", message });
      expect(
        validateAnswer("9007199254740992/1", fractionAnswer(1, 1)),
      ).toEqual({ status: "invalid", message });
      expect(
        validateAnswer(
          "9007199254740991/1",
          fractionAnswer(Number.MAX_SAFE_INTEGER, 1),
        ),
      ).toEqual({
        status: "valid",
        correct: true,
        normalized: "9007199254740991/1",
      });
    });

    it.each([
      "",
      "3/",
      "/8",
      "3//8",
      "3/8/2",
      "1 + 2/8",
      "1.5/4",
      "1/2.5",
      "1 / 2",
      "1,5/4",
      `${"9".repeat(400)}/1`,
    ])("rejects malformed fraction input %j", (input) => {
      expect(validateAnswer(input, fractionAnswer(3, 8))).toEqual({
        status: "invalid",
        message: "Use one fraction bar, like 3/8",
      });
    });
  });

  describe("estimates", () => {
    it("accepts the non-zero relative tolerance boundary", () => {
      expect(validateAnswer("210", estimateAnswer(200, 0.05))).toEqual({
        status: "valid",
        correct: true,
        normalized: "210",
      });
      expect(validateAnswer("210.0001", estimateAnswer(200, 0.05))).toEqual({
        status: "valid",
        correct: false,
        normalized: "210.0001",
      });
    });

    it("uses absolute error for a zero target and includes Number.EPSILON", () => {
      const boundary = String(0.5 + Number.EPSILON);
      const outside = String(0.5 + Number.EPSILON * 2);

      expect(validateAnswer(boundary, estimateAnswer(0, 0.5))).toMatchObject({
        status: "valid",
        correct: true,
      });
      expect(validateAnswer(outside, estimateAnswer(0, 0.5))).toMatchObject({
        status: "valid",
        correct: false,
      });
    });

    it("rejects malformed estimates with the numeric input message", () => {
      expect(validateAnswer("50%", estimateAnswer(50, 0.1))).toEqual({
        status: "invalid",
        message: "Enter a number",
      });
    });
  });

  describe("choices", () => {
    const choice: AnswerSpec = {
      kind: "choice",
      value: "choice-b",
      display: "Choice B",
    };

    it("trims choice IDs and compares them exactly", () => {
      expect(validateAnswer("  choice-b  ", choice)).toEqual({
        status: "valid",
        correct: true,
        normalized: "choice-b",
      });
      expect(validateAnswer(" choice-a ", choice)).toEqual({
        status: "valid",
        correct: false,
        normalized: "choice-a",
      });
    });

    it("rejects an empty choice ID", () => {
      expect(validateAnswer("   ", choice)).toEqual({
        status: "invalid",
        message: "Choose an answer",
      });
    });
  });
});

describe("isSubmittableAnswer", () => {
  it("allows every well-formed answer, including incorrect ones", () => {
    expect(isSubmittableAnswer("9", numberAnswer(10))).toBe(true);
    expect(isSubmittableAnswer("4/14", fractionAnswer(3, 8))).toBe(true);
    expect(
      isSubmittableAnswer("choice-a", {
        kind: "choice",
        value: "choice-b",
        display: "Choice B",
      }),
    ).toBe(true);
  });

  it("rejects incomplete or malformed input", () => {
    expect(isSubmittableAnswer("1 + 2", numberAnswer(3))).toBe(false);
    expect(isSubmittableAnswer("3/", fractionAnswer(3, 8))).toBe(false);
    expect(
      isSubmittableAnswer("   ", {
        kind: "choice",
        value: "choice-b",
        display: "Choice B",
      }),
    ).toBe(false);
  });
});
