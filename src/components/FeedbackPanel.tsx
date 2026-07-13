import { CheckCircle2, MinusCircle, XCircle } from "lucide-react";
import type { Question } from "../domain/questions/types";
import type { SessionAnswer } from "../domain/session/types";

export interface FeedbackPanelProps {
  answer: SessionAnswer;
  question: Question;
}

export function FeedbackPanel({ answer, question }: FeedbackPanelProps) {
  const isCorrect = answer.outcome === "correct";
  const isSkipped = answer.outcome === "skipped";
  const label = isSkipped ? "Skipped" : isCorrect ? "Correct" : "Incorrect";
  const Icon = isSkipped ? MinusCircle : isCorrect ? CheckCircle2 : XCircle;

  return (
    <section
      className={`feedback-panel feedback-panel--${answer.outcome}`}
    >
      <div
        className="feedback-panel__label"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <Icon aria-hidden="true" size={22} strokeWidth={1.9} />
        <strong>{label}</strong>
      </div>
      <p>{question.explanation}</p>
    </section>
  );
}
