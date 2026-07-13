import { getPreset } from "./presets";

describe("session presets", () => {
  it.each([
    ["mental-2m", 20, 2 * 60 * 1_000],
    ["mental-5m", 50, 5 * 60 * 1_000],
    ["mental-8m", 80, 8 * 60 * 1_000],
  ] as const)(
    "defines %s as timed arithmetic practice",
    (presetId, questionCount, durationMs) => {
      expect(getPreset(presetId)).toMatchObject({
        presetId,
        mode: "mental-math",
        questionCount,
        durationMs,
        categories: ["arithmetic"],
        adaptive: true,
        feedback: "immediate",
        allowPause: true,
        allowSkip: true,
        allowNavigation: false,
      });
    },
  );

  it.each([
    ["probability-10", 10],
    ["probability-20", 20],
  ] as const)("defines %s as untimed probability practice", (presetId, count) => {
    expect(getPreset(presetId)).toMatchObject({
      presetId,
      mode: "probability",
      questionCount: count,
      durationMs: null,
      categories: ["probability"],
      adaptive: true,
      feedback: "immediate",
      allowPause: true,
      allowSkip: true,
      allowNavigation: false,
    });
  });

  it.each([
    ["sequences-estimation-10", 10],
    ["sequences-estimation-20", 20],
  ] as const)(
    "defines %s as evenly composed untimed practice",
    (presetId, count) => {
      expect(getPreset(presetId)).toMatchObject({
        presetId,
        mode: "sequences-estimation",
        questionCount: count,
        durationMs: null,
        categories: ["sequences", "estimation"],
        adaptive: true,
        feedback: "immediate",
        allowPause: true,
        allowSkip: true,
        allowNavigation: false,
      });
    },
  );

  it("defines the fixed Speed Arithmetic mock", () => {
    expect(getPreset("speed-arithmetic")).toMatchObject({
      presetId: "speed-arithmetic",
      mode: "mock",
      questionCount: 80,
      durationMs: 8 * 60 * 1_000,
      categories: ["arithmetic"],
      adaptive: false,
      feedback: "deferred",
      allowPause: false,
      allowSkip: false,
      allowNavigation: false,
    });
  });

  it("defines the fixed Mixed Quant mock", () => {
    expect(getPreset("mixed-quant")).toMatchObject({
      presetId: "mixed-quant",
      mode: "mock",
      questionCount: 30,
      durationMs: 20 * 60 * 1_000,
      categories: ["arithmetic", "probability", "sequences", "estimation"],
      adaptive: false,
      feedback: "deferred",
      allowPause: false,
      allowSkip: false,
      allowNavigation: true,
    });
  });

  it("returns fresh preset data that callers cannot mutate globally", () => {
    const first = getPreset("mixed-quant");
    first.questionCount = 1;
    first.categories.push("arithmetic");

    const second = getPreset("mixed-quant");
    expect(second.questionCount).toBe(30);
    expect(second.categories).toEqual([
      "arithmetic",
      "probability",
      "sequences",
      "estimation",
    ]);
    expect(second).not.toBe(first);
    expect(second.categories).not.toBe(first.categories);
  });
});
