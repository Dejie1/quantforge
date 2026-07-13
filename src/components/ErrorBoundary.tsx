import React from "react";

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  onRecover: () => void;
}

export interface ErrorBoundaryState {
  failed: boolean;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  recover = () => {
    this.setState({ failed: false });
    this.props.onRecover();
  };

  render() {
    if (this.state.failed) {
      return (
        <main className="recovery-card">
          <p className="eyebrow">Session recovery</p>
          <h1>Training screen interrupted</h1>
          <p>Your saved progress is still intact.</p>
          <button className="button button--primary" type="button" onClick={this.recover}>
            Return home
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}
