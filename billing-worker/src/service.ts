/** Google receipts grant access; notification type/client claims never do. */
import { canonical_json, sha256_hex } from './crypto';
import { parse_json_integer_fields } from './google_json';
import { SUB, LIFE, decision, epoch } from './entitlements';
import { Store, token_hash, type ReviewRow } from './persistence';
import { BillingError, type Decision, type JsonObject, type PlayApi } from './types';

export const KINDS = ['subscriptionNotification', 'oneTimeProductNotification',
  'voidedPurchaseNotification', 'pendingRefundReviewNotification', 'testNotification'] as const;
type NotificationKind = typeof KINDS[number];
function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : undefined;
}
export function valid_token(value: unknown): value is string {
  return typeof value === 'string' && /^[!-~]{8,4096}$(?![\s\S])/.test(value);
}
export function receipt_owner(product: string, receipt: JsonObject): string | null {
  const identifiers = product === SUB ? object(receipt.externalAccountIdentifiers) : receipt;
  const value = identifiers?.obfuscatedExternalAccountId;
  return typeof value === 'string' && /^[a-f0-9]{64}$(?![\s\S])/.test(value) ? value : null;
}
export function receipt_order(product: string, receipt: JsonObject): string {
  let value: unknown;
  if (product === LIFE) value = receipt.orderId ?? '';
  else {
    const rows = Array.isArray(receipt.lineItems) ? receipt.lineItems.map(object)
      .filter((row): row is JsonObject => Boolean(row && row.productId === SUB)) : [];
    // Match Python max's first-row tie behavior, including malformed zero-expiry rows.
    let best: JsonObject | undefined;
    for (const row of rows) if (!best || epoch(row.expiryTime) > epoch(best.expiryTime)) best = row;
    value = best?.latestSuccessfulOrderId ?? '';
  }
  return typeof value === 'string' && value.length <= 200 ? value : '';
}
export async function decode_notification(envelope: unknown, packageName: string, subscription: string):
Promise<[string, string, string, NotificationKind, JsonObject]> {
  const outer = object(envelope);
  if (!outer || outer.subscription !== subscription) throw new BillingError('invalid_pubsub_subscription');
  const message = object(outer.message);
  if (!message || typeof message.messageId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$(?![\s\S])/.test(message.messageId)) {
    throw new BillingError('invalid_pubsub_message');
  }
  try {
    const encoded = message.data;
    if (typeof encoded !== 'string' || encoded.length > 43692 || encoded.length % 4 !== 0
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$(?![\s\S])/.test(encoded)) throw new Error();
    const raw = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
    if (raw.byteLength > 32768) throw new Error();
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(raw);
    const payload = object(parse_json_integer_fields(text));
    if (!payload || payload.packageName !== packageName || payload.version !== '1.0') throw new Error();
    const stamp = String(payload.eventTimeMillis);
    if (!/^[0-9]{1,16}$(?![\s\S])/.test(stamp) || BigInt(stamp) <= 0n) throw new Error();
    const kinds = KINDS.filter(kind => Object.hasOwn(payload, kind));
    if (kinds.length !== 1 || !object(payload[kinds[0]])) throw new Error();
    return [message.messageId, await sha256_hex(raw), text, kinds[0], object(payload[kinds[0]])!];
  } catch {
    throw new BillingError('invalid_developer_notification');
  }
}

function metadataInteger(value: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error('invalid_sync_metadata');
  return result;
}

export class BillingService {
  constructor(readonly store: Store, readonly play: PlayApi, readonly clock: () => number = () => Date.now() / 1000) {}
  private now(): number { return Math.floor(this.clock()); }

