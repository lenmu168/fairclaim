import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createSignInMessage } from "@solana/wallet-standard-util";
import { address, getBase58Decoder } from "@solana/kit";
import { createApp } from "../src/app.js";
import { createDb } from "../src/db.js";
import { readConfig } from "../src/config.js";
import { ApiError } from "../src/errors.js";
import type { SgtVerifier } from "../src/sgt.js";
import type { Proof } from "../src/auth.js";
import {
  ensureCampaigns,
  genesisAccessCampaign,
} from "../prisma/campaign-seed.js";
import { genesisAccessClaimStatement } from "../src/genesis-access.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error(
    "Run npm test; integration tests require a dedicated _test database.",
  );
const db = createDb(url);
const config = readConfig({
  NODE_ENV: "test",
  DATABASE_URL: url,
  SOLANA_MAINNET_RPC_URL: "https://rpc.example.com",
  SIWS_DOMAIN: "fairclaim.example",
  SIWS_URI: "https://fairclaim.example",
});

const verifyOnlyConfig = readConfig({
  NODE_ENV: "test",
  DATABASE_URL: url,
  SOLANA_MAINNET_RPC_URL: "https://rpc.example.com",
  SIWS_DOMAIN: "fairclaim.example",
  SIWS_URI: "https://fairclaim.example",
  SGT_VERIFY_ONLY_MODE: "true",
});
const claimTestConfig = readConfig({
  NODE_ENV: "test",
  DATABASE_URL: url,
  SOLANA_MAINNET_RPC_URL: "https://rpc.example.com",
  SIWS_DOMAIN: "fairclaim.example",
  SIWS_URI: "https://fairclaim.example",
  CLAIM_TEST_MODE: "true",
});
const databaseClaimsConfig = readConfig({
  NODE_ENV: "test",
  DATABASE_URL: url,
  SOLANA_MAINNET_RPC_URL: "https://rpc.example.com",
  SIWS_DOMAIN: "fairclaim.example",
  SIWS_URI: "https://fairclaim.example",
  DATABASE_CLAIMS_ENABLED: "true",
});
const verifySgt = vi.fn<SgtVerifier>();
const app = createApp({ db, config, verifySgt });
const verifyOnlyApp = createApp({ db, config: verifyOnlyConfig, verifySgt });
const claimTestApp = createApp({ db, config: claimTestConfig, verifySgt });
const databaseClaimsApp = createApp({
  db,
  config: databaseClaimsConfig,
  verifySgt,
});
type Wallet = { address: string; key: KeyObject };
function wallet(): Wallet {
  const pair = generateKeyPairSync("ed25519");
  const bytes = pair.publicKey
    .export({ type: "spki", format: "der" })
    .subarray(-32);
  return { address: getBase58Decoder().decode(bytes), key: pair.privateKey };
}
const alice = wallet();
const bob = wallet();
const mintA = wallet().address;
const mintB = wallet().address;
const campaignData = {
  id: "pioneer",
  slug: "seeker-pioneer",
  name: "Seeker Pioneer Drop",
  description: "Demo",
  rewardName: "Pioneer Points",
  rewardAmount: 500,
  status: "ACTIVE" as const,
  startsAt: new Date(Date.now() - 86400_000),
  endsAt: new Date(Date.now() + 86400_000),
};
type Payload = Parameters<typeof createSignInMessage>[0];
type Challenge = Payload & {
  canonicalMessage: number[];
  authPath: Proof["authPath"];
  claimContext?: {
    campaignId: string;
    campaignName: string;
    rewardName: string;
    rewardAmount: number;
  };
};
async function challenge(
  owner = alice,
  id = "pioneer",
  purpose: "verify" | "claim" = "claim",
  authPath: Proof["authPath"] = "native-siws",
): Promise<Challenge> {
  const res = await request(app)
    .post("/api/auth/nonce")
    .send({ address: owner.address, campaignId: id, purpose, authPath });
  expect(res.status).toBe(201);
  return res.body as Challenge;
}
function signPayload(
  payload: Challenge,
  owner = alice,
  overrides: Partial<Payload> = {},
  authPath: Proof["authPath"] = "native-siws",
): Proof {
  const {
    canonicalMessage,
    authPath: _issuedAuthPath,
    claimContext: _claimContext,
    ...siwsPayload
  } = payload;
  const message =
    authPath === "sign-messages-fallback" && !Object.keys(overrides).length
      ? new Uint8Array(canonicalMessage)
      : createSignInMessage({ ...siwsPayload, ...overrides });
  return {
    address: address(String(payload.address)),
    nonce: String(payload.nonce),
    requestId: String(payload.requestId),
    authPath,
    signedMessage: Array.from(message),
    signature: Array.from(sign(null, message, owner.key)),
  };
}
async function fallbackProof(
  owner = alice,
  id = "pioneer",
  purpose: "verify" | "claim" = "claim",
) {
  const payload = await challenge(owner, id, purpose, "sign-messages-fallback");
  return signPayload(payload, owner, {}, "sign-messages-fallback");
}
async function verifyOnlyProof(
  owner = alice,
  purpose: "verify" | "claim" = "verify",
) {
  const response = await request(verifyOnlyApp).post("/api/auth/nonce").send({
    address: owner.address,
    campaignId: "pioneer",
    purpose,
    authPath: "sign-messages-fallback",
  });
  expect(response.status).toBe(201);
  return signPayload(
    response.body as Challenge,
    owner,
    {},
    "sign-messages-fallback",
  );
}
async function proof(
  owner = alice,
  id = "pioneer",
  purpose: "verify" | "claim" = "claim",
) {
  return signPayload(await challenge(owner, id, purpose), owner);
}
const claim = (body: object, id = "pioneer") =>
  request(claimTestApp).post(`/api/campaigns/${id}/claim`).send(body);
