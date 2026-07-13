import { useLayoutEffect, useRef, useState } from "react";
import { AppShell } from "../components/AppShell";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { applyRootPreferences } from "../components/ThemeToggle";
import type { QuestionCategory } from "../domain/questions/types";
import type { SessionMode } from "../domain/session/types";
import { TrainerProvider, useTrainer } from "../features/trainer/useTrainer";
import { HomeView } from "../views/HomeView";
import { ProgressView } from "../views/ProgressView";
import { ResultsView } from "../views/ResultsView";
import { SessionView } from "../views/SessionView";
import { SetupView } from "../views/SetupView";
import "../styles/app.css";

type AppView = "home" | "setup" | "progress" | "session" | "results";

function practiceModeFor(category: QuestionCategory): SessionMode {
  switch (category) {
    case "arithmetic":
      return "mental-math";
    case "probability":
      return "probability";
    case "sequences":
    case "estimation":
      return "sequences-estimation";
  }
}

export function AppContent() {
  const {
    clearResult,
    dismissStorageWarning,
    progress,
    result,
    session,
    storageWarning,
  } = useTrainer();
  const [view, setView] = useState<AppView>(() => {
    if (result !== null) {
      return "results";
    }
    return session !== null && session.phase !== "completed"
      ? "session"
      : "home";
  });
  const [selectedMode, setSelectedMode] = useState<SessionMode | null>(null);
  const [selectedFocusCategory, setSelectedFocusCategory] =
    useState<QuestionCategory | null>(null);
  const previousViewRef = useRef<AppView>(view);

  useLayoutEffect(() => {
    applyRootPreferences(progress.preferences);
  }, [progress.preferences]);

  useLayoutEffect(() => {
    if (previousViewRef.current !== view) {
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      document.getElementById("main-content")?.focus({ preventScroll: true });
      previousViewRef.current = view;
    }
  }, [view]);

  useLayoutEffect(() => {
    if (result !== null && view !== "results") {
      setView("results");
    }
  }, [result, view]);

  const navigateHome = () => {
    clearResult();
    setView("home");
    setSelectedMode(null);
    setSelectedFocusCategory(null);
  };

  const exitSession = () => {
    setView("home");
    setSelectedMode(null);
    setSelectedFocusCategory(null);
  };

  const openSetup = (mode: SessionMode) => {
    clearResult();
    setSelectedMode(mode);
    setSelectedFocusCategory(null);
    setView("setup");
  };

  const openWeaknessSetup = (category: QuestionCategory) => {
    clearResult();
    setSelectedMode(practiceModeFor(category));
    setSelectedFocusCategory(category);
    setView("setup");
  };

  const recover = () => {
    clearResult();
    setSelectedMode(null);
    setSelectedFocusCategory(null);
    setView("home");
  };

  const adjustSetup = () => {
    if (session !== null && session.phase !== "completed") {
      setSelectedMode(session.config.mode);
      setSelectedFocusCategory(
        session.config.categories.length === 1
          ? session.config.categories[0]
          : null,
      );
      setView("setup");
      return;
    }

    navigateHome();
  };

  let content;
  if (result !== null) {
    content = (
      <ResultsView
        result={result}
        onBack={navigateHome}
        onTrainWeakness={openWeaknessSetup}
      />
    );
  } else if (view === "setup" && selectedMode !== null) {
    content = (
      <SetupView
        key={`${selectedMode}:${selectedFocusCategory ?? "all"}`}
        focusCategory={selectedFocusCategory}
        mode={selectedMode}
        onBack={navigateHome}
        onReady={() => setView("session")}
      />
    );
  } else if (view === "progress") {
    content = <ProgressView />;
  } else if (view === "session") {
    content = <SessionView onAdjust={adjustSetup} onExit={exitSession} />;
  } else {
    content = (
      <HomeView
        onSelectMode={openSetup}
        onResume={() => {
          if (session !== null && session.phase !== "completed") {
            setSelectedMode(session.config.mode);
            setView("session");
          }
        }}
      />
    );
  }

  return (
    <ErrorBoundary onRecover={recover}>
      <AppShell
        currentSection={view === "progress" ? "progress" : "home"}
        storageWarning={storageWarning}
        onDismissStorageWarning={dismissStorageWarning}
        onNavigateHome={navigateHome}
        onNavigateProgress={() => {
          clearResult();
          setSelectedMode(null);
          setSelectedFocusCategory(null);
          setView("progress");
        }}
      >
        {content}
      </AppShell>
    </ErrorBoundary>
  );
}

export function App() {
  return (
    <TrainerProvider>
      <AppContent />
    </TrainerProvider>
  );
}
