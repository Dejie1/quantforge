import { ArrowLeft, Check, Gauge, ShieldCheck, Target, Timer } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { QuestionCategory } from "../domain/questions/types";
import { estimationToleranceForDifficulty } from "../domain/questions/estimation";
import { getPreset, type PresetId } from "../domain/session/presets";
import type { SessionConfig, SessionMode, SessionState } from "../domain/session/types";
import { useTrainer } from "../features/trainer/useTrainer";
import type { ProgressDataV1 } from "../lib/progress-schema";

export interface SetupViewProps {
  focusCategory?: QuestionCategory | null;
  mode: SessionMode;
  onBack: () => void;
  onReady: () => void;
}

interface PresetChoice {
  id: PresetId;
  label: string;
  note: string;
}

const MODE_NAMES: Record<SessionMode, string> = {
  "mental-math": "Mental Math Sprint",
  probability: "Probability Lab",
  "sequences-estimation": "Sequences & Estimation",
  mock: "Mock Interview",
};

const PRESETS_BY_MODE: Record<SessionMode, readonly PresetChoice[]> = {
  "mental-math": [
    { id: "mental-2m", label: "2 minutes · 20 questions", note: "A sharp warm-up" },
    { id: "mental-5m", label: "5 minutes · 50 questions", note: "A focused practice block" },
    { id: "mental-8m", label: "8 minutes · 80 questions", note: "A sustained speed test" },
  ],
  probability: [
    { id: "probability-10", label: "10 questions", note: "A concise untimed set" },
    { id: "probability-20", label: "20 questions", note: "A deeper untimed set" },
  ],
  "sequences-estimation": [
    {
      id: "sequences-estimation-10",
      label: "10 questions",
      note: "A concise focused or mixed set",
    },
    {
      id: "sequences-estimation-20",
      label: "20 questions",
      note: "A deeper focused or mixed set",
    },
  ],
  mock: [
    {
      id: "speed-arithmetic",
      label: "Speed Arithmetic · 8 minutes · 80 questions",
      note: "Strictly sequential mental arithmetic",
    },
    {
      id: "mixed-quant",
      label: "Mixed Quant · 20 minutes · 30 questions",
      note: "All four categories with question navigation",
    },
  ],
};

const DIFFICULTIES = Array.from({ length: 10 }, (_, index) => index + 1);

type SequencesEstimationFocus = "both" | "sequences" | "estimation";

const FOCUS_CHOICES = [
  {
    id: "both",
    label: "Both",
    note: "A balanced mix of sequences and estimation",
  },
  {
    id: "sequences",
    label: "Sequences",
    note: "Concentrate every question on pattern recognition",
  },
  {
    id: "estimation",
    label: "Estimation",
    note: "Concentrate every question on quantitative estimates",
  },
] as const satisfies ReadonlyArray<{
  id: SequencesEstimationFocus;
  label: string;
  note: string;
}>;

function normalizedFocus(
  mode: SessionMode,
  focusCategory: QuestionCategory | null,
): SequencesEstimationFocus {
  return mode === "sequences-estimation" &&
    (focusCategory === "sequences" || focusCategory === "estimation")
    ? focusCategory
    : "both";
}

function sessionFocus(session: SessionState): SequencesEstimationFocus {
  const [category] = session.config.categories;
  return session.config.mode === "sequences-estimation" &&
    session.config.categories.length === 1 &&
    (category === "sequences" || category === "estimation")
    ? category
    : "both";
}

function initialDifficulty(
  mode: SessionMode,
  difficulty: ProgressDataV1["difficulty"],
  focus: SequencesEstimationFocus,
): number {
  switch (mode) {
    case "mental-math":
      return difficulty.arithmetic;
    case "probability":
      return difficulty.probability;
    case "sequences-estimation":
      return focus === "both"
        ? Math.round((difficulty.sequences + difficulty.estimation) / 2)
        : difficulty[focus];
    case "mock":
      return getPreset(PRESETS_BY_MODE.mock[0].id).startingDifficulty;
  }
}

interface SetupDefaults {
  adaptive: boolean;
  difficulty: number;
  focus: SequencesEstimationFocus;
  preset: PresetId;
}

function setupDefaults(
  mode: SessionMode,
  difficulty: ProgressDataV1["difficulty"],
  session: SessionState | null,
  focusCategory: QuestionCategory | null,
): SetupDefaults {
  const matchingPreset =
    session !== null &&
    session.phase !== "completed" &&
    session.config.mode === mode &&
    PRESETS_BY_MODE[mode].some(({ id }) => id === session.config.presetId);

  if (matchingPreset) {
    return {
      adaptive: session.config.adaptive,
      difficulty: session.config.startingDifficulty,
      focus: sessionFocus(session),
      preset: session.config.presetId as PresetId,
    };
  }

  const focus = normalizedFocus(mode, focusCategory);

  return {
    adaptive: true,
    difficulty: initialDifficulty(mode, difficulty, focus),
    focus,
    preset: PRESETS_BY_MODE[mode][0].id,
  };
}

