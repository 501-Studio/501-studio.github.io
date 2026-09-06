# Deployment and verification status

The static application is deployed at https://dayboard-501.onrender.com from this repository's `dayboard` directory. Existing unrelated root content is preserved.

## Verified

- The original Playwright suite passed 16 domain/UI/deployed-page tests on desktop and mobile 390px.
- On 2026-09-06, 14 additional real-database checks passed through the connector and SQL RPC wrappers: authentication, approval gating, idempotent approval, hierarchy propagation, revision conflicts, atomic invalid-time rejection, fixed-block protection, proposal isolation/expiry, key rotation on a disposable test workspace, and cleanup.
- Real-database testing exposed and repaired a PL/pgSQL identifier ambiguity that the sample-data UI suite did not exercise. The deployed repair is preserved in `../infrastructure/dayboard-transaction.sql`.
- Launcher protocol unit tests cover no key, malformed key, accepted mock key and rejected mock key. A connection fragment is removed before the first authenticated request. No actual owner key is committed here.

## Authorization still required

- A valid personal workspace connection key must be provisioned and handed to the owner before a fresh browser can use the private cloud workspace. The public URL alone is not authentication. The sample board is not personal cloud storage.
- Google Calendar browser access requires a separately registered Google OAuth web client and the user's consent. The existing ChatGPT Google Calendar connection does not grant browser-app credentials.
- The Google storage-import approval path was tested; this is NOT an end-to-end Google OAuth/calendar-write test.
- ChatGPT integration uses the owner's installed Supabase connector and the workflow in CHATGPT.md. It does not monitor all conversations or provide a paid model API inside the app.

No paid OpenAI API, subscription upgrade or paid hosting service was activated for this application. Free provider quotas and availability policies still apply. No unlimited availability or zero-overage guarantee is claimed.
