import { describe, expect, it, vi } from "vitest";
import { address, getBase58Decoder } from "@solana/kit";
import {
  AccountState,
  getMintEncoder,
  getTokenEncoder,
  TOKEN_2022_PROGRAM_ADDRESS,
  type MintArgs,
  type TokenArgs,
} from "@solana-program/token-2022";
import {
  createDevVerifier,
  createSgtVerifier,
  isSgtMint,
  MAINNET_GENESIS_HASH,
  SGT_GROUP_MINT_ADDRESS,
  SGT_METADATA_ADDRESS,
  SGT_MINT_AUTHORITY,
  type ChainAccount,
  type SgtRpc,
} from "../src/sgt.js";
import { readConfig } from "../src/config.js";

const key = (n: number) =>
  address(getBase58Decoder().decode(new Uint8Array(32).fill(n)));
const wallet = key(3),
  mintKey = key(4),
  tokenKey = key(5);
const mintArgs: MintArgs = {
  mintAuthority: address(SGT_MINT_AUTHORITY),
  supply: 1n,
  decimals: 0,
  isInitialized: true,
  freezeAuthority: address(SGT_MINT_AUTHORITY),
  extensions: [
    {
      __kind: "MetadataPointer",
      authority: address(SGT_MINT_AUTHORITY),
      metadataAddress: address(SGT_METADATA_ADDRESS),
    },
    {
      __kind: "TokenGroupMember",
      group: address(SGT_GROUP_MINT_ADDRESS),
      mint: mintKey,
      memberNumber: 1n,
    },
  ],
};
const tokenArgs: TokenArgs = {
  mint: mintKey,
  owner: wallet,
  amount: 1n,
  state: AccountState.Frozen,
  delegate: null,
  isNative: null,
  delegatedAmount: 0n,
  closeAuthority: null,
  extensions: null,
};
const mint = (overrides: Partial<MintArgs> = {}): ChainAccount => ({
  address: mintKey,
  owner: TOKEN_2022_PROGRAM_ADDRESS,
  data: new Uint8Array(getMintEncoder().encode({ ...mintArgs, ...overrides })),
});
const token = (overrides: Partial<TokenArgs> = {}): ChainAccount => ({
  address: tokenKey,
  owner: TOKEN_2022_PROGRAM_ADDRESS,
  data: new Uint8Array(
    getTokenEncoder().encode({ ...tokenArgs, ...overrides }),
  ),
});
function rpc(
  held: ChainAccount[] = [token()],
  minted: ChainAccount | null = mint(),
  refreshed: ChainAccount | null = token(),
): SgtRpc {
  return {
    genesisHash: vi.fn(async () => MAINNET_GENESIS_HASH),
    tokenAccounts: vi.fn(async () => ({ slot: 10n, accounts: held })),
    accounts: vi.fn(async (keys: string[]) => ({
      slot: 11n,
      accounts: keys.map((key) => (key === mintKey ? minted : refreshed)),
    })),
  };
}
describe("official SGT properties using real Token-2022 binary codecs", () => {
  it("accepts an authentic mint and frozen nonzero token holding", async () => {
    expect(isSgtMint(mint())).toBe(true);
    expect(await createSgtVerifier(rpc())(wallet)).toEqual({
      hasSGT: true,
      mintAddress: mintKey,
    });
  });
  it("accepts an initialized non-frozen positive holding too", async () => {
    expect(
      (
        await createSgtVerifier(
          rpc([token({ state: AccountState.Initialized })]),
        )(wallet)
      ).hasSGT,
    ).toBe(true);
  });
  it("excludes zero balance residue before checking mints", async () => {
    const source = rpc([token({ amount: 0n })]);
    expect((await createSgtVerifier(source)(wallet)).hasSGT).toBe(false);
    expect(source.accounts).not.toHaveBeenCalled();
  });
  it("excludes uninitialized token accounts", async () => {
    expect(
      (
        await createSgtVerifier(
          rpc([token({ state: AccountState.Uninitialized })]),
        )(wallet)
      ).hasSGT,
    ).toBe(false);
  });
  it("excludes token accounts belonging to another wallet", async () => {
    expect(
      (await createSgtVerifier(rpc([token({ owner: key(9) })]))(wallet)).hasSGT,
    ).toBe(false);
  });
  it("rejects legacy token program mint ownership", () => {
    expect(isSgtMint({ ...mint(), owner: key(9) })).toBe(false);
  });
  it("rejects the wrong mint authority", () => {
    expect(isSgtMint(mint({ mintAuthority: key(9) }))).toBe(false);
  });
  it("rejects missing Token-2022 extensions", () => {
    expect(isSgtMint(mint({ extensions: null }))).toBe(false);
  });
  it.each(["authority", "metadataAddress"] as const)(
    "rejects wrong metadata %s",
    (field) => {
      expect(
        isSgtMint(
          mint({
            extensions: [
              {
                __kind: "MetadataPointer",
                authority: address(SGT_MINT_AUTHORITY),
                metadataAddress: address(SGT_METADATA_ADDRESS),
                [field]: key(9),
              },
              {
                __kind: "TokenGroupMember",
                group: address(SGT_GROUP_MINT_ADDRESS),
                mint: mintKey,
                memberNumber: 1n,
              },
            ],
          }),
        ),
      ).toBe(false);
    },
  );
  it("rejects the wrong token group", () => {
    expect(
      isSgtMint(
        mint({
          extensions: [
            {
              __kind: "MetadataPointer",
              authority: address(SGT_MINT_AUTHORITY),
              metadataAddress: address(SGT_METADATA_ADDRESS),
            },
            {
              __kind: "TokenGroupMember",
              group: key(9),
              mint: mintKey,
              memberNumber: 1n,
            },
          ],
        }),
      ),
    ).toBe(false);
  });
  it("rejects nonexistent or unreadable mint accounts", async () => {
    expect(isSgtMint(null)).toBe(false);
    expect(isSgtMint({ ...mint(), data: new Uint8Array([0]) })).toBe(false);
    expect((await createSgtVerifier(rpc([token()], null))(wallet)).hasSGT).toBe(
      false,
    );
  });
  it("rechecks current ownership after mint verification", async () => {
    expect(
      (
        await createSgtVerifier(rpc([token()], mint(), token({ amount: 0n })))(
          wallet,
        )
      ).hasSGT,
    ).toBe(false);
    expect(
      (await createSgtVerifier(rpc([token()], mint(), null))(wallet)).hasSGT,
    ).toBe(false);
  });
  it("rejects an RPC configured for the wrong chain", async () => {
    const source = rpc();
    source.genesisHash = async () => "devnet";
    await expect(createSgtVerifier(source)(wallet)).rejects.toMatchObject({
      code: "WRONG_NETWORK",
    });
  });
  it("propagates RPC outages and malformed responses as RPC_ERROR", async () => {
    const source = rpc();
    source.tokenAccounts = async () => {
      throw new Error("timeout");
    };
    await expect(createSgtVerifier(source)(wallet)).rejects.toMatchObject({
      code: "RPC_ERROR",
    });
  });
  it("reports the exact safe failing step without exposing provider credentials", async () => {
    const source = rpc();
    source.tokenAccounts = async () => {
      throw Object.assign(
        new Error(
          "HTTP error (403): https://rpc.example.com/path?api-key=super-secret",
        ),
        { code: 403, status: 403 },
      );
    };
    const onStep = vi.fn();
    const onDiagnostic = vi.fn();
    await expect(
      createSgtVerifier(source, {
        providerHostname: "rpc.example.com",
        onStep,
        onDiagnostic,
      })(wallet),
    ).rejects.toMatchObject({ code: "RPC_ERROR" });
    expect(onStep).toHaveBeenCalledWith({
      step: "sgt-rpc:mainnet-check",
      operation: "getGenesisHash",
      status: "PASS",
    });
    expect(onDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        step: "sgt-rpc:get-token-accounts",
        operation: "getTokenAccountsByOwner",
        provider: "rpc.example.com",
        wallet: expect.stringMatching(/^.{4}\.\.\..{4}$/),
        httpRpcStatus: 403,
        cause: expect.objectContaining({ code: 403 }),
      }),
    );
    const serialized = JSON.stringify(onDiagnostic.mock.calls[0]![0]);
    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toContain("api-key=");
  });
  it("reports every completed read-only stage for an empty wallet", async () => {
    const source = rpc([]);
    const onStep = vi.fn();
    await expect(
      createSgtVerifier(source, { onStep })(wallet),
    ).resolves.toEqual({ hasSGT: false, mintAddress: null });
    expect(onStep.mock.calls.map(([event]) => event.step)).toEqual([
      "sgt-rpc:mainnet-check",
      "sgt-rpc:get-token-accounts",
      "sgt-parse:token-accounts",
    ]);
  });
});
describe("development mode cannot become production identity", () => {
  const env = {
    DATABASE_URL: "postgresql://localhost/fairclaim",
    SOLANA_MAINNET_RPC_URL: "https://rpc.example.com",
    SIWS_DOMAIN: "fairclaim.example",
    SIWS_URI: "https://fairclaim.example",
  };
  it("is disabled by default", () => {
    expect(readConfig(env)).toMatchObject({
      bypass: false,
      verifyOnlyMode: false,
      claimTestMode: false,
      databaseClaimsEnabled: false,
    });
  });
  it("requires explicit non-production opt-in", async () => {
    expect(() => createDevVerifier("development", false)).toThrow();
    expect(() => createDevVerifier("production", true)).toThrow();
    expect(
      (await createDevVerifier("development", true)(wallet)).mintAddress,
    ).toMatch(/^DEV_ONLY_/);
  });
  it("refuses production startup with bypass enabled", () => {
    expect(() =>
      readConfig({ ...env, NODE_ENV: "production", DEV_SGT_BYPASS: "true" }),
    ).toThrow("forbidden");
  });
  it("refuses production startup with verify-only mode enabled", () => {
    expect(() =>
      readConfig({
        ...env,
        NODE_ENV: "production",
        SGT_VERIFY_ONLY_MODE: "true",
      }),
    ).toThrow("SGT_VERIFY_ONLY_MODE");
  });
  it("refuses production startup with database Claim test mode enabled", () => {
    expect(() =>
      readConfig({
        ...env,
        NODE_ENV: "production",
        CLAIM_TEST_MODE: "true",
      }),
    ).toThrow("CLAIM_TEST_MODE");
  });
  it("allows an explicit production database-claim gate without enabling development modes", () => {
    expect(
      readConfig({
        ...env,
        NODE_ENV: "production",
        DATABASE_CLAIMS_ENABLED: "true",
      }),
    ).toMatchObject({
      bypass: false,
      verifyOnlyMode: false,
      claimTestMode: false,
      databaseClaimsEnabled: true,
    });
  });
  it("rejects the production database-claim gate with bypass or a development Claim mode", () => {
    expect(() =>
      readConfig({
        ...env,
        DEV_SGT_BYPASS: "true",
        DATABASE_CLAIMS_ENABLED: "true",
      }),
    ).toThrow("DEV_SGT_BYPASS=false");
    expect(() =>
      readConfig({
        ...env,
        CLAIM_TEST_MODE: "true",
        DATABASE_CLAIMS_ENABLED: "true",
      }),
    ).toThrow("cannot be combined");
  });
  it("refuses startup when both development test modes are enabled", () => {
    expect(() =>
      readConfig({
        ...env,
        SGT_VERIFY_ONLY_MODE: "true",
        CLAIM_TEST_MODE: "true",
      }),
    ).toThrow("cannot both be enabled");
  });
  it("requires real SGT verification in database Claim test mode", () => {
    expect(() =>
      readConfig({
        ...env,
        DEV_SGT_BYPASS: "true",
        CLAIM_TEST_MODE: "true",
      }),
    ).toThrow("DEV_SGT_BYPASS=false");
  });
  it("requires matching SIWS domain and URI", () => {
    expect(() =>
      readConfig({ ...env, SIWS_DOMAIN: "another.example" }),
    ).toThrow("match");
  });
  it("accepts a server-only Helius endpoint and exposes only its hostname", () => {
    const result = readConfig({
      ...env,
      SOLANA_MAINNET_RPC_URL:
        "https://mainnet.helius-rpc.com/?api-key=fake-test-key-never-used",
    });
    expect(result.rpcHostname).toBe("mainnet.helius-rpc.com");
  });
  it.each([
    undefined,
    "",
    "https://mainnet.helius-rpc.com/",
    "https://mainnet.helius-rpc.com/?api-key=YOUR_SERVER_ONLY_HELIUS_API_KEY",
  ])(
    "rejects missing or placeholder Helius RPC configuration: %s",
    (rpcUrl) => {
      expect(() =>
        readConfig({ ...env, SOLANA_MAINNET_RPC_URL: rpcUrl }),
      ).toThrow();
    },
  );
  it("rejects URL credentials and fragments", () => {
    expect(() =>
      readConfig({
        ...env,
        SOLANA_MAINNET_RPC_URL: "https://user:password@rpc.example.com/#secret",
      }),
    ).toThrow("credentials");
  });
});
