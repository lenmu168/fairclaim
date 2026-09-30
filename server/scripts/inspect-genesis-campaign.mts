import "dotenv/config";
import { createDb } from "../src/db.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");

const db = createDb(process.env.DATABASE_URL);
try {
  const campaigns = await db.campaign.findMany({
    where: { slug: { in: ["seeker-pioneer", "seeker-genesis-access"] } },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      rewardName: true,
      rewardAmount: true,
      status: true,
      startsAt: true,
      endsAt: true,
      _count: { select: { claims: true, attempts: true } },
    },
    orderBy: { slug: "asc" },
  });
  console.info(JSON.stringify(campaigns));
} finally {
  await db.$disconnect();
}
