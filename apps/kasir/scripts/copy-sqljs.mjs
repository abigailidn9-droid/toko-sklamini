import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const sqlJs = require.resolve("sql.js");
const dist = dirname(sqlJs);
const dest = resolve(root, "public");
mkdirSync(dest, { recursive: true });
copyFileSync(resolve(dist, "sql-wasm.js"), resolve(dest, "sql-wasm.js"));
copyFileSync(resolve(dist, "sql-wasm.wasm"), resolve(dest, "sql-wasm.wasm"));
console.log("sql.js disalin ke public/");
