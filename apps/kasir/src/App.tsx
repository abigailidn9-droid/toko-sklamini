import { type ReactNode, useCallback, useEffect, useState } from "react";
import type { CartSnapshot, StoreSettings } from "@sklamini/shared";
import { NAV, defaultMenus, type Page } from "./types.ts";
import { CloudStatus } from "./components/CloudStatus.tsx";
import { NavGlyph } from "./components/NavGlyph.tsx";
import { openDb } from "./lib/db.ts";
import { seedIfEmpty, removeSampleProducts } from "./lib/seed.ts";
import {
  getSale,
  listDrafts,
  loadSettings,
  loginByPin,
  backfillUserPins,
  ensureCloudSettings,
  ensureMemberMenu,
  ensureSyncMeta,
  type Session,
} from "./lib/repo.ts";
import { printNota, printStruk } from "./lib/print.ts";
import { openCashDrawer } from "./lib/cashDrawer.ts";
import { syncNow, type ServerStatus } from "./lib/sync.ts";
import { LoginPage } from "./pages/LoginPage.tsx";
import { DraftPage, KasirPage } from "./pages/KasirPage.tsx";
import { KasPage } from "./pages/KasPage.tsx";
import { RiwayatPage } from "./pages/RiwayatPage.tsx";
import { ReturPage } from "./pages/ReturPage.tsx";
import { ProdukPage } from "./pages/ProdukPage.tsx";
import { RestockPage } from "./pages/RestockPage.tsx";
import { OpnamePage } from "./pages/OpnamePage.tsx";
import { PengeluaranPage } from "./pages/PengeluaranPage.tsx";
import { AbsenPage } from "./pages/AbsenPage.tsx";
import { LaporanPage } from "./pages/LaporanPage.tsx";
import { MemberPage } from "./pages/MemberPage.tsx";
import { PengaturanPage } from "./pages/PengaturanPage.tsx";
import { Button } from "./ui/primitives.tsx";

const SESSION_KEY = "sklamini.session";

