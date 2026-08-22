import { hashPin, newId } from "@sklamini/shared";
import { db } from "./index.ts";
import { employees, products, settings, stockEvents, users } from "./schema.ts";
import { pushSchema } from "./push.ts";

const SEED_PRODUCTS = [
  { barcode: "899999900001", name: "Beras Ramos 5kg", unit: "sak", category: "Sembako", buy: 68000, sell: 75000, stock: 18 },
  { barcode: "8998866200112", name: "Minyak Kita 2L", unit: "btl", category: "Sembako", buy: 28000, sell: 32500, stock: 22 },
  { barcode: "899999900088", name: "Gula Pasir 1kg", unit: "kg", category: "Sembako", buy: 14000, sell: 16500, stock: 35 },
  { barcode: "899999900102", name: "Tepung Segitiga 1kg", unit: "kg", category: "Sembako", buy: 11000, sell: 13500, stock: 20 },
  { barcode: "899999900115", name: "Garam Kapal 500g", unit: "pcs", category: "Sembako", buy: 2500, sell: 4000, stock: 40 },
  { barcode: "8998866100470", name: "Aqua 600ml", unit: "btl", category: "Minuman", buy: 2500, sell: 4000, stock: 120 },
  { barcode: "8991008123456", name: "Teh Botol Sosro", unit: "btl", category: "Minuman", buy: 3500, sell: 5000, stock: 40 },
  { barcode: "899999902001", name: "Coca-Cola 390ml", unit: "btl", category: "Minuman", buy: 4500, sell: 6500, stock: 36 },
  { barcode: "899999902014", name: "Kopi Kapal Api", unit: "pcs", category: "Minuman", buy: 1500, sell: 2000, stock: 80 },
  { barcode: "8991002101234", name: "Indomie Goreng", unit: "pcs", category: "Makanan", buy: 2800, sell: 3500, stock: 48 },
  { barcode: "899999903001", name: "Chitato Sapi Panggang", unit: "pcs", category: "Makanan", buy: 8500, sell: 11000, stock: 24 },
  { barcode: "899999903018", name: "Roti Tawar Sari Roti", unit: "pcs", category: "Makanan", buy: 12000, sell: 15000, stock: 12 },
  { barcode: "899999903025", name: "Telur ayam 1kg", unit: "kg", category: "Makanan", buy: 26000, sell: 30000, stock: 15 },
  { barcode: "899999904001", name: "Rinso 800g", unit: "pcs", category: "Rumah tangga", buy: 18000, sell: 22000, stock: 16 },
  { barcode: "899999904018", name: "Lifebuoy 85g", unit: "pcs", category: "Rumah tangga", buy: 3500, sell: 5000, stock: 30 },
  { barcode: "899999904025", name: "Pepsodent 75g", unit: "pcs", category: "Rumah tangga", buy: 7000, sell: 9500, stock: 22 },
];

async function seed() {
  await pushSchema();
  const now = new Date();
  const ownerHash = await hashPin("123456");
  const kasirHash = await hashPin("111111");

  await db
    .insert(users)
    .values([
      { id: "user-owner", name: "Budi", role: "owner", pinHash: ownerHash, active: true, updatedAt: now },
      { id: "user-kasir", name: "Siti", role: "kasir", pinHash: kasirHash, active: true, updatedAt: now },
    ])
    .onConflictDoNothing();

  await db
    .insert(employees)
    .values([
      { id: "emp-siti", name: "Siti", jobRole: "Kasir", pinHash: await hashPin("111111"), active: true, updatedAt: now },
      { id: "emp-andi", name: "Andi", jobRole: "Gudang", pinHash: await hashPin("222222"), active: true, updatedAt: now },
      { id: "emp-budi", name: "Budi", jobRole: "Owner", pinHash: await hashPin("123456"), active: true, updatedAt: now },
    ])
    .onConflictDoNothing();

  for (const p of SEED_PRODUCTS) {
    const id = `prd-${p.barcode}`;
    await db
      .insert(products)
      .values({
        id,
        barcode: p.barcode,
        name: p.name,
        unit: p.unit,
        category: p.category,
        buyPrice: p.buy,
        sellPrice: p.sell,
        active: true,
        updatedAt: now,
      })
      .onConflictDoNothing();
    await db
      .insert(stockEvents)
      .values({
        id: `seed-stok-${p.barcode}`,
        productId: id,
        type: "adjust",
        qty: p.stock,
        refId: "seed",
        deviceId: "server",
        createdAt: now,
      })
      .onConflictDoNothing();
  }

  await db
    .insert(settings)
    .values({ key: "store", value: JSON.stringify({ storeName: "TOKO SKLAMINI" }) })
    .onConflictDoNothing();

  console.log("Seed selesai. Owner PIN 123456 · Kasir PIN 111111");
  void newId;
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
