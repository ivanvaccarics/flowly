import type { SVGProps } from "react";

export type IconName =
  | "dashboard"
  | "accounts"
  | "transactions"
  | "tags"
  | "rules"
  | "settings"
  | "lock"
  | "shield"
  | "download"
  | "upload"
  | "plus"
  | "trash"
  | "archive"
  | "search"
  | "check"
  | "alert"
  | "bank"
  | "refresh"
  | "link"
  | "eye"
  | "edit"
  | "close"
  | "clock"
  | "arrow"
  | "calendar"
  | "eyedropper";

const PATHS: Record<IconName, string> = {
  dashboard: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
  accounts: "M3 10 12 4l9 6M5 10v9h14v-9M9 19v-5h6v5",
  transactions: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  tags: "M4 4h7l9 9-7 7-9-9zM8.5 8.5h.01",
  rules: "M4 7h10M18 7h2M4 17h4M12 17h8M4 12h16M14 4v6M8 14v6",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.3a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 14a1.7 1.7 0 0 0-1.6-1H1a2 2 0 1 1 0-4h.4A1.7 1.7 0 0 0 3 7.4a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 7 3h.1A1.7 1.7 0 0 0 9 1.4V1a2 2 0 1 1 4 0v.4A1.7 1.7 0 0 0 15 3h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 7v.1a1.7 1.7 0 0 0 1.6 1.9H23a2 2 0 1 1 0 4h-.4a1.7 1.7 0 0 0-1.2 2z",
  lock: "M6 11V8a6 6 0 1 1 12 0v3M5 11h14v10H5zM12 15v3",
  shield: "M12 3l8 3v6c0 5-3.4 8.2-8 9-4.6-.8-8-4-8-9V6zM9 12l2 2 4-4",
  download: "M12 4v11M7 11l5 5 5-5M4 20h16",
  upload: "M12 20V9M7 13l5-5 5 5M4 4h16",
  plus: "M12 5v14M5 12h14",
  trash: "M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6",
  archive: "M3 5h18v4H3zM5 9v11h14V9M10 13h4",
  search: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5 20 20",
  check: "M4 12l5 5L20 6",
  alert: "M12 3l9 17H3zM12 9v5M12 17h.01",
  bank: "M3 9.5 12 4l9 5.5M5 10v9M19 10v9M9 19v-6h6v6M3 21h18M8 6.2h.01",
  refresh: "M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4",
  link: "M10.5 13.5a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7l-1 1M13.5 10.5a4 4 0 0 0-5.7 0l-2.3 2.3a4 4 0 0 0 5.7 5.7l1-1",
  eye: "M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  edit: "M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5zM15 5l4 4",
  close: "M6 6l12 12M18 6l-12 12",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2",
  arrow: "M5 12h14M13 6l6 6-6 6",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  eyedropper: "M16.5 3.5a3 3 0 0 1 4 4L18 10l-4-4zM13 8l3 3-8.5 8.5L3 21l1.5-4.5z",
};

export function Icon({
  name,
  size = 20,
  ...props
}: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
