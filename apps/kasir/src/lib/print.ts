import { EXPENSE_LABEL, PAY_METHOD_LABEL, formatDateTime, formatQty, ppnLabel, rp, saleMethodLabel, type Sale, type StoreSettings } from "@sklamini/shared";
import type { ShiftSettlement } from "./repo.ts";
import { drawerPrinterName } from "./cashDrawer.ts";
import { tauriInvoke } from "./tauri.ts";

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shopIcon() {
  return `<svg class="mark" viewBox="0 0 64 52" aria-hidden="true">
    <path fill="none" stroke="#111" stroke-width="2.4" stroke-linejoin="round"
      d="M8 22 16 8h32l8 14v24H8V22Z"/>
    <path fill="none" stroke="#111" stroke-width="2.4"
      d="M8 22h48M22 46V30h20v16"/>
    <path fill="none" stroke="#111" stroke-width="2.2"
      d="M16 8v6M48 8v6"/>
  </svg>`;
}

function logoTag(settings: StoreSettings) {
  if (!settings.logoDataUrl) return shopIcon();
  return `<img class="logo" src="${settings.logoDataUrl}" alt="" />`;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function whenParts(iso: string) {
  const d = new Date(iso);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
  };
}

function printHtml(title: string, body: string, kind: "struk" | "nota", paperMm: "58" | "80" = "58") {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) return;
  const page = kind === "struk" ? `${paperMm}mm auto` : "A4";
  const strukW = paperMm === "80" ? "72mm" : "52mm";
  doc.open();
  doc.write(`<!doctype html><html><head><title>${esc(title)}</title>
  <style>
    @page { size: ${page}; margin: ${kind === "struk" ? "2mm" : "16mm"}; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #111;
      font-family: Arial, Helvetica, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .struk { width: ${strukW}; margin: 0 auto; font-size: 11px; line-height: 1.35; }
    .head { text-align: center; }
    .logo {
      max-width: 22mm;
      max-height: 16mm;
      display: block;
      margin: 0 auto 4px;
      object-fit: contain;
    }
    .mark { width: 22mm; height: 16mm; display: block; margin: 0 auto 2px; }
    .head h1 {
      font-size: 15px;
      font-weight: 700;
      margin: 2px 0 4px;
      letter-spacing: 0.01em;
    }
    .head .addr, .head .tel { font-size: 10px; line-height: 1.4; }
    .head .tel { margin-top: 2px; }
    .dash { border: none; border-top: 1px dashed #222; margin: 7px 0; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 1px 0; vertical-align: top; }
    .r { text-align: right; white-space: nowrap; }
    .meta td { font-size: 11px; }
    .item-name { font-weight: 700; padding-top: 3px; }
    .item-name:first-child { padding-top: 0; }
    .qty { font-size: 11px; }
    .sum td { padding: 1px 0; }
    .grand td { font-size: 13px; font-weight: 700; padding: 3px 0 4px; }
    .foot { text-align: center; font-size: 10.5px; line-height: 1.4; }
    .nota { width: 100%; font-size: 14px; }
    .nota h1 { font-size: 22px; margin: 0 0 6px; text-align: center; }
    .nota .logo { max-width: 42mm; max-height: 28mm; }
    .muted { color: #333; }
    .sec { font-size: 12px; font-weight: 700; margin: 10px 0 4px; letter-spacing: 0.04em; text-transform: uppercase; }
    .grid { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    .grid th, .grid td { border-bottom: 1px solid #ccc; padding: 4px 6px; font-size: 12px; text-align: left; }
    .grid th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
    .grid .r, .grid th.r { text-align: right; }
    .sale-block { margin: 8px 0 12px; }
    .sale-block .meta { font-size: 12px; margin-bottom: 2px; }
    h2.sec-title { font-size: 16px; margin: 0 0 8px; text-align: center; }

    .invoice {
      width: 100%;
      min-height: 262mm;
      display: flex;
      flex-direction: column;
      color: #122033;
      font-family: "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 12.5px;
      line-height: 1.45;
    }
    .invoice .bar {
      height: 6px;
      background: #0b1f3a;
      margin: -2mm -2mm 14px;
    }
    .inv-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      padding-bottom: 16px;
      border-bottom: 2px solid #0b1f3a;
    }
    .inv-brand {
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 0;
    }
    .invoice .logo {
      max-width: 22mm;
      max-height: 22mm;
      margin: 0;
    }
    .invoice .mark { width: 22mm; height: 18mm; margin: 0; }
    .inv-brand h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #0b1f3a;
      text-align: left;
    }
    .inv-brand p {
      margin: 3px 0 0;
      font-size: 11.5px;
      color: #3d4f66;
      max-width: 280px;
    }
    .inv-doc { text-align: right; flex-shrink: 0; }
    .inv-doc .kicker {
      margin: 0;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: #5a6b80;
    }
    .inv-doc .no {
      margin: 4px 0 0;
      font-size: 16px;
      font-weight: 700;
      color: #0b1f3a;
      letter-spacing: 0.02em;
    }
    .inv-meta {
      display: grid;
      grid-template-columns: 1.2fr 1fr 1fr;
      gap: 12px;
      margin: 16px 0 18px;
      padding: 12px 14px;
      background: #f2f5f9;
    }
    .inv-meta span {
      display: block;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #5a6b80;
      margin-bottom: 3px;
    }
    .inv-meta b { font-size: 13px; color: #0b1f3a; }
    .inv-items { width: 100%; border-collapse: collapse; }
    .inv-items th {
      text-align: left;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #fff;
      background: #0b1f3a;
      padding: 8px 10px;
    }
    .inv-items th.r, .inv-items td.r { text-align: right; }
    .inv-items th.n, .inv-items td.n { width: 36px; text-align: center; }
    .inv-items th.q, .inv-items td.q { width: 52px; }
    .inv-items th.p, .inv-items td.p,
    .inv-items th.s, .inv-items td.s { width: 110px; }
    .inv-items td {
      padding: 8px 10px;
      border-bottom: 1px solid #d7e0ec;
      vertical-align: middle;
      color: #122033;
    }
    .inv-items tbody tr:nth-child(even) td { background: #f7f9fc; }
    .inv-items .name { font-weight: 600; }
    .inv-bottom {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 28px;
      margin-top: 18px;
    }
    .inv-aside {
      flex: 1;
      min-width: 0;
      padding-top: 6px;
      font-size: 12px;
      color: #3d4f66;
    }
    .inv-aside .note {
      margin: 0 0 14px;
      padding: 10px 12px;
      background: #f2f5f9;
      border-left: 3px solid #0b1f3a;
    }
    .inv-sum {
      width: 250px;
      flex-shrink: 0;
      border-collapse: collapse;
    }
    .inv-sum td { padding: 5px 0 5px 12px; font-size: 12.5px; }
    .inv-sum td.r { padding-right: 0; font-variant-numeric: tabular-nums; }
    .inv-sum .lab { color: #3d4f66; }
    .inv-sum .grand td {
      padding-top: 10px;
      padding-bottom: 10px;
      border-top: 2px solid #0b1f3a;
      border-bottom: 2px solid #0b1f3a;
      font-size: 15px;
      font-weight: 700;
      color: #0b1f3a;
    }
    .inv-thanks {
      margin-top: auto;
      padding-top: 28px;
      text-align: center;
      font-size: 12px;
      color: #3d4f66;
      border-top: 1px solid #d7e0ec;
    }
  </style></head><body>${body}</body></html>`);
  doc.close();
  frame.contentWindow?.focus();
  frame.contentWindow?.print();
  window.setTimeout(() => frame.remove(), 800);
}

