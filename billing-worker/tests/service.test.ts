import { describe, expect, it } from 'vitest';
import { env, runInDurableObject } from 'cloudflare:test';
import { SUB, LIFE } from '../src/entitlements';
import { Store, deleted_account_hash, token_hash } from '../src/persistence';
import { BillingService, decode_notification, valid_token, receipt_owner } from '../src/service';
import { Fernet } from '../src/crypto';
import type { Env, JsonObject } from '../src/types';
import { FakePlay, KEY, NOW, OWNER_A, OWNER_B, PACKAGE, SUBSCRIPTION, TOKEN,
  envelope, product, review_record, subscription } from './fixtures';

async function with_service(callback: (service: BillingService, store: Store, play: FakePlay,
  state: DurableObjectState) => Promise<void>): Promise<void> {
  const namespace = (env as unknown as Env).BILLING_STATE;
  const stub = namespace.get(namespace.idFromName(crypto.randomUUID()));
  await runInDurableObject(stub, async (_instance, state) => {
    const store = new Store(state.storage, KEY), play = new FakePlay();
    play.receipts[TOKEN] = product();
    await callback(new BillingService(store, play, () => NOW), store, play, state);
  });
}

describe('BillingService on actual SQLite Durable Object storage', () => {
  it('rejects wrong receipt ownership before acknowledgment or any persistent claim', async () => with_service(async (service, store, play) => {
    play.receipts[TOKEN] = { ...product(OWNER_B), acknowledgementState: 0 };
    await expect(service.refresh(LIFE, TOKEN, OWNER_A)).rejects.toMatchObject({ code: 'purchase_account_mismatch', status: 403 });
    expect(play.acknowledgements).toEqual([]);
    expect(await store.transaction(db => store.purchase(db, TOKEN))).toBeNull();
  }));

  it('persists one immutable owner and refuses replay to another account after reopening Store', async () => with_service(async (service, store, play, state) => {
    expect((await service.refresh(LIFE, TOKEN, OWNER_A)).active).toBe(true);
    const reopened = new Store(state.storage, KEY), again = new BillingService(reopened, play, () => NOW);
    await expect(again.refresh(LIFE, TOKEN, OWNER_B)).rejects.toMatchObject({ code: 'purchase_owned_by_another_account' });
    const row = await store.transaction(db => store.purchase(db, TOKEN));
    expect(row?.owner).toBe(OWNER_A);
    expect(row?.token_cipher).not.toContain(TOKEN);
    expect(await store.decrypt(row!.token_cipher)).toBe(TOKEN);
  }));

  it('fails closed on active Google receipts with no account link', async () => with_service(async (service, store, play) => {
    play.receipts[TOKEN] = product(null);
    await expect(service.refresh(LIFE, TOKEN, OWNER_A)).rejects.toMatchObject({ code: 'purchase_account_link_required' });
    expect(await store.transaction(db => store.purchase(db, TOKEN))).toBeNull();
  }));

  it('requires Google acknowledgment requery confirmation, including unchanged account ownership', async () => with_service(async (service, store, play) => {
    play.receipts[TOKEN].acknowledgementState = 0;
    play.fail_ack = true;
    await expect(service.refresh(LIFE, TOKEN, OWNER_A)).rejects.toThrow('acknowledgement_not_confirmed');
    expect(await store.transaction(db => store.purchase(db, TOKEN))).toBeNull();
    play.fail_ack = false;
    play.after_ack = () => { play.receipts[TOKEN].obfuscatedExternalAccountId = OWNER_B; };
    await expect(service.refresh(LIFE, TOKEN, OWNER_A)).rejects.toThrow('acknowledgement_not_confirmed');
    expect(await store.transaction(db => store.purchase(db, TOKEN))).toBeNull();
    play.after_ack = undefined;
    play.receipts[TOKEN] = { ...product(), acknowledgementState: 0 };
    expect((await service.refresh(LIFE, TOKEN, OWNER_A)).active).toBe(true);
    expect(play.lookups.length).toBe(6);
  }));

  it('rolls back refreshed ownership when lease signing fails and never calls issuer after deletion', async () => with_service(async (service, store, play) => {
    await expect(service.issue_lease(LIFE, TOKEN, OWNER_A, async () => { throw new Error('test signer failure'); })).rejects.toThrow();
    expect(await store.transaction(db => store.purchase(db, TOKEN))).toBeNull();
    await service.refresh(LIFE, TOKEN, OWNER_A);
    await service.delete_account(OWNER_A);
    const lookups = play.lookups.length;
    let called = false;
    await expect(service.issue_lease(LIFE, TOKEN, OWNER_A, async () => { called = true; return 'forbidden'; }))
      .rejects.toMatchObject({ code: 'account_deleted', status: 410 });
    expect(called).toBe(false);
    expect(play.lookups.length).toBe(lookups);
  }));

  it('commits a void denial before Google outage, but not a completed RTDN marker', async () => with_service(async (service, store, play) => {
    await service.refresh(LIFE, TOKEN, OWNER_A);
    const notice = envelope('voidedPurchaseNotification', { purchaseToken: TOKEN, orderId: 'GPA.current-order', productType: 2, refundType: 1 });
    play.fail_lookup = true;
    await expect(service.notification(notice, PACKAGE, SUBSCRIPTION)).rejects.toThrow('fake Google outage');
    await store.transaction(async db => {
      expect((await store.purchase(db, TOKEN))?.active).toBe(0);
      expect(db.rows('SELECT * FROM voids')).toHaveLength(1);
      expect(db.rows('SELECT * FROM notifications')).toHaveLength(0);
    });
    play.fail_lookup = false;
    expect(await service.notification(notice, PACKAGE, SUBSCRIPTION)).toBe('processed');
    expect((await service.refresh(LIFE, TOKEN, OWNER_A)).active).toBe(false);
  }));

  it('denies unobserved refunded purchases but allows a later subscription renewal order', async () => with_service(async (service, _store, play) => {
    await service.record_void(TOKEN, 'GPA.current-order');
    expect((await service.refresh(LIFE, TOKEN, OWNER_A)).active).toBe(false);
    const other = 'subscription-renewal-token';
    play.receipts[other] = subscription();
    await service.record_void(other, 'GPA.current-order..0');
    expect((await service.refresh(SUB, other, OWNER_A)).active).toBe(true);
    await service.record_void(other, 'GPA.current-order..1');
    expect((await service.refresh(SUB, other, OWNER_A)).active).toBe(false);
  }));

  it('permanently supersedes linked tokens and rejects unknown linked ownership before acknowledgment', async () => with_service(async (service, store, play) => {
    const old = 'previous-subscription-token', replacement = 'replacement-subscription-token';
    play.receipts[old] = subscription();
    play.receipts[replacement] = subscription(OWNER_A, 'GPA.new-order..1', old);
    expect((await service.refresh(SUB, replacement, OWNER_A)).active).toBe(true);
    expect((await service.refresh(SUB, old, OWNER_A)).active).toBe(false);
    expect((await store.transaction(db => store.purchase(db, old)))?.superseded).toBe(1);
    const conflict = 'unknown-conflicting-linked-token', attempted = 'attempted-replacement-token';
    play.receipts[conflict] = subscription(OWNER_B);
    play.receipts[attempted] = { ...subscription(OWNER_A, 'GPA.attempted..1', conflict), acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING' };
    await expect(service.refresh(SUB, attempted, OWNER_A)).rejects.toMatchObject({ code: 'purchase_account_mismatch' });
    expect(play.acknowledgements).toEqual([]);
    expect(await store.transaction(db => store.purchase(db, attempted))).toBeNull();
  }));

  it('rechecks linked ownership introduced only by the post-ack Google receipt', async () => with_service(async (service, store, play) => {
    const linked = 'new-linked-token-on-ack';
    play.receipts[TOKEN] = { ...subscription(), acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING' };
    play.receipts[linked] = subscription(OWNER_B);
    play.after_ack = () => { play.receipts[TOKEN].linkedPurchaseToken = linked; };
    await expect(service.refresh(SUB, TOKEN, OWNER_A)).rejects.toMatchObject({ code: 'purchase_account_mismatch' });
    expect(await store.transaction(db => store.purchase(db, TOKEN))).toBeNull();
    expect(await store.transaction(db => store.purchase(db, linked))).toBeNull();
  }));

  it('deduplicates raw RTDN persistently and rejects ID reuse with changed bytes', async () => with_service(async (service, store, play, state) => {
    const notice = envelope('oneTimeProductNotification', { purchaseToken: TOKEN, sku: LIFE });
    expect(await service.notification(notice, PACKAGE, SUBSCRIPTION)).toBe('processed');
    const lookups = play.lookups.length;
    const reopened = new BillingService(new Store(state.storage, KEY), play, () => NOW);
    expect(await reopened.notification(notice, PACKAGE, SUBSCRIPTION)).toBe('duplicate');
    expect(play.lookups.length).toBe(lookups);
    await expect(service.notification(envelope('testNotification', { changed: true }), PACKAGE, SUBSCRIPTION))
      .rejects.toMatchObject({ code: 'notification_id_conflict', status: 409 });
    const row = store.one('SELECT payload_cipher FROM notifications');
    expect(row?.payload_cipher).not.toContain(TOKEN);
  }));

  it('rolls back refreshed purchase and notification completion atomically after a commit-stage failure', async () => with_service(async (service, store, play) => {
    const notice = envelope('oneTimeProductNotification', { purchaseToken: TOKEN, sku: LIFE });
    const original = store.message_done.bind(store);
    store.message_done = async () => { throw new Error('test completion failure'); };
    await expect(service.notification(notice, PACKAGE, SUBSCRIPTION)).rejects.toThrow();
    expect(await store.transaction(db => store.purchase(db, TOKEN))).toBeNull();
    expect(store.rows('SELECT * FROM notifications')).toHaveLength(0);
    store.message_done = original;
    expect(await service.notification(notice, PACKAGE, SUBSCRIPTION)).toBe('processed');
    expect(play.lookups).toHaveLength(2);
  }));

  it('preserves paginated reconciliation watermark after looping pagination while keeping denials', async () => with_service(async (service, store, play) => {
    let now = NOW;
    const timed = new BillingService(store, play, () => now);
    await store.transaction(async db => store.set_metadata(db, 'voided_sync_at', NOW - 100));
    play.pages.set(undefined, { voidedPurchases: [{ purchaseToken: TOKEN, orderId: 'GPA.current-order' }], tokenPagination: { nextPageToken: 'page-2' } });
    play.pages.set('page-2', { voidedPurchases: [], tokenPagination: { nextPageToken: 'page-2' } });
    await expect(timed.reconcile_voids()).rejects.toThrow('invalid_voided_pagination');
    expect(store.metadata(store, 'voided_sync_at')).toBe(String(NOW - 100));
    expect(await store.blocked(store, TOKEN, LIFE, 'GPA.current-order')).toBe(true);
    play.pages.set('page-2', { voidedPurchases: [] });
    now += 100;
    expect(await timed.reconcile_voids()).toBe(1);
    expect(store.metadata(store, 'voided_sync_at')).toBe(String(now));
    expect(play.page_calls.at(-2)).toEqual([(NOW - 100 - 86400) * 1000, now * 1000, undefined]);
    expect(await timed.synchronized()).toBe(true);
  }));

  it('refuses a >30-day reconciliation gap instead of silently recording a fresh watermark', async () => with_service(async (service, store, play) => {
    await store.transaction(async db => store.set_metadata(db, 'voided_sync_at', NOW - 31 * 86400));
    await expect(service.reconcile_voids()).rejects.toMatchObject({ code: 'refund_sync_gap_requires_recovery', status: 503 });
    expect(play.page_calls).toEqual([]);
    expect(await service.synchronized()).toBe(false);
  }));

  it('erases only the authenticated owner, keeps tombstones durably, and never recreates after late RTDN', async () => with_service(async (service, store, play, state) => {
    const other = 'other-owners-purchase-token';
    play.receipts[other] = product(OWNER_B, 0, 'GPA.other-account');
    await service.refresh(LIFE, other, OWNER_B);
    const before = envelope('oneTimeProductNotification', { purchaseToken: TOKEN, sku: LIFE }, 'before-deletion');
    await service.notification(before, PACKAGE, SUBSCRIPTION);
    expect((await service.delete_account(OWNER_A)).status).toBe('deleted');
    const reopened = new BillingService(new Store(state.storage, KEY), play, () => NOW);
    await expect(reopened.assert_account(OWNER_A)).rejects.toMatchObject({ code: 'account_deleted', status: 410 });
    await expect(reopened.refresh(LIFE, TOKEN, OWNER_B)).rejects.toMatchObject({ code: 'purchase_unavailable' });
    expect((await reopened.delete_account(OWNER_A)).purchasesErased).toBe(0);
    expect(await reopened.notification(before, PACKAGE, SUBSCRIPTION)).toBe('duplicate');
    play.fail_lookup = true;
    expect(await reopened.notification(envelope('oneTimeProductNotification', { purchaseToken: TOKEN, sku: LIFE }, 'after-deletion'), PACKAGE, SUBSCRIPTION)).toBe('account_deleted');
    play.fail_lookup = false;
    const unseen = 'unseen-deleted-account-token';
    play.receipts[unseen] = { ...product(), acknowledgementState: 0 };
    expect(await reopened.notification(envelope('oneTimeProductNotification', { purchaseToken: unseen, sku: LIFE }, 'unseen-after-deletion'), PACKAGE, SUBSCRIPTION)).toBe('account_deleted');
    expect(play.acknowledgements).toEqual([]);
    expect((await store.purchase(store, other))?.owner).toBe(OWNER_B);
    expect((await store.purchase(store, unseen))?.token_cipher).toBe('');
    expect(store.rows('SELECT account_hash FROM deleted_accounts')).toEqual([{ account_hash: await deleted_account_hash(OWNER_A) }]);
    for (const row of store.rows('SELECT payload_cipher,account_hash,data_deleted FROM notifications')) {
      expect(row).toEqual({ payload_cipher: '', account_hash: null, data_deleted: 1 });
    }
  }));

  it('late Google ownership resolution erases an older unassociated notice and retains order-linked refund privacy', async () => with_service(async (service, store, play) => {
    play.receipts[TOKEN] = {};
    await service.notification(envelope('oneTimeProductNotification', { purchaseToken: TOKEN, sku: LIFE }, 'unknown-owner'), PACKAGE, SUBSCRIPTION);
    await service.delete_account(OWNER_A);
    expect(store.one('SELECT payload_cipher FROM notifications')?.payload_cipher).not.toBe('');
    play.receipts[TOKEN] = product(OWNER_A, 0, 'GPA.late-resolved-order');
    expect(await service.notification(envelope('oneTimeProductNotification', { purchaseToken: TOKEN, sku: LIFE }, 'resolved-owner'), PACKAGE, SUBSCRIPTION)).toBe('account_deleted');
    expect(store.rows('SELECT payload_cipher,data_deleted FROM notifications')).toEqual([
      { payload_cipher: '', data_deleted: 1 }, { payload_cipher: '', data_deleted: 1 }]);
    await service.notification(envelope('pendingRefundReviewNotification', { pendingRefundToken: 'pending-token-for-late-order',
      orderId: 'GPA.late-resolved-order', refundReason: 7 }, 'late-order-review'), PACKAGE, SUBSCRIPTION);
    expect((await service.refund_review(SUBSCRIPTION, 'late-order-review')).accountDataDeleted).toBe(true);
    expect((await store.purchase(store, TOKEN))?.current_order).toBe('GPA.late-resolved-order');
  }));

  it('rejects replacements for both known and unobserved deleted linked accounts', async () => with_service(async (service, store, play) => {
    const known = 'known-deleted-subscription-token';
    play.receipts[known] = subscription();
    await service.refresh(SUB, known, OWNER_A);
    await service.delete_account(OWNER_A);
    for (const old of [known, 'unknown-deleted-subscription-token']) {
      const replacement = `replacement-token-${old}`;
      play.receipts[old] = subscription();
      play.receipts[replacement] = { ...subscription(OWNER_B, 'GPA.replacement..1', old), acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING' };
      await expect(service.refresh(SUB, replacement, OWNER_B)).rejects.toMatchObject({ code: 'purchase_unavailable' });
      expect(await service.notification(envelope('subscriptionNotification', { purchaseToken: replacement }, `notice-${old}`), PACKAGE, SUBSCRIPTION)).toBe('account_deleted');
      expect((await store.purchase(store, replacement))?.owner).toBeNull();
      expect((await store.purchase(store, replacement))?.active).toBe(0);
    }
    expect(play.acknowledgements).toEqual([]);
  }));

  it('rolls back the entire deletion if notification erasure fails', async () => with_service(async (service, store) => {
    await service.notification(envelope('oneTimeProductNotification', { purchaseToken: TOKEN, sku: LIFE }), PACKAGE, SUBSCRIPTION);
    store.redact_notification = () => { throw new Error('test erasure failure'); };
    await expect(service.delete_account(OWNER_A)).rejects.toThrow();
    expect(await store.account_deleted(store, OWNER_A)).toBeNull();
    expect((await store.purchase(store, TOKEN))?.owner).toBe(OWNER_A);
    expect((await store.purchase(store, TOKEN))?.active).toBe(1);
  }));

  it('records immutable external operator evidence without submitting refunds or changing access', async () => with_service(async (service, store, play, state) => {
    const notice = envelope('pendingRefundReviewNotification', { pendingRefundToken: 'sensitive-pending-refund-token',
      orderId: 'GPA.current-order', refundReason: 7 }, 'review-1');
    expect(await service.notification(notice, PACKAGE, SUBSCRIPTION)).toBe('operator_refund_review_required');
    const summary = await service.refund_reviews(SUBSCRIPTION);
    expect(JSON.stringify(summary)).not.toContain('sensitive-pending-refund-token');
    expect(await service.record_refund_review(SUBSCRIPTION, 'review-1', review_record(), 'operator@test')).toEqual({
      status: 'recorded', recordOnly: true, googleSubmissionVerified: false });
    expect((await service.record_refund_review(SUBSCRIPTION, 'review-1', review_record(), 'operator@test')).status).toBe('duplicate');
    await expect(service.record_refund_review(SUBSCRIPTION, 'review-1', { ...review_record(), preference: 'DECLINE' }, 'operator@test'))
      .rejects.toMatchObject({ code: 'refund_review_record_conflict', status: 409 });
    const restarted = new BillingService(new Store(state.storage, KEY), play, () => NOW);
    const detail = await restarted.refund_review(SUBSCRIPTION, 'review-1');
    expect((detail.externalResponseRecord as JsonObject).operator).toBe('operator@test');
    expect(detail.state).toBe('external_response_recorded');
    expect(play.lookups).toEqual([]); expect(play.acknowledgements).toEqual([]); expect(play.page_calls).toEqual([]);
    const record = store.one('SELECT record_cipher FROM refund_review_records');
    expect(record?.record_cipher).not.toContain('private-evidence-reference');
  }));

  it('keeps completed refund work completed after account data redaction, including later tasks', async () => with_service(async (service, store) => {
    await service.refresh(LIFE, TOKEN, OWNER_A);
    const review = { pendingRefundToken: 'pending-financial-task-token', orderId: 'GPA.current-order', refundReason: 7,
      obfuscatedAccountId: OWNER_A, obfuscatedProfileId: 'sensitive-profile' };
    await service.notification(envelope('pendingRefundReviewNotification', review, 'private-review'), PACKAGE, SUBSCRIPTION);
    await service.record_refund_review(SUBSCRIPTION, 'private-review', review_record(), 'operator@test');
    await service.delete_account(OWNER_A);
    const detail = await service.refund_review(SUBSCRIPTION, 'private-review');
    expect(detail.pendingRefundToken).toBe('pending-financial-task-token');
    expect(detail.accountDataDeleted).toBe(true); expect(detail.externalResponseRecord).toBeNull();
    expect(detail.state).toBe('external_response_recorded');
    expect(detail).not.toHaveProperty('obfuscatedAccountId'); expect(detail).not.toHaveProperty('obfuscatedProfileId');
    expect((await service.refund_reviews(SUBSCRIPTION)).reviews).toEqual([]);
    await service.notification(envelope('pendingRefundReviewNotification', review, 'later-review'), PACKAGE, SUBSCRIPTION);
    await service.record_refund_review(SUBSCRIPTION, 'later-review', review_record(), 'operator@test');
    expect((await service.refund_review(SUBSCRIPTION, 'later-review')).externalResponseRecord).toBeNull();
    expect(store.rows('SELECT record_cipher FROM refund_review_records')).toEqual([{ record_cipher: '' }, { record_cipher: '' }]);
  }));

  it('validates review records and isolates paginated subscription queues', async () => with_service(async (service) => {
    for (const id of ['review-1', 'review-2', 'review-3']) await service.notification(envelope('pendingRefundReviewNotification', {
      pendingRefundToken: `pending-token-${id}`, orderId: `GPA.${id}`, refundReason: 7 }, id), PACKAGE, SUBSCRIPTION);
    const first = await service.refund_reviews(SUBSCRIPTION, 'open', '', 2);
    expect(first.nextAfter).toBe('review-2');
    const second = await service.refund_reviews(SUBSCRIPTION, 'open', String(first.nextAfter), 2);
    expect((second.reviews as JsonObject[]).map(row => row.messageId)).toEqual(['review-3']);
    expect(second.nextAfter).toBeNull();
    expect((await service.refund_reviews('another-subscription')).reviews).toEqual([]);
    await expect(service.refund_review('another-subscription', 'review-1')).rejects.toMatchObject({ status: 404 });
    for (const update of [{ externalSubmissionConfirmed: false }, { preference: 'AUTO' }, { preference: ['NEUTRAL'] }, { submittedAt: true },
      { submittedAt: NOW + 60 }, { externalSubmissionReference: '' }, { extraField: true }]) {
      await expect(service.record_refund_review(SUBSCRIPTION, 'review-1', { ...review_record(), ...update }, 'operator@test'))
        .rejects.toMatchObject({ code: 'invalid_external_response_record' });
    }
  }));

  it('keeps Python-generated immutable hashes for Unicode external evidence', async () => with_service(async (service, store) => {
    await service.notification(envelope('pendingRefundReviewNotification', { pendingRefundToken: 'pending-unicode-evidence',
      orderId: 'GPA.unicode-evidence', refundReason: 7 }, 'unicode-review'), PACKAGE, SUBSCRIPTION);
    const record = { ...review_record(), externalSubmissionReference: '증빙-한국어-참조-1234' };
    await service.record_refund_review(SUBSCRIPTION, 'unicode-review', record, 'operator@test');
    // Calculated independently with billing-server's Python json.dumps(sort_keys=True,
    // separators=(',',':'), ensure_ascii=True) and hashlib.sha256.
    expect(store.one('SELECT record_hash FROM refund_review_records')?.record_hash)
      .toBe('9381e2466bbeef1f60ff26506aa6a06042f37a3361b14f9277e7bd56415eca71');
    expect((await service.record_refund_review(SUBSCRIPTION, 'unicode-review', record, 'another-operator@test')).status).toBe('duplicate');
  }));

  it('migrates legacy unindexed SQLite notices and erases their associations without replacing state', async () => {
    const namespace = (env as unknown as Env).BILLING_STATE;
    await runInDurableObject(namespace.get(namespace.idFromName(crypto.randomUUID())), async (_instance, state) => {
      state.storage.sql.exec(`CREATE TABLE purchases (token_hash TEXT PRIMARY KEY,token_cipher TEXT NOT NULL,
        product TEXT NOT NULL,owner TEXT,active INTEGER NOT NULL DEFAULT 0,valid_until INTEGER NOT NULL DEFAULT 0,
        current_order TEXT NOT NULL DEFAULT '',superseded INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL DEFAULT 0)`).toArray();
      state.storage.sql.exec(`CREATE TABLE notifications (subscription TEXT NOT NULL,message_id TEXT NOT NULL,
        payload_hash TEXT NOT NULL,payload_cipher TEXT NOT NULL,status TEXT NOT NULL,processed_at INTEGER NOT NULL,
        PRIMARY KEY(subscription,message_id))`).toArray();
      const cipher = new Fernet(KEY);
      const payload = JSON.stringify({ version: '1.0', packageName: PACKAGE, eventTimeMillis: String(NOW * 1000),
        oneTimeProductNotification: { purchaseToken: TOKEN, sku: LIFE } });
      state.storage.sql.exec('INSERT INTO purchases VALUES(?,?,?,?,?,?,?,?,?)', await token_hash(TOKEN), await cipher.encrypt(TOKEN),
        LIFE, OWNER_A, 1, 0, 'GPA.current-order', 0, NOW).toArray();
      state.storage.sql.exec('INSERT INTO notifications VALUES(?,?,?,?,?,?)', SUBSCRIPTION, 'legacy', 'original-digest',
        await cipher.encrypt(payload), 'processed', NOW).toArray();
      const store = new Store(state.storage, KEY), play = new FakePlay();
      expect((await store.purchase(store, TOKEN))?.owner).toBe(OWNER_A);
      const service = new BillingService(store, play, () => NOW);
      expect((await service.delete_account(OWNER_A)).notificationsRedacted).toBe(1);
      expect(store.one('SELECT payload_cipher,payload_hash,data_deleted FROM notifications')).toEqual({
        payload_cipher: '', payload_hash: 'original-digest', data_deleted: 1 });
      expect((await store.purchase(store, TOKEN))?.account_deleted).toBe(1);
    });
  });

  it('refuses a reconciliation page cap rather than treating truncated history as synchronized', async () => with_service(async (service, store, play) => {
    await store.transaction(async db => store.set_metadata(db, 'voided_sync_at', NOW - 200));
    play.pages.set(undefined, { voidedPurchases: [], tokenPagination: { nextPageToken: 'page-1' } });
    for (let index = 1; index <= 100; index++) play.pages.set(`page-${index}`, {
      voidedPurchases: [], tokenPagination: { nextPageToken: `page-${index + 1}` } });
    await expect(service.reconcile_voids()).rejects.toThrow('voided_pagination_limit');
    expect(play.page_calls).toHaveLength(100);
    expect(store.metadata(store, 'voided_sync_at')).toBe(String(NOW - 200));
  }));

  it('requires durable SQLite and absolute token/owner endings', () => {
    expect(() => new Store({} as DurableObjectStorage, KEY)).toThrow('Durable SQLite-backed Durable Object storage is required');
    expect(valid_token(TOKEN + '\n')).toBe(false);
    expect(receipt_owner(LIFE, product(OWNER_A + '\n'))).toBeNull();
  });

  it('rejects decimal/exponent RTDN integer literals without Google or durable side effects', async () => with_service(async (service, store, play) => {
    function raw_notice(kind: string, body: string, eventTime = JSON.stringify(String(NOW * 1000))): JsonObject {
      const raw = `{"version":"1.0","packageName":"${PACKAGE}","eventTimeMillis":${eventTime},"${kind}":${body}}`;
      return { subscription: SUBSCRIPTION, message: { messageId: 'raw-integer-notice', data: btoa(raw) } };
    }
    for (const value of ['2.0', '2e0']) {
      const body = `{"purchaseToken":"${TOKEN}","orderId":"GPA.current-order","productType":${value},"refundType":1}`;
      await expect(service.notification(raw_notice('voidedPurchaseNotification', body), PACKAGE, SUBSCRIPTION))
        .rejects.toMatchObject({ code: 'unsupported_voided_notification' });
    }
    for (const value of ['1.0', '1e0']) {
      const body = `{"purchaseToken":"${TOKEN}","orderId":"GPA.current-order","productType":2,"refundType":${value}}`;
      await expect(service.notification(raw_notice('voidedPurchaseNotification', body), PACKAGE, SUBSCRIPTION))
        .rejects.toMatchObject({ code: 'unsupported_voided_notification' });
    }
    for (const value of ['7.0', '7e0']) {
      const body = `{"pendingRefundToken":"pending-raw-integer-review","orderId":"GPA.current-order","refundReason":${value}}`;
      await expect(service.notification(raw_notice('pendingRefundReviewNotification', body), PACKAGE, SUBSCRIPTION))
        .rejects.toMatchObject({ code: 'invalid_refund_review' });
    }
    for (const value of [String(NOW * 1000) + '.0', '179046e7']) {
      await expect(decode_notification(raw_notice('testNotification', '{}', value), PACKAGE, SUBSCRIPTION))
        .rejects.toMatchObject({ code: 'invalid_developer_notification' });
    }
    expect(play.lookups).toEqual([]);
    expect(play.acknowledgements).toEqual([]);
    expect(store.rows('SELECT * FROM notifications')).toHaveLength(0);
    expect(store.rows('SELECT * FROM purchases')).toHaveLength(0);
    expect(store.rows('SELECT * FROM voids')).toHaveLength(0);
    // Both the documented string timestamp and a JSON integer remain accepted.
    for (const value of [JSON.stringify(String(NOW * 1000)), String(NOW * 1000)]) {
      const decoded = await decode_notification(raw_notice('testNotification', '{}', value), PACKAGE, SUBSCRIPTION);
      expect(decoded[3]).toBe('testNotification');
    }
  }));

  it('rejects malformed or ambiguous notification payloads before any durable work', async () => {
    await expect(decode_notification({}, PACKAGE, SUBSCRIPTION)).rejects.toMatchObject({ code: 'invalid_pubsub_subscription' });
    await expect(decode_notification(envelope('testNotification', {}, 'valid', 'evil.app'), PACKAGE, SUBSCRIPTION))
      .rejects.toMatchObject({ code: 'invalid_developer_notification' });
    const mixed = { version: '1.0', packageName: PACKAGE, eventTimeMillis: String(NOW * 1000), testNotification: {}, subscriptionNotification: {} };
    const notice = envelope('testNotification', {}) as { message: JsonObject } & JsonObject;
    notice.message.data = btoa(JSON.stringify(mixed));
    await expect(decode_notification(notice, PACKAGE, SUBSCRIPTION)).rejects.toMatchObject({ code: 'invalid_developer_notification' });
    notice.message.data = 'not base64 with whitespace';
    await expect(decode_notification(notice, PACKAGE, SUBSCRIPTION)).rejects.toMatchObject({ code: 'invalid_developer_notification' });
    expect(await token_hash(TOKEN)).toMatch(/^[a-f0-9]{64}$/);
  });
});
