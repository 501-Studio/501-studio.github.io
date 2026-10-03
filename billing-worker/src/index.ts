import { DurableObject } from 'cloudflare:workers';
import { configured, create_router, json } from './app';
import { Store } from './persistence';
import { BillingService } from './service';
import { PlayClient } from './play_api';
import { sha256_hex } from './crypto';
import { sign } from './entitlements';
import type { Env } from './types';

// Every endpoint and scheduled reconciliation uses the same stable singleton ID.
// Never change this name or create per-installation databases without a state migration.
const COORDINATOR_NAME = 'kotoba-billing-primary-v1';

export class BillingCoordinator extends DurableObject<Env> {
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;
  private router: (request: Request) => Promise<Response>;
  private service?: BillingService;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.router = create_router(env, undefined, false);
    // Only initialization blocks the runtime input gate. Network operations use the
    // application queue below, so the 30-second initialization limit is not abused.
    ctx.blockConcurrencyWhile(async () => {
      if (!configured(env)) return;
      try {
        await sign({ purpose: 'configuration-key-check' }, env.ENTITLEMENT_PRIVATE_KEY_PEM!);
        const store = new Store(ctx.storage, env.TOKEN_ENCRYPTION_KEY!);
        await store.transaction(async db => {
          const previousMode = db.metadata(db, 'billing_event_mode');
          if (!previousMode && env.BILLING_EVENT_MODE === 'poll'
              && (Number(db.one('SELECT COUNT(*) AS count FROM purchases')?.count ?? 0) > 0
                || Number(db.one('SELECT COUNT(*) AS count FROM notifications')?.count ?? 0) > 0)) {
            throw new Error('existing_billing_state_requires_mode_migration');
          }
          for (const [key, value] of [
            ['play_package', env.PLAY_PACKAGE],
            ['billing_event_mode', env.BILLING_EVENT_MODE],
            ['account_key_fingerprint', await sha256_hex(env.ACCOUNT_HMAC_KEY!)],
            ['encryption_key_fingerprint', await sha256_hex(env.TOKEN_ENCRYPTION_KEY!)],
          ]) {
            const previous = db.metadata(db, key!);
            if (previous && previous !== value) throw new Error('persistent_identity_configuration_changed');
            db.set_metadata(db, key!, value!);
          }
        });
        this.service = new BillingService(store, new PlayClient(env.PLAY_PACKAGE, env.GOOGLE_SERVICE_ACCOUNT_JSON!));
        this.router = create_router(env, this.service, true);
      } catch {
        // Fail closed; no fallback database and no sensitive configuration logging.
        this.service = undefined;
        this.router = create_router(env, undefined, false);
      }
    });
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    this.pending++;
    const result = this.tail.then(operation);
    this.tail = result.then(() => undefined, () => undefined);
    return result.finally(() => { this.pending--; });
  }

  fetch(request: Request): Promise<Response> {
    if (this.pending >= 128) return Promise.resolve(json({ error: 'service_busy_retry' }, 503));
    return this.serial(() => this.router(request));
  }

  async reconcile(): Promise<void> {
    if (this.env.RECONCILIATION_ENABLED !== 'true' || !this.service) return;
    try {
      await this.serial(async () => { await this.service!.reconcile_voids(); });
    } catch {
      // Scheduled/RPC errors can be logged by the platform; redact native fetch URLs.
      throw new Error('reconciliation_temporarily_unavailable');
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Keep the front Worker below its Free CPU limit: authentication and crypto run in DO.
    try {
      return await env.BILLING_STATE.get(env.BILLING_STATE.idFromName(COORDINATOR_NAME)).fetch(request);
    } catch {
      return json({ error: 'service_temporarily_unavailable' }, 503);
    }
  },
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (env.RECONCILIATION_ENABLED !== 'true') return;
    // Add the free hourly trigger only after actual Google configuration is verified.
    const stub = env.BILLING_STATE.get(env.BILLING_STATE.idFromName(COORDINATOR_NAME)) as DurableObjectStub<BillingCoordinator>;
    ctx.waitUntil(stub.reconcile());
  },
} satisfies ExportedHandler<Env>;
