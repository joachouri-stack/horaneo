/**
 * Icônes du site commercial : traits fins (1,6), coins arrondis, couleur
 * héritée du texte. Décoratives (aria-hidden) : le texte voisin les nomme.
 */

type IconProps = { className?: string };

function Line({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

const icon = (paths: React.ReactNode) =>
  function LineIcon({ className }: IconProps) {
    return <Line className={className}>{paths}</Line>;
  };

export const CalendarLine = icon(
  <>
    <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4M8 13h2M12 13h2M16 13h.01M8 16.5h2M12 16.5h2" />
  </>,
);
export const BellLine = icon(<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" />);
export const CardLine = icon(
  <>
    <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
    <path d="M3 10h18M7 15h3" />
  </>,
);
export const UsersLine = icon(
  <>
    <circle cx="9" cy="8.5" r="3.2" />
    <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M15.5 5.6a3 3 0 0 1 0 5.8M17.5 14.4c1.6.6 2.6 2.1 3 4.6" />
  </>,
);
export const ChartLine = icon(<path d="M4 20h16M7 16.5v-4M11.5 16.5V8M16 16.5v-6.5M4 4v16" />);
export const BagLine = icon(<path d="M5.5 8.5h13l-1 11.5h-11zM9 8.5V7a3 3 0 0 1 6 0v1.5" />);
export const TagLine = icon(
  <>
    <path d="M3.5 12.5V4.5h8l9 9-8 8z" />
    <circle cx="8" cy="9" r="1.3" />
  </>,
);
export const BoxLine = icon(<path d="M4 7.5 12 3.5l8 4v9l-8 4-8-4zM4 7.5l8 4 8-4M12 11.5v9" />);
export const GiftLine = icon(
  <>
    <rect x="4" y="9" width="16" height="11" rx="1.5" />
    <path d="M3 9h18M12 9v11M12 9c-1.5-3.5-5.5-4-5.5-1.5S10 9 12 9zM12 9c1.5-3.5 5.5-4 5.5-1.5S14 9 12 9z" />
  </>,
);
export const PlayLine = icon(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="M10 9.2v5.6l4.8-2.8z" />
  </>,
);
export const FileLine = icon(<path d="M7 3h7l4 4v14H7zM14 3v4h4M9.5 12h6M9.5 15.5h6" />);
export const CapLine = icon(
  <path d="M2.5 9 12 5l9.5 4L12 13zM6.5 11v4.5c1.5 1.5 3.4 2.2 5.5 2.2s4-.7 5.5-2.2V11M21.5 9v5" />,
);
export const AwardLine = icon(
  <>
    <circle cx="12" cy="9" r="5" />
    <path d="M9 13.2 7.5 21l4.5-2.5 4.5 2.5-1.5-7.8" />
  </>,
);
export const TrendLine = icon(<path d="M3.5 16.5 9 11l3.5 3.5 7.5-7.5M15 7h5v5" />);
export const SparkleLine = icon(
  <path d="M12 3.5 13.6 9l5.4 1.6-5.4 1.6L12 17.5l-1.6-5.3L5 10.6 10.4 9zM18.5 15.5l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7z" />,
);
export const ChatLine = icon(<path d="M4 5.5h16v10H9.5L5 19.5v-4H4z" />);
export const MessageLine = icon(
  <path d="M4.5 19.5 6 15.6A7.5 7.5 0 1 1 9 18.6zM9 11h.01M12 11h.01M15 11h.01" />,
);
export const ShieldLine = icon(
  <path d="M12 3.5 19 6v5.5c0 4.3-2.9 7.6-7 9-4.1-1.4-7-4.7-7-9V6zM9 12l2.2 2.2L15.5 10" />,
);
export const LockLine = icon(
  <>
    <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
  </>,
);
export const ServerLine = icon(
  <>
    <rect x="4" y="4" width="16" height="7" rx="2" />
    <rect x="4" y="13" width="16" height="7" rx="2" />
    <path d="M8 7.5h.01M8 16.5h.01" />
  </>,
);
export const GlobeLine = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.4 2.5 2.4 14.5 0 17M12 3.5c-2.4 2.5-2.4 14.5 0 17" />
  </>,
);
export const HeadsetLine = icon(
  <path d="M4.5 15v-3a7.5 7.5 0 0 1 15 0v3M4.5 14h3v6h-2a1 1 0 0 1-1-1zM19.5 14h-3v6h2a1 1 0 0 0 1-1z" />,
);
export const LayoutLine = icon(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <path d="M3 8.5h18M9 8.5V20" />
  </>,
);
export const MegaphoneLine = icon(<path d="M4 10v4h3l6 4V6L7 10zM16.5 9a4 4 0 0 1 0 6M7 14l1 5h2.5l-1-5" />);
export const RefreshLine = icon(
  <path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4v4.5h-4.5M4 20v-4.5h4.5" />,
);
export const CheckLine = icon(<path d="m5 12.5 4.5 4.5L19 7.5" />);
export const DashLine = icon(<path d="M7 12h10" />);
export const ArrowLine = icon(<path d="M5 12h14M13.5 6.5 19 12l-5.5 5.5" />);
export const PlusLine = icon(<path d="M12 5v14M5 12h14" />);
export const LeafLine = icon(<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14M5 19c3-4 6-6.5 9.5-8" />);
export const CrownLine = icon(<path d="M4 18h16M4.5 15 3 7l5 3.5L12 5l4 5.5L21 7l-1.5 8z" />);
export const DiamondLine = icon(
  <path d="M6.5 4h11L21 9l-9 11L3 9zM3 9h18M9.5 4 8 9l4 11M14.5 4 16 9l-4 11" />,
);
export const TabletLine = icon(
  <>
    <rect x="4.5" y="3" width="15" height="18" rx="2.5" />
    <path d="M11 18h2" />
  </>,
);
export const PlayCircleLine = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M10.3 8.8v6.4l5-3.2z" />
  </>,
);
export const ClockLine = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </>,
);
export const PercentLine = icon(
  <>
    <path d="M18 6 6 18" />
    <circle cx="7.5" cy="7.5" r="2" />
    <circle cx="16.5" cy="16.5" r="2" />
  </>,
);
export const StoreLine = icon(
  <path d="M4 9.5 5.5 4h13L20 9.5M4 9.5c0 1.7 1.3 3 2.7 3s2.6-1.3 2.6-3c0 1.7 1.2 3 2.7 3s2.7-1.3 2.7-3c0 1.7 1.2 3 2.6 3S20 11.2 20 9.5M5.5 12.3V20h13v-7.7M10 20v-4.5h4V20" />,
);