function withMemberMenu(menus: readonly string[]): Page[] {
  const set = new Set(menus);
  set.add("member");
  return NAV.map((n) => n.id).filter((id) => set.has(id));
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [bootErr, setBootErr] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [page, setPage] = useState<Page>("kasir");
  const [clock, setClock] = useState(() => new Date());
  const [tick, setTick] = useState(0);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [restore, setRestore] = useState<CartSnapshot | null>(null);
  const [returSaleId, setReturSaleId] = useState<string | null>(null);
  const [cloud, setCloud] = useState<ServerStatus>({ online: false, pending: 0 });

  const refresh = useCallback(() => {
    setTick((n) => n + 1);
    setSettings(loadSettings());
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await openDb();
        ensureSyncMeta();
        try {
          await syncNow();
        } catch {
          /* offline: pakai data lokal / sample */
        }
        await seedIfEmpty();
        removeSampleProducts();
        await backfillUserPins();
        ensureMemberMenu();
        ensureCloudSettings();
        if (!alive) return;
        const raw = localStorage.getItem(SESSION_KEY);
        if (raw) setSession(JSON.parse(raw) as Session);
        setSettings(loadSettings());
        setReady(true);
      } catch (e) {
        setBootErr(e instanceof Error ? e.message : "Gagal membuka database");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!ready) return;
    let stopped = false;
    const tick = async () => {
      const status = await syncNow();
      if (!stopped) {
        removeSampleProducts();
        setCloud(status);
        refresh();
      }
    };
    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, 4000);
    const onOnline = () => {
      void tick();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ready, refresh]);

  if (bootErr) return <div className="boot">{bootErr}</div>;
  if (!ready || !settings) return <div className="boot">Menyiapkan kasir…</div>;

  if (!session) {
    return (
      <div className="app-shell login-only">
        <LoginPage
          settings={settings}
          onEnter={async (pin) => {
            const user = await loginByPin(pin);
            if (!user) return "PIN salah";
            localStorage.setItem(SESSION_KEY, JSON.stringify(user));
            setSession(user);
            return null;
          }}
        />
      </div>
    );
  }

  const menus = withMemberMenu(session.menus?.length ? session.menus : defaultMenus(session.role));
  const items = NAV.filter((n) => menus.includes(n.id));
  const drafts = listDrafts().length;
  const currentPage: Page = menus.includes(page) ? page : (items[0]?.id ?? "kasir");

  let body: ReactNode = null;
  if (currentPage === "kasir") {
    body = (
      <KasirPage
        session={session}
        settings={settings}
        restore={restore}
        onRestoreUsed={() => setRestore(null)}
        tick={tick}
        onHeld={refresh}
        onRefresh={refresh}
        onPaid={(saleId) => {
          refresh();
          void syncNow().then(setCloud);
          const sale = getSale(saleId);
          if (!sale) return;
          const tunai = sale.payments.some((p) => p.method === "tunai" && p.amount > 0);
          if (tunai) void openCashDrawer(settings).catch(() => {});
          const mode = settings.autoPrint === "ask" ? "58mm" : settings.autoPrint;
          if (mode === "skip") return;
          if (mode === "58mm" || mode === "both") printStruk(sale, settings);
          if (mode === "A4" || mode === "both") printNota(sale, settings);
        }}
      />
    );
  } else if (currentPage === "kas") {
    body = <KasPage session={session} settings={settings} tick={tick} onChange={refresh} />;
  } else if (currentPage === "draft") {
    body = (
      <DraftPage
        tick={tick}
        onOpen={(cart) => {
          setRestore(cart);
          setPage("kasir");
          refresh();
        }}
      />
    );
  } else if (currentPage === "riwayat") {
    body = (
      <RiwayatPage
        settings={settings}
        tick={tick}
        onChange={refresh}
        onRetur={(id) => {
          setReturSaleId(id);
          setPage("retur");
        }}
      />
    );
  } else if (currentPage === "member") {
    body = <MemberPage session={session} tick={tick} onChange={refresh} />;
  } else if (currentPage === "retur") {
    body = (
      <ReturPage
        session={session}
        tick={tick}
        saleId={returSaleId}
        onUsed={() => setReturSaleId(null)}
        onChange={refresh}
      />
    );
  } else if (currentPage === "produk") {
    body = <ProdukPage tick={tick} onChange={refresh} />;
  } else if (currentPage === "restock") {
    body = <RestockPage session={session} settings={settings} tick={tick} onChange={refresh} />;
  } else if (currentPage === "opname") {
    body = <OpnamePage session={session} tick={tick} onChange={refresh} />;
  } else if (currentPage === "pengeluaran") {
    body = <PengeluaranPage session={session} tick={tick} onChange={refresh} />;
  } else if (currentPage === "absen") {
    body = <AbsenPage tick={tick} onChange={refresh} />;
  } else if (currentPage === "laporan") {
    body = <LaporanPage settings={settings} tick={tick} onChange={refresh} />;
  } else {
    body = (
      <PengaturanPage
        settings={settings}
        session={session}
        onSave={(s) => {
          setSettings(s);
          void syncNow().then(setCloud);
        }}
        onSessionChange={(s) => {
          localStorage.setItem(SESSION_KEY, JSON.stringify(s));
          setSession(s);
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <div className="app-chrome">
      <header className="topbar">
        {settings.logoDataUrl ? (
          <img className="brand-logo" src={settings.logoDataUrl} alt="" />
        ) : (
          <img className="brand-logo brand-app-icon" src="/app-icon.png" alt="" />
        )}
        <div className="brand-block">
          <div className="brand-line">
            <span className="brand">{settings.storeName}</span>
            <span className="brand-sub">Kasir</span>
          </div>
          {settings.address.trim() || settings.phone.trim() ? (
            <span className="brand-addr">
              {[settings.address.trim(), settings.phone.trim()].filter(Boolean).join(" - ")}
            </span>
          ) : null}
        </div>
        <span className="grow" />
        <CloudStatus cloud={cloud} />
        <span className="topbar-meta">
          {session.name} · {session.role === "owner" ? "Owner" : "Kasir"}
        </span>
        <span className="topbar-dot" />
        <span className="topbar-meta">
          {clock.toLocaleString("id-ID", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <Button
          variant="ghost"
          onClick={() => {
            localStorage.removeItem(SESSION_KEY);
            setSession(null);
          }}
        >
          Keluar
        </Button>
      </header>
      <nav className="nav">
        {items.map((n) => (
          <button
            key={n.id}
            type="button"
            className={`nav-btn ${currentPage === n.id ? "active" : ""}`}
            onClick={() => setPage(n.id)}
          >
            <NavGlyph page={n.id} />
            <small>
              {n.id === "draft" && drafts > 0 ? `${n.label} (${drafts})` : n.label}
            </small>
          </button>
        ))}
      </nav>
      </div>
      <main className={`page${currentPage === "kasir" ? " page-kasir" : currentPage === "pengaturan" ? " page-settings" : ""}`}>{body}</main>
    </div>
  );
}
