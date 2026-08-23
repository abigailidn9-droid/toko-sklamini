export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  pin TEXT NOT NULL DEFAULT '',
  menus TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  job_role TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  barcode TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  category TEXT NOT NULL,
  buy_price INTEGER NOT NULL,
  sell_price INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stock_events (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  type TEXT NOT NULL,
  qty REAL NOT NULL,
  ref_id TEXT,
  device_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  local_no TEXT NOT NULL,
  cashier_id TEXT NOT NULL,
  cashier_name TEXT NOT NULL,
  customer_id TEXT,
  method TEXT NOT NULL,
  subtotal INTEGER NOT NULL,
  discount INTEGER NOT NULL,
  delivery_cost INTEGER NOT NULL DEFAULT 0,
  ppn INTEGER NOT NULL DEFAULT 0,
  ppn_rate REAL NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  total INTEGER NOT NULL,
  paid INTEGER NOT NULL,
  change_amount INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  voided_at TEXT
);
CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  barcode TEXT NOT NULL,
  name TEXT NOT NULL,
  qty REAL NOT NULL,
  sell_price INTEGER NOT NULL,
  cost_price INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sale_payments (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  method TEXT NOT NULL,
  amount INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS customer_payments (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  method TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  cashier_id TEXT NOT NULL,
  cashier_name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  cashier_id TEXT NOT NULL,
  cashier_name TEXT NOT NULL,
  note TEXT NOT NULL,
  items_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  amount INTEGER NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL,
  cashier_name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stock_ins (
  id TEXT PRIMARY KEY,
  local_no TEXT NOT NULL,
  cashier_id TEXT NOT NULL,
  cashier_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stock_in_items (
  id TEXT PRIMARY KEY,
  stock_in_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  barcode TEXT NOT NULL,
  name TEXT NOT NULL,
  qty REAL NOT NULL,
  buy_price INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS attendances (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  type TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cash_shifts (
  id TEXT PRIMARY KEY,
  cashier_id TEXT NOT NULL,
  cashier_name TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  kas_awal INTEGER NOT NULL,
  kas_hitung INTEGER,
  kas_sistem INTEGER,
  selisih INTEGER,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS returns (
  id TEXT PRIMARY KEY,
  local_no TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  cashier_id TEXT NOT NULL,
  cashier_name TEXT NOT NULL,
  method TEXT NOT NULL,
  total INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS return_items (
  id TEXT PRIMARY KEY,
  return_id TEXT NOT NULL,
  sale_item_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  barcode TEXT NOT NULL,
  name TEXT NOT NULL,
  qty REAL NOT NULL,
  sell_price INTEGER NOT NULL,
  cost_price INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS opnames (
  id TEXT PRIMARY KEY,
  local_no TEXT NOT NULL,
  cashier_id TEXT NOT NULL,
  cashier_name TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS opname_items (
  id TEXT PRIMARY KEY,
  opname_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  barcode TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  sistem REAL NOT NULL,
  fisik REAL NOT NULL,
  selisih REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS member_rewards (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  visits INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  cashier_id TEXT NOT NULL,
  cashier_name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_outbox (
  id TEXT PRIMARY KEY,
  entity TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
CREATE TABLE IF NOT EXISTS sync_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stock_events_product ON stock_events(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON sale_payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_member_rewards_customer ON member_rewards(customer_id);
`;
