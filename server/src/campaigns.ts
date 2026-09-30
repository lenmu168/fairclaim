import type { Campaign } from "./generated/prisma/client.js";
import type { Db } from "./db.js";
import { ApiError } from "./errors.js";

export function assertCampaignOpen(campaign: Campaign, now = new Date()) {
  if (campaign.status !== "ACTIVE")
    throw new ApiError(409, "CAMPAIGN_CLOSED", "This campaign is not active.");
  if (now < campaign.startsAt)
    throw new ApiError(
      409,
      "CAMPAIGN_NOT_STARTED",
      "This campaign has not started yet.",
    );
  if (now >= campaign.endsAt)
    throw new ApiError(409, "CAMPAIGN_ENDED", "This campaign has ended.");
}
export async function getCampaign(db: Db, id: string) {
  const campaign = await db.campaign.findUnique({ where: { id } });
  if (!campaign)
    throw new ApiError(404, "CAMPAIGN_NOT_FOUND", "Campaign not found.");
  return campaign;
}
