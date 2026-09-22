import type { ReactElement, ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function LineIcon({
  size = 20,
  children,
  ...props
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconDashboard(props: IconProps) {
  return (
    <LineIcon {...props}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </LineIcon>
  );
}

export function IconUtensils(props: IconProps) {
  return (
    <LineIcon {...props}>
      <path d="M8 3v8" />
      <path d="M5 3v5a3 3 0 0 0 6 0V3" />
      <path d="M16 3v18" />
      <path d="M19 3v5a3 3 0 0 1-6 0V3" />
    </LineIcon>
  );
}

export function IconReceipt(props: IconProps) {
  return (
    <LineIcon {...props}>
      <path d="M6 2h12v20l-2-1.5L14 22l-2-1.5L10 22 8 20.5 6 22z" />
      <path d="M9 7h6M9 11h6M9 15h4" />
    </LineIcon>
  );
}

export function IconWallet(props: IconProps) {
  return (
    <LineIcon {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h14v14H5a2 2 0 0 1-2-2z" />
      <path d="M17 7h2a2 2 0 0 1 2 2v2h-4z" />
      <circle cx="17" cy="11" r="1" fill="currentColor" stroke="none" />
    </LineIcon>
  );
}

export function IconSliders(props: IconProps) {
  return (
    <LineIcon {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
      <circle cx="8" cy="6" r="2" />
      <circle cx="14" cy="12" r="2" />
      <circle cx="10" cy="18" r="2" />
    </LineIcon>
  );
}

export function IconCalendar(props: IconProps) {
  return (
    <LineIcon {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </LineIcon>
  );
}

export function IconChart(props: IconProps) {
  return (
    <LineIcon {...props}>
      <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
    </LineIcon>
  );
}

export function IconClipboard(props: IconProps) {
  return (
    <LineIcon {...props}>
      <rect x="5" y="4" width="14" height="18" rx="2" />
      <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
      <path d="M9 10h6M9 14h6" />
    </LineIcon>
  );
}

export function IconClock(props: IconProps) {
  return (
    <LineIcon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </LineIcon>
  );
}

export function IconTruck(props: IconProps) {
  return (
    <LineIcon {...props}>
      <path d="M3 7h11v10H3z" />
      <path d="M14 10h4l3 3v4h-7z" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
    </LineIcon>
  );
}

export function IconHistory(props: IconProps) {
  return (
    <LineIcon {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 3v6h6" />
      <path d="M12 7v5l3 2" />
    </LineIcon>
  );
}

export function IconStorefront(props: IconProps) {
  return (
    <LineIcon {...props}>
      <path d="M3 9 5 4h14l2 5" />
      <path d="M4 9v11h16V9" />
      <path d="M9 20v-6h6v6" />
    </LineIcon>
  );
}

export function IconMapPin(props: IconProps) {
  return (
    <LineIcon {...props}>
      <path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </LineIcon>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <LineIcon {...props}>
      <path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" />
      <circle cx="9" cy="8" r="3" />
      <path d="M22 19v-1a3 3 0 0 0-2-2.8" />
      <path d="M16 4.2a3 3 0 0 1 0 5.6" />
    </LineIcon>
  );
}

export function IconLayoutGrid(props: IconProps) {
  return (
    <LineIcon {...props}>
      <rect x="3" y="3" width="8" height="8" rx="1" />
      <rect x="13" y="3" width="8" height="8" rx="1" />
      <rect x="3" y="13" width="8" height="8" rx="1" />
      <rect x="13" y="13" width="8" height="8" rx="1" />
    </LineIcon>
  );
}

export function IconUtensilsCrossed(props: IconProps) {
  return (
    <LineIcon {...props}>
      <path d="M8 3v7" />
      <path d="M5 3v4a3 3 0 0 0 6 0V3" />
      <path d="M16 3l-2 8 2 2 2-2-2-8z" />
      <path d="M16 13v8" />
    </LineIcon>
  );
}

export function IconBag(props: IconProps) {
  return (
    <LineIcon {...props}>
      <path d="M8 8V6a4 4 0 1 1 8 0v2" />
      <path d="M5 8h14l-1 13H6z" />
    </LineIcon>
  );
}

export function IconStarOutline(props: IconProps) {
  return (
    <LineIcon {...props}>
      <path d="m12 3 2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 8.2l5-.7z" />
    </LineIcon>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <LineIcon {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </LineIcon>
  );
}

export function IconCircleX(props: IconProps) {
  return (
    <LineIcon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9 9 15M9 9l6 6" />
    </LineIcon>
  );
}

export function IconInfo(props: IconProps) {
  return (
    <LineIcon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </LineIcon>
  );
}

export function IconDownload(props: IconProps) {
  return (
    <LineIcon {...props}>
      <path d="M12 3v12" />
      <path d="M8 11l4 4 4-4" />
      <path d="M4 21h16" />
    </LineIcon>
  );
}

export function IconCartPlus(props: IconProps) {
  return (
    <LineIcon {...props}>
      <path d="M6 6h12l-1 10H7L5 4H3" />
      <path d="M9 20h.01M17 20h.01" />
      <path d="M12 9v4M10 11h4" />
    </LineIcon>
  );
}

export function IconCartMinus(props: IconProps) {
  return (
    <LineIcon {...props}>
      <path d="M6 6h12l-1 10H7L5 4H3" />
      <path d="M9 20h.01M17 20h.01" />
      <path d="M10 11h4" />
    </LineIcon>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <LineIcon {...props}>
      <path d="M5 12l4 4L19 6" />
    </LineIcon>
  );
}

export type NavIconId =
  | "dashboard"
  | "utensils"
  | "receipt"
  | "wallet"
  | "sliders"
  | "calendar"
  | "chart"
  | "clipboard"
  | "clock"
  | "truck"
  | "history"
  | "storefront"
  | "map-pin"
  | "users"
  | "layout-grid"
  | "settings";

const NAV_ICON_MAP: Record<
  NavIconId,
  (props: IconProps) => ReactElement
> = {
  dashboard: IconDashboard,
  utensils: IconUtensils,
  receipt: IconReceipt,
  wallet: IconWallet,
  sliders: IconSliders,
  calendar: IconCalendar,
  chart: IconChart,
  clipboard: IconClipboard,
  clock: IconClock,
  truck: IconTruck,
  history: IconHistory,
  storefront: IconStorefront,
  "map-pin": IconMapPin,
  users: IconUsers,
  "layout-grid": IconLayoutGrid,
  settings: IconSliders,
};

export function NavIcon({
  id,
  className,
  size = 18,
}: {
  id: NavIconId;
  className?: string;
  size?: number;
}) {
  const Icon = NAV_ICON_MAP[id];
  return <Icon size={size} className={className} />;
}
