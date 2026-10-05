"""Google Play is authoritative. Exception text/URLs containing tokens must never be logged."""
from urllib.parse import quote
import google.auth
from google.auth.transport.requests import AuthorizedSession
from entitlements import SUB, LIFE
from security import BillingError, BoundedRequest


class PlayClient:
    def __init__(self, package):
        self.package = package
        self.root = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' + quote(package, safe='')

    def session(self, scope='androidpublisher'):
        credentials, _ = google.auth.default(scopes=['https://www.googleapis.com/auth/' + scope])
        return AuthorizedSession(credentials, auth_request=BoundedRequest(), refresh_timeout=10)

    def receipt_url(self, product, token):
        if product == SUB:
            return self.root + '/purchases/subscriptionsv2/tokens/' + quote(token, safe='')
        if product == LIFE:
            return self.root + '/purchases/products/' + LIFE + '/tokens/' + quote(token, safe='')
        raise BillingError('unsupported_product')

    def lookup(self, product, token):
        with self.session() as session:
            response = session.get(self.receipt_url(product, token), timeout=12)
            if response.status_code in (400, 404, 410):
                return {}
            response.raise_for_status()
            receipt = response.json()
            if not isinstance(receipt, dict):
                raise RuntimeError('invalid_google_response')
            return receipt

    def acknowledge(self, product, token):
        url = (self.root + '/purchases/subscriptions/' + SUB + '/tokens/' + quote(token, safe='')
               if product == SUB else self.receipt_url(product, token)) + ':acknowledge'
        with self.session() as session:
            response = session.post(url, json={}, timeout=12)
            # The service always re-fetches the authoritative acknowledgement state after this.
            if response.status_code not in (200, 204, 409):
                response.raise_for_status()

    def decode_integrity(self, token):
        url = 'https://playintegrity.googleapis.com/v1/' + quote(self.package, safe='') + ':decodeIntegrityToken'
        with self.session('playintegrity') as session:
            response = session.post(url, json={'integrity_token': token}, timeout=12)
            response.raise_for_status()
            return response.json().get('tokenPayloadExternal', {})

    def voided(self, start, end, page=None):
        parameters = {'startTime': str(start), 'endTime': str(end), 'type': 1,
                      'includeQuantityBasedPartialRefund': 'true', 'maxResults': 1000}
        if page:
            parameters['token'] = page
        with self.session() as session:
            response = session.get(self.root + '/purchases/voidedpurchases', params=parameters, timeout=12)
            response.raise_for_status()
            return response.json()
