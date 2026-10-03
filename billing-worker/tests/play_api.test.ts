import { beforeAll, describe, expect, it } from 'vitest';
import { PlayClient } from '../src/play_api';
import { decision, LIFE, SUB } from '../src/entitlements';
import { base64url_decode, decode_text, to_buffer, to_bytes } from '../src/crypto';

let credentials: string, publicKey: CryptoKey;
beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  publicKey = pair.publicKey;
  const raw = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey) as ArrayBuffer);
  const pem = '-----BEGIN PRIVATE KEY-----\n' + btoa(String.fromCharCode(...raw)) + '\n-----END PRIVATE KEY-----';
  credentials = JSON.stringify({ type: 'service_account', client_email: 'play@kotoba.iam.gserviceaccount.com',
    private_key: pem, token_uri: 'https://oauth2.googleapis.com/token' });
});

describe('Google Play client', () => {
  it('cryptographically signs scope-specific OAuth assertions and caches each scope separately', async () => {
    const assertions: Record<string, unknown>[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      expect(init?.redirect).toBe('error');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      const url = String(input);
      if (url === 'https://oauth2.googleapis.com/token') {
        const params = new URLSearchParams(init?.body as string);
        expect(params.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
        const parts = params.get('assertion')!.split('.');
        expect(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey,
          to_buffer(base64url_decode(parts[2]!)), to_buffer(to_bytes(parts[0]! + '.' + parts[1]!)))).toBe(true);
        const payload = JSON.parse(decode_text(base64url_decode(parts[1]!)));
        expect(payload).toMatchObject({ iss: 'play@kotoba.iam.gserviceaccount.com',
          aud: 'https://oauth2.googleapis.com/token', iat: 1000, exp: 4600 });
        assertions.push(payload);
        return Response.json({ access_token: 'access-token-0123456789', expires_in: 3600, token_type: 'Bearer' });
      }
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer access-token-0123456789');
      return Response.json(url.includes('playintegrity') ? { tokenPayloadExternal: { requestDetails: {} } } : {});
    };
    const client = new PlayClient('com.studio501.kotoba', credentials, fetcher, () => 1000);
    await client.lookup(LIFE, 'token/plus+?');
    await client.lookup(SUB, 'second-token');
    await client.decode_integrity('integrity-token');
    await client.decode_integrity('another-integrity');
    expect(assertions.map(value => value.scope)).toEqual([
      'https://www.googleapis.com/auth/androidpublisher', 'https://www.googleapis.com/auth/playintegrity']);
    expect(client.receipt_url(LIFE, 'token/plus+?')).toContain('token%2Fplus%2B%3F');
  });

  it('denies missing receipts, distinguishes transient errors and never follows purchase redirects', async () => {
    let status = 404;
    const fetcher: typeof fetch = async (input, init) => {
      if (String(input).includes('oauth2.googleapis.com')) return Response.json({ access_token: 'access-token-0123456789', expires_in: 3600, token_type: 'Bearer' });
      expect(init?.redirect).toBe('error');
      return new Response('{}', { status });
    };
    const client = new PlayClient('com.studio501.kotoba', credentials, fetcher);
    for (status of [400, 404, 410]) expect(await client.lookup(LIFE, 'token-a')).toEqual({});
    for (status of [302, 401, 429, 500, 503]) await expect(client.lookup(LIFE, 'token-a')).rejects.toThrow('google_api_unavailable');
  });

  it('uses acknowledgement without consumption and supplies complete voided-purchase pagination parameters', async () => {
    const calls: string[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'access-token-0123456789', expires_in: 3600, token_type: 'Bearer' });
      calls.push(url);
      if (url.endsWith(':acknowledge')) { expect(init?.method).toBe('POST'); return new Response(null, { status: 409 }); }
      const query = new URL(url).searchParams;
      expect(Object.fromEntries(query)).toEqual({ startTime: '1000', endTime: '2000', type: '1',
        includeQuantityBasedPartialRefund: 'true', maxResults: '1000', token: 'page/+token' });
      return Response.json({ voidedPurchases: [] });
    };
    const client = new PlayClient('com.studio501.kotoba', credentials, fetcher);
    await client.acknowledge(LIFE, 'lifetime-token');
    await client.acknowledge(SUB, 'sub-token');
    await client.voided(1000, 2000, 'page/+token');
    expect(calls.every(url => !url.includes(':consume'))).toBe(true);
    expect(calls[1]).toContain('/purchases/subscriptions/kotoba_premium/tokens/sub-token:acknowledge');
  });

  it('rejects hostile OAuth endpoints, credentials and malformed authoritative responses', async () => {
    const value = JSON.parse(credentials);
    expect(() => new PlayClient('com.studio501.kotoba', JSON.stringify({ ...value,
      token_uri: 'https://attacker.example/token' }))).toThrow('invalid_google_credentials');
    const fake: typeof fetch = async input => String(input).includes('oauth2.googleapis.com')
      ? Response.json({ access_token: 'access-token-0123456789', expires_in: 3600, token_type: 'Bearer' })
      : Response.json([]);
    await expect(new PlayClient('com.studio501.kotoba', credentials, fake).lookup(LIFE, 'valid-token')).rejects.toThrow('invalid_google_response');
    const badExpiry: typeof fetch = async () => Response.json({ access_token: 'access-token-0123456789', expires_in: true, token_type: 'Bearer' });
    await expect(new PlayClient('com.studio501.kotoba', credentials, badExpiry).lookup(LIFE, 'valid-token')).rejects.toThrow('invalid_google_access_token');
  });

  it('preserves Python integer-field denial for raw decimal/exponent Google receipt values in workerd', async () => {
    let raw = '';
    const fake: typeof fetch = async input => String(input).includes('oauth2.googleapis.com')
      ? Response.json({ access_token: 'access-token-0123456789', expires_in: 3600, token_type: 'Bearer' })
      : new Response(raw, { headers: { 'Content-Type': 'application/json' } });
    const client = new PlayClient('com.studio501.kotoba', credentials, fake);
    for (const lexeme of ['0.0', '0e0', '0E+0']) {
      raw = `{"purchaseState":${lexeme},"acknowledgementState":1}`;
      expect(decision(LIFE, await client.lookup(LIFE, 'valid-token'), 1000).active).toBe(false);
    }
    for (const [field, lexeme] of [['acknowledgementState', '1.0'], ['consumptionState', '0.0'],
      ['quantity', '1e0'], ['refundableQuantity', '1.0']]) {
      raw = `{"purchaseState":0,"acknowledgementState":1,"${field}":${lexeme}}`;
      expect(decision(LIFE, await client.lookup(LIFE, 'valid-token'), 1000).active).toBe(false);
    }
    raw = '{"purchaseState":0,"acknowledgementState":1}';
    expect(decision(LIFE, await client.lookup(LIFE, 'valid-token'), 1000).active).toBe(true);
  });
});
