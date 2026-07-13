import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { validateAnswer } from "../domain/answers";
import type { Question, QuestionCategory } from "../domain/questions/types";
import { getPreset } from "../domain/session/presets";
import {
  createSession as createDomainSession,
  sessionReducer,
} from "../domain/session/session";
import type { SessionState } from "../domain/session/types";
import { TrainerProvider, useTrainer } from "../features/trainer/useTrainer";
import { createDefaultProgress } from "../lib/progress-schema";
import { createProgressStore } from "../lib/progress-store";
import { App, AppContent } from "./App";

function inputFor(question: Question, correct: boolean): string {
  switch (question.answer.kind) {
    case "choice":
      return correct ? question.answer.value : `${question.answer.value}-incorrect`;
    case "fraction":
      return correct
        ? `${question.answer.numerator}/${question.answer.denominator}`
        : `${question.answer.numerator + question.answer.denominator}/${question.answer.denominator}`;
    case "number":
      return String(question.answer.value + (correct ? 0 : 1));
    case "estimate": {
      if (correct) {
        return String(question.answer.value);
      }
      const offset =
        Math.max(1, Math.abs(question.answer.value)) *
        (question.answer.toleranceRatio + 1);
      return String(question.answer.value + offset);
    }
  }
}

function completeSequencesEstimationSession(
  weakestCategory: Extract<QuestionCategory, "sequences" | "estimation">,
): SessionState {
  const config = getPreset("sequences-estimation-10");
  config.adaptive = false;
  let session = sessionReducer(createDomainSession(config, 311), {
    type: "start",
    nowMs: 1_000,
  });

  for (let index = 0; index < session.questions.length; index += 1) {
    const question = session.questions[session.currentIndex];
    const input = inputFor(question, question.category !== weakestCategory);
    const validation = validateAnswer(input, question.answer);
    if (validation.status !== "valid") {
      throw new Error("Failed to create a completed result fixture");
    }
    session = sessionReducer(session, {
      type: "submit",
      input,
      validation,
      nowMs: 2_000 + index * 1_000,
    });
  }

  return session;
}

function SessionConfigProbe() {
  const { session } = useTrainer();
  return (
    <output data-testid="app-session-config">
      {session === null ? "none" : JSON.stringify(session.config)}
    </output>
  );
}

