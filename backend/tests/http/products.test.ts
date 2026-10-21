import { describe, expect, it } from '@jest/globals';
import { connectionMock, databaseMock } from '../helpers/database';
import { createHttpClient } from '../helpers/http-client';

const productId = '1c242a54-7d9c-480e-8de2-b547bd56f0bd';
const secondProductId = 'b7b1c233-e13b-427b-9530-1831c222fadd';

const productRow = {
  id: productId,
  name: 'Caderno',
  quantity: 3,
  price: '12.50',
  category: 'OFFICE',
  image_url: null,
  bar_code: null,
};

const movementRows = [
  {
    id: 'f46c4874-7588-423a-96f2-e42f5b1e8a58',
    product_id: productId,
    type: 'in',
    quantity: 5,
    created_at: new Date('2026-01-02T00:00:00.000Z'),
  },
  {
    id: '31b9463e-2445-4ed6-a895-c30cd60edf4e',
    product_id: productId,
    type: 'out',
    quantity: 2,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
  },
];

describe('API de produtos com Supertest', () => {
  it('lista uma página e identifica a próxima sem consulta por produto', async () => {
    databaseMock.execute.mockResolvedValueOnce([[
      productRow,
      { ...productRow, id: secondProductId, name: 'Caneta' },
    ], []]);

    const response = await createHttpClient()
      .get('/api/products?page=2&limit=1')
      .expect(200);

    expect(response.body).toMatchObject({
      data: [{ id: productId, name: 'Caderno', quantity: 3, price: 12.5 }],
      pagination: { page: 2, limit: 1, hasNext: true },
    });
    expect(response.body.data).toHaveLength(1);
    expect(databaseMock.execute).toHaveBeenCalledTimes(1);
    expect(databaseMock.execute.mock.calls[0]?.[0]).toMatch(/ORDER BY id ASC[\s\S]*LIMIT \? OFFSET \?/i);
    expect(databaseMock.execute.mock.calls[0]?.[1]).toEqual([2, 1]);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('rejeita paginação fora do limite antes de consultar o banco', async () => {
    const response = await createHttpClient()
      .get('/api/products?limit=101')
      .expect(400);

    expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(databaseMock.execute).not.toHaveBeenCalled();
  });

  it('cria produto com preço decimal exato', async () => {
    databaseMock.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const response = await createHttpClient()
      .post('/api/products')
      .send({ name: 'Caderno', price: 12.5, category: 'OFFICE', imageUrl: '', barCode: '' })
      .expect(201);

    expect(response.body).toMatchObject({
      id: expect.any(String),
      name: 'Caderno',
      price: 12.5,
      category: 'OFFICE',
      imageUrl: '',
      barCode: '',
    });
    expect(databaseMock.execute).toHaveBeenCalledTimes(1);
    expect(databaseMock.execute.mock.calls[0]?.[0]).toMatch(/INSERT INTO products/i);
    expect(databaseMock.execute.mock.calls[0]?.[1]?.[3]).toBe('12.50');
    expect(databaseMock.execute.mock.calls[0]?.[1]?.slice(5)).toEqual(['', '']);
  });

  it('inclui histórico paginado nos detalhes sem alterar o saldo materializado', async () => {
    databaseMock.execute
      .mockResolvedValueOnce([[productRow], []])
      .mockResolvedValueOnce([movementRows, []]);

    const response = await createHttpClient()
      .get(`/api/products/${productId}?page=1&limit=1`)
      .expect(200);

    expect(response.body).toMatchObject({
      id: productId,
      quantity: 3,
      price: 12.5,
      movements: [{ id: movementRows[0]?.id, type: 'ENTRY', quantity: 5 }],
      movementsPagination: { page: 1, limit: 1, hasNext: true },
    });
    expect(response.body.movements).toHaveLength(1);
    expect(databaseMock.execute).toHaveBeenCalledTimes(2);
    expect(databaseMock.execute.mock.calls[1]?.[1]).toEqual([productId, 2, 0]);
  });

  it('lista movimentos com apenas uma consulta para produto e outra para a página', async () => {
    databaseMock.execute
      .mockResolvedValueOnce([[productRow], []])
      .mockResolvedValueOnce([[movementRows[0]], []]);

    const response = await createHttpClient()
      .get(`/api/products/${productId}/movements?limit=1`)
      .expect(200);

    expect(response.body).toMatchObject({
      data: [{ type: 'ENTRY', quantity: 5 }],
      pagination: { page: 1, limit: 1, hasNext: false },
    });
    expect(databaseMock.execute).toHaveBeenCalledTimes(2);
  });

  it('registra entrada e responde 201 após commit', async () => {
    connectionMock.execute
      .mockResolvedValueOnce([[{ quantity: 3 }], []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    await createHttpClient()
      .post(`/api/products/${productId}/stock/entry`)
      .send({ quantity: 2 })
      .expect(201, { ok: true });

    expect(connectionMock.commit).toHaveBeenCalledTimes(1);
    expect(connectionMock.execute.mock.calls[1]?.[1]).toEqual([2, productId]);
  });

  it('retorna conflito para saída sem saldo e não grava movimento', async () => {
    connectionMock.execute.mockResolvedValueOnce([[{ quantity: 1 }], []]);

    const response = await createHttpClient()
      .post(`/api/products/${productId}/stock/exit`)
      .send({ quantity: 2 })
      .expect(409);

    expect(response.body).toMatchObject({
      code: expect.any(String),
      requestId: expect.any(String),
    });
    expect(connectionMock.execute).toHaveBeenCalledTimes(1);
    expect(connectionMock.rollback).toHaveBeenCalledTimes(1);
  });

  it('retorna 503 genérico para conexão recusada pelo banco', async () => {
    databaseMock.execute.mockRejectedValueOnce(
      Object.assign(new Error('private-db-host: secret'), { code: 'ECONNREFUSED' }),
    );

    const response = await createHttpClient()
      .get('/api/products')
      .expect(503);

    expect(response.body).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      requestId: expect.any(String),
    });
    expect(JSON.stringify(response.body)).not.toContain('private-db-host');
    expect(JSON.stringify(response.body)).not.toContain('secret');
  });
});
