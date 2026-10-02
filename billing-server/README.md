# Kotoba receipt verifier — implementation, not a deployed service

This backend binds a Google-verified Play purchase to an authenticated app account, stores that
ownership durably, acknowledges only after ownership checks, and signs installation-bound RS256
leases. It processes authenticated Pub/Sub notifications and reconciles voided orders. No live
Google credentials, Cloud deployment, Play sandbox purchase, refund, or RTDN delivery was verified
by this code change. Keep Android selling disabled and the production release gates unapproved
until those integration checks have evidence.

## Authentication and Android contract

Core learning can remain local. Purchasing and restoring paid benefits require the same verified
Google login identity on each device. The authenticated app account can differ from the account
used by the Play Store; the app account binding selected when buying is authoritative.

1. Obtain a Google ID token for the configured **server OAuth web client ID**. Send it in
   `Authorization: Bearer <ID token>` over HTTPS. The server verifies Google's signature,
   issuer, expiration and exact audience; raw Google account IDs supplied by the client are ignored.
2. `POST /account` returns `{"obfuscatedAccountId":"<64 lowercase hex characters>"}`. This is
   HMAC-SHA256 of `google:` plus the verified Google `sub`, using a persistent server secret.
   Do not use email or an installation UUID as a purchase owner.
3. Supply this returned value with `BillingFlowParams.Builder.setObfuscatedAccountId()` before
   launching the real Play purchase. Google must return the same identifier in the authoritative
   product receipt or subscription `externalAccountIdentifiers`.
4. Prepare a **Standard** Play Integrity token provider with the real linked Cloud project number.
   For each verification, compute `requestHash` from SHA256 of the following JSON in exactly this
   key order, UTF-8, no whitespace, ASCII JSON escaping. Encode the digest using URL-safe Base64
   without `=` padding:

   ```json
   {"accountId":"<obfuscatedAccountId>","installationId":"<installation UUID>","packageName":"com.studio501.kotoba","productId":"kotoba_lifetime","purchaseToken":"<Play token>"}
   ```

   Request a fresh Standard Integrity token with that hash. Standard requests use Google's replay
   protection; this contract does not accept a Classic nonce or a client-generated success flag.
5. `POST /verify` with the same Bearer identity and JSON fields `packageName`, `productId`,
   `purchaseToken`, `installationId`, and `integrityToken`. The Integrity field is excluded from the
   request hash. Supported products are `kotoba_premium` (monthly/annual) and `kotoba_lifetime`.
6. Verify the returned RS256 `lease` using the SPKI public key. Existing issuer, audience and
   installation `sub` remain; additionally require the `account` claim to match the signed-in
   obfuscated account ID. Clear cached entitlement on logout or account changes. Never store ID
   tokens, purchase tokens or Integrity tokens in logs.

`/verify` requires an actual Google-decoded Integrity verdict for the same package, current request
hash, timestamp within 120 seconds (30 seconds future tolerance), recognized app/signing
certificate, Play license, and `MEETS_DEVICE_INTEGRITY`. There is no production bypass switch.
Network/certificate/API/database failures return 503 and do not mean that a paid purchase is invalid.
Missing authentication returns 401; unlinked legacy purchases and account mismatches return 403.

Same-account reinstalls and multiple devices can restore a token to a new installation. A token
cannot be reassigned to another app account. Purchases made without an obfuscated account binding
fail closed; they need a separately reviewed migration/support flow with authentic ownership
evidence, never a first-caller-wins assignment. The current Android client needs the above login,
purchase binding and Integrity integration before enabling sales.

## Durable storage and revocation

Use one durable SQLite primary mounted at an absolute `SQLITE_PATH`. Each transaction uses
`BEGIN IMMEDIATE`, WAL and `synchronous=FULL`; ownership and completed notification markers are
atomic across Gunicorn workers. The server never silently creates a fallback in-memory database.
The storage directory must be provisioned with restricted permissions and survive restarts and
deployments. This implementation is for one service instance with one local durable disk; it is
not suitable for independent replicas or a network filesystem. Use a reviewed PostgreSQL adapter
before horizontal scaling.

