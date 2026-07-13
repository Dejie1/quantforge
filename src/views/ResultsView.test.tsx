import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Question, QuestionCategory } from "../domain/questions/types";
import type {
  CategoryResult,
  QuestionOutcome,
  ReviewRow,
  SessionResult,
} from "../domain/session/types";
import { ResultsView } from "./ResultsView";

function question(
  id: string,
  category: QuestionCategory,
  prompt: string,
  answer: string,
): Question {
  return {
    id,
    category,
    topic: `${category} topic`,
    difficulty: 4,
    prompt,
    answer: { kind: "number", value: Number(answer), display: answer },
    explanation: `Worked explanation for ${id}.`,
    targetTimeMs: 5_000,
  };
}

function row(
  item: Question,
  outcome: QuestionOutcome,
  input: string | null,
  responseTimeMs: number | null,
): ReviewRow {
  return { question: item, outcome, input, responseTimeMs };
}

const categories: CategoryResult[] = [
  {
    category: "arithmetic",
    correct: 1,
    attempted: 2,
    total: 2,
    accuracy: 0.5,
    medianResponseTimeMs: 2_500,
  },
  {
    category: "probability",
    correct: 0,
    attempted: 0,
    total: 1,
    accuracy: null,
    medianResponseTimeMs: null,
  },
  {
    category: "sequences",
    correct: 0,
    attempted: 0,
    total: 1,
    accuracy: null,
    medianResponseTimeMs: null,
  },
  {
    category: "estimation",
    correct: 1,
    attempted: 1,
    total: 1,
    accuracy: 1,
    medianResponseTimeMs: 3_000,
  },
];

const review: ReviewRow[] = [
  row(question("q-1", "arithmetic", "12 + 8", "20"), "correct", "20", 2_000),
  row(question("q-2", "arithmetic", "15 - 9", "6"), "incorrect", "7", 3_000),
  row(question("q-3", "probability", "Simple probability", "1"), "skipped", "", null),
  row(question("q-4", "sequences", "Continue the sequence", "13"), "unanswered", null, null),
  row(
    {
      ...question("q-5", "estimation", "Estimate the total", "100"),
      answer: {
        kind: "estimate",
        value: 100,
        toleranceRatio: 0.1,
        display: "100",
      },
    },
    "correct",
    "102",
    3_000,
  ),
];

const result: SessionResult = {
  sessionId: "session-fixed",
  presetId: "mixed-quant",
  startedAtMs: 1_000,
  completedAtMs: 41_000,
  correct: 2,
  incorrect: 1,
  skipped: 1,
  unanswered: 1,
  accuracy: 2 / 3,
  completionRate: 0.8,
  medianResponseTimeMs: 2_500,
  correctPerMinute: 3,
  longestStreak: 1,
  difficultyTransitions: [
    {
      category: "arithmetic",
      startingDifficulty: 3,
      endingDifficulty: 4,
      adaptive: true,
      evaluated: true,
    },
    {
      category: "probability",
      startingDifficulty: 5,
      endingDifficulty: 4,
      adaptive: true,
      evaluated: true,
    },
    {
      category: "sequences",
      startingDifficulty: 6,
      endingDifficulty: 6,
      adaptive: true,
      evaluated: true,
    },
    {
      category: "estimation",
      startingDifficulty: 7,
      endingDifficulty: 7,
      adaptive: false,
      evaluated: false,
    },
  ],
  categories,
  review,
};

