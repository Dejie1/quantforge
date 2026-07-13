export interface ProgressRingProps {
  goal: number;
  value: number;
}

export function ProgressRing({ goal, value }: ProgressRingProps) {
  const safeGoal = Math.max(1, goal);
  const safeValue = Math.max(0, value);
  const completed = Math.min(safeValue, safeGoal);
  const percentage = Math.min(100, (safeValue / safeGoal) * 100);

  return (
    <div
      className="progress-ring"
      role="progressbar"
      aria-label={`${safeValue} of ${safeGoal} daily goal questions`}
      aria-valuemin={0}
      aria-valuemax={safeGoal}
      aria-valuenow={completed}
    >
      <svg viewBox="0 0 42 42" aria-hidden="true" focusable="false">
        <circle className="progress-ring__track" cx="21" cy="21" r="17" pathLength="100" />
        <circle
          className="progress-ring__value"
          cx="21"
          cy="21"
          r="17"
          pathLength="100"
          strokeDasharray={`${percentage} 100`}
        />
      </svg>
      <span className="progress-ring__copy">
        <strong>{safeValue}</strong>
        <small>of {safeGoal}</small>
        <span>Daily goal</span>
      </span>
    </div>
  );
}
