/**
 * The configured authentication provider could not be used to verify a token.
 * This deliberately carries no provider details because it is safe to surface
 * only as a generic service-unavailable response.
 */
export class AuthenticationInfrastructureError extends Error {
  constructor() {
    super("Authentication infrastructure is unavailable.");
    this.name = "AuthenticationInfrastructureError";
  }
}
