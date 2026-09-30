import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const rootEnv = resolve(root, ".env");
if (!existsSync(rootEnv))
  writeFileSync(
    rootEnv,
    `POSTGRES_PASSWORD=${randomBytes(24).toString("hex")}\n`,
  );
const password = readFileSync(rootEnv, "utf8")
  .match(/^POSTGRES_PASSWORD=(.+)$/m)?.[1]
  ?.trim();
if (!password)
  throw new Error(
    "Existing .env has no POSTGRES_PASSWORD. It was not overwritten.",
  );
const serverEnv = resolve(root, "server/.env");
if (!existsSync(serverEnv)) {
  writeFileSync(
    serverEnv,
    readFileSync(resolve(root, "server/.env.example"), "utf8").replace(
      "REPLACE_WITH_RANDOM_LOCAL_PASSWORD",
      encodeURIComponent(password),
    ),
  );
}
const mobileEnv = resolve(root, "mobile/.env");
if (!existsSync(mobileEnv))
  writeFileSync(mobileEnv, readFileSync(resolve(root, "mobile/.env.example")));
console.info(
  "Local environment files ready. Existing files preserved. No credentials printed.",
);
console.info(
  "Next: docker compose up -d; or npm --prefix server run db:local if Docker is unavailable.",
);
