import { SQL } from "bun";
import path from "path";

const DB_URL =
  process.env.DATABASE_URL ||
  "postgres://postgres:postgres@localhost:5438/mdmbox";

const filePath = path.resolve(import.meta.dir, "init-sql.json");
const file = Bun.file(filePath);
const statements: string[] = await file.json();

const sql = new SQL(DB_URL);

for (const stmt of statements) {
  await sql.unsafe(stmt);
}

await sql.end();

console.log(`Applied ${statements.length} SQL statement(s) to ${DB_URL}`);
