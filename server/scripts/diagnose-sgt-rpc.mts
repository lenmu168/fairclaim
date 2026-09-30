import "dotenv/config";
import { randomBytes } from "node:crypto";
import { getBase58Decoder, isAddress } from "@solana/kit";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { readConfig } from "../src/config.js";
import {
  createSgtRpc,
  createSgtVerifier,
  MAINNET_GENESIS_HASH,
  safeSgtRpcDiagnostic,
  SGT_GROUP_MINT_ADDRESS,
  type SgtStepEvent,
  type SgtVerifierOptions,
} from "../src/sgt.js";

const config = readConfig(process.env);
const requestedWallet = process.argv[2];
const walletAddress =
  requestedWallet ?? getBase58Decoder().decode(randomBytes(32));
if (!isAddress(walletAddress))
  throw new Error(
    "The optional wallet argument must be a valid public Solana address.",
  );

const providerHostname = new URL(config.SOLANA_MAINNET_RPC_URL).hostname;
const shortenedWallet = `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
let stepNumber = 0;
let failure:
  Parameters<NonNullable<SgtVerifierOptions["onDiagnostic"]>>[0] | undefined;

console.info("FAIRCLAIM READ-ONLY SGT RPC DIAGNOSTIC");
console.info(`Provider: ${providerHostname}`);
console.info(`Wallet: ${shortenedWallet}`);
console.info("No signature or transaction is requested or sent.\n");

const rpc = createSgtRpc(config.SOLANA_MAINNET_RPC_URL);
let prerequisiteStep: Parameters<typeof safeSgtRpcDiagnostic>[1] =
  "sgt-rpc:mainnet-check";
let prerequisiteOperation: Parameters<typeof safeSgtRpcDiagnostic>[2] =
  "getGenesisHash";
try {
  const hash = await rpc.genesisHash();
  if (hash !== MAINNET_GENESIS_HASH)
    throw new Error("Configured RPC is not Solana mainnet.");
  stepNumber += 1;
  console.info(
    `STEP ${stepNumber} sgt-rpc:mainnet-check (getGenesisHash) PASS`,
  );
  prerequisiteStep = "sgt-rpc:get-group";
  prerequisiteOperation = "getMultipleAccounts";
  const group = await rpc.accounts([SGT_GROUP_MINT_ADDRESS], 0n);
  if (group.accounts[0]?.owner !== TOKEN_2022_PROGRAM_ADDRESS)
    throw new Error("Official SGT group is unavailable or invalid.");
  stepNumber += 1;
  console.info(
    `STEP ${stepNumber} sgt-rpc:get-group (getMultipleAccounts) PASS`,
  );
} catch (cause) {
  failure = safeSgtRpcDiagnostic(
    cause,
    prerequisiteStep,
    prerequisiteOperation,
    walletAddress,
    providerHostname,
  );
}

const verifier = createSgtVerifier(rpc, {
  development: false,
  providerHostname,
  onStep(event: SgtStepEvent) {
    stepNumber += 1;
    console.info(
      `STEP ${stepNumber} ${event.step} (${event.operation}) ${event.status}`,
    );
  },
  onDiagnostic(diagnostic) {
    failure = diagnostic;
  },
});

try {
  if (failure) throw new Error("RPC prerequisite failed.");
  const result = await verifier(walletAddress);
  console.info(
    result.hasSGT
      ? "\nRESULT PASS — official SGT currently held."
      : "\nRESULT PASS — no official SGT currently held (NO_SGT).",
  );
} catch (error) {
  if (!failure) throw error;
  console.error(
    `\nSTEP ${stepNumber + 1} ${failure.step} (${failure.operation}) FAIL`,
  );
  console.error(`error.name: ${failure.error.name ?? "unknown"}`);
  console.error(`error.code: ${String(failure.error.code ?? "unknown")}`);
  console.error(`error.message: ${failure.error.message ?? "unknown"}`);
  console.error(`error.constructor: ${failure.error.constructor ?? "unknown"}`);
  console.error(`cause.name: ${failure.cause.name ?? "unknown"}`);
  console.error(`cause.code: ${String(failure.cause.code ?? "unknown")}`);
  console.error(`cause.message: ${failure.cause.message ?? "unknown"}`);
  console.error(`cause.constructor: ${failure.cause.constructor ?? "unknown"}`);
  console.error(`RPC operation: ${failure.operation}`);
  console.error(`verification step: ${failure.step}`);
  console.error(`program id: ${failure.programId}`);
  console.error(
    `HTTP/RPC status: ${String(failure.httpRpcStatus ?? "unknown")}`,
  );
  if (failure.operation === "getTokenAccountsByOwner") {
    try {
      const control = await fetch(config.SOLANA_MAINNET_RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "fairclaim-read-only-diagnostic",
          method: "getTokenAccountsByOwner",
          params: [
            walletAddress,
            { programId: failure.programId },
            { encoding: "base64", commitment: "confirmed" },
          ],
        }),
        signal: AbortSignal.timeout(12_000),
      });
      console.error(
        `raw JSON-RPC control: HTTP ${control.status} ${control.statusText || ""}`.trim(),
      );
    } catch (controlError) {
      console.error(
        `raw JSON-RPC control: ${controlError instanceof Error ? controlError.name : "UnknownError"}`,
      );
    }
  }
  process.exitCode = 1;
}
