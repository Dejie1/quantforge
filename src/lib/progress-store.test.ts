import { getPreset } from "../domain/session/presets";
import { createSession, sessionReducer } from "../domain/session/session";
import type { SessionState } from "../domain/session/types";
import {
  createDefaultProgress,
  type ProgressDataV1,
  type SessionSummary,
} from "./progress-schema";
import {
  createProgressStore,
  PROGRESS_STORAGE_KEY,
} from "./progress-store";

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();
  failGet = false;
  failSet = false;
  failRemove = false;

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    if (this.failGet) {
      throw new DOMException("Storage unavailable", "SecurityError");
    }

    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    if (this.failRemove) {
      throw new DOMException("Storage unavailable", "SecurityError");
    }

    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    if (this.failSet) {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    }

    this.values.set(key, value);
  }
}

function progressWithSession(activeSession: SessionState): ProgressDataV1 {
  return { ...createDefaultProgress(), activeSession };
}

function summary(index: number): SessionSummary {
  return {
    id: `session-${index}`,
    presetId: "probability-10",
    completedAtMs: index * 1_000,
    correct: 8,
    total: 10,
    accuracy: 0.8,
    medianResponseTimeMs: 2_000,
  };
}

describe("createProgressStore", () => {
  it("uses the versioned application key and returns fresh defaults when missing", () => {
    const storage = new MemoryStorage();
    const store = createProgressStore(storage);

    const first = store.load();
    first.preferences.theme = "light";
    const second = store.load();

    expect(PROGRESS_STORAGE_KEY).toBe("quantforge.progress.v1");
    expect(second).toEqual(createDefaultProgress());
    expect(second.preferences).not.toBe(first.preferences);
  });

  it("round-trips a reconstructed valid value without retaining caller references", () => {
    const storage = new MemoryStorage();
    const store = createProgressStore(storage);
    const progress = createDefaultProgress();
    progress.preferences.theme = "light";
    progress.difficulty.estimation = 8;
    progress.dailyActivity.today = {
      questions: 4,
      correct: 3,
      milliseconds: 9_000,
    };
    progress.recentSessions = [summary(1)];

    expect(store.save(progress)).toEqual({ ok: true });
    progress.preferences.theme = "dark";
    progress.dailyActivity.today.questions = 99;

    expect(store.load()).toMatchObject({
      preferences: { theme: "light" },
      difficulty: { estimation: 8 },
      dailyActivity: { today: { questions: 4 } },
      recentSessions: [{ id: "session-1" }],
    });
  });

  it("falls back safely for malformed JSON, wrong versions, and read errors", () => {
    const storage = new MemoryStorage();
    const store = createProgressStore(storage);

    storage.values.set(PROGRESS_STORAGE_KEY, "{not-json");
    expect(store.load()).toEqual(createDefaultProgress());

    storage.values.set(
      PROGRESS_STORAGE_KEY,
      JSON.stringify({ ...createDefaultProgress(), version: 2 }),
    );
    expect(store.load()).toEqual(createDefaultProgress());

    storage.failGet = true;
    expect(store.load()).toEqual(createDefaultProgress());
  });

  it("reports quota or unavailable writes without throwing", () => {
    const storage = new MemoryStorage();
    storage.failSet = true;

    expect(createProgressStore(storage).save(createDefaultProgress())).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("persists only the 50 summaries with the latest completion times", () => {
    const storage = new MemoryStorage();
    const store = createProgressStore(storage);
    const progress = createDefaultProgress();
    progress.recentSessions = Array.from({ length: 55 }, (_, index) =>
      summary(index),
    ).reverse();

    expect(store.save(progress)).toEqual({ ok: true });

    const recentSessions = store.load().recentSessions;
    expect(recentSessions).toHaveLength(50);
    expect(recentSessions.map(({ id }) => id)).toEqual(
      Array.from({ length: 50 }, (_, index) => `session-${54 - index}`),
    );
    expect(recentSessions).not.toBe(progress.recentSessions);
  });

  it("normalizes unsorted 51+ item history when loading untrusted storage", () => {
    const storage = new MemoryStorage();
    const progress = createDefaultProgress();
    progress.recentSessions = Array.from({ length: 55 }, (_, index) =>
      summary((index * 17) % 55),
    );
    storage.values.set(PROGRESS_STORAGE_KEY, JSON.stringify(progress));

    const recentSessions = createProgressStore(storage).load().recentSessions;

    expect(recentSessions).toHaveLength(50);
    expect(recentSessions.map(({ id }) => id)).toEqual(
      Array.from({ length: 50 }, (_, index) => `session-${54 - index}`),
    );
  });

  it("resets stored progress and reports remove failures", () => {
    const storage = new MemoryStorage();
    const store = createProgressStore(storage);
    expect(store.save(createDefaultProgress())).toEqual({ ok: true });

    expect(store.reset()).toEqual({ ok: true });
    expect(storage.getItem(PROGRESS_STORAGE_KEY)).toBeNull();

    storage.failRemove = true;
    expect(store.reset()).toEqual({ ok: false, reason: "unavailable" });
  });

  it("finalizes an expired active timed session at its original deadline", () => {
    const storage = new MemoryStorage();
    const store = createProgressStore(storage);
    const active = sessionReducer(
      createSession(getPreset("mental-2m"), 123),
      { type: "start", nowMs: 1_000 },
    );
    const deadlineMs = active.deadlineMs!;
    storage.values.set(
      PROGRESS_STORAGE_KEY,
      JSON.stringify(progressWithSession(active)),
    );

    const restored = store.load(deadlineMs + 50_000).activeSession;

    expect(restored).toMatchObject({
      id: active.id,
      phase: "completed",
      deadlineMs,
      completedAtMs: deadlineMs,
      pausedAtMs: null,
      answers: {},
    });
    expect(restored!.questions).toEqual(active.questions);
    expect(restored!.questions).not.toBe(active.questions);
  });

  it("restores a timed session as active immediately before its deadline", () => {
    const storage = new MemoryStorage();
    const store = createProgressStore(storage);
    const active = sessionReducer(
      createSession(getPreset("mental-2m"), 124),
      { type: "start", nowMs: 1_000 },
    );
    storage.values.set(
      PROGRESS_STORAGE_KEY,
      JSON.stringify(progressWithSession(active)),
    );

    expect(store.load(active.deadlineMs! - 1).activeSession).toEqual(active);
  });

  it("finalizes a timed session exactly at its original deadline", () => {
    const storage = new MemoryStorage();
    const store = createProgressStore(storage);
    const active = sessionReducer(
      createSession(getPreset("mental-2m"), 125),
      { type: "start", nowMs: 1_000 },
    );
    storage.values.set(
      PROGRESS_STORAGE_KEY,
      JSON.stringify(progressWithSession(active)),
    );

    expect(store.load(active.deadlineMs!).activeSession).toMatchObject({
      phase: "completed",
      deadlineMs: active.deadlineMs,
      completedAtMs: active.deadlineMs,
    });
  });

  it("restores active untimed sessions unchanged", () => {
    const storage = new MemoryStorage();
    const store = createProgressStore(storage);
    const active = sessionReducer(
      createSession(getPreset("probability-10"), 456),
      { type: "start", nowMs: 1_000 },
    );
    storage.values.set(
      PROGRESS_STORAGE_KEY,
      JSON.stringify(progressWithSession(active)),
    );

    const restored = store.load(999_999_999).activeSession;

    expect(restored).toEqual(active);
    expect(restored).not.toBe(active);
    expect(restored!.config).not.toBe(active.config);
    expect(restored!.questions).not.toBe(active.questions);
  });

  it("does not expire paused timed practice while it is legitimately paused", () => {
    const storage = new MemoryStorage();
    const store = createProgressStore(storage);
    const active = sessionReducer(
      createSession(getPreset("mental-2m"), 789),
      { type: "start", nowMs: 1_000 },
    );
    const paused = sessionReducer(active, { type: "pause", nowMs: 11_000 });
    storage.values.set(
      PROGRESS_STORAGE_KEY,
      JSON.stringify(progressWithSession(paused)),
    );

    expect(store.load(999_999_999).activeSession).toEqual(paused);
  });
});
