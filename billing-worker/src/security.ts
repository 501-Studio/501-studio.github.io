/** Verified Google identities and request-bound Standard Play Integrity. */
import { BillingError, type JsonObject } from './types';
import { base64url_decode, base64url_encode, canonical_json, decode_text, hmac_sha256_hex, to_buffer, to_bytes } from './crypto';

const GOOGLE_JWKS = 'https://www.googleapis.com/oauth2/v3/certs';
const MAX_JWKS_BYTES = 65_536;
type GoogleKey = JsonWebKey & { kid?: string; alg?: string; use?: string };
let key_cache: { keys: GoogleKey[]; expires: number } | undefined;
let pending_keys: Promise<GoogleKey[]> | undefined;

function object(value: unknown): value is JsonObject { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function integer(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value); }

export function bearer(header: unknown): string {
  if (typeof header !== 'string' || !/^Bearer [A-Za-z0-9_.-]{16,16384}(?![\s\S])/.test(header)) throw new BillingError('authentication_required', 401);
  return header.slice(7);
}

async function fetch_keys(force = false): Promise<GoogleKey[]> {
  const now = Date.now();
  if (!force && key_cache && key_cache.expires > now) return key_cache.keys;
  if (pending_keys) return pending_keys;
  const load = async (): Promise<GoogleKey[]> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      // A static trusted endpoint; token headers can never choose a key URL.
      const response = await fetch(GOOGLE_JWKS, { signal: controller.signal, redirect: 'error' });
      if (!response.ok || !response.body) throw new Error('Google identity keys unavailable');
      const advertised = response.headers.get('Content-Length');
      if (advertised && Number(advertised) > MAX_JWKS_BYTES) throw new Error('Google identity keys unavailable');
      const reader = response.body.getReader(), chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_JWKS_BYTES) { await reader.cancel(); throw new Error('Google identity keys unavailable'); }
        chunks.push(value);
      }
      const raw = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) { raw.set(chunk, offset); offset += chunk.length; }
      const body: unknown = JSON.parse(decode_text(raw));
      if (!object(body) || !Array.isArray(body.keys) || body.keys.length < 1 || body.keys.length > 100 || !body.keys.every(object)) throw new Error('Google identity keys unavailable');
      const keys = body.keys as unknown as GoogleKey[];
      const max_age = /(?:^|,)\s*max-age=(\d+)/i.exec(response.headers.get('Cache-Control') ?? '');
      const seconds = max_age ? Math.min(3600, Number(max_age[1])) : 300;
      key_cache = { keys, expires: Date.now() + seconds * 1000 };
      return keys;
    } catch {
      // Routes map outages to their existing temporary-unavailable response. No token/key details leak.
      throw new Error('Google identity keys unavailable');
    } finally { clearTimeout(timer); }
  };
  pending_keys = load();
  try { return await pending_keys; } finally { pending_keys = undefined; }
}

export async function google_identity(token: string, audience: string, options: { service_email?: string } = {}): Promise<JsonObject> {
  let parts: string[], header: JsonObject, info: JsonObject, signature: Uint8Array;
  try {
    if (typeof token !== 'string' || token.length > 16_384) throw new Error('Invalid token');
    parts = token.split('.');
    if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+(?![\s\S])/.test(part))) throw new Error('Invalid token');
    const raw_header: unknown = JSON.parse(decode_text(base64url_decode(parts[0]!)));
    const raw_info: unknown = JSON.parse(decode_text(base64url_decode(parts[1]!)));
    if (!object(raw_header) || !object(raw_info)) throw new Error('Invalid token');
    header = raw_header; info = raw_info; signature = base64url_decode(parts[2]!);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !/^[A-Za-z0-9_-]{1,256}(?![\s\S])/.test(header.kid) || 'crit' in header) throw new Error('Invalid token');
  } catch { throw new BillingError('invalid_identity', 401); }

  let keys = await fetch_keys();
  if (!keys.some(key => key.kid === header.kid)) keys = await fetch_keys(true); // bounded cache refresh on Google key rotation
  try {
    const matching = keys.filter(key => key.kid === header.kid);
    if (matching.length !== 1) throw new Error('Invalid key');
    const jwk = matching[0]!;
    if (jwk.kty !== 'RSA' || (jwk.alg !== undefined && jwk.alg !== 'RS256') || (jwk.use !== undefined && jwk.use !== 'sig') || typeof jwk.n !== 'string' || typeof jwk.e !== 'string') throw new Error('Invalid key');
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if ((key.algorithm as { modulusLength: number }).modulusLength < 2048 || !await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, to_buffer(signature), to_buffer(to_bytes(parts[0]! + '.' + parts[1]!)))) throw new Error('Invalid signature');
    const now = Math.floor(Date.now() / 1000);
    if ((info.iss !== 'accounts.google.com' && info.iss !== 'https://accounts.google.com') || info.aud !== audience || !integer(info.iat) || !integer(info.exp) || info.iat > now || info.exp <= now || info.exp < info.iat || ('nbf' in info && (!integer(info.nbf) || info.nbf > now))) throw new Error('Invalid identity claims');
  } catch { throw new BillingError('invalid_identity', 401); }
  if (options.service_email !== undefined) {
    if (info.email !== options.service_email || info.email_verified !== true) throw new BillingError('invalid_push_identity', 403);
  } else if (typeof info.sub !== 'string' || !/^[0-9]{1,255}(?![\s\S])/.test(info.sub)) throw new BillingError('invalid_identity', 401);
  return info;
}

export async function account_id(subject: string, secret: string): Promise<string> {
  if (typeof secret !== 'string' || to_bytes(secret).length < 32) throw new BillingError('account_auth_not_configured', 503);
  return hmac_sha256_hex(secret, 'google:' + subject);
}

export async function request_hash(package_name: string, product: string, token: string, installation: string, owner: string): Promise<string> {
  const content = { accountId: owner, installationId: installation, packageName: package_name, productId: product, purchaseToken: token };
  return base64url_encode(await crypto.subtle.digest('SHA-256', to_buffer(to_bytes(canonical_json(content)))));
}

export function check_integrity(value: unknown, package_name: string, expected_hash: string, certificates: string[], now = Math.floor(Date.now() / 1000)): void {
  let valid = false;
  if (object(value) && object(value.requestDetails) && object(value.appIntegrity) && object(value.accountDetails) && object(value.deviceIntegrity)) {
    const details = value.requestDetails, application = value.appIntegrity;
    const timestamp = details.timestampMillis;
    const millis = integer(timestamp) ? timestamp : typeof timestamp === 'string' && /^-?[0-9]{1,16}(?![\s\S])/.test(timestamp) ? Number(timestamp) : NaN;
    const stamped = millis / 1000, digests = application.certificateSha256Digest, verdicts = value.deviceIntegrity.deviceRecognitionVerdict;
    valid = Number.isSafeInteger(millis) && details.requestPackageName === package_name && details.requestHash === expected_hash && now - 120 <= stamped && stamped <= now + 30 && application.appRecognitionVerdict === 'PLAY_RECOGNIZED' && application.packageName === package_name && Array.isArray(digests) && digests.every(item => typeof item === 'string') && digests.some(item => certificates.includes(item)) && value.accountDetails.appLicensingVerdict === 'LICENSED' && Array.isArray(verdicts) && verdicts.includes('MEETS_DEVICE_INTEGRITY');
  }
  if (!valid) throw new BillingError('app_integrity_required', 403);
}
