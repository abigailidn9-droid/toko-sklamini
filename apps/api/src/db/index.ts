import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

const url = process.env.DATABASE_URL ?? "postgres://sklamini:sklamini@127.0.0.1:5432/sklamini";

export const client = postgres(url, {
  max: 5,
  connect_timeout: 8,
  idle_timeout: 20,
  max_lifetime: 60 * 30,
});
export const db = drizzle(client, { schema });
