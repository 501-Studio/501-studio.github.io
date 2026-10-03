import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { BillingCoordinator } from '../src/index';
import { configured, operations_configured } from '../src/app';
import { base64url_decode, base64url_encode, to_buffer, to_bytes } from '../src/crypto';
import type { Env } from '../src/types';
import { KEY, PACKAGE } from './fixtures';

const origin = 'https://kotoba-operations.example';
const operator = 'operator@kotoba.iam.gserviceaccount.com';
let leaseKey: string, identityPair: CryptoKeyPair, identityJwk: JsonWebKey;
let originalBillingPublicKey: CryptoKey, billingPublicKey: CryptoKey;
let scans: number;

beforeAll(async () => {
  const parameters = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
  const leasePair = await crypto.subtle.generateKey(parameters, true, ['sign', 'verify']) as CryptoKeyPair;
  originalBillingPublicKey = leasePair.publicKey;
  const raw = new Uint8Array(await crypto.subtle.exportKey('pkcs8', leasePair.privateKey) as ArrayBuffer);
  leaseKey = '-----BEGIN PRIVATE KEY-----\n' + btoa(String.fromCharCode(...raw)) + '\n-----END PRIVATE KEY-----';
  identityPair = await crypto.subtle.generateKey(parameters, true, ['sign', 'verify']) as CryptoKeyPair;
  identityJwk = await crypto.subtle.exportKey('jwk', identityPair.publicKey) as JsonWebKey;
});

beforeEach(() => {
  scans = 0;
  billingPublicKey = originalBillingPublicKey;
  // Only Google's network boundary is replaced; real RSA, PlayClient, router and SQLite run in workerd.
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === 'https://www.googleapis.com/oauth2/v3/certs') {
      return new Response(JSON.stringify({ keys: [{ ...identityJwk, kid: 'operations-google-key', alg: 'RS256', use: 'sig' }] }));
    }
    if (url === 'https://oauth2.googleapis.com/token') {
      const form = new URLSearchParams(String(init?.body));
      const assertion = form.get('assertion')!;
      const parts = assertion.split('.');
      expect(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', billingPublicKey,
        to_buffer(base64url_decode(parts[2]!)), to_buffer(to_bytes(parts[0]! + '.' + parts[1]!)))).toBe(true);
      const payload = JSON.parse(atob(assertion.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')));
      expect(payload.scope).toBe('https://www.googleapis.com/auth/androidpublisher');
      return new Response(JSON.stringify({ access_token: 'operations-test-access-token', token_type: 'Bearer', expires_in: 3600 }));
    }
    if (url.startsWith('https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' + PACKAGE + '/purchases/voidedpurchases?')) {
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer operations-test-access-token' });
      scans++;
      return new Response(JSON.stringify({ voidedPurchases: [] }));
    }
    throw new Error('unexpected test network request');
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const configuration = (): Env => ({ ...(env as unknown as Env), PLAY_PACKAGE: PACKAGE,
  BILLING_EVENT_MODE: 'poll', RECONCILIATION_ENABLED: 'true',
  RECEIPT_VERIFICATION_ENABLED: 'false', POLLING_OPERATIONS_VERIFIED: 'false', ACCOUNT_DELETION_ENABLED: 'false',
  ENTITLEMENT_PRIVATE_KEY_PEM: leaseKey, TOKEN_ENCRYPTION_KEY: KEY,
  ACCOUNT_HMAC_KEY: 'test-only-operations-account-key-32-characters',
  GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ type: 'service_account',
    client_email: 'billing@kotoba.iam.gserviceaccount.com', private_key: leaseKey }),
  GOOGLE_OAUTH_CLIENT_ID: 'operations.apps.googleusercontent.com', PLAY_SIGNING_CERT_SHA256: 'A'.repeat(43),
  OPS_AUDIENCE: origin + '/ops', OPS_SERVICE_ACCOUNT_EMAIL: operator,
});

