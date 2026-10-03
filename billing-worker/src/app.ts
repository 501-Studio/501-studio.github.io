import deletionTemplate from './account-delete.html';
import { claims, sign, SUB, LIFE } from './entitlements';
import { bearer, google_identity, account_id, request_hash, check_integrity } from './security';
import { COOKIE, MAX_AGE, web_origin, challenge, check_confirmation, check_fresh_identity } from './deletion';
import { BillingError, is_record, type Env, type JsonObject } from './types';
import { BillingService, valid_token } from './service';
import { base64url_encode } from './crypto';
import { parse_json_integer_fields } from './google_json';

export function configured(env: Env): boolean {
  const keys: (keyof Env)[] = ['ENTITLEMENT_PRIVATE_KEY_PEM', 'GOOGLE_SERVICE_ACCOUNT_JSON',
    'TOKEN_ENCRYPTION_KEY', 'ACCOUNT_HMAC_KEY', 'GOOGLE_OAUTH_CLIENT_ID', 'PLAY_SIGNING_CERT_SHA256',
    'PUBSUB_AUDIENCE', 'PUBSUB_SERVICE_ACCOUNT_EMAIL', 'PUBSUB_SUBSCRIPTION', 'OPS_AUDIENCE', 'OPS_SERVICE_ACCOUNT_EMAIL'];
  return env.RECEIPT_VERIFICATION_ENABLED === 'true'
    && keys.every(key => typeof env[key] === 'string' && (env[key] as string).length > 0)
    && new TextEncoder().encode(env.ACCOUNT_HMAC_KEY!).length >= 32
    && /^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com(?![\s\S])/.test(env.GOOGLE_OAUTH_CLIENT_ID!)
    && env.PUBSUB_AUDIENCE!.startsWith('https://') && env.OPS_AUDIENCE!.startsWith('https://')
    && env.PUBSUB_AUDIENCE !== env.OPS_AUDIENCE
    && env.PUBSUB_SERVICE_ACCOUNT_EMAIL !== env.OPS_SERVICE_ACCOUNT_EMAIL
    && ['PUBSUB_SERVICE_ACCOUNT_EMAIL', 'OPS_SERVICE_ACCOUNT_EMAIL'].every(
      key => /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.iam\.gserviceaccount\.com(?![\s\S])/.test(env[key as keyof Env] as string))
    && env.PLAY_SIGNING_CERT_SHA256!.split(',').every(value => /^[A-Za-z0-9_-]{43}(?![\s\S])/.test(value));
}

export function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status,
    headers: { 'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

async function body_json(request: Request): Promise<unknown> {
  if (!request.headers.get('Content-Type')?.split(';')[0]?.trim().match(/^application\/(?:[\w.+-]+\+)?json(?![\s\S])/i)) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      // Reject before cancellation can make read() finish normally.
      reject(new BillingError('request_body_timeout', 408));
      void reader.cancel().catch(() => undefined);
    }, 5000);
  });
  try {
    await Promise.race([deadline, (async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 49152) { await reader.cancel(); throw new BillingError('request_too_large', 413); }
        chunks.push(value);
      }
    })()]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return parse_json_integer_fields(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)); } catch { return null; }
}

function cookie(request: Request): string | null {
  const entries = (request.headers.get('Cookie') ?? '').split(';').map(value => value.trim());
  const matches = entries.filter(value => value.startsWith(COOKIE + '='));
  if (matches.length !== 1) return null;
  return matches[0]!.slice(COOKIE.length + 1);
}

