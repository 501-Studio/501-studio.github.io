import { describe, expect, it } from 'vitest';
import { challenge, check_confirmation, check_fresh_identity, MAX_AGE, web_origin } from '../src/deletion';
import { hmac_sha256_hex } from '../src/crypto';

const NOW = 1790460000, SECRET = 'test-only-account-key-with-32-characters', PACKAGE = 'com.studio501.kotoba';

describe('purpose-bound account deletion confirmation', () => {
  it('requires enabled HTTPS origin without credentials, path, query, fragments or wildcards', () => {
    expect(web_origin({ ACCOUNT_DELETION_ENABLED: 'false', ACCOUNT_DELETION_WEB_ORIGIN: 'https://billing.test' })).toBeNull();
    expect(web_origin({ ACCOUNT_DELETION_ENABLED: 'true', ACCOUNT_DELETION_WEB_ORIGIN: 'https://billing.test' })).toBe('https://billing.test');
    expect(web_origin({ ACCOUNT_DELETION_ENABLED: 'true', ACCOUNT_DELETION_WEB_ORIGIN: 'https://billing.test:8443' })).toBe('https://billing.test:8443');
    for (const origin of ['http://billing.test', 'https://user:pass@billing.test', 'https://billing.test/', 'https://billing.test/path', 'https://billing.test?x=1', 'https://billing.test#x', 'https://*.test', 'https://billing.test:0', 'https://billing.test:0000', 'https://billing.test\n', 'https://billing.test\\evil', '', null]) expect(web_origin({ ACCOUNT_DELETION_ENABLED: 'true', ACCOUNT_DELETION_WEB_ORIGIN: origin }), String(origin)).toBeNull();
  });
  it('creates a random nonce with exact Python-compatible HMAC cookie', async () => {
    const [nonce, cookie] = await challenge(SECRET, PACKAGE, NOW);
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookie).toBe(`${nonce}.${NOW}.${await hmac_sha256_hex(SECRET, `deletion-confirmation:${PACKAGE}:${nonce}:${NOW}`)}`);
    expect(await check_confirmation(cookie, nonce, SECRET, PACKAGE, NOW)).toBe(NOW);
    expect((await challenge(SECRET, PACKAGE, NOW))[0]).not.toBe(nonce);
  });
  it('rejects stale, future, altered, mismatched and cross-purpose cookies', async () => {
    const [nonce, cookie] = await challenge(SECRET, PACKAGE, NOW);
    expect(await check_confirmation(cookie, nonce, SECRET, PACKAGE, NOW + MAX_AGE)).toBe(NOW);
    await expect(check_confirmation(cookie, nonce, SECRET, PACKAGE, NOW + MAX_AGE + 1)).rejects.toMatchObject({ code: 'deletion_confirmation_expired_or_invalid', status: 403 });
    await expect(check_confirmation(cookie, nonce, SECRET, PACKAGE, NOW - 31)).rejects.toMatchObject({ status: 403 });
    for (const [testCookie, testNonce, secret, packageName] of [
      [cookie.slice(0, -1) + (cookie.endsWith('0') ? '1' : '0'), nonce, SECRET, PACKAGE],
      [cookie, 'A'.repeat(43), SECRET, PACKAGE], [cookie, nonce, SECRET + 'x', PACKAGE],
      [cookie, nonce, SECRET, 'other.package'], [cookie + '\n', nonce, SECRET, PACKAGE],
      [cookie, nonce + '\n', SECRET, PACKAGE], [cookie, '가', SECRET, PACKAGE],
    ]) await expect(check_confirmation(testCookie, testNonce, secret!, packageName!, NOW)).rejects.toMatchObject({ status: 403 });
  });
  it('requires a fresh signed identity with the exact purpose nonce and integer iat', () => {
    const nonce = 'A'.repeat(43);
    expect(() => check_fresh_identity({ nonce, iat: NOW }, nonce, NOW, NOW)).not.toThrow();
    expect(() => check_fresh_identity({ nonce, iat: NOW - 30 }, nonce, NOW, NOW)).not.toThrow();
    for (const info of [{ nonce, iat: NOW - 31 }, { nonce, iat: NOW + 31 }, { nonce, iat: true }, { nonce, iat: String(NOW) }, { nonce, iat: NOW + 0.5 }, { nonce: 'B'.repeat(43), iat: NOW }, { nonce: nonce + '\n', iat: NOW }, {}]) expect(() => check_fresh_identity(info, nonce, NOW, NOW)).toThrow();
  });
});
