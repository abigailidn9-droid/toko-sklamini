import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  forwardRef,
} from "react";

export function H2({ children }: { children: ReactNode }) {
  return <h2 className="h2">{children}</h2>;
}

export function Text({
  children,
  tone = "primary",
  small,
}: {
  children: ReactNode;
  tone?: "primary" | "secondary";
  small?: boolean;
}) {
  return (
    <p className={tone === "secondary" ? "muted" : ""} style={{ margin: 0, fontSize: small ? 13 : undefined }}>
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
  variant?: "primary" | "secondary" | "ghost" | "danger";
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
  onBack,
}: {
  onDigit: (d: string) => void;
  onClear: () => void;
  onBack?: () => void;
}) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"];
  return (
    <div className="grid-3 pin-pad">
      {keys.map((k) => (
        <Button
          key={k}
          variant="secondary"
          aria-label={k === "⌫" ? "Hapus" : k === "C" ? "Hapus semua" : k}
          onClick={() => {
            if (k === "C") onClear();
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
