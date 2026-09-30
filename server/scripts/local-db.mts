import "dotenv/config";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

if (!process.env.DATABASE_URL)
  throw new Error("Run npm run setup in the repository root first.");
const url = new URL(process.env.DATABASE_URL);
if (url.hostname !== "127.0.0.1")
  throw new Error("db:local is restricted to 127.0.0.1.");
const databaseDir = resolve("../.local/postgres");
mkdirSync(databaseDir, { recursive: true });
const cluster = new EmbeddedPostgres({
  databaseDir,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  port: Number(url.port || 5432),
  persistent: true,
  authMethod: "scram-sha-256",
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  postgresFlags: ["-h", "127.0.0.1"],
});
if (!existsSync(resolve(databaseDir, "PG_VERSION"))) await cluster.initialise();
await cluster.start();
const client = cluster.getPgClient("postgres", "127.0.0.1");
await client.connect();
const name = url.pathname.slice(1);
const exists = await client.query(
  "SELECT 1 FROM pg_database WHERE datname = $1",
  [name],
);
await client.end();
if (!exists.rowCount) await cluster.createDatabase(name);
console.info(
  "Local PostgreSQL ready. Keep this terminal open. Data persists in .local/postgres.",
);
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    void cluster.stop().then(() => process.exit(0));
  });
await new Promise(() => {});
