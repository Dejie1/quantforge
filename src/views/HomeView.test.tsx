import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSession } from "../domain/session/session";
import { getPreset } from "../domain/session/presets";
import type { SessionMode } from "../domain/session/types";
import { useTrainer, type TrainerController } from "../features/trainer/useTrainer";
import { createDefaultProgress } from "../lib/progress-schema";
import { HomeView } from "./HomeView";

vi.mock("../features/trainer/useTrainer", () => ({
  useTrainer: vi.fn(),
}));

function controller(
  overrides: Partial<TrainerController> = {},
): TrainerController {
  return {
    progress: createDefaultProgress(),
    session: null,
    result: null,
    input: "",
    inputError: null,
    storageWarning: false,
    createSession: vi.fn(),
    startSession: vi.fn(),
    setInput: vi.fn(),
    submitAnswer: vi.fn(),
    skipQuestion: vi.fn(),
    navigateQuestion: vi.fn(),
    pauseSession: vi.fn(),
    resumeSession: vi.fn(),
    finishSession: vi.fn(),
    abandonSession: vi.fn(),
    clearResult: vi.fn(),
    updatePreferences: vi.fn(),
    resetProgress: vi.fn(),
    dismissStorageWarning: vi.fn(),
    ...overrides,
  };
}

describe("HomeView", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 12, 9, 30));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("renders the four exact modes, daily goal, and aggregate training metrics", () => {
    const progress = createDefaultProgress();
    progress.dailyActivity["2026-07-12"] = {
      questions: 12,
      correct: 9,
      milliseconds: 90_000,
    };
    progress.categoryStats = {
      arithmetic: {
        answered: 10,
        correct: 8,
        totalResponseTimeMs: 40_000,
        bestStreak: 4,
      },
      probability: {
        answered: 10,
        correct: 7,
        totalResponseTimeMs: 60_000,
        bestStreak: 7,
      },
      sequences: {
        answered: 10,
        correct: 9,
        totalResponseTimeMs: 30_000,
        bestStreak: 6,
      },
      estimation: {
        answered: 10,
        correct: 6,
        totalResponseTimeMs: 70_000,
        bestStreak: 3,
      },
    };
    progress.recentSessions = [
      {
        id: "recent-scored-session",
        presetId: "probability-10",
        completedAtMs: Date.now() - 1_000,
        correct: 3,
        total: 4,
        accuracy: 0.75,
        medianResponseTimeMs: 5_000,
      },
    ];
    vi.mocked(useTrainer).mockReturnValue(controller({ progress }));

    const { container } = render(
      <HomeView onResume={vi.fn()} onSelectMode={vi.fn()} />,
    );

    expect(
      screen.getByRole("heading", { name: "Think clearly. Move quickly." }),
    ).toBeInTheDocument();
    const modes = screen.getByRole("list", { name: "Training modes" });
    for (const name of [
      "Mental Math Sprint",
      "Probability Lab",
      "Sequences & Estimation",
      "Mock Interview",
    ]) {
      expect(within(modes).getByRole("heading", { name })).toBeInTheDocument();
    }
    expect(
      screen.getByRole("article", { name: "Questions today: 12" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("article", { name: "Recent accuracy: 75%" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("article", { name: "Average speed: 5.0s" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("article", { name: "Best streak: 7" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "12 of 20 daily goal questions" }),
    ).toHaveAttribute("aria-valuenow", "12");
    expect(
      screen.getByText("Your training data is stored only in this browser."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resume session" })).not.toBeInTheDocument();
    expect(container.querySelector("main")).not.toBeInTheDocument();
    expect(container.querySelector("canvas")).not.toBeInTheDocument();
  });

  it("averages the newest five scored sessions and renders an em dash without scored history", () => {
    const progress = createDefaultProgress();
    const accuracies = [null, 1, 0.8, 0.6, 0.4, 0.2, 0] as const;
    progress.recentSessions = accuracies.map((accuracy, index) => ({
      id: `recent-${index}`,
      presetId: "probability-10",
      completedAtMs: 10_000 - index,
      correct: accuracy === null ? 0 : Math.round(accuracy * 10),
      total: 10,
      accuracy,
      medianResponseTimeMs: 1_000,
    }));
    vi.mocked(useTrainer).mockReturnValue(controller({ progress }));

    const { rerender } = render(
      <HomeView onResume={vi.fn()} onSelectMode={vi.fn()} />,
    );

    expect(
      screen.getByRole("article", { name: "Recent accuracy: 60%" }),
    ).toHaveTextContent("Newest 5 scored sessions");

    progress.recentSessions = progress.recentSessions.map((summary) => ({
      ...summary,
      accuracy: null,
    }));
    vi.mocked(useTrainer).mockReturnValue(controller({ progress }));
    rerender(<HomeView onResume={vi.fn()} onSelectMode={vi.fn()} />);

    expect(
      screen.getByRole("article", { name: "Recent accuracy: —" }),
    ).toHaveTextContent("No scored sessions yet");
  });

  it("offers accessible start and mode actions and only shows resume for an incomplete session", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const onSelectMode = vi.fn<(mode: SessionMode) => void>();
    const onResume = vi.fn();
    const base = controller();
    vi.mocked(useTrainer).mockReturnValue(base);

    const { rerender } = render(
      <HomeView onResume={onResume} onSelectMode={onSelectMode} />,
    );

    await user.click(screen.getByRole("button", { name: "Start training" }));
    await user.click(
      screen.getByRole("button", { name: "Set up Probability Lab" }),
    );
    expect(onSelectMode).toHaveBeenNthCalledWith(1, "mental-math");
    expect(onSelectMode).toHaveBeenNthCalledWith(2, "probability");

    const session = createSession(getPreset("mental-2m"), 42);
    vi.mocked(useTrainer).mockReturnValue(
      controller({
        session,
        progress: { ...base.progress, activeSession: session },
      }),
    );
    rerender(<HomeView onResume={onResume} onSelectMode={onSelectMode} />);

    expect(
      screen.getByRole("heading", { name: "Resume your session" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Resume session" }));
    expect(onResume).toHaveBeenCalledTimes(1);
  });
});