function seedSession(session: SessionState) {
  const progress = createDefaultProgress();
  progress.activeSession = session;
  expect(createProgressStore(window.localStorage).save(progress)).toEqual({ ok: true });
}

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.reducedMotion;
  });

  it("renders the product identity and primary practice action", () => {
    render(<App />);
    expect(screen.getByText("QuantForge")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start training/i })).toBeInTheDocument();
  });

  it("owns the skip link and exactly one header, navigation, and normal main landmark", () => {
    const { container } = render(<App />);

    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute(
      "href",
      "#main-content",
    );
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(screen.getByText("Quant interview training")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View QuantForge source code on GitHub" }),
    ).toHaveAttribute("href", "https://github.com/Dejie1/quantforge");
  });

  it("uses local view state to open setup while preserving one main landmark", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    const main = screen.getByRole("main");

    await user.click(screen.getByRole("button", { name: "Start training" }));

    expect(screen.getByRole("heading", { name: "Mental Math Sprint" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "2 minutes · 20 questions" })).toBeInTheDocument();
    expect(main).toHaveFocus();
    expect(container.querySelectorAll("main")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Progress" }));
    expect(screen.getByRole("heading", { name: "See the signal. Choose the next rep." })).toBeInTheDocument();
    expect(main).toHaveFocus();
  });

  it("starts each navigated view at the top without focus-induced scrolling", async () => {
    const user = userEvent.setup();
    render(<App />);

    document.documentElement.scrollTop = 240;
    document.body.scrollTop = 240;
    await user.click(screen.getByRole("button", { name: "Start training" }));

    expect(document.documentElement.scrollTop).toBe(0);
    expect(document.body.scrollTop).toBe(0);
    expect(screen.getByRole("main")).toHaveFocus();

    document.documentElement.scrollTop = 180;
    await user.click(screen.getByRole("button", { name: "Progress" }));
    expect(document.documentElement.scrollTop).toBe(0);
  });

  it("keeps mode cards in semantic list controls without canvas-only content", () => {
    const { container } = render(<App />);
    const modes = screen.getByRole("list", { name: "Training modes" });

    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeInTheDocument();
    expect(modes.children).toHaveLength(4);
    expect(within(modes).getAllByRole("button")).toHaveLength(4);
    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(container.querySelector("canvas")).not.toBeInTheDocument();
  });

  it("restores the prepared setup when adjusting a ready session", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Start training" }));
    await user.click(screen.getByRole("radio", { name: "5 minutes · 50 questions" }));
    await user.click(
      within(screen.getByRole("group", { name: "Starting difficulty" })).getByRole(
        "radio",
        { name: "7" },
      ),
    );
    await user.click(screen.getByRole("checkbox", { name: "Adaptive difficulty" }));
    await user.click(screen.getByRole("button", { name: "Prepare session" }));
    await user.click(screen.getByRole("button", { name: "Adjust setup" }));

    expect(screen.getByRole("heading", { name: "Mental Math Sprint" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "5 minutes · 50 questions" })).toBeChecked();
    expect(
      within(screen.getByRole("group", { name: "Starting difficulty" })).getByRole(
        "radio",
        { name: "7" },
      ),
    ).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Adaptive difficulty" })).not.toBeChecked();
  });

  it("describes the Speed Arithmetic 3–9 ramp in its ready summary", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Set up Mock Interview" }));
    await user.click(screen.getByRole("button", { name: "Prepare session" }));

    expect(screen.getByRole("heading", { name: "Session ready" })).toBeInTheDocument();
    expect(screen.getByText("3–9 difficulty ramp")).toBeInTheDocument();
  });

  it("abandons before a timed deadline without recording a result", async () => {
    const ready = createDomainSession(getPreset("mental-2m"), 401);
    const active = sessionReducer(ready, { type: "start", nowMs: 1_000 });
    seedSession(active);
    let nowMs = 1_000;
    const user = userEvent.setup();

    render(
      <TrainerProvider storage={window.localStorage} now={() => nowMs}>
        <AppContent />
      </TrainerProvider>,
    );

    expect(screen.getByText("Question 1 of 20")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "End session" }));
    const dialog = screen.getByRole("alertdialog", { name: "End this session?" });
    nowMs = active.deadlineMs! - 1;
    await user.click(within(dialog).getByRole("button", { name: "End and leave" }));

    expect(screen.getByRole("heading", { name: "Think clearly. Move quickly." })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Session results" })).not.toBeInTheDocument();
    await waitFor(() => {
      const progress = createProgressStore(window.localStorage).load(nowMs);
      expect(progress.activeSession).toBeNull();
      expect(progress.recentSessions).toHaveLength(0);
    });
  });

  it("finalizes once when abandon is confirmed at a timed deadline", async () => {
    const ready = createDomainSession(getPreset("mental-2m"), 402);
    const active = sessionReducer(ready, { type: "start", nowMs: 1_000 });
    seedSession(active);
    let nowMs = 1_000;
    const user = userEvent.setup();

    render(
      <TrainerProvider storage={window.localStorage} now={() => nowMs}>
        <AppContent />
      </TrainerProvider>,
    );

    expect(screen.getByText("Question 1 of 20")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "End session" }));
    const dialog = screen.getByRole("alertdialog", { name: "End this session?" });
    nowMs = active.deadlineMs!;
    await user.click(within(dialog).getByRole("button", { name: "End and leave" }));

    expect(screen.getByRole("heading", { name: "Session results" })).toBeInTheDocument();
    expect(screen.getByText("0 / 20")).toBeInTheDocument();
    await waitFor(() => {
      const recentSessions = createProgressStore(window.localStorage).load(nowMs).recentSessions;
      expect(recentSessions).toHaveLength(1);
      expect(recentSessions[0].id).toBe(active.id);
    });
  });

  it.each([
    ["sequences", 7],
    ["estimation", 9],
  ] as const)(
    "preserves %s as the selected and prepared weakness category",
    async (weakestCategory, expectedDifficulty) => {
      const progress = createDefaultProgress();
      progress.difficulty.sequences = 7;
      progress.difficulty.estimation = 9;
      progress.activeSession = completeSequencesEstimationSession(weakestCategory);
      expect(createProgressStore(window.localStorage).save(progress)).toEqual({ ok: true });
      const user = userEvent.setup();

      render(
        <TrainerProvider storage={window.localStorage} now={() => 20_000}>
          <AppContent />
          <SessionConfigProbe />
        </TrainerProvider>,
      );

      await user.click(screen.getByRole("button", { name: "Train this weakness" }));

      const focus = screen.getByRole("group", { name: "Training focus" });
      expect(
        within(focus).getByRole("radio", {
          name: weakestCategory === "sequences" ? "Sequences" : "Estimation",
        }),
      ).toBeChecked();
      expect(
        within(screen.getByRole("group", { name: "Starting difficulty" })).getByRole(
          "radio",
          { name: String(expectedDifficulty) },
        ),
      ).toBeChecked();

      await user.click(screen.getByRole("button", { name: "Prepare session" }));

      expect(screen.getByRole("heading", { name: "Session ready" })).toBeInTheDocument();
      expect(screen.getByTestId("app-session-config")).toHaveTextContent(
        `"categories":["${weakestCategory}"]`,
      );
    },
  );
});
