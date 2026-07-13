import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../app/App";
import type { Question } from "../domain/questions/types";
import { getPreset } from "../domain/session/presets";
import {
  createSession as createDomainSession,
  sessionReducer,
} from "../domain/session/session";
import type { SessionState } from "../domain/session/types";
import { TrainerProvider } from "../features/trainer/useTrainer";
import { createDefaultProgress } from "../lib/progress-schema";
import { createProgressStore } from "../lib/progress-store";
import { SessionView } from "./SessionView";

function answerInput(question: Question): string {
  switch (question.answer.kind) {
    case "choice":
      return question.answer.value;
    case "fraction":
      return `${question.answer.numerator}/${question.answer.denominator}`;
    case "number":
    case "estimate":
      return String(question.answer.value);
  }
}

function seedSession(session: SessionState) {
  const progress = createDefaultProgress();
  progress.activeSession = session;
  expect(createProgressStore(window.localStorage).save(progress)).toEqual({ ok: true });
}

function renderSession(session: SessionState, now: () => number = () => 10_000) {
  seedSession(session);
  const onAdjust = vi.fn();
  const onExit = vi.fn();

  render(
    <TrainerProvider storage={window.localStorage} now={now}>
      <SessionView onAdjust={onAdjust} onExit={onExit} />
    </TrainerProvider>,
  );

  return { onAdjust, onExit };
}

