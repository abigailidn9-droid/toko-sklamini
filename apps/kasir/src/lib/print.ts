import { EXPENSE_FUND_LABEL, EXPENSE_LABEL, PAY_METHOD_LABEL, formatQty, ppnLabel, rp, saleMethodLabel, type Sale, type StoreSettings } from "@sklamini/shared";
import { getMember, type ShiftSettlement } from "./repo.ts";
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

/** Kembalian hanya untuk tunai. QRIS / transfer / kartu tidak punya kembalian. */
export function saleChange(sale: Sale): number {
  const pays = (sale.payments ?? []).filter((p) => p.amount > 0);
  const method = pays.length === 1 ? pays[0].method : sale.method;
  if (method !== "tunai") return 0;
  if (pays.length && !pays.some((p) => p.method === "tunai")) return 0;
  // Data rusak lama: non-tunai tersimpan paid = total dan kembalian = total.
  if (sale.paid === sale.total && sale.changeAmount === sale.total) return 0;
  return Math.max(0, sale.changeAmount);
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
    @page { size: ${page}; margin: ${kind === "struk" ? "2mm" : "16mm 20mm"}; }
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
    .item-name { font-weight: 700; padding-top: 0; }
    .item-sp td { height: 1.35em; padding: 0; line-height: 1.35em; }
    .qty { font-size: 11px; }
    .sum td { padding: 1px 0; }
    .grand td { font-size: 13px; font-weight: 700; padding: 3px 0 4px; }
    .foot { text-align: center; font-size: 10.5px; line-height: 1.4; }
    .foot-space { height: 2.6em; }
    .nota { box-sizing: border-box; width: 100%; padding: 4mm 12mm 8mm; font-size: 14px; }
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
      box-sizing: border-box;
      width: 100%;
      min-height: 262mm;
      padding: 10mm 18mm 14mm;
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
      margin: 0 0 14px;
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
      (it, i) => `${i ? `<tr class="item-sp"><td colspan="2">&nbsp;</td></tr>` : ""}<tr>
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

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const len = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

function loadLogoImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("logo"));
    img.src = src;
  });
}

async function rasterLogo(dataUrl: string, paperDots: number): Promise<Uint8Array | null> {
  if (!dataUrl) return null;
  try {
    const img = await loadLogoImage(dataUrl);
    const maxW = Math.min(paperDots, paperDots === 576 ? 360 : 240);
    const maxH = 128;
    const scale = Math.min(maxW / Math.max(1, img.width), maxH / Math.max(1, img.height), 1);
    const drawW = Math.max(8, Math.round(img.width * scale));
    const h = Math.max(8, Math.round(img.height * scale));
    const canvasW = paperDots;
    const canvas = document.createElement("canvas");
    canvas.width = canvasW;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvasW, h);
    ctx.drawImage(img, Math.floor((canvasW - drawW) / 2), 0, drawW, h);
    const { data } = ctx.getImageData(0, 0, canvasW, h);
    const widthBytes = canvasW / 8;
    const out = new Uint8Array(8 + widthBytes * h);
    out[0] = 0x1d;
    out[1] = 0x76;
    out[2] = 0x30;
    out[3] = 0x00;
    out[4] = widthBytes & 0xff;
    out[5] = (widthBytes >> 8) & 0xff;
    out[6] = h & 0xff;
    out[7] = (h >> 8) & 0xff;
    let o = 8;
    for (let y = 0; y < h; y++) {
      for (let bx = 0; bx < widthBytes; bx++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const i = (y * canvasW + bx * 8 + bit) * 4;
          const lum = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
          if (data[i + 3] > 80 && lum < 168) byte |= 0x80 >> bit;
        }
        out[o++] = byte;
      }
    }
    return out;
  } catch {
    return null;
  }
}

async function buildEscPos(sale: Sale, settings: StoreSettings): Promise<Uint8Array> {
  const { date, time } = whenParts(sale.createdAt);
  const w = settings.paperWidth === "80" ? 48 : 32;
  const line = (left: string, right: string) => {
    const gap = Math.max(1, w - left.length - right.length);
    return left + " ".repeat(gap) + right;
  };
  const dash = "-".repeat(w);
  const parts: Uint8Array[] = [];
  const push = (s: string) => parts.push(escPosText(s));
  push("\x1B\x40");
  const logo = await rasterLogo(settings.logoDataUrl, settings.paperWidth === "80" ? 576 : 384);
  if (logo) {
    parts.push(logo);
    push("\n");
  }
  push("\x1B\x61\x01");
  push(`${settings.storeName}\n`);
  if (settings.address.trim()) push(`${settings.address.trim()}\n`);
  if (settings.phone.trim()) push(`${settings.phone.trim()}\n`);
  push("\x1B\x61\x00");
  push(`${dash}\n`);
  push(`${line(sale.localNo, sale.cashierName)}\n`);
  push(`${line(date, time)}\n`);
  if (sale.customerId) {
    const member = getMember(sale.customerId);
    if (member) push(`${line("Member", member.name)}\n`);
  }
  push(`${dash}\n`);
  for (let i = 0; i < sale.items.length; i++) {
    const it = sale.items[i];
    if (i) push("\n");
    push(`${it.name}\n`);
    push(`${line(`${formatQty(it.qty)} x ${rp(it.sellPrice)}`, rp(it.sellPrice * it.qty))}\n`);
  }
  push(`${dash}\n`);
  push(`${line("Subtotal", rp(sale.subtotal))}\n`);
  if (sale.discount) push(`${line("Diskon", `-${rp(sale.discount)}`)}\n`);
  if (sale.ppn) push(`${line(ppnLabel(sale.ppnRate), rp(sale.ppn))}\n`);
  if (sale.deliveryCost) push(`${line("Ongkir", rp(sale.deliveryCost))}\n`);
  push(`${line("TOTAL", rp(sale.total))}\n`);
  const pays = sale.payments?.length ? sale.payments : [{ method: sale.method, amount: sale.total }];
  for (const p of pays.filter((x) => x.amount > 0)) {
    push(`${line(PAY_METHOD_LABEL[p.method], rp(p.amount))}\n`);
  }
  const kembali = saleChange(sale);
  if (kembali > 0) push(`${line("Kembali", rp(kembali))}\n`);
  push(`${dash}\n`);
  push("\x1B\x61\x01");
  if (sale.note.trim()) push(`${sale.note.trim()}\n`);
  push(`${settings.receiptFooter}\n\n\n`);
  push("\x1D\x56\x00");
  return concatBytes(parts);
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
): Promise<boolean> {
  const invoke = tauriInvoke();
  if (invoke) {
    const data = bytesToBase64(await buildEscPos(sale, settings));
    const com = settings.printerConnection === "bluetooth" ? comPortOf(settings) : "";
    const named = drawerPrinterName(settings);
    const tries = named ? [named, ""] : [""];
    for (const printerName of tries) {
      try {
        await invoke("print_raw", {
          printerName: printerName || null,
          data,
          comPort: com || null,
        });
        return true;
      } catch {
        /* coba printer default */
      }
    }
    return false;
  }
  printHtml(sale.localNo, html, "struk", paper);
  return true;
}

export function printStruk(sale: Sale, settings: StoreSettings): Promise<boolean> {
  const paper = settings.paperWidth === "80" ? "80" : "58";
  const { date, time } = whenParts(sale.createdAt);
  const qty = sale.items.reduce((n, it) => n + it.qty, 0);
  const phone = settings.phone.trim();
  const payRows = (sale.payments?.length ? sale.payments : [{ method: sale.method, amount: sale.total }])
    .filter((p) => p.amount > 0)
    .map((p) => `<tr><td>Bayar (${esc(PAY_METHOD_LABEL[p.method])})</td><td class="r">${rp(p.amount)}</td></tr>`)
    .join("");
  const kembali = saleChange(sale);
  const kembaliRow = kembali > 0 ? `<tr><td>Kembali</td><td class="r">${rp(kembali)}</td></tr>` : "";
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
        ${sale.customerId && getMember(sale.customerId) ? `<tr><td>Member</td><td class="r">${esc(getMember(sale.customerId)!.name)}</td></tr>` : ""}
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
        ${kembaliRow}
      </table>
      <hr class="dash" />
      ${sale.note ? `<div class="foot" style="text-align:left;margin-bottom:6px">Catatan: ${esc(sale.note)}</div>` : ""}
      <div class="foot">${esc(settings.receiptFooter)}</div>
      <div class="foot-space"></div>
    </div>`;
  return printStrukMaybeRaw(sale, settings, html, paper);
}

