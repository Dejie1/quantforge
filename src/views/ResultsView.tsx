import {
  ArrowLeft,
  CheckCircle2,
  CircleHelp,
  MinusCircle,
  Target,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { ResultBreakdown } from "../components/ResultBreakdown";
import type { QuestionCategory } from "../domain/questions/types";
import type {
  CategoryResult,
  QuestionOutcome,
  ReviewRow,
  SessionResult,
} from "../domain/session/types";

export interface ResultsViewProps {
  onBack: () => void;
  onTrainWeakness: (category: QuestionCategory) => void;
  result: SessionResult;
}

type ReviewFilter = "all" | "incorrect" | "deferred";

const OUTCOME_LABELS: Record<QuestionOutcome, string> = {
  correct: "Correct",
  incorrect: "Incorrect",
  skipped: "Skipped",
  unanswered: "Unanswered",
};

const OUTCOME_ICONS = {
  correct: CheckCircle2,
  incorrect: XCircle,
  skipped: MinusCircle,
  unanswered: CircleHelp,
} as const;

const CATEGORY_NAMES: Record<QuestionCategory, string> = {
  arithmetic: "Arithmetic",
  probability: "Probability",
  sequences: "Sequences",
  estimation: "Estimation",
};

function difficultyStatus(
  startingDifficulty: number,
  endingDifficulty: number,
  adaptive: boolean,
  evaluated: boolean,
): string {
  if (!adaptive) {
    return "Locked";
  }
  if (!evaluated) {
    return "Not enough data";
  }
  if (endingDifficulty > startingDifficulty) {
    return "Raised";
  }
  if (endingDifficulty < startingDifficulty) {
    return "Lowered";
  }
  return "Unchanged";
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function formatSeconds(value: number | null): string {
  return value === null ? "—" : `${(value / 1_000).toFixed(1)}s`;
}

function lowestMeasuredCategory(
  categories: ReadonlyArray<CategoryResult>,
): CategoryResult | null {
  return categories.reduce<CategoryResult | null>((lowest, category) => {
    if (category.accuracy === null) {
      return lowest;
    }
    if (
      lowest === null ||
      lowest.accuracy === null ||
      category.accuracy < lowest.accuracy
    ) {
      return category;
    }
    return lowest;
  }, null);
}

function visibleReview(
  review: ReadonlyArray<ReviewRow>,
  filter: ReviewFilter,
): ReviewRow[] {
  if (filter === "incorrect") {
    return review.filter((row) => row.outcome === "incorrect");
  }
  if (filter === "deferred") {
    return review.filter(
      (row) => row.outcome === "skipped" || row.outcome === "unanswered",
    );
  }
  return [...review];
}

function enteredAnswer(row: ReviewRow): string {
  if (row.input === null || row.input.trim().length === 0) {
    return "—";
  }
  if (row.question.answer.kind !== "choice") {
    return row.input;
  }
  return row.question.choices?.find((choice) => choice.id === row.input)?.label ?? row.input;
}

function ReviewItem({ index, row }: { index: number; row: ReviewRow }) {
  const Icon = OUTCOME_ICONS[row.outcome];

  return (
    <li className={`review-item review-item--${row.outcome}`} data-testid="review-item">
      <article>
        <header className="review-item__header">
          <span className="review-item__number">{String(index + 1).padStart(2, "0")}</span>
          <div>
            <p>{row.question.topic}</p>
            <h3>{row.question.prompt}</h3>
          </div>
          <span className="review-outcome">
            <Icon aria-hidden="true" size={20} strokeWidth={1.9} />
            {OUTCOME_LABELS[row.outcome]}
          </span>
        </header>
        <dl className="review-item__answers">
          <div>
            <dt>Entered answer</dt>
            <dd>{enteredAnswer(row)}</dd>
          </div>
          <div>
            <dt>Correct answer</dt>
            <dd>{row.question.answer.display}</dd>
          </div>
          {row.question.answer.kind === "estimate" ? (
            <div>
              <dt>Accepted tolerance</dt>
              <dd>±{Math.round(row.question.answer.toleranceRatio * 100)}%</dd>
            </div>
          ) : null}
          <div>
            <dt>Response time</dt>
            <dd>{formatSeconds(row.responseTimeMs)}</dd>
          </div>
        </dl>
        <div className="review-item__explanation">
          <strong>Explanation</strong>
          <p>{row.question.explanation}</p>
        </div>
      </article>
    </li>
  );
}

interface ResultMetricProps {
  detail: string;
  label: string;
  testId: string;
  value: string;
}

function ResultMetric({ detail, label, testId, value }: ResultMetricProps) {
  return (
    <article className="result-metric" data-testid={testId}>
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

export function ResultsView({ onBack, onTrainWeakness, result }: ResultsViewProps) {
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const weakness = lowestMeasuredCategory(result.categories);
  const review = visibleReview(result.review, filter);

  return (
    <div className="results-view">
      <button className="back-button" type="button" onClick={onBack}>
        <ArrowLeft aria-hidden="true" size={18} />
        Back to dashboard
      </button>

      <header className="results-hero">
        <div>
          <p className="eyebrow">Attempt complete</p>
          <h1>Session results</h1>
          <p>Raw performance, with every question available for review.</p>
        </div>
        <div className="results-score" aria-label={`${result.correct} correct out of ${result.review.length}`}>
          <span>Correct answers</span>
          <strong>{result.correct} / {result.review.length}</strong>
          <div>
            <span>{result.incorrect} incorrect</span>
            <span>{result.skipped} skipped</span>
            <span>{result.unanswered} unanswered</span>
          </div>
        </div>
      </header>

      <section className="result-metrics" aria-label="Session metrics">
        <ResultMetric
          testId="result-accuracy"
          label="Accuracy"
          value={formatPercent(result.accuracy)}
          detail="Correct over attempted"
        />
        <ResultMetric
          testId="result-completion"
          label="Completion"
          value={formatPercent(result.completionRate)}
          detail="Answered or skipped"
        />
        <ResultMetric
          testId="result-median"
          label="Median response"
          value={formatSeconds(result.medianResponseTimeMs)}
          detail="Across attempted questions"
        />
        <ResultMetric
          testId="result-correct-per-minute"
          label="Correct / minute"
          value={result.correctPerMinute.toFixed(1)}
          detail="Over active session time"
        />
        <ResultMetric
          testId="result-streak"
          label="Longest streak"
          value={String(result.longestStreak)}
          detail="Consecutive correct answers"
        />
      </section>

      {result.difficultyTransitions.length === 0 ? null : (
        <section
          className="results-section difficulty-results"
          aria-labelledby="difficulty-results-heading"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">Adaptive record</p>
              <h2 id="difficulty-results-heading">Difficulty movement</h2>
            </div>
            <p>Starting and ending levels for every category trained in this session.</p>
          </div>
          <ul className="difficulty-results__list">
            {result.difficultyTransitions.map((transition) => (
              <li key={transition.category}>
                <strong>{CATEGORY_NAMES[transition.category]}</strong>
                <span>
                  {transition.startingDifficulty} → {transition.endingDifficulty}
                </span>
                <small>
                  {difficultyStatus(
                    transition.startingDifficulty,
                    transition.endingDifficulty,
                    transition.adaptive,
                    transition.evaluated,
                  )}
                </small>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="results-section" aria-labelledby="category-results-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Performance signal</p>
            <h2 id="category-results-heading">Category breakdown</h2>
          </div>
          <button
            className="button button--primary"
            type="button"
            disabled={weakness === null}
            onClick={() => {
              if (weakness !== null) {
                onTrainWeakness(weakness.category);
              }
            }}
          >
            <Target aria-hidden="true" size={18} />
            Train this weakness
          </button>
        </div>
        <ResultBreakdown categories={result.categories} review={result.review} />
      </section>

      <section className="results-section" aria-labelledby="review-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Transparent review</p>
            <h2 id="review-heading">Question review</h2>
          </div>
          <div className="review-filters" aria-label="Review filters">
            <button
              type="button"
              aria-pressed={filter === "all"}
              onClick={() => setFilter("all")}
            >
              All
            </button>
            <button
              type="button"
              aria-pressed={filter === "incorrect"}
              onClick={() => setFilter("incorrect")}
            >
              Incorrect
            </button>
            <button
              type="button"
              aria-pressed={filter === "deferred"}
              onClick={() => setFilter("deferred")}
            >
              Skipped / unanswered
            </button>
          </div>
        </div>

        {review.length === 0 ? (
          <p className="review-empty">No questions match this filter.</p>
        ) : (
          <ol className="review-list">
            {review.map((row) => (
              <ReviewItem
                key={row.question.id}
                row={row}
                index={result.review.indexOf(row)}
              />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
