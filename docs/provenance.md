# Official tooling and implementation provenance

Date: 2026-09-04.

Requested commands were executed:

```text
npx solana-mobile@latest doctor
npx -y skills add solana-mobile/solana-mobile-dev-skill --all
npx solana-mobile@latest create mobile --template expo-kit-wallet
```

Doctor detected Node 24.18, but no JDK, Android SDK, adb or emulator. Its package-manager check reported none despite npm 11.16 being executable. This is recorded as a diagnostic discrepancy, not as evidence that npm is missing.

The official skill repository redirects from `solana-mobile-dev-skill` to `solana-mobile-skills`. Git clone failed with timeout/empty reply, and the CLI's fetch of the template catalog failed even with IPv4 first. Official GitHub codeload ZIPs were accessible through PowerShell, so these exact repositories were downloaded:

- https://github.com/solana-mobile/solana-mobile-skills
- https://github.com/solana-mobile/templates (mobile/expo-kit-wallet)

The skills installer then successfully installed all five skills from the downloaded repository into `.agents/skills`. The official `expo-kit-wallet` directory was copied into `mobile` as the scaffold fallback; no claim is made that the CLI completed successfully. Source archives remain locally in ignored `.setup`. Application code was then replaced with FairClaim; crypto polyfill, Expo entry, native dependencies and Android build approach follow the official template.

Skills read and applied: `solana-mobile`, `solana-mobile-wallet` and its `references/kit.md`, `seeker-genesis-token` and its `references/sgt-verification.md`. `seeker-domains` was read; domain lookup is intentionally not part of this minimal claim flow. No fabricated .skr names are displayed.

SGT reference's legacy SPL-token decoding was ported to the official `@solana-program/token-2022` Kit decoders, retaining all constant comparisons and actual positive ownership checks. Server and mobile package versions are pinned reproducibly by their respective package-lock.json files.

Primary references:

- [Official mobile Skills](https://github.com/solana-mobile/solana-mobile-skills)
- [Official templates](https://github.com/solana-mobile/templates)
- [SGT guide](https://docs.solanamobile.com/marketing/engaging-seeker-users)
- [Prisma PostgreSQL adapter](https://docs.prisma.io/docs/orm/core-concepts/supported-databases/postgresql)
- [Embedded PostgreSQL development runner](https://github.com/leinelissen/embedded-postgres)
