import { useEffect, useMemo, useRef, useState } from "react";
import {
  PRODUCT_CATEGORIES,
  formatQty,
  formatRupiahInput,
  parseQty,
  parseRupiah,
  rp,
  todayIso,
} from "@sklamini/shared";
import { Button, Field, H2, Select, Text } from "../ui/primitives.tsx";
import { PageShell } from "../components/PageHeader.tsx";
import { downloadProductsExcel, parseProductFile } from "../lib/importProducts.ts";
import { deactivateProduct, listProducts, upsertProduct } from "../lib/repo.ts";
import { useToast } from "../ui/toast.tsx";
import { useScanFocus } from "../lib/useScanFocus.ts";

const emptyForm = {
  id: "",
  barcode: "",
  name: "",
  unit: "pcs",
  category: "Hot Wheels",
  buyPrice: "",
  sellPrice: "",
  openingStock: "",
};

export function ProdukPage({ tick, onChange }: { tick: number; onChange: () => void }) {
  const products = useMemo(() => listProducts(), [tick]);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [newCategory, setNewCategory] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("Semua");
  const [importOpen, setImportOpen] = useState(false);
  const importRef = useRef<HTMLDivElement>(null);
  const { ref: scanRef } = useScanFocus(!open);

  useEffect(() => {
    if (!importOpen) return;
    function close(e: MouseEvent) {
      if (!importRef.current?.contains(e.target as Node)) setImportOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [importOpen]);

  const usedCats = useMemo(() => {
    return [...new Set(products.map((p) => p.category).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "id"),
    );
  }, [products]);

  const knownCats = useMemo(
    () => [...new Set([...PRODUCT_CATEGORIES, ...usedCats])],
    [usedCats],
  );

  const categories = useMemo(() => ["Semua", ...usedCats], [usedCats]);

  useEffect(() => {
    if (cat !== "Semua" && !usedCats.includes(cat)) setCat("Semua");
  }, [cat, usedCats]);

  const shown = products.filter((p) => {
    if (cat !== "Semua" && p.category !== cat) return false;
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (
      p.name.toLowerCase().includes(s) ||
      p.barcode.includes(s) ||
      p.category.toLowerCase().includes(s)
    );
  });

  async function exportExcel() {
    if (!shown.length) {
      toast.show("Tidak ada produk", "info", "Tidak ada baris yang bisa diunduh.");
      return;
    }
    try {
      await downloadProductsExcel(shown, `Daftar-Produk-${todayIso()}.xlsx`);
      toast.show(`${shown.length} produk diunduh`, "ok", "File Excel sudah tersimpan.");
    } catch {
      toast.show("Gagal mengunduh", "error", "Tidak bisa membuat file Excel.");
    }
  }

  async function importFile(file: File) {
    try {
      const rows = await parseProductFile(file);
      if (!rows.length) {
        toast.show("Tidak ada produk", "info", "File tidak berisi baris yang bisa dibaca.");
        return;
      }
      for (const r of rows) upsertProduct({ ...r, upsertByBarcode: true, openingQty: r.openingQty });
      toast.show(`${rows.length} produk diimpor`, "ok", "Katalog sudah diperbarui.");
      onChange();
    } catch {
      toast.show("Gagal membaca file", "error", "Gunakan CSV, Excel, atau PDF yang berisi daftar produk.");
    }
  }

  function save() {
    const category = form.category.trim();
    if (!form.barcode || !form.name) return;
    if (!category) return;
    const res = upsertProduct({
      id: form.id || undefined,
      barcode: form.barcode,
      name: form.name,
      unit: form.unit || "pcs",
      category,
      buyPrice: parseRupiah(form.buyPrice),
      sellPrice: parseRupiah(form.sellPrice),
      openingQty: editing ? 0 : parseQty(form.openingStock),
    });
    if (!res.ok) {
      toast.show("Tidak tersimpan", "error", res.error);
      return;
    }
    setOpen(false);
    setForm(emptyForm);
    setNewCategory(false);
    setEditing(false);
    onChange();
    toast.show(editing ? "Produk diperbarui" : "Produk ditambahkan", "ok");
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const res = deactivateProduct(deleteTarget.id);
    if (!res.ok) {
      toast.show("Tidak terhapus", "error", res.error);
      setDeleteTarget(null);
      return;
    }
    toast.show("Produk dihapus", "ok", deleteTarget.name);
    setDeleteTarget(null);
    setOpen(false);
    setForm(emptyForm);
    setNewCategory(false);
    setEditing(false);
    onChange();
  }

  return (
    <PageShell
      page="produk"
      title="Master produk"
      hint="Katalog barang, harga, dan stok."
      actions={
        <>
        <Button onClick={() => void exportExcel()}>Excel</Button>
        <div className="import-wrap" ref={importRef}>
          <Button onClick={() => setImportOpen((v) => !v)}>Import</Button>
          {importOpen ? (
            <div className="import-pop">
              <ImportOption
                label="CSV"
                accept=".csv,text/csv"
                onPick={(f) => {
                  setImportOpen(false);
                  void importFile(f);
                }}
              />
              <ImportOption
                label="Excel"
                accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onPick={(f) => {
                  setImportOpen(false);
                  void importFile(f);
                }}
              />
              <ImportOption
                label="PDF"
                accept=".pdf,application/pdf"
                onPick={(f) => {
                  setImportOpen(false);
                  void importFile(f);
                }}
              />
            </div>
          ) : null}
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setForm(emptyForm);
            setEditing(false);
            setNewCategory(false);
            setOpen(true);
          }}
        >
          Tambah
        </Button>
        </>
      }
    >
      <Field
        ref={scanRef}
        placeholder="Cari nama, barcode, atau kategori…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="row wrap">
        {categories.map((c) => (
          <button
            key={c}
            className={`tab ${cat === c ? "on" : ""}`}
            type="button"
            onClick={() => setCat(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <Text small tone="tertiary">
        Excel berisi baris yang tampil. Import: barcode, nama, satuan, kategori, harga beli, harga jual, stok
      </Text>
      <table className="data">
        <thead>
          <tr>
            <th>Barcode</th>
            <th>Nama</th>
            <th>Kategori</th>
            <th className="r">Beli</th>
            <th className="r">Jual</th>
            <th className="r">Stok</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((p) => (
            <tr
              key={p.id}
              className="clickable striped"
              onClick={() => {
                setForm({
                  id: p.id,
                  barcode: p.barcode,
                  name: p.name,
                  unit: p.unit,
                  category: p.category,
                  buyPrice: formatRupiahInput(String(p.buyPrice)),
                  sellPrice: formatRupiahInput(String(p.sellPrice)),
                  openingStock: "",
                });
                setEditing(true);
                setNewCategory(false);
                setOpen(true);
              }}
            >
              <td>{p.barcode}</td>
              <td>
                <b>{p.name}</b>
              </td>
              <td>
                <button
                  type="button"
                  className="cat-chip"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCat(p.category);
                  }}
                >
                  {p.category}
                </button>
              </td>
              <td className="r tabular">{rp(p.buyPrice)}</td>
              <td className="r tabular">{rp(p.sellPrice)}</td>
              <td className="r tabular">
                {formatQty(p.stock)} {p.unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {open ? (
        <div className="overlay" style={{ position: "fixed", inset: 0 }}>
          <div className="modal modal-product">
            <div className="stack">
              <div className="row">
                <H2>{editing ? "Ubah produk" : "Tambah produk"}</H2>
                <span className="grow" />
                <Button variant="ghost" onClick={() => { setOpen(false); setNewCategory(false); }}>
                  Tutup
                </Button>
              </div>
              <div className="grid grid-2">
                <label className="field-label">
                  <span>Barcode</span>
                  <Field
                    value={form.barcode}
                    onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  />
                </label>
                <label className="field-label">
                  <span>Nama produk</span>
                  <Field
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </label>
              </div>
              <div className="grid grid-2">
                <label className="field-label">
                  <span>Satuan</span>
                  <Field
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  />
                </label>
                <label className="field-label">
                  <span>Kategori</span>
                  {newCategory ? (
                    <div className="cat-new">
                      <Field
                        autoFocus
                        placeholder="Nama kategori baru"
                        value={form.category}
                        onChange={(e) => setForm({ ...form, category: e.target.value })}
                      />
                      <Button
                        type="button"
                        onClick={() => {
                          setNewCategory(false);
                          setForm({ ...form, category: knownCats[0] ?? "Hot Wheels" });
                        }}
                      >
                        Daftar
                      </Button>
                    </div>
                  ) : (
                    <div className="cat-new">
                      <Select
                        value={form.category}
                        onChange={(e) => setForm({ ...form, category: e.target.value })}
                      >
                        {knownCats.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                        {!knownCats.includes(form.category) && form.category ? (
                          <option value={form.category}>{form.category}</option>
                        ) : null}
                      </Select>
                      <Button
                        type="button"
                        onClick={() => {
                          setNewCategory(true);
                          setForm({ ...form, category: "" });
                        }}
                      >
                        Baru
                      </Button>
                    </div>
                  )}
                </label>
              </div>
              <div className="grid grid-2">
                <label className="field-label">
                  <span>Harga beli</span>
                  <div className="money-field">
                    <span>Rp</span>
                    <input
                      className="field"
                      inputMode="numeric"
                      value={form.buyPrice}
                      onChange={(e) =>
                        setForm({ ...form, buyPrice: formatRupiahInput(e.target.value) })
                      }
                    />
                  </div>
                </label>
                <label className="field-label">
                  <span>Harga jual</span>
                  <div className="money-field">
                    <span>Rp</span>
                    <input
                      className="field"
                      inputMode="numeric"
                      value={form.sellPrice}
                      onChange={(e) =>
                        setForm({ ...form, sellPrice: formatRupiahInput(e.target.value) })
                      }
                    />
                  </div>
                </label>
              </div>
              {!editing ? (
                <label className="field-label">
                  <span>Stok awal</span>
                  <Field
                    inputMode="decimal"
                    placeholder="0"
                    value={form.openingStock}
                    onChange={(e) => setForm({ ...form, openingStock: e.target.value })}
                  />
                </label>
              ) : null}
              <div className="row">
                {editing ? (
                  <Button
                    variant="danger"
                    onClick={() => setDeleteTarget({ id: form.id, name: form.name.trim() || "Produk" })}
                  >
                    Hapus
                  </Button>
                ) : null}
                <span className="grow" />
                <Button variant="primary" disabled={!form.barcode || !form.name || !form.category.trim()} onClick={save}>
                  Simpan
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {deleteTarget ? (
        <div className="overlay overlay-pin" style={{ position: "fixed", inset: 0, zIndex: 40 }}>
          <div className="modal" style={{ width: 420 }}>
            <div className="stack">
              <H2>Hapus produk?</H2>
              <Text tone="secondary">
                {deleteTarget.name} akan hilang dari kasir dan katalog. Nota lama tetap ada.
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

function ImportOption({
  label,
  accept,
  onPick,
}: {
  label: string;
  accept: string;
  onPick: (file: File) => void;
}) {
  return (
    <label className="import-opt">
      {label}
      <input
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onPick(file);
        }}
      />
    </label>
  );
}
