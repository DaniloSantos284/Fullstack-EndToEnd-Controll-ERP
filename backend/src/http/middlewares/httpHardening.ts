import type { RequestHandler } from "express";
import { HttpError } from "../errors/HttpError";

export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
};

export const requireJsonContentType: RequestHandler = (req, _res, next) => {
  if (req.method !== "POST") {
    next();
    return;
  }

  const mediaType = req.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    next(new HttpError("Tipo de conteúdo não suportado.", 415, "UNSUPPORTED_MEDIA_TYPE"));
    return;
  }

  next();
};
