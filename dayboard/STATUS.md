# Dayboard deployment status

## Connection setup update (2026-09-06)

The app includes an in-page setup assistant, reachable from the first screen or `?setup=workspace`. It does not reset an existing workspace key or change database permissions.

- First use: the browser prepares a new empty workspace identity and random connection key locally. An owner-run SQL statement contains only the key hash. The owner must execute it in their own Supabase SQL Editor. It does not copy, delete, unlock or overwrite an existing workspace.
- Connection is successful only after the authenticated read endpoint returns the matching workspace ID. Preparing a key or downloading a file is NOT activation.
- Other devices import a private connection file and verify the same workspace. The file is equivalent to a password; never publish it or share it with other people.
- Google setup explains the required web OAuth registration, validates the public client ID, requests consent, lists calendars and stores client/calendar IDs only. Tokens remain in memory. Registration and real account consent are still owner actions, not completed by deployment.
- ChatGPT requests use the actual connected workspace ID, not a historical/default ID.

## Verification scope

The existing regression suite remains enabled. The new setup regression suite uses a mocked Supabase backend and mocked Google OAuth for error states, device restoration, key handling, settings persistence and mobile layout. See GitHub Actions for executed results. These tests do not claim real Google authorization/calendar writes or the owner's console setup.

Earlier backend verification passed 14 real-database checks, including approval gating, hierarchy, revision conflicts and fixed-block protection. This setup update does not alter the backend schema or existing credentials.

## Remaining owner actions

1. Complete the new-board approval in the existing Supabase project, or supply an already-valid private connection file.
2. Register the Google web OAuth client and consent using the intended account.

No OpenAI API key, paid model call, paid hosting upgrade, billing registration or new paid service was introduced. Free provider limits still apply; deployment is not a provider-wide billing cap.
