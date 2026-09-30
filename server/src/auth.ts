import { randomBytes } from "node:crypto";
import { getBase58Encoder, isAddress } from "@solana/kit";
import {
  createSignInMessage,
  verifySignIn,
} from "@solana/wallet-standard-util";
import { z } from "zod";
import type { Db } from "./db.js";
import type { Config } from "./config.js";
import type { Campaign } from "./generated/prisma/client.js";
import { ApiError, invalidSignature } from "./errors.js";
import { GENESIS_ACCESS_SLUG, genesisAccessClaimStatement } from "./genesis-access.js";

export const walletAddressSchema = z
  .string()
  .refine(isAddress, "Invalid Solana address");
const byte = z.number().int().min(0).max(255);
const authPathSchema = z.enum(["native-siws", "sign-messages-fallback"]);
export const proofSchema = z
  .object({
    address: walletAddressSchema,
    nonce: z.string().regex(/^[a-f0-9]{32}$/),
    requestId: z.string().regex(/^[a-f0-9]{32}$/),
    authPath: authPathSchema,
    signature: z.array(byte).length(64),
    signedMessage: z.array(byte).min(1).max(4096),
  })
  .strict();
export const challengeRequestSchema = z
  .object({
    address: walletAddressSchema,
    purpose: z.enum(["verify", "claim"]),
    campaignId: z.string().min(1).max(100),
    authPath: authPathSchema,
  })
  .strict();
const payloadSchema = z
  .object({
    address: walletAddressSchema,
    chainId: z.literal("solana:mainnet"),
    domain: z.string(),
    expirationTime: z.iso.datetime(),
    issuedAt: z.iso.datetime(),
    nonce: z.string(),
    statement: z.string(),
    uri: z.string(),
    version: z.literal("1"),
    requestId: z.string().regex(/^[a-f0-9]{32}$/),
  })
  .strict();
const storedChallengeSchema = payloadSchema.extend({
  canonicalMessage: z.array(byte).min(1).max(4096),
  authPath: authPathSchema,
});
export type Proof = z.infer<typeof proofSchema>;
export type ChallengeRequest = z.infer<typeof challengeRequestSchema>;
export type ChallengeCampaign = Pick<
  Campaign,
  "id" | "slug" | "name" | "rewardName" | "rewardAmount"
>;

function createClaimStatement(address: string, campaign: ChallengeCampaign) {
  if (campaign.slug === GENESIS_ACCESS_SLUG) return genesisAccessClaimStatement(address, campaign);
  return [
    "Authorize a FairClaim DATABASE-ONLY demo claim.",
    `Campaign: ${campaign.name}.`,
    `Campaign ID: ${campaign.id}.`,
    `Reward: ${campaign.rewardAmount} ${campaign.rewardName}.`,
    `Wallet: ${address}.`,
    "This authorizes exactly one FairClaim database claim for this campaign.",
    "It does NOT authorize any blockchain transaction, SOL transfer, token transfer, token approval, delegate, authority change, or payment.",
  ].join(" ");
}

export async function issueChallenge(
  db: Db,
  config: Config,
  input: ChallengeRequest,
  campaign: ChallengeCampaign,
  now = new Date(),
) {
  const nonce = randomBytes(16).toString("hex");
  const expiresAt = new Date(now.getTime() + 300_000);
  const payload = {
    address: input.address,
    chainId: "solana:mainnet" as const,
    domain: config.SIWS_DOMAIN,
    uri: config.SIWS_URI,
    version: "1" as const,
    nonce,
    issuedAt: now.toISOString(),
    expirationTime: expiresAt.toISOString(),
    statement:
      input.purpose === "claim"
        ? createClaimStatement(input.address, campaign)
        : "Sign in to FairClaim to verify Seeker ownership. No transaction or payment is requested.",
    // The cryptographically random nonce is also the unique request/challenge ID.
    requestId: nonce,
  };
  const canonicalMessage = Array.from(createSignInMessage(payload));
  await db.siwsNonce.create({
    data: {
      nonce,
      payload: { ...payload, canonicalMessage, authPath: input.authPath },
      expiresAt,
      purpose: input.purpose,
      campaignId: input.campaignId,
    },
  });
  return {
    ...payload,
    canonicalMessage,
    authPath: input.authPath,
    ...(input.purpose === "claim"
      ? {
          claimContext:
            campaign.slug === GENESIS_ACCESS_SLUG
              ? {
                  kind: "genesis-access" as const,
                  campaignId: campaign.id,
                  campaignName: campaign.name,
                }
              : {
                  campaignId: campaign.id,
                  campaignName: campaign.name,
                  rewardName: campaign.rewardName,
                  rewardAmount: campaign.rewardAmount,
                },
        }
      : {}),
  };
}

function bytesEqual(left: number[], right: number[]) {
  if (left.length !== right.length) return false;
  let different = 0;
  for (let index = 0; index < left.length; index++)
    different |= left[index]! ^ right[index]!;
  return different === 0;
}

export async function verifyProof(
  db: Db,
  config: Config,
  raw: unknown,
  purpose: "verify" | "claim",
  campaignId: string,
) {
  const parsed = proofSchema.safeParse(raw);
  if (!parsed.success) throw invalidSignature();
  const proof = parsed.data;
  const record = await db.siwsNonce.findUnique({
    where: { nonce: proof.requestId },
  });
  if (!record)
    throw new ApiError(
      401,
      "NONCE_INVALID",
      "Please request a new wallet signature.",
    );
  if (record.usedAt)
    throw new ApiError(
      401,
      "NONCE_USED",
      "This signature has already been used. Please sign again.",
    );
  if (record.expiresAt.getTime() <= Date.now())
    throw new ApiError(
      401,
      "NONCE_EXPIRED",
      "The signature request expired. Please sign again.",
    );
  const stored = storedChallengeSchema.parse(record.payload);
  const { canonicalMessage, authPath, ...payload } = stored;
  if (
    proof.nonce !== proof.requestId ||
    record.purpose !== purpose ||
    record.campaignId !== campaignId ||
    payload.address !== proof.address ||
    payload.domain !== config.SIWS_DOMAIN ||
    payload.uri !== config.SIWS_URI ||
    payload.requestId !== proof.requestId ||
    authPath !== proof.authPath ||
    (authPath === "sign-messages-fallback" &&
      !bytesEqual(canonicalMessage, proof.signedMessage))
  )
    throw invalidSignature();
  // Never use output.account/publicKey from a client. The verifying key MUST be derived
  // from the same signed address that will be queried for SGT ownership.
  const publicKey = new Uint8Array(getBase58Encoder().encode(payload.address));
  let valid = false;
  try {
    valid = verifySignIn(payload, {
      account: {
        address: payload.address,
        publicKey,
        chains: [],
        features: [],
      },
      signature: new Uint8Array(proof.signature),
      signedMessage: new Uint8Array(proof.signedMessage),
    });
  } catch {
    throw invalidSignature();
  }
  if (!valid) throw invalidSignature();
  // A compare-and-set in PostgreSQL closes the replay race. Signature verification alone
  // is insufficient: exactly one concurrent caller may consume this nonce.
  const consumed = await db.siwsNonce.updateMany({
    where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (consumed.count !== 1) {
    if (record.expiresAt.getTime() <= Date.now())
      throw new ApiError(401, "NONCE_EXPIRED", "Please sign again.");
    throw new ApiError(
      401,
      "NONCE_USED",
      "This signature has already been used. Please sign again.",
    );
  }
  return payload.address;
}
