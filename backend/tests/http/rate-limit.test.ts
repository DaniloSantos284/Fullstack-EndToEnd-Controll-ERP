import { describe, expect, it } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../src/http/middlewares/errorHandler';
import { createRateLimit } from '../../src/http/middlewares/rateLimit';
import { requestContext } from '../../src/http/middlewares/requestContext';

describe('limite de requisições HTTP', () => {
  it('devolve 429, Retry-After e identificador após exceder a janela', async () => {
    const app = express();
    app.use(requestContext);
    app.use(createRateLimit(1, 60_000));
    app.get('/limited', (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);

    await request(app).get('/limited').expect(200);
    const response = await request(app).get('/limited').expect(429);

    expect(response.headers['retry-after']).toBeDefined();
    expect(response.body).toMatchObject({
      code: 'RATE_LIMIT_EXCEEDED',
      requestId: expect.any(String),
    });
  });
});
