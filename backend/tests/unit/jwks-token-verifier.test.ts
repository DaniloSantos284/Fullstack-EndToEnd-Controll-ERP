import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { JwksAccessTokenVerifier } from '../../src/infra/security/JwksAccessTokenVerifier';

describe('verificação JWT com JWKS', () => {
  let server: Server;
  let jwksUrl: string;
  let privateKey: CryptoKey;

  beforeAll(async () => {
    const { exportJWK, generateKeyPair } = await import('jose');
    const keyPair = await generateKeyPair('RS256', { extractable: true });
    privateKey = keyPair.privateKey;
    const publicJwk = await exportJWK(keyPair.publicKey);
    publicJwk.kid = 'integration-key';

    server = createServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ keys: [publicJwk] }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    jwksUrl = `http://127.0.0.1:${port}/jwks`;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('aceita assinatura, emissor, audiência e expiração válidos', async () => {
    const { SignJWT } = await import('jose');
    const token = await new SignJWT({ scope: 'inventory:read inventory:write' })
      .setProtectedHeader({ alg: 'RS256', kid: 'integration-key' })
      .setIssuer('https://issuer.example.test')
      .setAudience('erp-api')
      .setSubject('user-1')
      .setExpirationTime('5m')
      .sign(privateKey);
    const verifier = new JwksAccessTokenVerifier(
      'https://issuer.example.test', 'erp-api', jwksUrl,
    );

    await expect(verifier.verify(token)).resolves.toMatchObject({ subject: 'user-1' });
    const principal = await verifier.verify(token);
    expect(principal.scopes.has('inventory:read')).toBe(true);
    expect(principal.scopes.has('inventory:write')).toBe(true);
  });

  it('rejeita JWT assinado com audiência incorreta', async () => {
    const { SignJWT } = await import('jose');
    const token = await new SignJWT({ scope: 'inventory:read' })
      .setProtectedHeader({ alg: 'RS256', kid: 'integration-key' })
      .setIssuer('https://issuer.example.test')
      .setAudience('other-api')
      .setSubject('user-1')
      .setExpirationTime('5m')
      .sign(privateKey);
    const verifier = new JwksAccessTokenVerifier(
      'https://issuer.example.test', 'erp-api', jwksUrl,
    );

    await expect(verifier.verify(token)).rejects.toThrow();
  });
});
