import "dotenv/config";
import { createDb } from "../src/db.js";
import { ensureProductionGenesisCampaign } from "./production-campaign.js";

if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL is required for the production bootstrap.");

const db = createDb(process.env.DATABASE_URL);
try {
  const result = await ensureProductionGenesisCampaign(db);
  console.info(
    `Production Genesis campaign ${result.created ? "created" : "verified"}: ${result.campaign.slug} (${result.campaign.id}).`,
  );
} finally {
  await db.$disconnect();
}
