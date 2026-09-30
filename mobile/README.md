# FairClaim Mobile

Android app based on the official Solana Mobile expo-kit-wallet template.

Use the [project README](../README.md) for environment setup, API configuration, Android Development Build, and the real Seeker demo.

- `npm run typecheck` — strict TypeScript.
- `npm run android` — Expo Android Development Build; requires JDK, Android SDK and device.
- `npm run dev` — Metro for an installed Development Build.
- `npx expo export --platform android --output-dir dist` — JS/Hermes bundle validation.

Expo Go cannot be used for Mobile Wallet Adapter.

Never put an RPC key or wallet private key in this application.
