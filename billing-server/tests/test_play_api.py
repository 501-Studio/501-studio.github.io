"""Google wire contract: scope, current lookup API, acknowledgement and refund pagination."""
import unittest
from unittest.mock import MagicMock, patch
from entitlements import SUB, LIFE
from play_api import PlayClient
from security import BoundedRequest


class GoogleWireTests(unittest.TestCase):
    def setUp(self):
        self.client = PlayClient('com.studio501.kotoba')
        self.response = MagicMock(status_code=200)
        self.session = MagicMock()
        self.session.__enter__.return_value = self.session
        self.session.get.return_value = self.response
        self.session.post.return_value = self.response

    def test_credentials_are_scoped_and_refresh_network_is_bounded(self):
        credentials = object()
        with patch('play_api.google.auth.default', return_value=(credentials, 'project')) as adc, \
             patch('play_api.AuthorizedSession') as authorized:
            self.client.session('playintegrity')
        adc.assert_called_once_with(scopes=['https://www.googleapis.com/auth/playintegrity'])
        self.assertEqual(authorized.call_args.args, (credentials,))
        self.assertIsInstance(authorized.call_args.kwargs['auth_request'], BoundedRequest)
        self.assertEqual(authorized.call_args.kwargs['refresh_timeout'], 10)

    def test_subscription_v2_lookup_but_acknowledgement_uses_ack_endpoint(self):
        self.response.json.return_value = {'subscriptionState': 'SUBSCRIPTION_STATE_ACTIVE'}
        with patch.object(self.client, 'session', return_value=self.session):
            self.client.lookup(SUB, 'receipt/token')
            self.client.acknowledge(SUB, 'receipt/token')
        self.assertTrue(self.session.get.call_args.args[0].endswith('/purchases/subscriptionsv2/tokens/receipt%2Ftoken'))
        self.assertTrue(self.session.post.call_args.args[0].endswith('/purchases/subscriptions/kotoba_premium/tokens/receipt%2Ftoken:acknowledge'))
        self.assertEqual(self.session.post.call_args.kwargs, {'json': {}, 'timeout': 12})

    def test_integrity_decode_uses_real_json_field_and_returns_only_decoded_payload(self):
        verdict = {'requestDetails': {'requestHash': 'digest'}}
        self.response.json.return_value = {'tokenPayloadExternal': verdict}
        with patch.object(self.client, 'session', return_value=self.session) as session:
            self.assertEqual(self.client.decode_integrity('sensitive-proof'), verdict)
        session.assert_called_once_with('playintegrity')
        self.assertEqual(self.session.post.call_args.args[0], 'https://playintegrity.googleapis.com/v1/com.studio501.kotoba:decodeIntegrityToken')
        self.assertEqual(self.session.post.call_args.kwargs, {'json': {'integrity_token': 'sensitive-proof'}, 'timeout': 12})

    def test_voided_queries_include_subscription_and_partial_refunds_and_next_page(self):
        self.response.json.return_value = {'voidedPurchases': []}
        with patch.object(self.client, 'session', return_value=self.session):
            self.client.voided(1000, 2000, 'next-page')
        params = self.session.get.call_args.kwargs['params']
        self.assertEqual(params, {'startTime': '1000', 'endTime': '2000', 'type': 1,
                                 'includeQuantityBasedPartialRefund': 'true', 'maxResults': 1000, 'token': 'next-page'})

    def test_invalid_receipt_is_inactive_but_permission_outage_is_an_error(self):
        with patch.object(self.client, 'session', return_value=self.session):
            for code in (400, 404, 410):
                self.response.status_code = code
                self.assertEqual(self.client.lookup(LIFE, 'missing-token'), {})
            self.response.status_code = 403
            self.response.raise_for_status.side_effect = RuntimeError('permission denied')
            with self.assertRaises(RuntimeError):
                self.client.lookup(LIFE, 'missing-token')


if __name__ == '__main__':
    unittest.main()
