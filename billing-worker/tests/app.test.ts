import { env, exports } from 'cloudflare:workers';
import { evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { BillingCoordinator } from '../src/index';
import { create_router } from '../src/app';
import { Store } from '../src/persistence';
import { BillingService } from '../src/service';
import { account_id, request_hash } from '../src/security';
import { challenge, COOKIE } from '../src/deletion';
import { LIFE } from '../src/entitlements';
import type { Env, JsonObject } from '../src/types';
import { FakePlay, KEY, PACKAGE, SUBSCRIPTION, TOKEN, product } from './fixtures';

let privatePem: string;
beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey) as ArrayBuffer);
  privatePem = '-----BEGIN PRIVATE KEY-----\n' + btoa(String.fromCharCode(...raw)) + '\n-----END PRIVATE KEY-----';
});
const secret = 'integration-only-hmac-secret-not-production';
const origin = 'https://kotoba-test.example';
const config = (): Env => ({ ...(env as unknown as Env), PLAY_PACKAGE: PACKAGE,
  GOOGLE_OAUTH_CLIENT_ID: 'test.apps.googleusercontent.com', ACCOUNT_HMAC_KEY: secret,
  ENTITLEMENT_PRIVATE_KEY_PEM: privatePem, PLAY_SIGNING_CERT_SHA256: 'A'.repeat(43),
  RECEIPT_VERIFICATION_ENABLED: 'false', ACCOUNT_DELETION_ENABLED: 'true',
  ACCOUNT_DELETION_WEB_ORIGIN: origin, PUBSUB_SUBSCRIPTION: SUBSCRIPTION,
  OPS_AUDIENCE: origin + '/ops', OPS_SERVICE_ACCOUNT_EMAIL: 'operator@kotoba.iam.gserviceaccount.com' });

const post = (path: string, value: unknown, headers: Record<string, string> = {}) => new Request(origin + path, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-identity-credential', ...headers },
  body: JSON.stringify(value),
});
const request = () => post('/verify', { packageName: PACKAGE, productId: LIFE, purchaseToken: TOKEN,
  installationId: 'installation-12345', integrityToken: 'integrity-test-token' });

