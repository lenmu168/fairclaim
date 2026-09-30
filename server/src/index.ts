import "dotenv/config";
import { readConfig } from "./config.js";
import { createDb } from "./db.js";
import { createApp } from "./app.js";
import {
  createDevVerifier,
  createSgtRpc,
  createSgtVerifier,
  MAINNET_GENESIS_HASH,
} from "./sgt.js";

const config = readConfig(process.env);
const db = createDb(config.DATABASE_URL);
await db.$connect();
const sgtRpc = createSgtRpc(config.SOLANA_MAINNET_RPC_URL);
try {
  const genesisHash = await sgtRpc.genesisHash();
  if (genesisHash !== MAINNET_GENESIS_HASH)
    throw new Error("Configured RPC is not Solana mainnet.");
  console.info(`Solana mainnet RPC ready: ${config.rpcHostname}.`);
} catch {
  // The URL query may contain a server secret. Log only its hostname.
  console.error(`Solana RPC startup validation failed: ${config.rpcHostname}.`);
  await db.$disconnect();
  throw new Error("Solana mainnet RPC startup validation failed.");
}
const verifySgt = config.bypass
  ? createDevVerifier(config.NODE_ENV, config.bypass)
  : createSgtVerifier(sgtRpc, {
      development: config.NODE_ENV === "development",
      providerHostname: config.rpcHostname,
    });
const app = createApp({ db, config, verifySgt });
const server = app.listen(config.PORT, "0.0.0.0", () =>
  console.info(
    `FairClaim API listening on port ${config.PORT}; SGT bypass ${config.bypass ? "ACTIVE" : "OFF"}; verify-only ${config.verifyOnlyMode ? "ACTIVE" : "OFF"}; database claim test ${config.claimTestMode ? "ACTIVE" : "OFF"}; database claims ${config.databaseClaimsEnabled ? "ACTIVE" : "OFF"}.`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    server.close(() => {
      void db.$disconnect().then(() => process.exit(0));
    });
  });
