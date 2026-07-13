export interface QuantForgeLogoProps {
  className?: string;
}

export function QuantForgeLogo({ className }: QuantForgeLogoProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="quantforge-mark" x1="7" y1="41" x2="41" y2="7">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#a3e635" />
        </linearGradient>
      </defs>
      <path
        d="M24 3.75 41.54 13.88v20.24L24 44.25 6.46 34.12V13.88L24 3.75Z"
        fill="url(#quantforge-mark)"
      />
      <path
        d="m13.25 30 7.1-7.1 5.05 4.35 9.35-10.1"
        fill="none"
        stroke="#07101f"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M29.8 17.15h4.95v4.95"
        fill="none"
        stroke="#07101f"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="13.25" cy="30" r="2.1" fill="#07101f" />
    </svg>
  );
}
