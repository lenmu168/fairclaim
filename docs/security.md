# Security design

## P0 — Wallet Fund Safety

FairClaim V1 must never request a transaction or gain authority over user assets. Only SIWS/sign-message authentication is allowed. The mandatory static gate, audit result, secret-field restrictions and future on-chain reward boundary are documented in [Wallet Fund Safety](wallet-fund-safety.md). Run `npm run security:wallet-funds`; it is also the first step of `npm test` and CI.

## Trust chain

```mermaid
sequenceDiagram
  participant M as Seeker App
  participant W as Seed Vault Wallet
  participant S as FairClaim Server
  participant R as Solana Mainnet RPC
  participant D as PostgreSQL
  M->>S: Request challenge (address, purpose, campaign)
  S->>D: Store full SIWS payload and 5 minute nonce
  S-->>M: Full pinned payload
  M->>W: MWA signIn(payload)
  W-->>M: Signed message + signature
  M->>S: address, nonce, signature, signedMessage
  S->>S: Derive key from signed address; verifySignIn
  S->>D: Atomic conditional nonce consumption
  S->>R: Mainnet genesis + current Token-2022 holdings
  S->>R: Validate mint properties, refresh ownership
  S->>D: Transaction: insert Claim + SUCCESS
  D-->>S: Commit or composite unique violation
  S-->>M: Receipt or ALREADY_CLAIMED
```

## Nonce and SIWS

128-bit CSPRNG nonce, database unique key, five-minute expiry. Store the entire issued payload, including address, action and campaign. The input address is untrusted until the signature is verified against the key derived from that exact address. Never accept a separate public key from the client. Official `verifySignIn` compares stored fields to the signed message and verifies Ed25519.

After a valid signature, `UPDATE ... WHERE usedAt IS NULL AND expiresAt > now` must affect exactly one row. Read-then-write without this condition is not safe. Authentication finishes only after the conditional update succeeds. Once consumed, downstream errors require a fresh challenge; the UI does this on each action.

Two identical signed requests must yield one authenticated execution and one `NONCE_USED`. Two independent valid challenges for the same device/campaign must yield one Claim and one `ALREADY_CLAIMED`. These are distinct security tests.

## SGT checks

Check mainnet genesis. Enumerate actual Token-2022 token accounts, decode raw bytes with official Kit codecs, require internal owner to equal the authenticated address and amount > 0. Both Initialized and Frozen states are acceptable. Check the owning program of each mint, the mint authority, metadata pointer authority/address, and token group member group using the official SGT constants. Require the group member's mint to match the mint being examined.

Batch mint reads at 100. Preserve minContextSlot from holdings reads and re-read the token account after mint validation. Treat provider failures as 503 RPC_ERROR. The standard RPC adapter has no pagination and bounds token-account counts; exceptionally large wallets need a future paginated provider adapter. Do not silently return partial results.

## Claim persistence

`UNIQUE(campaignId, sgtMint)` is in the migration and Prisma schema. Claim code inserts first; there is no SELECT-before-INSERT duplicate check. Successful Claim and SUCCESS attempt commit together. Campaign status/time is checked before authentication and again in the database transaction after a campaign share lock. A composite P2002 is mapped to 409; unrelated database errors are not silently treated as duplicates.

The failed transaction must finish rolling back before recording DUPLICATE_BLOCKED in a new transaction. A failure before authentication logs `UNVERIFIED`, never the attacker-supplied wallet address. Stats aggregate claims and attempts in a consistent database snapshot and use the same development/real-data scope.

## Limits

- One device is not one human. Multiple Seeker devices mean multiple eligible identities.
- SGTs can migrate or be revoked. Every claim rechecks current holdings; a previous verification is not an authorization token.
- Solana reads and SQL commits are not one cross-system transaction. A narrow timing window remains around ownership changes. SGT official authorities and the configured RPC provider are trusted.
- No on-chain payout occurs. The Claim is the demo points entitlement; a future payout system needs an idempotent ledger/outbox design before sending value.
- Rate limits are per-process. Add a shared store/reverse-proxy limits for multi-instance deployments; do not enable arbitrary Express trust proxy.
- Public stats expose verified public wallet/mint identifiers; do not put private metadata in attempts. Decide retention before production.
- Dev bypass generates visibly fake `DEV_ONLY_` identity and requires explicit non-production opt-in. It is never acceptable proof of real Seeker ownership.
