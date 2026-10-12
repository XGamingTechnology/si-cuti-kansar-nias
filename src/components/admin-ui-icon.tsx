import type { ReactNode } from "react";

type Name =
  | "people"
  | "active"
  | "inactive"
  | "unit"
  | "search"
  | "plus"
  | "upload"
  | "arrow"
  | "menu"
  | "close"
  | "logout";
export function AdminUiIcon({ name }: { name: Name }) {
  const paths: Record<Name, ReactNode> = {
    people: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 21v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 4v2" />
      </>
    ),
    active: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    inactive: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12h8" />
      </>
    ),
    unit: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M9 7h1m4 0h1M9 11h1m4 0h1M9 15h1m4 0h1m-4 6v-3h2v3" />
      </>
    ),
    search: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 6 6" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    upload: (
      <>
        <path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5" />
      </>
    ),
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    logout: (
      <>
        <path d="M10 4H4v16h6m0-8h11m-4-4 4 4-4 4" />
      </>
    ),
  };
  return (
    <svg
      className="admin-ui-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
