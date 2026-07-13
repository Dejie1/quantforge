import { sessionReducer } from "../domain/session/session";
import {
  createDefaultProgress,
  parseProgress,
  type ProgressDataV1,
} from "./progress-schema";

export const PROGRESS_STORAGE_KEY = "quantforge.progress.v1";

export type ProgressStoreResult =
  | { ok: true }
  | { ok: false; reason: "unavailable" };

export interface ProgressStore {
  load(nowMs?: number): ProgressDataV1;
  save(data: ProgressDataV1): ProgressStoreResult;
  reset(): ProgressStoreResult;
}

function capRecentSessions(data: ProgressDataV1): ProgressDataV1 {
  return {
    ...data,
    recentSessions: [...data.recentSessions]
      .sort((left, right) => right.completedAtMs - left.completedAtMs)
      .slice(0, 50),
  };
}

export function createProgressStore(storage: Storage): ProgressStore {
  return {
    load(nowMs = Date.now()): ProgressDataV1 {
      try {
        const stored = storage.getItem(PROGRESS_STORAGE_KEY);
        if (stored === null) {
          return createDefaultProgress();
        }

        const progress = parseProgress(JSON.parse(stored));
        const activeSession = progress.activeSession;

        if (
          activeSession?.phase === "active" &&
          activeSession.deadlineMs !== null &&
          nowMs >= activeSession.deadlineMs
        ) {
          return {
            ...progress,
            activeSession: sessionReducer(activeSession, {
              type: "expire",
              nowMs,
            }),
          };
        }

        return progress;
      } catch {
        return createDefaultProgress();
      }
    },

    save(data: ProgressDataV1): ProgressStoreResult {
      try {
        const reconstructed = capRecentSessions(parseProgress(data));
        storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(reconstructed));
        return { ok: true };
      } catch {
        return { ok: false, reason: "unavailable" };
      }
    },

    reset(): ProgressStoreResult {
      try {
        storage.removeItem(PROGRESS_STORAGE_KEY);
        return { ok: true };
      } catch {
        return { ok: false, reason: "unavailable" };
      }
    },
  };
}
