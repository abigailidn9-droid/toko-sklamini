import { sql } from "drizzle-orm";
import { db } from "./index.ts";

export async function pushSchema() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id text PRIMARY KEY,
      name text NOT NULL,
      role text NOT NULL,
      pin_hash text NOT NULL,
      active boolean NOT NULL DEFAULT true,
      updated_at timestamptz NOT NULL
    );
    CREATE TABLE IF NOT EXISTS employees (
      id text PRIMARY KEY,
      name text NOT NULL,
      job_role text NOT NULL,
      pin_hash text NOT NULL,
      active boolean NOT NULL DEFAULT true,
      updated_at timestamptz NOT NULL
    );
    CREATE TABLE IF NOT EXISTS products (
      id text PRIMARY KEY,
      barcode text NOT NULL UNIQUE,
      name text NOT NULL,
      unit text NOT NULL,
      category text NOT NULL,
      buy_price integer NOT NULL,
      sell_price integer NOT NULL,
      active boolean NOT NULL DEFAULT true,
      updated_at timestamptz NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stock_events (
      id text PRIMARY KEY,
      product_id text NOT NULL,
      type text NOT NULL,
      qty integer NOT NULL,
      ref_id text,
      device_id text NOT NULL,
      created_at timestamptz NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sales (
      id text PRIMARY KEY,
      local_no text NOT NULL,
      cashier_id text NOT NULL,
      cashier_name text NOT NULL,
      method text NOT NULL,
      subtotal integer NOT NULL,
      discount integer NOT NULL,
      delivery_cost integer NOT NULL DEFAULT 0,
      ppn integer NOT NULL DEFAULT 0,
      ppn_rate integer NOT NULL DEFAULT 0,
      note text NOT NULL DEFAULT '',
      total integer NOT NULL,
      paid integer NOT NULL,
      change_amount integer NOT NULL,
      status text NOT NULL,
      created_at timestamptz NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sale_items (
      id text PRIMARY KEY,
      sale_id text NOT NULL,
      product_id text NOT NULL,
      barcode text NOT NULL,
      name text NOT NULL,
      qty integer NOT NULL,
      sell_price integer NOT NULL,
      cost_price integer NOT NULL
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id text PRIMARY KEY,
      category text NOT NULL,
      amount integer NOT NULL,
      note text NOT NULL,
      created_at timestamptz NOT NULL,
      cashier_name text NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stock_ins (
      id text PRIMARY KEY,
      local_no text NOT NULL,
      cashier_id text NOT NULL,
      cashier_name text NOT NULL,
      created_at timestamptz NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stock_in_items (
      id text PRIMARY KEY,
      stock_in_id text NOT NULL,
      product_id text NOT NULL,
      barcode text NOT NULL,
      name text NOT NULL,
      qty integer NOT NULL,
      buy_price integer NOT NULL
    );
    CREATE TABLE IF NOT EXISTS attendances (
      id text PRIMARY KEY,
      employee_id text NOT NULL,
      type text NOT NULL,
      created_at timestamptz NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key text PRIMARY KEY,
      value text NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sale_payments (
      id text PRIMARY KEY,
      sale_id text NOT NULL,
      method text NOT NULL,
      amount integer NOT NULL
    );
    CREATE TABLE IF NOT EXISTS customers (
      id text PRIMARY KEY,
      name text NOT NULL,
      phone text NOT NULL DEFAULT '',
      note text NOT NULL DEFAULT '',
      active boolean NOT NULL DEFAULT true,
      updated_at timestamptz NOT NULL
    );
    CREATE TABLE IF NOT EXISTS customer_payments (
      id text PRIMARY KEY,
      customer_id text NOT NULL,
      amount integer NOT NULL,
      method text NOT NULL,
      note text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL,
      cashier_id text NOT NULL,
      cashier_name text NOT NULL
    );
    CREATE TABLE IF NOT EXISTS member_rewards (
      id text PRIMARY KEY,
      customer_id text NOT NULL,
      visits integer NOT NULL,
      created_at timestamptz NOT NULL,
      cashier_id text NOT NULL,
      cashier_name text NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cash_shifts (
      id text PRIMARY KEY,
      cashier_id text NOT NULL,
      cashier_name text NOT NULL,
      opened_at timestamptz NOT NULL,
      closed_at timestamptz,
      kas_awal integer NOT NULL,
      kas_hitung integer,
      kas_sistem integer,
      selisih integer,
      note text NOT NULL DEFAULT '',
      status text NOT NULL
    );
    CREATE TABLE IF NOT EXISTS returns (
      id text PRIMARY KEY,
      local_no text NOT NULL,
      sale_id text NOT NULL,
      cashier_id text NOT NULL,
      cashier_name text NOT NULL,
      method text NOT NULL,
      total integer NOT NULL,
      note text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL
    );
    CREATE TABLE IF NOT EXISTS return_items (
      id text PRIMARY KEY,
      return_id text NOT NULL,
      sale_item_id text NOT NULL,
      product_id text NOT NULL,
      barcode text NOT NULL,
      name text NOT NULL,
      qty double precision NOT NULL,
      sell_price integer NOT NULL,
      cost_price integer NOT NULL
    );
    CREATE TABLE IF NOT EXISTS opnames (
      id text PRIMARY KEY,
      local_no text NOT NULL,
      cashier_id text NOT NULL,
      cashier_name text NOT NULL,
      note text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL
    );
    CREATE TABLE IF NOT EXISTS opname_items (
      id text PRIMARY KEY,
      opname_id text NOT NULL,
      product_id text NOT NULL,
      barcode text NOT NULL,
      name text NOT NULL,
      unit text NOT NULL,
      sistem double precision NOT NULL,
      fisik double precision NOT NULL,
      selisih double precision NOT NULL
    );
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_cost integer NOT NULL DEFAULT 0;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS note text NOT NULL DEFAULT '';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_id text;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS voided_at timestamptz;
    ALTER TABLE stock_events ALTER COLUMN qty TYPE double precision;
    ALTER TABLE sale_items ALTER COLUMN qty TYPE double precision;
    ALTER TABLE stock_in_items ALTER COLUMN qty TYPE double precision;
  `);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  pushSchema()
    .then(() => {
      console.log("Schema siap.");
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
