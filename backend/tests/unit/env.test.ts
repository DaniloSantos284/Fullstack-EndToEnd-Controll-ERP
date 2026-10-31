import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

let environmentBeforeTest: NodeJS.ProcessEnv;

function configureValidEnvironment(overrides: Record<string, string> = {}): void {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    PORT: '0',
    DB_HOST: '127.0.0.1',
    PORT_DB: '3306',
    DB_USER: 'jest',
    DB_PASSWORD: 'jest-only-unused',
    DB_DATABASE: 'stock_test',
    ...overrides,
  });
}

describe('configuração de ambiente', () => {
  beforeEach(() => {
    environmentBeforeTest = { ...process.env };
    jest.resetModules();
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
    delete process.env.JWT_JWKS_URL;
  });

  afterEach(() => {
    jest.resetModules();
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, environmentBeforeTest);
  });

  it.each([
    ['issuer', { JWT_ISSUER: 'https://issuer.example.test' }],
    ['audience', { JWT_AUDIENCE: 'inventory-api' }],
    ['JWKS URL', { JWT_JWKS_URL: 'https://issuer.example.test/.well-known/jwks.json' }],
  ])('rejeita configuração JWT parcial com apenas %s', async (_field, jwtConfiguration) => {
    configureValidEnvironment(jwtConfiguration);

    expect(() => jest.requireActual('../../src/config/env'))
      .toThrow('JWT configuration requires issuer, audience and JWKS URL together.');
  });

  it('rejeita JWKS HTTP em produção', async () => {
    configureValidEnvironment({
      NODE_ENV: 'production',
      JWT_ISSUER: 'https://issuer.example.test',
      JWT_AUDIENCE: 'inventory-api',
      JWT_JWKS_URL: 'http://issuer.example.test/.well-known/jwks.json',
    });

    expect(() => jest.requireActual('../../src/config/env'))
      .toThrow('JWT_JWKS_URL must use HTTPS in production.');
  });
});
