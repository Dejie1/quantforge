import { ArrowRight, type LucideIcon } from "lucide-react";
import type { SessionMode } from "../domain/session/types";

export interface ModeCardProps {
  description: string;
  details: readonly string[];
  icon: LucideIcon;
  mode: SessionMode;
  name: string;
  onSelect: (mode: SessionMode) => void;
}

export function ModeCard({
  description,
  details,
  icon: Icon,
  mode,
  name,
  onSelect,
}: ModeCardProps) {
  return (
    <li className="mode-card">
      <article>
        <div className="mode-card__icon" aria-hidden="true">
          <Icon size={24} strokeWidth={1.65} />
        </div>
        <div className="mode-card__copy">
          <h3>{name}</h3>
          <p>{description}</p>
        </div>
        <ul className="mode-card__details" aria-label={`${name} details`}>
          {details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
        <button
          className="text-button"
          type="button"
          onClick={() => onSelect(mode)}
          aria-label={`Set up ${name}`}
        >
          Configure
          <ArrowRight aria-hidden="true" size={18} />
        </button>
      </article>
    </li>
  );
}
