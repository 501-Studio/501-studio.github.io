/** Durable Object SQLite only. No filesystem, memory, or alternate-storage fallback. */
import { Fernet, sha256_hex } from './crypto';
import { BillingError, type Decision } from './types';

export type Row = Record<string, SqlStorageValue>;
export interface PurchaseRow extends Row {
  token_hash: string; token_cipher: string; product: string; owner: string | null;
  active: number; valid_until: number; current_order: string; superseded: number;
  updated_at: number; account_deleted: number;
}
export interface DeletedAccountRow extends Row { deleted_at: number }
export interface NotificationRow extends Row {
  subscription: string; message_id: string; payload_hash: string; payload_cipher: string;
  status: string; processed_at: number; purchase_hash: string | null;
  account_hash: string | null; order_id: string | null; data_deleted: number;
}
export interface ReviewRow extends NotificationRow {
  record_cipher: string | null; recorded_at: number | null;
}
export const token_hash = (token: string): Promise<string> => sha256_hex(token);
export const deleted_account_hash = (owner: string): Promise<string> => sha256_hex('deleted-account:' + owner);

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

export class Store {
  readonly cipher: Fernet;
  readonly sql: SqlStorage;

  constructor(readonly storage: DurableObjectStorage, encryption_key: string) {
    if (!storage?.sql || typeof storage.sql.exec !== 'function'
      || typeof storage.transaction !== 'function' || typeof storage.transactionSync !== 'function') {
      throw new Error('Durable SQLite-backed Durable Object storage is required');
    }
    this.sql = storage.sql;
    this.cipher = new Fernet(encryption_key);
    // Schema changes are synchronous; consume every cursor before leaving this block.
    storage.transactionSync(() => {
      const statements = [
        `CREATE TABLE IF NOT EXISTS purchases (
          token_hash TEXT PRIMARY KEY, token_cipher TEXT NOT NULL,
          product TEXT NOT NULL, owner TEXT, active INTEGER NOT NULL DEFAULT 0,
          valid_until INTEGER NOT NULL DEFAULT 0, current_order TEXT NOT NULL DEFAULT '',
          superseded INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0
        )`,
        `CREATE TABLE IF NOT EXISTS voids (
          token_hash TEXT NOT NULL, order_id TEXT NOT NULL, seen_at INTEGER NOT NULL,
          PRIMARY KEY(token_hash,order_id)
        )`,
        `CREATE TABLE IF NOT EXISTS notifications (
          subscription TEXT NOT NULL, message_id TEXT NOT NULL, payload_hash TEXT NOT NULL,
          payload_cipher TEXT NOT NULL, status TEXT NOT NULL, processed_at INTEGER NOT NULL,
          PRIMARY KEY(subscription,message_id)
        )`,
        'CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL)',
        `CREATE TABLE IF NOT EXISTS deleted_accounts (
          account_hash TEXT PRIMARY KEY, deleted_at INTEGER NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS refund_review_records (
          subscription TEXT NOT NULL, message_id TEXT NOT NULL,
          record_hash TEXT NOT NULL, record_cipher TEXT NOT NULL, recorded_at INTEGER NOT NULL,
          PRIMARY KEY(subscription,message_id),
          FOREIGN KEY(subscription,message_id) REFERENCES notifications(subscription,message_id)
        )`,
      ];
      for (const statement of statements) this.run(statement);
      const additions: [string, [string, string][]][] = [
        ['purchases', [['account_deleted', 'INTEGER NOT NULL DEFAULT 0']]],
        ['notifications', [['purchase_hash', 'TEXT'], ['account_hash', 'TEXT'],
          ['order_id', 'TEXT'], ['data_deleted', 'INTEGER NOT NULL DEFAULT 0']]],
      ];
      for (const [table, changes] of additions) {
        const columns = new Set(this.rows(`PRAGMA table_info(${table})`).map(row => row.name));
        for (const [name, definition] of changes) {
          if (!columns.has(name)) this.run(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
        }
      }
    });
  }

  rows<T extends Row = Row>(statement: string, ...bindings: SqlStorageValue[]): T[] {
    return this.sql.exec<T>(statement, ...bindings).toArray();
  }
  one<T extends Row = Row>(statement: string, ...bindings: SqlStorageValue[]): T | null {
    // No live cursor crosses any await, including cryptographic work.
    return this.rows<T>(statement, ...bindings)[0] ?? null;
  }
  run(statement: string, ...bindings: SqlStorageValue[]): void {
    this.sql.exec(statement, ...bindings).toArray();
  }

  transaction<T>(callback: (db: Store) => Promise<T>): Promise<T> {
    // The owning Durable Object serializes ALL entry points through its promise queue.
    // SQLite writes in this callback participate in the storage transaction. An error
    // rolls back purchase changes and notification completion together.
    return this.storage.transaction(async () => callback(this));
  }
  encrypt(value: string): Promise<string> { return this.cipher.encrypt(value); }
  decrypt(value: string): Promise<string> { return this.cipher.decrypt(value); }

  async purchase(db: Store, token: string): Promise<PurchaseRow | null> {
    return db.one<PurchaseRow>('SELECT * FROM purchases WHERE token_hash=?', await token_hash(token));
  }
  async account_deleted(db: Store, owner: string | null | undefined): Promise<DeletedAccountRow | null> {
    return owner ? db.one<DeletedAccountRow>('SELECT deleted_at FROM deleted_accounts WHERE account_hash=?',
      await deleted_account_hash(owner)) : null;
  }
  async assert_account(db: Store, owner: string | null): Promise<void> {
    if (await this.account_deleted(db, owner)) throw new BillingError('account_deleted', 410);
  }
  async assert_owner(db: Store, token: string, product: string, owner: string | null): Promise<PurchaseRow | null> {
    await this.assert_account(db, owner);
    const old = await this.purchase(db, token);
    if (old?.account_deleted) throw new BillingError('purchase_unavailable', 403);
    if (old && (old.product !== product || old.owner && old.owner !== owner)) {
      throw new BillingError('purchase_owned_by_another_account', 403);
    }
    return old;
  }
  async save(db: Store, token: string, product: string, owner: string | null,
    result: Pick<Decision, 'active' | 'until'>, current_order: string, now: number): Promise<PurchaseRow | null> {
    const old = await this.assert_owner(db, token, product, owner);
    const hash = await token_hash(token), encrypted = await this.encrypt(token);
    db.run(`INSERT INTO purchases(token_hash,token_cipher,product,owner,active,valid_until,current_order,updated_at)
      VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(token_hash) DO UPDATE SET
      owner=COALESCE(purchases.owner,excluded.owner),active=excluded.active,
      valid_until=excluded.valid_until,current_order=excluded.current_order,updated_at=excluded.updated_at`,
    hash, encrypted, product, owner, Number(result.active), result.until, current_order, now);
    return old;
  }
  async void(db: Store, token: string, order: string, now: number): Promise<void> {
    db.run('INSERT OR IGNORE INTO voids VALUES(?,?,?)', await token_hash(token), order, now);
  }
  async blocked(db: Store, token: string, product: string, current_order: string): Promise<boolean> {
    const old = await this.purchase(db, token);
    if (old && (old.superseded || old.account_deleted)) return true;
    const orders = db.rows('SELECT order_id FROM voids WHERE token_hash=?', await token_hash(token));
    // A subscription token can identify a later renewal after an earlier order's refund.
    return orders.length > 0 && (product === 'kotoba_lifetime' || !current_order
      || orders.some(row => row.order_id === current_order));
  }
  async supersede(db: Store, token: string, owner: string | null, now: number): Promise<void> {
    const old = await this.assert_owner(db, token, 'kotoba_premium', owner);
    if (!old) await this.save(db, token, 'kotoba_premium', owner, { active: false, until: 0 }, '', now);
    db.run('UPDATE purchases SET superseded=1,active=0,updated_at=? WHERE token_hash=?', now, await token_hash(token));
  }
  message_seen(db: Store, subscription: string, message_id: string, digest: string): boolean {
    const old = db.one('SELECT payload_hash FROM notifications WHERE subscription=? AND message_id=?', subscription, message_id);
    if (old && old.payload_hash !== digest) throw new BillingError('notification_id_conflict', 409);
    return old !== null;
  }
  async message_done(db: Store, subscription: string, message_id: string, digest: string,
    payload: string, status: string, now: number, options: {
      purchase_token?: string | null; owner?: string | null; order_id?: string | null; data_deleted?: boolean;
    } = {}): Promise<void> {
    const { purchase_token, owner, order_id, data_deleted = false } = options;
    if (data_deleted) payload = this.redact_notification(payload);
    const encrypted = payload ? await this.encrypt(payload) : '';
    const hash = purchase_token ? await token_hash(purchase_token) : null;
    const account = owner && !data_deleted ? await deleted_account_hash(owner) : null;
    db.run(`INSERT INTO notifications
      (subscription,message_id,payload_hash,payload_cipher,status,processed_at,
       purchase_hash,account_hash,order_id,data_deleted) VALUES(?,?,?,?,?,?,?,?,?,?)`,
    subscription, message_id, digest, encrypted, status, now, hash, account, order_id ?? null, Number(data_deleted));
  }
  redact_notification(payload: string): string {
    const value = object(JSON.parse(payload));
    const review = object(value?.pendingRefundReviewNotification);
    if (!value || !review) return '';
    // Financial operator work survives, without account/profile identifiers.
    return JSON.stringify({ version: value.version, packageName: value.packageName,
      eventTimeMillis: value.eventTimeMillis, pendingRefundReviewNotification: {
        pendingRefundToken: review.pendingRefundToken, orderId: review.orderId, refundReason: review.refundReason,
      } });
  }
  async erase_purchase(db: Store, token: string, product: string, current_order: string, now: number): Promise<void> {
    const old = await this.purchase(db, token);
    if (old && old.product !== product) throw new BillingError('purchase_product_mismatch', 403);
    const hash = await token_hash(token);
    db.run(`INSERT INTO purchases
      (token_hash,token_cipher,product,owner,active,valid_until,current_order,updated_at,account_deleted)
      VALUES(?, '', ?, NULL, 0, 0, ?, ?, 1) ON CONFLICT(token_hash) DO UPDATE SET
      token_cipher='',owner=NULL,active=0,valid_until=0,
      current_order=CASE WHEN excluded.current_order!='' THEN excluded.current_order ELSE purchases.current_order END,
      account_deleted=1,updated_at=excluded.updated_at`, hash, product, current_order, now);
    await this.erase_notifications(db, new Set([hash]), new Set(current_order ? [current_order] : []));
  }
  async delete_account(db: Store, owner: string, now: number): Promise<Record<string, unknown>> {
    const previous = await this.account_deleted(db, owner);
    db.run('INSERT OR IGNORE INTO deleted_accounts VALUES(?,?)', await deleted_account_hash(owner), now);
    const rows = db.rows('SELECT token_hash,current_order FROM purchases WHERE owner=?', owner);
    const hashes = new Set(rows.map(row => String(row.token_hash)));
    const orders = new Set(rows.filter(row => row.current_order).map(row => String(row.current_order)));
    db.run(`UPDATE purchases SET token_cipher='',owner=NULL,active=0,valid_until=0,
      account_deleted=1,updated_at=? WHERE owner=?`, now, owner);
    const erased = await this.erase_notifications(db, hashes, orders, owner);
    return { status: previous ? 'already_deleted' : 'deleted', deletedAt: previous?.deleted_at ?? now,
      purchasesErased: rows.length, notificationsRedacted: erased, offlineLeaseMaxSeconds: 3600,
      subscriptionsAndRefundsUnchanged: true };
  }
  async erase_notifications(db: Store, hashes: Set<string>, orders: Set<string>, owner?: string): Promise<number> {
    let erased = 0;
    const account = owner ? await deleted_account_hash(owner) : null;
    // Read all rows now: legacy notices may lack association columns, and a cursor
    // must not remain active through decrypt/hash awaits.
    const rows = db.rows<NotificationRow>("SELECT * FROM notifications WHERE payload_cipher!=''");
    for (const row of rows) {
      const value = object(JSON.parse(await this.decrypt(row.payload_cipher)));
      if (!value) throw new Error('invalid_stored_notification');
      const notices = Object.entries(value).filter(([key, val]) => key.endsWith('Notification') && object(val))
        .map(([, val]) => object(val)!);
      let related = Boolean(account && row.account_hash === account)
        || Boolean(row.purchase_hash && hashes.has(row.purchase_hash))
        || Boolean(row.order_id && orders.has(row.order_id));
      for (const notice of notices) {
        const token = notice.purchaseToken, order = notice.orderId;
        related ||= typeof token === 'string' && hashes.has(await token_hash(token));
        related ||= typeof order === 'string' && orders.has(order);
        related ||= Boolean(owner) && ['obfuscatedAccountId', 'obfuscatedExternalAccountId']
          .some(key => notice[key] === owner);
      }
      if (!related) continue;
      const minimal = this.redact_notification(JSON.stringify(value));
      const encrypted = minimal ? await this.encrypt(minimal) : '';
      db.run(`UPDATE notifications SET payload_cipher=?,account_hash=NULL,data_deleted=1
        WHERE subscription=? AND message_id=?`, encrypted, row.subscription, row.message_id);
      db.run("UPDATE refund_review_records SET record_cipher='' WHERE subscription=? AND message_id=?",
        row.subscription, row.message_id);
      erased++;
    }
    return erased;
  }
  refund_review(db: Store, subscription: string, message_id: string): ReviewRow | null {
    return db.one<ReviewRow>(`SELECT n.*,r.record_cipher,r.recorded_at FROM notifications n
      LEFT JOIN refund_review_records r USING(subscription,message_id)
      WHERE n.subscription=? AND n.message_id=? AND n.status='operator_refund_review_required'`, subscription, message_id);
  }
  refund_reviews(db: Store, subscription: string, state: 'open' | 'recorded' | 'all', after: string, limit: number): ReviewRow[] {
    const filters = { open: 'AND r.message_id IS NULL', recorded: 'AND r.message_id IS NOT NULL', all: '' };
    return db.rows<ReviewRow>(`SELECT n.*,r.record_cipher,r.recorded_at FROM notifications n
      LEFT JOIN refund_review_records r USING(subscription,message_id)
      WHERE n.subscription=? AND n.status='operator_refund_review_required' AND n.message_id>?
      ${filters[state]} ORDER BY n.message_id LIMIT ?`, subscription, after, limit);
  }
  async record_refund_review(db: Store, subscription: string, message_id: string, digest: string,
    record: string, now: number): Promise<string> {
    const old = db.one('SELECT record_hash FROM refund_review_records WHERE subscription=? AND message_id=?', subscription, message_id);
    if (old) {
      if (old.record_hash !== digest) throw new BillingError('refund_review_record_conflict', 409);
      return 'duplicate';
    }
    const privacy = db.one('SELECT data_deleted FROM notifications WHERE subscription=? AND message_id=?', subscription, message_id);
    const encrypted = privacy?.data_deleted ? '' : await this.encrypt(record);
    db.run('INSERT INTO refund_review_records VALUES(?,?,?,?,?)', subscription, message_id, digest, encrypted, now);
    return 'recorded';
  }
  metadata(db: Store, key: string): string | null {
    const row = db.one('SELECT value FROM metadata WHERE key=?', key);
    return row ? String(row.value) : null;
  }
  set_metadata(db: Store, key: string, value: string | number): void {
    db.run('INSERT INTO metadata VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, String(value));
  }
}
