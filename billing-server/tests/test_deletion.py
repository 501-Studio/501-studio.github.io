"""Real SQLite/auth boundaries; Google and payment actions remain explicit fakes."""
import base64
import json
import re
import sqlite3
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch, Mock
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app
from deletion import COOKIE, challenge
from persistence import Store, deleted_account_hash
from security import BillingError
import test_security as fixtures
from test_security import AUTH_A, AUTH_B, OWNER_A, OWNER_B, TOKEN, LIFE, SUB, SUBSCRIPTION, product, subscription, envelope


class AccountDeletionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixtures.SecurityTests.setUpClass()

    def setUp(self):
        self.fixture = fixtures.SecurityTests('test_unconfigured_and_unauthenticated_cannot_grant')
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.store, self.service, self.play = self.fixture.store, self.fixture.service, self.fixture.play
        self.nonce, self.token_nonce, self.token_iat = '', None, None
        self.config = dict(self.fixture.config, ACCOUNT_DELETION_ENABLED='true',
                           ACCOUNT_DELETION_WEB_ORIGIN='https://billing.test')
        self.client = self.new_client(self.config)

    def identity(self, token, audience, service_email=None):
        info = self.fixture.identity(token, audience, service_email)
        if service_email is None:
            info.update(nonce=self.nonce if self.token_nonce is None else self.token_nonce,
                        iat=int(time.time()) if self.token_iat is None else self.token_iat)
        return info

    def new_client(self, config):
        app = create_app(config, service=self.service, verify_identity=self.identity)
        app.testing = True
        return app.test_client()

    def open_page(self, client=None):
        response = (client or self.client).get('/account/delete', base_url='https://billing.test')
        if response.status_code == 200:
            self.nonce = json.loads(re.search(r'const nonce = ("[^"]+")', response.get_data(as_text=True))[1])
        return response

    def delete(self, auth=AUTH_A, *, body=None, origin='https://billing.test', open_page=True):
        if open_page:
            self.open_page()
        headers = {'Origin': origin} if origin is not None else {}
        if auth:
            headers['Authorization'] = 'Bearer ' + auth
        return self.client.post('/account/deletion', json=body if body is not None else
            {'confirmDeletion': True, 'nonce': self.nonce}, headers=headers, base_url='https://billing.test')

    def test_deletion_is_disabled_without_explicit_valid_web_configuration(self):
        for changes in ({'ACCOUNT_DELETION_ENABLED': ''}, {'ACCOUNT_DELETION_WEB_ORIGIN': ''},
                        {'ACCOUNT_DELETION_WEB_ORIGIN': 'http://billing.test'},
                        {'ACCOUNT_DELETION_WEB_ORIGIN': 'https://billing.test/path'},
                        {'ACCOUNT_DELETION_WEB_ORIGIN': 'https://*.test'}):
            with self.subTest(changes=changes):
                client = self.new_client(dict(self.config, **changes))
                self.assertEqual(self.open_page(client).status_code, 503)
                self.assertEqual(client.post('/account/deletion', base_url='https://billing.test').status_code, 503)
        self.assertFalse(self.play.lookups)

    def test_page_uses_google_nonce_memory_only_and_secure_confirmation_cookie(self):
        response = self.open_page()
        self.assertEqual(response.status_code, 200)
        text = response.get_data(as_text=True)
        for forbidden in ('localStorage', 'sessionStorage', 'console.log', 'accounts.id.prompt(', 'onload='):
            self.assertNotIn(forbidden, text)
        self.assertIn('auto_select: false', text)
        self.assertIn('Authorization:', text)
        self.assertIn('Secure', response.headers['Set-Cookie'])
        self.assertIn('HttpOnly', response.headers['Set-Cookie'])
        self.assertIn('SameSite=Strict', response.headers['Set-Cookie'])
        self.assertEqual(response.headers['Cache-Control'], 'no-store')
        self.assertIn("frame-ancestors 'none'", response.headers['Content-Security-Policy'])
        self.assertEqual(response.headers['Referrer-Policy'], 'no-referrer')
        self.assertEqual(self.client.get('/account/delete?credential=forbidden', base_url='https://billing.test').status_code, 400)

    def test_https_origin_cookie_and_explicit_confirmation_are_required(self):
        self.assertEqual(self.client.get('/account/delete', base_url='http://billing.test').status_code, 400)
        self.assertEqual(self.client.get('/account/delete', base_url='https://evil.test').status_code, 403)
        self.assertEqual(self.delete(open_page=False).status_code, 403)
        for origin in (None, 'https://evil.test', 'null'):
            self.assertEqual(self.delete(origin=origin).status_code, 403)
        for body in ({}, {'confirmDeletion': False, 'nonce': 'anything'},
                     {'confirmDeletion': 'true', 'nonce': 'anything'},
                     {'confirmDeletion': True, 'nonce': 'anything', 'email': 'user@test'},
                     {'confirmDeletion': True, 'nonce': 'anything', 'accountId': OWNER_B}):
            self.assertEqual(self.delete(body=body).status_code, 400)
        self.assertFalse(self.play.lookups)

    def test_fresh_google_identity_must_match_the_purpose_bound_page_nonce(self):
        self.assertEqual(self.delete(auth=None).status_code, 401)
        self.open_page()
        self.assertEqual(self.delete(body={'confirmDeletion':True,'nonce':'가'},open_page=False).status_code,403)
        self.token_nonce = 'purchase-sign-in-nonce'
        self.assertEqual(self.delete().status_code, 401)
        self.token_nonce = None
        for stamp in (int(time.time())-301, int(time.time())+60, True, None):
            self.token_iat = stamp if stamp is not None else 'missing'
            self.assertEqual(self.delete().status_code, 401)
        self.token_iat = None
        self.open_page()
        old_nonce = self.nonce
        self.open_page()
        self.assertEqual(self.delete(body={'confirmDeletion':True,'nonce':old_nonce},open_page=False).status_code, 403)
        with self.store.transaction() as db:
            self.assertFalse(self.store.account_deleted(db, OWNER_A))

    def test_expired_and_tampered_confirmation_cookie_cannot_delete(self):
        for expired in (True, False):
            nonce, cookie = challenge(self.config['ACCOUNT_HMAC_KEY'], self.config['PLAY_PACKAGE'],
                                      now=int(time.time())-301 if expired else None)
            self.nonce = nonce
            if not expired:
                cookie = cookie[:-1] + ('0' if cookie[-1] != '0' else '1')
            self.client.set_cookie(COOKIE, cookie, domain='billing.test', path='/account/')
            self.assertEqual(self.delete(open_page=False).status_code, 403)

    def test_only_authenticated_account_is_erased_and_deletion_is_idempotent(self):
        self.assertEqual(self.fixture.verify().status_code, 200)
        other = 'another-account-purchase-token'
        self.play.receipts[other] = product(OWNER_B, order='GPA.other-account')
        self.service.refresh(LIFE, other, OWNER_B)
        response = self.delete()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['status'], 'deleted')
        self.assertEqual(response.json['purchasesErased'], 1)
        with self.store.transaction() as db:
            row = self.store.purchase(db, TOKEN)
            self.assertEqual((row['owner'], row['token_cipher'], row['active'], row['valid_until'], row['account_deleted']),
                             (None, '', 0, 0, 1))
            self.assertEqual(self.store.purchase(db, other)['owner'], OWNER_B)
            marker = db.execute('SELECT * FROM deleted_accounts').fetchone()
            self.assertEqual(marker['account_hash'], deleted_account_hash(OWNER_A))
            self.assertNotEqual(marker['account_hash'], OWNER_A)
        second = self.delete()
        self.assertEqual(second.json['status'], 'already_deleted')
        self.assertEqual(second.json['deletedAt'], response.json['deletedAt'])
        self.assertEqual(second.json['purchasesErased'], 0)

    def test_account_and_restore_cannot_implicitly_recreate_or_transfer_deleted_purchases(self):
        self.fixture.verify()
        self.delete()
        self.assertEqual(self.fixture.call('/account').status_code, 410)
        self.assertEqual(self.fixture.verify(installation='installation-new-device').status_code, 410)
        self.assertEqual(self.fixture.verify(AUTH_B).status_code, 403)
        self.assertEqual(self.fixture.call('/account', auth=AUTH_B).status_code, 200)
        restarted = Store(str(self.fixture.directory/'billing.sqlite'), self.fixture.encryption)
        with restarted.transaction() as db:
            self.assertTrue(restarted.account_deleted(db, OWNER_A))
            self.assertIsNone(restarted.purchase(db, TOKEN)['owner'])

    def test_old_new_and_duplicate_rtdn_do_not_recreate_deleted_account_data(self):
        first = envelope('oneTimeProductNotification', {'purchaseToken':TOKEN,'sku':LIFE}, 'before-deletion')
        self.service.notification(first, self.config['PLAY_PACKAGE'], SUBSCRIPTION)
        self.delete()
        self.assertEqual(self.service.notification(first, self.config['PLAY_PACKAGE'], SUBSCRIPTION), 'duplicate')
        notice = envelope('oneTimeProductNotification', {'purchaseToken':TOKEN,'sku':LIFE}, 'after-deletion')
        self.play.fail_lookup = True
        self.assertEqual(self.service.notification(notice, self.config['PLAY_PACKAGE'], SUBSCRIPTION), 'account_deleted')
        self.play.fail_lookup = False
        new = 'previously-unobserved-deleted-account-token'
        self.play.receipts[new] = product()
        self.play.receipts[new]['acknowledgementState'] = 0
        notice = envelope('oneTimeProductNotification', {'purchaseToken':new,'sku':LIFE}, 'unobserved-after-deletion')
        self.assertEqual(self.service.notification(notice, self.config['PLAY_PACKAGE'], SUBSCRIPTION), 'account_deleted')
        self.assertFalse(self.play.acknowledgements)
        with self.store.transaction() as db:
            self.assertEqual(self.store.purchase(db,new)['token_cipher'], '')
            for row in db.execute('SELECT * FROM notifications'):
                self.assertEqual(row['payload_cipher'], '')
                self.assertIsNone(row['account_hash'])
            self.assertEqual(db.execute('SELECT COUNT(*) FROM purchases WHERE active=1 OR owner IS NOT NULL').fetchone()[0], 0)

    def test_late_deleted_owner_resolution_erases_previously_unassociated_notification(self):
        self.play.receipts[TOKEN] = {}
        before = envelope('oneTimeProductNotification',{'purchaseToken':TOKEN,'sku':LIFE},'unknown-owner')
        self.service.notification(before,self.config['PLAY_PACKAGE'],SUBSCRIPTION)
        self.delete()
        with self.store.transaction() as db:
            self.assertNotEqual(db.execute('SELECT payload_cipher FROM notifications').fetchone()[0], '')
        self.play.receipts[TOKEN] = product()
        after = envelope('oneTimeProductNotification',{'purchaseToken':TOKEN,'sku':LIFE},'resolved-deleted-owner')
        self.service.notification(after,self.config['PLAY_PACKAGE'],SUBSCRIPTION)
        with self.store.transaction() as db:
            for row in db.execute('SELECT payload_cipher,data_deleted FROM notifications'):
                self.assertEqual(row['payload_cipher'],'')
                self.assertTrue(row['data_deleted'])
            self.assertIsNone(self.store.purchase(db,TOKEN)['owner'])

    def test_late_deleted_owner_order_links_refund_review_without_account_field(self):
        stale = 'stale-ownerless-purchase-token'
        self.play.receipts[stale] = product(owner=None, state=1, order='')
        self.service.refresh(LIFE, stale, None)
        self.delete()
        self.play.receipts[stale] = product(OWNER_A, order='GPA.resolved-deleted-order')
        notice = envelope('oneTimeProductNotification', {'purchaseToken': stale, 'sku': LIFE},
                          'resolved-stale-order')
        self.assertEqual(self.service.notification(notice,self.config['PLAY_PACKAGE'],SUBSCRIPTION),
                         'account_deleted')
        review = envelope('pendingRefundReviewNotification',
                          {'pendingRefundToken': 'pending-token-for-resolved-deleted-order',
                           'orderId': 'GPA.resolved-deleted-order', 'refundReason': 7},
                          'review-resolved-deleted-order')
        self.assertEqual(self.service.notification(review,self.config['PLAY_PACKAGE'],SUBSCRIPTION),
                         'operator_refund_review_required')
        detail = self.service.refund_review(SUBSCRIPTION, 'review-resolved-deleted-order')
        self.assertTrue(detail['accountDataDeleted'])
        self.assertEqual(detail['pendingRefundToken'], 'pending-token-for-resolved-deleted-order')
        with self.store.transaction() as db:
            purchase = self.store.purchase(db, stale)
            self.assertEqual(purchase['current_order'], 'GPA.resolved-deleted-order')
            self.assertTrue(purchase['account_deleted'])
            self.assertEqual(db.execute('SELECT data_deleted FROM notifications WHERE message_id=?',
                                        ('review-resolved-deleted-order',)).fetchone()[0], 1)

    def test_unobserved_linked_deleted_owner_cannot_be_assigned_to_new_account(self):
        self.delete()
        previous, replacement = 'unobserved-deleted-subscription', 'replacement-subscription-token'
        self.play.receipts[previous] = subscription(OWNER_A)
        self.play.receipts[replacement] = subscription(OWNER_B, linked=previous)
        self.play.receipts[replacement]['acknowledgementState'] = 'ACKNOWLEDGEMENT_STATE_PENDING'
        with self.assertRaises(BillingError):
            self.service.refresh(SUB, replacement, OWNER_B)
        notice = envelope('subscriptionNotification', {'purchaseToken':replacement}, 'replacement-notice')
        self.assertEqual(self.service.notification(notice, self.config['PLAY_PACKAGE'], SUBSCRIPTION), 'account_deleted')
        self.assertFalse(self.play.acknowledgements)
        with self.store.transaction() as db:
            self.assertIsNone(self.store.purchase(db, previous))
            self.assertIsNone(self.store.purchase(db, replacement)['owner'])
            self.assertFalse(self.store.purchase(db, replacement)['active'])

    def test_known_deleted_linked_token_cannot_be_rebound(self):
        previous, replacement = 'known-old-subscription-token', 'known-replacement-subscription'
        self.play.receipts[previous] = subscription()
        self.service.refresh(SUB, previous, OWNER_A)
        self.delete()
        self.play.receipts[replacement] = subscription(OWNER_B, linked=previous)
        with self.assertRaises(BillingError):
            self.service.refresh(SUB, replacement, OWNER_B)
        self.assertEqual(self.service.notification(envelope('subscriptionNotification',
            {'purchaseToken':replacement}, 'linked-after-delete'), self.config['PLAY_PACKAGE'], SUBSCRIPTION), 'account_deleted')
        with self.store.transaction() as db:
            self.assertTrue(self.store.purchase(db, previous)['account_deleted'])
            self.assertIsNone(self.store.purchase(db, replacement)['owner'])

    def test_refund_reconciliation_remains_ready_and_denies_deleted_token(self):
        self.fixture.verify()
        self.delete()
        self.play.fail_lookup = True  # Known erased tokens need no Google regrant lookup.
        self.play.pages = {None:{'voidedPurchases':[{'purchaseToken':TOKEN,'orderId':'GPA.current-order'}]}}
        self.assertEqual(self.service.reconcile_voids(), 1)
        self.assertTrue(self.service.synchronized())
        with self.store.transaction() as db:
            self.assertTrue(self.store.blocked(db,TOKEN,LIFE,'GPA.current-order'))
            self.assertEqual(db.execute('SELECT COUNT(*) FROM voids').fetchone()[0], 1)
            self.assertFalse(self.store.purchase(db,TOKEN)['active'])

    def test_account_linked_refund_work_is_minimized_without_reopening_completed_work(self):
        self.fixture.verify()
        notice = envelope('pendingRefundReviewNotification', {'pendingRefundToken':'pending-token-for-operator',
            'orderId':'GPA.current-order','refundReason':7,'obfuscatedAccountId':OWNER_A,'obfuscatedProfileId':'private-profile'}, 'private-review')
        self.service.notification(notice,self.config['PLAY_PACKAGE'],SUBSCRIPTION)
        self.service.record_refund_review(SUBSCRIPTION,'private-review',self.fixture.review_record(),'operator@test')
        self.delete()
        detail = self.service.refund_review(SUBSCRIPTION,'private-review')
        self.assertEqual(detail['pendingRefundToken'], 'pending-token-for-operator')
        self.assertTrue(detail['accountDataDeleted'])
        self.assertEqual(detail['state'], 'external_response_recorded')
        self.assertIsNone(detail['externalResponseRecord'])
        self.assertNotIn('obfuscatedAccountId', detail)
        self.assertNotIn('obfuscatedProfileId', detail)
        self.assertEqual(self.service.refund_reviews(SUBSCRIPTION)['reviews'], [])
        after = envelope('pendingRefundReviewNotification', {'pendingRefundToken':'later-financial-task-token',
            'orderId':'GPA.current-order','refundReason':7,'obfuscatedAccountId':OWNER_A}, 'later-review')
        self.service.notification(after,self.config['PLAY_PACKAGE'],SUBSCRIPTION)
        self.assertTrue(self.service.refund_review(SUBSCRIPTION,'later-review')['accountDataDeleted'])
        self.service.record_refund_review(SUBSCRIPTION,'later-review',self.fixture.review_record(),'operator@test')
        detail = self.service.refund_review(SUBSCRIPTION,'later-review')
        self.assertEqual(detail['state'], 'external_response_recorded')
        self.assertIsNone(detail['externalResponseRecord'])
        with self.store.transaction() as db:
            self.assertEqual(db.execute('SELECT record_cipher FROM refund_review_records WHERE message_id=?',
                                       ('later-review',)).fetchone()[0], '')
        self.assertFalse(self.play.acknowledgements)

    def test_legacy_unindexed_notifications_are_erased_and_schema_migration_preserves_purchases(self):
        filename = str(self.fixture.directory/'legacy.sqlite')
        raw = json.dumps({'version':'1.0','packageName':self.config['PLAY_PACKAGE'],'eventTimeMillis':str(int(time.time())*1000),
                          'oneTimeProductNotification':{'purchaseToken':TOKEN,'sku':LIFE}})
        with sqlite3.connect(filename) as db:
            db.executescript('''CREATE TABLE purchases (token_hash TEXT PRIMARY KEY,token_cipher TEXT NOT NULL,
              product TEXT NOT NULL,owner TEXT,active INTEGER NOT NULL DEFAULT 0,valid_until INTEGER NOT NULL DEFAULT 0,
              current_order TEXT NOT NULL DEFAULT '',superseded INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL DEFAULT 0);
              CREATE TABLE notifications (subscription TEXT NOT NULL,message_id TEXT NOT NULL,payload_hash TEXT NOT NULL,
              payload_cipher TEXT NOT NULL,status TEXT NOT NULL,processed_at INTEGER NOT NULL,PRIMARY KEY(subscription,message_id));''')
        migrated = Store(filename,self.fixture.encryption)
        with migrated.transaction() as db:
            migrated.save(db,TOKEN,LIFE,OWNER_A,{'active':True,'until':0},'GPA.current-order',int(time.time()))
            db.execute('INSERT INTO notifications(subscription,message_id,payload_hash,payload_cipher,status,processed_at) VALUES(?,?,?,?,?,?)',
                       (SUBSCRIPTION,'legacy','original-digest',migrated.encrypt(raw),'processed',int(time.time())))
        with Store(filename,self.fixture.encryption).transaction() as db:
            self.assertEqual(migrated.purchase(db,TOKEN)['owner'], OWNER_A)
            migrated.delete_account(db,OWNER_A,int(time.time()))
            self.assertEqual(db.execute('SELECT payload_cipher FROM notifications').fetchone()[0], '')
            self.assertEqual(db.execute('SELECT payload_hash FROM notifications').fetchone()[0], 'original-digest')

    def test_failed_erasure_rolls_back_tombstone_and_purchase_changes(self):
        self.service.notification(envelope('oneTimeProductNotification',{'purchaseToken':TOKEN,'sku':LIFE}),self.config['PLAY_PACKAGE'],SUBSCRIPTION)
        with patch.object(self.store,'redact_notification',side_effect=RuntimeError('sensitive failure')):
            response=self.delete()
        self.assertEqual(response.status_code,503)
        self.assertNotIn('sensitive',response.get_data(as_text=True))
        with self.store.transaction() as db:
            self.assertFalse(self.store.account_deleted(db,OWNER_A))
            self.assertEqual(self.store.purchase(db,TOKEN)['owner'],OWNER_A)
            self.assertTrue(self.store.purchase(db,TOKEN)['active'])

    def test_lease_signing_serializes_with_deletion_and_cannot_run_after_deletion(self):
        entered, release, deleted = threading.Event(), threading.Event(), threading.Event()
        events, errors = [], []
        def issuer(result):
            entered.set()
            if not release.wait(2):
                raise RuntimeError('test timeout')
            events.append('signed')
            return 'signed-before-deletion'
        def issue():
            try: self.service.issue_lease(LIFE,TOKEN,OWNER_A,issuer)
            except Exception as error: errors.append(error)
        def erase():
            try:
                self.service.delete_account(OWNER_A)
                events.append('deleted'); deleted.set()
            except Exception as error: errors.append(error)
        first = threading.Thread(target=issue)
        second = threading.Thread(target=erase)
        first.start()
        self.assertTrue(entered.wait(2))
        second.start()
        self.assertFalse(deleted.wait(.1))
        release.set()
        first.join(3);second.join(3)
        self.assertFalse(first.is_alive() or second.is_alive())
        self.assertEqual(errors,[])
        self.assertEqual(events,['signed','deleted'])
        unused = Mock()
        with self.assertRaises(BillingError):
            self.service.issue_lease(LIFE,TOKEN,OWNER_A,unused)
        unused.assert_not_called()
