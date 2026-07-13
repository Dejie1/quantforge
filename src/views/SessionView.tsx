import { ArrowLeft, Pause, Play, Send, SkipForward, Square } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";
import { AnswerInput } from "../components/AnswerInput";
import { Countdown } from "../components/Countdown";
import { FeedbackPanel } from "../components/FeedbackPanel";
import { QuestionNavigator } from "../components/QuestionNavigator";
import type { Question } from "../domain/questions/types";
import type { SessionAnswer, SessionState } from "../domain/session/types";
import { useTrainer } from "../features/trainer/useTrainer";

export interface SessionViewProps {
  onAdjust: () => void;
  onExit: () => void;
}

interface LatestFeedback {
  answer: SessionAnswer;
  question: Question;
}

function latestFeedback(session: SessionState): LatestFeedback | null {
  let latest: LatestFeedback | null = null;

  for (const question of session.questions) {
    const answer = session.answers[question.id];
    if (
      answer !== undefined &&
      (latest === null || answer.answeredAtMs >= latest.answer.answeredAtMs)
    ) {
      latest = { answer, question };
    }
  }

  return latest;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.matches("input, textarea, select, button") || target.isContentEditable)
  );
}

export function SessionView({ onAdjust, onExit }: SessionViewProps) {
  const {
    abandonSession,
    finishSession,
    input,
    inputError,
    navigateQuestion,
    pauseSession,
    resumeSession,
    session,
    setInput,
    skipQuestion,
    startSession,
    submitAnswer,
  } = useTrainer();
  const answerRef = useRef<HTMLInputElement>(null);
  const endButtonRef = useRef<HTMLButtonElement>(null);
  const keepTrainingRef = useRef<HTMLButtonElement>(null);
  const restoreEndFocusRef = useRef(false);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const keepWorkingRef = useRef<HTMLButtonElement>(null);
  const restoreSubmitFocusRef = useRef(false);
  const [showAbandon, setShowAbandon] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);

  const phase = session?.phase;
  const currentIndex = session?.currentIndex;

  useLayoutEffect(() => {
    if (phase === "active") {
      answerRef.current?.focus();
    }
  }, [currentIndex, phase]);

  useLayoutEffect(() => {
    if (showAbandon) {
      keepTrainingRef.current?.focus();
    } else if (restoreEndFocusRef.current) {
      restoreEndFocusRef.current = false;
      endButtonRef.current?.focus();
    }
  }, [showAbandon]);

  useLayoutEffect(() => {
    if (showSubmit) {
      keepWorkingRef.current?.focus();
    } else if (restoreSubmitFocusRef.current) {
      restoreSubmitFocusRef.current = false;
      submitButtonRef.current?.focus();
    }
  }, [showSubmit]);

  useEffect(() => {
    if (
      session?.phase !== "active" ||
      session.questions[session.currentIndex]?.answer.kind === "choice"
    ) {
      return;
    }

    const focusOnType = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.key.length !== 1 ||
        isEditableTarget(event.target)
      ) {
        return;
      }

      event.preventDefault();
      answerRef.current?.focus();
      setInput(`${input}${event.key}`);
    };

    window.addEventListener("keydown", focusOnType);
    return () => window.removeEventListener("keydown", focusOnType);
  }, [input, session, setInput]);

  if (session === null) {
    return (
      <section className="session-state-card">
        <p className="eyebrow">Training session</p>
        <h1>Session unavailable</h1>
        <p>Return to the dashboard and prepare a new session.</p>
        <button className="button button--primary" type="button" onClick={onExit}>
          Back to dashboard
        </button>
      </section>
    );
  }

  if (session.phase === "ready") {
    const isMock = session.config.feedback === "deferred";
    const estimationTolerances = [
      ...new Set(
        session.questions.flatMap((question) =>
          question.answer.kind === "estimate"
            ? [Math.round(question.answer.toleranceRatio * 100)]
            : [],
        ),
      ),
    ];

    return (
      <section className="session-ready" aria-labelledby="session-ready-heading">
        <div className="session-ready__timer">
          <span>Time limit</span>
          <Countdown session={session} />
        </div>
        <header>
          <p className="eyebrow">Focus check</p>
          <h1 id="session-ready-heading">Session ready</h1>
          <p>
            {session.questions.length} questions are loaded. The clock starts only when you begin.
          </p>
        </header>
        <dl className="session-ready__rules">
          <div>
            <dt>Difficulty</dt>
            <dd>
              {session.config.presetId === "speed-arithmetic"
                ? "3–9 difficulty ramp"
                : `${session.config.startingDifficulty} / 10`}
            </dd>
          </div>
          <div>
            <dt>Feedback</dt>
            <dd>{isMock ? "After the test" : "After each answer"}</dd>
          </div>
          <div>
            <dt>Navigation</dt>
            <dd>{session.config.allowNavigation ? "Numbered questions" : "Sequential"}</dd>
          </div>
          <div>
            <dt>Pause</dt>
            <dd>{session.config.allowPause ? "Available" : "Unavailable"}</dd>
          </div>
        </dl>
        {estimationTolerances.length === 0 ? null : (
          <p className="estimation-rule__ready">
            Estimation answers are accepted within {estimationTolerances
              .map((tolerance) => `±${tolerance}%`)
              .join(" or ")} of the exact target.
          </p>
        )}
        <div className="session-ready__actions">
          <button className="button button--secondary" type="button" onClick={onAdjust}>
            <ArrowLeft aria-hidden="true" size={18} />
            Adjust setup
          </button>
          <button className="button button--primary" type="button" onClick={startSession}>
            <Play aria-hidden="true" size={18} />
            {isMock ? "Begin test" : "Begin practice"}
          </button>
        </div>
      </section>
    );
  }

  if (session.phase === "paused") {
    return (
      <section className="session-paused" aria-labelledby="session-paused-heading">
        <p className="eyebrow">Clock frozen</p>
        <h1 id="session-paused-heading">Session paused</h1>
        <Countdown session={session} />
        <p>Your current question and every recorded answer remain saved.</p>
        <div className="session-paused__actions">
          <button className="button button--primary" type="button" onClick={resumeSession}>
            <Play aria-hidden="true" size={18} />
            Resume session
          </button>
          <button
            ref={endButtonRef}
            className="button button--secondary"
            type="button"
            onClick={() => setShowAbandon(true)}
          >
            End session
          </button>
        </div>
        {showAbandon ? (
          <AbandonDialog
            keepTrainingRef={keepTrainingRef}
            onCancel={() => {
              restoreEndFocusRef.current = true;
              setShowAbandon(false);
            }}
            onConfirm={() => {
              abandonSession();
              onExit();
            }}
          />
        ) : null}
      </section>
    );
  }

  if (session.phase === "completed") {
    return (
      <section className="session-state-card">
        <p className="eyebrow">Session complete</p>
        <h1>Results are ready</h1>
        <p>Your answers have been scored and saved.</p>
        <button className="button button--primary" type="button" onClick={onExit}>
          View results
        </button>
      </section>
    );
  }

  const question = session.questions[session.currentIndex];
  if (question === undefined) {
    return null;
  }

  const feedback =
    session.config.feedback === "immediate" ? latestFeedback(session) : null;
  const submitLabel = session.config.allowNavigation ? "Save answer" : "Submit answer";

  return (
    <div className="session-view">
      <header className="session-toolbar">
        <div>
          <span>Question progress</span>
          <strong>
            Question {session.currentIndex + 1} of {session.questions.length}
          </strong>
        </div>
        <div className="session-toolbar__timer">
          <span>Time remaining</span>
          <Countdown session={session} />
        </div>
        <div className="session-toolbar__controls">
          {session.config.allowPause ? (
            <button className="button button--secondary" type="button" onClick={pauseSession}>
              <Pause aria-hidden="true" size={17} />
              Pause session
            </button>
          ) : null}
          {session.config.presetId === "mixed-quant" ? (
            <button
              ref={submitButtonRef}
              className="button button--primary"
              type="button"
              onClick={() => setShowSubmit(true)}
            >
              <Send aria-hidden="true" size={16} />
              Submit test
            </button>
          ) : null}
          <button
            ref={endButtonRef}
            className="button button--secondary"
            type="button"
            onClick={() => setShowAbandon(true)}
          >
            <Square aria-hidden="true" size={15} />
            End session
          </button>
        </div>
      </header>

      {session.config.allowNavigation ? (
        <QuestionNavigator session={session} onNavigate={navigateQuestion} />
      ) : null}

      <section className="question-stage" aria-labelledby="question-prompt">
        <div className="question-stage__meta">
          <span>{question.topic}</span>
          <span>Difficulty {question.difficulty} / 10</span>
        </div>
        <h1 id="question-prompt">{question.prompt}</h1>

        <AnswerInput
          ref={answerRef}
          question={question}
          input={input}
          error={inputError}
          submitLabel={submitLabel}
          onChange={setInput}
          onSubmit={submitAnswer}
        />

        {session.config.allowSkip ? (
          <button className="text-button skip-question" type="button" onClick={skipQuestion}>
            <SkipForward aria-hidden="true" size={18} />
            Skip question
          </button>
        ) : null}

        {feedback === null ? null : (
          <FeedbackPanel question={feedback.question} answer={feedback.answer} />
        )}
        {session.config.feedback === "deferred" ? (
          <p className="deferred-feedback">
            Feedback appears after the test ends so this attempt stays comparable.
          </p>
        ) : null}
      </section>

      {showAbandon ? (
        <AbandonDialog
          keepTrainingRef={keepTrainingRef}
          onCancel={() => {
            restoreEndFocusRef.current = true;
            setShowAbandon(false);
          }}
          onConfirm={() => {
            abandonSession();
            onExit();
          }}
        />
      ) : null}
      {showSubmit ? (
        <SubmitDialog
          keepWorkingRef={keepWorkingRef}
          onCancel={() => {
            restoreSubmitFocusRef.current = true;
            setShowSubmit(false);
          }}
          onConfirm={finishSession}
        />
      ) : null}
    </div>
  );
}

