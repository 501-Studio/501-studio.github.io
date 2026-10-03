"""Purpose-bound, short-lived web confirmation. Google remains the identity authority."""
import hashlib
import hmac
import re
import secrets
import time
from urllib.parse import urlsplit
from security import BillingError

COOKIE = 'kotoba_deletion_confirmation'
MAX_AGE = 300


def web_origin(config):
    if config.get('ACCOUNT_DELETION_ENABLED') != 'true':
        return None
    value = config.get('ACCOUNT_DELETION_WEB_ORIGIN', '')
    try:
        parsed = urlsplit(value)
        if (parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password
                or parsed.path or parsed.query or parsed.fragment or parsed.port == 0
                or value != 'https://' + parsed.netloc or '*' in value):
            return None
    except ValueError:
        return None
    return value


def challenge(secret, package, now=None):
    issued = int(time.time()) if now is None else int(now)
    nonce = secrets.token_urlsafe(32)
    message = f'deletion-confirmation:{package}:{nonce}:{issued}'
    signature = hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()
    return nonce, f'{nonce}.{issued}.{signature}'


def check_confirmation(cookie, nonce, secret, package, now=None):
    now = int(time.time()) if now is None else int(now)
    if (not isinstance(cookie, str) or not re.fullmatch(r'[A-Za-z0-9_-]{43}\.[0-9]{1,16}\.[a-f0-9]{64}', cookie)
            or not isinstance(nonce, str) or not re.fullmatch(r'[A-Za-z0-9_-]{43}', nonce)):
        raise BillingError('deletion_confirmation_required', 403)
    expected, stamp, signature = cookie.split('.')
    issued = int(stamp)
    message = f'deletion-confirmation:{package}:{expected}:{issued}'
    valid_signature = hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()
    if (not hmac.compare_digest(signature, valid_signature) or not hmac.compare_digest(nonce, expected)
            or not now - MAX_AGE <= issued <= now + 30):
        raise BillingError('deletion_confirmation_expired_or_invalid', 403)
    return issued


def check_fresh_identity(info, nonce, issued, now=None):
    now = int(time.time()) if now is None else int(now)
    token_nonce, stamp = info.get('nonce'), info.get('iat')
    if (not isinstance(token_nonce, str) or not re.fullmatch(r'[A-Za-z0-9_-]{43}', token_nonce)
            or not hmac.compare_digest(token_nonce, nonce)
            or type(stamp) is not int or not max(now - MAX_AGE, issued - 30) <= stamp <= now + 30):
        raise BillingError('fresh_deletion_sign_in_required', 401)
