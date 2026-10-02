"""Receipt ownership and revocation. Notifications trigger Google lookups, never grants by type."""
import base64
import hashlib
import json
import re
import time
from entitlements import SUB, LIFE, decision, epoch
from persistence import token_hash
from security import BillingError

KINDS = ('subscriptionNotification', 'oneTimeProductNotification', 'voidedPurchaseNotification',
         'pendingRefundReviewNotification', 'testNotification')


def valid_token(value):
    return isinstance(value, str) and re.fullmatch(r'[!-~]{8,4096}', value) is not None


def receipt_owner(product, receipt):
    identifiers = receipt.get('externalAccountIdentifiers', {}) if product == SUB else receipt
    value = identifiers.get('obfuscatedExternalAccountId') if isinstance(identifiers, dict) else None
    return value if isinstance(value, str) and re.fullmatch(r'[a-f0-9]{64}', value) else None


def receipt_order(product, receipt):
    if product == LIFE:
        value = receipt.get('orderId', '')
    else:
        raw = receipt.get('lineItems', [])
        rows = [r for r in raw if isinstance(r, dict) and r.get('productId') == SUB] if isinstance(raw, list) else []
        row = max(rows, key=lambda r: epoch(r.get('expiryTime')), default={})
        value = row.get('latestSuccessfulOrderId', '')
    return value if isinstance(value, str) and len(value) <= 200 else ''


