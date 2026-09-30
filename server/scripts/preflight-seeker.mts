import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { getBase58Decoder } from "@solana/kit";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { createDb } from "../src/db.js";
import { readConfig } from "../src/config.js";
import {
  createSgtRpc,
  MAINNET_GENESIS_HASH,
  SGT_GROUP_MINT_ADDRESS,
} from "../src/sgt.js";
import {
  deviceOrigin,
  mobileEnv,
  readEnv,
  root,
  siwsMatches,
  unsafeMobileKeys,
} from "./seeker-env.mjs";

console.info("FAIRCLAIM REAL SEEKER PREFLIGHT\n");
let failed = false;
function report(label: string, pass: boolean, detail = "", success = "PASS") {
  failed ||= !pass;
  console.info(
    `${label.padEnd(25)} ${pass ? success : "FAIL"}${detail ? ` — ${detail}` : ""}`,
  );
}
async function check(
  label: string,
  task: () => Promise<boolean>,
  hint: string,
  success = "PASS",
) {
  try {
    const pass = await task();
    report(label, pass, pass ? "" : hint, success);
    return pass;
  } catch {
    report(label, false, hint);
    return false;
  } // Never print connection strings or raw provider errors.
}
const env = { ...readEnv(resolve(root, "server/.env")), ...process.env };
const { effective: mobile, sources } = mobileEnv();
const configResult = (() => {
  try {
    return readConfig(env);
  } catch {
    return null;
  }
})();
report(
  "Server environment",
  !!configResult && env.NODE_ENV === "development",
  "Requires valid server/.env and NODE_ENV=development",
);
report(
  "RPC configuration",
  !!configResult,
  configResult?.rpcHostname ?? "Set a valid server-only mainnet RPC URL",
);
const unsafe = sources.flatMap((source) =>
  unsafeMobileKeys(source.values, env).map((key) => `${source.name}: ${key}`),
);
report(
  "Mobile secrets",
  !unsafe.length,
  unsafe.length
    ? unsafe.join(", ")
    : "No secret-like keys/credential URLs found in mobile env inputs",
);
let origin: string | undefined;
try {
  origin = deviceOrigin(mobile.EXPO_PUBLIC_API_URL);
  report("Mobile API config", true);
} catch {
  report(
    "Mobile API config",
    false,
    "Set an actual HTTPS tunnel or LAN origin; emulator/localhost is not a Seeker route",
  );
}
const fileSiws = siwsMatches(env, mobile);
report(
  "SIWS file config",
  fileSiws,
  fileSiws
    ? ""
    : "Server/mobile domain and URI must exactly match the API origin",
);
const db = configResult ? createDb(configResult.DATABASE_URL) : null;
try {
  const database = await check(
    "Database",
    async () => {
      if (!db) return false;
      await db.$queryRaw`SELECT 1`;
      return true;
    },
    "Check PostgreSQL and server DATABASE_URL",
  );
  const campaign =
    database && db
      ? await db.campaign.findUnique({ where: { slug: "seeker-genesis-access" } })
      : null;
  const open =
    !!campaign &&
    campaign.status === "ACTIVE" &&
    campaign.startsAt.getTime() <= Date.now() &&
    campaign.endsAt.getTime() > Date.now();
  report(
    "Campaign",
    open,
    open
      ? "ACTIVE, within claim window"
      : "seeker-genesis-access must exist, be ACTIVE, and within its claim window",
  );

  // Probe the configured phone URL, never silently substitute localhost.
  let health: Record<string, unknown> | undefined;
  const request = async (
    path: string,
    body?: object,
  ): Promise<Record<string, unknown>> => {
    if (!origin) throw new Error("No device origin");
    const response = await fetch(`${origin}${path}`, {
      signal: AbortSignal.timeout(12_000),
      redirect: "error",
      ...(body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
    });
    if (!response.ok) throw new Error("HTTP failure");
    return (await response.json()) as Record<string, unknown>;
  };
  const reachable = await check(
    "Server reachable",
    async () => {
      health = await request("/health");
      return health.status === "ok" && health.chainId === "solana:mainnet";
    },
    "Configured phone API URL /health must respond; start API/tunnel",
  );
  report(
    "SGT bypass",
    env.DEV_SGT_BYPASS === "false" &&
      reachable &&
      health?.devSgtBypass === false,
    reachable
      ? "Both local config and live /health checked"
      : "Cannot confirm live bypass state",
    "OFF",
  );
  const verifyOnlyMode = env.SGT_VERIFY_ONLY_MODE === "true";
  const claimTestMode = env.CLAIM_TEST_MODE === "true";
  const liveModeMatches =
    reachable &&
    health?.sgtVerifyOnlyMode === verifyOnlyMode &&
    health?.claimTestMode === claimTestMode;
  report(
    "Safe test mode",
    verifyOnlyMode !== claimTestMode && liveModeMatches,
    reachable
      ? verifyOnlyMode === claimTestMode
        ? "Enable exactly one development test mode"
        : "Local mode flags must match live /health"
      : "Cannot confirm live mode state",
    verifyOnlyMode ? "VERIFY ONLY" : "DB CLAIM TEST",
  );
  await check(
    "Live SIWS / database",
    async () => {
      if (!reachable || !fileSiws || !campaign || !db) return false;
      const served = await request("/api/campaigns/seeker-genesis-access");
      if (
        served.id !== campaign.id ||
        served.status !== "ACTIVE" ||
        served.startsAt !== campaign.startsAt.toISOString() ||
        served.endsAt !== campaign.endsAt.toISOString()
      )
        return false;
      const probeAddress = getBase58Decoder().decode(randomBytes(32));
      // No signature, verification or claim is submitted. One unused nonce expires in 5 minutes.
      const payload = await request("/api/auth/nonce", {
        address: probeAddress,
        purpose: "verify",
        campaignId: campaign.id,
        authPath: "native-siws",
      });
      if (
        payload.domain !== env.SIWS_DOMAIN ||
        payload.uri !== env.SIWS_URI ||
        payload.chainId !== "solana:mainnet" ||
        payload.address !== probeAddress ||
        payload.requestId !== payload.nonce ||
        payload.authPath !== "native-siws" ||
        !Array.isArray(payload.canonicalMessage) ||
        typeof payload.nonce !== "string"
      )
        return false;
      const record = await db.siwsNonce.findUnique({
        where: { nonce: payload.nonce },
      });
      return (
        !!record &&
        record.usedAt === null &&
        record.campaignId === campaign.id &&
        record.expiresAt.getTime() > Date.now() &&
        JSON.stringify(record.payload) !== "null" &&
        (record.payload as Record<string, unknown>).address === probeAddress
      );
    },
    "Restart server after env changes; challenge must match mobile identity and configured DB",
  );

  const rpc = configResult
    ? createSgtRpc(configResult.SOLANA_MAINNET_RPC_URL)
    : null;
  const mainnet = await check(
    "Solana network",
    async () => !!rpc && (await rpc.genesisHash()) === MAINNET_GENESIS_HASH,
    "RPC must return the full official mainnet genesis hash",
    "MAINNET",
  );
  await check(
    "Official SGT group",
    async () => {
      if (!rpc || !mainnet) return false;
      const result = await rpc.accounts([SGT_GROUP_MINT_ADDRESS], 0n);
      const group = result.accounts[0];
      return (
        !!group &&
        group.owner === TOKEN_2022_PROGRAM_ADDRESS &&
        group.data.length > 0
      );
    },
    "Official group must be readable on mainnet and owned by Token-2022",
  );
} catch {
  report(
    "Preflight execution",
    false,
    "A database/configuration operation failed; no secrets printed",
  );
} finally {
  await db?.$disconnect();
}
console.info(
  "\nThis does not test the phone, Seed Vault, SIWS signatures, wallet SGT ownership, claims or Builder.",
);
console.info(
  failed ? "NOT READY — fix every FAIL and rerun." : "READY FOR DEVICE TEST ✓",
);
process.exitCode = failed ? 1 : 0;
