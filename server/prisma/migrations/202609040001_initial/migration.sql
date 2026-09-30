CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');
CREATE TYPE "AttemptResult" AS ENUM ('SUCCESS', 'DUPLICATE_BLOCKED', 'NO_SGT', 'INVALID_SIGNATURE', 'EXPIRED_NONCE', 'CAMPAIGN_CLOSED', 'ERROR');
CREATE TABLE "Campaign" (
  "id" TEXT NOT NULL, "slug" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT NOT NULL,
  "rewardName" TEXT NOT NULL, "rewardAmount" INTEGER NOT NULL, "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "startsAt" TIMESTAMPTZ(3) NOT NULL, "endsAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Campaign_valid_window" CHECK ("endsAt" > "startsAt"),
  CONSTRAINT "Campaign_reward_nonnegative" CHECK ("rewardAmount" >= 0)
);
CREATE UNIQUE INDEX "Campaign_slug_key" ON "Campaign"("slug");
CREATE TABLE "Claim" (
  "id" TEXT NOT NULL, "campaignId" TEXT NOT NULL, "walletAddress" TEXT NOT NULL, "sgtMint" TEXT NOT NULL,
  "claimedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "isDevBypass" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "Claim_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Claim_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- Device identity, not wallet identity. This is the final concurrent-claim security boundary.
CREATE UNIQUE INDEX "Claim_campaignId_sgtMint_key" ON "Claim"("campaignId", "sgtMint");
CREATE TABLE "SiwsNonce" (
  "id" TEXT NOT NULL, "nonce" TEXT NOT NULL, "payload" JSONB NOT NULL, "purpose" TEXT NOT NULL,
  "campaignId" TEXT, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL, "usedAt" TIMESTAMPTZ(3), CONSTRAINT "SiwsNonce_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SiwsNonce_nonce_key" ON "SiwsNonce"("nonce");
CREATE INDEX "SiwsNonce_expiresAt_idx" ON "SiwsNonce"("expiresAt");
CREATE TABLE "ClaimAttempt" (
  "id" TEXT NOT NULL, "campaignId" TEXT NOT NULL, "walletAddress" TEXT NOT NULL, "sgtMint" TEXT,
  "result" "AttemptResult" NOT NULL, "reason" TEXT NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isDevBypass" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "ClaimAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClaimAttempt_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ClaimAttempt_campaignId_createdAt_idx" ON "ClaimAttempt"("campaignId", "createdAt");