  async synchronized(): Promise<boolean> {
    return this.store.transaction(async db => {
      const value = this.store.metadata(db, 'voided_sync_at');
      const age = value ? this.now() - metadataInteger(value) : -1;
      return Boolean(value) && age >= 0 && age <= 86400;
    });
  }
  refresh(product: string, token: string, owner: string | null): Promise<Decision> {
    return this.store.transaction(db => this._refresh(db, product, token, owner));
  }
  assert_account(owner: string): Promise<void> {
    return this.store.transaction(db => this.store.assert_account(db, owner));
  }
  delete_account(owner: string): Promise<JsonObject> {
    return this.store.transaction(db => this.store.delete_account(db, owner, this.now()));
  }
  issue_lease<T>(product: string, token: string, owner: string, issuer: (result: Decision) => Promise<T>): Promise<T> {
    return this.store.transaction(async db => {
      // The DO queue holds the same serialization from lookup through signing to
      // commit. Deletion can never commit between refresh and lease issuance.
      await this.store.assert_account(db, owner);
      const result = await this._refresh(db, product, token, owner);
      await this.store.assert_account(db, owner);
      return issuer(result);
    });
  }
  private _deleted_result(product: string): Decision {
    return { active: false, kind: product === SUB ? 'subscription' : 'lifetime',
      until: 0, ackNeeded: false, accountDeleted: true };
  }
  private async _linked_deleted(db: Store, token: string, linked: unknown, owner: string | null): Promise<boolean> {
    if (!valid_token(linked) || linked === token) throw new BillingError('invalid_linked_purchase');
    const old = await this.store.purchase(db, linked);
    if (old?.account_deleted) return true;
    await this.store.assert_owner(db, linked, SUB, owner);
    if (!old || !old.owner) {
      const previous_owner = receipt_owner(SUB, await this.play.lookup(SUB, linked));
      if (await this.store.account_deleted(db, previous_owner)) return true;
      if (!previous_owner || previous_owner !== owner) throw new BillingError('purchase_account_mismatch', 403);
    }
    return false;
  }
  private async _refresh(db: Store, product: string, token: string, expected_owner: string | null = null): Promise<Decision> {
    const now = this.now(), old = await this.store.purchase(db, token);
    if (expected_owner) await this.store.assert_owner(db, token, product, expected_owner);
    else if (old && old.product !== product) throw new BillingError('purchase_product_mismatch', 403);
    if (old?.account_deleted) return this._deleted_result(product);
    let receipt = await this.play.lookup(product, token);
    let result: Decision = decision(product, receipt, now);
    let owner = receipt_owner(product, receipt);
    if (await this.store.account_deleted(db, owner)) {
      if (expected_owner) throw new BillingError('purchase_unavailable', 403);
      await this.store.erase_purchase(db, token, product, receipt_order(product, receipt), now);
      return this._deleted_result(product);
    }
    if (expected_owner && owner && owner !== expected_owner) throw new BillingError('purchase_account_mismatch', 403);
    if (old?.owner && owner && old.owner !== owner) throw new BillingError('purchase_owned_by_another_account', 403);
    if (result.active && !owner) throw new BillingError('purchase_account_link_required', 403);
    owner ||= old?.owner ?? null;
    if (expected_owner && result.active && owner !== expected_owner) throw new BillingError('purchase_account_mismatch', 403);
    let current_order = receipt_order(product, receipt);
    if (await this.store.blocked(db, token, product, current_order)) result = { ...result, active: false, ackNeeded: false };
    let linked = product === SUB ? receipt.linkedPurchaseToken : undefined;
    if (result.active && linked && await this._linked_deleted(db, token, linked, owner)) {
      if (expected_owner) throw new BillingError('purchase_unavailable', 403);
      await this.store.erase_purchase(db, token, product, current_order, now);
      return this._deleted_result(product);
    }
    if (result.ackNeeded) {
      await this.play.acknowledge(product, token);
      const rechecked = await this.play.lookup(product, token), confirmed = decision(product, rechecked, now);
      if (confirmed.ackNeeded || receipt_owner(product, rechecked) !== owner) throw new Error('acknowledgement_not_confirmed');
      receipt = rechecked; result = confirmed;
      current_order = receipt_order(product, receipt);
      if (await this.store.blocked(db, token, product, current_order)) result = { ...result, active: false, ackNeeded: false };
      linked = product === SUB ? receipt.linkedPurchaseToken : undefined;
      if (result.active && linked && await this._linked_deleted(db, token, linked, owner)) {
        if (expected_owner) throw new BillingError('purchase_unavailable', 403);
        await this.store.erase_purchase(db, token, product, current_order, now);
        return this._deleted_result(product);
      }
    }
    if (result.active && linked) {
      if (!valid_token(linked)) throw new BillingError('invalid_linked_purchase');
      await this.store.supersede(db, linked, owner, now);
    }
    if (Object.keys(receipt).length || old) await this.store.save(db, token, product, owner, result, current_order, now);
    return result;
  }
  async record_void(token: unknown, order: unknown): Promise<string | null> {
    if (!valid_token(token) || typeof order !== 'string' || order.length < 1 || order.length > 200) {
      throw new BillingError('invalid_voided_purchase');
    }
    // This denial commits before any Google refresh; an outage must not resurrect a refund.
    return this.store.transaction(async db => {
      await this.store.void(db, token, order, this.now());
      const old = await this.store.purchase(db, token);
      if (old && (old.product === LIFE || old.current_order === '' || old.current_order === order)) {
        db.run('UPDATE purchases SET active=0 WHERE token_hash=?', await token_hash(token));
      }
      return old?.product ?? null;
    });
  }
  async notification(envelope: unknown, packageName: string, subscription: string): Promise<string> {
    const [message_id, digest, raw, kind, notice] = await decode_notification(envelope, packageName, subscription);
    const duplicate = await this.store.transaction(async db => this.store.message_seen(db, subscription, message_id, digest));
    if (duplicate) return 'duplicate';
    let product: string | undefined;
    if (kind === 'voidedPurchaseNotification') {
      product = notice.productType === 1 ? SUB : notice.productType === 2 ? LIFE : undefined;
      if (!product || typeof notice.productType !== 'number' || ![1, 2].includes(Number(notice.refundType))
        || typeof notice.refundType !== 'number') throw new BillingError('unsupported_voided_notification');
      await this.record_void(notice.purchaseToken, notice.orderId);
    }
    return this.store.transaction(async db => {
      if (this.store.message_seen(db, subscription, message_id, digest)) return 'duplicate';
      let status = 'processed', token: string | null = null, owner: string | null = null;
      let order: string | null = typeof notice.orderId === 'string' ? notice.orderId : null, deleted = false;
      if (kind === 'pendingRefundReviewNotification') {
        if (!valid_token(notice.pendingRefundToken) || typeof notice.orderId !== 'string'
          || notice.orderId.length < 1 || notice.orderId.length > 200
          || !Number.isInteger(notice.refundReason) || Number(notice.refundReason) < 1 || Number(notice.refundReason) > 255) {
          throw new BillingError('invalid_refund_review');
        }
        status = 'operator_refund_review_required';
        owner = typeof notice.obfuscatedAccountId === 'string' && /^[a-f0-9]{64}$(?![\s\S])/.test(notice.obfuscatedAccountId)
          ? notice.obfuscatedAccountId : null;
        const purchase = db.one('SELECT owner,account_deleted FROM purchases WHERE current_order=?', notice.orderId);
        if (purchase) owner ||= typeof purchase.owner === 'string' ? purchase.owner : null;
        deleted = Boolean(await this.store.account_deleted(db, owner) || purchase?.account_deleted);
      } else if (kind !== 'testNotification') {
        if (!valid_token(notice.purchaseToken)) throw new BillingError('invalid_purchase_token');
        token = notice.purchaseToken;
        if (kind === 'subscriptionNotification') product = SUB;
        else if (kind === 'oneTimeProductNotification') {
          if (notice.sku !== LIFE) throw new BillingError('unsupported_product');
          product = LIFE;
        }
        if (!product) throw new BillingError('unsupported_product');
        const refreshed = await this._refresh(db, product, token);
        const purchase = await this.store.purchase(db, token);
        owner = purchase?.owner ?? null; order = purchase?.current_order ?? '';
        deleted = Boolean(refreshed.accountDeleted);
        if (deleted) status = 'account_deleted';
      }
      await this.store.message_done(db, subscription, message_id, digest, raw, status, this.now(),
        { purchase_token: token, owner, order_id: order, data_deleted: deleted });
      return status;
    });
  }
  private async _review_view(row: ReviewRow, detail = false): Promise<JsonObject> {
    const payload = object(JSON.parse(await this.store.decrypt(row.payload_cipher)));
    const notice = object(payload?.pendingRefundReviewNotification);
    if (!payload || !notice) throw new Error('invalid_stored_refund_review');
    const result: JsonObject = { messageId: row.message_id, orderId: notice.orderId, refundReason: notice.refundReason,
      eventTimeMillis: payload.eventTimeMillis, receivedAt: row.processed_at, responseDueAt: row.processed_at + 86400,
      state: row.recorded_at !== null ? 'external_response_recorded' : 'needs_operator', googleSubmissionVerified: false };
    if (detail) {
      result.pendingRefundToken = notice.pendingRefundToken;
      for (const key of ['obfuscatedAccountId', 'obfuscatedProfileId']) if (Object.hasOwn(notice, key)) result[key] = notice[key];
      result.externalResponseRecord = row.record_cipher ? JSON.parse(await this.store.decrypt(row.record_cipher)) : null;
    }
    if (row.data_deleted) result.accountDataDeleted = true;
    return result;
  }
  async refund_reviews(subscription: string, state: string = 'open', after: string = '', limit: number = 50): Promise<JsonObject> {
    if (!['open', 'recorded', 'all'].includes(state) || !Number.isInteger(limit) || limit < 1 || limit > 100
      || typeof after !== 'string' || after && !/^[A-Za-z0-9_-]{1,128}$(?![\s\S])/.test(after)) throw new BillingError('invalid_review_query');
    return this.store.transaction(async db => {
      const rows = this.store.refund_reviews(db, subscription, state as 'open' | 'recorded' | 'all', after, limit + 1);
      const values: JsonObject[] = [];
      for (const row of rows.slice(0, limit)) values.push(await this._review_view(row));
      return { reviews: values, nextAfter: rows.length > limit ? rows[limit - 1].message_id : null };
    });
  }
  refund_review(subscription: string, message_id: string): Promise<JsonObject> {
    return this.store.transaction(async db => {
      const row = this.store.refund_review(db, subscription, message_id);
      if (!row) throw new BillingError('refund_review_not_found', 404);
      return this._review_view(row, true);
    });
  }
  async record_refund_review(subscription: string, message_id: string, body: unknown, operator: string): Promise<JsonObject> {
    const now = this.now(), value = object(body);
    const fields = ['preference', 'externalSubmissionReference', 'submittedAt', 'externalSubmissionConfirmed'].sort();
    if (!value || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(fields)
      || typeof value.preference !== 'string' || !['APPROVE', 'DECLINE', 'NEUTRAL'].includes(value.preference)
      || value.externalSubmissionConfirmed !== true || !Number.isInteger(value.submittedAt)
      || Number(value.submittedAt) < 1 || Number(value.submittedAt) > now + 30
      || typeof value.externalSubmissionReference !== 'string' || value.externalSubmissionReference.length < 8
      || value.externalSubmissionReference.length > 1000 || /[\x00-\x1f]/.test(value.externalSubmissionReference)) {
      throw new BillingError('invalid_external_response_record');
    }
    const sorted: JsonObject = {};
    for (const field of fields) sorted[field] = value[field];
    // Python's existing immutable record hashes use ensure_ascii=True. Preserve
    // them if a pre-existing database contains Korean/non-ASCII audit evidence.
    const encoded = canonical_json(sorted);
    const digest = await sha256_hex(encoded);
    const record = { ...value, operator, recordedAt: now, googleSubmissionVerified: false };
    const status = await this.store.transaction(async db => {
      if (!this.store.refund_review(db, subscription, message_id)) throw new BillingError('refund_review_not_found', 404);
      return this.store.record_refund_review(db, subscription, message_id, digest, JSON.stringify(record), now);
    });
    return { status, googleSubmissionVerified: false, recordOnly: true };
  }
  async reconcile_voids(): Promise<number> {
    const now = this.now();
    const value = await this.store.transaction(async db => this.store.metadata(db, 'voided_sync_at'));
    const last = value ? metadataInteger(value) : null;
    if (last !== null && now - last > 30 * 86400) throw new BillingError('refund_sync_gap_requires_recovery', 503);
    const start = Math.max((now - 30 * 86400) * 1000, (last !== null ? last - 86400 : now - 30 * 86400) * 1000);
    const end = now * 1000, seen_pages = new Set<string>();
    let page: string | undefined, count = 0;
    for (let index = 0; index < 100; index++) {
      const response = await this.play.voided(start, end, page);
      const rows = response.voidedPurchases ?? [];
      if (!Array.isArray(rows)) throw new Error('invalid_voided_response');
      for (const raw of rows) {
        const row = object(raw);
        if (!row) throw new Error('invalid_voided_response');
        const product = await this.record_void(row.purchaseToken, row.orderId);
        if (product && valid_token(row.purchaseToken)) await this.refresh(product, row.purchaseToken, null);
        count++;
      }
      const pagination = response.tokenPagination === undefined ? {} : object(response.tokenPagination);
      if (!pagination) throw new Error('invalid_voided_pagination');
      const next = pagination.nextPageToken;
      if (!next) {
        await this.store.transaction(async db => this.store.set_metadata(db, 'voided_sync_at', now));
        return count;
      }
      if (typeof next !== 'string' || seen_pages.has(next)) throw new Error('invalid_voided_pagination');
      page = next; seen_pages.add(page);
    }
    throw new Error('voided_pagination_limit');
  }
}