The Render Docker proposal mounts `/var/data` and uses exactly
`SQLITE_PATH=/var/data/kotoba/receipts.sqlite3`. The container entrypoint briefly runs as root,
initializes only the fixed `kotoba` directory (0700) and existing database/WAL/SHM files (0600),
rejects symlinks and hard-linked database files, then drops supplementary groups and UID/GID
before executing Gunicorn as `app`. It never recursively changes the disk or touches secret
mounts. All new files inherit umask 077. Do not override the entrypoint or add a root server command.
Outside this Docker deployment, provision the absolute database directory before running Python.

Purchase tokens are indexed by SHA256 and encrypted with Fernet at rest; notification payloads
are also encrypted. Database encryption does not protect a compromised running server. Back up
the database consistently through SQLite's backup API, protect backups and the persistent
encryption/HMAC secrets separately, and test restore. Never rotate either persistent identity
secret without a migration. The database pins the Play package and account-key fingerprint so
an accidental configuration change fails closed. RSA signing-key rotation also requires a client
public-key transition plan. Resolve retention/deletion and disclose purchase identifiers and
account linkage in the privacy policy/Data safety before deploying; no arbitrary retention promise
is made by this implementation.

`POST /rtdn` verifies Google's Pub/Sub JWT audience, service account email and `email_verified`,
and requires the configured full subscription name. It validates the package and envelope,
deduplicates `(subscription,messageId)` durably, and re-queries Google instead of granting access
from notification type. Failed processing returns a non-2xx retry response; completed markers are
written only after processing. Configure retries, dead-letter handling and operational alerts.

Voided orders persist a denial **before** the Google re-query, including during API outages.
One-time tokens stay denied after a void. Subscription refunds are tracked per order because a
renewal reuses its purchase token; refunding an older order does not revoke a later successful
renewal. A `linkedPurchaseToken` is retained as a superseded denial with its original owner,
preventing old subscription tokens from granting a second entitlement.

Schedule authenticated `POST /tasks/reconcile` at least daily (hourly recommended). It queries
Google's Voided Purchases API with `type=1`, follows all pagination, overlaps the previous day's
window, and advances its durable watermark only after completing every page. A gap beyond the
API's 30-day window requires a recovery process; it is not silently marked complete. `/verify`
refuses new leases until the first reconciliation and whenever the last completed scan is older
than 24 hours. Existing signed leases are finite caches: active subscription and lifetime leases
last at most **one hour**, or paid subscription expiry if sooner. This limits offline refund lag;
it does not change the sold lifetime benefit. Online client refresh and a published offline policy
are still required. RTDN cannot instantly invalidate an already signed lease on an offline device.

`pendingRefundReviewNotification` is saved as encrypted operator work. Google's current guidance
asks for a ReviewRefund response within 24 hours of receiving this conditional chargeback notice.
The first API call is recorded; later calls can return OK while being ignored. The documentation
does not identify implementing ReviewRefund as a universal pre-launch certification requirement
(this is an inference from the cited guidance). Set up a monitored operator response process if
these notices are received. This server never calls ReviewRefund or decides/refunds a payment.

All endpoints below require the separate **OPS** Google-signed JWT and exact configured service
account; app-user and Pub/Sub identities cannot read or resolve these requests. Use controlled
service-account impersonation for the authorized operator, keep credentials out of logs and
browser storage, and do not grant this identity to an untrusted scheduler or public client.

- `GET /tasks/status` reports unresolved review count and last completed voided scan.
- `GET /tasks/refund-reviews?state=open&limit=50` lists order, reason, reception time and 24-hour
  response deadline. States are `open`, `recorded`, `all`; limit is 1–100. Follow `nextAfter` using
  `after=<messageId>` until null. List responses omit the pending refund token.
- `GET /tasks/refund-reviews/<messageId>` exposes the sensitive pending refund token and any prior
  local response record. An operator can use the token for an explicitly authorized manual
  ReviewRefund submission through a separately controlled tool. Keep tokens out of audit notes.