def decode_notification(envelope, package, subscription):
    if not isinstance(envelope, dict) or envelope.get('subscription') != subscription:
        raise BillingError('invalid_pubsub_subscription')
    message = envelope.get('message', {})
    if not isinstance(message, dict) or not isinstance(message.get('messageId'), str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', message['messageId']):
        raise BillingError('invalid_pubsub_message')
    try:
        raw = base64.b64decode(message['data'], validate=True)
        if len(raw) > 32768:
            raise ValueError()
        payload = json.loads(raw)
        if not isinstance(payload, dict) or payload.get('packageName') != package or payload.get('version') != '1.0':
            raise ValueError()
        stamp = str(payload['eventTimeMillis'])
        if not re.fullmatch(r'[0-9]{1,16}', stamp) or int(stamp) <= 0:
            raise ValueError()
        kinds = [k for k in KINDS if k in payload]
        if len(kinds) != 1 or not isinstance(payload[kinds[0]], dict):
            raise ValueError()
    except (KeyError, TypeError, ValueError, UnicodeError):
        raise BillingError('invalid_developer_notification') from None
    return message['messageId'], hashlib.sha256(raw).hexdigest(), raw.decode(), kinds[0], payload[kinds[0]]


class BillingService:
    def __init__(self, store, play, clock=time.time):
        self.store, self.play, self.clock = store, play, clock

    def synchronized(self):
        with self.store.transaction() as db:
            value = self.store.metadata(db, 'voided_sync_at')
            return bool(value) and 0 <= int(self.clock()) - int(value) <= 86400

    def refresh(self, product, token, owner):
        with self.store.transaction() as db:
            return self._refresh(db, product, token, owner)

    def assert_account(self, owner):
        with self.store.transaction() as db:
            self.store.assert_account(db, owner)

    def delete_account(self, owner):
        with self.store.transaction() as db:
            return self.store.delete_account(db, owner, int(self.clock()))

    def issue_lease(self, product, token, owner, issuer):
        # Sign while holding the same write lock as deletion. A lease issued before deletion
        # may remain valid for its bounded offline TTL, but none can be issued after it commits.
        with self.store.transaction() as db:
            self.store.assert_account(db, owner)
            result = self._refresh(db, product, token, owner)
            self.store.assert_account(db, owner)
            return issuer(result)

    def _deleted_result(self, product):
        return {'active': False, 'kind': 'subscription' if product == SUB else 'lifetime',
                'until': 0, 'ackNeeded': False, 'accountDeleted': True}

    def _linked_deleted(self, db, token, linked, owner):
        if not valid_token(linked) or linked == token:
            raise BillingError('invalid_linked_purchase')
        old = self.store.purchase(db, linked)
        if old and old['account_deleted']:
            return True
        self.store.assert_owner(db, linked, SUB, owner)
        if old is None or not old['owner']:
            # An unobserved old token must not be rebound from the new token alone.
            previous_owner = receipt_owner(SUB, self.play.lookup(SUB, linked))
            if self.store.account_deleted(db, previous_owner):
                return True
            if not previous_owner or previous_owner != owner:
                raise BillingError('purchase_account_mismatch', 403)
        return False

    def _refresh(self, db, product, token, expected_owner=None):
        now = int(self.clock())
        old = self.store.purchase(db, token)
        if expected_owner:
            self.store.assert_owner(db, token, product, expected_owner)
        elif old and old['product'] != product:
            raise BillingError('purchase_product_mismatch', 403)
        if old and old['account_deleted']:
            return self._deleted_result(product)
        receipt = self.play.lookup(product, token)
        result = decision(product, receipt, now)
        owner = receipt_owner(product, receipt)
        if self.store.account_deleted(db, owner):
            if expected_owner:
                raise BillingError('purchase_unavailable', 403)
            self.store.erase_purchase(db, token, product, receipt_order(product, receipt), now)
            return self._deleted_result(product)
        if expected_owner and owner and owner != expected_owner:
            raise BillingError('purchase_account_mismatch', 403)
        if old and old['owner'] and owner and old['owner'] != owner:
            raise BillingError('purchase_owned_by_another_account', 403)
        if result['active'] and not owner:
            raise BillingError('purchase_account_link_required', 403)
        owner = owner or (old['owner'] if old else None)
        if expected_owner and result['active'] and owner != expected_owner:
            raise BillingError('purchase_account_mismatch', 403)
        current_order = receipt_order(product, receipt)
        if self.store.blocked(db, token, product, current_order):
            result = dict(result, active=False, ackNeeded=False)
        linked = receipt.get('linkedPurchaseToken') if product == SUB else None
        if result['active'] and linked:
            if self._linked_deleted(db, token, linked, owner):
                if expected_owner:
                    raise BillingError('purchase_unavailable', 403)
                self.store.erase_purchase(db, token, product, current_order, now)
                return self._deleted_result(product)
        if result['ackNeeded']:
            self.play.acknowledge(product, token)
            rechecked = self.play.lookup(product, token)
            confirmed = decision(product, rechecked, now)
            if confirmed['ackNeeded'] or receipt_owner(product, rechecked) != owner:
                raise RuntimeError('acknowledgement_not_confirmed')
            receipt, result = rechecked, confirmed
            current_order = receipt_order(product, receipt)
            if self.store.blocked(db, token, product, current_order):
                result = dict(result, active=False, ackNeeded=False)
            linked = receipt.get('linkedPurchaseToken') if product == SUB else None
            if result['active'] and linked:
                if self._linked_deleted(db, token, linked, owner):
                    if expected_owner:
                        raise BillingError('purchase_unavailable', 403)
                    self.store.erase_purchase(db, token, product, current_order, now)
                    return self._deleted_result(product)
        if result['active'] and linked:
            self.store.supersede(db, linked, owner, now)
        if receipt or old:
            self.store.save(db, token, product, owner, result, current_order, now)
        return result

    def record_void(self, token, order):
        if not valid_token(token) or not isinstance(order, str) or not 1 <= len(order) <= 200:
            raise BillingError('invalid_voided_purchase')
        # Persist denial before a Google retry: an outage must not resurrect a refund.
        with self.store.transaction() as db:
            self.store.void(db, token, order, int(self.clock()))
            old = self.store.purchase(db, token)
            if old and (old['product'] == LIFE or old['current_order'] in ('', order)):
                db.execute('UPDATE purchases SET active=0 WHERE token_hash=?', (token_hash(token),))
            return old['product'] if old else None

    def notification(self, envelope, package, subscription):
        message_id, digest, raw, kind, notice = decode_notification(envelope, package, subscription)
        with self.store.transaction() as db:
            if self.store.message_seen(db, subscription, message_id, digest):
                return 'duplicate'
        if kind == 'voidedPurchaseNotification':
            product = {1: SUB, 2: LIFE}.get(notice.get('productType'))
            if not product or type(notice.get('productType')) is not int or notice.get('refundType') not in (1, 2):
                raise BillingError('unsupported_voided_notification')
            self.record_void(notice.get('purchaseToken'), notice.get('orderId'))
        with self.store.transaction() as db:
            if self.store.message_seen(db, subscription, message_id, digest):
                return 'duplicate'
            status = 'processed'
            token, owner, order, deleted = None, None, notice.get('orderId'), False
            if kind == 'pendingRefundReviewNotification':
                # Monetary decisions require operator evidence; never auto-refund.
                if (not valid_token(notice.get('pendingRefundToken'))
                        or not isinstance(notice.get('orderId'), str) or not 1 <= len(notice['orderId']) <= 200
                        or type(notice.get('refundReason')) is not int or not 1 <= notice['refundReason'] <= 255):
                    raise BillingError('invalid_refund_review')
                status = 'operator_refund_review_required'
                value = notice.get('obfuscatedAccountId')
                owner = value if isinstance(value, str) and re.fullmatch(r'[a-f0-9]{64}', value) else None
                purchase = db.execute('SELECT owner,account_deleted FROM purchases WHERE current_order=?',
                                      (notice['orderId'],)).fetchone()
                if purchase:
                    owner = owner or purchase['owner']
                deleted = bool(self.store.account_deleted(db, owner) or purchase and purchase['account_deleted'])
            elif kind != 'testNotification':
                token = notice.get('purchaseToken')
                if not valid_token(token):
                    raise BillingError('invalid_purchase_token')
                if kind == 'subscriptionNotification':
                    product = SUB
                elif kind == 'oneTimeProductNotification':
                    if notice.get('sku') != LIFE:
                        raise BillingError('unsupported_product')
                    product = LIFE
                refreshed = self._refresh(db, product, token)
                purchase = self.store.purchase(db, token)
                owner = purchase['owner'] if purchase else None
                order = receipt_order(product, {}) if not purchase else purchase['current_order']
                deleted = bool(refreshed.get('accountDeleted'))
                if deleted:
                    status = 'account_deleted'
            self.store.message_done(db, subscription, message_id, digest, raw, status, int(self.clock()),
                                    purchase_token=token, owner=owner, order_id=order,
                                    data_deleted=deleted)
            return status

    def _review_view(self, row, detail=False):
        payload = json.loads(self.store.decrypt(row['payload_cipher']))
        notice = payload['pendingRefundReviewNotification']
        result = {'messageId': row['message_id'], 'orderId': notice['orderId'],
                  'refundReason': notice['refundReason'], 'eventTimeMillis': payload['eventTimeMillis'],
                  'receivedAt': row['processed_at'], 'responseDueAt': row['processed_at'] + 86400,
                  'state': 'external_response_recorded' if row['recorded_at'] is not None else 'needs_operator',
                  'googleSubmissionVerified': False}
        if detail:
            result['pendingRefundToken'] = notice['pendingRefundToken']
            for key in ('obfuscatedAccountId', 'obfuscatedProfileId'):
                if key in notice:
                    result[key] = notice[key]
            result['externalResponseRecord'] = (json.loads(self.store.decrypt(row['record_cipher']))
                                                if row['record_cipher'] else None)
        if row['data_deleted']:
            result['accountDataDeleted'] = True
        return result

    def refund_reviews(self, subscription, state='open', after='', limit=50):
        if state not in ('open', 'recorded', 'all') or type(limit) is not int or not 1 <= limit <= 100:
            raise BillingError('invalid_review_query')
        if after and (not isinstance(after, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', after)):
            raise BillingError('invalid_review_query')
        with self.store.transaction() as db:
            rows = self.store.refund_reviews(db, subscription, state, after, limit + 1)
            values = [self._review_view(row) for row in rows[:limit]]
            return {'reviews': values, 'nextAfter': rows[limit-1]['message_id'] if len(rows) > limit else None}

    def refund_review(self, subscription, message_id):
        with self.store.transaction() as db:
            row = self.store.refund_review(db, subscription, message_id)
            if row is None:
                raise BillingError('refund_review_not_found', 404)
            return self._review_view(row, detail=True)

    def record_refund_review(self, subscription, message_id, body, operator):
        # This records a human's separately performed API submission. It never
        # invokes ReviewRefund, refunds a payment, or changes an entitlement.
        now = int(self.clock())
        fields = {'preference', 'externalSubmissionReference', 'submittedAt', 'externalSubmissionConfirmed'}
        if (not isinstance(body, dict) or set(body) != fields
                or body['preference'] not in ('APPROVE', 'DECLINE', 'NEUTRAL')
                or body['externalSubmissionConfirmed'] is not True
                or type(body['submittedAt']) is not int or not 1 <= body['submittedAt'] <= now + 30
                or not isinstance(body['externalSubmissionReference'], str)
                or not 8 <= len(body['externalSubmissionReference']) <= 1000
                or any(ord(c) < 32 for c in body['externalSubmissionReference'])):
            raise BillingError('invalid_external_response_record')
        encoded = json.dumps(body, sort_keys=True, separators=(',', ':'))
        digest = hashlib.sha256(encoded.encode()).hexdigest()
        record = dict(body, operator=operator, recordedAt=now, googleSubmissionVerified=False)
        with self.store.transaction() as db:
            if self.store.refund_review(db, subscription, message_id) is None:
                raise BillingError('refund_review_not_found', 404)
            status = self.store.record_refund_review(db, subscription, message_id, digest,
                        json.dumps(record, separators=(',', ':')), now)
        return {'status': status, 'googleSubmissionVerified': False, 'recordOnly': True}

    def reconcile_voids(self):
        now = int(self.clock())
        with self.store.transaction() as db:
            last = self.store.metadata(db, 'voided_sync_at')
        if last and now - int(last) > 30 * 86400:
            raise BillingError('refund_sync_gap_requires_recovery', 503)
        # Google filters by time a void is observed, not voidedTimeMillis. Overlap catches delays.
        start = max((now - 30 * 86400) * 1000,
                    (int(last) - 86400) * 1000 if last else (now - 30 * 86400) * 1000)
        end, page, seen_pages, count = now * 1000, None, set(), 0
        for _ in range(100):
            response = self.play.voided(start, end, page)
            rows = response.get('voidedPurchases', [])
            if not isinstance(rows, list):
                raise RuntimeError('invalid_voided_response')
            for row in rows:
                product = self.record_void(row.get('purchaseToken'), row.get('orderId'))
                if product:
                    self.refresh(product, row['purchaseToken'], None)
                count += 1
            page = response.get('tokenPagination', {}).get('nextPageToken')
            if not page:
                with self.store.transaction() as db:
                    self.store.set_metadata(db, 'voided_sync_at', now)
                return count
            if not isinstance(page, str) or page in seen_pages:
                raise RuntimeError('invalid_voided_pagination')
            seen_pages.add(page)
        raise RuntimeError('voided_pagination_limit')
