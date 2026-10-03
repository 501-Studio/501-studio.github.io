"""Security regressions use real SQLite/Flask/RSA and explicit mocked Google boundaries."""
import base64
import copy
import json
import sys
import tempfile
import threading
import time
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from app import create_app
from entitlements import SUB, LIFE
from persistence import Store, token_hash
from security import BillingError, account_id, check_integrity, google_identity, request_hash
from service import BillingService, decode_notification

PACKAGE = 'com.studio501.kotoba'
SUBSCRIPTION = 'projects/test-project/subscriptions/play-rtdn'
SECRET = 'test-only-account-key-with-32-characters'
CERTIFICATE = 'A' * 43
AUTH_A, AUTH_B = 'user-identity-token-A', 'user-identity-token-B'
OWNER_A, OWNER_B = account_id('123456789', SECRET), account_id('987654321', SECRET)
TOKEN = 'test-purchase-token-secret-12345'
NOW = int(time.time())


def product(owner=OWNER_A, state=0, order='GPA.current-order'):
    return {'purchaseState': state, 'acknowledgementState': 1, 'consumptionState': 0,
            'obfuscatedExternalAccountId': owner, 'orderId': order, 'productId': LIFE}


def subscription(owner=OWNER_A, order='GPA.current-order..1', linked=None):
    out = {'subscriptionState': 'SUBSCRIPTION_STATE_ACTIVE',
           'acknowledgementState': 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
           'externalAccountIdentifiers': {'obfuscatedExternalAccountId': owner},
           'lineItems': [{'productId': SUB, 'offerDetails': {'basePlanId': 'monthly'},
                          'expiryTime': datetime.fromtimestamp(NOW + 86400, timezone.utc).isoformat(),
                          'latestSuccessfulOrderId': order}]}
    if linked:
        out['linkedPurchaseToken'] = linked
    return out


def envelope(kind, value, message_id='notification-1', package=PACKAGE):
    data = {'version': '1.0', 'packageName': package, 'eventTimeMillis': str(NOW * 1000), kind: value}
    return {'subscription': SUBSCRIPTION, 'message': {'messageId': message_id,
            'data': base64.b64encode(json.dumps(data).encode()).decode()}}


def integrity(expected, now=NOW):
    return {'requestDetails': {'requestPackageName': PACKAGE, 'requestHash': expected, 'timestampMillis': str(now * 1000)},
            'appIntegrity': {'appRecognitionVerdict': 'PLAY_RECOGNIZED', 'packageName': PACKAGE,
                             'certificateSha256Digest': [CERTIFICATE]},
            'accountDetails': {'appLicensingVerdict': 'LICENSED'},
            'deviceIntegrity': {'deviceRecognitionVerdict': ['MEETS_DEVICE_INTEGRITY']}}


class FakePlay:
    def __init__(self):
        self.receipts, self.lookups, self.acknowledgements = {}, [], []
        self.fail_lookup, self.fail_ack, self.integrity = False, False, None
        self.pages, self.page_calls = {}, []

    def lookup(self, item, token):
        self.lookups.append((item, token))
        if self.fail_lookup:
            raise RuntimeError('network error containing token ' + token)
        return copy.deepcopy(self.receipts.get(token, {}))

    def acknowledge(self, item, token):
        self.acknowledgements.append((item, token))
        if not self.fail_ack:
            self.receipts[token]['acknowledgementState'] = 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' if item == SUB else 1

    def decode_integrity(self, token):
        return copy.deepcopy(self.integrity)

    def voided(self, start, end, page=None):
        self.page_calls.append((start, end, page))
        return copy.deepcopy(self.pages.get(page, {'voidedPurchases': []}))


class SecurityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        cls.pem = cls.key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                       serialization.NoEncryption())

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        self.encryption = Fernet.generate_key().decode()
        self.store = Store(str(self.directory / 'billing.sqlite'), self.encryption)
        self.play = FakePlay()
        self.service = BillingService(self.store, self.play)
        self.play.receipts[TOKEN] = product()
        (self.directory / 'signing.pem').write_bytes(self.pem)
        self.config = {'RECEIPT_VERIFICATION_ENABLED': 'true', 'PLAY_PACKAGE': PACKAGE,
            'ENTITLEMENT_KEY_FILE': str(self.directory / 'signing.pem'), 'SQLITE_PATH': str(self.directory / 'billing.sqlite'),
            'TOKEN_ENCRYPTION_KEY': self.encryption, 'ACCOUNT_HMAC_KEY': SECRET,
            'GOOGLE_OAUTH_CLIENT_ID': 'test.apps.googleusercontent.com', 'PLAY_SIGNING_CERT_SHA256': CERTIFICATE,
            'PUBSUB_AUDIENCE': 'https://billing.test/rtdn', 'PUBSUB_SERVICE_ACCOUNT_EMAIL': 'rtdn@test.iam.gserviceaccount.com',
            'PUBSUB_SUBSCRIPTION': SUBSCRIPTION, 'OPS_AUDIENCE': 'https://billing.test/tasks',
            'OPS_SERVICE_ACCOUNT_EMAIL': 'ops@test.iam.gserviceaccount.com'}
        self.identity_calls = []
        self.app = create_app(self.config, service=self.service, verify_identity=self.identity)
        self.client = self.app.test_client()
        self.app.testing = True
        with self.store.transaction() as db:
            self.store.set_metadata(db, 'voided_sync_at', int(time.time()))

    def identity(self, token, audience, service_email=None):
        self.identity_calls.append((token, audience, service_email))
        if service_email:
            expected = 'pubsub-identity-token' if 'rtdn@' in service_email else 'scheduler-identity-token'
            if token != expected:
                raise BillingError('invalid_push_identity', 403)
            return {'sub': '1234', 'email': service_email, 'email_verified': True}
        if token not in (AUTH_A, AUTH_B):
            raise BillingError('invalid_identity', 401)
        return {'sub': '123456789' if token == AUTH_A else '987654321'}

    def call(self, path, body=None, auth=AUTH_A, secure=True, method='post'):
        return getattr(self.client, method)(path, json=body,
            headers={'Authorization': 'Bearer ' + auth} if auth else {},
            base_url=('https://' if secure else 'http://') + 'billing.test')

    def verify(self, auth=AUTH_A, installation='installation-1234', **changes):
        owner = OWNER_A if auth == AUTH_A else OWNER_B
        body = {'packageName': PACKAGE, 'productId': LIFE, 'purchaseToken': TOKEN,
                'installationId': installation, 'integrityToken': 'standard-integrity-token'}
        body.update(changes)
        self.play.integrity = integrity(request_hash(PACKAGE, body['productId'], body['purchaseToken'], installation, owner))
        return self.call('/verify', body, auth)

    def test_unconfigured_and_unauthenticated_cannot_grant(self):
        client = create_app({}).test_client()
        self.assertEqual(client.post('/verify', json={'active': True}, base_url='https://billing.test').status_code, 503)
        self.assertEqual(self.call('/account', auth=None).status_code, 401)
        self.assertEqual(self.call('/account', secure=False).status_code, 400)
        self.assertFalse(self.play.lookups)

    def test_pubsub_and_operations_cannot_share_service_identity(self):
        config = dict(self.config, OPS_SERVICE_ACCOUNT_EMAIL=self.config['PUBSUB_SERVICE_ACCOUNT_EMAIL'])
        client = create_app(config, service=self.service, verify_identity=self.identity).test_client()
        self.assertEqual(client.post('/account', base_url='https://billing.test').status_code, 503)

    def test_account_is_stable_and_no_client_boolean_grants(self):
        self.assertEqual(self.call('/account', {'accountId': OWNER_B, 'premium': True}).json,
                         {'obfuscatedAccountId': OWNER_A})
        self.assertEqual(self.verify(active=True, accountId=OWNER_B).status_code, 200)

    def test_valid_lease_and_same_account_reinstall_restore(self):
        first, restored = self.verify(), self.verify(installation='installation-new-device')
        self.assertEqual((first.status_code, restored.status_code), (200, 200))
        for response, install in [(first, 'installation-1234'), (restored, 'installation-new-device')]:
            parts = response.json['lease'].split('.')
            value = json.loads(base64.urlsafe_b64decode(parts[1] + '=' * (-len(parts[1]) % 4)))
            self.assertEqual((value['account'], value['sub']), (OWNER_A, install))
            self.assertTrue(value['active'])
            self.assertLessEqual(value['exp'] - value['iat'], 3600)

    def test_token_cannot_move_to_another_authenticated_account(self):
        self.assertEqual(self.verify().status_code, 200)
        self.assertEqual(self.verify(AUTH_B).status_code, 403)
        restart = Store(str(self.directory / 'billing.sqlite'), self.encryption)
        with restart.transaction() as db:
            self.assertEqual(restart.purchase(db, TOKEN)['owner'], OWNER_A)

    def test_wrong_google_account_never_acknowledged_or_persisted(self):
        self.play.receipts[TOKEN] = product(OWNER_B)
        self.play.receipts[TOKEN]['acknowledgementState'] = 0
        self.assertEqual(self.verify().status_code, 403)
        self.assertEqual(self.play.acknowledgements, [])
        with self.store.transaction() as db:
            self.assertIsNone(self.store.purchase(db, TOKEN))

    def test_legacy_unlinked_purchase_fails_closed(self):
        self.play.receipts[TOKEN].pop('obfuscatedExternalAccountId')
        response = self.verify()
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json['error'], 'purchase_account_link_required')

    def test_acknowledgement_must_be_confirmed_by_google(self):
        self.play.receipts[TOKEN]['acknowledgementState'] = 0
        self.play.fail_ack = True
        self.assertEqual(self.verify().status_code, 503)
        with self.store.transaction() as db:
            self.assertIsNone(self.store.purchase(db, TOKEN))
        self.play.fail_ack = False
        self.assertEqual(self.verify().status_code, 200)

    def test_missing_integrity_and_stale_refund_sync_cannot_grant(self):
        self.assertEqual(self.verify(integrityToken='').status_code, 403)
        with self.store.transaction() as db:
            self.store.set_metadata(db, 'voided_sync_at', int(time.time()) - 86401)
        self.assertEqual(self.verify().status_code, 503)
        self.assertFalse(self.play.lookups)

    def test_integrity_verdict_checks_hash_package_certificate_age_license_and_device(self):
        expected = 'a-request-hash'
        check_integrity(integrity(expected), PACKAGE, expected, [CERTIFICATE], NOW)
        changes = [('requestDetails','requestHash','wrong'), ('requestDetails','requestPackageName','evil.app'),
                   ('requestDetails','timestampMillis',str((NOW-121)*1000)),
                   ('appIntegrity','appRecognitionVerdict','UNRECOGNIZED_VERSION'),
                   ('appIntegrity','certificateSha256Digest',['B'*43]),
                   ('accountDetails','appLicensingVerdict','UNLICENSED'),
                   ('deviceIntegrity','deviceRecognitionVerdict',[])]
        for group, key, value in changes:
            case = integrity(expected)
            case[group][key] = value
            with self.subTest(key=key), self.assertRaises(BillingError):
                check_integrity(case, PACKAGE, expected, [CERTIFICATE], NOW)
        for payload in (None, [], {'requestDetails': [], 'appIntegrity': {}},
                        dict(integrity(expected), accountDetails=[])):
            with self.subTest(payload=payload), self.assertRaises(BillingError):
                check_integrity(payload, PACKAGE, expected, [CERTIFICATE], NOW)

    def test_invalid_pubsub_identity_has_no_state_changes(self):
        notice = envelope('oneTimeProductNotification', {'purchaseToken': TOKEN, 'sku': LIFE, 'notificationType': 1})
        self.assertEqual(self.call('/rtdn', notice, AUTH_A).status_code, 403)
        self.assertFalse(self.play.lookups)

    def test_rtdn_google_refresh_and_durable_duplicate_detection(self):
        notice = envelope('oneTimeProductNotification', {'purchaseToken': TOKEN, 'sku': LIFE, 'notificationType': 1})
        self.assertEqual(self.call('/rtdn', notice, 'pubsub-identity-token').json['status'], 'processed')
        before = len(self.play.lookups)
        reopened = BillingService(Store(str(self.directory/'billing.sqlite'), self.encryption), self.play)
        self.assertEqual(reopened.notification(notice, PACKAGE, SUBSCRIPTION), 'duplicate')
        self.assertEqual(len(self.play.lookups), before)

    def test_rtdn_type_does_not_override_authoritative_expired_state(self):
        self.play.receipts[TOKEN] = product(state=1)
        notice = envelope('oneTimeProductNotification', {'purchaseToken': TOKEN, 'sku': LIFE, 'notificationType': 1})
        self.service.notification(notice, PACKAGE, SUBSCRIPTION)
        with self.store.transaction() as db:
            self.assertFalse(self.store.purchase(db, TOKEN)['active'])

    def test_google_outage_retries_without_completed_duplicate_marker_or_token_leak(self):
        notice = envelope('oneTimeProductNotification', {'purchaseToken': TOKEN, 'sku': LIFE, 'notificationType': 1})
        self.play.fail_lookup = True
        response = self.call('/rtdn', notice, 'pubsub-identity-token')
        self.assertEqual(response.status_code, 503)
        self.assertNotIn(TOKEN, response.get_data(as_text=True))
        self.play.fail_lookup = False
        self.assertEqual(self.call('/rtdn', notice, 'pubsub-identity-token').json['status'], 'processed')

    def test_voided_lifetime_is_persisted_even_during_google_outage(self):
        self.service.refresh(LIFE, TOKEN, OWNER_A)
        notice = envelope('voidedPurchaseNotification', {'purchaseToken': TOKEN, 'orderId': 'GPA.current-order',
                           'productType': 2, 'refundType': 1})
        self.play.fail_lookup = True
        self.assertEqual(self.call('/rtdn', notice, 'pubsub-identity-token').status_code, 503)
        with self.store.transaction() as db:
            self.assertFalse(self.store.purchase(db, TOKEN)['active'])
        self.play.fail_lookup = False  # Simulate a lagging Google GET still reporting the purchase active.
        self.assertEqual(self.call('/rtdn', notice, 'pubsub-identity-token').status_code, 200)
        self.assertFalse(self.service.refresh(LIFE, TOKEN, OWNER_A)['active'])

    def test_unknown_voided_token_cannot_be_granted_later(self):
        self.service.record_void(TOKEN, 'GPA.current-order')
        self.assertFalse(self.service.refresh(LIFE, TOKEN, OWNER_A)['active'])

    def test_old_subscription_refund_does_not_revoke_new_renewal(self):
        self.play.receipts[TOKEN] = subscription()
        self.service.refresh(SUB, TOKEN, OWNER_A)
        self.service.record_void(TOKEN, 'GPA.current-order..0')
        self.assertTrue(self.service.refresh(SUB, TOKEN, OWNER_A)['active'])
        self.service.record_void(TOKEN, 'GPA.current-order..1')
        self.assertFalse(self.service.refresh(SUB, TOKEN, OWNER_A)['active'])

    def test_subscription_replacement_supersedes_old_token_permanently(self):
        previous = 'previous-subscription-token'
        self.play.receipts[previous] = subscription()
        self.service.refresh(SUB, previous, OWNER_A)
        self.play.receipts[TOKEN] = subscription(linked=previous)
        self.assertTrue(self.service.refresh(SUB, TOKEN, OWNER_A)['active'])
        self.assertFalse(self.service.refresh(SUB, previous, OWNER_A)['active'])

    def test_linked_token_conflict_is_rejected_before_acknowledgement(self):
        previous = 'previous-subscription-token'
        self.play.receipts[previous] = subscription(OWNER_B)
        self.service.refresh(SUB, previous, OWNER_B)
        self.play.receipts[TOKEN] = subscription(linked=previous)
        self.play.receipts[TOKEN]['acknowledgementState'] = 'ACKNOWLEDGEMENT_STATE_PENDING'
        with self.assertRaises(BillingError):
            self.service.refresh(SUB, TOKEN, OWNER_A)
        self.assertEqual(self.play.acknowledgements, [])

    def test_voided_reconciliation_follows_pages_and_keeps_watermark_after_failure(self):
        self.play.pages = {None: {'voidedPurchases': [{'purchaseToken': TOKEN, 'orderId': 'GPA.current-order'}],
                                 'tokenPagination': {'nextPageToken': 'page-2'}},
                           'page-2': {'voidedPurchases': []}}
        self.assertEqual(self.service.reconcile_voids(), 1)
        self.assertEqual([x[2] for x in self.play.page_calls], [None, 'page-2'])
        self.assertFalse(self.service.refresh(LIFE, TOKEN, OWNER_A)['active'])
        with self.store.transaction() as db:
            old = self.store.metadata(db, 'voided_sync_at')
        self.play.pages['page-2'] = {'voidedPurchases': [], 'tokenPagination': {'nextPageToken': 'page-2'}}
        with self.assertRaises(RuntimeError):
            self.service.reconcile_voids()
        with self.store.transaction() as db:
            self.assertEqual(self.store.metadata(db, 'voided_sync_at'), old)

    def test_refund_sync_gap_not_silently_marked_complete(self):
        with self.store.transaction() as db:
            self.store.set_metadata(db, 'voided_sync_at', NOW-31*86400)
        with self.assertRaises(BillingError):
            self.service.reconcile_voids()
        self.assertFalse(self.play.page_calls)

    def test_scheduler_endpoint_has_separate_identity(self):
        self.assertEqual(self.call('/tasks/reconcile', {}, 'pubsub-identity-token').status_code, 403)
        self.assertEqual(self.call('/tasks/reconcile', {}, 'scheduler-identity-token').status_code, 200)
        self.assertTrue(any(audience == self.config['OPS_AUDIENCE'] for _,audience,_ in self.identity_calls))

    def test_pending_refund_review_is_durable_operator_work_not_an_automatic_refund(self):
        notice = envelope('pendingRefundReviewNotification', {'pendingRefundToken': 'pending-refund-token',
                          'orderId': 'GPA.current-order', 'refundReason': 7})
        self.assertEqual(self.call('/rtdn', notice, 'pubsub-identity-token').json['status'], 'operator_refund_review_required')
        response = self.call('/tasks/status', auth='scheduler-identity-token', method='get')
        self.assertEqual(response.json['refundReviewsNeedingOperator'], 1)
        self.assertFalse(self.play.lookups)

    def add_review(self, message_id='review-1'):
        notice = envelope('pendingRefundReviewNotification', {'version': '1.0',
                          'pendingRefundToken': 'sensitive-pending-refund-token-' + message_id,
                          'orderId': 'GPA.order-' + message_id, 'refundReason': 7}, message_id)
        self.assertEqual(self.call('/rtdn', notice, 'pubsub-identity-token').status_code, 200)

    def review_record(self):
        return {'preference': 'NEUTRAL', 'externalSubmissionReference': 'private-evidence-reference-1234',
                'submittedAt': int(time.time()), 'externalSubmissionConfirmed': True}

    def test_review_read_and_record_require_operations_identity(self):
        self.add_review()
        for identity in (AUTH_A, 'pubsub-identity-token'):
            for path in ('/tasks/refund-reviews', '/tasks/refund-reviews/review-1'):
                self.assertEqual(self.call(path, auth=identity, method='get').status_code, 403)
            self.assertEqual(self.call('/tasks/refund-reviews/review-1/record',
                self.review_record(), identity).status_code, 403)
        self.assertFalse(self.play.lookups)

    def test_review_token_only_in_authenticated_detail_not_list_or_disk(self):
        self.add_review()
        summary = self.call('/tasks/refund-reviews', auth='scheduler-identity-token', method='get')
        self.assertEqual(summary.status_code, 200)
        item = summary.json['reviews'][0]
        self.assertEqual(item['responseDueAt'] - item['receivedAt'], 86400)
        self.assertNotIn('sensitive-pending-refund-token', summary.get_data(as_text=True))
        detail = self.call('/tasks/refund-reviews/review-1', auth='scheduler-identity-token', method='get')
        self.assertEqual(detail.json['pendingRefundToken'], 'sensitive-pending-refund-token-review-1')
        self.assertFalse(detail.json['googleSubmissionVerified'])
        for filename in self.directory.glob('billing.sqlite*'):
            self.assertNotIn(b'sensitive-pending-refund-token', filename.read_bytes())

    def test_external_response_record_is_durable_idempotent_and_never_calls_google(self):
        self.add_review()
        record = self.review_record()
        path = '/tasks/refund-reviews/review-1/record'
        first = self.call(path, record, 'scheduler-identity-token')
        self.assertEqual(first.json, {'status': 'recorded', 'recordOnly': True, 'googleSubmissionVerified': False})
        self.assertEqual(self.call(path, record, 'scheduler-identity-token').json['status'], 'duplicate')
        self.assertEqual(self.call(path, dict(record, preference='DECLINE'), 'scheduler-identity-token').status_code, 409)
        reopened = BillingService(Store(str(self.directory/'billing.sqlite'), self.encryption), self.play)
        detail = reopened.refund_review(SUBSCRIPTION, 'review-1')
        self.assertEqual(detail['externalResponseRecord']['preference'], 'NEUTRAL')
        self.assertEqual(detail['externalResponseRecord']['operator'], self.config['OPS_SERVICE_ACCOUNT_EMAIL'])
        self.assertFalse(detail['googleSubmissionVerified'])
        self.assertFalse(self.play.lookups)
        self.assertFalse(self.play.acknowledgements)
        self.assertFalse(self.play.page_calls)
        with self.store.transaction() as db:
            self.assertIsNone(self.store.purchase(db, TOKEN))
        for filename in self.directory.glob('billing.sqlite*'):
            self.assertNotIn(b'private-evidence-reference-1234', filename.read_bytes())

    def test_recorded_reviews_remain_auditable_and_queue_count_decreases(self):
        self.add_review()
        self.call('/tasks/refund-reviews/review-1/record', self.review_record(), 'scheduler-identity-token')
        self.assertEqual(self.call('/tasks/status', auth='scheduler-identity-token', method='get').json['refundReviewsNeedingOperator'], 0)
        self.assertEqual(self.call('/tasks/refund-reviews', auth='scheduler-identity-token', method='get').json['reviews'], [])
        recorded = self.call('/tasks/refund-reviews?state=recorded', auth='scheduler-identity-token', method='get')
        self.assertEqual(recorded.json['reviews'][0]['state'], 'external_response_recorded')
        self.assertEqual(self.service.refund_reviews(SUBSCRIPTION, 'all')['reviews'][0]['messageId'], 'review-1')

    def test_no_record_without_explicit_external_submission_confirmation_and_evidence(self):
        self.add_review()
        base = self.review_record()
        for change in ({'externalSubmissionConfirmed': False}, {'externalSubmissionConfirmed': 'true'},
                       {'preference': 'AUTO'}, {'externalSubmissionReference': ''},
                       {'submittedAt': True}, {'submittedAt': int(time.time()) + 60}, {'extraField': True}):
            response = self.call('/tasks/refund-reviews/review-1/record', dict(base, **change), 'scheduler-identity-token')
            self.assertEqual(response.status_code, 400)
        self.assertEqual(self.call('/tasks/refund-reviews/unknown/record', base, 'scheduler-identity-token').status_code, 404)
        self.assertEqual(self.call('/tasks/refund-reviews/unknown', auth='scheduler-identity-token', method='get').status_code, 404)
        self.assertFalse(self.play.lookups)

    def test_review_pagination_validation_and_other_subscription_isolation(self):
        for message_id in ('review-1', 'review-2', 'review-3'):
            self.add_review(message_id)
        first = self.service.refund_reviews(SUBSCRIPTION, limit=2)
        self.assertEqual(first['nextAfter'], 'review-2')
        second = self.service.refund_reviews(SUBSCRIPTION, after=first['nextAfter'], limit=2)
        self.assertEqual([v['messageId'] for v in second['reviews']], ['review-3'])
        self.assertIsNone(second['nextAfter'])
        self.assertEqual(self.service.refund_reviews('projects/other/subscriptions/other')['reviews'], [])
        with self.assertRaises(BillingError):
            self.service.refund_review('projects/other/subscriptions/other', 'review-1')
        for query in ('?limit=0', '?limit=101', '?limit=abc', '?state=invalid', '?after=bad%20value'):
            self.assertEqual(self.call('/tasks/refund-reviews' + query, auth='scheduler-identity-token', method='get').status_code, 400)

    def test_notification_package_schema_and_id_collision_are_rejected(self):
        for bad in [{}, envelope('testNotification', {}, package='evil.app'),
                    dict(envelope('testNotification', {}), subscription='projects/evil/subscriptions/evil')]:
            with self.assertRaises(BillingError):
                decode_notification(bad, PACKAGE, SUBSCRIPTION)
        notice = envelope('testNotification', {})
        self.service.notification(notice, PACKAGE, SUBSCRIPTION)
        with self.assertRaises(BillingError):
            self.service.notification(envelope('testNotification', {'changed': True}), PACKAGE, SUBSCRIPTION)

    def test_raw_purchase_tokens_and_notification_payloads_are_encrypted_on_disk(self):
        notice = envelope('oneTimeProductNotification', {'purchaseToken': TOKEN, 'sku': LIFE})
        self.service.notification(notice, PACKAGE, SUBSCRIPTION)
        for filename in self.directory.glob('billing.sqlite*'):
            self.assertNotIn(TOKEN.encode(), filename.read_bytes())
        with self.store.transaction() as db:
            self.assertEqual(self.store.decrypt(self.store.purchase(db, TOKEN)['token_cipher']), TOKEN)

    def test_parallel_token_replay_keeps_one_owner(self):
        outcomes = []
        def attempt(owner):
            try:
                outcomes.append(self.service.refresh(LIFE, TOKEN, owner)['active'])
            except BillingError:
                outcomes.append('denied')
        jobs = [threading.Thread(target=attempt,args=(owner,)) for owner in (OWNER_A,OWNER_B)]
        for job in jobs: job.start()
        for job in jobs: job.join()
        self.assertCountEqual(outcomes, [True, 'denied'])
        with self.store.transaction() as db:
            self.assertEqual(self.store.purchase(db,TOKEN)['owner'],OWNER_A)


class IdentityBoundaryTests(unittest.TestCase):
    def test_google_signature_failure_and_unexpected_audience_are_rejected(self):
        with patch('security.id_token.verify_oauth2_token', side_effect=ValueError('signature')):
            with self.assertRaises(BillingError): google_identity('token','expected')
        with patch('security.id_token.verify_oauth2_token', return_value={'iss':'https://accounts.google.com','aud':'evil','sub':'123'}):
            with self.assertRaises(BillingError): google_identity('token','expected')

    def test_push_email_and_verified_claim_are_required(self):
        for changes in [{'email':'attacker@test.iam.gserviceaccount.com'},{'email_verified':False},{'email_verified':'true'}]:
            value={'iss':'https://accounts.google.com','aud':'expected','email':'push@test.iam.gserviceaccount.com','email_verified':True}
            value.update(changes)
            with patch('security.id_token.verify_oauth2_token', return_value=value):
                with self.assertRaises(BillingError): google_identity('token','expected',service_email='push@test.iam.gserviceaccount.com')


if __name__ == '__main__':
    unittest.main()