- After that external submission, `POST /tasks/refund-reviews/<messageId>/record` with exactly:

  ```json
  {"preference":"NEUTRAL","externalSubmissionReference":"private-audit-reference","submittedAt":1790985600,"externalSubmissionConfirmed":true}
  ```

  The preference must reflect the operator's deliberate choice (`APPROVE`, `DECLINE`, `NEUTRAL`),
  not an automatic default. `submittedAt` is Unix seconds; the reference locates private evidence
  of the first external submission. This writes an encrypted, immutable local record. Identical
  retries are idempotent; changed records return 409. It performs **no Google API call**, payment
  action or entitlement change. Every response says `googleSubmissionVerified:false`; the local
  record does not prove Google accepted or applied the suggestion. The open queue excludes locally
  recorded items, while `recorded`/`all` and detail retain them for audit. Enable operational alerts
  and verify this manual process with test chargebacks; no live response has been validated here.

## Production configuration

| Setting | Required value |
| --- | --- |
| `RECEIPT_VERIFICATION_ENABLED` | `true` only when the integration is ready |
| `PLAY_PACKAGE` | `com.studio501.kotoba` |
| `ENTITLEMENT_KEY_FILE` | Absolute path to secret-mounted RSA private key, at least 2048 bits |
| `SQLITE_PATH` | Absolute path on a persistent disk; Docker entrypoint requires `/var/data/kotoba/receipts.sqlite3` |
| `TOKEN_ENCRYPTION_KEY` | Persistent Fernet key from a secret manager |
| `ACCOUNT_HMAC_KEY` | Persistent random secret of at least 32 bytes |
| `GOOGLE_OAUTH_CLIENT_ID` | Server OAuth web client ID for real Google login |
| `PLAY_SIGNING_CERT_SHA256` | Play App Signing certificate SHA256 digest(s), Base64url without padding, comma-separated |
| `PUBSUB_AUDIENCE` | Exact HTTPS audience for authenticated `/rtdn` pushes |
| `PUBSUB_SERVICE_ACCOUNT_EMAIL` | Expected push-auth service account identity |
| `PUBSUB_SUBSCRIPTION` | Exact `projects/.../subscriptions/...` resource name |
| `OPS_AUDIENCE` | Separate exact HTTPS audience for scheduled operations |
| `OPS_SERVICE_ACCOUNT_EMAIL` | Expected trusted operations service account, including manual review access |
| `TRUST_PROXY_HOPS` | `1` only behind one trusted TLS ingress with direct backend access blocked; otherwise unset |

ADC needs least-privilege Play Developer API access for this app and Play Integrity decode access
in the actual linked Cloud project. Configure Pub/Sub's push service identity and topic publishing
permissions for Google Play, and a distinct scheduler identity. Serve behind HTTPS and rate limits.
The raw development server must not be public. `/health` reports local configuration and freshness;
it is not proof of Play credential permissions, actual billing/RTDN delivery, or release approval.

Run `python -m unittest discover -s tests -v` after `pip install -r requirements.txt`. Tests exercise
real Flask, SQLite and RSA, with explicit mocks only at Google's external identity/API boundary.
They cannot substitute for credentialed sandbox purchases, acknowledgement, cancellation,
renewal, account switching, same-account reinstall, refunds, duplicate RTDN and failure/recovery
tests against the signed Play-installed Android app.

## Official sources checked on 2026-10-03

- [Google Play billing security](https://developer.android.com/google/play/billing/security)
- [Google ID token verification](https://developers.google.com/identity/sign-in/web/backend-auth)
- [Standard Play Integrity requests](https://developer.android.com/google/play/integrity/standard)
- [Integrity verdict fields](https://developer.android.com/google/play/integrity/verdicts)
- [Authenticated Pub/Sub push](https://docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions)
- [RTDN reference](https://developer.android.com/google/play/billing/rtdn-reference)
- [Conditional chargeback response guidance](https://developer.android.com/google/play/billing/provide-refund-and-chargeback-suggestions)
- [ReviewRefund API](https://developers.google.com/android-publisher/api-ref/rest/v3/orders/reviewrefund)
- [Subscription receipt/account fields](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2)
- [One-time receipt/account fields](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.products)
- [Voided Purchases API pagination/window](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.voidedpurchases/list)