async function identity(overrides: Record<string, unknown> = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const content = base64url_encode(to_bytes(JSON.stringify({ alg: 'RS256', kid: 'operations-google-key', typ: 'JWT' })))
    + '.' + base64url_encode(to_bytes(JSON.stringify({ iss: 'https://accounts.google.com', aud: origin + '/ops',
      sub: '123456789', iat: now - 1, exp: now + 600, email: operator, email_verified: true, ...overrides })));
  return content + '.' + base64url_encode(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', identityPair.privateKey, to_buffer(to_bytes(content))));
}

function request(path: string, token?: string, method = 'GET'): Request {
  return new Request(origin + path, { method, headers: token ? { Authorization: 'Bearer ' + token } : {} });
}

async function initialize(state: DurableObjectState, value: Env): Promise<BillingCoordinator> {
  const pending: Promise<unknown>[] = [];
  const block = state.blockConcurrencyWhile.bind(state);
  const spy = vi.spyOn(state, 'blockConcurrencyWhile').mockImplementation(callback => {
    const promise = block(callback);
    pending.push(promise);
    return promise;
  });
  try {
    const instance = new BillingCoordinator(state, value);
    await Promise.all(pending);
    return instance;
  } finally { spy.mockRestore(); }
}

async function inStorage(operation: (state: DurableObjectState) => Promise<void>): Promise<void> {
  const namespace = (env as unknown as Env).BILLING_STATE;
  await runInDurableObject<BillingCoordinator, void>(namespace.get(namespace.idFromName(crypto.randomUUID())),
    async (_instance, state) => operation(state));
}

describe('authenticated operations before receipt approval', () => {
  it('permits a real client scan/status and scheduled handler with all customer gates closed', async () => {
    await inStorage(async state => {
      const value = configuration(), instance = await initialize(state, value), token = await identity();
      expect(operations_configured(value)).toBe(true);
      expect(configured(value)).toBe(false);
      const initialStatus = await instance.fetch(request('/tasks/status', token));
      expect(initialStatus.status).toBe(200);
      expect(await initialStatus.json()).toMatchObject({ voidedSyncAt: null, refundReviewsNeedingOperator: null });
      const scanned = await instance.fetch(request('/tasks/reconcile', token, 'POST'));
      expect(scanned.status).toBe(200);
      expect(await scanned.json()).toEqual({ processed: 0 });
      expect(scans).toBe(1);
      const status = await instance.fetch(request('/tasks/status', token));
      expect(status.status).toBe(200);
      expect(await status.json()).toMatchObject({ billingEventMode: 'poll',
        refundReviewDiscovery: 'unavailable_without_rtdn', voidedSyncAt: expect.any(String) });

      const pending: Promise<unknown>[] = [];
      const routeName = vi.fn(() => state.id), get = vi.fn(() => instance);
      // Route the exported scheduled handler to this actual SQLite actor, without a cloud Cron trigger.
      await worker.scheduled({} as ScheduledController,
        { ...value, BILLING_STATE: { idFromName: routeName, get } as unknown as DurableObjectNamespace },
        { waitUntil: (promise: Promise<unknown>) => pending.push(promise) } as unknown as ExecutionContext);
      await Promise.all(pending);
      expect(routeName).toHaveBeenCalledWith('kotoba-billing-primary-v1');
      expect(get).toHaveBeenCalledWith(state.id);
      expect(scans).toBe(2);
      expect(await (await instance.fetch(request('/health'))).json()).toMatchObject({
        configured: false, ready: false, live_google_credentials_verified: false });
      for (const [path, method] of [['/account', 'POST'], ['/verify', 'POST'], ['/account/delete', 'GET'],
        ['/account/deletion', 'POST'], ['/rtdn', 'POST'], ['/tasks/refund-reviews', 'GET'],
        ['/tasks/refund-reviews/notice-1/record', 'POST']]) {
        expect((await instance.fetch(request(path!, token, method))).status).toBe(503);
      }
      expect(state.storage.sql.exec('SELECT COUNT(*) AS count FROM purchases').one().count).toBe(0);
      expect(state.storage.sql.exec('SELECT COUNT(*) AS count FROM deleted_accounts').one().count).toBe(0);
      expect(configured({ ...value, RECEIPT_VERIFICATION_ENABLED: 'true' })).toBe(false);
      expect(configured({ ...value, POLLING_OPERATIONS_VERIFIED: 'true' })).toBe(false);
      expect(configured({ ...value, RECEIPT_VERIFICATION_ENABLED: 'true', POLLING_OPERATIONS_VERIFIED: 'true' })).toBe(true);
    });
  });

  it('rejects absent, forged, wrong-audience and wrong-service identities before scanning', async () => {
    await inStorage(async state => {
      const instance = await initialize(state, configuration());
      const signed = await identity();
      const forged = signed.slice(0, -8) + 'AAAAAAAA';
      for (const token of [undefined, forged, await identity({ aud: origin + '/other' }),
        await identity({ email: 'other@kotoba.iam.gserviceaccount.com' }), await identity({ email_verified: false })]) {
        for (const [path, method] of [['/tasks/status', 'GET'], ['/tasks/reconcile', 'POST']]) {
          expect([401, 403]).toContain((await instance.fetch(request(path!, token, method))).status);
        }
      }
      expect(scans).toBe(0);
      expect(state.storage.sql.exec("SELECT value FROM metadata WHERE key='voided_sync_at'").toArray()).toHaveLength(0);
    });
  });

  it('fails closed for invalid keys, service material, OAuth audience, operations audience and certificate', async () => {
    const overrides: Partial<Env>[] = [
      { ENTITLEMENT_PRIVATE_KEY_PEM: 'invalid-private-key' }, { TOKEN_ENCRYPTION_KEY: 'short' },
      { GOOGLE_SERVICE_ACCOUNT_JSON: '{}' }, { ACCOUNT_HMAC_KEY: 'short' },
      { GOOGLE_OAUTH_CLIENT_ID: 'wrong.example.com' }, { OPS_AUDIENCE: 'http://kotoba-operations.example/ops' },
      { OPS_SERVICE_ACCOUNT_EMAIL: 'wrong@example.com' }, { PLAY_SIGNING_CERT_SHA256: 'A'.repeat(43) + '\n' },
      { RECONCILIATION_ENABLED: 'false' }, { BILLING_EVENT_MODE: 'unknown' },
    ];
    for (const override of overrides) {
      await inStorage(async state => {
        const instance = await initialize(state, { ...configuration(), ...override });
        expect(await (await instance.fetch(request('/health'))).json()).toMatchObject({ configured: false, ready: false });
        expect((await instance.fetch(request('/tasks/reconcile', await identity(), 'POST'))).status).toBe(503);
        expect((await instance.fetch(request('/tasks/status', await identity()))).status).toBe(503);
      });
    }
    expect(scans).toBe(0);
  });

  it('preserves initialized identity fingerprints and rejects later key rotation without a migration', async () => {
    await inStorage(async state => {
      const value = configuration(), token = await identity();
      const first = await initialize(state, value);
      expect((await first.fetch(request('/tasks/reconcile', token, 'POST'))).status).toBe(200);
      const changed = await initialize(state, { ...value, ACCOUNT_HMAC_KEY: 'changed-test-identity-key-32-characters' });
      expect((await changed.fetch(request('/tasks/reconcile', token, 'POST'))).status).toBe(503);
      expect(scans).toBe(1);
      const restored = await initialize(state, value);
      expect((await restored.fetch(request('/tasks/status', token))).status).toBe(200);
    });
  });

  it('rejects malformed and undersized Google signing keys before creating or pinning application state', async () => {
    const weakPair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 1024,
      publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
    const raw = new Uint8Array(await crypto.subtle.exportKey('pkcs8', weakPair.privateKey) as ArrayBuffer);
    const weakPem = '-----BEGIN PRIVATE KEY-----\n' + btoa(String.fromCharCode(...raw)) + '\n-----END PRIVATE KEY-----';
    for (const privateKey of ['-----BEGIN PRIVATE KEY-----\nYWJj\n-----END PRIVATE KEY-----', weakPem]) {
      await inStorage(async state => {
        const value = configuration();
        value.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ type: 'service_account',
          client_email: 'billing@kotoba.iam.gserviceaccount.com', private_key: privateKey });
        const instance = await initialize(state, value), token = await identity();
        expect((await instance.fetch(request('/tasks/status', token))).status).toBe(503);
        expect((await instance.fetch(request('/tasks/reconcile', token, 'POST'))).status).toBe(503);
        expect(await (await instance.fetch(request('/health'))).json()).toMatchObject({ configured: false, ready: false });
        expect(state.storage.sql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('metadata','purchases','notifications','deleted_accounts')").toArray()).toHaveLength(0);
      });
    }
    expect(scans).toBe(0);
  });

  it('allows a valid Google signing-key rotation without changing persistent purchase-identity fingerprints', async () => {
    await inStorage(async state => {
      const value = configuration(), token = await identity(), first = await initialize(state, value);
      expect((await first.fetch(request('/tasks/reconcile', token, 'POST'))).status).toBe(200);
      const identityBefore = state.storage.sql.exec("SELECT key,value FROM metadata WHERE key IN ('play_package','billing_event_mode','account_key_fingerprint','encryption_key_fingerprint') ORDER BY key").toArray();
      const nextPair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
      const raw = new Uint8Array(await crypto.subtle.exportKey('pkcs8', nextPair.privateKey) as ArrayBuffer);
      const nextPem = '-----BEGIN PRIVATE KEY-----\n' + btoa(String.fromCharCode(...raw)) + '\n-----END PRIVATE KEY-----';
      billingPublicKey = nextPair.publicKey;
      const rotated = await initialize(state, { ...value,
        GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ type: 'service_account',
          client_email: 'billing@kotoba.iam.gserviceaccount.com', private_key: nextPem }) });
      expect((await rotated.fetch(request('/tasks/status', token))).status).toBe(200);
      expect((await rotated.fetch(request('/tasks/reconcile', token, 'POST'))).status).toBe(200);
      expect(scans).toBe(2);
      expect(state.storage.sql.exec("SELECT key,value FROM metadata WHERE key IN ('play_package','billing_event_mode','account_key_fingerprint','encryption_key_fingerprint') ORDER BY key").toArray()).toEqual(identityBefore);
      expect((await rotated.fetch(request('/verify', token, 'POST'))).status).toBe(503);
    });
  });
});
