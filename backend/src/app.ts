import express, { type Express } from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { db } from "./infra/db/mysql/connection";
import productsRoutes from "./http/routes/products.routes";
import { HttpError } from "./http/errors/HttpError";
import { errorHandler } from "./http/middlewares/errorHandler";
import { createRateLimit } from "./http/middlewares/rateLimit";
import { requestContext } from "./http/middlewares/requestContext";
import { runtimeState } from "./http/runtimeState";
import { VerifyGatewayTokenController } from "./http/controllers/VerifyGatewayTokenController";
import { JwksAccessTokenVerifier } from "./infra/security/JwksAccessTokenVerifier";

const app: Express = express();

app.set("trust proxy", env.trustProxyHops);
app.disable("x-powered-by");
app.use(requestContext);
app.use(helmet());
app.use("/api", createRateLimit(env.rateLimitMaxRequests, env.rateLimitWindowMs));
app.use(express.json({ limit: `${env.jsonBodyLimitKb}kb` }));

app.get("/health/live", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/health/ready", (_req, res, next) => {
  if (runtimeState.shuttingDown) {
    next(new HttpError("Serviço temporariamente indisponível.", 503, "SERVICE_UNAVAILABLE"));
    return;
  }

  db.execute("SELECT 1")
    .then(() => res.status(200).json({ status: "ok" }))
    .catch(() => next(new HttpError(
      "Serviço temporariamente indisponível.",
      503,
      "SERVICE_UNAVAILABLE"
    )));
});

const tokenVerifier = env.jwtIssuer && env.jwtAudience && env.jwtJwksUrl
  ? new JwksAccessTokenVerifier(env.jwtIssuer, env.jwtAudience, env.jwtJwksUrl)
  : null;
const verifyGatewayToken = new VerifyGatewayTokenController(
  tokenVerifier,
  env.jwtReadScope,
  env.jwtWriteScope,
);
app.get("/internal/auth/verify", (req, res, next) => {
  verifyGatewayToken.handle(req, res).catch(next);
});

app.use("/api", productsRoutes);

app.use((_req, _res, next) => {
  next(new HttpError("Rota não encontrada.", 404, "ROUTE_NOT_FOUND"));
});

app.use(errorHandler);

export { app };
