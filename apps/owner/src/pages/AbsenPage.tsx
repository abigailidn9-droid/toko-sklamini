import { useEffect, useState } from "react";
import { formatTime, todayIso } from "@sklamini/shared";
import { PageShell } from "../components/PageHeader.tsx";
import { Callout } from "../ui/primitives.tsx";
import { fetchAttendance, type AttendanceRow } from "../lib/api.ts";

function statusOf(inTime: string | null, outTime: string | null) {
  if (inTime && outTime) return { cls: "done" as const, label: "Sudah pulang" };
  if (inTime) return { cls: "work" as const, label: "Sedang kerja" };
  return { cls: "wait" as const, label: "Belum masuk" };
}

export function AbsenPage() {
  const [date, setDate] = useState(todayIso());
  const [rows, setRows] = useState<AttendanceRow[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    fetchAttendance(date)
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
  }, [date]);

  const hadir = rows?.filter((r) => r.inTime).length ?? 0;
  const kerja = rows?.filter((r) => r.inTime && !r.outTime).length ?? 0;

  return (
    <PageShell
      page="absen"
      title="Absen"
      hint="Kehadiran karyawan di toko, menurut data yang sudah sync."
      actions={<input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value || todayIso())} />}
    >
      {err ? (
        <Callout title="Tidak terhubung" tone="danger">
          {err}
        </Callout>
      ) : null}
      <div className="stat-grid">
        <div className="stat">
          <b className="tabular">{hadir}</b>
          <span>Hadir</span>
        </div>
        <div className="stat">
          <b className="tabular">{kerja}</b>
          <span>Masih di toko</span>
        </div>
      </div>
      {!rows ? (
        <div className="boot-inline">Memuat absen…</div>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Nama</th>
              <th>Masuk</th>
              <th>Pulang</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const st = statusOf(r.inTime, r.outTime);
              return (
                <tr key={r.id} className="striped">
                  <td>
                    <b>{r.name}</b>
                    <div className="faint">{r.jobRole}</div>
                  </td>
                  <td>{r.inTime ? formatTime(r.inTime) : "—"}</td>
                  <td>{r.outTime ? formatTime(r.outTime) : "—"}</td>
                  <td>
                    <span className={`status-pill ${st.cls}`}>{st.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </PageShell>
  );
}
