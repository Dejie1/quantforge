import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TrainerProvider } from "../features/trainer/useTrainer";
import { createDefaultProgress } from "../lib/progress-schema";
import { createProgressStore } from "../lib/progress-store";
import { ProgressView } from "./ProgressView";

function seedProgress() {
  const progress = createDefaultProgress();
  progress.categoryStats.arithmetic = {
    answered: 10,
    correct: 8,
    totalResponseTimeMs: 42_000,
    bestStreak: 5,
  };
  progress.categoryStats.probability = {
    answered: 4,
    correct: 2,
    totalResponseTimeMs: 24_000,
    bestStreak: 2,
  };
  progress.recentSessions = [
    {
      id: "session-recent",
      presetId: "probability-10",
      completedAtMs: new Date(2026, 6, 11, 14, 30).getTime(),
      correct: 8,
      total: 10,
      accuracy: 0.8,
      medianResponseTimeMs: 4_200,
    },
  ];
  expect(createProgressStore(window.localStorage).save(progress)).toEqual({ ok: true });
  return progress;
}

function renderProgress() {
  return render(
    <TrainerProvider storage={window.localStorage} now={() => 10_000}>
      <ProgressView />
    </TrainerProvider>,
  );
}

describe("ProgressView", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.dataset.theme = "dark";
    document.documentElement.dataset.reducedMotion = "false";
  });

  afterEach(() => {
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.reducedMotion;
  });

  it("renders semantic category bars and recent-session details without canvas charts", () => {
    seedProgress();
    const { container } = renderProgress();

    const categories = screen.getByRole("list", { name: "Category performance" });
    for (const category of ["Arithmetic", "Probability", "Sequences", "Estimation"]) {
      expect(within(categories).getByRole("heading", { name: category })).toBeInTheDocument();
    }
    expect(
      within(categories).getByRole("meter", { name: "Arithmetic accuracy: 80%" }),
    ).toHaveAttribute("aria-valuenow", "80");
    expect(within(categories).getByText("10 answered")).toBeInTheDocument();
    const sequencesArticle = within(categories)
      .getByRole("heading", { name: "Sequences" })
      .closest("article");
    expect(sequencesArticle).not.toBeNull();
    expect(within(sequencesArticle!).queryByRole("meter")).not.toBeInTheDocument();
    expect(within(sequencesArticle!).getByText("No accuracy data yet")).toBeInTheDocument();
    const recent = screen.getByRole("list", { name: "Recent sessions" });
    expect(within(recent).getByText("Probability · 10 questions")).toBeInTheDocument();
    expect(within(recent).getByText("8 / 10 correct")).toBeInTheDocument();
    expect(container.querySelector("canvas")).not.toBeInTheDocument();
    expect(container.querySelector("main")).not.toBeInTheDocument();
  });

  it("renders a safe fallback for finite timestamps outside the Date range", () => {
    const progress = seedProgress();
    progress.recentSessions[0].completedAtMs = Number.MAX_VALUE;
    expect(createProgressStore(window.localStorage).save(progress)).toEqual({ ok: true });

    expect(() => renderProgress()).not.toThrow();
    expect(screen.getByText("Date unavailable")).toBeInTheDocument();
  });

  it("applies theme and reduced-motion preferences to the root and persists them", async () => {
    seedProgress();
    const user = userEvent.setup();
    const mounted = renderProgress();

    expect(document.documentElement.dataset.theme).toBe("dark");
    await user.click(screen.getByRole("button", { name: "Use light theme" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByRole("button", { name: "Use dark theme" })).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Reduce motion" }));
    expect(document.documentElement.dataset.reducedMotion).toBe("true");
    await user.click(screen.getByRole("radio", { name: "30 questions" }));

    await waitFor(() => {
      expect(createProgressStore(window.localStorage).load(10_000).preferences).toEqual({
        theme: "light",
        reducedMotion: true,
        dailyGoal: 30,
      });
    });

    mounted.unmount();
    renderProgress();
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.reducedMotion).toBe("true");
  });

  it("keeps reset reversible at confirmation, then deletes only after the explicit second step", async () => {
    seedProgress();
    const user = userEvent.setup();
    renderProgress();

    expect(
      screen.getByText("Everything here is stored only in this browser. Nothing is uploaded."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset progress" }));
    expect(
      screen.getByText("Delete all local training progress?"),
    ).toBeInTheDocument();
    const deleteButton = screen.getByRole("button", { name: "Delete my local progress" });
    const cancelButton = screen.getByRole("button", { name: "Cancel reset" });
    expect(screen.getByRole("alertdialog")).toHaveAttribute("aria-modal", "true");
    expect(deleteButton).toHaveFocus();
    await user.keyboard("{Tab}");
    expect(cancelButton).toHaveFocus();
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(deleteButton).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Delete my local progress" })).not.toBeInTheDocument();
    const resetButton = screen.getByRole("button", { name: "Reset progress" });
    expect(resetButton).toHaveFocus();
    expect(screen.getByText("10 answered")).toBeInTheDocument();

    await user.click(resetButton);
    const confirmedDelete = screen.getByRole("button", { name: "Delete my local progress" });
    expect(confirmedDelete).toHaveFocus();
    await user.click(confirmedDelete);

    expect(screen.getByText("No completed sessions yet.")).toBeInTheDocument();
    expect(screen.getAllByText("0 answered")).toHaveLength(4);
    expect(window.localStorage.length).toBe(0);
    expect(screen.getByRole("button", { name: "Reset progress" })).toHaveFocus();
  });
});
