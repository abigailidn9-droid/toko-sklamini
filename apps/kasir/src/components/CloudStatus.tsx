import type { ServerStatus } from "../lib/sync.ts";

const svg = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Icon({ kind }: { kind: "on" | "wait" | "off" }) {
  if (kind === "off") {
    return (
      <svg {...svg} aria-hidden>
        <path d="M17.5 19H8.2A4.2 4.2 0 0 1 7 11.1 6 6 0 0 1 12.2 6" />
        <path d="M16.8 8.1A4.5 4.5 0 0 1 21.5 13" />
        <path d="M4 4l16 16" />
      </svg>
    );
  }
  return (
    <svg {...svg} aria-hidden>
      <path d="M7 19h10.5a4.5 4.5 0 0 0 .4-9A6 6 0 0 0 6.8 11 4 4 0 0 0 7 19z" />
    </svg>
  );
}

export function CloudStatus({ cloud }: { cloud: ServerStatus }) {
  const kind = cloud.online ? (cloud.pending ? "wait" : "on") : "off";
  const title = cloud.online
    ? cloud.pending
      ? `${cloud.pending} data menunggu terkirim`
      : "Tersimpan di cloud"
    : "Mode lokal — akan terkirim saat jaringan pulih";

  return (
    <span className={`cloud-status ${kind}`} title={title} aria-label={title}>
      <Icon kind={kind} />
      <i className="cloud-status-dot" />
      {kind === "wait" && cloud.pending > 0 ? (
        <b className="cloud-status-n">{cloud.pending > 9 ? "9+" : cloud.pending}</b>
      ) : null}
    </span>
  );
}
