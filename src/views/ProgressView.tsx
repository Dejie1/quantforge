import {
  Gauge,
  LockKeyhole,
  RotateCcw,
  Settings2,
  Trash2,
  TrendingUp,
} from "lucide-react";
import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ThemeToggle, applyRootPreferences } from "../components/ThemeToggle";
import type { QuestionCategory } from "../domain/questions/types";
import { useTrainer } from "../features/trainer/useTrainer";
import type { SessionSummary } from "../lib/progress-schema";

const CATEGORIES = [
  ["arithmetic", "Arithmetic"],
  ["probability", "Probability"],
  ["sequences", "Sequences"],
  ["estimation", "Estimation"],
] as const satisfies ReadonlyArray<readonly [QuestionCategory, string]>;

const PRESET_LABELS: Record<string, string> = {
  "mental-2m": "Mental math · 2 minutes",
  "mental-5m": "Mental math · 5 minutes",
  "mental-8m": "Mental math · 8 minutes",
  "probability-10": "Probability · 10 questions",
  "probability-20": "Probability · 20 questions",
  "sequences-estimation-10": "Sequences & estimation · 10 questions",
  "sequences-estimation-20": "Sequences & estimation · 20 questions",
  "speed-arithmetic": "Speed Arithmetic · 8 minutes",
  "mixed-quant": "Mixed Quant · 20 minutes",
};

const DEFAULT_DAILY_GOALS = [10, 20, 30, 40] as const;

function formatPercent(ratio: number | null): string {
  return ratio === null ? "—" : `${Math.round(ratio * 100)}%`;
}

function formatSpeed(milliseconds: number | null): string {
  return milliseconds === null ? "—" : `${(milliseconds / 1_000).toFixed(1)}s`;
}

function formatDate(timestampMs: number): string {
  try {
    const date = new Date(timestampMs);
    if (Number.isNaN(date.getTime())) {
      return "Date unavailable";
    }

    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(date);
  } catch {
    return "Date unavailable";
  }
}

function sessionLabel(summary: SessionSummary): string {
  return PRESET_LABELS[summary.presetId] ?? summary.presetId;
}

