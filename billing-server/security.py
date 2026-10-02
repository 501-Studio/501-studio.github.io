"""Trusted Google identities and request-bound Play Integrity, never client claims."""
import base64
import hashlib
import hmac
import json
import re
import time
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token


class BillingError(Exception):
    def __init__(self, code, status=400):
        super().__init__(code)
        self.code, self.status = code, status


class BoundedRequest(GoogleRequest):
    def __call__(self, *args, **kwargs):
        kwargs['timeout'] = min(kwargs.get('timeout', 10), 10)
        return super().__call__(*args, **kwargs)


def bearer(header):
    if not isinstance(header, str) or not re.fullmatch(r'Bearer [A-Za-z0-9_.-]{16,16384}', header):
        raise BillingError('authentication_required', 401)
    return header[7:]


def google_identity(token, audience, *, service_email=None):
    # Library checks Google signature, expiration, audience and issuer. No tokeninfo endpoint.
    try:
        info = id_token.verify_oauth2_token(token, BoundedRequest(), audience)
    except ValueError:
        raise BillingError('invalid_identity', 401) from None
    if info.get('iss') not in ('accounts.google.com', 'https://accounts.google.com') or info.get('aud') != audience:
        raise BillingError('invalid_identity', 401)
    if service_email is not None:
        if info.get('email') != service_email or info.get('email_verified') is not True:
            raise BillingError('invalid_push_identity', 403)
    elif not isinstance(info.get('sub'), str) or not re.fullmatch(r'[0-9]{1,255}', info['sub']):
        raise BillingError('invalid_identity', 401)
    return info


def account_id(subject, secret):
    if not isinstance(secret, str) or len(secret.encode()) < 32:
        raise BillingError('account_auth_not_configured', 503)
    return hmac.new(secret.encode(), ('google:' + subject).encode(), hashlib.sha256).hexdigest()


def request_hash(package, product, token, installation, owner):
    # Canonical ASCII JSON contract; the Android client must hash these same five fields.
    content = {'accountId': owner, 'installationId': installation, 'packageName': package,
               'productId': product, 'purchaseToken': token}
    raw = json.dumps(content, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()
    return base64.urlsafe_b64encode(hashlib.sha256(raw).digest()).rstrip(b'=').decode()


def check_integrity(payload, package, expected_hash, certificates, now=None):
    now = int(time.time()) if now is None else now
    try:
        details, application = payload['requestDetails'], payload['appIntegrity']
        stamped = int(details['timestampMillis']) / 1000
        valid = (details.get('requestPackageName') == package and details.get('requestHash') == expected_hash
                 and now - 120 <= stamped <= now + 30
                 and application.get('appRecognitionVerdict') == 'PLAY_RECOGNIZED'
                 and application.get('packageName') == package
                 and set(application.get('certificateSha256Digest', [])) & set(certificates)
                 and payload.get('accountDetails', {}).get('appLicensingVerdict') == 'LICENSED'
                 and 'MEETS_DEVICE_INTEGRITY' in payload.get('deviceIntegrity', {}).get('deviceRecognitionVerdict', []))
    except (KeyError, TypeError, ValueError, AttributeError):
        valid = False
    if not valid:
        raise BillingError('app_integrity_required', 403)
