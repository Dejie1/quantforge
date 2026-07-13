import { forwardRef, type FormEvent } from "react";
import type { Question } from "../domain/questions/types";

export interface AnswerInputProps {
  error: string | null;
  input: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  question: Question;
  submitLabel: string;
}

export const AnswerInput = forwardRef<HTMLInputElement, AnswerInputProps>(
  function AnswerInput(
    { error, input, onChange, onSubmit, question, submitLabel },
    forwardedRef,
  ) {
    const errorId = `answer-error-${question.id}`;
    const labelId = `answer-label-${question.id}`;
    const isChoice = question.answer.kind === "choice";
    const choices = question.choices ?? [];

    const submit = (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      onSubmit();
    };

    return (
      <form className="answer-form" onSubmit={submit} noValidate>
        {isChoice ? (
          <div
            className="choice-field"
            role="radiogroup"
            aria-labelledby={labelId}
            aria-describedby={error === null ? undefined : errorId}
            aria-invalid={error === null ? undefined : "true"}
          >
            <span className="answer-label" id={labelId}>
              Your answer
            </span>
            <div className="choice-options">
              {choices.map((choice, index) => (
                <label className="choice-option" key={choice.id}>
                  <input
                    ref={index === 0 ? forwardedRef : undefined}
                    type="radio"
                    name={`answer-${question.id}`}
                    value={choice.id}
                    checked={input === choice.id}
                    aria-describedby={error === null ? undefined : errorId}
                    onChange={(event) => onChange(event.currentTarget.value)}
                  />
                  <span>{choice.label}</span>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <label className="numeric-answer">
            <span className="answer-label">Your answer</span>
            <input
              ref={forwardedRef}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              value={input}
              aria-invalid={error === null ? undefined : "true"}
              aria-describedby={error === null ? undefined : errorId}
              onChange={(event) => onChange(event.currentTarget.value)}
            />
          </label>
        )}

        {error === null ? null : (
          <p className="answer-error" id={errorId} role="alert">
            {error}
          </p>
        )}

        <button
          className="button button--primary answer-submit"
          type="submit"
          disabled={input.trim().length === 0}
        >
          {submitLabel}
        </button>
      </form>
    );
  },
);
