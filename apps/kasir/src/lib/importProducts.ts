import { parseRupiah, PRODUCT_CATEGORIES } from "@sklamini/shared";

export type ProductImport = {
  barcode: string;
  name: string;
  unit: string;
  category: string;
  buyPrice: number;
  sellPrice: number;
};

const HEADER_MAP: Record<string, keyof ProductImport | "skip"> = {
  barcode: "barcode",
  kode: "barcode",
  sku: "barcode",
  nama: "name",
  name: "name",
  produk: "name",
  satuan: "unit",
  unit: "unit",
  kategori: "category",
  category: "category",
  harga_beli: "buyPrice",
  hargabeli: "buyPrice",
  beli: "buyPrice",
  modal: "buyPrice",
  hpp: "buyPrice",
  buy: "buyPrice",
  harga_jual: "sellPrice",
  hargajual: "sellPrice",
  jual: "sellPrice",
  harga: "sellPrice",
  sell: "sellPrice",
  stok: "skip",
  stock: "skip",
};

function cellStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function headerKey(s: string): string {
  return s.toLowerCase().replace(/[\s.]+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function matchCategory(raw: string): string {
  const q = raw.trim().toLowerCase();
  if (!q) return "Sembako";
  const hit = PRODUCT_CATEGORIES.find((c) => c.toLowerCase() === q);
  if (hit) return hit;
  const partial = PRODUCT_CATEGORIES.find((c) => c.toLowerCase().includes(q) || q.includes(c.toLowerCase()));
  return partial ?? raw.trim();
}

function looksLikeHeader(cells: string[]): boolean {
  const joined = cells.map(headerKey).join(" ");
  return joined.includes("barcode") || joined.includes("nama") || joined.includes("name");
}

function mapByHeader(header: string[], row: string[]): ProductImport | null {
  const idx: Partial<Record<keyof ProductImport, number>> = {};
  header.forEach((h, i) => {
    const mapped = HEADER_MAP[headerKey(h)];
    if (mapped && mapped !== "skip" && idx[mapped] == null) idx[mapped] = i;
  });
  const barcode = cellStr(row[idx.barcode ?? 0]);
  const name = cellStr(row[idx.name ?? 1]);
  if (!barcode || !name) return null;
  return {
    barcode,
    name,
    unit: cellStr(row[idx.unit ?? 2]) || "pcs",
    category: matchCategory(cellStr(row[idx.category ?? 3])),
    buyPrice: parseRupiah(cellStr(row[idx.buyPrice ?? 4])),
    sellPrice: parseRupiah(cellStr(row[idx.sellPrice ?? 5])),
  };
}

function mapPositional(cells: string[]): ProductImport | null {
  const cleaned = cells.map((c) => c.replace(/\s/g, "")).map((c, i) => ({ c: cells[i], compact: c }));
  let barcodeIdx = cleaned.findIndex((x) => /^\d{8,14}$/.test(x.compact));
  if (barcodeIdx < 0) barcodeIdx = 0;
  const rest = cells.filter((_, i) => i !== barcodeIdx);
  const barcode = (cells[barcodeIdx] ?? "").replace(/\s/g, "");
  const name = rest[0] ?? "";
  if (!barcode || !name) return null;
  if (!/^\d{6,20}$/.test(barcode)) return null;
  return {
    barcode,
    name,
    unit: rest[1] || "pcs",
    category: matchCategory(rest[2] ?? ""),
    buyPrice: parseRupiah(rest[3] ?? ""),
    sellPrice: parseRupiah(rest[4] ?? ""),
  };
}

export function rowsToProducts(table: unknown[][]): ProductImport[] {
  const rows = table
    .map((r) => r.map(cellStr))
    .filter((r) => r.some((c) => c.length > 0));
  if (!rows.length) return [];
  const start = looksLikeHeader(rows[0]) ? 1 : 0;
  const header = start === 1 ? rows[0] : [];
  const out: ProductImport[] = [];
  for (const row of rows.slice(start)) {
    const item = header.length ? mapByHeader(header, row) : mapPositional(row);
    if (item) out.push(item);
  }
  return out;
}

export function parseCsvProducts(text: string): ProductImport[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  return rowsToProducts(lines.map(splitCsvLine));
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && (c === "," || c === ";" || c === "\t")) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

export async function parseExcelProducts(file: File): Promise<ProductImport[]> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const name = wb.SheetNames[0];
  if (!name) return [];
  const sheet = wb.Sheets[name];
  const table = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as unknown[][];
  return rowsToProducts(table);
}

export async function parsePdfProducts(file: File): Promise<ProductImport[]> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  const table: string[][] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const buckets = new Map<number, { x: number; t: string }[]>();
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const x = item.transform[4];
      const y = Math.round(item.transform[5] / 4) * 4;
      const list = buckets.get(y) ?? [];
      list.push({ x, t: item.str.trim() });
      buckets.set(y, list);
    }
    const ys = [...buckets.keys()].sort((a, b) => b - a);
    for (const y of ys) {
      const cells = buckets
        .get(y)!
        .sort((a, b) => a.x - b.x)
        .map((c) => c.t);
      table.push(expandPdfCells(cells));
    }
  }
  return rowsToProducts(table);
}

function expandPdfCells(cells: string[]): string[] {
  if (cells.length >= 4) return cells;
  const joined = cells.join("  ");
  const parts = joined.split(/\s{2,}|\t/).map((s) => s.trim()).filter(Boolean);
  return parts.length > cells.length ? parts : cells;
}

export async function parseProductFile(file: File): Promise<ProductImport[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls") || file.type.includes("spreadsheet") || file.type.includes("excel")) {
    return parseExcelProducts(file);
  }
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    return parsePdfProducts(file);
  }
  return parseCsvProducts(await file.text());
}
