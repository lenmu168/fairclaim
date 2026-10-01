# FairClaim

**One Seeker. One Claim.**

FairClaim is Seeker-native verified claim infrastructure for fair, Sybil-resistant campaign access. It combines wallet message signing, server-side Seeker Genesis Token verification, and database uniqueness so one verified SGT can claim once per campaign.

> Built for the CLOCK IN — Solana Mobile Hackathon.

## Overview

FairClaim uses the Seeker Genesis Token (SGT) as a device-level identity primitive. A participant proves control of a wallet by signing a human-readable message. The server verifies that signature, checks Solana mainnet for a real SGT held by the signer, and binds eligibility to the SGT mint rather than only to the wallet address.

For each campaign, PostgreSQL enforces one claim for each verified SGT mint. The rule is **one verified SGT claim per campaign**. It is not a one-human-one-claim system, and it does not prevent the same SGT from participating in a different campaign.

## Problem

Wallet-address-only campaigns are easy to farm because one participant can create many wallets. A new address does not represent a new person, device, or scarce identity primitive, so address-based eligibility alone offers weak Sybil resistance.

## Solution

FairClaim moves the eligibility boundary from a wallet address to the Seeker Genesis Token:

- the wallet proves control through message signing;
- the server verifies the signed bytes and a one-time challenge;
- the server reads Solana mainnet to confirm ownership of an authentic Token-2022 SGT;
- the SGT mint becomes the campaign eligibility key; and
- a database constraint prevents the same SGT from claiming twice in the same campaign, even if wallet state or client UI is manipulated.

## Seeker Genesis Access

The production campaign is **Seeker Genesis Access**.

| Property | Value |
| --- | --- |
| Eligibility | Verified Seeker Genesis Token required |
| Network | Solana Mainnet |
| Claim rule | One claim per SGT per campaign |
| Record type | Database-only claim record |

The campaign records verified access in FairClaim's database. It does not issue SOL, tokens, NFTs, or any other on-chain asset.

## How It Works

1. Connect a compatible Solana wallet on Android.
2. Preview the exact identity message supplied by the server.
3. Sign the message only.
4. The server verifies the signature and canonical message bytes.
5. The server verifies the wallet's real SGT on Solana mainnet.
6. Eligibility is tied to the unique SGT mint.
7. The user previews and signs a purpose-bound authorization for one database-only campaign claim.
8. `UNIQUE(campaignId, sgtMint)` prevents duplicate claims.

## Wallet Fund Safety

Wallet fund safety is a core FairClaim invariant. The current verification and database-claim flow has no asset-transfer capability:

- no transaction construction;
- no `signTransaction`;
- no `signAndSendTransaction`;
- no SOL transfer;
- no SPL token transfer;
- no token approval;
- no delegate assignment;
- no authority change; and
- no network fee for the FairClaim database claim.

FairClaim uses message signing for authentication and purpose-bound claim authorization. Wallet signatures are verified on the server. Helius RPC credentials and PostgreSQL credentials remain server-side and are never exposed through `EXPO_PUBLIC_*` configuration.

The repository includes a static Wallet Fund Safety scanner and self-test that fail when forbidden wallet transaction APIs or secret-handling patterns enter protected runtime source.

## Sybil Protection

FairClaim's duplicate boundary is the pair:

```text
campaignId + sgtMint
```

Changing wallets does not create another claim right for the same SGT. The server re-verifies the current wallet, current signature, current campaign authorization, and current SGT ownership before attempting the database claim. PostgreSQL then enforces the unique pair atomically.

## Architecture

```text
┌──────────────────────────────────────┐
│ Expo / React Native Android client   │
│ Mobile Wallet Adapter + message sign │
└──────────────────┬───────────────────┘
                   │ HTTPS
                   ▼
┌──────────────────────────────────────┐
│ Express / TypeScript API             │
│ nonce + Ed25519 + canonical bytes    │
├──────────────────┬───────────────────┤
│ read-only Solana │ Prisma transaction│
│ mainnet RPC      │ + PostgreSQL      │
└──────────────────┴───────────────────┘
```

### Mobile

- Expo, React Native, and TypeScript
- Solana Mobile Wallet Adapter
- Seeker and Seed Vault-compatible wallet flow
- exact pre-sign message preview
- fail-closed wallet-session and wallet-mismatch handling

### Server

- Node.js, TypeScript, and Express
- Prisma and PostgreSQL
- Ed25519 signature verification
- Solana Mainnet read-only RPC
- Token-2022 SGT validation
- atomic claim and attempt recording

### Production

- EAS Production Android build
- Railway API and PostgreSQL
- HTTPS production endpoint

## Security Model

- **Server-generated challenges:** the client cannot choose its own nonce or signed statement.
- **Expiration:** challenges have a short validity window.
- **One-time use:** nonce consumption is atomic and replay attempts fail closed.
- **Canonical bytes:** the exact UTF-8 bytes previewed by the client are the bytes passed to message signing and verified by the server.
- **Ed25519 verification:** the server verifies that the signature matches the claimed wallet and canonical message.
- **Purpose and campaign binding:** verification and claim authorizations cannot be substituted for one another or replayed across campaigns.
- **Server-side SGT verification:** the server checks mainnet ownership and authentic Token-2022 SGT properties; it does not trust client eligibility claims.
- **Wallet-session mismatch protection:** switching, disconnecting, stale hook state, and account mismatch disable protected actions.
- **Database uniqueness:** `UNIQUE(campaignId, sgtMint)` is the final duplicate-claim boundary.

