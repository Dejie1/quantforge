export type QuestionCategory =
  | "arithmetic"
  | "probability"
  | "sequences"
  | "estimation";

export type AnswerSpec =
  | { kind: "number"; value: number; display: string }
  | { kind: "fraction"; numerator: number; denominator: number; display: string }
  | { kind: "estimate"; value: number; toleranceRatio: number; display: string }
  | { kind: "choice"; value: string; display: string };

export interface Question {
  id: string;
  category: QuestionCategory;
  topic: string;
  difficulty: number;
  prompt: string;
  answer: AnswerSpec;
  explanation: string;
  targetTimeMs: number;
  choices?: ReadonlyArray<{ id: string; label: string }>;
}

export interface GenerateRequest {
  seed: number;
  index: number;
  category: QuestionCategory;
  difficulty: number;
}
