import { persistNow } from "./db.ts";
import {
  applyPullPayload,
  deviceId,
  getCursor,
  loadSettings,
  outboxItems,
  pendingCount,
  removeOutbox,
} from "./repo.ts";

function syncHeaders(): Record<string, string> {
  const token = loadSettings().apiToken.trim();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function pingApi(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/health`, {
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function syncNow(): Promise<{ online: boolean; pending: number }> {
  await persistNow();
  const settings = loadSettings();
  const base = settings.apiUrl.replace(/\/$/, "");
  const online = await pingApi(base);
  if (!online) return { online: false, pending: pendingCount() };

  const items = outboxItems();
  if (items.length) {
    try {
      const res = await fetch(`${base}/v1/sync/push`, {
        method: "POST",
        headers: syncHeaders(),
        body: JSON.stringify({
          deviceId: deviceId(),
          items: items.map((i) => ({
            id: i.id,
            entity: i.entity,
            payload: JSON.parse(i.payload),
          })),
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { accepted?: string[] };
        removeOutbox(data.accepted ?? []);
      }
    } catch {
      /* tetap antrian */
    }
  }

  try {
    const res = await fetch(`${base}/v1/sync/pull?since=${encodeURIComponent(getCursor())}`, {
      headers: syncHeaders(),
    });
    if (res.ok) {
      const data = (await res.json()) as Record<string, unknown>;
      applyPullPayload(data);
    }
  } catch {
    /* offline pull */
  }

  await persistNow();
  return { online: true, pending: pendingCount() };
}
