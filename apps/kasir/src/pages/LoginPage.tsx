import { useEffect, useRef, useState } from "react";
import { H2, PinDots, PinPad, Text } from "../ui/primitives.tsx";
import { useToast } from "../ui/toast.tsx";

export function LoginPage({
  onEnter,
}: {
  onEnter: (pin: string) => Promise<string | null>;
}) {
  const toast = useToast();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const busyRef = useRef(false);

  async function submit(current: string) {
    if (current.length !== 6 || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const msg = await onEnter(current);
    busyRef.current = false;
    setBusy(false);
    if (!msg) return;
    toast.show("PIN salah", "error", "Coba lagi.");
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
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setPin("");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="login-screen">
      <aside className="login-hero">
        <div className="login-brand-mark" aria-hidden>
          S
        </div>
        <p className="login-kicker">Point of sale</p>
        <h1>
          Toko
          <br />
          Sklamini
        </h1>
        <p className="login-lead">Kasir untuk operasional harian, online maupun tanpa internet.</p>
      </aside>
      <section className="login-panel">
        <div className={`login-card stack${busy ? " busy" : ""}`}>
          <div className="login-card-head">
            <H2>Masuk</H2>
            <Text tone="secondary">Masukkan PIN</Text>
          </div>
          <div className={`login-dots${shake ? " shake" : ""}`}>
            <PinDots length={pin.length} />
          </div>
          <PinPad
            onDigit={addDigit}
            onClear={() => setPin("")}
            onBack={() => setPin((p) => p.slice(0, -1))}
          />
        </div>
      </section>
    </div>
  );
}
