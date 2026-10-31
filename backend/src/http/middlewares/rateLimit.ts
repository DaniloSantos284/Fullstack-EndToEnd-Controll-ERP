import type { RequestHandler } from "express";
import { HttpError } from "../errors/HttpError";

type Bucket = { count: number; resetAt: number };
const MAX_BUCKETS = 100_000;

export function createRateLimit(maxRequests: number, windowMs: number): RequestHandler {
  const buckets = new Map<string, Bucket>();
  const pruneExpired = () => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  };
  const cleanup = setInterval(pruneExpired, windowMs);
  cleanup.unref();

  return (req, res, next) => {
    // Express não confia em X-Forwarded-For por padrão. Configure o proxy na
    // borda antes de usar esse header em uma implantação com proxy reverso.
    const key = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const now = Date.now();
    const current = buckets.get(key);
    if (!current && buckets.size >= MAX_BUCKETS) {
      pruneExpired();
      if (buckets.size >= MAX_BUCKETS) {
        next(new HttpError("Limite de requisições excedido.", 429, "RATE_LIMIT_EXCEEDED"));
        return;
      }
    }
    const bucket = current && current.resetAt > now
      ? current
      : { count: 0, resetAt: now + windowMs };

    bucket.count += 1;
    buckets.set(key, bucket);

    if (bucket.count > maxRequests) {
      res.setHeader("Retry-After", Math.ceil((bucket.resetAt - now) / 1000));
      next(new HttpError("Limite de requisições excedido.", 429, "RATE_LIMIT_EXCEEDED"));
      return;
    }

    next();
  };
}
