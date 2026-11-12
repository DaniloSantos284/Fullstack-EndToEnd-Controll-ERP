import { describe, expect, it } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { DomainError } from '../../src/domain/errors/DomainError';
import { errorHandler } from '../../src/http/middlewares/errorHandler';
import { createRateLimit } from '../../src/http/middlewares/rateLimit';
import { requestContext } from '../../src/http/middlewares/requestContext';
import { createHttpClient } from '../helpers/http-client';
import { databaseMock } from '../helpers/database';

function expectErrorContract(response: {
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}): void {
  expect(response.body).toEqual({
    code: expect.any(String),
    message: expect.any(String),
    requestId: expect.any(String),
  });
  expect(response.headers['x-request-id']).toBe(
    (response.body as { requestId: string }).requestId,
  );
}

describe('contrato de erro HTTP', () => {
  it('responde rota inexistente em JSON com identificador de requisição', async () => {
    const response = await createHttpClient()
      .get('/api/does-not-exist')
      .expect('Content-Type', /json/)
      .expect(404);

    expectErrorContract(response);
    expect(databaseMock.execute).not.toHaveBeenCalled();
  });

  it('responde JSON malformado como 400 sem acessar o banco', async () => {
    const response = await createHttpClient()
      .post('/api/products')
      .set('Content-Type', 'application/json')
      .send('{"name":')
      .expect(400);

    expectErrorContract(response);
    expect(databaseMock.execute).not.toHaveBeenCalled();
  });

  it('rejeita campos extras em um corpo válido', async () => {
    const response = await createHttpClient()
      .post('/api/products')
      .send({
        name: 'Caderno',
        price: 12.5,
        category: 'OFFICE',
        unexpected: true,
      })
      .expect(400);

    expectErrorContract(response);
    expect(databaseMock.execute).not.toHaveBeenCalled();
  });

  it('rejeita identificador que não é UUID antes de consultar o banco', async () => {
    const response = await createHttpClient()
      .get('/api/products/not-a-uuid')
      .expect(400);

    expectErrorContract(response);
    expect(databaseMock.execute).not.toHaveBeenCalled();
  });

  it('converte DomainError para o envelope de validação documentado', async () => {
    const errorApp = express();
    errorApp.use(requestContext);
    errorApp.get('/domain-error', (_req, _res, next) => {
      next(new DomainError('Regra de domínio inválida.'));
    });
    errorApp.use(errorHandler);

    const response = await request(errorApp)
      .get('/domain-error')
      .expect(400);

    expectErrorContract(response);
    expect(response.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Regra de domínio inválida.',
    });
  });

  it('inclui Retry-After numérico e positivo ao rejeitar por rate limit', async () => {
    const rateLimitedApp = express();
    rateLimitedApp.use(requestContext);
    rateLimitedApp.use('/api', createRateLimit(1, 60_000));
    rateLimitedApp.get('/api/probe', (_req, res) => {
      res.status(204).end();
    });
    rateLimitedApp.use(errorHandler);

    await request(rateLimitedApp).get('/api/probe').expect(204);
    const response = await request(rateLimitedApp)
      .get('/api/probe')
      .expect(429);

    expectErrorContract(response);
    expect(response.body).toMatchObject({ code: 'RATE_LIMIT_EXCEEDED' });
    const retryAfter = response.headers['retry-after'];
    if (typeof retryAfter !== 'string') {
      throw new Error('Retry-After header was not a string.');
    }
    expect(retryAfter).toMatch(/^[1-9]\d*$/);
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });

  it('limita o corpo JSON e retorna 413', async () => {
    const response = await createHttpClient()
      .post('/api/products')
      .send({ name: 'x'.repeat(1024 * 1024) })
      .expect(413);

    expectErrorContract(response);
    expect(databaseMock.execute).not.toHaveBeenCalled();
  });

  it('rejeita charset JSON não suportado com 415 sem expor o erro do parser', async () => {
    const response = await createHttpClient()
      .post('/api/products')
      .set('Content-Type', 'application/json; charset=iso-8859-1')
      .send('{"name":"Caderno"}')
      .expect(415);

    expectErrorContract(response);
    expect(response.body.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(JSON.stringify(response.body)).not.toContain('iso-8859-1');
    expect(databaseMock.execute).not.toHaveBeenCalled();
  });

  it('oculta falha inesperada do banco em 500', async () => {
    databaseMock.execute.mockRejectedValueOnce(new Error('SELECT secret FROM internal_table'));

    const response = await createHttpClient()
      .get('/api/products')
      .expect(500);

    expectErrorContract(response);
    expect(response.body.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(response.body)).not.toContain('secret');
  });

  it('exibe apenas o estado mínimo na liveness e readiness', async () => {
    await createHttpClient().get('/health/live').expect(200, { status: 'ok' });
    databaseMock.execute.mockRejectedValueOnce(new Error('internal host'));
    const unavailable = await createHttpClient().get('/health/ready').expect(503);
    expectErrorContract(unavailable);
    expect(JSON.stringify(unavailable.body)).not.toContain('internal host');
    databaseMock.execute.mockResolvedValueOnce([[], []]);
    await createHttpClient().get('/health/ready').expect(200, { status: 'ok' });
  });
});
