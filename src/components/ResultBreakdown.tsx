import type { QuestionCategory } from "../domain/questions/types";
import type { CategoryResult, ReviewRow } from "../domain/session/types";

const CATEGORY_NAMES: Record<QuestionCategory, string> = {
  arithmetic: "Arithmetic",
  probability: "Probability",
  sequences: "Sequences",
  estimation: "Estimation",
};

export interface ResultBreakdownProps {
  categories: ReadonlyArray<CategoryResult>;
  review: ReadonlyArray<ReviewRow>;
}

function formatSeconds(milliseconds: number | null): string {
  return milliseconds === null ? "—" : `${(milliseconds / 1_000).toFixed(1)}s`;
}

function median(values: ReadonlyArray<number>): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function pacePercent(category: CategoryResult, review: ReadonlyArray<ReviewRow>): number | null {
  if (category.medianResponseTimeMs === null || category.medianResponseTimeMs === 0) {
    return null;
  }

  const target = median(
    review
      .filter((row) => row.question.category === category.category)
      .map((row) => row.question.targetTimeMs),
  );
  if (target === null) {
    return null;
  }

  return Math.min(100, Math.round((target / category.medianResponseTimeMs) * 100));
}

interface BarProps {
  label: string;
  value: number | null;
}

function Bar({ label, value }: BarProps) {
  return (
    <div className="breakdown-bar">
      <div
        className="breakdown-bar__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value ?? undefined}
      >
        <span style={{ width: `${value ?? 0}%` }} />
      </div>
    </div>
  );
}

export function ResultBreakdown({ categories, review }: ResultBreakdownProps) {
  return (
    <ul className="result-breakdown" aria-label="Category breakdown">
      {categories.map((category) => {
        const name = CATEGORY_NAMES[category.category];
        const accuracy =
          category.accuracy === null ? null : Math.round(category.accuracy * 100);
        const pace = pacePercent(category, review);

        return (
          <li key={category.category}>
            <article>
              <header>
                <div>
                  <h3>{name}</h3>
                  <p>
                    {category.correct} correct · {category.attempted} attempted · {category.total} total
                  </p>
                </div>
              </header>
              <div className="breakdown-measure">
                <div className="breakdown-measure__label">
                  <span>Accuracy</span>
                  <strong>{accuracy === null ? "—" : `${accuracy}%`}</strong>
                </div>
                <Bar label={`${name} accuracy`} value={accuracy} />
              </div>
              <div className="breakdown-measure">
                <div className="breakdown-measure__label">
                  <span>Pace</span>
                  <strong>{formatSeconds(category.medianResponseTimeMs)}</strong>
                </div>
                <Bar label={`${name} pace`} value={pace} />
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
