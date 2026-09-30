import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { genesisAccessCampaign } from "../prisma/campaign-seed.js";
import { ensureProductionGenesisCampaign } from "../prisma/production-campaign.js";
import { createDb } from "../src/db.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error(
    "Run npm test; production bootstrap tests require a dedicated _test database.",
  );

const db = createDb(url);
const unrelatedCampaign = {
  id: "unrelated-campaign",
  slug: "unrelated-campaign",
  name: "Unrelated Campaign",
  description: "Existing production data that must remain untouched.",
  rewardName: "None",
  rewardAmount: 0,
  status: "CLOSED" as const,
  startsAt: new Date("2025-01-01T00:00:00.000Z"),
  endsAt: new Date("2025-02-01T00:00:00.000Z"),
};

beforeEach(async () => {
  await db.claimAttempt.deleteMany();
  await db.claim.deleteMany();
  await db.siwsNonce.deleteMany();
  await db.campaign.deleteMany();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("Genesis-only production database bootstrap", () => {
  it("creates exactly the expected Genesis campaign in an empty database", async () => {
    const result = await ensureProductionGenesisCampaign(db);

    expect(result.created).toBe(true);
    expect(result.campaign).toMatchObject(genesisAccessCampaign);
    expect(await db.campaign.findMany()).toHaveLength(1);
    expect(await db.campaign.findUnique({ where: { slug: "seeker-pioneer" } })).toBeNull();
  });

  it("is idempotent when run twice", async () => {
    expect((await ensureProductionGenesisCampaign(db)).created).toBe(true);
    expect((await ensureProductionGenesisCampaign(db)).created).toBe(false);
    expect(await db.campaign.count()).toBe(1);
  });

  it("accepts an exact existing row without rewriting it", async () => {
    const existing = await db.campaign.create({ data: genesisAccessCampaign });
    const result = await ensureProductionGenesisCampaign(db);
    const after = await db.campaign.findUniqueOrThrow({
      where: { id: genesisAccessCampaign.id },
    });

    expect(result.created).toBe(false);
    expect(after).toEqual(existing);
  });

  it.each([
    ["same id", { ...genesisAccessCampaign, name: "Wrong Name" }],
    [
      "same slug",
      { ...genesisAccessCampaign, id: "conflicting-genesis-id" },
    ],
  ])("fails closed for a mismatched existing row with %s", async (_label, row) => {
    const existing = await db.campaign.create({ data: row });

    await expect(ensureProductionGenesisCampaign(db)).rejects.toThrow(
      /mismatch|conflict/i,
    );
    expect(await db.campaign.findMany()).toEqual([existing]);
  });

  it("never seeds the historical Pioneer campaign", async () => {
    await ensureProductionGenesisCampaign(db);
    expect(await db.campaign.count({ where: { slug: "seeker-pioneer" } })).toBe(0);
  });

  it("creates no Claim, ClaimAttempt, or SiwsNonce records", async () => {
    await ensureProductionGenesisCampaign(db);
    expect(await db.claim.count()).toBe(0);
    expect(await db.claimAttempt.count()).toBe(0);
    expect(await db.siwsNonce.count()).toBe(0);
  });

  it("does not delete or reset unrelated existing data", async () => {
    await db.campaign.create({ data: unrelatedCampaign });
    await db.claim.create({
      data: {
        campaignId: unrelatedCampaign.id,
        walletAddress: "ExistingWallet",
        sgtMint: "ExistingSgtMint",
      },
    });
    await db.claimAttempt.create({
      data: {
        campaignId: unrelatedCampaign.id,
        walletAddress: "ExistingWallet",
        sgtMint: "ExistingSgtMint",
        result: "SUCCESS",
        reason: "EXISTING_RECORD",
      },
    });
    await db.siwsNonce.create({
      data: {
        nonce: "existing-production-nonce",
        payload: { existing: true },
        purpose: "verify",
        campaignId: unrelatedCampaign.id,
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      },
    });

    await ensureProductionGenesisCampaign(db);

    expect(await db.campaign.count()).toBe(2);
    expect(await db.campaign.findUnique({ where: { id: unrelatedCampaign.id } })).toMatchObject(
      unrelatedCampaign,
    );
    expect(await db.claim.count()).toBe(1);
    expect(await db.claimAttempt.count()).toBe(1);
    expect(await db.siwsNonce.count()).toBe(1);
  });
});
