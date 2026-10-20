import "dotenv/config";
import { z } from "zod";

const optionalConfiguredString = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).optional(),
);
const optionalConfiguredUrl = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.url().optional(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(0).max(65535).default(3333),
  DB_HOST: z.string().trim().min(1),
  PORT_DB: z.coerce.number().int().positive().max(65535),
  DB_USER: z.string().trim().min(1),
  DB_PASSWORD: z.string(),
  DB_DATABASE: z.string().trim().min(1),
  DB_CONNECTION_LIMIT: z.coerce.number().int().positive().max(100).default(10),
  JSON_BODY_LIMIT_KB: z.coerce.number().int().positive().max(1024).default(64),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).max(3_600_000).default(60_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().max(100_000).default(100),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(10_000),
  JWT_ISSUER: optionalConfiguredString,
  JWT_AUDIENCE: optionalConfiguredString,
  JWT_JWKS_URL: optionalConfiguredUrl,
  JWT_READ_SCOPE: z.string().trim().min(1).default("inventory:read"),
  JWT_WRITE_SCOPE: z.string().trim().min(1).default("inventory:write"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const keys = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
  console.error(JSON.stringify({ level: "error", event: "invalid_environment", keys }));
  throw new Error("Invalid environment variables.");
}

const jwtFields = [parsed.data.JWT_ISSUER, parsed.data.JWT_AUDIENCE, parsed.data.JWT_JWKS_URL];
if (jwtFields.some(Boolean) && jwtFields.some((value) => value === undefined)) {
  throw new Error("JWT configuration requires issuer, audience and JWKS URL together.");
}

if (parsed.data.NODE_ENV === "production" && parsed.data.JWT_JWKS_URL &&
    new URL(parsed.data.JWT_JWKS_URL).protocol !== "https:") {
  throw new Error("JWT_JWKS_URL must use HTTPS in production.");
}

export const env = {
  nodeEnv: parsed.data.NODE_ENV,
  port: parsed.data.PORT,
  dbHost: parsed.data.DB_HOST,
  dbPort: parsed.data.PORT_DB,
  dbUser: parsed.data.DB_USER,
  dbPassword: parsed.data.DB_PASSWORD,
  dbName: parsed.data.DB_DATABASE,
  dbConnectionLimit: parsed.data.DB_CONNECTION_LIMIT,
  jsonBodyLimitKb: parsed.data.JSON_BODY_LIMIT_KB,
  rateLimitWindowMs: parsed.data.RATE_LIMIT_WINDOW_MS,
  rateLimitMaxRequests: parsed.data.RATE_LIMIT_MAX_REQUESTS,
  trustProxyHops: parsed.data.TRUST_PROXY_HOPS,
  shutdownTimeoutMs: parsed.data.SHUTDOWN_TIMEOUT_MS,
  jwtIssuer: parsed.data.JWT_ISSUER,
  jwtAudience: parsed.data.JWT_AUDIENCE,
  jwtJwksUrl: parsed.data.JWT_JWKS_URL,
  jwtReadScope: parsed.data.JWT_READ_SCOPE,
  jwtWriteScope: parsed.data.JWT_WRITE_SCOPE,
};
