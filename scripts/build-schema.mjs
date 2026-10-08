import { readFileSync, readdirSync, writeFileSync } from "node:fs";
const files = readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql")).sort();
const sql = "-- Fresh ads harness database: run once in your own Supabase SQL Editor.\n-- Existing databases: apply only missing numbered migrations.\n\n" + files.map((name) => `-- ${name}\n${readFileSync(`supabase/migrations/${name}`, "utf8")}`).join("\n\n");
writeFileSync("supabase/setup.sql", sql);
console.log(`Prepared fresh-database setup from ${files.length} migrations.`);
