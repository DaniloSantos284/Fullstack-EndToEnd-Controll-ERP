import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";

const GATEWAY_URL = process.env.GATEWAY_URL ?? "https://gateway:443";
const ISSUER = "https://gateway-test-issuer.invalid";
const AUDIENCE = "gateway-test-api";
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "";
const JWKS_PORT = 4100;
const READ_SCOPE = "inventory:read";

type TokenOptions = {
  audience?: string;
  expiresAt?: number | string;
  issuer?: string;
  scope?: string;
  withoutScope?: boolean;
};

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function gatewayEndpoint(path: string): string {
  return new URL(path, GATEWAY_URL).toString();
}

async function requestApi(token?: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(gatewayEndpoint("/api/products"), {
    ...init,
    headers,
  });
}

async function expectStatus(
  description: string,
  expectedStatus: number,
  token?: string,
  init?: RequestInit,
): Promise<Response> {
  const response = await requestApi(token, init);
  assert.equal(response.status, expectedStatus, `${description}: expected ${expectedStatus}, got ${response.status}`);
  return response;
}

async function expectStatusEventually(
  description: string,
  expectedStatus: number,
  token?: string,
  init?: RequestInit,
): Promise<Response> {
  let lastStatus: number | undefined;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const response = await requestApi(token, init);
      lastStatus = response.status;
      if (response.status === expectedStatus) return response;
    } catch (error) {
      lastError = error;
    }
    await sleep(200);
  }
  const detail = lastError instanceof Error
    ? lastError.name
    : lastStatus === undefined ? "no response" : `last status ${lastStatus}`;
  throw new Error(`${description}: did not receive ${expectedStatus} (${detail})`);
}

function expectBusinessCorsHeaders(response: Response): void {
  assert.equal(response.headers.get("access-control-allow-origin"), FRONTEND_ORIGIN);
  assert.equal(response.headers.get("access-control-expose-headers"), "X-Request-Id, Retry-After");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("vary"), "Origin");
  assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000");
}

function expectGatewayErrorHeaders(response: Response): void {
  expectBusinessCorsHeaders(response);
}

function expectPreflightHeaders(response: Response): void {
  assert.equal(response.headers.get("access-control-allow-origin"), FRONTEND_ORIGIN);
  assert.equal(response.headers.get("access-control-allow-methods"), "GET, HEAD, POST, OPTIONS");
  assert.equal(response.headers.get("access-control-allow-headers"), "Authorization, Content-Type");
  assert.equal(response.headers.get("access-control-max-age"), "600");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("vary"), "Origin");
  assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000");
}

async function waitForGateway(): Promise<void> {
  let lastStatus: number | undefined;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const response = await fetch(gatewayEndpoint("/"));
      lastStatus = response.status;
      if (response.status === 404) return;
    } catch (error) {
      lastError = error;
    }
    await sleep(200);
  }
  const detail = lastError instanceof Error
    ? lastError.name
    : lastStatus === undefined ? "no response" : `last status ${lastStatus}`;
  throw new Error(`Nginx HTTPS gateway did not become ready (${detail})`);
}

async function issueToken(privateKey: CryptoKey, options: TokenOptions = {}): Promise<string> {
  const { SignJWT } = await import("jose");
  return new SignJWT(options.withoutScope ? {} : { scope: options.scope ?? READ_SCOPE })
    .setProtectedHeader({ alg: "RS256", kid: "gateway-test-key" })
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE)
    .setSubject("gateway-test-user")
    .setExpirationTime(options.expiresAt ?? "5m")
    .sign(privateKey);
}

