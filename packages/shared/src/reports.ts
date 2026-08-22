import type { ArusKas, LabaRugi, PayMethod } from "./types.ts";

export type SaleForReport = {
  method: PayMethod;
  total: number;
  status: "selesai" | "void";
  hpp: number;
};

export type ExpenseForReport = { amount: number };
export type RestockForReport = { nilai: number };

export function labaRugi(
  sales: SaleForReport[],
  expenses: ExpenseForReport[],
): LabaRugi {
  const ok = sales.filter((s) => s.status === "selesai");
  const penjualan = ok.reduce((n, s) => n + s.total, 0);
  const hpp = ok.reduce((n, s) => n + s.hpp, 0);
  const pengeluaran = expenses.reduce((n, e) => n + e.amount, 0);
  const labaKotor = penjualan - hpp;
  return {
    penjualan,
    hpp,
    labaKotor,
    pengeluaran,
    labaBersih: labaKotor - pengeluaran,
  };
}

export function arusKas(
  sales: SaleForReport[],
  expenses: ExpenseForReport[],
  restocks: RestockForReport[],
): ArusKas {
  const ok = sales.filter((s) => s.status === "selesai");
  const by = (m: PayMethod) =>
    ok.filter((s) => s.method === m).reduce((n, s) => n + s.total, 0);
  const tunaiMasuk = by("tunai");
  const qris = by("qris");
  const transfer = by("transfer");
  const kartu = by("kartu");
  const pengeluaran = expenses.reduce((n, e) => n + e.amount, 0);
  const restockTunai = restocks.reduce((n, r) => n + r.nilai, 0);
  const kasKeluar = pengeluaran + restockTunai;
  return {
    tunaiMasuk,
    qris,
    transfer,
    kartu,
    hutang: 0,
    pelunasan: 0,
    nonTunai: qris + transfer + kartu,
    pengeluaran,
    restockTunai,
    kasKeluar,
    kasLaci: tunaiMasuk - kasKeluar,
  };
}
