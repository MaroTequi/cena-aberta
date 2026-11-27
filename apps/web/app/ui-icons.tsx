export function UiIcon({
  name,
}: {
  name:
    | "card"
    | "bell"
    | "room"
    | "diary"
    | "review"
    | "heart"
    | "next"
    | "swipe"
    | "edit"
    | "crown"
    | "friends"
    | "import"
    | "trash"
    | "eye"
    | "hidden"
    | "clock"
    | "link"
    | "back"
    | "tree"
    | "feed"
    | "list"
    | "chart"
    | "send"
    | "comment"
    | "download"
    | "user"
    | "settings";
}) {
  const paths = {
    user: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20v-1a7 7 0 0 1 14 0v1" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
      </>
    ),
    tree: <path d="m12 2 5 6h-3l5 6h-4l5 5H4l5-5H5l5-6H7l5-6Zm0 17v3" />,
    back: <path d="m12 5-7 7 7 7M5 12h14" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 6v6l4 2" />
      </>
    ),
    link: (
      <>
        <path d="m10 13 4-4m-6 2-2 2a3.5 3.5 0 0 0 5 5l3-3m-4-6 3-3a3.5 3.5 0 1 1 5 5l-2 2" />
      </>
    ),
    card: (
      <g transform="rotate(-9 12 12)">
        <rect x="5.5" y="2.5" width="13" height="19" rx="2.4" />
        <path d="M9 16.5h6" />
      </g>
    ),
    bell: <path d="M18 8a6 6 0 0 0-12 0c0 6-2 7-3 9h18c-1-2-3-3-3-9Zm-8 12a2 2 0 0 0 4 0" />,
    room: (
      <>
        <rect x="3" y="5" width="18" height="15" rx="2" />
        <path d="M3 10h18M7 5l3 5m3-5 3 5m-6 3 4 2-4 2z" />
      </>
    ),
    review: (
      <path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-9l-6 4v-4H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm3 5h10M7 13h6" />
    ),
    diary: (
      <>
        <rect x="4" y="4" width="16" height="17" rx="2" />
        <path d="M8 2v4m8-4v4M4 9h16m-12 5h3" />
      </>
    ),
    heart: (
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
    ),
    next: <path d="M4 12h16m-6-6 6 6-6 6" />,
    swipe: <path d="M4 8h16m-4-4 4 4-4 4M20 16H4m4-4-4 4 4 4" />,
    edit: <path d="m16 3 5 5M4 15 16 3a2 2 0 0 1 5 5L9 20l-6 1 1-6Z" />,
    crown: (
      <>
        <path d="m3 6 4 4 5-7 5 7 4-4-2 13H5L3 6Zm3 9h12" />
      </>
    ),
    friends: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v3" />
      </>
    ),
    import: <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />,
    trash: <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />,
    eye: (
      <>
        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    hidden: (
      <>
        <path d="m3 3 18 18M10 5a12 12 0 0 1 12 7 20 20 0 0 1-4 5M6 6a20 20 0 0 0-4 6s4 7 10 7a12 12 0 0 0 4-1" />
        <path d="M9 9a4 4 0 0 0 6 6" />
      </>
    ),
    feed: <path d="M4 5h16M4 10h16M4 15h10M4 20h7" />,
    list: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </>
    ),
    chart: <path d="M4 20V10m6 10V4m6 16v-7m4 7H2" />,
    send: <path d="M21 3 3 10.5l7 2.5 2.5 7L21 3Zm-11 10 5-5" />,
    comment: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />,
    download: <path d="M12 3v12m-5-5 5 5 5-5M4 20h16" />,
  };
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
