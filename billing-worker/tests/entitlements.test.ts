import { beforeAll, describe, expect, it } from 'vitest';
import { claims, decision, epoch, LIFE, sign, SUB } from '../src/entitlements';
import { base64url_decode, decode_text, to_buffer, to_bytes } from '../src/crypto';

const NOW = 1790460000;
function subscription(state = 'ACTIVE', expiry = NOW + 86400, plan = 'monthly') {
  return { subscriptionState: 'SUBSCRIPTION_STATE_' + state, acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING', lineItems: [{ productId: SUB, offerDetails: { basePlanId: plan }, expiryTime: new Date(expiry * 1000).toISOString() }] };
}

describe('authoritative receipt interpretation', () => {
  it.each(['ACTIVE', 'CANCELED', 'IN_GRACE_PERIOD'])('grants paid-through %s subscription', state => {
    expect(decision(SUB, subscription(state), NOW)).toEqual({ active: true, kind: 'subscription', until: NOW + 86400, ackNeeded: true });
  });
  it.each(['PENDING', 'ON_HOLD', 'PAUSED', 'EXPIRED', 'UNSPECIFIED'])('denies %s subscription', state => {
    expect(decision(SUB, subscription(state), NOW).active).toBe(false);
  });
  it('requires real expiry, approved plan, product and acknowledgement', () => {
    expect(decision(SUB, subscription('ACTIVE', NOW), NOW).active).toBe(false);
    expect(decision(SUB, subscription('ACTIVE', NOW + 900, 'unapproved'), NOW).active).toBe(false);
    expect(decision(SUB, { ...subscription(), acknowledgementState: 'OTHER' }, NOW).active).toBe(false);
    expect(decision(SUB, { ...subscription(), lineItems: [{ productId: 'other', expiryTime: new Date((NOW + 900) * 1000).toISOString() }] }, NOW).active).toBe(false);
    for (const malformed of [null, [], true, 'active', { lineItems: {} }]) expect(decision(SUB, malformed, NOW).active).toBe(false);
  });
  it('accepts only an unconsumed single paid non-consumable', () => {
    expect(decision(LIFE, { purchaseState: 0, acknowledgementState: 0 }, NOW)).toEqual({ active: true, kind: 'lifetime', until: 0, ackNeeded: true });
    expect(decision(LIFE, { purchaseState: 0, acknowledgementState: 1 }, NOW).active).toBe(true);
    for (const receipt of [
      { purchaseState: 1, acknowledgementState: 1 }, { purchaseState: 2, acknowledgementState: 1 },
      { purchaseState: false, acknowledgementState: 1 }, { purchaseState: '0', acknowledgementState: 1 },
      { purchaseState: 0.1, acknowledgementState: 1 }, { purchaseState: 0 },
      { purchaseState: 0, acknowledgementState: true }, { purchaseState: 0, acknowledgementState: 1, consumptionState: 1 },
      { purchaseState: 0, acknowledgementState: 1, consumptionState: null }, { purchaseState: 0, acknowledgementState: 1, quantity: 2 },
      { purchaseState: 0, acknowledgementState: 1, quantity: true }, { purchaseState: 0, acknowledgementState: 1, quantity: null },
      { purchaseState: 0, acknowledgementState: 1, refundableQuantity: 0 }, { purchaseState: 0, acknowledgementState: 1, refundableQuantity: true },
      { purchaseState: 0, acknowledgementState: 1, productId: null }, { purchaseState: 0, acknowledgementState: 1, productId: SUB },
    ]) expect(decision(LIFE, receipt, NOW).active, JSON.stringify(receipt)).toBe(false);
    expect(() => decision('hacked', {}, NOW)).toThrow('Unknown product');
  });
  it('parses aware ISO times and rejects naive, invalid or normalized dates', () => {
    expect(epoch('1970-01-01T00:00:01Z')).toBe(1);
    expect(epoch('1970-01-01T09:00:01.123456+09:00')).toBe(1);
    for (const bad of ['2026-02-30T00:00:00Z', '2026-01-01T24:00:00Z', '2026-01-01T00:00:00', '2026-01-01T00:00:00Z\n', null, 123, {}]) expect(epoch(bad)).toBe(0);
  });
  it('limits active lifetime and subscription leases to one hour and inactive leases to five minutes', () => {
    const active = decision(SUB, subscription(), NOW);
    expect(claims('com.studio501.kotoba', 'installation-1234', SUB, active, NOW, { account: 'owner' })).toMatchObject({ iss: 'studio501.kotoba', aud: 'com.studio501.kotoba', sub: 'installation-1234', account: 'owner', iat: NOW, exp: NOW + 3600, active: true });
    expect(claims('package', 'installation-1234', SUB, decision(SUB, subscription('ACTIVE', NOW + 900), NOW), NOW).exp).toBe(NOW + 900);
    expect(claims('package', 'installation-1234', LIFE, decision(LIFE, { purchaseState: 0, acknowledgementState: 1 }, NOW), NOW).exp).toBe(NOW + 3600);
    expect(claims('package', 'installation-1234', LIFE, decision(LIFE, {}, NOW), NOW).exp).toBe(NOW + 300);
    for (const ttl of [299, 3601, 300.5]) expect(() => claims('package', 'installation-1234', LIFE, active, NOW, { ttl })).toThrow();
    for (const installation of ['short', 'installation-1234\n', 'installation_1234']) expect(() => claims('package', installation, LIFE, active, NOW)).toThrow();
  });
});

describe('real RS256 signatures', () => {
  let pair: CryptoKeyPair, pem: string;
  beforeAll(async () => {
    pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
    const bytes = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey) as ArrayBuffer);
    pem = '-----BEGIN PRIVATE KEY-----\n' + btoa(Array.from(bytes, x => String.fromCharCode(x)).join('')) + '\n-----END PRIVATE KEY-----';
  });
  it('covers the full sorted ASCII payload and rejects tampering', async () => {
    const lease = await sign({ iss: 'studio501.kotoba', active: true, unicode: '日本語😀' }, pem);
    const [a, b, c] = lease.split('.');
    expect(JSON.parse(decode_text(base64url_decode(a!)))).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(decode_text(base64url_decode(b!))).toContain('\\u65e5\\u672c\\u8a9e\\ud83d\\ude00');
    expect(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', pair.publicKey, to_buffer(base64url_decode(c!)), to_buffer(to_bytes(a! + '.' + b!)))).toBe(true);
    expect(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', pair.publicKey, to_buffer(base64url_decode(c!)), to_buffer(to_bytes(a! + '.' + b! + 'x')))).toBe(false);
  });
  it('rejects weak RSA and unrelated/encrypted PEM formats', async () => {
    const weak = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 1024, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
    const bytes = new Uint8Array(await crypto.subtle.exportKey('pkcs8', weak.privateKey) as ArrayBuffer);
    const weakPem = '-----BEGIN PRIVATE KEY-----\n' + btoa(Array.from(bytes, x => String.fromCharCode(x)).join('')) + '\n-----END PRIVATE KEY-----';
    await expect(sign({ active: true }, weakPem)).rejects.toThrow('at least 2048');
    await expect(sign({ active: true }, '-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----')).rejects.toThrow();
    await expect(sign({ active: true }, pem.replace(/PRIVATE KEY/g, 'ENCRYPTED PRIVATE KEY'))).rejects.toThrow();
  });
});
