import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { base64url_decode, base64url_encode, canonical_json, Fernet, to_buffer, to_bytes } from '../src/crypto';

const SECRET = 'test-only-account-key-with-32-characters', PACKAGE = 'com.studio501.kotoba';
const NOW = Math.floor(Date.now() / 1000), CERTIFICATE = 'A'.repeat(43);
let security: typeof import('../src/security');
let pair: CryptoKeyPair, jwk: JsonWebKey, fetch_mock: ReturnType<typeof vi.fn>;

async function token(changes: Record<string, unknown> = {}, headerChanges: Record<string, unknown> = {}): Promise<string> {
  const header = { alg: 'RS256', kid: 'test-key', typ: 'JWT', ...headerChanges };
  const claims = { iss: 'https://accounts.google.com', aud: 'expected.apps.googleusercontent.com', sub: '123456789', iat: NOW - 10, exp: NOW + 3600, ...changes };
  const content = base64url_encode(to_bytes(JSON.stringify(header))) + '.' + base64url_encode(to_bytes(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, to_buffer(to_bytes(content)));
  return content + '.' + base64url_encode(signature);
}

beforeAll(async () => {
  pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  jwk = await crypto.subtle.exportKey('jwk', pair.publicKey) as JsonWebKey;
});
beforeEach(async () => {
  vi.resetModules();
  security = await import('../src/security');
  fetch_mock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ keys: [{ ...jwk, kid: 'test-key', alg: 'RS256', use: 'sig' }] }), { headers: { 'Cache-Control': 'max-age=3600' } }));
  vi.stubGlobal('fetch', fetch_mock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Google identity signature boundary', () => {
  it('verifies real RSA signature with the static trusted Google JWKS endpoint', async () => {
    const signed = await token();
    expect(await security.google_identity(signed, 'expected.apps.googleusercontent.com')).toMatchObject({ sub: '123456789' });
    expect(fetch_mock).toHaveBeenCalledWith('https://www.googleapis.com/oauth2/v3/certs', expect.objectContaining({ redirect: 'error', signal: expect.any(AbortSignal) }));
    await security.google_identity(signed, 'expected.apps.googleusercontent.com');
    expect(fetch_mock).toHaveBeenCalledTimes(1);
  });
  it('rejects tampered payload/signature, none and algorithm confusion', async () => {
    const signed = await token(), parts = signed.split('.');
    parts[1] = base64url_encode(to_bytes(JSON.stringify({ iss: 'https://accounts.google.com', aud: 'expected.apps.googleusercontent.com', sub: '999', iat: NOW - 10, exp: NOW + 3600 })));
    await expect(security.google_identity(parts.join('.'), 'expected.apps.googleusercontent.com')).rejects.toMatchObject({ code: 'invalid_identity', status: 401 });
    for (const alg of ['none', 'HS256', 'RS512']) await expect(security.google_identity(await token({}, { alg }), 'expected.apps.googleusercontent.com')).rejects.toMatchObject({ status: 401 });
    await expect(security.google_identity(signed + '\n', 'expected.apps.googleusercontent.com')).rejects.toMatchObject({ status: 401 });
    await expect(security.google_identity(await token({}, { crit: ['unknown'] }), 'expected.apps.googleusercontent.com')).rejects.toMatchObject({ status: 401 });
  });
  it('requires issuer, exact audience, numeric subject and valid integer signed times', async () => {
    // Other suites deliberately wait for a body deadline; keep this signed-time
    // boundary independent of their wall-clock duration. afterEach restores it.
    vi.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
    for (const changes of [{ iss: 'https://evil.test' }, { aud: 'evil' }, { aud: ['expected.apps.googleusercontent.com'] }, { sub: '123\n' }, { sub: 123 }, { exp: NOW - 1 }, { iat: NOW + 60 }, { iat: true }, { exp: String(NOW + 3600) }, { exp: NOW + 0.5 }, { nbf: NOW + 1 }]) await expect(security.google_identity(await token(changes), 'expected.apps.googleusercontent.com')).rejects.toMatchObject({ code: 'invalid_identity', status: 401 });
    expect(await security.google_identity(await token({ iss: 'accounts.google.com' }), 'expected.apps.googleusercontent.com')).toMatchObject({ sub: '123456789' });
  });
  it('checks service account email and a true signed verification flag', async () => {
    const service_email = 'rtdn@test.iam.gserviceaccount.com';
    expect(await security.google_identity(await token({ email: service_email, email_verified: true }), 'expected.apps.googleusercontent.com', { service_email })).toMatchObject({ email: service_email });
    for (const changes of [{ email: 'attacker@test' }, { email_verified: false }, { email_verified: 'true' }]) await expect(security.google_identity(await token({ email: service_email, email_verified: true, ...changes }), 'expected.apps.googleusercontent.com', { service_email })).rejects.toMatchObject({ code: 'invalid_push_identity', status: 403 });
  });
  it('refreshes on key rotation and denies unknown or ambiguous keys', async () => {
    const signed = await token();
    await security.google_identity(signed, 'expected.apps.googleusercontent.com');
    fetch_mock.mockImplementation(async () => new Response(JSON.stringify({ keys: [{ ...jwk, kid: 'rotated-key', alg: 'RS256', use: 'sig' }] })));
    expect(await security.google_identity(await token({}, { kid: 'rotated-key' }), 'expected.apps.googleusercontent.com')).toMatchObject({ sub: '123456789' });
    expect(fetch_mock).toHaveBeenCalledTimes(2);
    await expect(security.google_identity(signed, 'expected.apps.googleusercontent.com')).rejects.toMatchObject({ status: 401 });
    fetch_mock.mockImplementation(async () => new Response(JSON.stringify({ keys: [{ ...jwk, kid: 'duplicate' }, { ...jwk, kid: 'duplicate' }] })));
    await expect(security.google_identity(await token({}, { kid: 'duplicate' }), 'expected.apps.googleusercontent.com')).rejects.toMatchObject({ status: 401 });
  });
  it('bounds key responses and propagates sanitized outages without identity acceptance', async () => {
    fetch_mock.mockImplementation(async () => new Response('x'.repeat(65_537)));
    await expect(security.google_identity(await token(), 'expected.apps.googleusercontent.com')).rejects.toThrow('Google identity keys unavailable');
    fetch_mock.mockRejectedValue(new Error('private-url-and-token'));
    await expect(security.google_identity(await token(), 'expected.apps.googleusercontent.com')).rejects.toThrow('Google identity keys unavailable');
  });
});

