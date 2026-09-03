import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastTone = "ok" | "error" | "info";

type ToastItem = {
  id: number;
  title: string;
  detail?: string;
  tone: ToastTone;
  leaving: boolean;
};

type ToastApi = {
  show: (title: string, tone?: ToastTone, detail?: string) => void;
};

const ToastCtx = createContext<ToastApi | null>(null);

let seq = 0;
const HOLD_MS = 3200;
const LEAVE_MS = 340;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    const hold = timers.current.get(id);
    if (hold) window.clearTimeout(hold);
    timers.current.delete(id);
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, LEAVE_MS);
  }, []);

  const show = useCallback(
    (title: string, tone: ToastTone = "ok", detail?: string) => {
      const id = ++seq;
      setItems((prev) => [...prev.filter((t) => !t.leaving).slice(-2), { id, title, detail, tone, leaving: false }]);
      const hold = window.setTimeout(() => dismiss(id), HOLD_MS);
      timers.current.set(id, hold);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {items.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`toast-card ${t.tone}${t.leaving ? " leaving" : ""}`}
            onClick={() => dismiss(t.id)}
          >
            <span className="toast-copy">
              <b>{t.title}</b>
              {t.detail ? <span>{t.detail}</span> : null}
            </span>
          </button>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("ToastProvider missing");
  return ctx;
}
