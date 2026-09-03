import { hashPin, newId } from "@sklamini/shared";
import { db } from "./index.ts";
import { employees, settings, users } from "./schema.ts";
import { pushSchema } from "./push.ts";

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
