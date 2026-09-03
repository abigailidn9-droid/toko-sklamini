import { useEffect, useMemo, useRef, useState } from "react";
import {
  MEMBER_MIN_SPEND,
  MEMBER_REWARD_NAME,
  MEMBER_VISIT_GOAL,
  formatDateTime,
  rp,
  type Member,
} from "@sklamini/shared";
import { Button, Callout, Field, H2, PinDots, PinPad, Select, Text } from "../ui/primitives.tsx";
import { PageShell } from "../components/PageHeader.tsx";
import {
  deactivateMember,
  getMember,
  listMembers,
  listEligibleJoinSales,
  memberPendingRewards,
  memberRewardsOf,
  memberSales,
  memberVisitCount,
  ownerPinOk,
  redeemMemberReward,
  registerMember,
  updateMember,
  type Session,
} from "../lib/repo.ts";
import { useToast } from "../ui/toast.tsx";
import { useScanFocus } from "../lib/useScanFocus.ts";

function progressOf(visits: number) {
  const inCycle = visits % MEMBER_VISIT_GOAL;
  const filled = inCycle === 0 && visits > 0 ? MEMBER_VISIT_GOAL : inCycle;
  return { filled, goal: MEMBER_VISIT_GOAL };
}

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

function memberNote(note: string) {
  const t = note.trim();
  return !t || t === "sample" ? "" : t;
}

