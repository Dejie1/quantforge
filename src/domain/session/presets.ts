import type { SessionConfig } from "./types";

export type PresetId =
  | "mental-2m"
  | "mental-5m"
  | "mental-8m"
  | "probability-10"
  | "probability-20"
  | "sequences-estimation-10"
  | "sequences-estimation-20"
  | "speed-arithmetic"
  | "mixed-quant";

const PRACTICE_DEFAULTS = {
  startingDifficulty: 3,
  adaptive: true,
  feedback: "immediate" as const,
  allowPause: true,
  allowSkip: true,
  allowNavigation: false,
};

const MOCK_DEFAULTS = {
  adaptive: false,
  feedback: "deferred" as const,
  allowPause: false,
  allowSkip: false,
};

const PRESETS: Record<PresetId, SessionConfig> = {
  "mental-2m": {
    presetId: "mental-2m",
    mode: "mental-math",
    questionCount: 20,
    durationMs: 2 * 60 * 1_000,
    categories: ["arithmetic"],
    ...PRACTICE_DEFAULTS,
  },
  "mental-5m": {
    presetId: "mental-5m",
    mode: "mental-math",
    questionCount: 50,
    durationMs: 5 * 60 * 1_000,
    categories: ["arithmetic"],
    ...PRACTICE_DEFAULTS,
  },
  "mental-8m": {
    presetId: "mental-8m",
    mode: "mental-math",
    questionCount: 80,
    durationMs: 8 * 60 * 1_000,
    categories: ["arithmetic"],
    ...PRACTICE_DEFAULTS,
  },
  "probability-10": {
    presetId: "probability-10",
    mode: "probability",
    questionCount: 10,
    durationMs: null,
    categories: ["probability"],
    ...PRACTICE_DEFAULTS,
  },
  "probability-20": {
    presetId: "probability-20",
    mode: "probability",
    questionCount: 20,
    durationMs: null,
    categories: ["probability"],
    ...PRACTICE_DEFAULTS,
  },
  "sequences-estimation-10": {
    presetId: "sequences-estimation-10",
    mode: "sequences-estimation",
    questionCount: 10,
    durationMs: null,
    categories: ["sequences", "estimation"],
    ...PRACTICE_DEFAULTS,
  },
  "sequences-estimation-20": {
    presetId: "sequences-estimation-20",
    mode: "sequences-estimation",
    questionCount: 20,
    durationMs: null,
    categories: ["sequences", "estimation"],
    ...PRACTICE_DEFAULTS,
  },
  "speed-arithmetic": {
    presetId: "speed-arithmetic",
    mode: "mock",
    questionCount: 80,
    durationMs: 8 * 60 * 1_000,
    categories: ["arithmetic"],
    startingDifficulty: 3,
    allowNavigation: false,
    ...MOCK_DEFAULTS,
  },
  "mixed-quant": {
    presetId: "mixed-quant",
    mode: "mock",
    questionCount: 30,
    durationMs: 20 * 60 * 1_000,
    categories: ["arithmetic", "probability", "sequences", "estimation"],
    startingDifficulty: 5,
    allowNavigation: true,
    ...MOCK_DEFAULTS,
  },
};

export function getPreset(presetId: PresetId | string): SessionConfig {
  if (!Object.hasOwn(PRESETS, presetId)) {
    throw new RangeError(`Unknown session preset: ${presetId}`);
  }

  const preset = PRESETS[presetId as PresetId];

  return {
    ...preset,
    categories: [...preset.categories],
  };
}
