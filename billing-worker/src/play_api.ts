import { SUB, LIFE } from './entitlements';
import { BillingError, is_record, type JsonObject, type PlayApi } from './types';
import { parse_google_json } from './google_json';
import { base64url_encode, canonical_json, import_rsa_private_key, to_buffer, to_bytes } from './crypto';

type Fetcher = typeof fetch;
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPES = {
  androidpublisher: 'https://www.googleapis.com/auth/androidpublisher',
  playintegrity: 'https://www.googleapis.com/auth/playintegrity',
} as const;
type Scope = keyof typeof SCOPES;

// Bound both response download and API time, and never follow redirects containing tokens.
async function request_json(fetcher: Fetcher, url: string, init: RequestInit,
                            timeoutMs: number, allowed: readonly number[] = [200]): Promise<JsonObject> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, { ...init, signal: controller.signal, redirect: 'error' });
    if (!allowed.includes(response.status)) throw new Error('google_api_unavailable');
    if (response.status === 204 || response.status === 409) {
      await response.body?.cancel();
      return {};
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('invalid_google_response');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 8 * 1024 * 1024) throw new Error('google_response_too_large');
        chunks.push(value);
      }
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      throw error;
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    if (size === 0 && allowed.includes(204)) return {};
    return parse_google_json(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes));
  } finally {
    clearTimeout(timer);
  }
}

export class PlayClient implements PlayApi {
  private readonly email: string;
  private readonly key: string;
  private signingKey?: Promise<CryptoKey>;
  private readonly root: string;
  private readonly access = new Map<Scope, { token: string; expires: number }>();

  constructor(private readonly packageName: string, credentialsJson: string,
              private readonly fetcher: Fetcher = fetch,
              private readonly clock: () => number = () => Date.now() / 1000) {
    const credentials: unknown = JSON.parse(credentialsJson);
    if (!/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+(?![\s\S])/.test(packageName)
        || !is_record(credentials) || credentials.type !== 'service_account'
        || typeof credentials.client_email !== 'string'
        || !/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.iam\.gserviceaccount\.com(?![\s\S])/.test(credentials.client_email)
        || typeof credentials.private_key !== 'string'
        || !credentials.private_key.startsWith('-----BEGIN PRIVATE KEY-----')
        || (credentials.token_uri !== undefined && credentials.token_uri !== TOKEN_URL)) {
      throw new Error('invalid_google_credentials');
    }
    this.email = credentials.client_email;
    this.key = credentials.private_key;
    this.root = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/'
      + encodeURIComponent(packageName);
  }

  private validated_key(): Promise<CryptoKey> {
    this.signingKey ??= (async () => {
      // Validate and prove the non-extractable PKCS8 RSA key before any durable state is initialized.
      const key = await import_rsa_private_key(this.key);
      await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key,
        to_buffer(to_bytes('kotoba-google-service-account-configuration-check')));
      return key;
    })();
    return this.signingKey;
  }

  async validate_credentials(): Promise<void> {
    await this.validated_key();
  }

  private async sign_assertion(payload: JsonObject): Promise<string> {
    const content = base64url_encode(to_bytes('{"alg":"RS256","typ":"JWT"}'))
      + '.' + base64url_encode(to_bytes(canonical_json(payload)));
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await this.validated_key(), to_buffer(to_bytes(content)));
    return content + '.' + base64url_encode(signature);
  }

  private async authorization(scope: Scope): Promise<string> {
    const now = Math.floor(this.clock());
    const cached = this.access.get(scope);
    if (cached && cached.expires > now + 60) return 'Bearer ' + cached.token;
    const assertion = await this.sign_assertion({ iss: this.email, scope: SCOPES[scope], aud: TOKEN_URL,
      iat: now, exp: now + 3600 });
    const form = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion });
    const value = await request_json(this.fetcher, TOKEN_URL, { method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() }, 10000);
    if (typeof value.access_token !== 'string' || !/^[\x21-\x7e]{16,8192}(?![\s\S])/.test(value.access_token)
        || value.token_type !== 'Bearer' || !Number.isSafeInteger(value.expires_in)
        || (value.expires_in as number) < 1 || (value.expires_in as number) > 3600) {
      throw new Error('invalid_google_access_token');
    }
    this.access.set(scope, { token: value.access_token, expires: now + (value.expires_in as number) });
    return 'Bearer ' + value.access_token;
  }

  receipt_url(product: string, token: string): string {
    if (product === SUB) return this.root + '/purchases/subscriptionsv2/tokens/' + encodeURIComponent(token);
    if (product === LIFE) return this.root + '/purchases/products/' + LIFE + '/tokens/' + encodeURIComponent(token);
    throw new BillingError('unsupported_product');
  }

  private async authorized(scope: Scope, url: string, method = 'GET', body?: JsonObject,
                           allowed: readonly number[] = [200]): Promise<JsonObject> {
    const authorization = await this.authorization(scope);
    return request_json(this.fetcher, url, { method,
      headers: { Authorization: authorization, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) }, 12000, allowed);
  }

  async lookup(product: string, token: string): Promise<JsonObject> {
    const url = this.receipt_url(product, token);
    // Missing/invalid Google tokens are a denial. Transient failures remain errors.
    const authorization = await this.authorization('androidpublisher');
    let missing = false;
    const checkedFetch: Fetcher = async (input, init) => {
      const response = await this.fetcher(input, init);
      if ([400, 404, 410].includes(response.status)) {
        await response.body?.cancel();
        missing = true;
        return new Response('{}', { status: 200 });
      }
      return response;
    };
    const receipt = await request_json(checkedFetch, url,
      { method: 'GET', headers: { Authorization: authorization } }, 12000);
    return missing ? {} : receipt;
  }

  async acknowledge(product: string, token: string): Promise<void> {
    const url = (product === SUB ? this.root + '/purchases/subscriptions/' + SUB
      + '/tokens/' + encodeURIComponent(token) : this.receipt_url(product, token)) + ':acknowledge';
    await this.authorized('androidpublisher', url, 'POST', {}, [200, 204, 409]);
  }

  async decode_integrity(token: string): Promise<JsonObject> {
    const value = await this.authorized('playintegrity', 'https://playintegrity.googleapis.com/v1/'
      + encodeURIComponent(this.packageName) + ':decodeIntegrityToken', 'POST', { integrity_token: token });
    if (value.tokenPayloadExternal === undefined) return {};
    if (!is_record(value.tokenPayloadExternal)) throw new Error('invalid_google_integrity_response');
    return value.tokenPayloadExternal;
  }

  async voided(start: number, end: number, page?: string | null): Promise<JsonObject> {
    const parameters = new URLSearchParams({ startTime: String(start), endTime: String(end), type: '1',
      includeQuantityBasedPartialRefund: 'true', maxResults: '1000' });
    if (page) parameters.set('token', page);
    return this.authorized('androidpublisher', this.root + '/purchases/voidedpurchases?' + parameters);
  }
}
