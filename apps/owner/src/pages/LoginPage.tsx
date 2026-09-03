import { useEffect, useRef, useState } from "react";
import { PinDots, PinPad } from "../ui/primitives.tsx";
import { useToast } from "../ui/toast.tsx";

export function LoginPage({
  storeName,
  onEnter,
}: {
  storeName: string;
  onEnter: (pin: string) => Promise<string | null>;
}) {
  const toast = useToast();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const busyRef = useRef(false);
  const name = storeName.trim() || "TOKO SKLAMINI";

  async function submit(current: string) {
    if (current.length !== 6 || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const msg = await onEnter(current);
    busyRef.current = false;
    setBusy(false);
    if (!msg) return;
    toast.show("Tidak bisa masuk", "error", msg);
    setShake(true);
    window.setTimeout(() => setShake(false), 420);
    setPin("");
  }

  function addDigit(d: string) {
    if (busyRef.current) return;
    setPin((p) => {
      if (p.length >= 6) return p;
      const next = p + d;
      if (next.length === 6) window.setTimeout(() => void submit(next), 40);
      return next;
    });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        addDigit(e.key);
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        setPin((p) => p.slice(0, -1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="login-screen">
      <div className="login-aurora" aria-hidden />
      <div className="login-stack">
        <div className="login-brand">
          <div className="login-logo-wrap">
            <span>{name.slice(0, 1)}</span>
          </div>
          <span className="login-brand-name">{name}</span>
        </div>
        <div className={`login-card${busy ? " busy" : ""}`}>
          <h1>Pantau toko</h1>
          <p className="login-lead">Masukkan PIN owner 6 digit untuk melihat shift, penjualan, dan laporan dari jarak jauh.</p>
          <div className={`login-dots${shake ? " shake" : ""}`}>
            <PinDots length={pin.length} />
          </div>
          <PinPad onDigit={addDigit} onClear={() => setPin("")} onBack={() => setPin((p) => p.slice(0, -1))} />
          <p className="login-foot">PIN kasir tidak bisa masuk ke halaman ini.</p>
        </div>
      </div>
    </div>
  );
}
