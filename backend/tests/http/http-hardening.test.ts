import { describe, expect, it } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../src/http/middlewares/errorHandler';
import { requireJsonContentType } from '../../src/http/middlewares/httpHardening';
import { createRateLimit } from '../../src/http/middlewares/rateLimit';
import { requestContext } from '../../src/http/middlewares/requestContext';
import { databaseMock } from '../helpers/database';
import { createHttpClient } from '../helpers/http-client';

function createRateLimitedApi() {
  const app = express();
  app.use(requestContext);
  app.use('/api', createRateLimit(1, 60_000));
  app.use('/api', requireJsonContentType);
  app.use(errorHandler);
  return app;
}

describe('hardening HTTP', () => {
  it('inclui Cache-Control no-store nas respostas de sucesso e erro', async () => {
    const success = await createHttpClient().get('/health/live').expect(200);
    const error = await createHttpClient().get('/api/does-not-exist').expect(404);

    expect(success.headers['cache-control']).toBe('no-store');
    expect(error.headers['cache-control']).toBe('no-store');
  });

  it('rejeita POST sem Content-Type antes de acessar o banco', async () => {
    const response = await createHttpClient()
      .post('/api/products')
      .expect(415);

    expect(response.body).toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(databaseMock.execute).not.toHaveBeenCalled();
  });

  it('rejeita POST com Content-Type não JSON antes de acessar o banco', async () => {
    const response = await createHttpClient()
      .post('/api/products')
      .set('Content-Type', 'text/plain')
      .send('{"name":"Caderno"}')
      .expect(415);

    expect(response.body).toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' });
    expect(databaseMock.execute).not.toHaveBeenCalled();
  });

  it('contabiliza POST inválido no rate limit antes de responder 415', async () => {
    const app = createRateLimitedApi();

    await request(app).post('/api/products').expect(415);
    const limited = await request(app).post('/api/products').expect(429);

    expect(limited.body).toMatchObject({ code: 'RATE_LIMIT_EXCEEDED' });
  });

  it('aceita application/json com charset UTF-8', async () => {
    databaseMock.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    await createHttpClient()
      .post('/api/products')
      .set('Content-Type', 'application/json; charset=utf-8')
      .send('{"name":"Caderno","price":12.5,"category":"OFFICE"}')
      .expect(201);

    expect(databaseMock.execute).toHaveBeenCalledTimes(1);
  });

  it('não exige Content-Type para HEAD sob /api', async () => {
    databaseMock.execute.mockResolvedValueOnce([[], []]);

    await createHttpClient().head('/api/products').expect(200);

    expect(databaseMock.execute).toHaveBeenCalledTimes(1);
  });
});
