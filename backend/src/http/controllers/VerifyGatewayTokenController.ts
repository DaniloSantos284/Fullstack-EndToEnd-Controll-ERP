import type { Request, Response } from "express";
import type { AccessTokenVerifier } from "../../application/security/AccessTokenVerifier";
import { HttpError } from "../errors/HttpError";

export class VerifyGatewayTokenController {
  constructor(
    private readonly verifier: AccessTokenVerifier | null,
    private readonly readScope: string,
    private readonly writeScope: string,
  ) {}

  async handle(req: Request, res: Response): Promise<Response> {
    if (!this.verifier) {
      throw new HttpError("Verificação de acesso indisponível.", 503, "SERVICE_UNAVAILABLE");
    }

    const authorization = req.header("Authorization");
    if (!authorization?.startsWith("Bearer ") || authorization.length > 8199) {
      throw new HttpError("Token ausente ou inválido.", 401, "UNAUTHORIZED");
    }
    const token = authorization.slice(7);
    if (!token || token.includes(" ")) {
      throw new HttpError("Token ausente ou inválido.", 401, "UNAUTHORIZED");
    }

    const originalMethod = req.header("X-Original-Method");
    const requiredScope = originalMethod === "GET" || originalMethod === "HEAD"
      ? this.readScope
      : originalMethod === "POST"
        ? this.writeScope
        : null;
    if (!requiredScope) {
      throw new HttpError("Operação não autorizada.", 403, "FORBIDDEN");
    }

    let scopes: ReadonlySet<string>;
    try {
      ({ scopes } = await this.verifier.verify(token));
    } catch {
      throw new HttpError("Token ausente ou inválido.", 401, "UNAUTHORIZED");
    }
    if (!scopes.has(requiredScope)) {
      throw new HttpError("Permissão insuficiente.", 403, "FORBIDDEN");
    }

    return res.status(204).end();
  }
}
