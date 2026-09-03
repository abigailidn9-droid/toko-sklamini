import { type ReactNode, useEffect, useState } from "react";
import { NavGlyph, type Page } from "./components/NavGlyph.tsx";
import {
  ApiError,
  clearSession,
  loadSession,
  loginOwner,
  saveSession,
  type OwnerSession,
} from "./lib/api.ts";
import { LoginPage } from "./pages/LoginPage.tsx";
import { OverviewPage } from "./pages/OverviewPage.tsx";
import { ShiftPage } from "./pages/ShiftPage.tsx";
import { SalesPage } from "./pages/SalesPage.tsx";
import { LaporanPage } from "./pages/LaporanPage.tsx";
import { StockPage } from "./pages/StockPage.tsx";
import { ExpensePage } from "./pages/ExpensePage.tsx";
import { AbsenPage } from "./pages/AbsenPage.tsx";
import { MemberPage } from "./pages/MemberPage.tsx";
import { Button } from "./ui/primitives.tsx";

const NAV: { id: Page; label: string }[] = [
  { id: "ringkasan", label: "Ringkasan" },
  { id: "shift", label: "Shift" },
  { id: "penjualan", label: "Penjualan" },
  { id: "laporan", label: "Laporan" },
  { id: "stok", label: "Stok" },
  { id: "pengeluaran", label: "Keluar" },
  { id: "absen", label: "Absen" },
  { id: "member", label: "Member" },
];

export default function App() {
  const [session, setSession] = useState<OwnerSession | null>(() => loadSession());
  const [page, setPage] = useState<Page>("ringkasan");
  const [clock, setClock] = useState(() => new Date());
  const [saleFocus, setSaleFocus] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    function onErr(e: PromiseRejectionEvent) {
      if (e.reason instanceof ApiError && e.reason.status === 401) setSession(null);
    }
    window.addEventListener("unhandledrejection", onErr);
    return () => window.removeEventListener("unhandledrejection", onErr);
  }, []);

  if (!session) {
    return (
      <div className="app-shell login-only">
        <LoginPage
          storeName="TOKO SKLAMINI"
          onEnter={async (pin) => {
            try {
              const data = await loginOwner(pin);
              const next = { token: data.token, user: data.user };
              saveSession(next);
              setSession(next);
              return null;
            } catch (e) {
              if (e instanceof ApiError && e.status !== 401) return e.message;
              return "PIN salah";
            }
          }}
        />
      </div>
    );
  }

  let body: ReactNode = null;
  if (page === "ringkasan") {
    body = (
      <OverviewPage
        onOpenSale={(id) => {
          setSaleFocus(id);
          setPage("penjualan");
        }}
        onOpenShift={() => setPage("shift")}
      />
    );
  } else if (page === "shift") body = <ShiftPage />;
  else if (page === "penjualan") {
    body = <SalesPage openId={saleFocus} onOpened={() => setSaleFocus(null)} />;
  } else if (page === "laporan") body = <LaporanPage />;
  else if (page === "stok") body = <StockPage />;
  else if (page === "pengeluaran") body = <ExpensePage />;
  else if (page === "absen") body = <AbsenPage />;
  else body = <MemberPage />;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-line">
            <span className="brand">TOKO SKLAMINI</span>
            <span className="brand-sub">Owner</span>
          </div>
        </div>
        <span className="grow" />
        <span className="topbar-meta">{session.user.name}</span>
        <span className="topbar-dot" />
        <span className="topbar-meta">
          {clock.toLocaleString("id-ID", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <Button
          variant="ghost"
          onClick={() => {
            clearSession();
            setSession(null);
          }}
        >
          Keluar
        </Button>
      </header>
      <nav className="nav">
        {NAV.map((n) => (
          <button
            key={n.id}
            type="button"
            className={`nav-btn ${page === n.id ? "active" : ""}`}
            onClick={() => setPage(n.id)}
          >
            <NavGlyph page={n.id} />
            <small>{n.label}</small>
          </button>
        ))}
      </nav>
      <main className="page">{body}</main>
    </div>
  );
}
