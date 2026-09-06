import { describe, it, expect } from "vitest";
import { getJwtSecret, createAccessToken, createRefreshToken, verifyToken } from "../src/auth";

describe("JWT Secret Resolution and Defensive Handling", () => {
  it("resolves JWT_SECRET_KEY as primary secret", () => {
    const env = { JWT_SECRET_KEY: "key-1", JWT_SECRET: "key-2" };
    expect(getJwtSecret(env as any)).toBe("key-1");
  });

  it("falls back to JWT_SECRET when JWT_SECRET_KEY is absent", () => {
    const env = { JWT_SECRET: "key-fallback" };
    expect(getJwtSecret(env as any)).toBe("key-fallback");
  });

  it("throws descriptive error when neither is configured", () => {
    expect(() => getJwtSecret({} as any)).toThrow("JWT secret is not configured");
    expect(() => getJwtSecret(null as any)).toThrow("JWT secret is not configured");
    expect(() => getJwtSecret({ JWT_SECRET_KEY: "" } as any)).toThrow("JWT secret is not configured");
  });

  it("prevents sign and verify from crashing with includes error on undefined secret", async () => {
    const user = { id: "1", email: "test@example.com", name: "Test", role: "employee" as const };
    await expect(createAccessToken(user, undefined as any)).rejects.toThrow("JWT secret is not configured");
    await expect(createRefreshToken(user, undefined as any)).rejects.toThrow("JWT secret is not configured");
    expect(await verifyToken("fake-token", undefined as any)).toBeNull();
  });
});
