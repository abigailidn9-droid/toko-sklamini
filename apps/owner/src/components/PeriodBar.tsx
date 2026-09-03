import { monthStartIso, todayIso } from "@sklamini/shared";

export type PeriodMode = "hari" | "bulan" | "custom";

export function rangeOf(mode: PeriodMode, from: string, to: string) {
  const today = todayIso();
  if (mode === "hari") return { from: today, to: today };
  if (mode === "bulan") return { from: monthStartIso(), to: today };
  return from <= to ? { from, to } : { from: to, to: from };
}

export function PeriodBar({
  mode,
  from,
  to,
  onMode,
  onFrom,
  onTo,
}: {
  mode: PeriodMode;
  from: string;
  to: string;
  onMode: (mode: PeriodMode) => void;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
}) {
  return (
    <div className="period-bar">
      <div className="tabs">
        <button className={`tab ${mode === "hari" ? "on" : ""}`} type="button" onClick={() => onMode("hari")}>
          Hari ini
        </button>
        <button className={`tab ${mode === "bulan" ? "on" : ""}`} type="button" onClick={() => onMode("bulan")}>
          Bulan ini
        </button>
        <button
          className={`tab ${mode === "custom" ? "on" : ""}`}
          type="button"
          onClick={() => onMode("custom")}
        >
          Custom
        </button>
      </div>
      {mode === "custom" ? (
        <div className="period-range">
          <input className="field" type="date" value={from} max={to} onChange={(e) => onFrom(e.target.value || todayIso())} />
          <span>s.d.</span>
          <input className="field" type="date" value={to} min={from} onChange={(e) => onTo(e.target.value || todayIso())} />
        </div>
      ) : null}
    </div>
  );
}