interface AbandonDialogProps {
  keepTrainingRef: RefObject<HTMLButtonElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
}

function AbandonDialog({ keepTrainingRef, onCancel, onConfirm }: AbandonDialogProps) {
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      ),
    );
    const first = buttons[0];
    const last = buttons.at(-1);
    if (first === undefined || last === undefined) {
      return;
    }

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <section
      className="abandon-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="abandon-heading"
      aria-describedby="abandon-description"
      onKeyDown={handleKeyDown}
    >
      <div className="abandon-dialog__panel">
        <p className="eyebrow">Discard attempt</p>
        <h2 id="abandon-heading">End this session?</h2>
        <p id="abandon-description">
          This incomplete attempt will not be added to your progress history.
        </p>
        <div>
          <button
            ref={keepTrainingRef}
            className="button button--secondary"
            type="button"
            onClick={onCancel}
          >
            Keep training
          </button>
          <button className="button button--danger" type="button" onClick={onConfirm}>
            End and leave
          </button>
        </div>
      </div>
    </section>
  );
}

interface SubmitDialogProps {
  keepWorkingRef: RefObject<HTMLButtonElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
}

function SubmitDialog({ keepWorkingRef, onCancel, onConfirm }: SubmitDialogProps) {
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      ),
    );
    const first = buttons[0];
    const last = buttons.at(-1);
    if (first === undefined || last === undefined) {
      return;
    }

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <section
      className="abandon-dialog submit-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="submit-test-heading"
      aria-describedby="submit-test-description"
      onKeyDown={handleKeyDown}
    >
      <div className="abandon-dialog__panel submit-dialog__panel">
        <p className="eyebrow">Finish attempt</p>
        <h2 id="submit-test-heading">Submit Mixed Quant?</h2>
        <p id="submit-test-description">
          Saved answers will be scored now. Every remaining question will count
          as unanswered.
        </p>
        <div>
          <button
            ref={keepWorkingRef}
            className="button button--secondary"
            type="button"
            onClick={onCancel}
          >
            Keep working
          </button>
          <button className="button button--primary" type="button" onClick={onConfirm}>
            Submit test
          </button>
        </div>
      </div>
    </section>
  );
}
