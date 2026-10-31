import { describe, expect, it } from '@jest/globals';
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
