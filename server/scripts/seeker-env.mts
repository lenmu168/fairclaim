import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

export const root = fileURLToPath(new URL("../../", import.meta.url));
export const publicKeys = ["EXPO_PUBLIC_API_URL", "EXPO_PUBLIC_SIWS_DOMAIN", "EXPO_PUBLIC_SIWS_URI"];
export const readEnv = (path: string): Record<string, string> =>
  existsSync(path) ? parse(readFileSync(path)) : {};

export function deviceOrigin(value: string | undefined) {
  if (!value) throw new Error("API URL missing");
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password ||
      url.search || url.hash || url.pathname !== "/") throw new Error("Use an HTTP(S) origin without path, credentials or query");
  if (/^(localhost|127\..*|0\.0\.0\.0|\[::1\]|10\.0\.2\.2)$/i.test(url.hostname) ||
      /(^|\.)(localhost|example\.(com|org|net)|invalid|test)$/.test(url.hostname) ||
      /YOUR-ACTUAL/i.test(url.hostname)) throw new Error("Replace emulator/placeholder URL with actual tunnel or LAN address");
  return url.origin;
}

export function mobileEnv() {
  const dir = resolve(root, "mobile");
  // Same development-mode precedence as Expo; shell variables override files.
  const effective: Record<string, string | undefined> = {};
  for (const name of [".env", ".env.development", ".env.local", ".env.development.local"])
    Object.assign(effective, readEnv(resolve(dir, name)));
  for (const [key, value] of Object.entries(process.env))
    if (key.startsWith("EXPO_PUBLIC_")) effective[key] = value;
  const sources = readdirSync(dir).filter(n => n === ".env" || n.startsWith(".env."))
    .map(n => ({ name: n, values: readEnv(resolve(dir, n)) }));
  sources.push({ name: "shell public variables", values: Object.fromEntries(
    Object.entries(process.env).filter(([k, v]) => k.startsWith("EXPO_PUBLIC_") && v !== undefined),
  ) as Record<string, string> });
  return { effective, sources };
}

export function unsafeMobileKeys(values: Record<string, string | undefined>, server: NodeJS.ProcessEnv) {
  return Object.entries(values).filter(([key, value]) => {
    if (!publicKeys.includes(key) && /SECRET|PRIVATE|PASSWORD|DATABASE|RPC|TOKEN|KEY|^EXPO_PUBLIC_/i.test(key)) return true;
    if (!value) return false;
    // Catch credentials hidden under an otherwise allowed public variable name.
    if (/postgres(?:ql)?:\/\/|-----BEGIN .*PRIVATE KEY-----/i.test(value)) return true;
    if (/^[a-z]+:\/\//i.test(value)) {
      try { const url = new URL(value); if (url.username || url.password || url.search || url.hash) return true; } catch { return true; }
    }
    return [server.DATABASE_URL, server.SOLANA_MAINNET_RPC_URL].some(secret => secret && value.includes(secret));
  }).map(([key]) => key);
}

export function siwsMatches(server: NodeJS.ProcessEnv, mobile: Record<string, string | undefined>) {
  try {
    const origin = deviceOrigin(mobile.EXPO_PUBLIC_API_URL);
    return server.SIWS_DOMAIN === mobile.EXPO_PUBLIC_SIWS_DOMAIN &&
      server.SIWS_URI === mobile.EXPO_PUBLIC_SIWS_URI &&
      server.SIWS_URI === origin && new URL(origin).host === server.SIWS_DOMAIN;
  } catch { return false; }
}