beforeEach(async () => {
  await db.claimAttempt.deleteMany();
  await db.claim.deleteMany();
  await db.siwsNonce.deleteMany();
  await db.campaign.deleteMany();
  await db.campaign.create({ data: campaignData });
  verifySgt.mockReset();
  verifySgt.mockResolvedValue({ hasSGT: true, mintAddress: mintA });
});
afterAll(async () => {
  await db.$disconnect();
});

describe("server-issued SIWS and authoritative address", () => {
  it("creates a random, complete, short-lived stored nonce", async () => {
    const one = await challenge();
    const two = await challenge();
    expect(one.nonce).toMatch(/^[a-f0-9]{32}$/);
    expect(one.nonce).not.toBe(two.nonce);
    expect(one).toMatchObject({
      address: alice.address,
      chainId: "solana:mainnet",
      version: "1",
      domain: config.SIWS_DOMAIN,
      uri: config.SIWS_URI,
    });
    expect(one.statement).toBe(
      `Authorize a FairClaim DATABASE-ONLY demo claim. Campaign: Seeker Pioneer Drop. Campaign ID: pioneer. Reward: 500 Pioneer Points. Wallet: ${alice.address}. This authorizes exactly one FairClaim database claim for this campaign. It does NOT authorize any blockchain transaction, SOL transfer, token transfer, token approval, delegate, authority change, or payment.`,
    );
    expect(one.claimContext).toEqual({
      campaignId: "pioneer",
      campaignName: "Seeker Pioneer Drop",
      rewardName: "Pioneer Points",
      rewardAmount: 500,
    });
    expect(one.requestId).toBe(one.nonce);
    const {
      canonicalMessage,
      authPath: _authPath,
      claimContext: _claimContext,
      ...payload
    } = one;
    expect(canonicalMessage).toEqual(Array.from(createSignInMessage(payload)));
    const row = await db.siwsNonce.findUniqueOrThrow({
      where: { nonce: String(one.nonce) },
    });
    expect(row.usedAt).toBeNull();
    expect(row.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(300_000);
  });
  it("rejects client-authored campaign and reward display fields", async () => {
    const response = await request(app).post("/api/auth/nonce").send({
      address: alice.address,
      campaignId: "pioneer",
      purpose: "claim",
      authPath: "sign-messages-fallback",
      campaignName: "Client campaign",
      rewardName: "SOL",
      rewardAmount: 999,
    });
    expect(response.status).toBe(400);
    expect(await db.siwsNonce.count()).toBe(0);
  });
  it("rejects an expired nonce", async () => {
    const body = await proof();
    await db.siwsNonce.update({
      where: { nonce: body.nonce },
      data: { expiresAt: new Date(0) },
    });
    const res = await claim(body);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("NONCE_EXPIRED");
    expect(verifySgt).not.toHaveBeenCalled();
  });
  it("rejects nonce replay without another RPC call", async () => {
    const body = await proof();
    expect((await claim(body)).status).toBe(201);
    expect((await claim(body)).body.code).toBe("NONCE_USED");
    expect(verifySgt).toHaveBeenCalledTimes(1);
  });
  it("only consumes a valid signature once under concurrent replay", async () => {
    const body = await proof();
    const res = await Promise.all([claim(body), claim(body)]);
    expect(res.map((r) => r.status).sort()).toEqual([201, 401]);
    expect(res.find((r) => r.status === 401)?.body.code).toBe("NONCE_USED");
    expect(verifySgt).toHaveBeenCalledTimes(1);
  });
  it("rejects an invalid Ed25519 signature and does not consume its nonce", async () => {
    const body = await proof();
    body.signature[0] = body.signature[0]! ^ 255;
    const res = await claim(body);
    expect(res.body.code).toBe("INVALID_SIGNATURE");
    expect(
      (await db.siwsNonce.findUniqueOrThrow({ where: { nonce: body.nonce } }))
        .usedAt,
    ).toBeNull();
    expect(verifySgt).not.toHaveBeenCalled();
  });
  it("blocks attacker signing a victim address with their own key", async () => {
    const payload = await challenge(alice);
    const body = signPayload(payload, bob);
    expect((await claim(body)).body.code).toBe("INVALID_SIGNATURE");
    expect(verifySgt).not.toHaveBeenCalled();
  });
  it.each([
    "domain",
    "chainId",
    "version",
    "uri",
    "issuedAt",
    "nonce",
    "statement",
    "requestId",
  ] as const)("rejects altered %s", async (field) => {
    const payload = await challenge();
    const changes: Partial<Payload> = {
      [field]:
        field === "chainId"
          ? "solana:devnet"
          : field === "issuedAt"
            ? new Date(0).toISOString()
            : "changed",
    };
    expect((await claim(signPayload(payload, alice, changes))).body.code).toBe(
      "INVALID_SIGNATURE",
    );
    expect(verifySgt).not.toHaveBeenCalled();
  });
  it.each([
    { signature: [1] },
    { signature: Array(64).fill(256) },
    { signedMessage: "not bytes" },
    { signedMessage: [-1] },
    { verified: true, sgtMint: mintA },
    { account: { address: alice.address } },
    { seedPhrase: "must never be accepted" },
    { mnemonic: "must never be accepted" },
    { privateKey: "must never be accepted" },
    { secretKey: [1, 2, 3] },
  ])("rejects malformed or extra proof fields: %j", async (override) => {
    expect((await claim({ ...(await proof()), ...override })).body.code).toBe(
      "INVALID_SIGNATURE",
    );
    expect(verifySgt).not.toHaveBeenCalled();
  });
  it("does not allow verification challenge to authorize a claim", async () => {
    expect(
      (await claim(await proof(alice, "pioneer", "verify"))).body.code,
    ).toBe("INVALID_SIGNATURE");
  });
  it("returns the verified SGT mint and requires a fresh proof for claim", async () => {
    const body = await proof(alice, "pioneer", "verify");
    const verified = await request(app)
      .post("/api/seeker/verify?campaignId=pioneer")
      .send(body);
    expect(verified.body).toMatchObject({
      hasSGT: true,
      walletAddress: alice.address,
      mintAddress: mintA,
      devSgtBypass: false,
    });
    expect(verifySgt).toHaveBeenCalledWith(alice.address);
    expect((await claim(body)).body.code).toBe("NONCE_USED");
    expect((await claim(await proof())).status).toBe(201);
  });
});

describe("server-authoritative signMessages fallback", () => {
  it("accepts exact server canonical bytes and consumes the challenge", async () => {
    const body = await fallbackProof(alice, "pioneer", "verify");
    const res = await request(app)
      .post("/api/seeker/verify?campaignId=pioneer")
      .send(body);
    expect(res.status).toBe(200);
    expect(verifySgt).toHaveBeenCalledWith(alice.address);
    expect(
      (await db.siwsNonce.findUniqueOrThrow({ where: { nonce: body.nonce } }))
        .usedAt,
    ).not.toBeNull();
  });

  it("rejects a one-byte canonical message change before SGT lookup", async () => {
    const body = await fallbackProof();
    body.signedMessage[0] = body.signedMessage[0]! ^ 1;
    expect((await claim(body)).body.code).toBe("INVALID_SIGNATURE");
    expect(verifySgt).not.toHaveBeenCalled();
    expect(
      (await db.siwsNonce.findUniqueOrThrow({ where: { nonce: body.nonce } }))
        .usedAt,
    ).toBeNull();
  });

  it("rejects a wrong fallback signature before SGT lookup", async () => {
    const body = await fallbackProof();
    body.signature[0] = body.signature[0]! ^ 1;
    expect((await claim(body)).body.code).toBe("INVALID_SIGNATURE");
    expect(verifySgt).not.toHaveBeenCalled();
  });

  it("rejects a fallback proof relabeled as native SIWS", async () => {
    const body = await fallbackProof();
    body.authPath = "native-siws";
    expect((await claim(body)).body.code).toBe("INVALID_SIGNATURE");
    expect(verifySgt).not.toHaveBeenCalled();
    expect(
      (await db.siwsNonce.findUniqueOrThrow({ where: { nonce: body.nonce } }))
        .usedAt,
    ).toBeNull();
  });

  it("rejects a different wallet address before SGT lookup", async () => {
    const body = await fallbackProof();
    body.address = address(bob.address);
    expect((await claim(body)).body.code).toBe("INVALID_SIGNATURE");
    expect(verifySgt).not.toHaveBeenCalled();
  });

  it("rejects an expired fallback challenge", async () => {
    const body = await fallbackProof();
    await db.siwsNonce.update({
      where: { nonce: body.nonce },
      data: { expiresAt: new Date(0) },
    });
    expect((await claim(body)).body.code).toBe("NONCE_EXPIRED");
    expect(verifySgt).not.toHaveBeenCalled();
  });

  it("allows only one concurrent fallback verification", async () => {
    const body = await fallbackProof();
    const responses = await Promise.all([claim(body), claim(body)]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 401,
    ]);
    expect(
      responses.find((response) => response.status === 401)?.body.code,
    ).toBe("NONCE_USED");
    expect(verifySgt).toHaveBeenCalledTimes(1);
  });

  it("rejects sequential fallback replay without another SGT lookup", async () => {
    const body = await fallbackProof();
    expect((await claim(body)).status).toBe(201);
    const replay = await claim(body);
    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe("NONCE_USED");
    expect(verifySgt).toHaveBeenCalledTimes(1);
  });

  it("returns NO_SGT only after signature verification and consumes the nonce", async () => {
    verifySgt.mockResolvedValue({ hasSGT: false, mintAddress: null });
    const body = await fallbackProof(alice, "pioneer", "verify");
    const res = await request(app)
      .post("/api/seeker/verify?campaignId=pioneer")
      .send(body);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("NO_SGT");
    expect(verifySgt).toHaveBeenCalledWith(alice.address);
    expect(
      (await db.siwsNonce.findUniqueOrThrow({ where: { nonce: body.nonce } }))
        .usedAt,
    ).not.toBeNull();
  });
});

