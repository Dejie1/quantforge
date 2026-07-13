import { ChartNoAxesCombined, House, X } from "lucide-react";
import type { ReactNode } from "react";
import { QuantForgeLogo } from "./QuantForgeLogo";

export type ShellSection = "home" | "progress";

export interface AppShellProps {
  children: ReactNode;
  currentSection: ShellSection;
  onDismissStorageWarning: () => void;
  onNavigateHome: () => void;
  onNavigateProgress: () => void;
  storageWarning: boolean;
}

export function AppShell({
  children,
  currentSection,
  onDismissStorageWarning,
  onNavigateHome,
  onNavigateProgress,
  storageWarning,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <header className="site-header">
        <button
          className="brand-lockup"
          type="button"
          onClick={onNavigateHome}
          aria-label="QuantForge home"
        >
          <span className="brand-mark" aria-hidden="true">
            <QuantForgeLogo className="brand-logo" />
          </span>
          <span>
            <strong>QuantForge</strong>
            <small>Quant interview training</small>
          </span>
        </button>

        <nav aria-label="Primary navigation">
          <button
            className="nav-button"
            type="button"
            aria-current={currentSection === "home" ? "page" : undefined}
            onClick={onNavigateHome}
          >
            <House aria-hidden="true" size={18} strokeWidth={1.8} />
            Home
          </button>
          <button
            className="nav-button"
            type="button"
            aria-current={currentSection === "progress" ? "page" : undefined}
            onClick={onNavigateProgress}
          >
            <ChartNoAxesCombined aria-hidden="true" size={18} strokeWidth={1.8} />
            Progress
          </button>
          <a
            className="github-link"
            href="https://github.com/Dejie1/quantforge"
            target="_blank"
            rel="noreferrer"
            aria-label="View QuantForge source code on GitHub"
            title="View source on GitHub"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3.28-.36 6.72-1.61 6.72-7A5.4 5.4 0 0 0 19.22 4 5 5 0 0 0 19.13.5S17.95.14 15 1.9a13.4 13.4 0 0 0-7 0C5.05.14 3.87.5 3.87.5A5 5 0 0 0 3.78 4a5.4 5.4 0 0 0-1.5 3.5c0 5.39 3.44 6.62 6.72 7A4.8 4.8 0 0 0 8 18v4" />
              <path d="M8 19c-3 .9-3-1.5-4-2" />
            </svg>
          </a>
        </nav>
      </header>

      {storageWarning ? (
        <aside className="storage-warning" aria-label="Storage warning">
          <p>
            <strong>Progress cannot be saved right now.</strong> You can keep training in this
            tab, but new changes may not survive a refresh.
          </p>
          <button
            className="icon-button"
            type="button"
            onClick={onDismissStorageWarning}
            aria-label="Dismiss storage warning"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </aside>
      ) : null}

      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
