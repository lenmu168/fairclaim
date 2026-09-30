import { randomUUID } from "node:crypto";
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { z, ZodError } from "zod";
import { Prisma, type AttemptResult } from "./generated/prisma/client.js";
import type { Db } from "./db.js";
import type { Config } from "./config.js";
import { ApiError } from "./errors.js";
import { challengeRequestSchema, issueChallenge, verifyProof } from "./auth.js";
import { assertCampaignOpen, getCampaign } from "./campaigns.js";
import type { SgtVerifier } from "./sgt.js";

function attemptResult(code: string): AttemptResult {
  if (code === "ALREADY_CLAIMED") return "DUPLICATE_BLOCKED";
  if (code === "NO_SGT") return "NO_SGT";
  if (code === "INVALID_SIGNATURE") return "INVALID_SIGNATURE";
  if (code === "NONCE_EXPIRED") return "EXPIRED_NONCE";
  if (code.startsWith("CAMPAIGN_")) return "CAMPAIGN_CLOSED";
  return "ERROR";
}

export function createApp({
  db,
  config,
  verifySgt,
}: {
  db: Db;
  config: Config;
  verifySgt: SgtVerifier;
}) {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("X-Request-Id", randomUUID());
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(helmet());
  const origins = config.CORS_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  app.use(cors({ origin: origins }));
  app.use(express.json({ limit: "32kb" }));
  // Native clients have no Origin header; CORS is never treated as authentication.
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: config.NODE_ENV === "test" ? 10_000 : 120,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {
        success: false,
        code: "RATE_LIMITED",
        message: "Too many requests. Please try again shortly.",
      },
    }),
  );

  app.get("/health", async (_req, res) => {
    await db.$queryRaw`SELECT 1`;
    res.json({
      status: "ok",
      devSgtBypass: config.bypass,
      sgtVerifyOnlyMode: config.verifyOnlyMode,
      claimTestMode: config.claimTestMode,
      databaseClaimsEnabled: config.databaseClaimsEnabled,
      chainId: "solana:mainnet",
    });
  });
  app.get("/api/campaigns", async (_req, res) => {
    res.json(await db.campaign.findMany({ orderBy: { createdAt: "desc" } }));
  });
  app.get("/api/campaigns/:slug", async (req, res) => {
    const campaign = await db.campaign.findUnique({
      where: { slug: req.params.slug },
    });
    if (!campaign)
      throw new ApiError(404, "CAMPAIGN_NOT_FOUND", "Campaign not found.");
    res.json(campaign);
  });
  app.post(
    "/api/auth/nonce",
    rateLimit({
      windowMs: 60_000,
      limit: config.NODE_ENV === "test" ? 10_000 : 20,
      message: {
        success: false,
        code: "RATE_LIMITED",
        message: "Please wait before requesting another signature.",
      },
    }),
    async (req, res) => {
      const input = challengeRequestSchema.parse(req.body);
      const campaign = await getCampaign(db, input.campaignId);
      res.status(201).json(await issueChallenge(db, config, input, campaign));
    },
  );

  async function execute(
    raw: unknown,
    campaignId: string,
    purpose: "verify" | "claim",
  ) {
    const campaign = await getCampaign(db, campaignId);
    let walletAddress = "UNVERIFIED";
    let sgtMint: string | null = null;
    try {
      assertCampaignOpen(campaign);
      walletAddress = await verifyProof(db, config, raw, purpose, campaign.id);
      // Never take hasSGT, verified, or sgtMint from the request. Every claim re-reads mainnet.
      const sgt = await verifySgt(walletAddress);
      if (!sgt.hasSGT || !sgt.mintAddress)
        throw new ApiError(
          403,
          "NO_SGT",
          "No Seeker Genesis Token found in this wallet. Use your Seeker wallet.",
        );
      sgtMint = sgt.mintAddress;
      if (purpose === "verify") {
        return {
          hasSGT: true,
          mintAddress: sgtMint,
          walletAddress,
          devSgtBypass: config.bypass,
        };
      }
      try {
        const claim = await db.$transaction(async (tx) => {
          // Share-lock the campaign so an administrative close cannot interleave with the insert.
          // Concurrent claims still proceed together; the unique constraint is the final arbiter.
          await tx.$queryRaw`SELECT id FROM "Campaign" WHERE id = ${campaign.id} FOR SHARE`;
          const current = await tx.campaign.findUniqueOrThrow({
            where: { id: campaign.id },
          });
          assertCampaignOpen(current);
          const record = await tx.claim.create({
            data: {
              campaignId: campaign.id,
              walletAddress,
              sgtMint: sgt.mintAddress!,
              isDevBypass: config.bypass,
            },
          });
          await tx.claimAttempt.create({
            data: {
              campaignId: campaign.id,
              walletAddress,
              sgtMint,
              result: "SUCCESS",
              reason: "CLAIM_RECORDED",
              isDevBypass: config.bypass,
            },
          });
          return record;
        });
        return {
          success: true,
          claimId: claim.id,
          campaignId: claim.campaignId,
          walletAddress: claim.walletAddress,
          sgtMint: claim.sgtMint,
          claimedAt: claim.claimedAt,
          devSgtBypass: config.bypass,
        };
      } catch (error) {
        // Prisma 7's PostgreSQL adapter reports the index name in cause.constraint;
        // older clients expose meta.target. Match only this device/campaign constraint.
        const adapterConflict =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          z
            .object({
              modelName: z.literal("Claim"),
              driverAdapterError: z.object({
                cause: z.object({
                  kind: z.literal("UniqueConstraintViolation"),
                  constraint: z.object({
                    index: z.literal("Claim_campaignId_sgtMint_key"),
                  }),
                }),
              }),
            })
            .safeParse(error.meta).success;
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002" &&
          (adapterConflict ||
            (Array.isArray(error.meta?.target) &&
              error.meta.target.includes("campaignId") &&
              error.meta.target.includes("sgtMint")))
        ) {
          throw new ApiError(
            409,
            "ALREADY_CLAIMED",
            "This Seeker has already claimed this campaign.",
          );
        }
        throw error;
      }
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "SERVER_ERROR";
      // A unique-violation aborts its transaction. Write the blocked attempt AFTER rollback.
      // An unverified caller must not be able to forge another wallet's activity in the dashboard.
      await db.claimAttempt.create({
        data: {
          campaignId: campaign.id,
          walletAddress,
          sgtMint,
          result: attemptResult(code),
          reason: code,
          isDevBypass: config.bypass,
        },
      });
      throw error;
    }
  }

  app.post("/api/seeker/verify", async (req, res) => {
    const campaignId = req.query.campaignId;
    if (
      typeof campaignId !== "string" ||
      !campaignId ||
      campaignId.length > 100
    ) {
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "A campaignId query parameter is required.",
      );
    }
    res.json(await execute(req.body, campaignId, "verify"));
  });
  app.post("/api/campaigns/:id/claim", async (req, res) => {
    if (config.verifyOnlyMode)
      throw new ApiError(
        403,
        "VERIFY_ONLY_MODE",
        "Reward claims are disabled during SGT verification-only testing.",
      );
    if (!config.claimTestMode && !config.databaseClaimsEnabled)
      throw new ApiError(
        403,
        "DATABASE_CLAIMS_DISABLED",
        "Database claims are disabled.",
      );
    res.status(201).json(await execute(req.body, req.params.id, "claim"));
  });
  app.get("/api/campaigns/:id/stats", async (req, res) => {
    const campaign = await getCampaign(db, req.params.id);
    const where = { campaignId: campaign.id, isDevBypass: config.bypass };
    const [
      successfulClaims,
      duplicateAttempts,
      failedAttempts,
      recentAttempts,
    ] = await db.$transaction(
      [
        db.claim.count({ where }),
        db.claimAttempt.count({
          where: { ...where, result: "DUPLICATE_BLOCKED" },
        }),
        db.claimAttempt.count({
          where: {
            ...where,
            result: { notIn: ["SUCCESS", "DUPLICATE_BLOCKED"] },
          },
        }),
        db.claimAttempt.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 20,
        }),
      ],
      { isolationLevel: "RepeatableRead" },
    );
    res.json({
      successfulClaims,
      uniqueSGTs: successfulClaims,
      duplicateAttempts,
      failedAttempts,
      recentAttempts,
      devSgtBypass: config.bypass,
    });
  });
  app.use((_req, _res, next) =>
    next(new ApiError(404, "NOT_FOUND", "Endpoint not found.")),
  );
  const errorHandler: ErrorRequestHandler = (
    error: unknown,
    _req,
    res,
    _next,
  ) => {
    let normalized: ApiError;
    if (error instanceof ApiError) normalized = error;
    else if (error instanceof ZodError || error instanceof SyntaxError)
      normalized = new ApiError(
        400,
        "INVALID_REQUEST",
        "Please check the request and try again.",
      );
    else if (
      typeof error === "object" &&
      error &&
      "type" in error &&
      error.type === "entity.too.large"
    )
      normalized = new ApiError(
        413,
        "INVALID_REQUEST",
        "Request is too large.",
      );
    else
      normalized = new ApiError(
        500,
        "SERVER_ERROR",
        "Service unavailable. Please try again shortly.",
      );
    if (normalized.status >= 500)
      // Log only an error class, never adapter messages/causes that may contain
      // connection URLs, signed messages, signatures, or request bodies.
      console.error(
        "[FairClaim]",
        res.getHeader("X-Request-Id"),
        error instanceof Error ? error.name : "UnknownError",
      );
    res.status(normalized.status).json({
      success: false,
      code: normalized.code,
      message: normalized.message,
    });
  };
  app.use(errorHandler);
  return app;
}
