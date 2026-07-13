import { Moon, Sun } from "lucide-react";
import { useTrainer } from "../features/trainer/useTrainer";
import type { ProgressDataV1 } from "../lib/progress-schema";

type Preferences = ProgressDataV1["preferences"];

export function applyRootPreferences({ theme, reducedMotion }: Preferences) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.reducedMotion = String(reducedMotion);
}

export function ThemeToggle() {
  const { progress, updatePreferences } = useTrainer();
  const { theme } = progress.preferences;
  const nextTheme = theme === "dark" ? "light" : "dark";

  const toggleTheme = () => {
    document.documentElement.dataset.theme = nextTheme;
    updatePreferences({ theme: nextTheme });
  };

  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label={`Use ${nextTheme} theme`}
      aria-pressed={theme === "light"}
      onClick={toggleTheme}
    >
      {theme === "dark" ? (
        <Sun aria-hidden="true" size={20} strokeWidth={1.8} />
      ) : (
        <Moon aria-hidden="true" size={20} strokeWidth={1.8} />
      )}
      <span>{nextTheme === "light" ? "Light theme" : "Dark theme"}</span>
    </button>
  );
}
