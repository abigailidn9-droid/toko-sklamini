import { useEffect, useMemo, useState } from "react";
import { MEMBER_VISIT_GOAL, rp } from "@sklamini/shared";
import { PageShell } from "../components/PageHeader.tsx";
import { Callout, Field } from "../ui/primitives.tsx";
import { fetchMembers, type MemberRow } from "../lib/api.ts";

export function MemberPage() {
  const [rows, setRows] = useState<MemberRow[] | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    fetchMembers()
      .then((list) => {
        if (alive) {
          setRows(list);
          setErr("");
        }
      })
      .catch((e) => {
        if (alive) setErr(e instanceof Error ? e.message : "Gagal memuat");
      });
    return () => {
      alive = false;
    };
  }, []);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows ?? [];
    return (rows ?? []).filter((m) => m.name.toLowerCase().includes(s) || m.phone.includes(s));
  }, [rows, q]);

  return (
    <PageShell page="member" title="Member" hint={`Kunjungan belanja. Hadiah tiap ${MEMBER_VISIT_GOAL} kali.`}>
      {err ? (
        <Callout title="Tidak terhubung" tone="danger">
          {err}
        </Callout>
      ) : null}
      <Field placeholder="Cari nama atau HP" value={q} onChange={(e) => setQ(e.target.value)} />
      {!rows ? (
        <div className="boot-inline">Memuat member…</div>
      ) : shown.length === 0 ? (
        <Callout title="Tidak ada member">Belum ada data, atau pencarian kosong.</Callout>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Nama</th>
              <th>Kunjungan</th>
              <th className="r">Belanja</th>
              <th>Hadiah</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((m) => (
              <tr key={m.id} className="striped">
                <td>
                  <b>{m.name}</b>
                  <div className="faint">{m.phone || "—"}</div>
                </td>
                <td className="tabular">
                  {m.visits} / {MEMBER_VISIT_GOAL}
                </td>
                <td className="r tabular">{rp(m.spent)}</td>
                <td>{m.pending ? `${m.pending} menunggu` : m.rewards ? `${m.rewards} diambil` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </PageShell>
  );
}
