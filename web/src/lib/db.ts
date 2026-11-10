import "server-only";
import postgres from "postgres";

const url = process.env.DATABASE_URL;

export const sql = url ? postgres(url, { prepare: false, max: 3 }) : null;

export function requireDb() {
  if (sql === null) throw new Error("DATABASE_URL is not set");
  return sql;
}