describe("campaigns, PostgreSQL uniqueness and attempts", () => {
  it("serves health and campaign data", async () => {
    expect((await request(app).get("/health")).body.status).toBe("ok");
    expect((await request(app).get("/api/campaigns")).body).toHaveLength(1);
    expect(
      (await request(app).get("/api/campaigns/seeker-pioneer")).body.id,
    ).toBe("pioneer");
  });
  it("rejects a nonexistent campaign before signature or RPC work", async () => {
    const res = await claim({}, "missing");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("CAMPAIGN_NOT_FOUND");
    expect(verifySgt).not.toHaveBeenCalled();
  });
  it.each([
    { startsAt: new Date(Date.now() + 3600_000), code: "CAMPAIGN_NOT_STARTED" },
    { endsAt: new Date(Date.now() - 3600_000), code: "CAMPAIGN_ENDED" },
    { status: "CLOSED" as const, code: "CAMPAIGN_CLOSED" },
  ])("rejects campaign window/status $code", async ({ code, ...data }) => {
    await db.campaign.update({ where: { id: "pioneer" }, data });
    expect((await claim({})).body.code).toBe(code);
    expect(verifySgt).not.toHaveBeenCalled();
  });
  it("first claim creates a receipt, claim and success attempt atomically", async () => {
    const res = await claim(await proof());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      success: true,
      campaignId: "pioneer",
      walletAddress: alice.address,
      sgtMint: mintA,
    });
    expect(await db.claim.count()).toBe(1);
    expect(await db.claimAttempt.count({ where: { result: "SUCCESS" } })).toBe(
      1,
    );
    const stored = await db.claim.findFirstOrThrow({
      include: { campaign: true },
    });
    expect(stored.campaign.rewardName).toBe("Pioneer Points");
    expect(stored.campaign.rewardAmount).toBe(500);
  });
  it("same SGT and campaign is blocked even from a different wallet; counter increments", async () => {
    await claim(await proof());
    const res = await claim(await proof(bob));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ALREADY_CLAIMED");
    const stats = await request(app).get("/api/campaigns/pioneer/stats");
    expect(stats.body).toMatchObject({
      successfulClaims: 1,
      uniqueSGTs: 1,
      duplicateAttempts: 1,
      failedAttempts: 0,
    });
    expect(stats.body.recentAttempts).toHaveLength(2);
    expect(await db.claim.count()).toBe(1);
    expect(await db.claimAttempt.count({ where: { result: "SUCCESS" } })).toBe(
      1,
    );
    expect(
      await db.claimAttempt.count({ where: { result: "DUPLICATE_BLOCKED" } }),
    ).toBe(1);
  });
  it("same SGT can claim a different campaign", async () => {
    await db.campaign.create({
      data: { ...campaignData, id: "second", slug: "second" },
    });
    expect((await claim(await proof())).status).toBe(201);
    expect((await claim(await proof(alice, "second"), "second")).status).toBe(
      201,
    );
  });
  it("different SGT can claim the same campaign", async () => {
    await claim(await proof());
    verifySgt.mockResolvedValue({ hasSGT: true, mintAddress: mintB });
    expect((await claim(await proof(bob))).status).toBe(201);
    expect(await db.claim.count()).toBe(2);
  });
  it("rejects the same device twice at the database boundary without the API", async () => {
    const data = {
      campaignId: "pioneer",
      walletAddress: alice.address,
      sgtMint: mintA,
    };
    await db.claim.create({ data });
    await expect(db.claim.create({ data })).rejects.toMatchObject({
      code: "P2002",
    });
  });
  it("two fresh authorizations for the same claim concurrently yield exactly one success and one 409", async () => {
    const bodies = await Promise.all([proof(), proof()]);
    const res = await Promise.all(bodies.map((body) => claim(body)));
    expect(res.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(res.find((r) => r.status === 409)?.body.code).toBe(
      "ALREADY_CLAIMED",
    );
    expect(await db.claim.count()).toBe(1);
    expect(await db.claimAttempt.count({ where: { result: "SUCCESS" } })).toBe(
      1,
    );
    expect(
      await db.claimAttempt.count({ where: { result: "DUPLICATE_BLOCKED" } }),
    ).toBe(1);
  });
  it("checks campaign window again after the RPC completes", async () => {
    verifySgt.mockImplementationOnce(async () => {
      await db.campaign.update({
        where: { id: "pioneer" },
        data: { status: "CLOSED" },
      });
      return { hasSGT: true, mintAddress: mintA };
    });
    expect((await claim(await proof())).body.code).toBe("CAMPAIGN_CLOSED");
    expect(await db.claim.count()).toBe(0);
  });
  it("rejects NO_SGT and counts failure, using only the signed wallet", async () => {
    verifySgt.mockResolvedValue({ hasSGT: false, mintAddress: null });
    expect((await claim(await proof())).body.code).toBe("NO_SGT");
    expect(verifySgt).toHaveBeenCalledWith(alice.address);
    expect(
      (await request(app).get("/api/campaigns/pioneer/stats")).body
        .failedAttempts,
    ).toBe(1);
  });
  it("does not reuse verification when the SGT is no longer held", async () => {
    await request(app)
      .post("/api/seeker/verify?campaignId=pioneer")
      .send(await proof(alice, "pioneer", "verify"));
    verifySgt.mockResolvedValue({ hasSGT: false, mintAddress: null });
    expect((await claim(await proof())).body.code).toBe("NO_SGT");
  });
  it("distinguishes RPC failure from no SGT", async () => {
    verifySgt.mockRejectedValue(
      new ApiError(503, "RPC_ERROR", "Verification temporarily unavailable."),
    );
    const res = await claim(await proof());
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("RPC_ERROR");
    expect(res.body.stack).toBeUndefined();
  });
});

