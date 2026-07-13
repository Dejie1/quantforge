export interface MetricCardProps {
  detail: string;
  label: string;
  value: string;
}

export function MetricCard({ detail, label, value }: MetricCardProps) {
  return (
    <article className="metric-card" aria-label={`${label}: ${value}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
