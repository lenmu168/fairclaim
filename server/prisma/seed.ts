import "dotenv/config";
import { createDb } from "../src/db.js";
import { ensureCampaigns } from "./campaign-seed.js";

if (!process.env.DATABASE_URL)
  throw new Error("Set DATABASE_URL in server/.env first.");
const db = createDb(process.env.DATABASE_URL);
try {
  const campaigns = await ensureCampaigns(db);
  for (const campaign of campaigns) console.info(`Campaign ready: ${campaign.slug} (${campaign.id})`);
} finally {
  await db.$disconnect();
}