describe("server-authoritative database-only claim test mode", () => {
  it("rejects Claim while all database Claim modes are disabled before consuming proof or writing attempts", async () => {
    const body = await proof();
    const response = await request(app)
      .post("/api/campaigns/pioneer/claim")
      .send(body);
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("DATABASE_CLAIMS_DISABLED");
    expect(verifySgt).not.toHaveBeenCalled();
    expect(await db.claim.count()).toBe(0);
    expect(await db.claimAttempt.count()).toBe(0);
    expect(
      (await db.siwsNonce.findUniqueOrThrow({ where: { nonce: body.nonce } }))
        .usedAt,
    ).toBeNull();
  });

  it("rejects an unverified wallet and creates no Claim", async () => {
    const response = await claim({});
    expect(response.status).toBe(401);
    expect(response.body.code).toBe("INVALID_SIGNATURE");
    expect(verifySgt).not.toHaveBeenCalled();
    expect(await db.claim.count()).toBe(0);
  });

  it("leaves a cancelled Claim challenge unused with no reward mutation", async () => {
    const pending = await challenge(
      alice,
      "pioneer",
      "claim",
      "sign-messages-fallback",
    );
    const beforeStats = await request(app).get("/api/campaigns/pioneer/stats");
    expect(
      (
        await db.siwsNonce.findUniqueOrThrow({
          where: { nonce: String(pending.nonce) },
        })
      ).usedAt,
    ).toBeNull();
    expect(verifySgt).not.toHaveBeenCalled();
    expect(await db.claim.count()).toBe(0);
    expect(await db.claimAttempt.count()).toBe(0);
    expect(
      (await db.campaign.findUniqueOrThrow({ where: { id: "pioneer" } }))
        .rewardAmount,
    ).toBe(500);
    const afterStats = await request(app).get("/api/campaigns/pioneer/stats");
    expect(afterStats.body).toEqual(beforeStats.body);
    expect(afterStats.body.successfulClaims).toBe(0);
  });

  it("exposes the public database-only mode without enabling bypass", async () => {
    expect((await request(claimTestApp).get("/health")).body).toMatchObject({
      devSgtBypass: false,
      sgtVerifyOnlyMode: false,
      claimTestMode: true,
      databaseClaimsEnabled: false,
      chainId: "solana:mainnet",
    });
  });

  it("separates production database claims from CLAIM_TEST_MODE without changing Claim semantics", async () => {
    expect(
      (await request(databaseClaimsApp).get("/health")).body,
    ).toMatchObject({
      devSgtBypass: false,
      sgtVerifyOnlyMode: false,
      claimTestMode: false,
      databaseClaimsEnabled: true,
      chainId: "solana:mainnet",
    });
    const response = await request(databaseClaimsApp)
      .post("/api/campaigns/pioneer/claim")
      .send(await proof());
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ success: true, sgtMint: mintA });
    expect(await db.claim.count()).toBe(1);
  });
});

