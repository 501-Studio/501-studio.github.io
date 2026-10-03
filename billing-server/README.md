# Kotoba receipt verifier — not deployed

This service is a production-starting skeleton, not a completed billing backend deployment.
It interprets real Google Play purchase states and acknowledges completed purchases before
signing installation-bound RS256 entitlement leases. No test boolean grants production access.

## Required deployment configuration

- HTTPS `/verify` endpoint behind a rate-limited API gateway; no public raw development server.
- ADC service account with minimum Google Play permissions for the correct app.
- `PLAY_PACKAGE=com.studio501.kotoba`, `RECEIPT_VERIFICATION_ENABLED=true` only after verification.
- `ENTITLEMENT_KEY_FILE` mounted from a secret store. RSA private keys must never be in the app or GitHub.
- Public SPKI key supplied to the Android build; rotate with documented transition behavior.
- Real subscription `kotoba_premium` with monthly/annual base plans and non-consumable `kotoba_lifetime`.
- Play Integrity / app-authentication and abuse controls before exposing the endpoint.
- Authenticated Pub/Sub RTDN, token ownership/replay storage, refunds/voided purchase synchronization.

**RTDN and durable token ownership are not deployed/implemented here.** The release gate
`rtdnAndRefunds` remains false. Do not mark it true merely because receipt parsing tests pass.
Lifecycle refresh does not replace authenticated server notifications.

Existing active subscriptions get a lease up to 7 days or paid expiry, whichever is earlier;
lifetime purchases get a 365-day refreshable lease. These are verification cache limits, not
changes to the sold benefit. The owner must approve offline entitlement policy and publish it
accurately before sales. Core learning never requires a subscription.

Run pure tests: `python -m unittest discover -s tests -v`. Install dependencies for server testing
with `pip install -r requirements.txt`; set the above configuration only in a trusted environment.
No deployment was performed, no service-account key was obtained, no charge or refund was made.
