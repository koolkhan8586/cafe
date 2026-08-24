import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, it } from "node:test";
import {
  HR_SSO_MIN_SECRET,
  hrSsoConfigured,
  signHrSsoToken,
  verifyHrSsoToken,
  type HrSsoPayload,
} from "./hr-sso";

function payload(overrides: Partial<HrSsoPayload> = {}): HrSsoPayload {
  const now = Math.floor(Date.now() / 1000);
  return {
    code: "LSAF-001",
    name: "Ammad Khan",
    iat: now,
    exp: now + 120,
    nonce: "abcdefghijklmnop",
    ...overrides,
  };
}

describe("HR SSO token", () => {
  const secret = "b".repeat(32);

  it("is not configured without a long enough secret", () => {
    const prev = process.env.HR_SSO_SECRET;
    delete process.env.HR_SSO_SECRET;
    assert.equal(hrSsoConfigured(), false);
    process.env.HR_SSO_SECRET = "short";
    assert.equal(hrSsoConfigured(), false);
    assert.ok("short".length < HR_SSO_MIN_SECRET);
    process.env.HR_SSO_SECRET = prev;
  });

  it("round-trips a signed token and uppercases the employee code", () => {
    const token = signHrSsoToken(payload({ code: "lsaf-014" }), secret);
    const verified = verifyHrSsoToken(token, secret);
    assert.ok(verified);
    assert.equal(verified.code, "LSAF-014");
    assert.equal(verified.name, "Ammad Khan");
  });

  it("matches PHP base64url HMAC (raw sha256, no padding)", () => {
    const token = signHrSsoToken(payload(), secret);
    const [body, sig] = token.split(".");
    const expected = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("base64url");
    assert.equal(sig, expected);
    assert.doesNotMatch(sig, /[+/=]/);
  });

  it("rejects a tampered payload", () => {
    const token = signHrSsoToken(payload(), secret);
    const [body, sig] = token.split(".");
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    parsed.code = "ADMIN";
    const tampered = `${Buffer.from(JSON.stringify(parsed)).toString("base64url")}.${sig}`;
    assert.equal(verifyHrSsoToken(tampered, secret), null);
  });

  it("rejects an expired token", () => {
    const now = 1_700_000_000;
    const token = signHrSsoToken(
      payload({ iat: now - 200, exp: now - 80 }),
      secret,
    );
    assert.equal(verifyHrSsoToken(token, secret, now), null);
  });

  it("rejects a missing or short secret", () => {
    const token = signHrSsoToken(payload(), secret);
    assert.equal(verifyHrSsoToken(token, null), null);
    assert.equal(verifyHrSsoToken(token, "too-short"), null);
  });

  it("rejects an empty token", () => {
    assert.equal(verifyHrSsoToken("", secret), null);
    assert.equal(verifyHrSsoToken(null, secret), null);
  });
});
