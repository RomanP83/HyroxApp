// ============================================================================
// The app's single icon family (design cheatsheet #5: "treat icons like
// typography"). One consistent style: 24px grid, 1.8px stroke, round caps.
// `filled` renders the heavier variant for selected/completed states instead
// of relying on color alone.
// ============================================================================

interface IconProps {
  size?: number;
  className?: string;
  filled?: boolean;
}

function Svg({
  children,
  size = 18,
  className,
  filled = false,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const CheckIcon = (p: IconProps) => (
  <Svg {...p} filled={false}>
    <path d="M20 6L9 17l-5-5" />
  </Svg>
);

export const CheckCircleIcon = (p: IconProps) => (
  <Svg {...p} filled={false}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 12.5l2.5 2.5 4.5-5" />
  </Svg>
);

export const FlameIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3c.6 2.6 2 4.7 3.8 6.2C17.6 10.8 19 12.7 19 15a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.2.6 1 1.6 1.7 2.7 1.7C8.2 11 8 9.8 8.5 8.5 9.3 6.4 10.6 4.6 12 3z" />
  </Svg>
);

export const FeatherIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20.2 12.2a6 6 0 0 0-8.5-8.5L5 10.5V19h8.5z" />
    <path d="M16 8L3 21" />
    <path d="M17.5 15H9" />
  </Svg>
);

export const SkipIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 4l10 8-10 8V4z" />
    <path d="M19 5v14" />
  </Svg>
);

export const ChartIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 3v18h18" />
    <path d="M7 14l4-4 3 3 5-6" />
  </Svg>
);

export const TargetIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1" />
  </Svg>
);

export const SendIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M22 2L11 13" />
    <path d="M22 2l-7 20-4-9-9-4 20-7z" />
  </Svg>
);

export const RunIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </Svg>
);

export const MedicalIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 3h4v6h6v4h-6v6h-4v-6H4v-4h6V3z" />
  </Svg>
);

export const LeafIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M11 20A7 7 0 0 1 9.8 6.1C15 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z" />
    <path d="M3 21c0-3 2-5.4 5-6 2.4-.5 4-2 5-3" />
  </Svg>
);

export const LockIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Svg>
);

export const SparkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 2l2.2 7.2L22 12l-7.8 2.8L12 22l-2.2-7.2L2 12l7.8-2.8L12 2z" />
  </Svg>
);

export const MoveIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 7h12M8 12h12M8 17h12" />
    <path d="M4 7h.01M4 12h.01M4 17h.01" />
  </Svg>
);

export const UndoIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9h11a5 5 0 0 1 0 10h-6" />
    <path d="M8 5L4 9l4 4" />
  </Svg>
);

export const SpinnerIcon = ({ size = 18, className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    className={`animate-spin ${className ?? ""}`}
    aria-hidden="true"
  >
    <path d="M21 12a9 9 0 1 1-6.2-8.56" />
  </svg>
);
