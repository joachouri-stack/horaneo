/** Petites icônes du site commercial (traits, couleur héritée du texte). */

type IconProps = { className?: string };

function Icon({
  className,
  children,
  fill = "none",
}: IconProps & { children: React.ReactNode; fill?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={fill}
      stroke={fill === "none" ? "currentColor" : "none"}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export const ArrowIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M5 12h14M13 6l6 6-6 6" strokeWidth="2.5" />
  </Icon>
);

export const CheckIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M5 12l5 5 9-10" strokeWidth="2.6" />
  </Icon>
);

export const DashIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M6 12h12" strokeWidth="2.6" />
  </Icon>
);

export const PlusIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M12 5v14M5 12h14" strokeWidth="3" />
  </Icon>
);

export const BrowserIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <rect x="3" y="4" width="18" height="16" rx="3" strokeWidth="2" />
    <path d="M3 9h18M7 14h6" strokeWidth="2" />
  </Icon>
);

export const CalendarCheckIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <rect x="3" y="5" width="18" height="16" rx="3" strokeWidth="2" />
    <path d="M8 3v4M16 3v4M3 10h18M9 15l2 2 4-4" strokeWidth="2" />
  </Icon>
);

export const EuroIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <circle cx="12" cy="12" r="9" strokeWidth="2" />
    <path d="M15.5 9a4.2 4.2 0 1 0 0 6M7 11h5.5M7 13.5h5.5" strokeWidth="2" />
  </Icon>
);

/** Icônes des packs, du plus simple au plus complet. */
export const PLAN_ICONS = [
  ({ className }: IconProps) => (
    <Icon className={className}>
      <path d="M12 20v-8M12 12c0-4 3-6 7-6 0 4-3 6-7 6zM12 14c0-3-2-5-6-5 0 3 2 5 6 5z" strokeWidth="2" />
    </Icon>
  ),
  ({ className }: IconProps) => (
    <Icon className={className}>
      <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.3l6.1-.7z" strokeWidth="2" />
    </Icon>
  ),
  ({ className }: IconProps) => (
    <Icon className={className}>
      <path d="M4 19h16M4.5 15.5l-1.5-8 5 4 4-6.5 4 6.5 5-4-1.5 8z" strokeWidth="2" />
    </Icon>
  ),
];

export const StarIcon = ({ className }: IconProps) => (
  <Icon className={className} fill="currentColor">
    <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.3l6.1-.7z" />
  </Icon>
);