export function ProgressView() {
  const { progress, resetProgress, updatePreferences } = useTrainer();
  const [confirmingReset, setConfirmingReset] = useState(false);
  const resetButtonRef = useRef<HTMLButtonElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const returnResetFocusRef = useRef(false);
  const { preferences } = progress;
  const dailyGoals = Array.from(
    new Set<number>([...DEFAULT_DAILY_GOALS, preferences.dailyGoal]),
  ).sort((left, right) => left - right);

  useLayoutEffect(() => {
    applyRootPreferences(preferences);
  }, [preferences]);

  useLayoutEffect(() => {
    if (confirmingReset) {
      deleteButtonRef.current?.focus();
    } else if (returnResetFocusRef.current) {
      returnResetFocusRef.current = false;
      resetButtonRef.current?.focus();
    }
  }, [confirmingReset]);

  const setReducedMotion = (reducedMotion: boolean) => {
    document.documentElement.dataset.reducedMotion = String(reducedMotion);
    updatePreferences({ reducedMotion });
  };

  const confirmReset = () => {
    resetProgress();
    returnResetFocusRef.current = true;
    setConfirmingReset(false);
    applyRootPreferences({ theme: "dark", reducedMotion: false, dailyGoal: 20 });
  };

  const cancelReset = () => {
    returnResetFocusRef.current = true;
    setConfirmingReset(false);
  };

  const handleResetDialogKeyDown = (
    event: ReactKeyboardEvent<HTMLElement>,
  ) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelReset();
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
    <div className="progress-view">
      <header className="view-intro view-intro--wide">
        <p className="eyebrow">Progress</p>
        <h1>See the signal. Choose the next rep.</h1>
        <p>
          Accuracy, pace, and streaks are shown together so a fast answer never hides weak
          reasoning—and a correct answer never hides slow recall.
        </p>
      </header>

      <section className="progress-section" aria-labelledby="category-progress-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">All-time practice</p>
            <h2 id="category-progress-heading">Category performance</h2>
          </div>
          <p>Bars show accuracy; every row also states the underlying totals and response pace.</p>
        </div>

        <ul className="category-list" aria-label="Category performance">
          {CATEGORIES.map(([category, label]) => {
            const stats = progress.categoryStats[category];
            const accuracy = stats.answered === 0 ? null : stats.correct / stats.answered;
            const accuracyLabel = formatPercent(accuracy);
            const averageSpeed =
              stats.answered === 0 ? null : stats.totalResponseTimeMs / stats.answered;

            return (
              <li key={category} className="category-row">
                <article>
                  <div className="category-row__heading">
                    <div>
                      <h3>{label}</h3>
                      <p>Difficulty {progress.difficulty[category]} / 10</p>
                    </div>
                    <strong>{accuracyLabel}</strong>
                  </div>
                  {accuracy === null ? (
                    <p className="category-no-data">No accuracy data yet</p>
                  ) : (
                    <div
                      className="category-meter"
                      role="meter"
                      aria-label={`${label} accuracy: ${accuracyLabel}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(accuracy * 100)}
                    >
                      <span style={{ width: `${accuracy * 100}%` }} />
                    </div>
                  )}
                  <dl className="category-row__metrics">
                    <div>
                      <dt>Volume</dt>
                      <dd>{stats.answered} answered</dd>
                    </div>
                    <div>
                      <dt>Average speed</dt>
                      <dd>{formatSpeed(averageSpeed)}</dd>
                    </div>
                    <div>
                      <dt>Best streak</dt>
                      <dd>{stats.bestStreak}</dd>
                    </div>
                  </dl>
                </article>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="progress-section" aria-labelledby="recent-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Latest attempts</p>
            <h2 id="recent-heading">Recent sessions</h2>
          </div>
          <TrendingUp aria-hidden="true" size={28} strokeWidth={1.5} />
        </div>

        {progress.recentSessions.length === 0 ? (
          <div className="empty-state">
            <Gauge aria-hidden="true" size={24} />
            <p>
              <strong>No completed sessions yet.</strong>
              Finish a practice set to start your history.
            </p>
          </div>
        ) : (
          <ol className="recent-list" aria-label="Recent sessions">
            {progress.recentSessions.map((summary) => (
              <li key={summary.id}>
                <article>
                  <div>
                    <h3>{sessionLabel(summary)}</h3>
                    <p>{formatDate(summary.completedAtMs)}</p>
                  </div>
                  <dl>
                    <div>
                      <dt>Score</dt>
                      <dd>
                        {summary.correct} / {summary.total} correct
                      </dd>
                    </div>
                    <div>
                      <dt>Accuracy</dt>
                      <dd>{formatPercent(summary.accuracy)}</dd>
                    </div>
                    <div>
                      <dt>Median speed</dt>
                      <dd>{formatSpeed(summary.medianResponseTimeMs)}</dd>
                    </div>
                  </dl>
                </article>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="preferences-section" aria-labelledby="preferences-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Local preferences</p>
            <h2 id="preferences-heading">Training environment</h2>
          </div>
          <Settings2 aria-hidden="true" size={28} strokeWidth={1.5} />
        </div>

        <div className="preference-grid">
          <article className="preference-card">
            <h3>Color theme</h3>
            <p>Switch the full interface while retaining strong text and control contrast.</p>
            <ThemeToggle />
          </article>

          <article className="preference-card">
            <h3>Motion</h3>
            <p id="motion-help">Reduce interface movement in addition to your operating-system setting.</p>
            <label className="switch-control">
              <input
                type="checkbox"
                checked={preferences.reducedMotion}
                aria-describedby="motion-help"
                onChange={(event) => setReducedMotion(event.currentTarget.checked)}
              />
              <span aria-hidden="true" />
              Reduce motion
            </label>
          </article>

          <article className="preference-card preference-card--wide">
            <h3>Daily question goal</h3>
            <p id="goal-help">Choose a target that is meaningful without rewarding rushed answers.</p>
            <fieldset className="goal-options" aria-describedby="goal-help">
              <legend className="sr-only">Daily question goal</legend>
              {dailyGoals.map((goal) => (
                <label key={goal}>
                  <input
                    type="radio"
                    name="daily-goal"
                    value={goal}
                    checked={preferences.dailyGoal === goal}
                    onChange={() => updatePreferences({ dailyGoal: goal })}
                  />
                  <span>{goal} questions</span>
                </label>
              ))}
            </fieldset>
          </article>
        </div>
      </section>

      <section className="data-section" aria-labelledby="local-data-heading">
        <div className="data-section__copy">
          <LockKeyhole aria-hidden="true" size={23} />
          <div>
            <h2 id="local-data-heading">Local data controls</h2>
            <p>Everything here is stored only in this browser. Nothing is uploaded.</p>
          </div>
        </div>

        {confirmingReset ? (
          <div
            className="reset-confirmation"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="reset-confirmation-heading"
            aria-describedby="reset-confirmation-description"
            onKeyDown={handleResetDialogKeyDown}
          >
            <div>
              <strong id="reset-confirmation-heading">
                Delete all local training progress?
              </strong>
              <p id="reset-confirmation-description">
                This removes session history, category stats, preferences, and any saved session.
              </p>
            </div>
            <div className="reset-confirmation__actions">
              <button
                className="button button--secondary"
                type="button"
                onClick={cancelReset}
              >
                Cancel reset
              </button>
              <button
                ref={deleteButtonRef}
                className="button button--danger"
                type="button"
                onClick={confirmReset}
              >
                <Trash2 aria-hidden="true" size={18} />
                Delete my local progress
              </button>
            </div>
          </div>
        ) : (
          <button
            ref={resetButtonRef}
            className="button button--secondary"
            type="button"
            onClick={() => setConfirmingReset(true)}
          >
            <RotateCcw aria-hidden="true" size={18} />
            Reset progress
          </button>
        )}
      </section>
    </div>
  );
}
