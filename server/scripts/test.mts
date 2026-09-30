import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { runNode } from "./process.mjs";

// Never use DATABASE_URL: tests are destructive and must target a dedicated database.
// By default a real, isolated PostgreSQL server is created in the ignored .local directory.
let cluster: EmbeddedPostgres | undefined;
let databaseUrl = process.env.TEST_DATABASE_URL;
try {
  if (!databaseUrl) {
    const password = randomBytes(24).toString("hex");
    const databaseDir = resolve("../.local", `test-pg-${Date.now()}`);
    mkdirSync(databaseDir, { recursive: true });
    const port = Number(process.env.TEST_PG_PORT ?? 55439);
    cluster = new EmbeddedPostgres({
      databaseDir,
      user: "fairclaim",
      password,
      port,
      persistent: true,
      authMethod: "scram-sha-256",
      initdbFlags: ["--encoding=UTF8", "--locale=C"],
      postgresFlags: ["-h", "127.0.0.1"],
      onLog: () => {},
      onError: () => {},
    });
    await cluster.initialise();
    await cluster.start();
    await cluster.createDatabase("fairclaim_test");
    databaseUrl = `postgresql://fairclaim:${password}@127.0.0.1:${port}/fairclaim_test`;
    console.info("Isolated real PostgreSQL started (loopback only).");
  }
  if (!new URL(databaseUrl).pathname.endsWith("_test"))
    throw new Error("TEST_DATABASE_URL database name must end in _test.");
  const env = {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: databaseUrl,
    TEST_DATABASE_URL: databaseUrl,
  };
  await runNode("node_modules/prisma/build/index.js", ["generate"], env);
  await runNode(
    "node_modules/prisma/build/index.js",
    ["migrate", "deploy"],
    env,
  );
  await runNode("node_modules/vitest/vitest.mjs", ["run"], env);
} finally {
  if (cluster) await cluster.stop();
}
