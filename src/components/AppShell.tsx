import { ChartNoAxesCombined, House, X } from "lucide-react";
import type { ReactNode } from "react";

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
            QF
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