describe("development SGT verify-only mode", () => {
  it("allows real SGT verification and exposes only the public mode flag", async () => {
    const body = await verifyOnlyProof();
    const response = await request(verifyOnlyApp)
      .post("/api/seeker/verify?campaignId=pioneer")
      .send(body);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      hasSGT: true,
      walletAddress: alice.address,
      mintAddress: mintA,
      devSgtBypass: false,
    });
    expect((await request(verifyOnlyApp).get("/health")).body).toMatchObject({
      devSgtBypass: false,
      sgtVerifyOnlyMode: true,
      claimTestMode: false,
      chainId: "solana:mainnet",
    });
  });

  it("keeps NO_SGT fail-closed during verification", async () => {
    verifySgt.mockResolvedValue({ hasSGT: false, mintAddress: null });
    const response = await request(verifyOnlyApp)
      .post("/api/seeker/verify?campaignId=pioneer")
      .send(await verifyOnlyProof());
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("NO_SGT");
    expect(await db.claim.count()).toBe(0);
  });

  it("rejects every direct claim before consuming proof or touching claim data", async () => {
    const body = await verifyOnlyProof(alice, "claim");
    const beforeStats = await request(verifyOnlyApp).get(
      "/api/campaigns/pioneer/stats",
    );
    const validAttempt = await request(verifyOnlyApp)
      .post("/api/campaigns/pioneer/claim")
      .send(body);
    const maliciousAttempt = await request(verifyOnlyApp)
      .post("/api/campaigns/pioneer/claim")
      .send({});
    expect(validAttempt.status).toBe(403);
    expect(validAttempt.body.code).toBe("VERIFY_ONLY_MODE");
    expect(maliciousAttempt.status).toBe(403);
    expect(maliciousAttempt.body.code).toBe("VERIFY_ONLY_MODE");
    expect(verifySgt).not.toHaveBeenCalled();
    expect(await db.claim.count()).toBe(0);
    expect(await db.claimAttempt.count()).toBe(0);
    expect(
      (await db.siwsNonce.findUniqueOrThrow({ where: { nonce: body.nonce } }))
        .usedAt,
    ).toBeNull();
    const afterStats = await request(verifyOnlyApp).get(
      "/api/campaigns/pioneer/stats",
    );
    expect(afterStats.body).toEqual(beforeStats.body);
    expect(afterStats.body.successfulClaims).toBe(0);
  });
});