describe('request binding and encryption interoperability', () => {
  it('requires strict bearer syntax including absolute end-of-input', () => {
    expect(security.bearer('Bearer ' + 'a'.repeat(16))).toBe('a'.repeat(16));
    for (const value of [null, 'bearer ' + 'a'.repeat(16), 'Bearer short', 'Bearer ' + 'a'.repeat(16) + '\n', 'Bearer ' + 'a'.repeat(16385), 'Bearer ' + 'a'.repeat(16) + ' ']) expect(() => security.bearer(value)).toThrow();
  });
  it('matches independent Python HMAC and ASCII JSON request hash vectors', async () => {
    expect(await security.account_id('123456789', SECRET)).toBe('d22d337752544d6845cfd53364aaf9ff08a09685d4f7ad4b71d5dacae9cf4f7e');
    expect(await security.request_hash(PACKAGE, 'kotoba_lifetime', '購入😀\x7f', 'installation-1234', 'a'.repeat(64))).toBe('SLOjJpYXe1Xyb6bmzRIOCnNdlX0DGCUZEjDaUNHlS0s');
    expect(canonical_json({ z: '\x7f', a: '日本😀' })).toBe('{"a":"\\u65e5\\u672c\\ud83d\\ude00","z":"\\u007f"}');
    await expect(security.account_id('123', 'short')).rejects.toMatchObject({ code: 'account_auth_not_configured', status: 503 });
  });
  it('requires every Standard Integrity package/hash/signature/time/license/device verdict', () => {
    function payload() { return { requestDetails: { requestPackageName: PACKAGE, requestHash: 'hash', timestampMillis: String(NOW * 1000) }, appIntegrity: { appRecognitionVerdict: 'PLAY_RECOGNIZED', packageName: PACKAGE, certificateSha256Digest: [CERTIFICATE] }, accountDetails: { appLicensingVerdict: 'LICENSED' }, deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'] } }; }
    expect(() => security.check_integrity(payload(), PACKAGE, 'hash', [CERTIFICATE], NOW)).not.toThrow();
    for (const [group, key, value] of [['requestDetails', 'requestHash', 'wrong'], ['requestDetails', 'requestPackageName', 'evil.app'], ['requestDetails', 'timestampMillis', String((NOW - 121) * 1000)], ['requestDetails', 'timestampMillis', String((NOW + 31) * 1000)], ['requestDetails', 'timestampMillis', true], ['appIntegrity', 'appRecognitionVerdict', 'UNRECOGNIZED_VERSION'], ['appIntegrity', 'packageName', 'evil.app'], ['appIntegrity', 'certificateSha256Digest', ['B'.repeat(43)]], ['accountDetails', 'appLicensingVerdict', 'UNLICENSED'], ['deviceIntegrity', 'deviceRecognitionVerdict', []]] as [string, string, unknown][]) {
      const changed = payload() as unknown as Record<string, Record<string, unknown>>; changed[group]![key] = value;
      expect(() => security.check_integrity(changed, PACKAGE, 'hash', [CERTIFICATE], NOW)).toThrow();
    }
    for (const malformed of [null, [], { requestDetails: [], appIntegrity: {} }, { ...payload(), accountDetails: [] }]) expect(() => security.check_integrity(malformed, PACKAGE, 'hash', [CERTIFICATE], NOW)).toThrow();
  });
  it('decrypts a real Python cryptography Fernet fixture and emits the identical format', async () => {
    const key = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=';
    const fixture = 'gAAAAABquEBgAAECAwQFBgcICQoLDA0OD5rMUOs6p0IXze5KcVIFaSUknxzgxRmbVymFjV1EDTTgNqmX14v-DZ82lufXt2423a90ZS5HmBlJBxWGxaAHaA8=';
    const text = 'purchase secret 日本語😀\x00', cipher = new Fernet(key);
    expect(await cipher.decrypt(fixture)).toBe(text);
    const native = crypto;
    vi.stubGlobal('crypto', { subtle: native.subtle, getRandomValues: (array: Uint8Array) => { array.set(Uint8Array.from({ length: 16 }, (_, i) => i)); return array; } });
    expect(await cipher.encrypt(text, 1790460000)).toBe(fixture);
  });
  it('rejects Fernet altered HMAC, wrong keys, truncated tokens and non-canonical base64', async () => {
    const key = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=', cipher = new Fernet(key);
    const encrypted = await cipher.encrypt('secret');
    const bytes = base64url_decode(encrypted); bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
    for (const invalid of [base64url_encode(bytes, true), encrypted.slice(0, 20), encrypted + '\n', 'AAAA']) await expect(cipher.decrypt(invalid)).rejects.toThrow('Invalid Fernet token');
    await expect(new Fernet(base64url_encode(new Uint8Array(32).fill(1), true)).decrypt(encrypted)).rejects.toThrow('Invalid Fernet token');
    expect(() => new Fernet('short')).toThrow();
  });
});
