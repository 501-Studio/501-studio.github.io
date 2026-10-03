/** Short-lived, purpose-bound confirmation; Google remains the identity authority. */
import { BillingError, type JsonObject } from './types';
import { base64url_encode, compare_digest, hmac_sha256_hex } from './crypto';

export const COOKIE = 'kotoba_deletion_confirmation';
export const MAX_AGE = 300;

export function web_origin(config: Record<string, unknown>): string | null {
  if (config.ACCOUNT_DELETION_ENABLED !== 'true') return null;
  const value = config.ACCOUNT_DELETION_WEB_ORIGIN;
  if (typeof value !== 'string' || /[\\\x00-\x20\x7f]/.test(value)) return null;
  try {
    // URL normalizes paths/hosts/default ports: inspect the original spelling too.
    const match = /^https:\/\/([^/?#]+)(?![\s\S])/.exec(value);
    const parsed = new URL(value);
    if (!match || !parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash || value.includes('*') || parsed.port === '0' || /:0(?![\s\S])/.test(match[1]!) || parsed.protocol !== 'https:') return null;
    return value;
  } catch { return null; }
}

export async function challenge(secret: string, package_name: string, now = Math.floor(Date.now() / 1000)): Promise<[string, string]> {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid deletion timestamp');
  const nonce = base64url_encode(crypto.getRandomValues(new Uint8Array(32)));
  const signature = await hmac_sha256_hex(secret, `deletion-confirmation:${package_name}:${nonce}:${now}`);
  return [nonce, `${nonce}.${now}.${signature}`];
}

export async function check_confirmation(cookie: unknown, nonce: unknown, secret: string, package_name: string, now = Math.floor(Date.now() / 1000)): Promise<number> {
  if (typeof cookie !== 'string' || !/^[A-Za-z0-9_-]{43}\.[0-9]{1,16}\.[a-f0-9]{64}(?![\s\S])/.test(cookie) || typeof nonce !== 'string' || !/^[A-Za-z0-9_-]{43}(?![\s\S])/.test(nonce)) throw new BillingError('deletion_confirmation_required', 403);
  const [expected, stamp, signature] = cookie.split('.');
  const issued = Number(stamp);
  const valid_signature = await hmac_sha256_hex(secret, `deletion-confirmation:${package_name}:${expected}:${issued}`);
  if (!Number.isSafeInteger(issued) || !compare_digest(signature!, valid_signature) || !compare_digest(nonce, expected!) || now - MAX_AGE > issued || issued > now + 30) throw new BillingError('deletion_confirmation_expired_or_invalid', 403);
  return issued;
}

export function check_fresh_identity(info: JsonObject, nonce: string, issued: number, now = Math.floor(Date.now() / 1000)): void {
  const token_nonce = info.nonce, stamp = info.iat;
  if (typeof token_nonce !== 'string' || !/^[A-Za-z0-9_-]{43}(?![\s\S])/.test(token_nonce) || !compare_digest(token_nonce, nonce) || typeof stamp !== 'number' || !Number.isSafeInteger(stamp) || Math.max(now - MAX_AGE, issued - 30) > stamp || stamp > now + 30) throw new BillingError('fresh_deletion_sign_in_required', 401);
}