export function MemberPage({
  session,
  tick,
  onChange,
}: {
  session: Session;
  tick: number;
  onChange: () => void;
}) {
  const toast = useToast();
  const members = useMemo(() => listMembers(), [tick]);
  const rows = useMemo(
    () =>
      members.map((m) => {
        const visits = memberVisitCount(m.id);
        const pending = memberPendingRewards(m.id);
        const rewards = memberRewardsOf(m.id).length;
        return { ...m, visits, pending, rewards };
      }),
    [members],
  );
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const eligibleSales = useMemo(() => listEligibleJoinSales(), [tick, formOpen]);
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);
  const [pin, setPin] = useState("");
  const [bad, setBad] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saleId, setSaleId] = useState("");
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editErr, setEditErr] = useState("");
  const deletingRef = useRef(false);
  const { ref: scanRef } = useScanFocus(!formOpen && !openId && !deleteTarget);

  const shown = rows.filter((m) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    const digits = s.replace(/\D/g, "");
    return m.name.toLowerCase().includes(s) || (digits.length > 0 && m.phone.includes(digits));
  });
  const ready = rows.filter((m) => m.pending > 0).length;
  const detail = openId ? getMember(openId) : null;
  const detailVisits = openId ? memberVisitCount(openId) : 0;
  const detailPending = openId ? memberPendingRewards(openId) : 0;
  const detailSales = openId ? memberSales(openId) : [];
  const detailRewards = openId ? memberRewardsOf(openId) : [];
  const bar = progressOf(detailVisits);
  const shownNote = detail ? memberNote(detail.note) : "";

  function closeDetail() {
    setOpenId(null);
    setEditing(false);
    setEditErr("");
  }

  function startEdit() {
    if (!detail) return;
    setEditName(detail.name);
    setEditPhone(detail.phone);
    setEditNote(memberNote(detail.note));
    setEditErr("");
    setEditing(true);
  }

  function saveEdit() {
    if (!openId) return;
    const res = updateMember({ id: openId, name: editName, phone: editPhone, note: editNote });
    if (!res.ok) {
      setEditErr(res.error);
      toast.show("Tidak tersimpan", "error", res.error);
      return;
    }
    setEditing(false);
    setEditErr("");
    onChange();
    toast.show("Member diubah", "ok", res.member.name);
  }

  function saveMember() {
    const res = registerMember({ name, phone, saleId });
    if (!res.ok) {
      setErr(res.error);
      toast.show("Tidak tersimpan", "error", res.error);
      return;
    }
    setFormOpen(false);
    setName("");
    setPhone("");
    setSaleId("");
    setErr("");
    onChange();
    toast.show("Member terdaftar", "ok", `${res.member.name} · gratis`);
  }

  function redeem() {
    if (!openId) return;
    const res = redeemMemberReward({ memberId: openId, cashier: session });
    if (!res.ok) {
      toast.show("Belum bisa ditukar", "error", res.error);
      return;
    }
    onChange();
    toast.show("Hadiah diberikan", "ok", MEMBER_REWARD_NAME);
  }

  function askDelete(member: Member) {
    deletingRef.current = false;
    setOpenId(null);
    setPin("");
    setBad(false);
    setDeleteTarget(member);
  }

  async function confirmDelete(current: string) {
    if (current.length !== 6 || !deleteTarget || deletingRef.current) return;
    deletingRef.current = true;
    const ok = await ownerPinOk(current);
    if (!ok) {
      deletingRef.current = false;
      setBad(true);
      setPin("");
      toast.show("PIN owner salah", "error", "Hapus member dibatalkan.");
      return;
    }
    const res = deactivateMember(deleteTarget.id);
    if (!res.ok) {
      deletingRef.current = false;
      toast.show("Tidak terhapus", "error", res.error);
      setDeleteTarget(null);
      setPin("");
      return;
    }
    toast.show("Member dihapus", "ok", deleteTarget.name);
    setDeleteTarget(null);
    setPin("");
    setBad(false);
    onChange();
  }

  useEffect(() => {
    if (!deleteTarget) return;
    function onKey(e: KeyboardEvent) {
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        setBad(false);
        setPin((p) => (p.length >= 6 ? p : p + e.key));
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        setPin((p) => p.slice(0, -1));
      }
      if (e.key === "Escape") {
        e.preventDefault();
        deletingRef.current = false;
        setDeleteTarget(null);
        setPin("");
        setBad(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteTarget]);

  useEffect(() => {
    if (!deleteTarget || pin.length !== 6) return;
    void confirmDelete(pin);
  }, [pin, deleteTarget]);

  return (
    <PageShell
      page="member"
      title="Member"
      hint={`Daftar gratis, syarat belanja ${rp(MEMBER_MIN_SPEND)}. Setiap ${MEMBER_VISIT_GOAL} kali belanja dapat ${MEMBER_REWARD_NAME}.`}
      className="member-page"
      actions={
        <Button
          variant="primary"
          onClick={() => {
            setErr("");
            setFormOpen(true);
          }}
        >
          Daftar
        </Button>
      }
    >
      <section className="member-hero">
        <div>
          <span>Member</span>
          <b className="tabular">{rows.length}</b>
        </div>
        <div>
          <span>Siap hadiah</span>
          <b className={`tabular${ready ? " is-ready" : ""}`}>{ready}</b>
        </div>
      </section>

      <section className="member-list">
        <div className="member-list-head">
          <Field
            ref={scanRef}
            placeholder="Cari nama atau nomor telepon…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <span className="member-list-count">{shown.length} dari {rows.length}</span>
        </div>
        {shown.length === 0 ? (
          <div className="member-empty">
            <b>{rows.length ? "Tidak ditemukan" : "Belum ada member"}</b>
            <span>
              {rows.length
                ? "Coba nama atau nomor telepon lain."
                : `Daftar gratis jika belanja ${rp(MEMBER_MIN_SPEND)}. Hadiah tiap ${MEMBER_VISIT_GOAL} kali belanja.`}
            </span>
          </div>
        ) : (
          <div className="member-table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Kunjungan</th>
                  <th>Hadiah</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((m) => {
                  const p = progressOf(m.visits);
                  const left = p.goal - p.filled;
                  return (
                    <tr key={m.id} className="clickable" onClick={() => { setEditing(false); setOpenId(m.id); }}>
                      <td>
                        <div className="member-who">
                          <b>{m.name}</b>
                          <span>{m.phone || "—"}</span>
                        </div>
                      </td>
                      <td>
                        <div className="member-visit">
                          <span className="tabular">
                            {p.filled}/{p.goal}
                          </span>
                          <div className="member-bar">
                            <i style={{ width: `${(p.filled / p.goal) * 100}%` }} />
                          </div>
                        </div>
                      </td>
                      <td>
                        {m.pending > 0 ? (
                          <span className="status-pill done">Siap {m.pending}x</span>
                        ) : (
                          <span className="muted">{left} lagi</span>
                        )}
                      </td>
                      <td className="member-del-cell">
                        <button
                          type="button"
                          className="member-del"
                          onClick={(e) => {
                            e.stopPropagation();
                            askDelete(m);
                          }}
                        >
                          Hapus
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {formOpen ? (
        <div
          className="overlay"
          style={{ position: "fixed", inset: 0 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setFormOpen(false);
          }}
        >
          <div className="modal">
            <div className="stack">
              <div className="row">
                <H2>Daftar member</H2>
                <span className="grow" />
                <Button variant="ghost" onClick={() => setFormOpen(false)}>
                  Tutup
                </Button>
              </div>
              <Text tone="secondary">
                Gratis. Syarat: pilih nota belanja minimal {rp(MEMBER_MIN_SPEND)}. Nota itu jadi belanja ke-1.
              </Text>
              <label className="field-label">
                <span>Nama</span>
                <Field autoFocus value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="field-label">
                <span>Nomor telepon</span>
                <Field inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </label>
              <label className="field-label">
                <span>Nota belanja</span>
                <Select value={saleId} onChange={(e) => setSaleId(e.target.value)}>
                  <option value="">Pilih nota…</option>
                  {eligibleSales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.localNo} · {rp(s.total)} · {formatDateTime(s.createdAt)}
                    </option>
                  ))}
                </Select>
              </label>
              {!eligibleSales.length ? (
                <Callout title="Belum ada nota yang memenuhi">
                  Bayar dulu di kasir minimal {rp(MEMBER_MIN_SPEND)} tanpa member, atau daftar langsung saat bayar.
                </Callout>
              ) : null}
              {err ? (
                <Callout title="Tidak bisa disimpan" tone="danger">
                  {err}
                </Callout>
              ) : null}
              <Button
                variant="primary"
                disabled={!name.trim() || phone.replace(/\D/g, "").length < 8 || !saleId}
                onClick={saveMember}
              >
                Daftar gratis
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {detail && openId ? (
        <div
          className="overlay extra-overlay"
          style={{ position: "fixed", inset: 0 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeDetail();
          }}
        >
          <div className="modal extra-modal member-sheet" onMouseDown={(e) => e.stopPropagation()}>
            <header className="member-sheet-head">
              <span className="member-avatar" aria-hidden>
                {initialsOf(detail.name) || "M"}
              </span>
              <div className="member-sheet-who">
                <h2 className="h2">{detail.name}</h2>
                <p>{detail.phone || "Tanpa nomor"}</p>
              </div>
              <Button variant="ghost" onClick={closeDetail}>
                Tutup
              </Button>
            </header>

            {editing ? (
              <div className="member-sheet-form">
                <label className="field-label">
                  <span>Nama</span>
                  <Field autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} />
                </label>
                <label className="field-label">
                  <span>Nomor telepon</span>
                  <Field inputMode="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
                </label>
                <label className="field-label">
                  <span>Catatan</span>
                  <Field
                    placeholder="Alamat, preferensi, dll."
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                  />
                </label>
                {editErr ? (
                  <Callout title="Tidak bisa disimpan" tone="danger">
                    {editErr}
                  </Callout>
                ) : null}
                <div className="member-sheet-form-actions">
                  <Button
                    onClick={() => {
                      setEditing(false);
                      setEditErr("");
                    }}
                  >
                    Batal
                  </Button>
                  <Button
                    variant="primary"
                    disabled={!editName.trim() || editPhone.replace(/\D/g, "").length < 8}
                    onClick={saveEdit}
                  >
                    Simpan
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {shownNote ? <p className="member-sheet-note">{shownNote}</p> : null}
                <div className="member-sheet-actions">
                  <Button onClick={startEdit}>Edit</Button>
                  <Button variant="danger" onClick={() => askDelete(detail)}>
                    Hapus
                  </Button>
                </div>
              </>
            )}

            <div className="member-sheet-stats">
              <div>
                <span>Belanja</span>
                <b className="tabular">{detailVisits} kali</b>
              </div>
              <div>
                <span>Menuju hadiah</span>
                <b className="tabular">
                  {bar.filled}/{bar.goal}
                </b>
              </div>
              <div className="member-bar">
                <i style={{ width: `${(bar.filled / bar.goal) * 100}%` }} />
              </div>
            </div>

            {detailPending > 0 ? (
              <div className="member-sheet-reward">
                <Callout title="Hadiah siap" tone="ok">
                  {MEMBER_REWARD_NAME} — {detailPending}x. Serahkan ke member, lalu tandai.
                </Callout>
                <Button variant="primary" onClick={redeem}>
                  Tandai hadiah diberikan
                </Button>
              </div>
            ) : null}

            <section className="member-sheet-history">
              <h3>Riwayat belanja</h3>
              {detailSales.length ? (
                <table className="data">
                  <thead>
                    <tr>
                      <th>Nota</th>
                      <th>Waktu</th>
                      <th className="r">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailSales.map((s) => (
                      <tr key={s.id} className="striped">
                        <td>
                          <b>{s.localNo}</b>
                          {s.status === "void" ? <span className="status-pill void">Void</span> : null}
                        </td>
                        <td>{formatDateTime(s.createdAt)}</td>
                        <td className="r tabular">{rp(s.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="member-sheet-empty">Belum ada belanja.</p>
              )}
            </section>

            {detailRewards.length ? (
              <section className="member-sheet-history">
                <h3>Hadiah diberikan</h3>
                <ul className="member-sheet-rewards">
                  {detailRewards.map((r) => (
                    <li key={r.id}>
                      <b>{MEMBER_REWARD_NAME}</b>
                      <span>
                        {formatDateTime(r.createdAt)} · {r.cashierName}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div
          className="overlay extra-overlay overlay-pin"
          style={{ position: "fixed", inset: 0 }}
          onMouseDown={() => {
            setDeleteTarget(null);
            setPin("");
            setBad(false);
          }}
        >
          <div className="modal extra-modal member-del-modal" onMouseDown={(e) => e.stopPropagation()}>
            <header className="extra-modal-head">
              <span className="extra-modal-ico member-del-ico" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4.5 7h15" />
                  <path d="M9 7V5.2A1.2 1.2 0 0 1 10.2 4h3.6A1.2 1.2 0 0 1 15 5.2V7" />
                  <path d="M7 7.5 8 19.2A1.5 1.5 0 0 0 9.5 20.5h5A1.5 1.5 0 0 0 16 19.2L17 7.5" />
                </svg>
              </span>
              <div>
                <h2 className="h2">Hapus member</h2>
                <p>Masukkan PIN owner untuk konfirmasi.</p>
              </div>
            </header>
            <div className="member-del-who">
              <b>{deleteTarget.name}</b>
              <span>{deleteTarget.phone}</span>
            </div>
            <p className="member-del-note">Riwayat belanja tidak ikut terhapus.</p>
            <div className={`member-del-pin${bad ? " shake" : ""}`}>
              <PinDots length={pin.length} />
              {bad ? <span>PIN owner salah</span> : null}
            </div>
            <PinPad
              onDigit={(d) => {
                setBad(false);
                setPin((p) => (p.length >= 6 ? p : p + d));
              }}
              onClear={() => {
                setPin("");
                setBad(false);
              }}
              onBack={() => setPin((p) => p.slice(0, -1))}
            />
            <Button
              className="member-del-cancel"
              onClick={() => {
                deletingRef.current = false;
                setDeleteTarget(null);
                setPin("");
                setBad(false);
              }}
            >
              Batal
            </Button>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
