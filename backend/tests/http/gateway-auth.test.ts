import { describe, expect, it } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import type { AccessTokenVerifier } from '../../src/application/security/AccessTokenVerifier';
import { VerifyGatewayTokenController } from '../../src/http/controllers/VerifyGatewayTokenController';
import { errorHandler } from '../../src/http/middlewares/errorHandler';
import { requestContext } from '../../src/http/middlewares/requestContext';

function createAuthApp(verifier: AccessTokenVerifier | null) {
  const app = express();
  const controller = new VerifyGatewayTokenController(
    verifier, 'inventory:read', 'inventory:write',
  );
  app.use(requestContext);
  app.get('/internal/auth/verify', (req, res, next) => {
    controller.handle(req, res).catch(next);
  });
  app.use(errorHandler);
  return app;
}

describe('verificação do subrequest do gateway', () => {
  const verifier: AccessTokenVerifier = {
    verify: async () => ({ subject: 'user-1', scopes: new Set(['inventory:read']) }),
  };

  it('falha fechado quando nenhum provedor JWT está configurado', async () => {
    const response = await request(createAuthApp(null))
      .get('/internal/auth/verify')
      .set('Authorization', 'Bearer token')
      .set('X-Original-Method', 'GET')
      .expect(503);
    expect(response.body.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('rejeita ausência de bearer token', async () => {
    const response = await request(createAuthApp(verifier))
      .get('/internal/auth/verify')
      .set('X-Original-Method', 'GET')
      .expect(401);
    expect(response.body.code).toBe('UNAUTHORIZED');
  });

  it('permite leitura e exige permissão separada para escrita', async () => {
    const app = createAuthApp(verifier);
    await request(app)
      .get('/internal/auth/verify')
      .set('Authorization', 'Bearer token')
      .set('X-Original-Method', 'GET')
      .expect(204);
    const denied = await request(app)
      .get('/internal/auth/verify')
      .set('Authorization', 'Bearer token')
      .set('X-Original-Method', 'POST')
      .expect(403);
    expect(denied.body.code).toBe('FORBIDDEN');
  });
});