export function SetupView({
  focusCategory = null,
  mode,
  onBack,
  onReady,
}: SetupViewProps) {
  const { createSession, progress, session } = useTrainer();
  const initial = setupDefaults(
    mode,
    progress.difficulty,
    session,
    focusCategory,
  );
  const [selectedPreset, setSelectedPreset] = useState<PresetId>(initial.preset);
  const [difficulty, setDifficulty] = useState(initial.difficulty);
  const [selectedFocus, setSelectedFocus] =
    useState<SequencesEstimationFocus>(initial.focus);
  const [adaptive, setAdaptive] = useState(initial.adaptive);
  const [pendingConfig, setPendingConfig] = useState<SessionConfig | null>(null);
  const prepareButtonRef = useRef<HTMLButtonElement>(null);
  const replaceButtonRef = useRef<HTMLButtonElement>(null);
  const returnPrepareFocusRef = useRef(false);
  const isPractice = mode !== "mock";
  const estimationDifficulty =
    mode === "sequences-estimation" && selectedFocus !== "sequences"
      ? difficulty
      : mode === "mock" && selectedPreset === "mixed-quant"
        ? getPreset("mixed-quant").startingDifficulty
        : null;
  const estimationTolerancePercent =
    estimationDifficulty === null
      ? null
      : Math.round(estimationToleranceForDifficulty(estimationDifficulty) * 100);

  useEffect(() => {
    const defaults = setupDefaults(
      mode,
      progress.difficulty,
      session,
      focusCategory,
    );
    setSelectedPreset(defaults.preset);
    setDifficulty(defaults.difficulty);
    setSelectedFocus(defaults.focus);
    setAdaptive(defaults.adaptive);
    setPendingConfig(null);
  }, [focusCategory, mode, progress.difficulty, session]);

  useLayoutEffect(() => {
    if (pendingConfig !== null) {
      replaceButtonRef.current?.focus();
    } else if (returnPrepareFocusRef.current) {
      returnPrepareFocusRef.current = false;
      prepareButtonRef.current?.focus();
    }
  }, [pendingConfig]);

  const createReadySession = (config: SessionConfig) => {
    createSession(config);
    setPendingConfig(null);
    onReady();
  };

  const keepCurrentSession = () => {
    returnPrepareFocusRef.current = true;
    setPendingConfig(null);
  };

  const handleReplaceDialogKeyDown = (
    event: ReactKeyboardEvent<HTMLElement>,
  ) => {
    if (event.key === "Escape") {
      event.preventDefault();
      keepCurrentSession();
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

  const prepareSession = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const config = getPreset(selectedPreset);

    if (
      config.mode !== "mock" &&
      Number.isSafeInteger(difficulty) &&
      difficulty >= 1 &&
      difficulty <= 10
    ) {
      config.startingDifficulty = difficulty;
      config.adaptive = adaptive;
      if (
        config.mode === "sequences-estimation" &&
        selectedFocus !== "both"
      ) {
        config.categories = [selectedFocus];
      }
    }

    if (session !== null && session.phase !== "completed") {
      setPendingConfig(config);
      return;
    }

    createReadySession(config);
  };

  return (
    <div className="setup-view">
      <button className="back-button" type="button" onClick={onBack}>
        <ArrowLeft aria-hidden="true" size={18} />
        Back to modes
      </button>

      <header className="view-intro">
        <p className="eyebrow">Session setup</p>
        <h1>{MODE_NAMES[mode]}</h1>
        <p>
          Set the constraint before you begin. Nothing starts—and no timer runs—until the session
          runner opens.
        </p>
      </header>

      <form className="setup-form" onSubmit={prepareSession}>
        <fieldset className="setup-group preset-group">
          <legend>Choose a session preset</legend>
          <p className="field-help">Question counts and timers stay fixed to reliable practice formats.</p>
          <div className="preset-options">
            {PRESETS_BY_MODE[mode].map((preset) => (
              <label className="preset-option" key={preset.id}>
                <input
                  type="radio"
                  name="preset"
                  value={preset.id}
                  aria-label={preset.label}
                  aria-describedby={`preset-note-${preset.id}`}
                  checked={selectedPreset === preset.id}
                  onChange={() => setSelectedPreset(preset.id)}
                />
                <span className="preset-option__check" aria-hidden="true">
                  <Check size={16} strokeWidth={2.5} />
                </span>
                <span>
                  <strong>{preset.label}</strong>
                  <small id={`preset-note-${preset.id}`}>{preset.note}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {mode === "sequences-estimation" ? (
          <fieldset className="setup-group focus-group">
            <legend>Training focus</legend>
            <p className="field-help">
              Choose a balanced set or target one quantitative skill.
            </p>
            <div className="preset-options focus-options">
              {FOCUS_CHOICES.map((choice) => (
                <label className="preset-option" key={choice.id}>
                  <input
                    type="radio"
                    name="training-focus"
                    value={choice.id}
                    aria-label={choice.label}
                    aria-describedby={`focus-note-${choice.id}`}
                    checked={selectedFocus === choice.id}
                    onChange={() => {
                      setSelectedFocus(choice.id);
                      setDifficulty(
                        initialDifficulty(mode, progress.difficulty, choice.id),
                      );
                    }}
                  />
                  <span className="preset-option__check" aria-hidden="true">
                    <Check size={16} strokeWidth={2.5} />
                  </span>
                  <span>
                    <strong>{choice.label}</strong>
                    <small id={`focus-note-${choice.id}`}>{choice.note}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {isPractice ? (
          <>
            <fieldset className="setup-group difficulty-group">
              <legend>Starting difficulty</legend>
              <p className="field-help" id="difficulty-help">
                Level 1 is foundational; level 10 is deliberately demanding.
              </p>
              <div className="difficulty-options">
                {DIFFICULTIES.map((level) => (
                  <label key={level}>
                    <input
                      type="radio"
                      name="difficulty"
                      value={level}
                      checked={difficulty === level}
                      aria-describedby="difficulty-help"
                      onChange={() => setDifficulty(level)}
                    />
                    <span>{level}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <section className="adaptive-setting" aria-labelledby="adaptive-heading">
              <Gauge aria-hidden="true" size={22} strokeWidth={1.7} />
              <div>
                <h2 id="adaptive-heading">Difficulty behavior</h2>
                <p>Feedback is immediate after each answer.</p>
                <p id="adaptive-help">
                  Adaptive practice uses your results to adjust future category levels. Turn it off
                  to lock this session to the selected level.
                </p>
              </div>
              <label className="switch-control">
                <input
                  type="checkbox"
                  checked={adaptive}
                  aria-describedby="adaptive-help"
                  onChange={(event) => setAdaptive(event.currentTarget.checked)}
                />
                <span aria-hidden="true" />
                Adaptive difficulty
              </label>
            </section>
          </>
        ) : (
          <section className="mock-rules" aria-labelledby="mock-rules-heading">
            <ShieldCheck aria-hidden="true" size={24} strokeWidth={1.7} />
            <div>
              <h2 id="mock-rules-heading">Interview rules are locked</h2>
              <p>Mock difficulty is fixed by the selected preset.</p>
              <p>Feedback is deferred until the interview ends.</p>
              <p>Pausing and skipping are unavailable so the result reflects one continuous attempt.</p>
            </div>
          </section>
        )}

        {estimationTolerancePercent === null ? null : (
          <section className="estimation-rule" aria-labelledby="estimation-rule-heading">
            <Target aria-hidden="true" size={22} strokeWidth={1.7} />
            <div>
              <h2 id="estimation-rule-heading">Estimation scoring</h2>
              <p>
                Estimation answers are accepted within ±{estimationTolerancePercent}% of the exact
                target.
              </p>
            </div>
          </section>
        )}

        <div className="setup-summary">
          <Timer aria-hidden="true" size={20} />
          <p>
            Preparing generates the full question set and saves it locally in a ready state. The
            clock remains stopped.
          </p>
          <button
            ref={prepareButtonRef}
            className="button button--primary"
            type="submit"
          >
            Prepare session
          </button>
        </div>

        {pendingConfig !== null ? (
          <section
            className="replace-confirmation"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="replace-session-heading"
            aria-describedby="replace-session-description"
            onKeyDown={handleReplaceDialogKeyDown}
          >
            <div>
              <h2 id="replace-session-heading">Replace saved session?</h2>
              <p id="replace-session-description">
                Your current incomplete session stays saved unless you explicitly replace it.
              </p>
            </div>
            <div className="replace-confirmation__actions">
              <button
                className="button button--secondary"
                type="button"
                onClick={keepCurrentSession}
              >
                Keep current session
              </button>
              <button
                ref={replaceButtonRef}
                className="button button--danger"
                type="button"
                onClick={() => createReadySession(pendingConfig)}
              >
                Replace session
              </button>
            </div>
          </section>
        ) : null}
      </form>
    </div>
  );
}
