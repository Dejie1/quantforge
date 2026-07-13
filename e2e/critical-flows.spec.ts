import { expect, test, type Page } from "@playwright/test";
import type { AnswerSpec, Question } from "../src/domain/questions/types";
import { getPreset } from "../src/domain/session/presets";
import {
  createSession,
  sessionReducer,
} from "../src/domain/session/session";
import type { SessionState } from "../src/domain/session/types";
import { createDefaultProgress } from "../src/lib/progress-schema";
import { PROGRESS_STORAGE_KEY } from "../src/lib/progress-store";

interface StoredProgress {
  activeSession: SessionState | null;
  preferences: {
    reducedMotion: boolean;
    theme: "dark" | "light";
  };
}

interface EnteredAnswer {
  kind: "choice" | "text";
  value: string;
}

async function resetLocalProgress(page: Page) {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Think clearly. Move quickly." }),
  ).toBeVisible();
}

async function storedProgress(page: Page): Promise<StoredProgress> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (raw === null) {
      throw new Error("Expected persisted QuantForge progress");
    }
    return JSON.parse(raw) as StoredProgress;
  }, PROGRESS_STORAGE_KEY);
}

async function currentQuestion(page: Page): Promise<Question> {
  await expect
    .poll(async () => (await storedProgress(page)).activeSession?.phase)
    .toBe("active");
  const progress = await storedProgress(page);
  const session = progress.activeSession;
  if (session === null) {
    throw new Error("Expected an active session");
  }
  const question = session.questions[session.currentIndex];
  if (question === undefined) {
    throw new Error("Expected a current question");
  }
  return question;
}

function exactTextAnswer(answer: Exclude<AnswerSpec, { kind: "choice" }>) {
  if (answer.kind === "fraction") {
    return `${answer.numerator}/${answer.denominator}`;
  }
  return String(answer.value);
}

async function enterCurrentAnswer(
  page: Page,
  options: { submitWithEnter?: boolean } = {},
): Promise<{ entered: EnteredAnswer; question: Question }> {
  const question = await currentQuestion(page);

  if (question.answer.kind === "choice") {
    const choice = question.choices?.find(
      ({ id }) => id === question.answer.value,
    );
    if (choice === undefined) {
      throw new Error("Expected the correct choice to be rendered");
    }
    await page.getByRole("radio", { name: choice.label }).check();
    if (options.submitWithEnter) {
      await page.keyboard.press("Enter");
    }
    return {
      entered: { kind: "choice", value: choice.label },
      question,
    };
  }

  const value = exactTextAnswer(question.answer);
  const input = page.getByRole("textbox", { name: "Your answer" });
  await input.focus();
  await page.keyboard.type(value);
  if (options.submitWithEnter) {
    await page.keyboard.press("Enter");
  }
  return { entered: { kind: "text", value }, question };
}

async function openMockSetup(page: Page) {
  await page
    .getByRole("button", { name: "Set up Mock Interview" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Mock Interview" }),
  ).toBeVisible();
}

async function beginSpeedArithmetic(page: Page) {
  await openMockSetup(page);
  await page.getByLabel(/Speed Arithmetic/i).check();
  await page.getByRole("button", { name: "Prepare session" }).click();
  await page.getByRole("button", { name: "Begin test" }).click();
  await expect(page.getByText("Question 1 of 80")).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const width = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(width, `${label} should fit a 320px viewport`).toBeLessThanOrEqual(
    320,
  );
}

async function expectComfortableTargets(page: Page, label: string) {
  const undersized = await page.evaluate(() => {
    const selectors = [
      "button",
      "a[href]",
      'input:not([type="radio"]):not([type="checkbox"])',
      '[role="button"]',
      "label:has(input[type=radio])",
      "label:has(input[type=checkbox])",
    ];

    return [...document.querySelectorAll<HTMLElement>(selectors.join(","))]
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0 &&
          (rect.width < 44 || rect.height < 44)
        );
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return `${element.tagName.toLowerCase()}.${element.className}: ${rect.width}x${rect.height}`;
      });
  });

  expect(undersized, `${label} has undersized interactive targets`).toEqual(
    [],
  );
}