function js_string(value: string): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function html_string(value: string): string {
  return value.replace(/[&<>"']/g, value => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[value]!);
}

export function create_router(env: Env, service: BillingService | undefined, ready: boolean,
                              verifyIdentity: typeof google_identity = google_identity) {
  const packageName = env.PLAY_PACKAGE || 'com.studio501.kotoba';
  const deletionOrigin = web_origin({ ...env });
  function require_configuration(): BillingService {
    if (!ready || !service) throw new BillingError('service_not_configured', 503);
    return service;
  }
  async function user_identity(request: Request): Promise<JsonObject> {
    return verifyIdentity(bearer(request.headers.get('Authorization')), env.GOOGLE_OAUTH_CLIENT_ID!);
  }
  async function authenticate_user(request: Request): Promise<string> {
    const info = await user_identity(request);
    const owner = await account_id(info.sub as string, env.ACCOUNT_HMAC_KEY!);
    await require_configuration().assert_account(owner);
    return owner;
  }
  async function authenticate_service(request: Request, prefix: 'OPS' | 'PUBSUB'): Promise<JsonObject> {
    return verifyIdentity(bearer(request.headers.get('Authorization')), env[`${prefix}_AUDIENCE`]!,
      { service_email: env[`${prefix}_SERVICE_ACCOUNT_EMAIL`]! });
  }
  function require_deletion(url: URL): BillingService {
    const value = require_configuration();
    if (!deletionOrigin) throw new BillingError('account_deletion_not_configured', 503);
    if (url.origin !== deletionOrigin) throw new BillingError('invalid_deletion_origin', 403);
    return value;
  }

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url), path = url.pathname;
    let temporary = 'request_temporarily_unavailable';
    try {
      if (path !== '/health' && url.protocol !== 'https:') throw new BillingError('https_required');
      const advertised = request.headers.get('Content-Length');
      if (advertised && (!/^\d+(?![\s\S])/.test(advertised) || Number(advertised) > 49152)) throw new BillingError('request_too_large', 413);
      if (path === '/health' && request.method === 'GET') {
        let synchronized = false;
        try { synchronized = !!ready && !!service && await service.synchronized(); } catch { /* liveness survives an outage */ }
        return json({ service: 'kotoba-verifier', configured: ready, ready: synchronized,
          live_google_credentials_verified: false });
      }
      if (path === '/account' && request.method === 'POST') {
        temporary = 'authentication_temporarily_unavailable';
        require_configuration();
        return json({ obfuscatedAccountId: await authenticate_user(request) });
      }
      if (path === '/account/delete' && request.method === 'GET') {
        require_deletion(url);
        if (url.search) throw new BillingError('invalid_request');
        const [nonce, value] = await challenge(env.ACCOUNT_HMAC_KEY!, packageName);
        const scriptNonce = base64url_encode(crypto.getRandomValues(new Uint8Array(24)));
        const html = deletionTemplate
          .replaceAll('{{ script_nonce|tojson }}', js_string(scriptNonce))
          .replaceAll('{{ confirmation_nonce|tojson }}', js_string(nonce))
          .replaceAll('{{ client_id|tojson }}', js_string(env.GOOGLE_OAUTH_CLIENT_ID!))
          .replaceAll('{{ script_nonce }}', html_string(scriptNonce));
        return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
          'Set-Cookie': `${COOKIE}=${value}; Max-Age=${MAX_AGE}; Path=/account/; Secure; HttpOnly; SameSite=Strict`,
          'Content-Security-Policy': "default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; "
            + `script-src 'nonce-${scriptNonce}' https://accounts.google.com/gsi/client; `
            + "style-src 'unsafe-inline' https://accounts.google.com/gsi/style; connect-src 'self' https://accounts.google.com/gsi/; "
            + "frame-src https://accounts.google.com/gsi/; img-src data: https://accounts.google.com https://www.gstatic.com https://*.googleusercontent.com; form-action 'none'",
          'Referrer-Policy': 'no-referrer', 'Cross-Origin-Opener-Policy': 'same-origin-allow-popups' } });
      }
      if (path === '/account/deletion' && request.method === 'POST') {
        temporary = 'deletion_temporarily_unavailable';
        const value = require_deletion(url);
        if (request.headers.get('Origin') !== deletionOrigin || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
          throw new BillingError('invalid_deletion_origin', 403);
        }
        const body = await body_json(request);
        if (url.search || !is_record(body) || Object.keys(body).sort().join(',') !== 'confirmDeletion,nonce'
            || body.confirmDeletion !== true) throw new BillingError('explicit_deletion_confirmation_required');
        const issued = await check_confirmation(cookie(request), body.nonce, env.ACCOUNT_HMAC_KEY!, packageName);
        const info = await user_identity(request);
        check_fresh_identity(info, body.nonce as string, issued);
        const result = await value.delete_account(await account_id(info.sub as string, env.ACCOUNT_HMAC_KEY!));
        const response = json(result);
        response.headers.set('Set-Cookie', `${COOKIE}=; Max-Age=0; Path=/account/; Secure; HttpOnly; SameSite=Strict`);
        return response;
      }
      if (path === '/verify' && request.method === 'POST') {
        temporary = 'verification_temporarily_unavailable';
        const value = require_configuration(), body = await body_json(request);
        if (!is_record(body)) throw new BillingError('invalid_request');
        const { productId: product, purchaseToken: token, installationId: installation } = body;
        if (body.packageName !== packageName || (product !== SUB && product !== LIFE) || !valid_token(token)
            || typeof installation !== 'string' || !/^[A-Za-z0-9-]{10,80}(?![\s\S])/.test(installation)) throw new BillingError('invalid_request');
        const owner = await authenticate_user(request), integrity = body.integrityToken;
        if (typeof integrity !== 'string' || integrity.length < 16 || integrity.length > 32768) throw new BillingError('app_integrity_required', 403);
        const expected = await request_hash(packageName, product, token, installation, owner);
        check_integrity(await value.play.decode_integrity(integrity), packageName, expected, env.PLAY_SIGNING_CERT_SHA256!.split(','));
        if (!await value.synchronized()) throw new BillingError('refund_reconciliation_required', 503);
        const lease = await value.issue_lease(product, token, owner, result => sign(
          claims(packageName, installation, product, result, Math.floor(Date.now() / 1000), { account: owner }), env.ENTITLEMENT_PRIVATE_KEY_PEM!));
        return json({ lease });
      }
      if (path === '/rtdn' && request.method === 'POST') {
        temporary = 'notification_temporarily_unavailable';
        const value = require_configuration();
        await authenticate_service(request, 'PUBSUB');
        return json({ status: await value.notification(await body_json(request), packageName, env.PUBSUB_SUBSCRIPTION!) });
      }
      if (path === '/tasks/reconcile' && request.method === 'POST') {
        temporary = 'reconciliation_temporarily_unavailable';
        const value = require_configuration();
        await authenticate_service(request, 'OPS');
        return json({ processed: await value.reconcile_voids() });
      }
      if (path === '/tasks/status' && request.method === 'GET') {
        temporary = 'status_temporarily_unavailable';
        const value = require_configuration();
        await authenticate_service(request, 'OPS');
        return json(await value.store.transaction(async db => ({
          refundReviewsNeedingOperator: db.one<{ count: number }>(`SELECT COUNT(*) AS count FROM notifications n
            LEFT JOIN refund_review_records r USING(subscription,message_id)
            WHERE n.subscription=? AND n.status='operator_refund_review_required' AND r.message_id IS NULL`, env.PUBSUB_SUBSCRIPTION!)?.count ?? 0,
          voidedSyncAt: db.metadata(db, 'voided_sync_at'),
        })));
      }
      if (path === '/tasks/refund-reviews' && request.method === 'GET') {
        temporary = 'review_temporarily_unavailable';
        const value = require_configuration();
        await authenticate_service(request, 'OPS');
        const limit = url.searchParams.get('limit') ?? '50';
        if (!/^\d{1,3}(?![\s\S])/.test(limit)) throw new BillingError('invalid_review_query');
        return json(await value.refund_reviews(env.PUBSUB_SUBSCRIPTION!, url.searchParams.get('state') ?? 'open',
          url.searchParams.get('after') ?? '', Number(limit)));
      }
      const match = /^\/tasks\/refund-reviews\/([A-Za-z0-9_-]{1,128})(\/record)?(?![\s\S])/.exec(path);
      if (match && ((request.method === 'GET' && !match[2]) || (request.method === 'POST' && match[2]))) {
        temporary = 'review_temporarily_unavailable';
        const value = require_configuration(), identity = await authenticate_service(request, 'OPS');
        return json(match[2] ? await value.record_refund_review(env.PUBSUB_SUBSCRIPTION!, match[1]!, await body_json(request), identity.email as string)
          : await value.refund_review(env.PUBSUB_SUBSCRIPTION!, match[1]!));
      }
      return json({ error: 'not_found' }, 404);
    } catch (error) {
      // Credential, purchase-token, and Google URL details are never included in errors/logs.
      return error instanceof BillingError ? json({ error: error.code }, error.status) : json({ error: temporary }, 503);
    }
  };
}
