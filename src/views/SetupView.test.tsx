import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSession as createDomainSession } from "../domain/session/session";
import { getPreset } from "../domain/session/presets";
import type { SessionMode, SessionState } from "../domain/session/types";
import { TrainerProvider, useTrainer } from "../features/trainer/useTrainer";
import { createDefaultProgress } from "../lib/progress-schema";
import { createProgressStore } from "../lib/progress-store";
import { SetupView } from "./SetupView";

function renderSetup(mode: SessionMode) {
  return render(
    <TrainerProvider storage={window.localStorage} now={() => 1_000}>
      <SetupView mode={mode} onBack={vi.fn()} onReady={vi.fn()} />
    </TrainerProvider>,
  );
}

function SessionProbe() {
  const { session } = useTrainer();

  return (
    <output data-testid="session-state">
      {session === null
        ? "none"
        : JSON.stringify({ phase: session.phase, config: session.config })}
    </output>
  );
}

function seedSession(session: SessionState) {
  const progress = createDefaultProgress();
  progress.activeSession = session;
  expect(createProgressStore(window.localStorage).save(progress)).toEqual({ ok: true });
}

describe("SetupView", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("offers every valid duration and question-count preset with exact labels", () => {
    const mental = renderSetup("mental-math");
    expect(screen.getByRole("radio", { name: "2 minutes · 20 questions" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "5 minutes · 50 questions" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "8 minutes · 80 questions" })).toBeInTheDocument();
    mental.unmount();

    const probability = renderSetup("probability");
    expect(screen.getByRole("radio", { name: "10 questions" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "20 questions" })).toBeInTheDocument();
    probability.unmount();

    const sequences = renderSetup("sequences-estimation");
    expect(screen.getByRole("heading", { name: "Sequences & Estimation" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "10 questions" })).toHaveAttribute(
      "value",
      "sequences-estimation-10",
    );
    expect(screen.getByRole("radio", { name: "20 questions" })).toHaveAttribute(
      "value",
      "sequences-estimation-20",
    );
    expect(
      within(screen.getByRole("group", { name: "Training focus" })).getByRole(
        "radio",
        { name: "Both" },
      ),
    ).toBeChecked();
    sequences.unmount();

    renderSetup("mock");
    expect(
      screen.getByRole("radio", { name: "Speed Arithmetic · 8 minutes · 80 questions" }),
    ).toHaveAttribute("value", "speed-arithmetic");
    expect(
      screen.getByRole("radio", { name: "Mixed Quant · 20 minutes · 30 questions" }),
    ).toHaveAttribute("value", "mixed-quant");
  });

  it("exposes difficulty 1–10 and adaptive control only for immediate-feedback practice", () => {
    const practice = renderSetup("probability");
    expect(
      screen.getByText("Feedback is immediate after each answer."),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: "Starting difficulty" })).getAllByRole("radio"),
    ).toHaveLength(10);
    expect(screen.getByRole("checkbox", { name: "Adaptive difficulty" })).toBeChecked();
    practice.unmount();

    renderSetup("mock");
    expect(
      screen.getByText("Feedback is deferred until the interview ends."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Mock difficulty is fixed by the selected preset."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Starting difficulty" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Adaptive difficulty" })).not.toBeInTheDocument();
  });

  it("discloses every estimation tolerance boundary whenever estimation is included", async () => {
    const user = userEvent.setup();
    const view = renderSetup("sequences-estimation");
    const difficultyGroup = screen.getByRole("group", {
      name: "Starting difficulty",
    });

    expect(screen.getByText(/accepted within ±10%/i)).toBeInTheDocument();
    await user.click(within(difficultyGroup).getByRole("radio", { name: "2" }));
    expect(screen.getByText(/accepted within ±15%/i)).toBeInTheDocument();
    await user.click(within(difficultyGroup).getByRole("radio", { name: "6" }));
    expect(screen.getByText(/accepted within ±7%/i)).toBeInTheDocument();
    await user.click(within(difficultyGroup).getByRole("radio", { name: "9" }));
    expect(screen.getByText(/accepted within ±5%/i)).toBeInTheDocument();

    await user.click(
      within(screen.getByRole("group", { name: "Training focus" })).getByRole(
        "radio",
        { name: "Sequences" },
      ),
    );
    expect(screen.queryByText(/accepted within ±/i)).not.toBeInTheDocument();
    view.unmount();

    renderSetup("mock");
    expect(screen.queryByText(/accepted within ±/i)).not.toBeInTheDocument();
    await user.click(screen.getByLabelText(/Mixed Quant/i));
    expect(screen.getByText(/accepted within ±10%/i)).toBeInTheDocument();
  });

  it("clones a practice preset, applies valid overrides, and prepares without starting", async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();
    render(
      <TrainerProvider storage={window.localStorage} now={() => 5_000}>
        <SetupView mode="probability" onBack={vi.fn()} onReady={onReady} />
        <SessionProbe />
      </TrainerProvider>,
    );

    await user.click(screen.getByRole("radio", { name: "20 questions" }));
    await user.click(
      within(screen.getByRole("group", { name: "Starting difficulty" })).getByRole(
        "radio",
        { name: "7" },
      ),
    );
    await user.click(screen.getByRole("checkbox", { name: "Adaptive difficulty" }));
    await user.click(screen.getByRole("button", { name: "Prepare session" }));

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("session-state")).toHaveTextContent('"phase":"ready"');
    expect(screen.getByTestId("session-state")).not.toHaveTextContent('"phase":"active"');
    expect(screen.getByTestId("session-state")).toHaveTextContent(
      '"presetId":"probability-20"',
    );
    expect(screen.getByTestId("session-state")).toHaveTextContent(
      '"startingDifficulty":7',
    );
    expect(screen.getByTestId("session-state")).toHaveTextContent('"adaptive":false');
    expect(getPreset("probability-20")).toMatchObject({
      startingDifficulty: 3,
      adaptive: true,
    });
  });

  it("does not replace an incomplete session until explicit confirmation", async () => {
    const existing = createDomainSession(getPreset("mental-2m"), 77);
    seedSession(existing);
    const user = userEvent.setup();
    const onReady = vi.fn();
    render(
      <TrainerProvider storage={window.localStorage} now={() => 9_000}>
        <SetupView mode="probability" onBack={vi.fn()} onReady={onReady} />
        <SessionProbe />
      </TrainerProvider>,
    );

    const prepareButton = screen.getByRole("button", { name: "Prepare session" });
    await user.click(prepareButton);

    expect(
      screen.getByRole("alertdialog", { name: "Replace saved session?" }),
    ).toBeInTheDocument();
    const replaceButton = screen.getByRole("button", { name: "Replace session" });
    const keepButton = screen.getByRole("button", { name: "Keep current session" });
    expect(replaceButton).toHaveFocus();
    expect(screen.getByTestId("session-state")).toHaveTextContent('"presetId":"mental-2m"');
    expect(onReady).not.toHaveBeenCalled();
    await user.keyboard("{Tab}");
    expect(keepButton).toHaveFocus();
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(replaceButton).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Replace session" })).not.toBeInTheDocument();
    expect(prepareButton).toHaveFocus();
    expect(screen.getByTestId("session-state")).toHaveTextContent('"presetId":"mental-2m"');

    await user.click(prepareButton);
    const confirmedReplace = screen.getByRole("button", { name: "Replace session" });
    expect(confirmedReplace).toHaveFocus();
    await user.click(confirmedReplace);

    expect(screen.getByTestId("session-state")).toHaveTextContent(
      '"presetId":"probability-10"',
    );
    expect(screen.getByTestId("session-state")).toHaveTextContent('"phase":"ready"');
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("restores a matching prepared session preset, difficulty, and adaptive setting", () => {
    const config = getPreset("probability-20");
    config.startingDifficulty = 7;
    config.adaptive = false;
    seedSession(createDomainSession(config, 91));

    renderSetup("probability");

    expect(screen.getByRole("radio", { name: "20 questions" })).toBeChecked();
    expect(
      within(screen.getByRole("group", { name: "Starting difficulty" })).getByRole(
        "radio",
        { name: "7" },
      ),
    ).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Adaptive difficulty" })).not.toBeChecked();
  });
});
