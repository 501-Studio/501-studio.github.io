# Kotoba billing verifier for Workers Free

This is the Cloudflare Workers implementation of the existing Python receipt verifier.
It uses one SQLite-backed Durable Object for persistent ownership, refund denial,
notification deduplication and account deletion. It has not been deployed or connected
to live Google credentials. Android selling and production release approvals remain disabled.

## Local verification

Use Node.js 24 and the committed npm lockfile:

```sh
npm ci --no-fund --no-audit
npm run check
npm test
npm run build
```

`build` runs `wrangler deploy --dry-run`. It bundles locally without creating a Worker,
database or cloud deployment. No cloud credentials are needed by these checks.

The test runner executes inside workerd and uses actual SQLite Durable Object storage.
The 64 tests cover Google RSA identity verification, scope-specific signed OAuth assertions,
Fernet compatibility with Python, canonical request/record hashes, strict raw integer fields,
immutable purchase ownership, acknowledgement requery, linked-token conflicts, refunds,
notification atomicity/deduplication, account deletion/redaction, pagination recovery,
HTTP contracts, request deadlines and actor eviction with a retained deletion marker.
Google API responses in these tests are fixtures, not evidence of live integration.

## Durable transaction and request ordering

The front Worker forwards to the fixed `kotoba-billing-primary-v1` object. All HTTP
handlers and scheduled reconciliation use its application queue. The queue stays held
through Google queries, acknowledgement and lease signing; the SQLite storage transaction
commits before the request completes. A deletion that committed first prevents any later
lease issuance. A lease issued earlier can remain usable for its existing maximum one-hour TTL.

There is no in-memory database fallback. The schema pins the Play package, account HMAC
key fingerprint and token encryption key fingerprint. Changing the singleton name,
binding namespace, identity/encryption keys or production environment without a reviewed
migration can orphan purchase ownership and deletion markers. Keep them stable.

SQLite cursors are consumed before an `await`. Initialization uses `blockConcurrencyWhile`;
network requests use the application queue rather than holding that initialization gate.
Input is capped at 49,152 bytes, unfinished JSON streams at five seconds and queued HTTP
requests at 128. Scheduled error messages are redacted before RPC/platform logging.
Ingress abuse limits, actual Free quota behavior and realistic API latency/load still require
operational verification before enabling purchases. The queue is not a distributed anti-abuse service.

## Configuration and production checks

`wrangler.jsonc` creates only a SQLite class binding in the proposed configuration. It
contains no paid storage, R2, containers, custom domain, cloud deployment credentials or
automatic deployment. It does not change an account's plan or enforce a billing cap.
Before deploying, verify the actual Cloudflare account is **Workers Free** and check its
other usage. Never use a Paid account's included allocation as proof of zero charges.
See [the cost decision](../billing-server/FREE_DEPLOYMENT_KO.md).

Use server secret bindings for:

- `GOOGLE_SERVICE_ACCOUNT_JSON`: app-limited service account credentials; the OAuth
  endpoint is fixed to Google's token endpoint.
- `ENTITLEMENT_PRIVATE_KEY_PEM`: separate PKCS8 RSA lease key of at least 2,048 bits,
  corresponding to the Android verifier's configured public key.
- `TOKEN_ENCRYPTION_KEY`: persistent Python-compatible Fernet key.
- `ACCOUNT_HMAC_KEY`: persistent UTF-8 secret of at least 32 bytes.

The remaining configuration uses the same OAuth audience, Play signing certificate digest,
distinct Pub/Sub/operator audience and service-account email, full Pub/Sub subscription,
package and exact deletion origin as the Python server. Do not put secrets in Git,
Wrangler variables, browser storage or the APK.

The defaults are `RECEIPT_VERIFICATION_ENABLED=false`, `ACCOUNT_DELETION_ENABLED=false`
and `RECONCILIATION_ENABLED=false`. No cron trigger is installed. Add the free hourly
reconciliation trigger only after live Google permissions and cost conditions are verified.
The configured code requires the authenticated notification/operator configuration; it
does not silently remove RTDN to bypass an unresolved Pub/Sub billing condition.

Before production, verify live OAuth, Play Integrity, API permissions, purchase/restore/
cancel/refund flows from a Play-installed app, RTDN delivery or a fully reviewed replacement,
Free account/quota and ingress limits, encrypted backup/restore with deletion markers,
retention/privacy disclosures and actual Android UX. The source port and dry run do not
complete these release gates. No existing production database has been imported or migrated.
