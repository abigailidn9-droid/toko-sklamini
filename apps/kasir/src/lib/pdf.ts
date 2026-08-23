const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN = 56;

function pdfStr(s: string) {
  let out = "(";
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 63;
    if (ch === "\\" || ch === "(" || ch === ")") out += `\\${ch}`;
    else if (c === 10 || c === 13) out += " ";
    else if (c >= 32 && c <= 126) out += ch;
    else if (c < 256) out += `\\${c.toString(8).padStart(3, "0")}`;
    else out += "?";
  }
  return `${out})`;
}

function fit(s: string, maxChars: number) {
  const t = s.trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, Math.max(1, maxChars - 1))}...`;
}

function rgb(hex: string) {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
}

type Align = "left" | "right" | "center";

export type ReportPdfColumn = { label: string; width: number; align?: Align };
export type ReportPdfRow = { cells: string[]; bold?: boolean; section?: boolean };
export type ReportPdfLine = {
  label: string;
  value?: string;
  kind?: "row" | "section" | "total" | "net";
};

export type ReportPdfInput = {
  storeName: string;
  address: string;
  phone: string;
  title: string;
  periode: string;
  table?: { columns: ReportPdfColumn[]; rows: ReportPdfRow[] };
  lines?: ReportPdfLine[];
  note?: string;
};

function buildPdf(pageStreams: string[]) {
  const encoder = new TextEncoder();
  const parts: { id: number; body: string }[] = [];
  let id = 1;
  const add = (body: string) => {
    const n = id++;
    parts.push({ id: n, body });
    return n;
  };

  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const fontB = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const contentIds = pageStreams.map((s) => {
    const bytes = encoder.encode(s);
    return add(`<< /Length ${bytes.length} >>\nstream\n${s}\nendstream`);
  });
  const n = pageStreams.length;
  const firstPageId = id;
  const pagesId = firstPageId + n;
  const pageIds: number[] = [];
  for (let i = 0; i < n; i++) {
    pageIds.push(
      add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${A4_W} ${A4_H}] /Resources << /Font << /F1 ${font} 0 R /F2 ${fontB} 0 R >> >> /Contents ${contentIds[i]} 0 R >>`,
      ),
    );
  }
  add(`<< /Type /Pages /Kids [${pageIds.map((p) => `${p} 0 R`).join(" ")}] /Count ${n} >>`);
  const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  let offset = 0;
  const chunks: string[] = ["%PDF-1.4\n"];
  offset += chunks[0].length;
  const xref: number[] = [0];
  for (const part of parts) {
    xref[part.id] = offset;
    const block = `${part.id} 0 obj\n${part.body}\nendobj\n`;
    chunks.push(block);
    offset += encoder.encode(block).length;
  }
  const xrefStart = offset;
  let xrefTable = `xref\n0 ${parts.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= parts.length; i++) {
    xrefTable += `${String(xref[i]).padStart(10, "0")} 00000 n \n`;
  }
  chunks.push(xrefTable);
  chunks.push(`trailer << /Size ${parts.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);
  return encoder.encode(chunks.join(""));
}

function text(font: "F1" | "F2", size: number, x: number, y: number, s: string, color = "0 0 0") {
  return `${color} rg BT /${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm ${pdfStr(s)} Tj ET\n`;
}

function rect(x: number, y: number, w: number, h: number, fill: string) {
  return `${fill} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f\n`;
}

function headerBlock(input: ReportPdfInput, page: number, pages: number) {
  const navy = rgb("0b1f3a");
  const muted = rgb("3d4f66");
  let y = A4_H - MARGIN;
  let s = "";
  s += text("F2", 16, MARGIN, y, fit(input.storeName, 62), navy);
  y -= 14;
  if (input.address) {
    s += text("F1", 9, MARGIN, y, fit(input.address, 90), muted);
    y -= 12;
  }
  if (input.phone) {
    s += text("F1", 9, MARGIN, y, `Telp: ${fit(input.phone, 80)}`, muted);
    y -= 12;
  }
  y -= 6;
  s += text("F2", 12, MARGIN, y, input.title, navy);
  y -= 14;
  s += text("F1", 9, MARGIN, y, `Periode: ${input.periode}`, muted);
  s += text("F1", 8, A4_W - MARGIN - 90, y, `Halaman ${page} / ${pages}`, muted);
  y -= 10;
  s += `${rgb("d7e0ec")} RG 0.6 w ${MARGIN} ${y} m ${A4_W - MARGIN} ${y} l S\n`;
  return { stream: s, y: y - 16 };
}