function completedPracticeSession(): SessionState {
  const startedAtMs = Date.now() - 10_000;
  let session = createSession(getPreset("mental-2m"), 2_026_071_212);
  session = sessionReducer(session, { type: "start", nowMs: startedAtMs });

  for (let index = 0; index < session.questions.length; index += 1) {
    session = sessionReducer(session, {
      type: "skip",
      nowMs: startedAtMs + (index + 1) * 100,
    });
  }

  if (session.phase !== "completed") {
    throw new Error("Expected the production session reducer to complete the fixture");
  }
  return session;
}

test.beforeEach(async ({ page }) => {
  await resetLocalProgress(page);
});

test("Mental Math starts explicitly and gives concise keyboard feedback", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Start training" }).click();
  await expect(
    page.getByRole("heading", { name: "Mental Math Sprint" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Prepare session" }).click();
  await expect(
    page.getByRole("heading", { name: "Session ready" }),
  ).toBeVisible();
  await expect(page.getByText("02:00")).toBeVisible();
  await page.getByRole("button", { name: "Begin practice" }).click();

  const { question } = await enterCurrentAnswer(page, {
    submitWithEnter: true,
  });
  await expect(page.getByRole("status")).toHaveText("Correct");
  await expect(page.getByText(question.explanation, { exact: true })).toBeVisible();
  await expect(page.getByText("Question 2 of 20")).toBeVisible();
});

test("Speed Arithmetic keeps deferred feedback private while advancing", async ({
  page,
}) => {
  await openMockSetup(page);
  const speedPreset = page.getByLabel(/Speed Arithmetic/i);
  await expect(speedPreset).toBeChecked();
  await page.getByRole("button", { name: "Prepare session" }).click();
  await expect(page.getByText(/80 questions are loaded/i)).toBeVisible();
  await expect(page.getByText("08:00")).toBeVisible();
  await page.getByRole("button", { name: "Begin test" }).click();

  const { question } = await enterCurrentAnswer(page, {
    submitWithEnter: true,
  });
  await expect(page.getByText("Question 2 of 80")).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.locator(".feedback-panel")).toHaveCount(0);
  await expect(page.getByText(question.explanation, { exact: true })).toHaveCount(0);
});

test("Mixed Quant saves an answer while navigating away and back", async ({
  page,
}) => {
  await openMockSetup(page);
  await page.getByLabel(/Mixed Quant/i).check();
  await page.getByRole("button", { name: "Prepare session" }).click();
  await expect(page.getByText(/30 questions are loaded/i)).toBeVisible();
  await expect(page.getByText("20:00")).toBeVisible();
  await page.getByRole("button", { name: "Begin test" }).click();

  const { entered } = await enterCurrentAnswer(page);
  await page.getByRole("button", { name: "Save answer" }).click();
  await expect(
    page.getByRole("button", { name: /Question 1, answered, current/i }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Question 2, unanswered/i })
    .click();
  await expect(page.getByText("Question 2 of 30")).toBeVisible();
  await page.getByRole("button", { name: /Question 1, answered/i }).click();
  await expect(page.getByText("Question 1 of 30")).toBeVisible();

  if (entered.kind === "choice") {
    await expect(page.getByRole("radio", { name: entered.value })).toBeChecked();
  } else {
    await expect(
      page.getByRole("textbox", { name: "Your answer" }),
    ).toHaveValue(entered.value);
  }
});

test("Mixed Quant can be submitted early with unanswered questions reconciled", async ({
  page,
}) => {
  await openMockSetup(page);
  await page.getByLabel(/Mixed Quant/i).check();
  await page.getByRole("button", { name: "Prepare session" }).click();
  await page.getByRole("button", { name: "Begin test" }).click();

  await enterCurrentAnswer(page);
  await page.getByRole("button", { name: "Save answer" }).click();
  await page.getByRole("button", { name: "Submit test" }).click();

  const dialog = page.getByRole("alertdialog", {
    name: "Submit Mixed Quant?",
  });
  await expect(dialog).toContainText(
    "Every remaining question will count as unanswered.",
  );
  await dialog.getByRole("button", { name: "Submit test" }).click();

  await expect(
    page.getByRole("heading", { name: "Session results" }),
  ).toBeVisible();
  await expect(page.getByLabel("1 correct out of 30")).toBeVisible();
  await expect(page.getByText("29 unanswered")).toBeVisible();
  await expect(page.getByTestId("review-item")).toHaveCount(30);
});

test("an active mock reload preserves its original deadline", async ({ page }) => {
  await beginSpeedArithmetic(page);
  const promptBefore = await page.locator("#question-prompt").textContent();
  const secondsBefore = Number(
    await page.getByTestId("countdown-seconds").textContent(),
  );
  const deadlineBefore = (await storedProgress(page)).activeSession?.deadlineMs;
  expect(deadlineBefore).toEqual(expect.any(Number));

  await page.reload();

  const secondsAfter = Number(
    await page.getByTestId("countdown-seconds").textContent(),
  );
  const deadlineAfter = (await storedProgress(page)).activeSession?.deadlineMs;
  expect(secondsAfter).toBeLessThanOrEqual(secondsBefore);
  expect(deadlineAfter).toBe(deadlineBefore);
  await expect(page.getByText("Question 1 of 80")).toBeVisible();
  await expect(page.locator("#question-prompt")).toHaveText(promptBefore ?? "");
});

test("a production-valid completed session reconciles every result row", async ({
  page,
}) => {
  const progress = createDefaultProgress();
  progress.activeSession = completedPracticeSession();
  await page.evaluate(
    ({ key, serialized }) => window.localStorage.setItem(key, serialized),
    { key: PROGRESS_STORAGE_KEY, serialized: JSON.stringify(progress) },
  );

  await page.reload();

  await expect(
    page.getByRole("heading", { name: "Session results" }),
  ).toBeVisible();
  await expect(page.getByLabel("0 correct out of 20")).toBeVisible();
  await expect(page.getByText("20 skipped")).toBeVisible();
  await expect(page.getByText("0 unanswered")).toBeVisible();
  await expect(page.getByTestId("review-item")).toHaveCount(20);
});

test("the light theme persists through reload", async ({ page }) => {
  await page.getByRole("button", { name: "Progress" }).click();
  await page.getByRole("button", { name: "Use light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect
    .poll(async () => (await storedProgress(page)).preferences.theme)
    .toBe("light");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("dashboard, setup, and runner fit 320px with comfortable targets", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await expectNoHorizontalOverflow(page, "dashboard");
  await expectComfortableTargets(page, "dashboard");

  await page.getByRole("button", { name: "Start training" }).click();
  await expectNoHorizontalOverflow(page, "setup");
  await expectComfortableTargets(page, "setup");

  await page.getByRole("button", { name: "Prepare session" }).click();
  await page.getByRole("button", { name: "Begin practice" }).click();
  await expectNoHorizontalOverflow(page, "active runner");
  await expectComfortableTargets(page, "active runner");
});

test("reduced motion is rooted, persisted, and honors the system preference", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const systemDurationMs = await page
    .getByRole("button", { name: "Start training" })
    .evaluate((element) => {
      const duration = getComputedStyle(element).transitionDuration;
      return Math.max(
        ...duration.split(",").map((part) => {
          const value = Number.parseFloat(part);
          return part.trim().endsWith("ms") ? value : value * 1_000;
        }),
      );
    });
  expect(systemDurationMs).toBeLessThanOrEqual(0.01);

  await page.getByRole("button", { name: "Progress" }).click();
  await page.getByRole("checkbox", { name: "Reduce motion" }).check();
  await expect(page.locator("html")).toHaveAttribute(
    "data-reduced-motion",
    "true",
  );
  await expect
    .poll(async () => (await storedProgress(page)).preferences.reducedMotion)
    .toBe(true);

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute(
    "data-reduced-motion",
    "true",
  );
});

test("the abandon alert dialog traps focus, closes on Escape, and restores focus", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Start training" }).click();
  await page.getByRole("button", { name: "Prepare session" }).click();
  await page.getByRole("button", { name: "Begin practice" }).click();
  const trigger = page.getByRole("button", { name: "End session" });
  await trigger.click();

  const dialog = page.getByRole("alertdialog", { name: "End this session?" });
  const cancel = dialog.getByRole("button", { name: "Keep training" });
  const confirm = dialog.getByRole("button", { name: "End and leave" });
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