function sampleItem(id: string, name: string, qty: number, sellPrice: number): Sale["items"][number] {
  return {
    id,
    saleId: "test-print",
    productId: id,
    barcode: id,
    name,
    qty,
    sellPrice,
    costPrice: 0,
  };
}

export function printTestStruk(settings: StoreSettings): Promise<boolean> {
  const now = new Date().toISOString();
  const items = [
    sampleItem("1", "Hot Wheels Basic", 2, 39000),
    sampleItem("2", "Hot Wheels Premium", 1, 139000),
  ];
  const subtotal = items.reduce((n, it) => n + it.sellPrice * it.qty, 0);
  const sale: Sale = {
    id: "test-print",
    localNo: "TES-0001",
    cashierId: "test",
    cashierName: "Tes",
    customerId: null,
    method: "tunai",
    subtotal,
    discount: 0,
    deliveryCost: 0,
    ppn: 0,
    ppnRate: settings.ppnRate,
    note: "",
    total: subtotal,
    paid: subtotal,
    changeAmount: 0,
    status: "selesai",
    createdAt: now,
    voidedAt: null,
    items,
    payments: [{ id: "p1", saleId: "test-print", method: "tunai", amount: subtotal }],
  };
  return printStruk(sale, settings);
}

export function printNota(sale: Sale, settings: StoreSettings) {
  const phone = settings.phone.trim();
  const qty = sale.items.reduce((n, it) => n + it.qty, 0);
  const kembali = saleChange(sale);
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
          ${kembali > 0 ? `<tr><td class="lab">Kembali</td><td class="r">${rp(kembali)}</td></tr>` : ""}
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
    .filter((e) => e.fund === "laci")
    .map((e) => `<tr><td>${esc(EXPENSE_LABEL[e.category])} · ${esc(EXPENSE_FUND_LABEL[e.fund])}</td><td class="r">${rp(e.amount)}</td></tr>`)
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
        expenseRows
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
      <div class="foot-space"></div>
    </div>`,
    "struk",
    paper,
  );
}

export function printSettlement(data: ShiftSettlement, settings: StoreSettings) {
  printSettlementStruk(data, settings);
}
