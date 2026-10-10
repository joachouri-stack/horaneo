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

export const BellIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16zM10 20.5a2 2 0 0 0 4 0" strokeWidth="2" />
  </Icon>
);

export const CardIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <rect x="2.5" y="5" width="19" height="14" rx="3" strokeWidth="2" />
    <path d="M2.5 10h19M6.5 15h4" strokeWidth="2" />
  </Icon>
);

export const UserIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <circle cx="12" cy="8" r="4" strokeWidth="2" />
    <path d="M4 21a8 8 0 0 1 16 0" strokeWidth="2" />
  </Icon>
);

export const GiftIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <rect x="3" y="8" width="18" height="5" rx="1.5" strokeWidth="2" />
    <path
      d="M5 13v7h14v-7M12 8v12M12 8S10.5 3.5 8 4.2 8.5 8 12 8zm0 0s1.5-4.5 4-3.8S15.5 8 12 8z"
      strokeWidth="2"
    />
  </Icon>
);

export const HeartIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path
      d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z"
      strokeWidth="2"
    />
  </Icon>
);

export const ReviewIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" strokeWidth="2" />
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

export const SparkleIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path
      d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M6.3 17.7l2.5-2.5M15.2 8.8l2.5-2.5"
      strokeWidth="2"
    />
  </Icon>
);

export const LockIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <rect x="5" y="11" width="14" height="9" rx="2.5" strokeWidth="2.2" />
    <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" strokeWidth="2.2" />
  </Icon>
);

export const ShieldIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M12 3l7 3v5.5c0 4.3-3 7.9-7 9.5-4-1.6-7-5.2-7-9.5V6z" strokeWidth="2.2" />
    <path d="M9 12l2.2 2.2L15.5 10" strokeWidth="2.2" />
  </Icon>
);

/** Retourner une carte (deux flèches en cercle). */
export const FlipIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4v4.5h-4.5" strokeWidth="2.2" />
    <path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 20v-4.5h4.5" strokeWidth="2.2" />
  </Icon>
);

export const BagIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M5 8h14l-1 12H6zM9 8V6.5a3 3 0 0 1 6 0V8" strokeWidth="2.2" />
  </Icon>
);

export const DocumentIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5" strokeWidth="2.2" />
  </Icon>
);

export const BrushIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path
      d="M14.5 4.5l5 5-7.5 7.5-5-5zM7 12l-2.5 2.5c-1.2 1.2-.5 4.5-1.5 5.5 2.5.5 5-.5 6-1.5L11.5 16"
      strokeWidth="2"
    />
  </Icon>
);

export const ChartIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M4 20h16M7 16v-4M12 16V7M17 16v-7" strokeWidth="2.4" />
  </Icon>
);

export const GlobeIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <circle cx="12" cy="12" r="8.5" strokeWidth="2" />
    <path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17" strokeWidth="2" />
  </Icon>
);

export const ServerIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <rect x="4" y="4" width="16" height="7" rx="2" strokeWidth="2.2" />
    <rect x="4" y="13" width="16" height="7" rx="2" strokeWidth="2.2" />
    <path d="M8 7.5h.01M8 16.5h.01" strokeWidth="3" />
  </Icon>
);

export const PencilIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5zM13.5 7l3 3" strokeWidth="2.2" />
  </Icon>
);

export const HeadsetIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path
      d="M4 15v-3a8 8 0 0 1 16 0v3M4 14h3v6H5a1 1 0 0 1-1-1zM20 14h-3v6h2a1 1 0 0 0 1-1z"
      strokeWidth="2.2"
    />
  </Icon>
);

export const InboxIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M4 13l2.5-8h11L20 13v6H4zM4 13h5l1 2h4l1-2h5" strokeWidth="2.2" />
  </Icon>
);

/** Pictogrammes des options (clé « icon » du catalogue). */
export const OPTION_ICONS = {
  calendar: CalendarCheckIcon,
  card: CardIcon,
  bell: BellIcon,
  gift: GiftIcon,
  heart: HeartIcon,
  review: ReviewIcon,
  bag: BagIcon,
  document: DocumentIcon,
  spark: SparkleIcon,
} as const;

export function optionIcon(key: string) {
  return OPTION_ICONS[key as keyof typeof OPTION_ICONS] ?? SparkleIcon;
}
