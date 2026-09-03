export type Page = "ringkasan" | "shift" | "penjualan" | "laporan" | "stok" | "pengeluaran" | "absen" | "member";

const common = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function NavGlyph({ page }: { page: Page }) {
  if (page === "ringkasan") {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    );
  }
  if (page === "shift") {
    return (
      <svg {...common}>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M3 10h18" />
        <circle cx="16" cy="14.5" r="1.3" />
      </svg>
    );
  }
  if (page === "penjualan") {
    return (
      <svg {...common}>
        <path d="M8 7h8M8 12h8M8 17h5" />
        <rect x="4" y="4" width="16" height="16" rx="2" />
      </svg>
    );
  }
  if (page === "laporan") {
    return (
      <svg {...common}>
        <path d="M5 19V9M10 19V5M15 19v-7M20 19V8" />
      </svg>
    );
  }
  if (page === "stok") {
    return (
      <svg {...common}>
        <path d="M12 3 20 7.5v9L12 21 4 16.5v-9L12 3z" />
        <path d="M12 12 20 7.5M12 12v9M12 12 4 7.5" />
      </svg>
    );
  }
  if (page === "pengeluaran") {
    return (
      <svg {...common}>
        <path d="M12 3v18M7 8h8.5a3.5 3.5 0 0 1 0 7H8" />
      </svg>
    );
  }
  if (page === "absen") {
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.8 19c1-3 3-4.6 5.2-4.6S13.2 16 14.2 19" />
        <path d="M16 8h5M18.5 5.5v5" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="8" r="3" />
      <path d="M5.8 19c1.2-3.1 3.6-4.6 6.2-4.6S17 15.9 18.2 19" />
    </svg>
  );
}
