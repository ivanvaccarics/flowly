import { createVerify } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ENABLE_BANKING_AUDIENCE,
  ENABLE_BANKING_ISSUER,
  ENABLE_BANKING_MAX_TTL_SECONDS,
  publicKeyFingerprint,
  signEnableBankingJwt,
} from "../src/banking/jwt.js";
import { TEST_APP_ID, testPrivateKeyPem } from "./helpers/banking.js";

describe("Enable Banking JWT", () => {
  it("signs the documented header and claims with the application key", () => {
    const pem = testPrivateKeyPem();
    const token = signEnableBankingJwt({
      appId: TEST_APP_ID,
      privateKeyPem: pem,
      issuedAt: 1_601_456_768,
    });
    const [header, body, signature] = token.split(".");
    expect(header).toBeDefined();
    expect(body).toBeDefined();
    expect(signature).toBeDefined();

    const decodedHeader = JSON.parse(Buffer.from(header as string, "base64url").toString("utf8"));
    expect(decodedHeader).toEqual({ typ: "JWT", alg: "RS256", kid: TEST_APP_ID });
    const decodedBody = JSON.parse(Buffer.from(body as string, "base64url").toString("utf8"));
    expect(decodedBody).toEqual({
      iss: ENABLE_BANKING_ISSUER,
      aud: ENABLE_BANKING_AUDIENCE,
      iat: 1_601_456_768,
      exp: 1_601_460_368,
    });

    const verified = createVerify("RSA-SHA256")
      .update(`${header}.${body}`)
      .verify(pem, Buffer.from(signature as string, "base64url"));
    expect(verified).toBe(true);
  });

  it("caps the lifetime at the one day Enable Banking allows", () => {
    const token = signEnableBankingJwt({
      appId: TEST_APP_ID,
      privateKeyPem: testPrivateKeyPem(),
      issuedAt: 1000,
      ttlSeconds: 999_999,
    });
    const body = JSON.parse(
      Buffer.from(token.split(".")[1] as string, "base64url").toString("utf8"),
    );
    expect(body.exp - body.iat).toBe(ENABLE_BANKING_MAX_TTL_SECONDS);
  });

  it("exposes only a fingerprint of the matching public key", () => {
    const fingerprint = publicKeyFingerprint(testPrivateKeyPem());
    expect(fingerprint).toMatch(/^[0-9a-f]{32}$/);
    expect(fingerprint).not.toContain("PRIVATE");
    expect(publicKeyFingerprint(testPrivateKeyPem())).toBe(fingerprint);
  });
});
