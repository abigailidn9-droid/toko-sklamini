import type { Page } from "../types.ts";

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
  if (page === "kasir") {
    return (
      <svg {...common}>
        <path d="M4 5h2l1.5 10h10l2-7H7" />
        <circle cx="9" cy="19" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="17" cy="19" r="1.4" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (page === "draft") {
    return (
      <svg {...common}>
        <path d="M8 4h8v16H8z" />
        <path d="M8 4V2M16 4V2" />
        <path d="M10 10h4M10 14h3" />
      </svg>
    );
  }
  if (page === "kas") {
    return (
      <svg {...common}>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M3 10h18" />
        <circle cx="16" cy="14.5" r="1.3" />
      </svg>
    );
  }
  if (page === "riwayat") {
    return (
      <svg {...common}>
        <path d="M8 7h8M8 12h8M8 17h5" />
        <rect x="4" y="4" width="16" height="16" rx="2" />
      </svg>
    );
  }
  if (page === "retur") {
    return (
      <svg {...common}>
        <path d="M9 7H5V3" />
        <path d="M5 7a7 7 0 1 1-1.2 5" />
      </svg>
    );
  }
  if (page === "produk") {
    return (
      <svg {...common}>
        <path d="M12 3 20 7.5v9L12 21 4 16.5v-9L12 3z" />
        <path d="M12 12 20 7.5M12 12v9M12 12 4 7.5" />
      </svg>
    );
  }
  if (page === "restock") {
    return (
      <svg {...common}>
        <path d="M4 10V6h16v4" />
        <path d="M4 10h16v8H4z" />
        <path d="M12 13v4M10 15h4" />
      </svg>
    );
  }
  if (page === "opname") {
    return (
      <svg {...common}>
        <path d="M8 5h8v14H8z" />
        <path d="M10 9h4M10 12h4M10 15h2" />
      </svg>
    );
  }
  if (page === "pengeluaran") {
    return (
      <svg {...common}>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M3 10h18" />
        <path d="M8 14h3" />
      </svg>
    );
  }
  if (page === "pelanggan") {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="3" />
        <path d="M5 19c1.5-3 4-4.5 7-4.5S17.5 16 19 19" />
        <path d="M17 11h4M19 9v4" />
      </svg>
    );
  }
  if (page === "absen") {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="3" />
        <path d="M5 19c1.5-3 4-4.5 7-4.5S17.5 16 19 19" />
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
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 4v2M12 18v2M4 12h2M18 12h2M6.5 6.5l1.4 1.4M16.1 16.1l1.4 1.4M6.5 17.5l1.4-1.4M16.1 7.9l1.4-1.4" />
    </svg>
  );
}
