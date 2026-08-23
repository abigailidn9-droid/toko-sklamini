import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  pinHash: text("pin_hash").notNull(),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const employees = pgTable("employees", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  jobRole: text("job_role").notNull(),
  pinHash: text("pin_hash").notNull(),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const products = pgTable("products", {
  id: text("id").primaryKey(),
  barcode: text("barcode").notNull().unique(),
  name: text("name").notNull(),
  unit: text("unit").notNull(),
  category: text("category").notNull(),
  buyPrice: integer("buy_price").notNull(),
  sellPrice: integer("sell_price").notNull(),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const stockEvents = pgTable("stock_events", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull(),
  type: text("type").notNull(),
  qty: doublePrecision("qty").notNull(),
  refId: text("ref_id"),
  deviceId: text("device_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const sales = pgTable("sales", {
  id: text("id").primaryKey(),
  localNo: text("local_no").notNull(),
  cashierId: text("cashier_id").notNull(),
  cashierName: text("cashier_name").notNull(),
  customerId: text("customer_id"),
  method: text("method").notNull(),
  subtotal: integer("subtotal").notNull(),
  discount: integer("discount").notNull(),
  deliveryCost: integer("delivery_cost").notNull().default(0),
  ppn: integer("ppn").notNull().default(0),
  ppnRate: doublePrecision("ppn_rate").notNull().default(0),
  note: text("note").notNull().default(""),
  total: integer("total").notNull(),
  paid: integer("paid").notNull(),
  changeAmount: integer("change_amount").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
});

export const saleItems = pgTable("sale_items", {
  id: text("id").primaryKey(),
  saleId: text("sale_id").notNull(),
  productId: text("product_id").notNull(),
  barcode: text("barcode").notNull(),
  name: text("name").notNull(),
  qty: doublePrecision("qty").notNull(),
  sellPrice: integer("sell_price").notNull(),
  costPrice: integer("cost_price").notNull(),
});

export const expenses = pgTable("expenses", {
  id: text("id").primaryKey(),
  category: text("category").notNull(),
  amount: integer("amount").notNull(),
  note: text("note").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  cashierName: text("cashier_name").notNull(),
});

export const stockIns = pgTable("stock_ins", {
  id: text("id").primaryKey(),
  localNo: text("local_no").notNull(),
  cashierId: text("cashier_id").notNull(),
  cashierName: text("cashier_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const stockInItems = pgTable("stock_in_items", {
  id: text("id").primaryKey(),
  stockInId: text("stock_in_id").notNull(),
  productId: text("product_id").notNull(),
  barcode: text("barcode").notNull(),
  name: text("name").notNull(),
  qty: doublePrecision("qty").notNull(),
  buyPrice: integer("buy_price").notNull(),
});

export const attendances = pgTable("attendances", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull(),
  type: text("type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const salePayments = pgTable("sale_payments", {
  id: text("id").primaryKey(),
  saleId: text("sale_id").notNull(),
  method: text("method").notNull(),
  amount: integer("amount").notNull(),
});

export const customers = pgTable("customers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().default(""),
  note: text("note").notNull().default(""),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const customerPayments = pgTable("customer_payments", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  amount: integer("amount").notNull(),
  method: text("method").notNull(),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  cashierId: text("cashier_id").notNull(),
  cashierName: text("cashier_name").notNull(),
});

export const memberRewards = pgTable("member_rewards", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  visits: integer("visits").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  cashierId: text("cashier_id").notNull(),
  cashierName: text("cashier_name").notNull(),
});

export const cashShifts = pgTable("cash_shifts", {
  id: text("id").primaryKey(),
  cashierId: text("cashier_id").notNull(),
  cashierName: text("cashier_name").notNull(),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  kasAwal: integer("kas_awal").notNull(),
  kasHitung: integer("kas_hitung"),
  kasSistem: integer("kas_sistem"),
  selisih: integer("selisih"),
  note: text("note").notNull().default(""),
  status: text("status").notNull(),
});

export const returns = pgTable("returns", {
  id: text("id").primaryKey(),
  localNo: text("local_no").notNull(),
  saleId: text("sale_id").notNull(),
  cashierId: text("cashier_id").notNull(),
  cashierName: text("cashier_name").notNull(),
  method: text("method").notNull(),
  total: integer("total").notNull(),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const returnItems = pgTable("return_items", {
  id: text("id").primaryKey(),
  returnId: text("return_id").notNull(),
  saleItemId: text("sale_item_id").notNull(),
  productId: text("product_id").notNull(),
  barcode: text("barcode").notNull(),
  name: text("name").notNull(),
  qty: doublePrecision("qty").notNull(),
  sellPrice: integer("sell_price").notNull(),
  costPrice: integer("cost_price").notNull(),
});

export const opnames = pgTable("opnames", {
  id: text("id").primaryKey(),
  localNo: text("local_no").notNull(),
  cashierId: text("cashier_id").notNull(),
  cashierName: text("cashier_name").notNull(),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const opnameItems = pgTable("opname_items", {
  id: text("id").primaryKey(),
  opnameId: text("opname_id").notNull(),
  productId: text("product_id").notNull(),
  barcode: text("barcode").notNull(),
  name: text("name").notNull(),
  unit: text("unit").notNull(),
  sistem: doublePrecision("sistem").notNull(),
  fisik: doublePrecision("fisik").notNull(),
  selisih: doublePrecision("selisih").notNull(),
});
