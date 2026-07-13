import {
  BriefcaseBusiness,
  Calculator,
  FlaskConical,
  ListOrdered,
  LockKeyhole,
  Play,
} from "lucide-react";
import { MetricCard } from "../components/MetricCard";
import { ModeCard } from "../components/ModeCard";
import { ProgressRing } from "../components/ProgressRing";
import type { SessionMode } from "../domain/session/types";
import { useTrainer } from "../features/trainer/useTrainer";

export interface HomeViewProps {
  onResume: () => void;
  onSelectMode: (mode: SessionMode) => void;
}

const MODE_NAMES: Record<SessionMode, string> = {
  "mental-math": "Mental Math Sprint",
  probability: "Probability Lab",
  "sequences-estimation": "Sequences & Estimation",
  mock: "Mock Interview",
};

const MODES = [
  {
    mode: "mental-math" as const,
    name: MODE_NAMES["mental-math"],
    icon: Calculator,
    description: "Build fast, dependable arithmetic without losing your reasoning thread.",
    details: ["2–8 minutes", "Adaptive", "Immediate feedback"],
  },
  {
    mode: "probability" as const,
    name: MODE_NAMES.probability,
    icon: FlaskConical,
    description: "Practice exact probability, counting, and expectation under interview pressure.",
    details: ["10 or 20 questions", "Adaptive", "Immediate feedback"],
  },
  {
    mode: "sequences-estimation" as const,
    name: MODE_NAMES["sequences-estimation"],
    icon: ListOrdered,
    description: "Recognize structure quickly, then make sensible estimates with limited information.",
    details: ["10 or 20 questions", "Two disciplines", "Immediate feedback"],
  },
  {
    mode: "mock" as const,
    name: MODE_NAMES.mock,
    icon: BriefcaseBusiness,
    description: "Rehearse a fixed, timed set with feedback held until the interview is over.",
    details: ["8 or 20 minutes", "Fixed difficulty", "Deferred feedback"],
  },
] as const;

function localDateKey(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function HomeView({ onResume, onSelectMode }: HomeViewProps) {
  const { progress, session } = useTrainer();
  const today = progress.dailyActivity[localDateKey(new Date())];
  const questionsToday = today?.questions ?? 0;
  const categoryStats = Object.values(progress.categoryStats);
  const answered = categoryStats.reduce((total, stats) => total + stats.answered, 0);
  const totalResponseTimeMs = categoryStats.reduce(
    (total, stats) => total + stats.totalResponseTimeMs,
    0,
  );
  const bestStreak = Math.max(0, ...categoryStats.map((stats) => stats.bestStreak));
  const recentAccuracies = [...progress.recentSessions]
    .sort((left, right) => right.completedAtMs - left.completedAtMs)
    .map(({ accuracy }) => accuracy)
    .filter((accuracy): accuracy is number => accuracy !== null)
    .slice(0, 5);
  const recentAccuracy =
    recentAccuracies.length === 0
      ? "—"
      : percent(
          recentAccuracies.reduce((total, accuracy) => total + accuracy, 0) /
            recentAccuracies.length,
        );
  const recentAccuracyDetail =
    recentAccuracies.length === 0
      ? "No scored sessions yet"
      : `Newest ${recentAccuracies.length} scored ${recentAccuracies.length === 1 ? "session" : "sessions"}`;
  const averageSpeed = answered === 0 ? "—" : `${(totalResponseTimeMs / answered / 1_000).toFixed(1)}s`;
  const resumableSession =
    session !== null && session.phase !== "completed" && progress.activeSession !== null
      ? session
      : null;

  return (
    <div className="home-view">
      <section className="hero" aria-labelledby="home-heading">
        <div className="hero__copy">
          <p className="eyebrow">Deliberate quantitative practice</p>
          <h1 id="home-heading">Think clearly. Move quickly.</h1>
          <p className="hero__lede">
            Train the calculations, pattern recognition, and decision rhythm that make a strong
            quant interview feel composed.
          </p>
          <div className="hero__actions">
            <button
              className="button button--primary"
              type="button"
              onClick={() => onSelectMode("mental-math")}
            >
              <Play aria-hidden="true" size={18} fill="currentColor" />
              Start training
            </button>
            <span>Choose a mode below to shape the session.</span>
          </div>
        </div>
        <div className="hero__goal">
          <ProgressRing value={questionsToday} goal={progress.preferences.dailyGoal} />
          <p>
            {questionsToday >= progress.preferences.dailyGoal
              ? "Daily target complete. Keep the edge if you want another round."
              : `${Math.max(0, progress.preferences.dailyGoal - questionsToday)} questions to today’s target.`}
          </p>
        </div>
      </section>

      {resumableSession !== null ? (
        <section className="resume-card" aria-labelledby="resume-heading">
          <div className="resume-card__icon" aria-hidden="true">
            <Play size={22} fill="currentColor" />
          </div>
          <div>
            <p className="eyebrow">Saved locally · {resumableSession.phase}</p>
            <h2 id="resume-heading">Resume your session</h2>
            <p>
              {MODE_NAMES[resumableSession.config.mode]} · {resumableSession.config.questionCount}
              {" questions"}
            </p>
          </div>
          <button className="button button--secondary" type="button" onClick={onResume}>
            Resume session
          </button>
        </section>
      ) : null}

      <section className="metrics-section" aria-labelledby="today-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Signal, not noise</p>
            <h2 id="today-heading">Your training pulse</h2>
          </div>
          <p>All-time performance, with today’s attempted questions called out separately.</p>
        </div>
        <div className="metric-grid">
          <MetricCard label="Questions today" value={String(questionsToday)} detail="Attempted today" />
          <MetricCard label="Recent accuracy" value={recentAccuracy} detail={recentAccuracyDetail} />
          <MetricCard label="Average speed" value={averageSpeed} detail="Per attempted answer" />
          <MetricCard label="Best streak" value={String(bestStreak)} detail="Consecutive correct" />
        </div>
      </section>

      <section className="modes-section" aria-labelledby="modes-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Choose the constraint</p>
            <h2 id="modes-heading">Training modes</h2>
          </div>
          <p>Every mode uses generated questions and keeps its feedback rules explicit.</p>
        </div>
        <ul className="mode-grid" aria-label="Training modes">
          {MODES.map((mode) => (
            <ModeCard key={mode.mode} {...mode} onSelect={onSelectMode} />
          ))}
        </ul>
      </section>

      <aside className="privacy-note" aria-label="Local data privacy">
        <LockKeyhole aria-hidden="true" size={20} />
        <p>
          <strong>Your training data is stored only in this browser.</strong> QuantForge does not
          send your answers or progress to an account or server.
        </p>
      </aside>
    </div>
  );
}
