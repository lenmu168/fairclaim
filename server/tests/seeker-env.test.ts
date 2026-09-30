import { describe, expect, it } from "vitest";
import { deviceOrigin, siwsMatches, unsafeMobileKeys } from "../scripts/seeker-env.mjs";

describe("real Seeker preflight configuration boundaries", () => {
  it.each([undefined, "http://10.0.2.2:3000", "http://localhost:3000", "http://127.0.0.1:3000", "https://example.com", "https://user:pass@host.com", "https://host.com?key=secret", "https://host.com/api"])("rejects unusable or credential-bearing device URL %s", value => {
    expect(() => deviceOrigin(value)).toThrow();
  });
  it("accepts actual HTTPS or LAN origin without a native rebuild requirement", () => {
    expect(deviceOrigin("https://actual-session.trycloudflare.com/")).toBe("https://actual-session.trycloudflare.com");
    expect(deviceOrigin("http://192.168.1.42:3000")).toBe("http://192.168.1.42:3000");
  });
  it("requires exact SIWS identity including URI slash and port", () => {
    const server = { SIWS_DOMAIN: "192.168.1.42:3000", SIWS_URI: "http://192.168.1.42:3000" };
    const mobile = { EXPO_PUBLIC_API_URL: server.SIWS_URI, EXPO_PUBLIC_SIWS_DOMAIN: server.SIWS_DOMAIN, EXPO_PUBLIC_SIWS_URI: server.SIWS_URI };
    expect(siwsMatches(server, mobile)).toBe(true);
    expect(siwsMatches(server, { ...mobile, EXPO_PUBLIC_SIWS_URI: server.SIWS_URI + "/" })).toBe(false);
    expect(siwsMatches({ ...server, SIWS_DOMAIN: "192.168.1.42" }, mobile)).toBe(false);
  });
  it("rejects server secrets in public and non-public mobile env without returning secret values", () => {
    const secret = "postgresql://user:password@db/private";
    const result = unsafeMobileKeys({ DATABASE_URL: secret, EXPO_PUBLIC_RPC_URL: "https://rpc.host", EXPO_PUBLIC_API_URL: secret, ALLOW_LOCAL_HTTP: "true" }, { DATABASE_URL: secret });
    expect(result).toEqual(["DATABASE_URL", "EXPO_PUBLIC_RPC_URL", "EXPO_PUBLIC_API_URL"]);
    expect(JSON.stringify(result)).not.toContain("password");
  });
  it("does not flag the three legitimate public identity values", () => {
    expect(unsafeMobileKeys({ EXPO_PUBLIC_API_URL: "https://actual-session.trycloudflare.com", EXPO_PUBLIC_SIWS_DOMAIN: "actual-session.trycloudflare.com", EXPO_PUBLIC_SIWS_URI: "https://actual-session.trycloudflare.com" }, {})).toEqual([]);
  });
});