export function buildReportPdf(input: ReportPdfInput): Uint8Array {
  const innerW = A4_W - MARGIN * 2;
  const navy = rgb("0b1f3a");
  const muted = rgb("3d4f66");
  const ice = rgb("e8eef3");
  const white = "1 1 1";

  if (input.table) {
    const cols = input.table.columns;
    const sumW = cols.reduce((n, c) => n + c.width, 0);
    const scale = innerW / sumW;
    const widths = cols.map((c) => c.width * scale);
    const rowH = 16;
    const usable = A4_H - 168 - MARGIN;
    const perPage = Math.max(8, Math.floor(usable / rowH) - 1);
    const tablePages: ReportPdfRow[][] = [];
    for (let i = 0; i < input.table.rows.length; i += perPage) {
      tablePages.push(input.table.rows.slice(i, i + perPage));
    }
    if (!tablePages.length) tablePages.push([]);

    const streams = tablePages.map((pgRows, pageIndex) => {
      const head = headerBlock(input, pageIndex + 1, tablePages.length);
      let body = head.stream;
      let y = head.y;
      let x = MARGIN;
      body += rect(MARGIN, y - 3, innerW, rowH, navy);
      cols.forEach((col, i) => {
        const w = widths[i];
        const label = fit(col.label, Math.max(4, Math.floor(w / 5)));
        let tx = x + 4;
        if (col.align === "right") tx = x + w - 4 - label.length * 4.4;
        else if (col.align === "center") tx = x + w / 2 - (label.length * 4.4) / 2;
        body += text("F2", 8, Math.max(x + 2, tx), y + 2, label, white);
        x += w;
      });
      y -= rowH;
      let zebra = false;
      for (const row of pgRows) {
        if (row.section) {
          body += rect(MARGIN, y - 3, innerW, rowH, ice);
          body += text("F2", 8, MARGIN + 4, y + 2, fit(row.cells[0] ?? "", 80), navy);
          y -= rowH;
          continue;
        }
        if (zebra) body += rect(MARGIN, y - 3, innerW, rowH, rgb("f5f8fb"));
        if (row.bold) body += rect(MARGIN, y - 3, innerW, rowH, ice);
        x = MARGIN;
        cols.forEach((col, i) => {
          const w = widths[i];
          const raw = row.cells[i] ?? "";
          const max = Math.max(3, Math.floor(w / (row.bold ? 5.2 : 4.8)));
          const label = fit(raw, max);
          const font = row.bold ? "F2" : "F1";
          let tx = x + 4;
          if (col.align === "right") tx = x + w - 4 - label.length * 4.6;
          else if (col.align === "center") tx = x + w / 2 - (label.length * 4.6) / 2;
          body += text(font, 8, Math.max(x + 2, tx), y + 2, label, navy);
          x += w;
        });
        y -= rowH;
        zebra = !zebra;
      }
      if (input.note && pageIndex === tablePages.length - 1) {
        y -= 10;
        body += text("F1", 8, MARGIN, y, fit(input.note, 100), muted);
      }
      return body;
    });
    return buildPdf(streams);
  }

  const lineH = 18;
  const usable = A4_H - 148 - MARGIN;
  const chunks: ReportPdfLine[][] = [];
  let bucket: ReportPdfLine[] = [];
  let used = 0;
  for (const line of input.lines ?? []) {
    if (used + lineH > usable && bucket.length) {
      chunks.push(bucket);
      bucket = [];
      used = 0;
    }
    bucket.push(line);
    used += lineH;
  }
  if (bucket.length) chunks.push(bucket);
  if (!chunks.length) chunks.push([]);

  const streams = chunks.map((lines, i) => {
    const head = headerBlock(input, i + 1, chunks.length);
    let body = head.stream;
    let y = head.y;
    for (const line of lines) {
      const kind = line.kind ?? "row";
      if (kind === "section") {
        body += rect(MARGIN, y - 4, innerW, lineH, ice);
        body += text("F2", 9, MARGIN + 6, y + 1, fit(line.label, 70).toUpperCase(), navy);
      } else if (kind === "net") {
        body += rect(MARGIN, y - 4, innerW, lineH, navy);
        body += text("F2", 10, MARGIN + 6, y + 1, fit(line.label, 50), white);
        body += text("F2", 10, A4_W - MARGIN - 8 - (line.value ?? "").length * 5.6, y + 1, line.value ?? "", white);
      } else {
        if (kind === "total") body += rect(MARGIN, y - 4, innerW, lineH, ice);
        body += text(kind === "total" ? "F2" : "F1", 9, MARGIN + 6, y + 1, fit(line.label, 62), navy);
        body += text("F2", 9, A4_W - MARGIN - 8 - (line.value ?? "").length * 5.2, y + 1, line.value ?? "", navy);
      }
      y -= lineH;
    }
    if (input.note && i === chunks.length - 1) {
      y -= 8;
      body += text("F1", 8, MARGIN, y, fit(input.note, 100), muted);
    }
    return body;
  });
  return buildPdf(streams);
}

export function downloadPdf(filename: string, bytes: Uint8Array) {
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([copy], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
