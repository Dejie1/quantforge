import { useContext } from "react";
import type { SessionResult, SessionState, SessionConfig } from "../../domain/session/types";
import type { ProgressDataV1 } from "../../lib/progress-schema";
import { TrainerContext } from "./TrainerContext";

export interface TrainerController {
  progress: ProgressDataV1;
  session: SessionState | null;
  result: SessionResult | null;
  input: string;
  inputError: string | null;
  storageWarning: boolean;
  createSession(config: SessionConfig): void;
  startSession(): void;
  setInput(value: string): void;
  submitAnswer(): void;
  skipQuestion(): void;
  navigateQuestion(index: number): void;
  pauseSession(): void;
  resumeSession(): void;
  finishSession(): void;
  abandonSession(): void;
  clearResult(): void;
  updatePreferences(patch: Partial<ProgressDataV1["preferences"]>): void;
  resetProgress(): void;
  dismissStorageWarning(): void;
}

export function useTrainer(): TrainerController {
  const controller = useContext(TrainerContext);

  if (controller === null) {
    throw new Error("useTrainer must be used within a TrainerProvider");
  }

  return controller;
}

export { TrainerProvider } from "./TrainerContext";
export type { TrainerProviderProps } from "./TrainerContext";
