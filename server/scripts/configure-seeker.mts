import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { deviceOrigin, root } from "./seeker-env.mjs";

// Preparation helper only: preserves secrets and unrelated environment entries.
try {
  const input = process.argv[2];
  if (input === "--project-id") {
    const id = process.argv[3] ?? "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
      throw new Error("Supply the real project UUID shown by Expo, not a project name.");
    const path = resolve(root, "mobile/app.json");
    const app = JSON.parse(readFileSync(path, "utf8"));
    const previous = app.expo.extra?.eas?.projectId;
    if (previous && previous !== id) throw new Error("Existing project ID differs; refusing to replace it.");
    app.expo.extra = { ...app.expo.extra, eas: { ...app.expo.extra?.eas, projectId: id } };
    writeFileSync(path, JSON.stringify(app, null, 2) + "\n");
    console.info("Real EAS project ID saved. app.config.ts preserves app.json extra.");
  } else {
    const origin = deviceOrigin(input);
    const domain = new URL(origin).host;
    const targets = [
      { path: resolve(root, "server/.env"), values: { SIWS_DOMAIN: domain, SIWS_URI: origin, DEV_SGT_BYPASS: "false", NODE_ENV: "development" } },
      { path: resolve(root, "mobile/.env"), values: { EXPO_PUBLIC_API_URL: origin, EXPO_PUBLIC_SIWS_DOMAIN: domain, EXPO_PUBLIC_SIWS_URI: origin } },
    ];
    // Read both before writing, so a missing file cannot leave a partial configuration.
    const changes = targets.map(({ path, values }) => {
      let content = readFileSync(path, "utf8");
      for (const [key, value] of Object.entries(values)) {
        const pattern = new RegExp(`^(?:export\\s+)?${key}\\s*=.*$`, "gm");
        content = pattern.test(content) ? content.replace(pattern, `${key}=${value}`) : `${content.trimEnd()}\n${key}=${value}\n`;
      }
      return { path, content };
    });
    for (const { path, content } of changes) writeFileSync(path, content);
    console.info("API and SIWS configured; bypass OFF. Restart server and Metro, fully reload app, then run preflight:seeker.");
    console.info("Higher-priority .env.local / .env.development* or shell variables must agree. No secrets printed.");
  }
} catch (error) {
  console.error(error instanceof Error && !('code' in error) ? error.message : "Configuration failed; verify both .env files exist. No values printed.");
  process.exitCode = 1;
}
