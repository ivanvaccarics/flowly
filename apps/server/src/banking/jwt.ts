import { createHash, createPublicKey, createSign } from "node:crypto";

export const ENABLE_BANKING_AUDIENCE = "api.enablebanking.com";
export const ENABLE_BANKING_ISSUER = "enablebanking.com";
export const ENABLE_BANKING_JWT_TTL_SECONDS = 3600;
/** Enable Banking rejects tokens whose lifetime exceeds one day. */
export const ENABLE_BANKING_MAX_TTL_SECONDS = 86_400;

export interface JwtSigningOptions {
  appId: string;
  privateKeyPem: string;
  /** Unix seconds; defaults to now. */
  issuedAt?: number;
  /** Token lifetime in seconds; capped at one day. */
  ttlSeconds?: number;
}

/**
 * Builds the RS256 JWT Enable Banking expects:
 * `kid` is the application id, the audience is the API host, and the token is
 * signed with the application's private key. The key never leaves the server.
 */
export function signEnableBankingJwt(options: JwtSigningOptions): string {
  const issuedAt = options.issuedAt ?? Math.floor(Date.now() / 1000);
  const ttl = Math.min(
    Math.max(1, options.ttlSeconds ?? ENABLE_BANKING_JWT_TTL_SECONDS),
    ENABLE_BANKING_MAX_TTL_SECONDS,
  );
  const header = { typ: "JWT", alg: "RS256", kid: options.appId };
  const body = {
    iss: ENABLE_BANKING_ISSUER,
    aud: ENABLE_BANKING_AUDIENCE,
    iat: issuedAt,
    exp: issuedAt + ttl,
  };
  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(body)}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(options.privateKeyPem);
  return `${signingInput}.${signature.toString("base64url")}`;
}

/**
 * SHA-256 fingerprint of the public half of the key, so the UI can confirm
 * which key is loaded without ever handling the private material.
 */
export function publicKeyFingerprint(privateKeyPem: string): string {
  const publicKey = createPublicKey(privateKeyPem);
  const der = publicKey.export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("hex").slice(0, 32);
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}
