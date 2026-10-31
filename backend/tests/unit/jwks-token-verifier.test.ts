import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { AuthenticationInfrastructureError } from '../../src/application/security/AuthenticationInfrastructureError';
import { JwksAccessTokenVerifier } from '../../src/infra/security/JwksAccessTokenVerifier';

describe('verificação JWT com JWKS', () => {
  let server: Server;
  let jwksUrl: string;
  let privateKey: CryptoKey;
  let jwksStatus = 200;
  let jwksBody = '';
  let validJwksBody = '';
  let responseDelayMs = 0;
  let redirectJwks = false;

  beforeAll(async () => {
    const { exportJWK, generateKeyPair } = await import('jose');
    const keyPair = await generateKeyPair('RS256', { extractable: true });
    privateKey = keyPair.privateKey;
    const publicJwk = await exportJWK(keyPair.publicKey);
    publicJwk.kid = 'integration-key';
    validJwksBody = JSON.stringify({ keys: [publicJwk] });
    jwksBody = validJwksBody;

    server = createServer((req, res) => {
      const respond = () => {
        if (redirectJwks && req.url === '/jwks') {
          res.statusCode = 302;
          res.setHeader('Location', '/redirected-jwks');
          res.end();
          return;
        }
        res.statusCode = jwksStatus;
        res.setHeader('Content-Type', 'application/json');
        res.end(jwksBody);
      };
      if (responseDelayMs) {
        setTimeout(respond, responseDelayMs);
      } else {
        respond();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    jwksUrl = `http://127.0.0.1:${port}/jwks`;
  });

  beforeEach(() => {
    jwksStatus = 200;
    jwksBody = validJwksBody;
    responseDelayMs = 0;
    redirectJwks = false;
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

  it('aceita token ES256 válido', async () => {
    const { SignJWT, exportJWK, generateKeyPair } = await import('jose');
    const keyPair = await generateKeyPair('ES256', { extractable: true });
    const publicJwk = await exportJWK(keyPair.publicKey);
    publicJwk.kid = 'es256-key';
    jwksBody = JSON.stringify({ keys: [publicJwk] });
    const token = await new SignJWT({ scope: 'inventory:read' })
      .setProtectedHeader({ alg: 'ES256', kid: 'es256-key' })
      .setIssuer('https://issuer.example.test')
      .setAudience('erp-api')
      .setSubject('user-1')
      .setExpirationTime('5m')
      .sign(keyPair.privateKey);

    await expect(new JwksAccessTokenVerifier(
      'https://issuer.example.test', 'erp-api', jwksUrl,
    ).verify(token)).resolves.toMatchObject({ subject: 'user-1' });
  });

  it('aceita inventory:read no claim permissions', async () => {
    const { SignJWT } = await import('jose');
    const token = await new SignJWT({ permissions: ['inventory:read'] })
      .setProtectedHeader({ alg: 'RS256', kid: 'integration-key' })
      .setIssuer('https://issuer.example.test')
      .setAudience('erp-api')
      .setSubject('user-1')
      .setExpirationTime('5m')
      .sign(privateKey);

    const principal = await new JwksAccessTokenVerifier(
      'https://issuer.example.test', 'erp-api', jwksUrl,
    ).verify(token);

    expect(principal.scopes.has('inventory:read')).toBe(true);
  });

  it('mapeia JWKS sem chaves RS256/ES256 aptas para verificação como indisponibilidade', async () => {
    const { SignJWT, exportJWK, generateKeyPair } = await import('jose');
    const keyPair = await generateKeyPair('RS256', { extractable: true });
    const publicJwk = await exportJWK(keyPair.publicKey);
    const issue = async (kid: string) => new SignJWT({ scope: 'inventory:read' })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuer('https://issuer.example.test')
      .setAudience('erp-api')
      .setSubject('user-1')
      .setExpirationTime('5m')
      .sign(keyPair.privateKey);

    jwksBody = JSON.stringify({ keys: [{ ...publicJwk, kid: 'encryption-key', use: 'enc' }] });
    await expect(new JwksAccessTokenVerifier(
      'https://issuer.example.test', 'erp-api', jwksUrl,
    ).verify(await issue('encryption-key'))).rejects.toBeInstanceOf(
      AuthenticationInfrastructureError,
    );

    jwksBody = JSON.stringify({ keys: [{ ...publicJwk, kid: 'sign-only-key', key_ops: ['sign'] }] });
    await expect(new JwksAccessTokenVerifier(
      'https://issuer.example.test', 'erp-api', jwksUrl,
    ).verify(await issue('sign-only-key'))).rejects.toBeInstanceOf(
      AuthenticationInfrastructureError,
    );

    jwksBody = JSON.stringify({ keys: [{
      ...publicJwk, kid: 'verify-key', use: 'sig', key_ops: ['verify'],
    }] });
    await expect(new JwksAccessTokenVerifier(
      'https://issuer.example.test', 'erp-api', jwksUrl,
    ).verify(await issue('verify-key'))).resolves.toMatchObject({ subject: 'user-1' });
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

    await expect(verifier.verify(token)).rejects.not.toBeInstanceOf(
      AuthenticationInfrastructureError,
    );
  });

  it('mantém tokens malformados, expirados, com subject inválido, emissor incorreto, assinatura inválida e chave desconhecida como falhas de autenticação', async () => {
    const { SignJWT, generateKeyPair } = await import('jose');
    const expiredToken = await new SignJWT({ scope: 'inventory:read' })
      .setProtectedHeader({ alg: 'RS256', kid: 'integration-key' })
      .setIssuer('https://issuer.example.test')
      .setAudience('erp-api')
      .setSubject('user-1')
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(privateKey);
    const wrongIssuerToken = await new SignJWT({ scope: 'inventory:read' })
      .setProtectedHeader({ alg: 'RS256', kid: 'integration-key' })
      .setIssuer('https://other-issuer.example.test')
      .setAudience('erp-api')
      .setSubject('user-1')
      .setExpirationTime('5m')
      .sign(privateKey);
    const nonStringSubjectToken = await new SignJWT({
      scope: 'inventory:read', sub: 123,
    } as unknown as import('jose').JWTPayload)
      .setProtectedHeader({ alg: 'RS256', kid: 'integration-key' })
      .setIssuer('https://issuer.example.test')
      .setAudience('erp-api')
      .setExpirationTime('5m')
      .sign(privateKey);
    const otherKeyPair = await generateKeyPair('RS256');
    const invalidSignatureToken = await new SignJWT({ scope: 'inventory:read' })
      .setProtectedHeader({ alg: 'RS256', kid: 'integration-key' })
      .setIssuer('https://issuer.example.test')
      .setAudience('erp-api')
      .setSubject('user-1')
      .setExpirationTime('5m')
      .sign(otherKeyPair.privateKey);
    const unknownKeyToken = await new SignJWT({ scope: 'inventory:read' })
      .setProtectedHeader({ alg: 'RS256', kid: 'unknown-key' })
      .setIssuer('https://issuer.example.test')
      .setAudience('erp-api')
      .setSubject('user-1')
      .setExpirationTime('5m')
      .sign(otherKeyPair.privateKey);

    const verify = (token: string) => new JwksAccessTokenVerifier(
      'https://issuer.example.test', 'erp-api', jwksUrl,
    ).verify(token);

    await expect(verify('not-a-jwt')).rejects.not.toBeInstanceOf(AuthenticationInfrastructureError);
    await expect(verify(expiredToken)).rejects.not.toBeInstanceOf(AuthenticationInfrastructureError);
    await expect(verify(nonStringSubjectToken)).rejects.not.toBeInstanceOf(
      AuthenticationInfrastructureError,
    );
    await expect(verify(wrongIssuerToken)).rejects.not.toBeInstanceOf(AuthenticationInfrastructureError);
    await expect(verify(invalidSignatureToken)).rejects.not.toBeInstanceOf(
      AuthenticationInfrastructureError,
    );
    await expect(verify(unknownKeyToken)).rejects.not.toBeInstanceOf(
      AuthenticationInfrastructureError,
    );
  });

  it('mantém um JWKS com duas chaves válidas e token sem kid como falha de autenticação', async () => {
    const { SignJWT, exportJWK, generateKeyPair } = await import('jose');
    const secondKeyPair = await generateKeyPair('RS256', { extractable: true });
    const secondPublicJwk = await exportJWK(secondKeyPair.publicKey);
    jwksBody = JSON.stringify({
      keys: [JSON.parse(validJwksBody).keys[0], secondPublicJwk],
    });
    const token = await new SignJWT({ scope: 'inventory:read' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer('https://issuer.example.test')
      .setAudience('erp-api')
      .setSubject('user-1')
      .setExpirationTime('5m')
      .sign(privateKey);

    await expect(new JwksAccessTokenVerifier(
      'https://issuer.example.test', 'erp-api', jwksUrl,
    ).verify(token)).rejects.not.toBeInstanceOf(AuthenticationInfrastructureError);
  });

  it('mapeia resposta não 200 e corpo JWKS inválido como indisponibilidade do provedor', async () => {
    const { SignJWT } = await import('jose');
    const token = await new SignJWT({ scope: 'inventory:read' })
      .setProtectedHeader({ alg: 'RS256', kid: 'integration-key' })
      .setIssuer('https://issuer.example.test')
      .setAudience('erp-api')
      .setSubject('user-1')
      .setExpirationTime('5m')
      .sign(privateKey);

    jwksStatus = 503;
    await expect(new JwksAccessTokenVerifier(
      'https://issuer.example.test', 'erp-api', jwksUrl,
    ).verify(token)).rejects.toBeInstanceOf(AuthenticationInfrastructureError);

    jwksStatus = 200;
    jwksBody = '{';
    await expect(new JwksAccessTokenVerifier(
      'https://issuer.example.test', 'erp-api', jwksUrl,
    ).verify(token)).rejects.toBeInstanceOf(AuthenticationInfrastructureError);
  });

  it('recusa redirects ao buscar o JWKS', async () => {
    const { SignJWT } = await import('jose');
    const token = await new SignJWT({ scope: 'inventory:read' })
      .setProtectedHeader({ alg: 'RS256', kid: 'integration-key' })
      .setIssuer('https://issuer.example.test')
      .setAudience('erp-api')
      .setSubject('user-1')
      .setExpirationTime('5m')
      .sign(privateKey);
    redirectJwks = true;

    await expect(new JwksAccessTokenVerifier(
      'https://issuer.example.test', 'erp-api', jwksUrl,
    ).verify(token)).rejects.toBeInstanceOf(AuthenticationInfrastructureError);
  });

  it('mapeia material JWK selecionado malformado como indisponibilidade do provedor', async () => {
    const { SignJWT } = await import('jose');
    const token = await new SignJWT({ scope: 'inventory:read' })
      .setProtectedHeader({ alg: 'RS256', kid: 'malformed-key' })
      .setIssuer('https://issuer.example.test')
      .setAudience('erp-api')
      .setSubject('user-1')
      .setExpirationTime('5m')
      .sign(privateKey);

    jwksBody = JSON.stringify({
      keys: [{ kty: 'RSA', kid: 'malformed-key', e: 'AQAB' }],
    });

    await expect(new JwksAccessTokenVerifier(
      'https://issuer.example.test', 'erp-api', jwksUrl,
    ).verify(token)).rejects.toBeInstanceOf(AuthenticationInfrastructureError);
  });

  it('mapeia RSA fraca e material privado RSA ou EC como indisponibilidade do provedor', async () => {
    const { SignJWT, base64url, exportJWK, generateKeyPair } = await import('jose');
    const weakRsaKeyPair = await crypto.subtle.generateKey({
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 1024,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    }, true, ['sign', 'verify']) as CryptoKeyPair;
    const weakRsaJwk = await exportJWK(weakRsaKeyPair.publicKey);
    weakRsaJwk.kid = 'weak-rsa-key';
    const weakRsaToken = await new SignJWT({ scope: 'inventory:read' })
      .setProtectedHeader({ alg: 'RS256', kid: 'weak-rsa-key' })
      .setIssuer('https://issuer.example.test')
      .setAudience('erp-api')
      .setSubject('user-1')
      .setExpirationTime('5m')
      .sign(privateKey);

    jwksBody = JSON.stringify({ keys: [weakRsaJwk] });
    await expect(new JwksAccessTokenVerifier(
      'https://issuer.example.test', 'erp-api', jwksUrl,
    ).verify(weakRsaToken)).rejects.toBeInstanceOf(AuthenticationInfrastructureError);

    if (typeof weakRsaJwk.n !== 'string') throw new Error('Weak RSA JWK has no modulus.');
    const weakRsaModulus = base64url.decode(weakRsaJwk.n);
    const paddedWeakRsaModulus = new Uint8Array(weakRsaModulus.length + 129);
    paddedWeakRsaModulus.set(weakRsaModulus, 129);
    const paddedWeakRsaJwk = {
      ...weakRsaJwk,
      kid: 'padded-weak-rsa-key',
      n: base64url.encode(paddedWeakRsaModulus),
    };
    const paddedWeakRsaToken = await new SignJWT({ scope: 'inventory:read' })
      .setProtectedHeader({ alg: 'RS256', kid: 'padded-weak-rsa-key' })
      .setIssuer('https://issuer.example.test')
      .setAudience('erp-api')
      .setSubject('user-1')
      .setExpirationTime('5m')
      .sign(privateKey);

    jwksBody = JSON.stringify({ keys: [paddedWeakRsaJwk] });
    await expect(new JwksAccessTokenVerifier(
      'https://issuer.example.test', 'erp-api', jwksUrl,
    ).verify(paddedWeakRsaToken)).rejects.toBeInstanceOf(AuthenticationInfrastructureError);

    const privateRsaJwk = await exportJWK(privateKey);
    privateRsaJwk.kid = 'private-rsa-key';
    const privateRsaToken = await new SignJWT({ scope: 'inventory:read' })
      .setProtectedHeader({ alg: 'RS256', kid: 'private-rsa-key' })
      .setIssuer('https://issuer.example.test')
      .setAudience('erp-api')
      .setSubject('user-1')
      .setExpirationTime('5m')
      .sign(privateKey);

    jwksBody = JSON.stringify({ keys: [privateRsaJwk] });
    await expect(new JwksAccessTokenVerifier(
      'https://issuer.example.test', 'erp-api', jwksUrl,
    ).verify(privateRsaToken)).rejects.toBeInstanceOf(AuthenticationInfrastructureError);

    const privateEcKeyPair = await generateKeyPair('ES256', { extractable: true });
    const privateEcJwk = await exportJWK(privateEcKeyPair.privateKey);
    privateEcJwk.kid = 'private-ec-key';
    const privateEcToken = await new SignJWT({ scope: 'inventory:read' })
      .setProtectedHeader({ alg: 'ES256', kid: 'private-ec-key' })
      .setIssuer('https://issuer.example.test')
      .setAudience('erp-api')
      .setSubject('user-1')
      .setExpirationTime('5m')
      .sign(privateEcKeyPair.privateKey);

    jwksBody = JSON.stringify({ keys: [privateEcJwk] });
    await expect(new JwksAccessTokenVerifier(
      'https://issuer.example.test', 'erp-api', jwksUrl,
    ).verify(privateEcToken)).rejects.toBeInstanceOf(AuthenticationInfrastructureError);
  });

  it('mapeia falha nativa de TLS/fetch e timeout como indisponibilidade do provedor', async () => {
    const { SignJWT } = await import('jose');
    const token = await new SignJWT({ scope: 'inventory:read' })
      .setProtectedHeader({ alg: 'RS256', kid: 'integration-key' })
      .setIssuer('https://issuer.example.test')
      .setAudience('erp-api')
      .setSubject('user-1')
      .setExpirationTime('5m')
      .sign(privateKey);

    await expect(new JwksAccessTokenVerifier(
      'https://issuer.example.test', 'erp-api', jwksUrl.replace('http:', 'https:'),
    ).verify(token)).rejects.toBeInstanceOf(AuthenticationInfrastructureError);

    responseDelayMs = 100;
    await expect(new JwksAccessTokenVerifier(
      'https://issuer.example.test', 'erp-api', jwksUrl, 10,
    ).verify(token)).rejects.toBeInstanceOf(AuthenticationInfrastructureError);
  });

  it('mapeia configuração de JWKS inválida como indisponibilidade', async () => {
    const { SignJWT } = await import('jose');
    const token = await new SignJWT({ scope: 'inventory:read' })
      .setProtectedHeader({ alg: 'RS256', kid: 'integration-key' })
      .setIssuer('https://issuer.example.test')
      .setAudience('erp-api')
      .setSubject('user-1')
      .setExpirationTime('5m')
      .sign(privateKey);

    await expect(new JwksAccessTokenVerifier(
      'https://issuer.example.test', 'erp-api', 'not a URL',
    ).verify(token)).rejects.toBeInstanceOf(AuthenticationInfrastructureError);
  });
});
