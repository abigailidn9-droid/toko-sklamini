import { useMemo, useState } from "react";
import { formatTime } from "@sklamini/shared";
import { Button, Field, H2, PinDots, PinPad, Select, Stat, Text } from "../ui/primitives.tsx";
import { PageShell } from "../components/PageHeader.tsx";
import { attendanceToday, clockEmployee, deleteEmployee, listEmployees, upsertEmployee } from "../lib/repo.ts";
import { useToast } from "../ui/toast.tsx";

function statusOf(inTime: string | null, outTime: string | null) {
  if (inTime && outTime) return "done" as const;
  if (inTime) return "work" as const;
  return "wait" as const;
}

function statusLabel(s: "done" | "work" | "wait") {
  if (s === "done") return "Sudah pulang";
  if (s === "work") return "Sedang kerja";
  return "Belum masuk";
}

export function AbsenPage({ tick, onChange }: { tick: number; onChange: () => void }) {
  const emps = useMemo(() => listEmployees(), [tick]);
  const allEmps = useMemo(() => listEmployees(true), [tick]);
  const recap = useMemo(() => attendanceToday(), [tick]);
  const toast = useToast();
  const [empId, setEmpId] = useState("");
  const [pin, setPin] = useState("");
  const [bad, setBad] = useState("");
  const [busy, setBusy] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState("");
  const [formPin, setFormPin] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [formErr, setFormErr] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const selected = emps.find((e) => e.id === empId);
  const rec = recap.find((r) => r.id === empId);
  const selectedStatus = statusOf(rec?.inTime ?? null, rec?.outTime ?? null);
  const next: "in" | "out" = selectedStatus === "work" ? "out" : "in";

  const hadir = recap.filter((r) => r.inTime).length;
  const kerja = recap.filter((r) => r.inTime && !r.outTime).length;
  const belum = recap.filter((r) => !r.inTime).length;

  function closePin() {
    setEmpId("");
    setPin("");
    setBad("");
  }

  async function submit(currentPin = pin) {
    if (!selected || selectedStatus === "done" || busy) return;
    if (currentPin.length !== 6) return;
    setBusy(true);
    const res = await clockEmployee(selected.id, currentPin, next);
    setBusy(false);
    if (!res.ok) {
      setBad(res.error ?? "Gagal");
      setPin("");
      return;
    }
    toast.show(
      `${res.name} ${next === "in" ? "masuk" : "pulang"}`,
      "ok",
      next === "in" ? "Absen masuk tercatat." : "Absen pulang tercatat.",
    );
    closePin();
    onChange();
  }

  function startNew() {
    setEditingId(null);
    setFormName("");
    setFormRole("");
    setFormPin("");
    setFormActive(true);
    setFormErr("");
    setFormOpen(true);
  }

  function startEdit(id: string) {
    const e = allEmps.find((x) => x.id === id);
    if (!e) return;
    setEditingId(e.id);
    setFormName(e.name);
    setFormRole(e.jobRole);
    setFormPin("");
    setFormActive(e.active);
    setFormErr("");
    setFormOpen(true);
  }

  async function saveEmployee() {
    if (formBusy) return;
    setFormBusy(true);
    const res = await upsertEmployee({
      id: editingId ?? undefined,
      name: formName,
      jobRole: formRole,
      pin: formPin.trim() || undefined,
      active: formActive,
    });
    setFormBusy(false);
    if (!res.ok) {
      setFormErr(res.error);
      return;
    }
    setFormOpen(false);
    toast.show(editingId ? "Karyawan diperbarui" : "Karyawan ditambahkan", "ok");
    onChange();
  }

  function askDelete(id: string, name: string) {
    setDeleteTarget({ id, name });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const res = deleteEmployee(deleteTarget.id);
    if (!res.ok) {
      toast.show(res.error, "error");
      setDeleteTarget(null);
      return;
    }
    if (editingId === deleteTarget.id) setFormOpen(false);
    if (empId === deleteTarget.id) closePin();
    toast.show(`${deleteTarget.name} dihapus`, "ok", "Data absen karyawan ini juga dihapus.");
    setDeleteTarget(null);
    onChange();
  }

  return (
    <PageShell
      page="absen"
      title="Absen karyawan"
      hint="Absen masuk dan pulang karyawan."
      actions={
        <>
        <Button onClick={() => setListOpen(true)}>Daftar karyawan</Button>
        <Button variant="primary" onClick={startNew}>
          Tambah
        </Button>
        </>
      }
    >
      <div className="grid grid-3">
        <Stat value={String(hadir)} label="Hadir hari ini" tone="ok" />
        <Stat value={String(kerja)} label="Sedang kerja" />
        <Stat value={String(belum)} label="Belum masuk" tone="warn" />
      </div>
      <div className="absen-grid">
        {emps.map((e) => {
          const row = recap.find((r) => r.id === e.id);
          const st = statusOf(row?.inTime ?? null, row?.outTime ?? null);
          return (
            <button
              key={e.id}
              type="button"
              className="absen-card"
              onClick={() => {
                setEmpId(e.id);
                setPin("");
                setBad("");
              }}
            >
              <b>{e.name}</b>
              <span className="faint">{e.jobRole}</span>
              <span className={`status-pill ${st}`}>{statusLabel(st)}</span>
              <span className="absen-times">
                {row?.inTime ? `Masuk ${formatTime(row.inTime)}` : "Belum absen"}
                {row?.outTime ? ` · Pulang ${formatTime(row.outTime)}` : ""}
              </span>
            </button>
          );
        })}
      </div>
      <table className="data">
        <thead>
          <tr>
            <th>Nama</th>
            <th>Jabatan</th>
            <th>Masuk</th>
            <th>Pulang</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {recap.map((e) => {
            const st = statusOf(e.inTime, e.outTime);
            return (
              <tr key={e.id} className="striped">
                <td>
                  <b>{e.name}</b>
                </td>
                <td>{e.jobRole}</td>
                <td>{e.inTime ? formatTime(e.inTime) : "—"}</td>
                <td>{e.outTime ? formatTime(e.outTime) : "—"}</td>
                <td>
                  <span className={`status-pill ${st}`}>{statusLabel(st)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {selected ? (
        <div className="overlay" style={{ position: "fixed", inset: 0 }}>
          <div className="modal" style={{ width: 380 }}>
            <div className="stack">
              <div className="row">
                <H2>{selected.name}</H2>
                <span className="grow" />
                <Button variant="ghost" onClick={closePin}>
                  Tutup
                </Button>
              </div>
              <Text tone="secondary">{selected.jobRole}</Text>
              {selectedStatus === "done" ? (
                <div className="pay-total">
                  <span>Hari ini</span>
                  <b>
                    {rec?.inTime ? formatTime(rec.inTime) : "—"} –{" "}
                    {rec?.outTime ? formatTime(rec.outTime) : "—"}
                  </b>
                </div>
              ) : (
                <>
                  <div className="pay-total">
                    <span>Absen</span>
                    <b>{next === "in" ? "Masuk" : "Pulang"}</b>
                  </div>
                  <PinDots length={pin.length} />
                  {bad ? (
                    <p className="muted" style={{ color: "var(--danger)", margin: 0 }}>
                      {bad}
                    </p>
                  ) : null}
                  <PinPad
                    onDigit={(d) => {
                      setBad("");
                      setPin((p) => {
                        if (p.length >= 6) return p;
                        const nextPin = p + d;
                        if (nextPin.length === 6) window.setTimeout(() => void submit(nextPin), 0);
                        return nextPin;
                      });
                    }}
                    onClear={() => {
                      setPin("");
                      setBad("");
                    }}
                    onOk={() => void submit()}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
      {listOpen ? (
        <div className="overlay" style={{ position: "fixed", inset: 0 }}>
          <div className="modal detail-modal" style={{ width: 560 }}>
            <div className="stack">
              <div className="row">
                <H2>Daftar karyawan</H2>
                <span className="grow" />
                <Button variant="primary" onClick={startNew}>
                  Tambah
                </Button>
                <Button variant="ghost" onClick={() => setListOpen(false)}>
                  Tutup
                </Button>
              </div>
              {allEmps.length === 0 ? (
                <Text tone="secondary">Belum ada karyawan. Tekan Tambah untuk menambahkan.</Text>
              ) : (
                <table className="data">
                  <thead>
                    <tr>
                      <th>Nama</th>
                      <th>Jabatan</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {allEmps.map((e) => (
                      <tr key={e.id} className="clickable striped" onClick={() => startEdit(e.id)}>
                        <td>
                          <b>{e.name}</b>
                        </td>
                        <td>{e.jobRole}</td>
                        <td>
                          <span className={`status-pill ${e.active ? "ok" : "wait"}`}>
                            {e.active ? "Aktif" : "Nonaktif"}
                          </span>
                        </td>
                        <td>
                          <div className="row">
                            <Button
                              variant="ghost"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                startEdit(e.id);
                              }}
                            >
                              Ubah
                            </Button>
                            <Button
                              variant="danger"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                askDelete(e.id, e.name);
                              }}
                            >
                              Hapus
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      ) : null}
      {formOpen ? (
        <div className="overlay overlay-pin" style={{ position: "fixed", inset: 0 }}>
          <div className="modal" style={{ width: 420 }}>
            <div className="stack">
              <div className="row">
                <H2>{editingId ? "Ubah karyawan" : "Tambah karyawan"}</H2>
                <span className="grow" />
                <Button variant="ghost" onClick={() => setFormOpen(false)}>
                  Tutup
                </Button>
              </div>
              <label className="field-label">
                <span>Nama</span>
                <Field
                  autoFocus
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Nama karyawan"
                />
              </label>
              <label className="field-label">
                <span>Jabatan</span>
                <Field
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
                  placeholder="Kasir, gudang, pramuniaga…"
                />
              </label>
              <div className="grid grid-2">
                <label className="field-label">
                  <span>PIN 6 digit</span>
                  <Field
                    inputMode="numeric"
                    maxLength={6}
                    value={formPin}
                    placeholder={editingId ? "Isi untuk ganti PIN" : "000000"}
                    onChange={(e) => setFormPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  />
                </label>
                <label className="field-label">
                  <span>Status</span>
                  <Select
                    value={formActive ? "1" : "0"}
                    onChange={(e) => setFormActive(e.target.value === "1")}
                  >
                    <option value="1">Aktif</option>
                    <option value="0">Nonaktif</option>
                  </Select>
                </label>
              </div>
              {formErr ? (
                <p className="muted" style={{ color: "var(--danger)", margin: 0 }}>
                  {formErr}
                </p>
              ) : null}
              <div className="row">
                {editingId ? (
                  <Button
                    variant="danger"
                    onClick={() => askDelete(editingId, formName.trim() || "Karyawan")}
                  >
                    Hapus
                  </Button>
                ) : null}
                <span className="grow" />
                <Button variant="primary" disabled={formBusy} onClick={() => void saveEmployee()}>
                  Simpan
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {deleteTarget ? (
        <div className="overlay overlay-pin" style={{ position: "fixed", inset: 0, zIndex: 40 }}>
          <div className="modal" style={{ width: 380 }}>
            <div className="stack">
              <H2>Hapus karyawan?</H2>
              <Text tone="secondary">
                {deleteTarget.name} akan dihapus beserta catatan absennya. Tindakan ini tidak bisa dibatalkan.
              </Text>
              <div className="row">
                <Button onClick={() => setDeleteTarget(null)}>Batal</Button>
                <span className="grow" />
                <Button variant="danger" onClick={confirmDelete}>
                  Hapus
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
