import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { D1Like, D1Statement } from "../src/api";

/** Cloudflare D1's API over node:sqlite, so the real SQL runs in the tests. */
export function d1(): D1Like {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(resolve(import.meta.dirname, "../migrations/0001_init.sql"), "utf8"));
  type SqlValue = null | number | bigint | string;
  const statement = (sql: string, values: SqlValue[] = []): D1Statement => ({
    bind: (...v) => statement(sql, v as SqlValue[]),
    first: async <T>() => (db.prepare(sql).get(...values) as T | undefined) ?? null,
    all: async <T>() => ({ results: db.prepare(sql).all(...values) as T[] }),
    run: async () => db.prepare(sql).run(...values),
  });
  return {
    prepare: (sql) => statement(sql),
    batch: async (list) => {
      db.exec("BEGIN");
      try { const out = []; for (const s of list) out.push(await s.run()); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; }
    },
  };
}

