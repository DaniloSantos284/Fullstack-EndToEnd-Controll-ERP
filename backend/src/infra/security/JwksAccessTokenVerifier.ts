import type { AccessTokenVerifier, VerifiedPrincipal } from "../../application/security/AccessTokenVerifier";
import { AuthenticationInfrastructureError } from "../../application/security/AuthenticationInfrastructureError";

type Jose = typeof import("jose");
type FetchImplementation = import("jose").FetchImplementation;
type JWK = import("jose").JWK;
type JSONWebKeySet = import("jose").JSONWebKeySet;
type RemoteJWKSet = ReturnType<typeof import("jose")["createRemoteJWKSet"]>;

const MIN_RSA_MODULUS_BITS = 2_048;
const privateJwkMembers = new Set(["d", "p", "q", "dp", "dq", "qi", "oth"]);

function supportedVerificationAlgorithm(jwk: JWK): "RS256" | "ES256" | undefined {
  if (jwk.use !== undefined && jwk.use !== "sig") return undefined;
  if (jwk.key_ops !== undefined && (!Array.isArray(jwk.key_ops) || !jwk.key_ops.includes("verify"))) {
    return undefined;
  }
  if (jwk.kty === "RSA" && (jwk.alg === undefined || jwk.alg === "RS256")) {
    return "RS256";
  }
  if (jwk.kty === "EC" && jwk.crv === "P-256" &&
      (jwk.alg === undefined || jwk.alg === "ES256")) {
    return "ES256";
  }
  return undefined;
}

function hasPrivateJwkMaterial(jwk: JWK): boolean {
  return [...privateJwkMembers].some((member) => member in jwk);
}

function rsaModulusBitLength(jwk: JWK, jose: Jose): number {
  if (typeof jwk.n !== "string") return 0;
  const modulus = jose.base64url.decode(jwk.n);
  let firstNonZeroByte = 0;
  while (firstNonZeroByte < modulus.length && modulus[firstNonZeroByte] === 0) {
    firstNonZeroByte += 1;
  }
  const mostSignificantByte = modulus[firstNonZeroByte];
  if (mostSignificantByte === undefined) return 0;
  return (modulus.length - firstNonZeroByte - 1) * 8 + 32 - Math.clz32(mostSignificantByte);
}

async function validateSupportedJwkMaterial(jwks: JSONWebKeySet, jose: Jose): Promise<void> {
  let supportedKeys = 0;
  for (const jwk of jwks.keys) {
    const algorithm = supportedVerificationAlgorithm(jwk);
    if (!algorithm) continue;
    if (hasPrivateJwkMaterial(jwk)) throw new TypeError("JWKS must not contain private keys");
    if (algorithm === "RS256" && rsaModulusBitLength(jwk, jose) < MIN_RSA_MODULUS_BITS) {
      throw new TypeError("JWKS RSA key is below the minimum modulus length");
    }
    await jose.importJWK(jwk, algorithm);
    supportedKeys += 1;
  }
  if (supportedKeys === 0) throw new TypeError("JWKS has no supported verification keys");
}

function remoteJwksFetch(jose: Jose): FetchImplementation {
  return async (url, options) => {
    let response: Response;
    try {
      response = await fetch(url, { ...options, redirect: "error" });
    } catch {
      throw new AuthenticationInfrastructureError();
    }
    if (response.status !== 200) throw new AuthenticationInfrastructureError();

    try {
      const jwks = await response.clone().json() as JSONWebKeySet;
      jose.createLocalJWKSet(jwks);
      await validateSupportedJwkMaterial(jwks, jose);
    } catch {
      throw new AuthenticationInfrastructureError();
    }
    return response;
  };
}

export class JwksAccessTokenVerifier implements AccessTokenVerifier {
  private readonly jwksPromise: Promise<RemoteJWKSet>;

  constructor(
    private readonly issuer: string,
    private readonly audience: string,
    jwksUrl: string,
    timeoutDuration = 5_000,
  ) {
    this.jwksPromise = import("jose").then((jose) => {
      try {
        return jose.createRemoteJWKSet(new URL(jwksUrl), {
          timeoutDuration,
          [jose.customFetch]: remoteJwksFetch(jose),
        });
      } catch {
        throw new AuthenticationInfrastructureError();
      }
    });
  }

  async verify(token: string): Promise<VerifiedPrincipal> {
    const jose = await import("jose");
    const jwks = await this.jwksPromise;
    const { payload } = await jose.jwtVerify(token, jwks, {
      issuer: this.issuer,
      audience: this.audience,
      algorithms: ["RS256", "ES256"],
      requiredClaims: ["exp", "sub"],
      clockTolerance: "5 seconds",
    });
    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      throw new jose.errors.JWTInvalid("JWT subject must be a non-empty string");
    }

    const scopes = new Set<string>();
    if (typeof payload.scope === "string") {
      for (const scope of payload.scope.split(/\s+/)) {
        if (scope) scopes.add(scope);
      }
    }
    if (Array.isArray(payload.permissions)) {
      for (const permission of payload.permissions) {
        if (typeof permission === "string") scopes.add(permission);
      }
    }

    return { subject: payload.sub, scopes };
  }
}
