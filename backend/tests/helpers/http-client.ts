import request from 'supertest';
import { app } from '../../src/app';

// O Supertest gerencia o servidor temporário; não importe src/server.ts.
export function createHttpClient() {
  return request(app);
}
