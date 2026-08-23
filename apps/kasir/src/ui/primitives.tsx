import { forwardRef, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

export function H2({ children }: { children: ReactNode }) {
  return <h2 className="h2">{children}</h2>;
}
export function H3({ children }: { children: ReactNode }) {
  return <h3 className="h3">{children}</h3>;
}
export function Text({
  children,
  tone = "primary",
  small,
}: {
  children: ReactNode;
  tone?: "primary" | "secondary" | "tertiary";
  small?: boolean;
}) {
  const cls = tone === "secondary" ? "muted" : tone === "tertiary" ? "faint" : "";
  return (
    <p className={cls} style={{ margin: 0, fontSize: small ? 13 : undefined }}>
      {children}
    </p>
  );
}

export function Button({
  variant = "secondary",
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "pay" | "danger";
}) {
  return (
    <button className={`${variant} ${className ?? ""}`} {...rest}>
      {children}
    </button>
  );
}

export const Field = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Field(props, ref) {
  return <input ref={ref} className="field" {...props} />;
});

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`field${className ? ` ${className}` : ""}`} {...props} />;
}

export function Stat({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone?: "ok" | "warn" | "danger";
}) {
  return (
    <div className={`stat ${tone ?? ""}`}>
      <b className="tabular">{value}</b>
      <span>{label}</span>
    </div>
  );
}

export function Callout({
  title,
  children,
  tone = "info",
}: {
  title: string;
  children?: ReactNode;
  tone?: "ok" | "info" | "danger";
}) {
  return (
    <div className={`callout ${tone === "ok" ? "ok" : tone}`}>
      <b>{title}</b>
      {children ? <div>{children}</div> : null}
    </div>
  );
}

export function Modal({
  width,
  children,
}: {
  width?: number;
  children: ReactNode;
}) {
  return (
    <div className="modal" style={{ width: width ?? 460 }}>
      {children}
    </div>
  );
}

export function PinDots({ length }: { length: number }) {
  return (
    <div className="row" style={{ justifyContent: "center" }}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className={`pin-dot ${i < length ? "on" : ""}`} />
      ))}
    </div>
  );
}

export function PinPad({
  onDigit,
  onClear,
  onOk,
  onBack,
}: {
  onDigit: (d: string) => void;
  onClear: () => void;
  onOk?: () => void;
  onBack?: () => void;
}) {
  const keys = onOk ? ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "OK"] : ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"];
  return (
    <div className="grid grid-3 pin-pad">
      {keys.map((k) => (
        <Button
          key={k}
          variant={k === "OK" ? "primary" : "secondary"}
          aria-label={k === "⌫" ? "Hapus" : k === "C" ? "Hapus semua" : k}
          onClick={() => {
            if (k === "C") onClear();
            else if (k === "OK") onOk?.();
            else if (k === "⌫") onBack?.();
            else onDigit(k);
          }}
        >
          {k}
        </Button>
      ))}
    </div>
  );
}

export function QtyStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (qty: number) => void;
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  function parsed() {
    const n = Number.parseFloat(text.replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : value;
  }

  function commit(raw = text) {
    const n = Number.parseFloat(raw.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      onChange(0);
      return;
    }
    const qty = Math.round(n * 1000) / 1000;
    onChange(qty);
    setText(String(qty).replace(".", ","));
  }

  return (
    <div className="qty-stepper">
      <button className="qty-btn" type="button" onClick={() => onChange(Math.max(0, parsed() - 1))}>
        −
      </button>
      <input
        className="qty-input tabular"
        value={text}
        inputMode="decimal"
        aria-label="Jumlah"
        onChange={(e) => setText(e.target.value.replace(/[^\d.,]/g, ""))}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
      />
      <button className="qty-btn" type="button" onClick={() => onChange(parsed() + 1)}>
        +
      </button>
    </div>
  );
}