async function setup(state: DurableObjectState, nonce = '') {
  const store = new Store(state.storage, KEY), play = new FakePlay();
  const owner = await account_id('123456789', secret), now = Math.floor(Date.now() / 1000);
  play.receipts[TOKEN] = product(owner);
  play.decode_integrity = async () => ({ requestDetails: { requestPackageName: PACKAGE,
    requestHash: await request_hash(PACKAGE, LIFE, TOKEN, 'installation-12345', owner), timestampMillis: String(Date.now()) },
    appIntegrity: { appRecognitionVerdict: 'PLAY_RECOGNIZED', packageName: PACKAGE, certificateSha256Digest: ['A'.repeat(43)] },
    accountDetails: { appLicensingVerdict: 'LICENSED' }, deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'] } });
  await store.transaction(async db => { store.set_metadata(db, 'voided_sync_at', now); });
  const service = new BillingService(store, play);
  const verifyIdentity = async () => ({ sub: '123456789', iat: now, nonce, email: config().OPS_SERVICE_ACCOUNT_EMAIL! });
  return { store, play, service, owner, router: create_router(config(), service, true, verifyIdentity) };
}

describe('HTTP contract and actual Durable Object request serialization', () => {
  it('default production Worker is live but all paid/deletion operations remain disabled', async () => {
    const health = await exports.default.fetch(origin + '/health');
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ configured: false, ready: false, live_google_credentials_verified: false });
    const verify = await exports.default.fetch(request());
    expect(verify.status).toBe(503);
    expect(await verify.json()).toEqual({ error: 'service_not_configured' });
    expect(verify.headers.get('Cache-Control')).toBe('no-store');
    const deletion = await exports.default.fetch(origin + '/account/delete');
    expect(deletion.status).toBe(503);
  });

  it('serializes lease lookup/signing before concurrent deletion, then permanently returns Android 410', async () => {
    const namespace = (env as unknown as Env).BILLING_STATE;
    const stub = namespace.get(namespace.idFromName(crypto.randomUUID()));
    await runInDurableObject<BillingCoordinator, void>(stub, async (instance, state) => {
      const [nonce, value] = await challenge(secret, PACKAGE);
      const { store, play, owner, router } = await setup(state, nonce);
      Object.assign(instance, { router }); // Test-only boundary injection; production Env has no mock flags.
      let entered!: () => void, release!: () => void;
      const enteredLookup = new Promise<void>(resolve => { entered = resolve; });
      const holdLookup = new Promise<void>(resolve => { release = resolve; });
      const lookup = play.lookup.bind(play);
      play.lookup = async (productId, token) => { entered(); await holdLookup; return lookup(productId, token); };
      const verifying = instance.fetch(request());
      await enteredLookup;
      const deleting = instance.fetch(post('/account/deletion', { confirmDeletion: true, nonce },
        { Origin: origin, Cookie: `${COOKIE}=${value}` }));
      // Deletion cannot commit while the earlier Google lookup/signing is unfinished.
      expect(store.one('SELECT COUNT(*) AS count FROM deleted_accounts')?.count).toBe(0);
      release();
      const leaseResponse = await verifying, deletionResponse = await deleting;
      expect(leaseResponse.status).toBe(200);
      expect((await leaseResponse.json() as JsonObject).lease).toMatch(/^[A-Za-z0-9_.-]+$/);
      expect(deletionResponse.status).toBe(200);
      expect(await deletionResponse.json()).toMatchObject({ status: 'deleted', offlineLeaseMaxSeconds: 3600 });
      expect((await store.transaction(db => store.purchase(db, TOKEN)))?.token_cipher).toBe('');
      const after = await instance.fetch(request());
      expect(after.status).toBe(410);
      expect(await after.json()).toEqual({ error: 'account_deleted' });
      expect(await store.transaction(db => store.account_deleted(db, owner))).not.toBeNull();
    });
    // Eviction recreates the actor, but must not recreate deleted owners or old benefits.
    await evictDurableObject(stub);
    await runInDurableObject<BillingCoordinator, void>(stub, async (instance, state) => {
      const { router } = await setup(state);
      Object.assign(instance, { router });
      const afterRestart = await instance.fetch(post('/account', {}));
      expect(afterRestart.status).toBe(410);
      expect(await afterRestart.json()).toEqual({ error: 'account_deleted' });
    });
  });

  it('checks exact deletion origin, explicit confirmation, fresh sign-in and body limits', async () => {
    const namespace = (env as unknown as Env).BILLING_STATE;
    const stub = namespace.get(namespace.idFromName(crypto.randomUUID()));
    await runInDurableObject<BillingCoordinator, void>(stub, async (_instance, state) => {
      const { router } = await setup(state);
      const page = await router(new Request(origin + '/account/delete'));
      expect(page.status).toBe(200);
      expect(page.headers.get('Set-Cookie')).toContain('Secure; HttpOnly; SameSite=Strict');
      expect(page.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
      expect(await page.text()).not.toContain('{{');
      const crossSite = await router(post('/account/deletion', { confirmDeletion: true, nonce: 'A'.repeat(43) }, { Origin: 'https://attacker.example' }));
      expect(crossSite.status).toBe(403);
      const hidden = await router(post('/account/deletion', { confirmDeletion: false, nonce: 'A'.repeat(43) }, { Origin: origin }));
      expect(await hidden.json()).toEqual({ error: 'explicit_deletion_confirmation_required' });
      const oversized = await router(post('/verify', { junk: 'x'.repeat(50000) }));
      expect(oversized.status).toBe(413);
      const wrongInstallation = await router(post('/verify', { packageName: PACKAGE, productId: LIFE,
        purchaseToken: TOKEN, installationId: 'installation-12345\n' }));
      expect(wrongInstallation.status).toBe(400);
    });
  });

  it('bounds an unfinished client stream and releases the actor queue for subsequent requests', async () => {
    const namespace = (env as unknown as Env).BILLING_STATE;
    const stub = namespace.get(namespace.idFromName(crypto.randomUUID()));
    await runInDurableObject<BillingCoordinator, void>(stub, async (instance, state) => {
      const { router } = await setup(state);
      Object.assign(instance, { router });
      let cancelled = false;
      const body = new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(new TextEncoder().encode('{"packageName":')); },
        cancel() { cancelled = true; },
      });
      const slow = instance.fetch(new Request(origin + '/verify', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body }));
      const next = instance.fetch(post('/account', {}));
      const timedOut = await slow;
      expect(timedOut.status).toBe(408);
      expect(await timedOut.json()).toEqual({ error: 'request_body_timeout' });
      expect(cancelled).toBe(true);
      expect((await next).status).toBe(200);
    });
  });
});
