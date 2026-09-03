import { persistNow } from "./db.ts";
import { CLOUD_API_TOKEN, CLOUD_API_URL } from "./cloud.ts";
import {
  applyPullPayload,
  deviceId,
  outboxItems,
  pendingCount,
  pullSince,
  removeOutbox,
} from "./repo.ts";

const PING_MS = 4000;
const PUSH_MS = 15000;
const PULL_MS = 45000;
const BATCH = 40;

function syncHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (CLOUD_API_TOKEN) headers.Authorization = `Bearer ${CLOUD_API_TOKEN}`;
  return headers;
}

export type ServerStatus = {
  online: boolean;
  pending: number;
};

export async function pingApi(url: string = CLOUD_API_URL): Promise<boolean> {
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/health`, {
      signal: AbortSignal.timeout(PING_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function pushOutbox(): Promise<boolean> {
  const items = outboxItems();
  if (!items.length) return true;
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    try {
      const res = await fetch(`${CLOUD_API_URL}/v1/sync/push`, {
        method: "POST",
        headers: syncHeaders(),
        signal: AbortSignal.timeout(PUSH_MS),
        body: JSON.stringify({
          deviceId: deviceId(),
          items: batch.map((row) => ({
            id: row.id,
            entity: row.entity,
            payload: JSON.parse(row.payload),
          })),
        }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { accepted?: string[] };
      removeOutbox(data.accepted ?? []);
    } catch {
      return false;
    }
  }
  return true;
}

async function pullRemote(): Promise<void> {
  const full = pullSince() === "1970-01-01T00:00:00.000Z";
  const res = await fetch(`${CLOUD_API_URL}/v1/sync/pull?since=${encodeURIComponent(pullSince())}`, {
    headers: syncHeaders(),
    signal: AbortSignal.timeout(PULL_MS),
  });
  if (!res.ok) return;
  const data = (await res.json()) as Record<string, unknown>;
  applyPullPayload(data, full);
}

async function runOnce(): Promise<ServerStatus> {
  try {
    await persistNow();
    const online = await pingApi();
    if (!online) return { online: false, pending: pendingCount() };

    let pushed = true;
    while (outboxItems().length && pushed) {
      const before = outboxItems().length;
      pushed = await pushOutbox();
      if (outboxItems().length >= before) break;
    }
    try {
      await pullRemote();
    } catch {
      /* pull gagal: penjualan lokal tetap aman */
    }
    await persistNow();
    return { online: true, pending: pendingCount() };
  } catch {
    return { online: false, pending: pendingCount() };
  }
}

let running: Promise<ServerStatus> | null = null;
let again = false;

/** Kirim antrian ke cloud. Aman dipanggil berulang; tidak perlu pengaturan. */
export function syncNow(): Promise<ServerStatus> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    let last: ServerStatus = { online: false, pending: pendingCount() };
    try {
      do {
        again = false;
        last = await runOnce();
      } while (again);
      return last;
    } finally {
      running = null;
    }
  })();
  return running;
}

export async function fetchServerStatus(): Promise<ServerStatus> {
  const pending = pendingCount();
  const online = await pingApi();
  return { online, pending };
}
