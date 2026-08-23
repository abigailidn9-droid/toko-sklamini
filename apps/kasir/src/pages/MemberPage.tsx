import { useMemo, useState } from "react";
import {
  MEMBER_FEE,
  MEMBER_REWARD_NAME,
  MEMBER_VISIT_GOAL,
  PAY_METHOD_LABEL,
  formatDateTime,
  rp,
  type PayMethod,
} from "@sklamini/shared";
import { Button, Callout, Field, H2, Stat, Text } from "../ui/primitives.tsx";
import { PageShell } from "../components/PageHeader.tsx";
import {
  getMember,
  listMembers,
  memberPendingRewards,
  memberRewardsOf,
  memberSales,
  memberVisitCount,
  redeemMemberReward,
  registerMember,
  type Session,
} from "../lib/repo.ts";
import { useToast } from "../ui/toast.tsx";
import { useScanFocus } from "../lib/useScanFocus.ts";

function progressOf(visits: number) {
  const inCycle = visits % MEMBER_VISIT_GOAL;
  const filled = inCycle === 0 && visits > 0 ? MEMBER_VISIT_GOAL : inCycle;
  return { filled, goal: MEMBER_VISIT_GOAL };
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
  const { ref: scanRef } = useScanFocus(true);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [method, setMethod] = useState<PayMethod>("tunai");
  const [err, setErr] = useState("");

  const shown = rows.filter((m) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return m.name.toLowerCase().includes(s) || m.phone.includes(s.replace(/\D/g, ""));
  });
  const ready = rows.filter((m) => m.pending > 0).length;
  const detail = openId ? getMember(openId) : null;
  const detailVisits = openId ? memberVisitCount(openId) : 0;
  const detailPending = openId ? memberPendingRewards(openId) : 0;
  const detailSales = openId ? memberSales(openId) : [];
  const detailRewards = openId ? memberRewardsOf(openId) : [];
  const bar = progressOf(detailVisits);

  function saveMember() {
    const res = registerMember({ name, phone, method, cashier: session });
    if (!res.ok) {
      setErr(res.error);
      toast.show("Tidak tersimpan", "error", res.error);
      return;
    }
    setFormOpen(false);
    setName("");
    setPhone("");
    setMethod("tunai");
    setErr("");
    onChange();
    toast.show("Member terdaftar", "ok", `${res.member.name} · ${rp(MEMBER_FEE)}`);
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

  return (
    <PageShell
      page="member"
      title="Member"
      hint={`Daftar ${rp(MEMBER_FEE)}. Setiap ${MEMBER_VISIT_GOAL} kali belanja dapat ${MEMBER_REWARD_NAME}.`}
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
      <div className="row wrap">
        <Stat value={String(rows.length)} label="Member" />
        <Stat value={String(ready)} label="Siap hadiah" tone={ready ? "ok" : undefined} />
      </div>
      <Field
        ref={scanRef}
        placeholder="Cari nama atau nomor telepon…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <table className="data">
        <thead>
          <tr>
            <th>Nama</th>
            <th>Telepon</th>
            <th className="r">Belanja</th>
            <th>Hadiah</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((m) => {
            const p = progressOf(m.visits);
            return (
              <tr key={m.id} className="clickable striped" onClick={() => setOpenId(m.id)}>
                <td>
                  <b>{m.name}</b>
                </td>
                <td>{m.phone}</td>
                <td className="r tabular">
                  {m.visits} / {p.goal}
                </td>
                <td>
                  {m.pending > 0 ? (
                    <span className="status-pill ok">Siap {MEMBER_REWARD_NAME}</span>
                  ) : (
                    <span className="muted">{p.goal - p.filled} lagi</span>
                  )}
                </td>
              </tr>
            );
          })}
          {!shown.length ? (
            <tr>
              <td colSpan={4} className="muted">
                Belum ada member.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {formOpen ? (
        <div className="overlay" style={{ position: "fixed", inset: 0 }}>
          <div className="modal">
            <div className="stack">
              <div className="row">
                <H2>Daftar member</H2>
                <span className="grow" />
                <Button variant="ghost" onClick={() => setFormOpen(false)}>
                  Tutup
                </Button>
              </div>
              <Text tone="secondary">Biaya pendaftaran {rp(MEMBER_FEE)}. Tidak dihitung sebagai belanja.</Text>
              <label className="field-label">
                <span>Nama</span>
                <Field autoFocus value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="field-label">
                <span>Nomor telepon</span>
                <Field inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </label>
              <Text small tone="secondary">
                Metode bayar pendaftaran
              </Text>
              <div className="pay-methods">
                {(["tunai", "qris", "transfer", "kartu"] as PayMethod[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`method-btn ${method === m ? "on" : ""}`}
                    onClick={() => setMethod(m)}
                  >
                    <b>{PAY_METHOD_LABEL[m]}</b>
                  </button>
                ))}
              </div>
              {err ? (
                <Callout title="Tidak bisa disimpan" tone="danger">
                  {err}
                </Callout>
              ) : null}
              <Button variant="primary" disabled={!name.trim() || phone.replace(/\D/g, "").length < 8} onClick={saveMember}>
                Simpan · {rp(MEMBER_FEE)}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {detail && openId ? (
        <div
          className="overlay"
          style={{ position: "fixed", inset: 0 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpenId(null);
          }}
        >
          <div className="modal detail-modal">
            <div className="stack">
              <div className="detail-head">
                <div>
                  <H2>{detail.name}</H2>
                  <Text tone="secondary">{detail.phone}</Text>
                </div>
                <Button variant="ghost" onClick={() => setOpenId(null)}>
                  Tutup
                </Button>
              </div>
              <div className="member-progress">
                <div className="row">
                  <b>
                    {detailVisits} kali belanja
                  </b>
                  <span className="grow" />
                  <span className="muted">
                    {bar.filled}/{bar.goal} menuju hadiah
                  </span>
                </div>
                <div className="member-bar">
                  <i style={{ width: `${(bar.filled / bar.goal) * 100}%` }} />
                </div>
              </div>
              {detailPending > 0 ? (
                <Callout title="Hadiah siap" tone="ok">
                  {MEMBER_REWARD_NAME} — {detailPending}x. Serahkan ke member, lalu tandai.
                </Callout>
              ) : null}
              {detailPending > 0 ? (
                <Button variant="primary" onClick={redeem}>
                  Tandai hadiah diberikan
                </Button>
              ) : null}
              <Text small tone="tertiary">
                Riwayat belanja
              </Text>
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
                  {!detailSales.length ? (
                    <tr>
                      <td colSpan={3} className="muted">
                        Belum ada belanja.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
              {detailRewards.length ? (
                <>
                  <Text small tone="tertiary">
                    Hadiah yang sudah diberikan
                  </Text>
                  {detailRewards.map((r) => (
                    <Text key={r.id} small>
                      {MEMBER_REWARD_NAME} · {formatDateTime(r.createdAt)} · {r.cashierName}
                    </Text>
                  ))}
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
