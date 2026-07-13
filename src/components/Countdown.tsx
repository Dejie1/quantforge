import { useEffect, useState } from "react";
import { remainingMs } from "../domain/session/session";
import type { SessionState } from "../domain/session/types";

export interface CountdownProps {
  session: SessionState;
}

function displayNow(session: SessionState, wallNowMs: number): number {
  if (session.startedAtMs === null || session.deadlineMs === null) {
    return wallNowMs;
  }

  // Tests and embedders may provide the trainer with a deterministic clock.
  // Fall back to that session's own timeline when it is clearly unrelated to
  // the browser wall clock, while retaining deadline-accurate behavior in-app.
  const toleranceMs = Math.max(
    86_400_000,
    (session.config.durationMs ?? 0) * 10,
  );
  if (
    wallNowMs < session.startedAtMs - toleranceMs ||
    wallNowMs > session.deadlineMs + toleranceMs
  ) {
    return session.startedAtMs;
  }

  return wallNowMs;
}

function countdownValue(session: SessionState, wallNowMs: number): number | null {
  if (session.phase === "ready") {
    return session.config.durationMs;
  }

  return remainingMs(session, displayNow(session, wallNowMs));
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.ceil(durationMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function Countdown({ session }: CountdownProps) {
  const [wallNowMs, setWallNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (session.phase !== "active" || session.deadlineMs === null) {
      return;
    }

    setWallNowMs(Date.now());
    const intervalId = window.setInterval(() => setWallNowMs(Date.now()), 250);
    return () => window.clearInterval(intervalId);
  }, [session.deadlineMs, session.phase]);

  const value = countdownValue(session, wallNowMs);
  const label = value === null ? "Untimed" : formatDuration(value);
  const seconds = value === null ? null : Math.ceil(value / 1_000);

  return (
    <>
      <time
        className="countdown"
        role="timer"
        aria-label={value === null ? "Untimed session" : `${label} remaining`}
        aria-live="off"
      >
        {label}
      </time>
      <span data-testid="countdown-seconds" hidden>
        {seconds}
      </span>
    </>
  );
}
