import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().startsWith("postgresql://"),
  SOLANA_MAINNET_RPC_URL: z.string().min(1).pipe(z.url()),
  SIWS_DOMAIN: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z0-9.-]+(?::[0-9]+)?$/),
  SIWS_URI: z.url(),
  CORS_ORIGINS: z.string().default(""),
  DEV_SGT_BYPASS: z.enum(["true", "false"]).default("false"),
  SGT_VERIFY_ONLY_MODE: z.enum(["true", "false"]).default("false"),
  CLAIM_TEST_MODE: z.enum(["true", "false"]).default("false"),
  DATABASE_CLAIMS_ENABLED: z.enum(["true", "false"]).default("false"),
});

export function readConfig(env: NodeJS.ProcessEnv) {
  const value = envSchema.parse(env);
  const uri = new URL(value.SIWS_URI);
  const rpcUri = new URL(value.SOLANA_MAINNET_RPC_URL);
  if (uri.host !== value.SIWS_DOMAIN)
    throw new Error("SIWS_DOMAIN must exactly match SIWS_URI host.");
  if (rpcUri.username || rpcUri.password || rpcUri.hash)
    throw new Error(
      "SOLANA_MAINNET_RPC_URL must not contain URL credentials or a fragment.",
    );
  if (rpcUri.hostname === "mainnet.helius-rpc.com") {
    const heliusKey = rpcUri.searchParams.get("api-key")?.trim();
    if (!heliusKey || /^(?:server_secret|your_|replace_|<)/i.test(heliusKey))
      throw new Error(
        "The server-only Helius RPC URL requires a real api-key query parameter.",
      );
  }
  const bypass =
    value.NODE_ENV !== "production" && value.DEV_SGT_BYPASS === "true";
  const verifyOnlyMode =
    value.NODE_ENV !== "production" && value.SGT_VERIFY_ONLY_MODE === "true";
  const claimTestMode =
    value.NODE_ENV !== "production" && value.CLAIM_TEST_MODE === "true";
  const databaseClaimsEnabled = value.DATABASE_CLAIMS_ENABLED === "true";
  if (value.SGT_VERIFY_ONLY_MODE === "true" && value.CLAIM_TEST_MODE === "true")
    throw new Error(
      "SGT_VERIFY_ONLY_MODE and CLAIM_TEST_MODE cannot both be enabled.",
    );
  if (claimTestMode && bypass)
    throw new Error("CLAIM_TEST_MODE requires DEV_SGT_BYPASS=false.");
  if (databaseClaimsEnabled && bypass)
    throw new Error("DATABASE_CLAIMS_ENABLED requires DEV_SGT_BYPASS=false.");
  if (databaseClaimsEnabled && (verifyOnlyMode || claimTestMode))
    throw new Error(
      "DATABASE_CLAIMS_ENABLED cannot be combined with a development Claim mode.",
    );
  if (value.NODE_ENV === "production") {
    if (value.DEV_SGT_BYPASS === "true")
      throw new Error("DEV_SGT_BYPASS is forbidden in production.");
    if (value.SGT_VERIFY_ONLY_MODE === "true")
      throw new Error("SGT_VERIFY_ONLY_MODE is forbidden in production.");
    if (value.CLAIM_TEST_MODE === "true")
      throw new Error("CLAIM_TEST_MODE is forbidden in production.");
    if (
      uri.protocol !== "https:" ||
      !value.SOLANA_MAINNET_RPC_URL.startsWith("https:")
    ) {
      throw new Error("Production requires HTTPS for SIWS and RPC.");
    }
  }
  return {
    ...value,
    bypass,
    verifyOnlyMode,
    claimTestMode,
    databaseClaimsEnabled,
    rpcHostname: rpcUri.hostname,
  };
}
export type Config = ReturnType<typeof readConfig>;
