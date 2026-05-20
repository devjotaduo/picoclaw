export function EmptyConversationIllustration({
  className = "",
}: {
  className?: string
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 240 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Ilustração de mensagens em uma caixa de entrada"
    >
      <defs>
        <linearGradient id="bg-gradient" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--wa-brand)" stopOpacity="0.10" />
          <stop offset="100%" stopColor="var(--wa-brand)" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      <rect
        x="8"
        y="20"
        width="224"
        height="124"
        rx="20"
        fill="url(#bg-gradient)"
      />

      {/* incoming bubble */}
      <g>
        <rect
          x="32"
          y="48"
          width="92"
          height="22"
          rx="11"
          fill="var(--card)"
          stroke="var(--border)"
        />
        <circle cx="44" cy="59" r="3" fill="var(--foreground)" opacity="0.4" />
        <circle cx="56" cy="59" r="3" fill="var(--foreground)" opacity="0.4" />
        <circle cx="68" cy="59" r="3" fill="var(--foreground)" opacity="0.4" />
      </g>

      {/* outgoing bubble */}
      <g>
        <rect
          x="120"
          y="80"
          width="92"
          height="22"
          rx="11"
          fill="var(--wa-bubble-out)"
        />
        <rect
          x="136"
          y="89"
          width="44"
          height="4"
          rx="2"
          fill="var(--wa-brand)"
          opacity="0.7"
        />
        <path
          d="M188 95l3 2-3 2zM192 95l3 2-3 2z"
          stroke="var(--wa-check-read)"
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {/* incoming reply */}
      <g>
        <rect
          x="32"
          y="112"
          width="72"
          height="20"
          rx="10"
          fill="var(--card)"
          stroke="var(--border)"
        />
        <rect
          x="44"
          y="119"
          width="40"
          height="4"
          rx="2"
          fill="var(--foreground)"
          opacity="0.5"
        />
      </g>

      {/* brand icon */}
      <circle cx="34" cy="32" r="10" fill="var(--wa-brand)" />
      <path
        d="M29 32c0-2.76 2.24-5 5-5s5 2.24 5 5-2.24 5-5 5c-.84 0-1.62-.2-2.3-.57L29 37l.54-2.6A5.04 5.04 0 0 1 29 32z"
        fill="white"
      />
    </svg>
  )
}
