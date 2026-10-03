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
The 75 tests cover Google RSA identity verification, scope-specific signed OAuth assertions,
Fernet compatibility with Python, canonical request/record hashes, strict raw integer fields,
immutable purchase ownership, acknowledgement requery, linked-token conflicts, refunds,
notification atomicity/deduplication, account deletion/redaction, pagination recovery,
HTTP contracts, request deadlines, authenticated operations with receipts still disabled,
and actor eviction with a retained deletion marker.
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
operator audience and service-account email, package and exact deletion origin as the Python
server. RTDN mode additionally requires its distinct Pub/Sub audience, email and full
subscription. Do not put secrets in Git,
Wrangler variables, browser storage or the APK.

The proposed free configuration explicitly selects `BILLING_EVENT_MODE=poll`; it does
not use Pub/Sub or require its configuration. Google documents a billing account as a
[Pub/Sub prerequisite](https://docs.cloud.google.com/pubsub/docs/publish-receive-messages-console),
so that service must not be activated under the no-billing-link policy.

The defaults are `RECEIPT_VERIFICATION_ENABLED=false`, `ACCOUNT_DELETION_ENABLED=false`,
`RECONCILIATION_ENABLED=false` and `POLLING_OPERATIONS_VERIFIED=false`. No cron trigger
is installed. Poll mode becomes configured for customers only after both reconciliation
and verified operations are enabled. For initial operator validation, provision the
validated Google, identity and encryption material, set only
`RECONCILIATION_ENABLED=true`, and keep `RECEIPT_VERIFICATION_ENABLED=false`,
`POLLING_OPERATIONS_VERIFIED=false` and `ACCOUNT_DELETION_ENABLED=false`. Only the
existing OPS-authenticated `/tasks/reconcile` and `/tasks/status` endpoints and the
scheduled reconciliation handler can then operate; customer/account/deletion endpoints
remain disabled and `/health` still reports `configured=false` and `ready=false`.
Add the free hourly reconciliation trigger and verify actual Google calls, schedule
execution and quota behavior before recording `POLLING_OPERATIONS_VERIFIED=true`.
A source test does not supply that approval. Purchase
verification always queries Google and refuses new leases when the last successful voided
scan is more than two hours old or in the future. Existing leases keep their original
maximum one-hour TTL; this does not promise one-hour refund detection. Indexing and polling
can add delay, and an outage must not extend a lease or permit indefinite access.

Before creating the SQLite application schema or pinning its identity fingerprints,
initialization imports and proves both RSA signing keys. Google service-account PKCS8
keys must be at least 2,048 bits; the non-extractable imported Google key is reused for
OAuth assertions. Valid Google service-account key rotation remains allowed and does not
change the persistent account or encryption fingerprints.

Polling does not discover an unseen purchase token or an app-closed pending purchase that
later completes. The Android app queries purchases when resumed. A completed purchase
unacknowledged for three days can auto-refund; this is not unattended fulfillment equivalent
to RTDN. See [Google integration guidance](https://developer.android.com/google/play/billing/integrate).

The optional chargeback/refund-suggestion workflow needs an RTDN-provided pending token.
Poll mode rejects `/rtdn` and refund-review endpoints, and operator status reports discovery
as unavailable rather than zero pending reviews. Ordinary Play Console refunds are not a
replacement for that optional API. See [Review Refund requirements](https://developers.google.com/android-publisher/api-ref/rest/v3/orders/reviewrefund)
and [optional feature status](https://support.google.com/googleplay/android-developer/answer/17068375).

Explicit `rtdn` mode preserves the previous authenticated notification contract and 24-hour
voided-sync freshness limit, but is not the selected free deployment. The database pins its
event mode as well as identity/encryption keys. Switching modes is refused; importing
unclassified existing purchase/notification state into poll mode is also refused. A future
reviewed migration must preserve unresolved financial tasks and deletion markers.

Before production, verify live OAuth, Play Integrity, API permissions, purchase/restore/
cancel/refund flows from a Play-installed app, hourly polling and its explicit limitations,
Free account/quota and ingress limits, encrypted backup/restore with deletion markers,
retention/privacy disclosures and actual Android UX. The source port and dry run do not
complete these release gates. No existing production database has been imported or migrated.
