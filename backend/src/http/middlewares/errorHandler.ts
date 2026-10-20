import type { ErrorRequestHandler } from "express";
import { AppError } from "../../application/use-cases/errors/AppError";
import { DomainError } from "../../domain/errors/DomainError";
import { HttpError } from "../errors/HttpError";
import { requestIdOf } from "./requestContext";

const unavailableDatabaseCodes = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "PROTOCOL_CONNECTION_LOST",
  "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR",
  "ER_ACCESS_DENIED_ERROR",
  "ER_BAD_DB_ERROR",
  "ER_CON_COUNT_ERROR",
  "ER_LOCK_DEADLOCK",
  "ER_LOCK_WAIT_TIMEOUT",
  "ER_SERVER_SHUTDOWN",
]);

type ClassifiedError = { statusCode: number; code: string; message: string };

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

function errorType(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("type" in error)) return undefined;
  return typeof error.type === "string" ? error.type : undefined;
}

function classify(error: unknown): ClassifiedError {
  if (error instanceof HttpError) {
    return { statusCode: error.statusCode, code: error.code, message: error.message };
  }
  if (error instanceof DomainError) {
    return { statusCode: 400, code: "VALIDATION_ERROR", message: error.message };
  }
  if (error instanceof AppError) {
    const code = errorCode(error) ?? ({
      400: "BAD_REQUEST",
      404: "NOT_FOUND",
      409: "CONFLICT",
      503: "SERVICE_UNAVAILABLE",
    } as Record<number, string>)[error.statusCode] ?? "APPLICATION_ERROR";
    return { statusCode: error.statusCode, code, message: error.message };
  }
  if (errorType(error) === "entity.parse.failed") {
    return { statusCode: 400, code: "INVALID_JSON", message: "JSON inválido." };
  }
  if (errorType(error) === "entity.too.large") {
    return { statusCode: 413, code: "PAYLOAD_TOO_LARGE", message: "Corpo da requisição excede o limite." };
  }
  if (errorType(error) === "charset.unsupported" || errorType(error) === "encoding.unsupported") {
    return { statusCode: 415, code: "UNSUPPORTED_MEDIA_TYPE", message: "Codificação do corpo não suportada." };
  }
  if (errorType(error) === "request.aborted" || errorType(error) === "request.size.invalid") {
    return { statusCode: 400, code: "INVALID_REQUEST_BODY", message: "Corpo da requisição inválido." };
  }
  if (unavailableDatabaseCodes.has(errorCode(error) ?? "")) {
    return { statusCode: 503, code: "SERVICE_UNAVAILABLE", message: "Serviço temporariamente indisponível." };
  }
  return { statusCode: 500, code: "INTERNAL_ERROR", message: "Erro de servidor." };
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const classified = classify(error);
  const requestId = requestIdOf(res);
  if (classified.statusCode >= 500) {
    // Não registrar mensagem, stack ou SQL: podem incluir dados sensíveis.
    console.error(JSON.stringify({
      level: "error",
      event: "request_error",
      requestId,
      statusCode: classified.statusCode,
      errorType: error instanceof Error ? error.name : typeof error,
    }));
  }

  res.status(classified.statusCode).json({
    code: classified.code,
    message: classified.message,
    requestId,
  });
};