See [Security Design](docs/security.md) and [Wallet Fund Safety](docs/wallet-fund-safety.md) for the implementation boundaries and threat model.

## Hackathon Audit Clarification

The CLOCK IN advisory security audit was run against commit `59c8c26`. It should be read together with the runtime boundaries documented in this repository.

### Production transport

The audit flagged `http://10.0.2.2:3000` in `mobile/src/lib/api.ts` as a possible hardcoded HTTP endpoint. That address is an Android-emulator development fallback used only when `__DEV__` is true.

Production builds do not fall back to that endpoint. In non-development builds, FairClaim requires `EXPO_PUBLIC_API_URL` to be configured and fails closed unless the URL begins with `https://`.

The production FairClaim API is:

**<https://fairclaim-api-production.up.railway.app>**

### Dependency findings

The advisory audit also reported vulnerabilities in transitive dependencies present in the committed lockfiles, including packages pulled through Prisma and the Expo / React Native toolchain. These findings are tracked as dependency-supply-chain issues and should not be interpreted as evidence that FairClaim's production claim flow uses MySQL, constructs wallet transactions, or sends assets.

This note provides scope and runtime context only. It does **not** claim that the reported dependency advisories have been remediated. Dependency updates should be validated against the production Android build and the existing safety/test suite before release.

## Builder Dashboard

The in-app Builder view presents campaign operations without exposing server credentials:

- **Unique Claims** — successfully recorded SGT claim rights;
- **Duplicates Blocked** — authenticated duplicate attempts rejected by the unique claim rule;
- **Verification Failures** — negative-path and service-error verification outcomes;
- **Recent Claim Attempts** — recent campaign result and timestamp data; and
- **Sybil Protection** — the active SGT and database-constraint status.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Mobile | Expo 57, React Native 0.86, TypeScript, Expo Router |
| Wallet | Solana Mobile Wallet Adapter, Wallet UI |
| Solana | `@solana/kit`, Token-2022 client libraries |
| API | Node.js, Express, TypeScript, Zod |
| Data | PostgreSQL, Prisma |
| Production | EAS Build, Railway |
| Validation | Vitest, isolated PostgreSQL integration tests, Wallet Fund Safety scanner |

## Repository Structure

```text
FairClaim/
├── mobile/                   # Expo / React Native Android application
│   ├── src/app/              # Claim and Builder screens
│   ├── src/components/       # FairClaim presentation components
│   ├── src/lib/              # API, wallet-session, SIWS, preview helpers
│   └── assets/               # Production brand and design assets
├── server/                   # Express API and PostgreSQL data layer
│   ├── src/                  # Auth, SGT verification, routes, configuration
│   ├── prisma/               # Schema, migration, development and production seed
│   ├── scripts/              # Safe checks and local test infrastructure
│   └── tests/                # API, signature, SGT, replay, and claim tests
├── scripts/                  # Repository setup and fund-safety scanner
├── docs/                     # Security and validation documentation
└── .github/workflows/ci.yml  # Static checks and isolated integration tests
```

## Local Development

Requirements:

- Node.js 22.12 or newer
- npm
- PostgreSQL, or Docker Desktop for the included local service
- Android Studio and a development build for device testing

Install dependencies:

```powershell
npm --prefix server ci
npm --prefix mobile ci
```

Create local configuration only from the committed examples:

```powershell
Copy-Item .env.example .env
Copy-Item server/.env.example server/.env
Copy-Item mobile/.env.example mobile/.env
```

Replace placeholders locally. Never commit `.env` files, database URLs, RPC API keys, signing credentials, or access tokens. The Helius URL belongs only in `server/.env` or the server deployment environment; it must never be placed in `mobile/.env` or an `EXPO_PUBLIC_*` variable.

Start PostgreSQL with Docker and initialize the development schema:

```powershell
docker compose up -d
npm run db:migrate
npm run db:seed
```

Run the API and mobile development server in separate terminals:

```powershell
npm run server
npm run mobile
```

Run the safe validation suite:

```powershell
npm run typecheck
npm run test:mobile-siws
npm --prefix server test
npm run security:wallet-funds
npm run security:wallet-funds:self-test
```

Server integration tests use an isolated database whose name must end in `_test`. Do not point `TEST_DATABASE_URL` at a development or production database.

## Production

The public API is deployed at:

**<https://fairclaim-api-production.up.railway.app>**

Safe public read endpoints:

```text
GET /health
GET /api/campaigns/seeker-genesis-access
```

Production schema and Genesis-only campaign bootstrap commands are:

```powershell
npm run db:migrate
npm run db:seed:production
```

`db:seed:production` is idempotent and fails closed if an existing Genesis campaign differs from the expected production definition. It does not create claims, claim attempts, nonces, or the historical development campaign.

Production secrets are configured in the server environment. Public mobile configuration contains only the API and SIWS origins.

## Hackathon

FairClaim was built for the **CLOCK IN — Solana Mobile Hackathon** and designed for Solana Mobile and Seeker.

Its central product statement is simple:

> **One Seeker. One Claim.**  
> One verified SGT claim per campaign.

## Safety Notice

FairClaim never asks users to approve token spending or transfer assets as part of its verification and database-claim flow. Users review and sign human-readable messages; the current product does not construct or request a blockchain transaction.