function itemRows(sale: Sale) {
  return sale.items
    .map(
      (it, i) => `<tr>
        <td colspan="2" class="item-name">${i + 1}. ${esc(it.name)}</td>
      </tr>
      <tr>
        <td class="qty">${formatQty(it.qty)} x ${rp(it.sellPrice)}</td>
        <td class="r">${rp(it.sellPrice * it.qty)}</td>
      </tr>`,
    )
    .join("");
}

function comPortOf(settings: StoreSettings): string {
  const blob = `${settings.printerBtId} ${settings.printerBtName}`;
  const m = blob.match(/COM\d+/i);
  return m ? m[0].toUpperCase() : "";
}

function escPosText(s: string): Uint8Array {
  const enc = new TextEncoder();
  return enc.encode(s.replace(/\r/g, ""));
}

function buildEscPos(sale: Sale, settings: StoreSettings): Uint8Array {
  const { date, time } = whenParts(sale.createdAt);
  const w = settings.paperWidth === "80" ? 48 : 32;
  const line = (left: string, right: string) => {
    const gap = Math.max(1, w - left.length - right.length);
    return left + " ".repeat(gap) + right;
  };
  const dash = "-".repeat(w);
  const parts: string[] = [];
  parts.push("\x1B\x40");
  parts.push("\x1B\x61\x01");
  parts.push(`${settings.storeName}\n`);
  if (settings.address.trim()) parts.push(`${settings.address.trim()}\n`);
  if (settings.phone.trim()) parts.push(`${settings.phone.trim()}\n`);
  parts.push("\x1B\x61\x00");
  parts.push(`${dash}\n`);
  parts.push(`${line(sale.localNo, sale.cashierName)}\n`);
  parts.push(`${line(date, time)}\n`);
  if (sale.customerName) parts.push(`Pelanggan: ${sale.customerName}\n`);
  parts.push(`${dash}\n`);
  for (const it of sale.items) {
    parts.push(`${it.name}\n`);
    parts.push(`${line(`${formatQty(it.qty)} x ${rp(it.sellPrice)}`, rp(it.sellPrice * it.qty))}\n`);
  }
  parts.push(`${dash}\n`);
  parts.push(`${line("Subtotal", rp(sale.subtotal))}\n`);
  if (sale.discount) parts.push(`${line("Diskon", `-${rp(sale.discount)}`)}\n`);
  if (sale.ppn) parts.push(`${line(ppnLabel(sale.ppnRate), rp(sale.ppn))}\n`);
  if (sale.deliveryCost) parts.push(`${line("Ongkir", rp(sale.deliveryCost))}\n`);
  parts.push(`${line("TOTAL", rp(sale.total))}\n`);
  const pays = sale.payments?.length ? sale.payments : [{ method: sale.method, amount: sale.total }];
  for (const p of pays.filter((x) => x.amount > 0)) {
    parts.push(`${line(PAY_METHOD_LABEL[p.method], rp(p.amount))}\n`);
  }
  parts.push(`${line("Kembali", rp(sale.changeAmount))}\n`);
  parts.push(`${dash}\n`);
  parts.push("\x1B\x61\x01");
  if (sale.note.trim()) parts.push(`${sale.note.trim()}\n`);
  parts.push(`${settings.receiptFooter}\n\n\n`);
  parts.push("\x1D\x56\x00");
  const chunks = parts.map(escPosText);
  const len = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function printStrukMaybeRaw(
  sale: Sale,
  settings: StoreSettings,
  html: string,
  paper: "58" | "80",
) {
  const invoke = tauriInvoke();
  if (invoke) {
    try {
      const data = bytesToBase64(buildEscPos(sale, settings));
      const com = settings.printerConnection === "bluetooth" ? comPortOf(settings) : "";
      const printerName = drawerPrinterName(settings) || null;
      await invoke("print_raw", { printerName, data, comPort: com || null });
      return;
    } catch {
      /* dialog cetak sistem */
    }
  }
  printHtml(sale.localNo, html, "struk", paper);
}

export function printStruk(sale: Sale, settings: StoreSettings) {
  const paper = settings.paperWidth === "80" ? "80" : "58";
  const { date, time } = whenParts(sale.createdAt);
  const qty = sale.items.reduce((n, it) => n + it.qty, 0);
  const phone = settings.phone.trim();
  const payRows = (sale.payments?.length ? sale.payments : [{ method: sale.method, amount: sale.total }])
    .filter((p) => p.amount > 0)
    .map((p) => `<tr><td>Bayar (${esc(PAY_METHOD_LABEL[p.method])})</td><td class="r">${rp(p.amount)}</td></tr>`)
    .join("");
  const html = `<div class="struk">
      <div class="head">
        ${logoTag(settings)}
        <h1>${esc(settings.storeName)}</h1>
        <div class="addr">${esc(settings.address)}</div>
        ${phone ? `<div class="tel">${esc(phone)}</div>` : ""}
      </div>
      <hr class="dash" />
      <table class="meta">
        <tr>
          <td>No.${esc(sale.localNo)}</td>
          <td class="r">Kasir : ${esc(sale.cashierName)}</td>
        </tr>
        <tr><td>${date}</td><td></td></tr>
        <tr><td>${time}</td><td></td></tr>
        ${sale.customerName ? `<tr><td colspan="2">Pelanggan : ${esc(sale.customerName)}</td></tr>` : ""}
      </table>
      <hr class="dash" />
      <table>${itemRows(sale)}</table>
      <hr class="dash" />
      <table class="sum">
        <tr>
          <td>Total QTY : ${formatQty(qty)}</td>
          <td></td>
        </tr>
        <tr>
          <td>Sub Total</td>
          <td class="r">${rp(sale.subtotal)}</td>
        </tr>
        ${sale.discount ? `<tr><td>Diskon</td><td class="r">-${rp(sale.discount)}</td></tr>` : ""}
        ${sale.ppn ? `<tr><td>${esc(ppnLabel(sale.ppnRate))}</td><td class="r">${rp(sale.ppn)}</td></tr>` : ""}
        ${sale.deliveryCost ? `<tr><td>Ongkir</td><td class="r">${rp(sale.deliveryCost)}</td></tr>` : ""}
      </table>
      <hr class="dash" />
      <table class="sum">
        <tr class="grand">
          <td>Total</td>
          <td class="r">${rp(sale.total)}</td>
        </tr>
        ${payRows}
        <tr>
          <td>Kembali</td>
          <td class="r">${rp(sale.changeAmount)}</td>
        </tr>
      </table>
      <hr class="dash" />
      ${sale.note ? `<div class="foot" style="text-align:left;margin-bottom:6px">Catatan: ${esc(sale.note)}</div>` : ""}
      <div class="foot">${esc(settings.receiptFooter)}</div>
    </div>`;
  void printStrukMaybeRaw(sale, settings, html, paper);
}

export function printNota(sale: Sale, settings: StoreSettings) {
  const phone = settings.phone.trim();
  const qty = sale.items.reduce((n, it) => n + it.qty, 0);
  const when = new Date(sale.createdAt).toLocaleString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const rows = sale.items
    .map(
      (it, i) => `<tr>
        <td class="n">${i + 1}</td>
        <td class="name">${esc(it.name)}</td>
        <td class="q r">${formatQty(it.qty)}</td>
        <td class="p r">${rp(it.sellPrice)}</td>
        <td class="s r">${rp(it.sellPrice * it.qty)}</td>
      </tr>`,
    )
    .join("");
  printHtml(
    `Nota ${sale.localNo}`,
    `<div class="invoice">
      <div class="bar"></div>
      <header class="inv-head">
        <div class="inv-brand">
          ${logoTag(settings)}
          <div>
            <h1>${esc(settings.storeName)}</h1>
            ${settings.address ? `<p>${esc(settings.address)}</p>` : ""}
            ${phone ? `<p>${esc(phone)}</p>` : ""}
          </div>
        </div>
        <div class="inv-doc">
          <p class="kicker">Nota penjualan</p>
          <p class="no">${esc(sale.localNo)}</p>
        </div>
      </header>
      <div class="inv-meta">
        <div>
          <span>Tanggal</span>
          <b>${esc(when)}</b>
        </div>
        <div>
          <span>Kasir</span>
          <b>${esc(sale.cashierName)}</b>
        </div>
        <div>
          <span>Pembayaran</span>
          <b>${esc(saleMethodLabel(sale))}</b>
        </div>
      </div>
      <table class="inv-items">
        <thead>
          <tr>
            <th class="n">No</th>
            <th>Barang</th>
            <th class="q r">Qty</th>
            <th class="p r">Harga</th>
            <th class="s r">Jumlah</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="inv-bottom">
        <div class="inv-aside">
          ${sale.note ? `<p class="note">Catatan: ${esc(sale.note)}</p>` : ""}
          <p>Total barang: ${qty}</p>
        </div>
        <table class="inv-sum">
          <tr><td class="lab">Subtotal</td><td class="r">${rp(sale.subtotal)}</td></tr>
          ${sale.discount ? `<tr><td class="lab">Diskon</td><td class="r">-${rp(sale.discount)}</td></tr>` : ""}
          ${sale.ppn ? `<tr><td class="lab">${esc(ppnLabel(sale.ppnRate))}</td><td class="r">${rp(sale.ppn)}</td></tr>` : ""}
          ${sale.deliveryCost ? `<tr><td class="lab">Ongkir</td><td class="r">${rp(sale.deliveryCost)}</td></tr>` : ""}
          <tr class="grand"><td>Total</td><td class="r">${rp(sale.total)}</td></tr>
          <tr><td class="lab">Bayar (${esc(PAY_METHOD_LABEL[sale.method])})</td><td class="r">${rp(sale.paid)}</td></tr>
          <tr><td class="lab">Kembali</td><td class="r">${rp(sale.changeAmount)}</td></tr>
        </table>
      </div>
      <p class="inv-thanks">${esc(settings.receiptFooter || "Terima kasih telah berbelanja")}</p>
    </div>`,
    "nota",
  );
}

function kvRow(label: string, value: string) {
  return `<tr><td>${esc(label)}</td><td class="r">${esc(value)}</td></tr>`;
}

function signedRp(n: number) {
  if (n > 0) return `+${rp(n)}`;
  if (n < 0) return `-${rp(Math.abs(n))}`;
  return rp(0);
}

export function printSettlementStruk(data: ShiftSettlement, settings: StoreSettings) {
  const paper = settings.paperWidth === "80" ? "80" : "58";
  const { shift } = data;
  const buka = whenParts(shift.openedAt);
  const tutup = whenParts(shift.closedAt ?? new Date().toISOString());
  const phone = settings.phone.trim();
  const payRows = data.byMethod
    .map((m) => `<tr><td>${esc(m.label)} (${m.count})</td><td class="r">${rp(m.total)}</td></tr>`)
    .join("");
  const productRows = data.products
    .map(
      (p) => `<tr>
        <td colspan="2" class="item-name">${esc(p.name)}</td>
      </tr>
      <tr>
        <td class="qty">${p.qty} brg</td>
        <td class="r">${rp(p.total)}</td>
      </tr>`,
    )
    .join("");
  const expenseRows = data.expenses
    .map((e) => `<tr><td>${esc(EXPENSE_LABEL[e.category])}</td><td class="r">${rp(e.amount)}</td></tr>`)
    .join("");
  printHtml(
    `Settlement ${buka.date}`,
    `<div class="struk">
      <div class="head">
        ${logoTag(settings)}
        <h1>${esc(settings.storeName)}</h1>
        <div class="addr">${esc(settings.address)}</div>
        ${phone ? `<div class="tel">${esc(phone)}</div>` : ""}
      </div>
      <hr class="dash" />
      <div class="head"><b>SETTLEMENT</b></div>
      <table class="meta">
        <tr><td>Kasir</td><td class="r">${esc(shift.cashierName)}</td></tr>
        <tr><td>Buka</td><td class="r">${buka.date} ${buka.time}</td></tr>
        <tr><td>Tutup</td><td class="r">${tutup.date} ${tutup.time}</td></tr>
      </table>
      <hr class="dash" />
      <table class="sum">
        ${kvRow("Nota", String(data.notaCount))}
        ${kvRow("Qty barang", String(data.itemQty))}
        ${kvRow("Omzet", rp(data.omzet))}
        ${data.discount ? kvRow("Diskon", `-${rp(data.discount)}`) : ""}
        ${data.ppn ? kvRow("PPN", rp(data.ppn)) : ""}
        ${data.ongkir ? kvRow("Ongkir", rp(data.ongkir)) : ""}
        ${data.returTotal ? kvRow("Retur", `-${rp(data.returTotal)}`) : ""}
        ${data.voidTotal ? kvRow("Void", `-${rp(data.voidTotal)}`) : ""}
      </table>
      <hr class="dash" />
      <div>PEMBAYARAN</div>
      <table class="sum">${payRows}${kvRow("Total bayar", rp(data.omzet))}</table>
      ${
        data.products.length
          ? `<hr class="dash" /><div>PRODUK</div><table>${productRows}</table>`
          : ""
      }
      ${
        data.expenses.length
          ? `<hr class="dash" /><div>PENGELUARAN</div><table class="sum">${expenseRows}${kvRow("Total keluar", rp(data.pengeluaran))}</table>`
          : ""
      }
      <hr class="dash" />
      <div>LACI</div>
      <table class="sum">
        ${kvRow("Kas awal", rp(shift.kasAwal))}
        ${kvRow("Tunai masuk", rp(data.tunaiMasuk))}
        ${data.returTunai ? kvRow("Retur tunai", `-${rp(data.returTunai)}`) : ""}
        ${data.pengeluaran ? kvRow("Pengeluaran", `-${rp(data.pengeluaran)}`) : ""}
        ${kvRow("Sistem", rp(shift.kasSistem ?? 0))}
        ${kvRow("Hitung", rp(shift.kasHitung ?? 0))}
        <tr class="grand"><td>Selisih</td><td class="r">${signedRp(shift.selisih ?? 0)}</td></tr>
      </table>
      ${shift.note ? `<hr class="dash" /><div class="foot" style="text-align:left">Catatan: ${esc(shift.note)}</div>` : ""}
      <hr class="dash" />
      <div class="foot">${esc(settings.receiptFooter || "Settlement kasir")}</div>
    </div>`,
    "struk",
    paper,
  );
}

export function printSettlementDetail(data: ShiftSettlement, settings: StoreSettings) {
  const { shift } = data;
  const buka = formatDateTime(shift.openedAt);
  const tutup = formatDateTime(shift.closedAt ?? new Date().toISOString());
  const payRows = data.byMethod
    .map(
      (m) => `<tr><td>${esc(m.label)}</td><td class="r">${m.count}</td><td class="r">${rp(m.total)}</td></tr>`,
    )
    .join("");
  const productRows = data.products
    .map(
      (p, i) => `<tr>
        <td>${i + 1}</td>
        <td>${esc(p.name)}<div class="muted">${esc(p.barcode)}</div></td>
        <td class="r">${p.qty}</td>
        <td class="r">${rp(p.total)}</td>
      </tr>`,
    )
    .join("");
  const saleBlocks = data.sales
    .map((s) => {
      const items = s.items
        .map(
          (it) => `<tr>
            <td>${esc(it.name)}</td>
            <td class="r">${it.qty} × ${rp(it.sellPrice)}</td>
            <td class="r">${rp(it.sellPrice * it.qty)}</td>
          </tr>`,
        )
        .join("");
      return `<div class="sale-block">
        <div class="meta"><b>${esc(s.localNo)}</b> · ${esc(formatDateTime(s.createdAt))} · ${esc(s.cashierName)} · ${esc(PAY_METHOD_LABEL[s.method])}</div>
        <table class="grid">
          ${items}
          ${s.discount ? `<tr><td>Diskon</td><td></td><td class="r">-${rp(s.discount)}</td></tr>` : ""}
          ${s.ppn ? `<tr><td>${esc(ppnLabel(s.ppnRate))}</td><td></td><td class="r">${rp(s.ppn)}</td></tr>` : ""}
          ${s.deliveryCost ? `<tr><td>Ongkir</td><td></td><td class="r">${rp(s.deliveryCost)}</td></tr>` : ""}
          <tr><td><b>Total</b></td><td></td><td class="r"><b>${rp(s.total)}</b></td></tr>
        </table>
      </div>`;
    })
    .join("");
  const voidRows = data.voids
    .map(
      (s) => `<tr><td>${esc(s.localNo)}</td><td>${esc(formatDateTime(s.createdAt))}</td><td>${esc(PAY_METHOD_LABEL[s.method])}</td><td class="r">${rp(s.total)}</td></tr>`,
    )
    .join("");
  const returRows = data.returns
    .map(
      (r) => `<tr>
        <td>${esc(r.localNo)}</td>
        <td>${esc(formatDateTime(r.createdAt))}</td>
        <td>${esc(r.items.map((it) => `${it.name} ×${it.qty}`).join(", "))}</td>
        <td>${esc(PAY_METHOD_LABEL[r.method])}</td>
        <td class="r">${rp(r.total)}</td>
      </tr>`,
    )
    .join("");
  const expenseRows = data.expenses
    .map(
      (e) => `<tr>
        <td>${esc(formatDateTime(e.createdAt))}</td>
        <td>${esc(EXPENSE_LABEL[e.category])}</td>
        <td>${esc(e.note || "—")}</td>
        <td class="r">${rp(e.amount)}</td>
      </tr>`,
    )
    .join("");

  printHtml(
    `Settlement ${buka}`,
    `<div class="nota">
      <div class="head">
        ${logoTag(settings)}
        <h1>${esc(settings.storeName)}</h1>
        <div class="muted">${esc(settings.address)}${settings.phone ? ` · ${esc(settings.phone)}` : ""}</div>
      </div>
      <h2 class="sec-title">Settlement kasir</h2>
      <table>
        ${kvRow("Kasir", shift.cashierName)}
        ${kvRow("Buka", buka)}
        ${kvRow("Tutup", tutup)}
        ${shift.note ? kvRow("Catatan", shift.note) : ""}
      </table>
      <hr class="dash" />
      <div class="sec">Ringkasan</div>
      <table>
        ${kvRow("Jumlah nota", String(data.notaCount))}
        ${kvRow("Qty barang", String(data.itemQty))}
        ${kvRow("Subtotal", rp(data.subtotal))}
        ${kvRow("Diskon", data.discount ? `-${rp(data.discount)}` : rp(0))}
        ${kvRow("PPN", rp(data.ppn))}
        ${kvRow("Ongkir", rp(data.ongkir))}
        ${kvRow("Omzet", rp(data.omzet))}
        ${kvRow("Retur", data.returTotal ? `-${rp(data.returTotal)}` : rp(0))}
        ${kvRow("Void", data.voidTotal ? `-${rp(data.voidTotal)}` : rp(0))}
      </table>
      <div class="sec">Jenis pembayaran</div>
      <table class="grid">
        <thead><tr><th>Metode</th><th class="r">Nota</th><th class="r">Total</th></tr></thead>
        <tbody>${payRows}<tr><td><b>Total</b></td><td class="r"><b>${data.notaCount}</b></td><td class="r"><b>${rp(data.omzet)}</b></td></tr></tbody>
      </table>
      <div class="sec">Laci</div>
      <table>
        ${kvRow("Kas awal", rp(shift.kasAwal))}
        ${kvRow("Penjualan tunai", rp(data.tunaiMasuk))}
        ${kvRow("Retur tunai", data.returTunai ? `-${rp(data.returTunai)}` : rp(0))}
        ${kvRow("Pengeluaran", data.pengeluaran ? `-${rp(data.pengeluaran)}` : rp(0))}
        ${kvRow("Seharusnya (sistem)", rp(shift.kasSistem ?? 0))}
        ${kvRow("Hitung fisik", rp(shift.kasHitung ?? 0))}
        ${kvRow("Selisih", signedRp(shift.selisih ?? 0))}
      </table>
      <div class="sec">Penjualan produk</div>
      ${
        data.products.length
          ? `<table class="grid">
              <thead><tr><th>No</th><th>Barang</th><th class="r">Qty</th><th class="r">Total</th></tr></thead>
              <tbody>${productRows}</tbody>
            </table>`
          : `<p class="muted">Tidak ada penjualan produk.</p>`
      }
      <div class="sec">Detail nota</div>
      ${data.sales.length ? saleBlocks : `<p class="muted">Tidak ada nota.</p>`}
      ${
        data.voids.length
          ? `<div class="sec">Void</div>
            <table class="grid">
              <thead><tr><th>Nota</th><th>Waktu</th><th>Bayar</th><th class="r">Total</th></tr></thead>
              <tbody>${voidRows}</tbody>
            </table>`
          : ""
      }
      ${
        data.returns.length
          ? `<div class="sec">Retur</div>
            <table class="grid">
              <thead><tr><th>No</th><th>Waktu</th><th>Barang</th><th>Bayar</th><th class="r">Nilai</th></tr></thead>
              <tbody>${returRows}</tbody>
            </table>`
          : ""
      }
      ${
        data.expenses.length
          ? `<div class="sec">Pengeluaran</div>
            <table class="grid">
              <thead><tr><th>Waktu</th><th>Kategori</th><th>Catatan</th><th class="r">Jumlah</th></tr></thead>
              <tbody>${expenseRows}<tr><td colspan="3"><b>Total</b></td><td class="r"><b>${rp(data.pengeluaran)}</b></td></tr></tbody>
            </table>`
          : ""
      }
      <p class="foot">${esc(settings.receiptFooter)}</p>
    </div>`,
    "nota",
  );
}

export function printSettlement(data: ShiftSettlement, settings: StoreSettings) {
  printSettlementStruk(data, settings);
  window.setTimeout(() => printSettlementDetail(data, settings), 700);
}
