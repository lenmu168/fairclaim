import type { Db } from "../src/db.js";
import { GENESIS_ACCESS_SLUG } from "../src/genesis-access.js";

export const genesisAccessCampaign = {
  id: "seeker-genesis-access-2026",
  slug: GENESIS_ACCESS_SLUG,
  name: "Seeker Genesis Access",
  description: "One verified SGT. One Genesis Access claim per campaign.",
  rewardName: "Seeker Genesis Access",
  rewardAmount: 0,
  status: "ACTIVE" as const,
  startsAt: new Date("2026-09-19T00:00:00.000Z"),
  endsAt: new Date("2027-09-19T00:00:00.000Z"),
};

export function historicalPioneerCampaign(now = new Date()) {
  return {
    slug: "seeker-pioneer",
    name: "Seeker Pioneer Drop",
    description: "A first step toward fair rewards. One Seeker. One Claim.",
    rewardName: "Pioneer Points",
    rewardAmount: 500,
    status: "ACTIVE" as const,
    startsAt: new Date(now.getTime() - 60_000),
    endsAt: new Date(now.getTime() + 365 * 86400_000),
  };
}

export async function ensureCampaigns(db: Db, now = new Date()) {
  // ON CONFLICT DO NOTHING: seeding never updates or reinterprets historical rows.
  await db.campaign.createMany({
    data: [historicalPioneerCampaign(now), genesisAccessCampaign],
    skipDuplicates: true,
  });
  return db.campaign.findMany({
    where: { slug: { in: ["seeker-pioneer", GENESIS_ACCESS_SLUG] } },
    orderBy: { slug: "asc" },
  });
}
