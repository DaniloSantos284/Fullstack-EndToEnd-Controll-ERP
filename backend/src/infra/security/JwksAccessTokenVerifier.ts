import type { AccessTokenVerifier, VerifiedPrincipal } from "../../application/security/AccessTokenVerifier";

export class JwksAccessTokenVerifier implements AccessTokenVerifier {
  private readonly jwksPromise: Promise<ReturnType<typeof import("jose")["createRemoteJWKSet"]>>;

  constructor(
    private readonly issuer: string,
    private readonly audience: string,
    jwksUrl: string,
  ) {
    this.jwksPromise = import("jose").then(({ createRemoteJWKSet }) =>
      createRemoteJWKSet(new URL(jwksUrl), { timeoutDuration: 5_000 }),
    );
  }

  async verify(token: string): Promise<VerifiedPrincipal> {
    const [{ jwtVerify }, jwks] = await Promise.all([import("jose"), this.jwksPromise]);
    const { payload } = await jwtVerify(token, jwks, {
      issuer: this.issuer,
      audience: this.audience,
      algorithms: ["RS256", "ES256"],
      requiredClaims: ["exp", "sub"],
      clockTolerance: "5 seconds",
    });

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

    return { subject: payload.sub!, scopes };
  }
}
