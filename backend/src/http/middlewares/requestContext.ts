import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

export function requestIdOf(res: Response): string {
  return res.locals.requestId as string;
}

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const requestId = randomUUID();
  const startedAt = process.hrtime.bigint();

  res.locals.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  res.once("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    // Não registrar URL, query, headers ou body: esses campos podem conter segredos.
    console.info(JSON.stringify({
      level: "info",
      event: "http_request",
      requestId,
      method: req.method,
      route: req.route?.path ?? "unmatched",
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs),
    }));
  });

  next();
}
