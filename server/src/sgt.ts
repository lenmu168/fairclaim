import { createHash } from "node:crypto";
import {
  address,
  createSolanaRpc,
  getBase64Encoder,
  unwrapOption,
  type Address,
} from "@solana/kit";
import {
  AccountState,
  getMintDecoder,
  getTokenDecoder,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import { ApiError } from "./errors.js";

// Source: official seeker-genesis-token/references/sgt-verification.md, retrieved 2026-09-04.
export const SGT_MINT_AUTHORITY =
  "GT2zuHVaZQYZSyQMgJPLzvkmyztfyXg2NJunqFp4p3A4";
export const SGT_METADATA_ADDRESS =
  "GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te";
export const SGT_GROUP_MINT_ADDRESS = SGT_METADATA_ADDRESS;
// Full getGenesisHash value, verified against the public mainnet RPC. The shorter
// CAIP-2 chain reference is NOT the RPC genesis hash.
export const MAINNET_GENESIS_HASH =
  "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
export type SgtResult = { hasSGT: boolean; mintAddress: string | null };
export type SgtVerifier = (walletAddress: string) => Promise<SgtResult>;
export type ChainAccount = { address: string; owner: string; data: Uint8Array };
export type SgtVerificationStep =
  | "sgt-rpc:mainnet-check"
  | "sgt-rpc:get-group"
  | "sgt-rpc:get-token-accounts"
  | "sgt-parse:token-accounts"
  | "sgt-rpc:get-mints"
  | "sgt-parse:token2022-extensions"
  | "sgt-rpc:refresh-ownership"
  | "sgt-parse:ownership-check";
export type SgtRpcOperation =
  | "getGenesisHash"
  | "getTokenAccountsByOwner"
  | "getMultipleAccounts"
  | "decodeTokenAccounts"
  | "decodeMintExtensions"
  | "verifyCurrentOwnership";
export type SgtStepEvent = {
  step: SgtVerificationStep;
  operation: SgtRpcOperation;
  status: "PASS";
};
export type SgtVerifierOptions = {
  development?: boolean;
  providerHostname?: string;
  onStep?: (event: SgtStepEvent) => void;
  onDiagnostic?: (diagnostic: ReturnType<typeof safeSgtDiagnostic>) => void;
};
export interface SgtRpc {
  genesisHash(): Promise<string>;
  tokenAccounts(
    owner: string,
  ): Promise<{ slot: bigint; accounts: ChainAccount[] }>;
  accounts(
    addresses: string[],
    minContextSlot: bigint,
  ): Promise<{ slot: bigint; accounts: (ChainAccount | null)[] }>;
}

class SgtStepError extends Error {
  readonly step: SgtVerificationStep;
  readonly operation: SgtRpcOperation;

  constructor(
    step: SgtVerificationStep,
    operation: SgtRpcOperation,
    cause: unknown,
  ) {
    super("SGT verification step failed.", { cause });
    this.name = "SgtStepError";
    this.step = step;
    this.operation = operation;
  }
}

function shortWallet(wallet: string) {
  return wallet.length > 8
    ? `${wallet.slice(0, 4)}...${wallet.slice(-4)}`
    : "unknown";
}

function safeMessage(value: unknown) {
  if (typeof value !== "string") return null;
  return value
    .replace(/https?:\/\/[^\s"']+/gi, (raw) => {
      try {
        const url = new URL(raw);
        return `${url.protocol}//${url.hostname}/[REDACTED]`;
      } catch {
        return "[REDACTED URL]";
      }
    })
    .replace(
      /(api[_-]?key|token|secret|signature|nonce)=([^\s&]+)/gi,
      "$1=[REDACTED]",
    )
    .slice(0, 500);
}

function errorField(error: unknown, field: string): unknown {
  return error && typeof error === "object" && field in error
    ? (error as Record<string, unknown>)[field]
    : undefined;
}

function errorIdentity(error: unknown) {
  const context = errorField(error, "context");
  return {
    name: error instanceof Error ? error.name : null,
    code:
      errorField(error, "code") ??
      errorField(context, "code") ??
      errorField(context, "__code") ??
      null,
    message: safeMessage(error instanceof Error ? error.message : null),
    constructor: error?.constructor?.name ?? null,
  };
}

function rpcStatus(error: unknown): unknown {
  const direct = errorField(error, "status") ?? errorField(error, "statusCode");
  if (typeof direct === "number" || typeof direct === "string") return direct;
  const response = errorField(error, "response");
  const context = errorField(error, "context");
  const nested =
    errorField(response, "status") ??
    errorField(response, "statusCode") ??
    errorField(context, "status") ??
    errorField(context, "statusCode");
  if (typeof nested === "number" || typeof nested === "string") return nested;
  const message = error instanceof Error ? error.message : "";
  const match = /HTTP error \((\d{3})\)/i.exec(message);
  return match?.[1] ? Number(match[1]) : null;
}

export function safeSgtDiagnostic(
  error: unknown,
  wallet: string,
  providerHostname = "unknown",
) {
  const failure = error instanceof SgtStepError ? error : null;
  const cause = failure?.cause;
  return {
    error: errorIdentity(error),
    cause: errorIdentity(cause),
    step: failure?.step ?? "sgt-rpc:unknown",
    operation: failure?.operation ?? "unknown",
    programId: TOKEN_2022_PROGRAM_ADDRESS,
    wallet: shortWallet(wallet),
    provider: providerHostname,
    httpRpcStatus: rpcStatus(cause ?? error),
  };
}

export function safeSgtRpcDiagnostic(
  cause: unknown,
  step: SgtVerificationStep,
  operation: SgtRpcOperation,
  wallet: string,
  providerHostname = "unknown",
) {
  return safeSgtDiagnostic(
    new SgtStepError(step, operation, cause),
    wallet,
    providerHostname,
  );
}

async function atStep<T>(
  step: SgtVerificationStep,
  operation: SgtRpcOperation,
  task: () => Promise<T> | T,
  onStep?: SgtVerifierOptions["onStep"],
) {
  try {
    const result = await task();
    onStep?.({ step, operation, status: "PASS" });
    return result;
  } catch (cause) {
    throw new SgtStepError(step, operation, cause);
  }
}

export function createSgtRpc(url: string): SgtRpc {
  const rpc = createSolanaRpc(url);
  const options = () => ({ abortSignal: AbortSignal.timeout(12_000) });
  return {
    genesisHash: () => rpc.getGenesisHash().send(options()),
    async tokenAccounts(owner) {
      const result = await rpc
        .getTokenAccountsByOwner(
          address(owner),
          { programId: TOKEN_2022_PROGRAM_ADDRESS },
          { encoding: "base64", commitment: "confirmed" },
        )
        .send(options());
      return {
        slot: result.context.slot,
        accounts: result.value.map((entry) => ({
          address: entry.pubkey,
          owner: entry.account.owner,
          data: new Uint8Array(
            getBase64Encoder().encode(entry.account.data[0]),
          ),
        })),
      };
    },
    async accounts(keys, minContextSlot) {
      const result = await rpc
        .getMultipleAccounts(
          keys.map((key) => address(key)),
          { encoding: "base64", commitment: "confirmed", minContextSlot },
        )
        .send(options());
      return {
        slot: result.context.slot,
        accounts: result.value.map((entry, i) =>
          entry
            ? {
                address: keys[i]!,
                owner: entry.owner,
                data: new Uint8Array(getBase64Encoder().encode(entry.data[0])),
              }
            : null,
        ),
      };
    },
  };
}

function heldMint(account: ChainAccount | null, owner: string): Address | null {
  if (!account || account.owner !== TOKEN_2022_PROGRAM_ADDRESS) return null;
  try {
    const token = getTokenDecoder().decode(account.data);
    // Frozen is a valid SGT holding state. Zero-balance residue after transfer/revocation is not.
    return token.owner === owner &&
      token.amount > 0n &&
      (token.state === AccountState.Initialized ||
        token.state === AccountState.Frozen)
      ? token.mint
      : null;
  } catch {
    return null;
  }
}
export function isSgtMint(account: ChainAccount | null): boolean {
  if (!account || account.owner !== TOKEN_2022_PROGRAM_ADDRESS) return false;
  try {
    const mint = getMintDecoder().decode(account.data);
    const extensions = unwrapOption(mint.extensions) ?? [];
    const metadata = extensions.find(
      (entry) => entry.__kind === "MetadataPointer",
    );
    const group = extensions.find(
      (entry) => entry.__kind === "TokenGroupMember",
    );
    // All official properties must match together. Name, symbol, image and frozen state
    // are not proof of authenticity. Kit decoders replace only the legacy decoding API.
    return (
      mint.isInitialized &&
      unwrapOption(mint.mintAuthority) === SGT_MINT_AUTHORITY &&
      metadata !== undefined &&
      unwrapOption(metadata.authority) === SGT_MINT_AUTHORITY &&
      unwrapOption(metadata.metadataAddress) === SGT_METADATA_ADDRESS &&
      group !== undefined &&
      group.group === SGT_GROUP_MINT_ADDRESS &&
      group.mint === account.address
    );
  } catch {
    return false;
  }
}

export function createSgtVerifier(
  rpc: SgtRpc,
  options: SgtVerifierOptions = {},
): SgtVerifier {
  return async (walletAddress) => {
    try {
      if (
        (await atStep(
          "sgt-rpc:mainnet-check",
          "getGenesisHash",
          () => rpc.genesisHash(),
          options.onStep,
        )) !== MAINNET_GENESIS_HASH
      )
        throw new ApiError(
          503,
          "WRONG_NETWORK",
          "SGT verification requires a Solana mainnet server connection.",
        );
      const holdings = await atStep(
        "sgt-rpc:get-token-accounts",
        "getTokenAccountsByOwner",
        () => rpc.tokenAccounts(walletAddress),
        options.onStep,
      );
      if (holdings.accounts.length > 10_000)
        throw new Error(
          "Token account response exceeds supported limit. Use a paginated provider adapter.",
        );
      const candidates = new Map<string, string[]>();
      for (const account of holdings.accounts) {
        const mint = heldMint(account, walletAddress);
        if (mint)
          candidates.set(mint, [
            ...(candidates.get(mint) ?? []),
            account.address,
          ]);
      }
      options.onStep?.({
        step: "sgt-parse:token-accounts",
        operation: "decodeTokenAccounts",
        status: "PASS",
      });
      // Stable selection when a wallet holds multiple devices. The API never lets the client
      // select an arbitrary mint. V1 uses the first valid, currently held SGT in sorted order.
      const keys = [...candidates.keys()].sort();
      for (let i = 0; i < keys.length; i += 100) {
        const batch = keys.slice(i, i + 100);
        const snapshot = await atStep(
          "sgt-rpc:get-mints",
          "getMultipleAccounts",
          () => rpc.accounts(batch, holdings.slot),
          options.onStep,
        );
        if (snapshot.accounts.length !== batch.length)
          throw new Error("Incomplete mint response");
        for (const mint of snapshot.accounts) {
          if (!isSgtMint(mint) || !mint) continue;
          options.onStep?.({
            step: "sgt-parse:token2022-extensions",
            operation: "decodeMintExtensions",
            status: "PASS",
          });
          const tokenKeys = candidates.get(mint.address)!;
          for (let t = 0; t < tokenKeys.length; t += 100) {
            const subset = tokenKeys.slice(t, t + 100);
            const refreshed = await atStep(
              "sgt-rpc:refresh-ownership",
              "getMultipleAccounts",
              () => rpc.accounts(subset, snapshot.slot),
              options.onStep,
            );
            if (refreshed.accounts.length !== subset.length)
              throw new Error("Incomplete ownership response");
            const stillHeld = refreshed.accounts.some(
              (entry) => heldMint(entry, walletAddress) === mint.address,
            );
            options.onStep?.({
              step: "sgt-parse:ownership-check",
              operation: "verifyCurrentOwnership",
              status: "PASS",
            });
            if (stillHeld) return { hasSGT: true, mintAddress: mint.address };
          }
        }
      }
      return { hasSGT: false, mintAddress: null };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      // Do not log the RPC URL (which may contain a secret). Provider failures must not become NO_SGT.
      const diagnostic = safeSgtDiagnostic(
        error,
        walletAddress,
        options.providerHostname,
      );
      options.onDiagnostic?.(diagnostic);
      if (options.development)
        console.error("[SGT RPC]", JSON.stringify(diagnostic));
      throw new ApiError(
        503,
        "RPC_ERROR",
        "Seeker verification is temporarily unavailable. Please try again.",
      );
    }
  };
}
export function createDevVerifier(
  nodeEnv: string,
  enabled: boolean,
): SgtVerifier {
  if (nodeEnv === "production" || !enabled)
    throw new Error("DEV SGT BYPASS is not permitted.");
  console.warn("DEV SGT BYPASS ACTIVE — not real Seeker verification");
  return async (wallet) => ({
    hasSGT: true,
    mintAddress: `DEV_ONLY_${createHash("sha256").update(wallet).digest("hex")}`,
  });
}
