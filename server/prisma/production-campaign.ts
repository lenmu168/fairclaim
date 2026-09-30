import type { Campaign } from "../src/generated/prisma/client.js";
import type { Db } from "../src/db.js";
import { genesisAccessCampaign } from "./campaign-seed.js";

const expectedCampaign = genesisAccessCampaign;

const comparableFields = [
  "id",
  "slug",
  "name",
  "description",
  "rewardName",
  "rewardAmount",
  "status",
  "startsAt",
  "endsAt",
] as const;

function matchingFields(campaign: Campaign) {
  return {
    id: campaign.id,
    slug: campaign.slug,
    name: campaign.name,
    description: campaign.description,
    rewardName: campaign.rewardName,
    rewardAmount: campaign.rewardAmount,
    status: campaign.status,
    startsAt: campaign.startsAt,
    endsAt: campaign.endsAt,
  };
}

function mismatchedFields(campaign: Campaign) {
  const actual = matchingFields(campaign);
  return comparableFields.filter((field) => {
    const expected = expectedCampaign[field];
    const received = actual[field];
    return expected instanceof Date && received instanceof Date
      ? expected.getTime() !== received.getTime()
      : expected !== received;
  });
}

export type ProductionGenesisBootstrapResult = {
  campaign: Campaign;
  created: boolean;
};

export async function ensureProductionGenesisCampaign(
  db: Db,
): Promise<ProductionGenesisBootstrapResult> {
  return db.$transaction(async (tx) => {
    const existing = await tx.campaign.findMany({
      where: {
        OR: [
          { id: expectedCampaign.id },
          { slug: expectedCampaign.slug },
        ],
      },
      orderBy: { id: "asc" },
    });

    if (existing.length === 0) {
      return {
        campaign: await tx.campaign.create({ data: expectedCampaign }),
        created: true,
      };
    }

    if (existing.length !== 1) {
      throw new Error(
        "Production Genesis campaign identity conflicts with multiple existing rows. Refusing to modify data.",
      );
    }

    const campaign = existing[0]!;
    const mismatches = mismatchedFields(campaign);
    if (mismatches.length) {
      throw new Error(
        `Production Genesis campaign mismatch (${mismatches.join(", ")}). Refusing to overwrite existing data.`,
      );
    }

    return { campaign, created: false };
  });
}
