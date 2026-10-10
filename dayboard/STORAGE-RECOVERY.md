# Dayboard storage connection recovery

Dayboard is served from `dayboard/` in `501-Studio/501-studio.github.io`.
Render's `dayboard-501` service publishes that directory from `main`, with
automatic deploys enabled and build command `test -f dayboard/index.html`.
It serves committed JavaScript directly. Render environment variables are not
injected into these files by that command; changing them cannot repair the
Supabase URL used by the browser.

## Findings on 2026-10-10 (Asia/Seoul)

- Render's latest deploy is live at source commit
  `e73b9f89849808129160fb401c8e36ca29739e0c`.
- The Supabase URL in `core.js`, the deployed client and the reported
  `dayboard_read` request matches the connected Supabase project's official API
  URL. There is no evidence of a typo or a deployment URL mismatch.
- Supabase management reports the existing project as `INACTIVE`.
  The local resolver, Google DNS and Cloudflare DNS return NXDOMAIN for its
  API hostname. Project pausing is the leading explanation, consistent with
  Supabase's documented behavior. The precise pause time/cause was not checked.
- The client sends a publishable key in the `apikey` header and the personal
  board key in the JSON body. DNS failure happens before HTTP authentication
  and before PostgreSQL executes `dayboard_read`; changing either key does not
  resolve this failure. This investigation does not establish key validity or
  the current database contents while the project is inactive.

## Safe recovery

1. Open the **existing** project in the connected Supabase dashboard and confirm
   its paused state. Use **Resume project** to bring that same project back.
   This is project resumption, not restoration of an older database backup.
2. Wait for the project to become healthy and its API hostname to resolve.
3. Reconnect using the existing board key or existing private connection file.
   The connection screen reads `dayboard_read`; it does not write schedule data.
4. Confirm the existing board and latest revision load, then export a schedule
   backup from the app. Keep that backup and the connection file private.
5. If the project is healthy but DNS still fails, check from another resolver
   and contact Supabase support for the existing project. Do not recreate it.

Do not create a replacement project or workspace, rotate connection keys,
rerun installer/migration SQL, change grants/RLS, import a demo snapshot, or
restore an older backup to diagnose NXDOMAIN. None is needed for project
resumption. No database/schema changes are included in this patch.

The frontend patch explains unreachable storage without claiming the browser
can distinguish DNS, CORS, network restrictions and project pausing. It retains
the existing connection during failed reconnects and offers a read-only retry
and a link to the existing project. Failed writes are never replayed: reload
the latest snapshot to determine whether an uncertain write reached the server.

This PR does not resume Supabase, change Render settings or deploy itself.
Merging into `main` triggers Render's existing automatic deployment.

## Verification

`node tests/storage-recovery.mjs` exercises failed reads/writes, timeouts,
authorization errors, credential preservation and read recovery using synthetic
state. The release workflow runs it on pull requests as well as its existing
push triggers. A live personal-board read remains necessary after resumption;
mocked tests cannot prove production data recovery.

References:

- [Supabase NXDOMAIN troubleshooting](https://supabase.com/docs/guides/troubleshooting/nxdomain-error-connecting-to-a-supabase-project)
- [Supabase project pausing and resumption](https://supabase.com/docs/guides/platform/free-project-pausing)