describe("SessionView", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("keeps a prepared session stopped until the explicit begin action", async () => {
    const session = createDomainSession(getPreset("mental-2m"), 41);
    const user = userEvent.setup();
    const { onAdjust } = renderSession(session);

    expect(screen.getByRole("heading", { name: "Session ready" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Your answer")).not.toBeInTheDocument();
    expect(screen.getByText("02:00")).toBeInTheDocument();
    expect(screen.getByTestId("countdown-seconds")).toHaveTextContent("120");

    await user.click(screen.getByRole("button", { name: "Adjust setup" }));
    expect(onAdjust).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Begin practice" }));
    expect(screen.getByText("Question 1 of 20")).toBeInTheDocument();
    expect(screen.getByLabelText("Your answer")).toHaveFocus();
  });

  it("discloses estimation tolerance on the ready screen", () => {
    const config = getPreset("sequences-estimation-10");
    config.startingDifficulty = 2;
    renderSession(createDomainSession(config, 51));

    expect(screen.getByText(/accepted within ±15%/i)).toBeInTheDocument();
  });

  it("supports type-to-focus, Enter submission, associated errors, and immediate practice feedback", async () => {
    const session = createDomainSession(getPreset("mental-2m"), 61);
    const question = session.questions[0];
    const user = userEvent.setup();
    renderSession(session);

    await user.click(screen.getByRole("button", { name: "Begin practice" }));
    const input = screen.getByLabelText("Your answer");
    input.blur();
    await user.keyboard("7");
    expect(input).toHaveFocus();
    expect(input).toHaveValue("7");

    await user.clear(input);
    await user.type(input, "not-a-number{Enter}");
    const error = screen.getByRole("alert");
    expect(error).toHaveTextContent(/enter a number|fraction bar/i);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", error.id);

    await user.clear(input);
    await user.type(input, `${answerInput(question)}{Enter}`);

    expect(screen.getByRole("status")).toHaveTextContent("Correct");
    expect(screen.getByText(question.explanation)).toBeInTheDocument();
  });

  it("lets practice sessions pause, resume, and skip while freezing an untimed clock", async () => {
    const session = createDomainSession(getPreset("probability-10"), 79);
    const user = userEvent.setup();
    renderSession(session);

    await user.click(screen.getByRole("button", { name: "Begin practice" }));
    expect(screen.getByText("Untimed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pause session" }));

    expect(screen.getByRole("heading", { name: "Session paused" })).toBeInTheDocument();
    expect(screen.getByText("Untimed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Resume session" }));
    await user.click(screen.getByRole("button", { name: "Skip question" }));

    expect(screen.getByText("Question 2 of 10")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Skipped");
  });

  it("keeps feedback and practice-only controls out of Speed Arithmetic while advancing", async () => {
    const session = createDomainSession(getPreset("speed-arithmetic"), 101);
    const question = session.questions[0];
    const user = userEvent.setup();
    renderSession(session);

    await user.click(screen.getByRole("button", { name: "Begin test" }));
    expect(screen.getByText("Question 1 of 80")).toBeInTheDocument();
    expect(screen.getByText("08:00")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause session" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Skip question" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit test" })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Your answer"), `${answerInput(question)}{Enter}`);

    expect(screen.getByText("Question 2 of 80")).toBeInTheDocument();
    expect(screen.queryByText("Correct")).not.toBeInTheDocument();
    expect(screen.queryByText(question.explanation)).not.toBeInTheDocument();
    expect(screen.getByText(/feedback appears after the test ends/i)).toBeInTheDocument();
  });

  it("uses native radios for choice answers", async () => {
    let session: SessionState | undefined;
    const choiceConfig = getPreset("probability-10");
    choiceConfig.startingDifficulty = 9;
    for (let seed = 1; seed < 500 && session === undefined; seed += 1) {
      const candidate = createDomainSession(choiceConfig, seed);
      if (candidate.questions[0].answer.kind === "choice") {
        session = candidate;
      }
    }
    expect(session).toBeDefined();
    const user = userEvent.setup();
    renderSession(session!);
    await user.click(screen.getByRole("button", { name: "Begin practice" }));

    const answerGroup = screen.getByRole("radiogroup", { name: "Your answer" });
    const choices = within(answerGroup).getAllByRole("radio");
    expect(choices.length).toBeGreaterThan(1);
    await user.click(choices[0]);
    expect(choices[0]).toBeChecked();
  });

  it("submits a generated denominator-one fraction using its displayed integer", async () => {
    const config = getPreset("probability-10");
    config.startingDifficulty = 5;
    let session: SessionState | undefined;

    for (let seed = 1; seed < 2_000 && session === undefined; seed += 1) {
      const candidate = createDomainSession(config, seed);
      const answer = candidate.questions[0]?.answer;
      if (answer?.kind === "fraction" && answer.denominator === 1) {
        session = candidate;
      }
    }

    expect(session).toBeDefined();
    const answer = session!.questions[0].answer;
    expect(answer.kind).toBe("fraction");
    expect(answer.display).not.toContain("/");
    const user = userEvent.setup();
    renderSession(session!);

    await user.click(screen.getByRole("button", { name: "Begin practice" }));
    await user.type(
      screen.getByRole("textbox", { name: "Your answer" }),
      `${answer.display}{Enter}`,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Correct");
  });

  it("preserves saved Mixed Quant answers while navigating numbered questions", async () => {
    const session = createDomainSession(getPreset("mixed-quant"), 131);
    const firstAnswer = answerInput(session.questions[0]);
    const user = userEvent.setup();
    renderSession(session);

    await user.click(screen.getByRole("button", { name: "Begin test" }));
    const input = screen.getByLabelText("Your answer");
    await user.type(input, firstAnswer);
    await user.click(screen.getByRole("button", { name: "Save answer" }));
    expect(screen.getByRole("button", { name: /Question 1, answered/i })).toHaveAttribute(
      "aria-current",
      "step",
    );

    await user.click(screen.getByRole("button", { name: /^Question 2,/i }));
    expect(screen.getByText("Question 2 of 30")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Question 1, answered/i }));

    expect(screen.getByLabelText("Your answer")).toHaveValue(firstAnswer);
  });

  it("confirms an accessible early Mixed Quant submission and restores focus on cancel", async () => {
    const session = createDomainSession(getPreset("mixed-quant"), 141);
    const user = userEvent.setup();
    renderSession(session);
    await user.click(screen.getByRole("button", { name: "Begin test" }));

    const trigger = screen.getByRole("button", { name: "Submit test" });
    await user.click(trigger);
    const dialog = screen.getByRole("alertdialog", {
      name: "Submit Mixed Quant?",
    });
    const cancel = within(dialog).getByRole("button", { name: "Keep working" });
    const confirm = within(dialog).getByRole("button", { name: "Submit test" });
    expect(cancel).toHaveFocus();
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(confirm).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(
      within(
        screen.getByRole("alertdialog", { name: "Submit Mixed Quant?" }),
      ).getByRole("button", { name: "Submit test" }),
    );
    expect(screen.getByRole("heading", { name: "Results are ready" })).toBeInTheDocument();
  });

  it("confirms abandon and restores focus when the user keeps training", async () => {
    const session = createDomainSession(getPreset("mental-2m"), 151);
    const user = userEvent.setup();
    renderSession(session);

    await user.click(screen.getByRole("button", { name: "Begin practice" }));
    const endButton = screen.getByRole("button", { name: "End session" });
    await user.click(endButton);
    const dialog = screen.getByRole("alertdialog", { name: "End this session?" });
    const cancel = within(dialog).getByRole("button", { name: "Keep training" });
    const confirm = within(dialog).getByRole("button", { name: "End and leave" });
    expect(cancel).toHaveFocus();
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(confirm).toHaveFocus();
    await user.keyboard("{Tab}");
    expect(cancel).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(endButton).toHaveFocus();
  });

  it("routes an expired restored session directly to its results", () => {
    const ready = createDomainSession(getPreset("mental-2m"), 181);
    const active = sessionReducer(ready, { type: "start", nowMs: 1_000 });
    seedSession(active);
    const now = vi.spyOn(Date, "now").mockReturnValue(active.deadlineMs! + 5_000);

    render(<App />);

    expect(screen.getByRole("heading", { name: "Session results" })).toBeInTheDocument();
    expect(screen.getByText("0 / 20")).toBeInTheDocument();
    now.mockRestore();
  });
});
