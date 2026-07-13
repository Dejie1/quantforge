import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary } from "./ErrorBoundary";

describe("ErrorBoundary", () => {
  it("replaces the failed shell with one recovery main and preserves saved progress", async () => {
    const user = userEvent.setup();
    const originalConsoleError = console.error;
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const onRecover = vi.fn(() => {
      shouldThrow = false;
    });
    let shouldThrow = true;

    function FaultyTrainingScreen() {
      if (shouldThrow) {
        throw new Error("expected render failure");
      }

      return <p>Home restored</p>;
    }

    try {
      const { container } = render(
        <ErrorBoundary onRecover={onRecover}>
          <FaultyTrainingScreen />
        </ErrorBoundary>,
      );

      expect(
        screen.getByRole("heading", { name: "Training screen interrupted" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Your saved progress is still intact.")).toBeInTheDocument();
      expect(container.querySelectorAll("main")).toHaveLength(1);

      await user.click(screen.getByRole("button", { name: "Return home" }));

      expect(onRecover).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Home restored")).toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }

    expect(console.error).toBe(originalConsoleError);
  });
});