describe("Seeker Genesis Access campaign semantics", () => {
  beforeEach(async () => {
    await ensureCampaigns(db);
  });

  it("initializes the new campaign idempotently without rewriting Pioneer history", async () => {
    const historical = await db.campaign.findUniqueOrThrow({
      where: { id: "pioneer" },
    });
    await ensureCampaigns(db);
    expect(await db.campaign.count()).toBe(2);
    expect(
      await db.campaign.findUniqueOrThrow({ where: { id: "pioneer" } }),
    ).toEqual(historical);
    const genesis = await db.campaign.findUniqueOrThrow({
      where: { slug: genesisAccessCampaign.slug },
    });
    expect(genesis).toMatchObject({
      id: genesisAccessCampaign.id,
      name: "Seeker Genesis Access",
      rewardName: "Seeker Genesis Access",
      rewardAmount: 0,
      status: "ACTIVE",
    });
  });

  it("issues exact access-specific canonical bytes with no reward line", async () => {
    const issued = await challenge(
      alice,
      genesisAccessCampaign.id,
      "claim",
      "sign-messages-fallback",
    );
    expect(issued.statement).toBe(
      genesisAccessClaimStatement(alice.address, genesisAccessCampaign),
    );
    expect(issued.statement).not.toMatch(
      /Reward:|Pioneer Points|0 Seeker Genesis Access/i,
    );
    expect(issued.claimContext).toEqual({
      kind: "genesis-access",
      campaignId: genesisAccessCampaign.id,
      campaignName: "Seeker Genesis Access",
    });
    const {
      canonicalMessage,
      authPath: _authPath,
      claimContext: _claimContext,
      ...payload
    } = issued;
    expect(canonicalMessage).toEqual(Array.from(createSignInMessage(payload)));
    expect(
      new TextDecoder().decode(new Uint8Array(canonicalMessage)),
    ).not.toMatch(/Reward:|Pioneer Points/i);
  });

  it("rejects mutated bytes, wrong signer, wrong campaign and expired nonce", async () => {
    const issued = await challenge(
      alice,
      genesisAccessCampaign.id,
      "claim",
      "sign-messages-fallback",
    );
    const signed = signPayload(issued, alice, {}, "sign-messages-fallback");
    const mutated = { ...signed, signedMessage: [...signed.signedMessage] };
    mutated.signedMessage[10] = mutated.signedMessage[10]! ^ 1;
    expect((await claim(mutated, genesisAccessCampaign.id)).body.code).toBe(
      "INVALID_SIGNATURE",
    );
    expect(
      (
        await claim(
          signPayload(issued, bob, {}, "sign-messages-fallback"),
          genesisAccessCampaign.id,
        )
      ).body.code,
    ).toBe("INVALID_SIGNATURE");
    expect((await claim(signed, "pioneer")).body.code).toBe(
      "INVALID_SIGNATURE",
    );
    expect(
      (await db.siwsNonce.findUniqueOrThrow({ where: { nonce: signed.nonce } }))
        .usedAt,
    ).toBeNull();
    await db.siwsNonce.update({
      where: { nonce: signed.nonce },
      data: { expiresAt: new Date(0) },
    });
    expect((await claim(signed, genesisAccessCampaign.id)).body.code).toBe(
      "NONCE_EXPIRED",
    );
    expect(await db.claim.count()).toBe(0);
  });

  it("fails closed on NO_SGT without creating a Claim", async () => {
    verifySgt.mockResolvedValue({ hasSGT: false, mintAddress: null });
    const issued = await challenge(
      alice,
      genesisAccessCampaign.id,
      "claim",
      "sign-messages-fallback",
    );
    const result = await claim(
      signPayload(issued, alice, {}, "sign-messages-fallback"),
      genesisAccessCampaign.id,
    );
    expect(result.status).toBe(403);
    expect(result.body.code).toBe("NO_SGT");
    expect(await db.claim.count()).toBe(0);
    expect(
      await db.claimAttempt.count({
        where: { campaignId: genesisAccessCampaign.id, result: "NO_SGT" },
      }),
    ).toBe(1);
  });

  it("allows one Claim per SGT in each campaign and blocks a second Genesis Claim", async () => {
    const old = await claim(await proof());
    expect(old.status).toBe(201);
    const first = await challenge(
      alice,
      genesisAccessCampaign.id,
      "claim",
      "sign-messages-fallback",
    );
    const genesisFirst = await claim(
      signPayload(first, alice, {}, "sign-messages-fallback"),
      genesisAccessCampaign.id,
    );
    expect(genesisFirst.status).toBe(201);
    const duplicate = await challenge(
      bob,
      genesisAccessCampaign.id,
      "claim",
      "sign-messages-fallback",
    );
    const genesisSecond = await claim(
      signPayload(duplicate, bob, {}, "sign-messages-fallback"),
      genesisAccessCampaign.id,
    );
    expect(genesisSecond.status).toBe(409);
    expect(genesisSecond.body.code).toBe("ALREADY_CLAIMED");
    expect(await db.claim.count()).toBe(2);
    expect(
      await db.claim.count({
        where: { campaignId: genesisAccessCampaign.id, sgtMint: mintA },
      }),
    ).toBe(1);
    const oldStats = await request(app).get("/api/campaigns/pioneer/stats");
    const genesisStats = await request(app).get(
      `/api/campaigns/${genesisAccessCampaign.id}/stats`,
    );
    expect(oldStats.body).toMatchObject({
      successfulClaims: 1,
      uniqueSGTs: 1,
      duplicateAttempts: 0,
    });
    expect(genesisStats.body).toMatchObject({
      successfulClaims: 1,
      uniqueSGTs: 1,
      duplicateAttempts: 1,
    });
  });
});