describe("ResultsView", () => {
  it("leads with raw correct count and renders every transparent result metric", () => {
    render(
      <ResultsView
        result={result}
        onBack={vi.fn()}
        onTrainWeakness={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Session results" })).toBeInTheDocument();
    expect(screen.getByText("2 / 5")).toBeInTheDocument();
    expect(screen.getByTestId("result-accuracy")).toHaveTextContent("67%");
    expect(screen.getByTestId("result-completion")).toHaveTextContent("80%");
    expect(screen.getByTestId("result-median")).toHaveTextContent("2.5s");
    expect(screen.getByTestId("result-correct-per-minute")).toHaveTextContent("3.0");
    expect(screen.getByTestId("result-streak")).toHaveTextContent("1");
    expect(screen.getByText("1 incorrect")).toBeInTheDocument();
    expect(screen.getByText("1 skipped")).toBeInTheDocument();
    expect(screen.getByText("1 unanswered")).toBeInTheDocument();
  });

  it("renders category accuracy and pace as semantic bar rows", () => {
    render(
      <ResultsView
        result={result}
        onBack={vi.fn()}
        onTrainWeakness={vi.fn()}
      />,
    );

    const breakdown = screen.getByRole("list", { name: "Category breakdown" });
    expect(within(breakdown).getByText("Arithmetic")).toBeInTheDocument();
    expect(within(breakdown).getByText("Probability")).toBeInTheDocument();
    expect(within(breakdown).getByText("Sequences")).toBeInTheDocument();
    expect(within(breakdown).getByText("Estimation")).toBeInTheDocument();
    expect(within(breakdown).getByRole("progressbar", { name: "Arithmetic accuracy" })).toHaveAttribute(
      "aria-valuenow",
      "50",
    );
    expect(within(breakdown).getByRole("progressbar", { name: "Arithmetic pace" })).toBeInTheDocument();
  });

  it("renders raised, lowered, unchanged, and locked category difficulty", () => {
    render(
      <ResultsView
        result={result}
        onBack={vi.fn()}
        onTrainWeakness={vi.fn()}
      />,
    );

    const difficulty = screen.getByRole("region", {
      name: "Difficulty movement",
    });
    expect(within(difficulty).getByText("Arithmetic").closest("li")).toHaveTextContent(
      "3 → 4Raised",
    );
    expect(within(difficulty).getByText("Probability").closest("li")).toHaveTextContent(
      "5 → 4Lowered",
    );
    expect(within(difficulty).getByText("Sequences").closest("li")).toHaveTextContent(
      "6 → 6Unchanged",
    );
    expect(within(difficulty).getByText("Estimation").closest("li")).toHaveTextContent(
      "7 → 7Locked",
    );
  });

  it("keeps review rows ordered and includes entered answer, correct answer, and explanation", () => {
    render(
      <ResultsView
        result={result}
        onBack={vi.fn()}
        onTrainWeakness={vi.fn()}
      />,
    );

    const items = screen.getAllByTestId("review-item");
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveTextContent("12 + 8");
    expect(items[1]).toHaveTextContent("15 - 9");
    expect(items[2]).toHaveTextContent("Simple probability");
    expect(items[3]).toHaveTextContent("Continue the sequence");
    expect(items[4]).toHaveTextContent("Estimate the total");
    expect(items[4]).toHaveTextContent("Accepted tolerance±10%");

    for (const [index, item] of items.entries()) {
      expect(item).toHaveTextContent("Entered answer");
      expect(item).toHaveTextContent("Correct answer");
      expect(item).toHaveTextContent(review[index].question.answer.display);
      expect(item).toHaveTextContent(review[index].question.explanation);
    }
    expect(items[2]).toHaveTextContent("Skipped");
    expect(items[3]).toHaveTextContent("Unanswered");
  });

  it("filters review by incorrect and skipped or unanswered outcomes", async () => {
    const user = userEvent.setup();
    render(
      <ResultsView
        result={result}
        onBack={vi.fn()}
        onTrainWeakness={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Incorrect" }));
    expect(screen.getAllByTestId("review-item")).toHaveLength(1);
    expect(screen.getByTestId("review-item")).toHaveTextContent("15 - 9");

    await user.click(screen.getByRole("button", { name: "Skipped / unanswered" }));
    const deferred = screen.getAllByTestId("review-item");
    expect(deferred).toHaveLength(2);
    expect(deferred[0]).toHaveTextContent("Simple probability");
    expect(deferred[1]).toHaveTextContent("Continue the sequence");
  });

  it("opens targeted setup for the lowest measured category and returns to the dashboard", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const onTrainWeakness = vi.fn();
    render(
      <ResultsView
        result={result}
        onBack={onBack}
        onTrainWeakness={onTrainWeakness}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Train this weakness" }));
    expect(onTrainWeakness).toHaveBeenCalledWith("arithmetic");
    await user.click(screen.getByRole("button", { name: "Back to dashboard" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("renders an em dash for unavailable accuracy and median metrics", () => {
    render(
      <ResultsView
        result={{
          ...result,
          correct: 0,
          incorrect: 0,
          accuracy: null,
          medianResponseTimeMs: null,
        }}
        onBack={vi.fn()}
        onTrainWeakness={vi.fn()}
      />,
    );

    expect(screen.getByTestId("result-accuracy")).toHaveTextContent("—");
    expect(screen.getByTestId("result-median")).toHaveTextContent("—");
  });
});