async function startJwksServer(jwks: object): Promise<Server> {
  const server = createServer((req, res) => {
    if (req.url !== "/jwks") {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(jwks));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(JWKS_PORT, "0.0.0.0", () => {
      server.off("error", reject);
      resolve();
    });
  });
  return server;
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function main(): Promise<void> {
  if (new URL(GATEWAY_URL).protocol !== "https:") {
    throw new Error("GATEWAY_URL must use HTTPS.");
  }
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "0") {
    throw new Error("Gateway test requires its test-only self-signed TLS setting.");
  }
  if (!FRONTEND_ORIGIN) throw new Error("FRONTEND_ORIGIN is required for gateway testing.");

  const { exportJWK, generateKeyPair } = await import("jose");
  const keyPair = await generateKeyPair("RS256", { extractable: true });
  const publicJwk = await exportJWK(keyPair.publicKey);
  publicJwk.kid = "gateway-test-key";
  const validReadToken = await issueToken(keyPair.privateKey);
  let jwksServer: Server | undefined;

  try {
    await waitForGateway();
    const preflight = await fetch(gatewayEndpoint("/api/products"), {
      method: "OPTIONS",
      headers: {
        Origin: FRONTEND_ORIGIN,
        "Access-Control-Request-Headers": "Authorization, Content-Type",
        "Access-Control-Request-Method": "POST",
      },
    });
    assert.equal(preflight.status, 204, "CORS preflight must not reach authentication");
    expectPreflightHeaders(preflight);
    await expectStatusEventually("configured auth verifier through Nginx", 401);
    await expectStatus("malformed token without a JWKS provider", 401, "not-a-jwt");
    const unavailable = await expectStatusEventually("JWKS outage through Nginx", 503, validReadToken, {
      headers: { Origin: FRONTEND_ORIGIN },
    });
    expectGatewayErrorHeaders(unavailable);
    assert.match(unavailable.headers.get("content-type") ?? "", /^application\/json\b/);
    assert.deepEqual(await unavailable.json(), {
      code: "SERVICE_UNAVAILABLE",
      message: "Serviço temporariamente indisponível.",
    });

    jwksServer = await startJwksServer({ keys: [publicJwk] });
    const products = await expectStatusEventually("valid read token through Nginx", 200, validReadToken, {
      headers: { Origin: FRONTEND_ORIGIN },
    });
    expectBusinessCorsHeaders(products);
    const productsBody = await products.json() as {
      data?: unknown;
      pagination?: { hasNext?: unknown; limit?: unknown; page?: unknown };
    };
    assert.ok(Array.isArray(productsBody.data), "products response must contain data array");
    assert.equal(typeof productsBody.pagination?.page, "number");
    assert.equal(typeof productsBody.pagination?.limit, "number");
    assert.equal(typeof productsBody.pagination?.hasNext, "boolean");
    assert.equal(
      products.headers.get("x-gateway-test-authorization"),
      "absent",
      "Nginx must remove the public bearer before forwarding the business request",
    );

    const absentToken = await expectStatus("absent token", 401, undefined, {
      headers: { Origin: FRONTEND_ORIGIN },
    });
    expectBusinessCorsHeaders(absentToken);
    await expectStatus("malformed token", 401, "not-a-jwt");
    await expectStatus("expired token", 401, await issueToken(keyPair.privateKey, { expiresAt: -60 }));
    await expectStatus("wrong issuer", 401, await issueToken(keyPair.privateKey, {
      issuer: "https://wrong-issuer.invalid",
    }));
    await expectStatus("wrong audience", 401, await issueToken(keyPair.privateKey, {
      audience: "wrong-audience",
    }));
    const invalidSignatureKeyPair = await generateKeyPair("RS256");
    await expectStatus(
      "invalid signature",
      401,
      await issueToken(invalidSignatureKeyPair.privateKey),
    );
    const { SignJWT } = await import("jose");
    const nonStringSubjectToken = await new SignJWT({
      scope: READ_SCOPE,
      sub: 123,
    } as unknown as import("jose").JWTPayload)
      .setProtectedHeader({ alg: "RS256", kid: "gateway-test-key" })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime("5m")
      .sign(keyPair.privateKey);
    await expectStatus("non-string subject", 401, nonStringSubjectToken);
    const missingScopes = await expectStatus("missing scopes", 403, await issueToken(keyPair.privateKey, {
      withoutScope: true,
    }), {
      headers: { Origin: FRONTEND_ORIGIN },
    });
    expectBusinessCorsHeaders(missingScopes);
    await expectStatus("missing read scope", 403, await issueToken(keyPair.privateKey, {
      scope: "inventory:write",
    }));
    const productName = `Gateway scope test product ${randomUUID()}`;
    const productPayload = JSON.stringify({
      name: productName,
      price: 1,
      category: "OTHER",
    });
    await expectStatus("read scope cannot create product", 403, validReadToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: productPayload,
    });
    const createdProduct = await expectStatus("write scope creates product", 201, await issueToken(keyPair.privateKey, {
      scope: "inventory:write",
    }), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: productPayload,
    });
    const createdProductBody = await createdProduct.json() as { category?: unknown; name?: unknown };
    assert.equal(createdProductBody.name, productName);
    assert.equal(createdProductBody.category, "OTHER");
    assert.equal(createdProduct.headers.get("x-gateway-test-authorization"), "absent");
    const privateHeaders = { Authorization: `Bearer ${validReadToken}` };
    const internalAuth = await fetch(gatewayEndpoint("/internal/auth/verify"), { headers: privateHeaders });
    assert.equal(internalAuth.status, 404, "internal auth endpoint must not be public");
    const internalAuthSubrequest = await fetch(gatewayEndpoint("/_auth"), { headers: privateHeaders });
    assert.equal(internalAuthSubrequest.status, 404, "internal auth subrequest must not be public");
  } finally {
    if (jwksServer) await closeServer(jwksServer);
  }

  process.stdout.write("Nginx gateway integration passed.\n");
}

main().catch((error: unknown) => {
  process.stderr.write(`Nginx gateway integration failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
