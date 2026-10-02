"""HTTPS-only, authenticated billing verifier. Configured code is not deployment approval."""
import hashlib
import os
import re
import time
from pathlib import Path
from flask import Flask, request, jsonify
from werkzeug.middleware.proxy_fix import ProxyFix
from entitlements import SUB, LIFE, claims, sign
from persistence import Store
from play_api import PlayClient
from security import BillingError, bearer, google_identity, account_id, request_hash, check_integrity
from service import BillingService, valid_token


def configuration():
    return {name: os.environ.get(name, '') for name in (
        'RECEIPT_VERIFICATION_ENABLED', 'PLAY_PACKAGE', 'ENTITLEMENT_KEY_FILE', 'SQLITE_PATH',
        'TOKEN_ENCRYPTION_KEY', 'ACCOUNT_HMAC_KEY', 'GOOGLE_OAUTH_CLIENT_ID', 'PLAY_SIGNING_CERT_SHA256',
        'PUBSUB_AUDIENCE', 'PUBSUB_SERVICE_ACCOUNT_EMAIL', 'PUBSUB_SUBSCRIPTION',
        'OPS_AUDIENCE', 'OPS_SERVICE_ACCOUNT_EMAIL', 'TRUST_PROXY_HOPS')}


def configured(config):
    required = ('ENTITLEMENT_KEY_FILE', 'SQLITE_PATH', 'TOKEN_ENCRYPTION_KEY', 'ACCOUNT_HMAC_KEY',
                'GOOGLE_OAUTH_CLIENT_ID', 'PLAY_SIGNING_CERT_SHA256', 'PUBSUB_AUDIENCE',
                'PUBSUB_SERVICE_ACCOUNT_EMAIL', 'PUBSUB_SUBSCRIPTION', 'OPS_AUDIENCE', 'OPS_SERVICE_ACCOUNT_EMAIL')
    return (config.get('RECEIPT_VERIFICATION_ENABLED') == 'true' and all(config.get(k) for k in required)
            and len(config['ACCOUNT_HMAC_KEY'].encode()) >= 32
            and config['GOOGLE_OAUTH_CLIENT_ID'].endswith('.apps.googleusercontent.com')
            and config['PUBSUB_AUDIENCE'].startswith('https://') and config['OPS_AUDIENCE'].startswith('https://')
            and config['PUBSUB_AUDIENCE'] != config['OPS_AUDIENCE']
            and config['PUBSUB_SERVICE_ACCOUNT_EMAIL'] != config['OPS_SERVICE_ACCOUNT_EMAIL']
            and all(config[k].endswith('.iam.gserviceaccount.com') for k in ('PUBSUB_SERVICE_ACCOUNT_EMAIL','OPS_SERVICE_ACCOUNT_EMAIL'))
            and Path(config['ENTITLEMENT_KEY_FILE']).is_absolute() and Path(config['ENTITLEMENT_KEY_FILE']).is_file()
            and Path(config['SQLITE_PATH']).is_absolute()
            and all(re.fullmatch(r'[A-Za-z0-9_-]{43}', c) for c in config['PLAY_SIGNING_CERT_SHA256'].split(',')))


def create_app(config=None, *, service=None, verify_identity=google_identity):
    server = Flask(__name__)
    server.config['MAX_CONTENT_LENGTH'] = 49152
    config = configuration() if config is None else dict(config)
    package = config.get('PLAY_PACKAGE') or 'com.studio501.kotoba'
    ready = configured(config)
    if config.get('TRUST_PROXY_HOPS') == '1':
        # Enable only behind a trusted ingress whose raw backend is inaccessible externally.
        server.wsgi_app = ProxyFix(server.wsgi_app, x_proto=1)
    if ready and service is None:
        try:
            store = Store(config['SQLITE_PATH'], config['TOKEN_ENCRYPTION_KEY'])
            with store.transaction() as db:
                fingerprint = hashlib.sha256(config['ACCOUNT_HMAC_KEY'].encode()).hexdigest()
                for key, value in [('play_package', package), ('account_key_fingerprint', fingerprint)]:
                    old = store.metadata(db, key)
                    if old and old != value:
                        raise ValueError('persistent_identity_configuration_changed')
                    store.set_metadata(db, key, value)
            service = BillingService(store, PlayClient(package))
        except Exception:
            # Fail closed; never print exceptions that may expose credentials or purchase URLs.
            ready = False
    server.extensions['billing_service'] = service

    @server.before_request
    def secure_transport():
        if request.path != '/health' and not request.is_secure:
            raise BillingError('https_required')

    @server.errorhandler(BillingError)
    def expected_error(error):
        return jsonify(error=error.code), error.status

    @server.after_request
    def headers(response):
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        return response

    def require_configuration():
        if not ready or service is None:
            raise BillingError('service_not_configured', 503)

    def authenticate_user():
        info = verify_identity(bearer(request.headers.get('Authorization')), config['GOOGLE_OAUTH_CLIENT_ID'])
        return account_id(info['sub'], config['ACCOUNT_HMAC_KEY'])

    def authenticate_service(prefix):
        return verify_identity(bearer(request.headers.get('Authorization')), config[prefix+'_AUDIENCE'],
                               service_email=config[prefix+'_SERVICE_ACCOUNT_EMAIL'])

    @server.get('/health')
    def health():
        try:
            synchronized = ready and service is not None and service.synchronized()
        except Exception:
            synchronized = False
        return jsonify(service='kotoba-verifier', configured=bool(ready), ready=bool(synchronized),
                       live_google_credentials_verified=False)

    @server.post('/account')
    def account():
        require_configuration()
        try:
            return jsonify(obfuscatedAccountId=authenticate_user())
        except BillingError:
            raise
        except Exception:
            raise BillingError('authentication_temporarily_unavailable', 503) from None

    @server.post('/verify')
    def receipt():
        require_configuration()
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            raise BillingError('invalid_request')
        product, token, installation = body.get('productId'), body.get('purchaseToken'), body.get('installationId')
        if (body.get('packageName') != package or product not in (SUB, LIFE) or not valid_token(token)
                or not isinstance(installation, str) or not re.fullmatch(r'[A-Za-z0-9-]{10,80}', installation)):
            raise BillingError('invalid_request')
        try:
            owner = authenticate_user()
            integrity = body.get('integrityToken')
            if not isinstance(integrity, str) or not 16 <= len(integrity) <= 32768:
                raise BillingError('app_integrity_required', 403)
            expected_hash = request_hash(package, product, token, installation, owner)
            payload = service.play.decode_integrity(integrity)
            check_integrity(payload, package, expected_hash, config['PLAY_SIGNING_CERT_SHA256'].split(','))
            if not service.synchronized():
                raise BillingError('refund_reconciliation_required', 503)
            result = service.refresh(product, token, owner)
            lease = claims(package, installation, product, result, int(time.time()), account=owner)
            return jsonify(lease=sign(lease, Path(config['ENTITLEMENT_KEY_FILE']).read_bytes()))
        except BillingError:
            raise
        except Exception:
            # A network timeout or database failure is not evidence of an invalid purchase.
            raise BillingError('verification_temporarily_unavailable', 503) from None

    @server.post('/rtdn')
    def rtdn():
        require_configuration()
        try:
            authenticate_service('PUBSUB')
            status = service.notification(request.get_json(silent=True), package, config['PUBSUB_SUBSCRIPTION'])
            return jsonify(status=status)
        except BillingError:
            raise
        except Exception:
            # Non-2xx causes Pub/Sub retry. Dedupe commits only with completed processing.
            raise BillingError('notification_temporarily_unavailable', 503) from None

    @server.post('/tasks/reconcile')
    def reconcile():
        require_configuration()
        try:
            authenticate_service('OPS')
            return jsonify(processed=service.reconcile_voids())
        except BillingError:
            raise
        except Exception:
            raise BillingError('reconciliation_temporarily_unavailable', 503) from None

    @server.get('/tasks/status')
    def status():
        require_configuration()
        try:
            authenticate_service('OPS')
            with service.store.transaction() as db:
                reviews = db.execute('''SELECT COUNT(*) FROM notifications n
                  LEFT JOIN refund_review_records r USING(subscription,message_id)
                  WHERE n.subscription=? AND n.status='operator_refund_review_required' AND r.message_id IS NULL''',
                  (config['PUBSUB_SUBSCRIPTION'],)).fetchone()[0]
                synchronized_at = service.store.metadata(db, 'voided_sync_at')
            return jsonify(refundReviewsNeedingOperator=reviews, voidedSyncAt=synchronized_at)
        except BillingError:
            raise
        except Exception:
            raise BillingError('status_temporarily_unavailable', 503) from None

    @server.get('/tasks/refund-reviews')
    def refund_reviews():
        require_configuration()
        try:
            authenticate_service('OPS')
            raw_limit = request.args.get('limit', '50')
            if not re.fullmatch(r'[0-9]{1,3}', raw_limit):
                raise BillingError('invalid_review_query')
            return jsonify(service.refund_reviews(config['PUBSUB_SUBSCRIPTION'],
                request.args.get('state', 'open'), request.args.get('after', ''), int(raw_limit)))
        except BillingError:
            raise
        except Exception:
            raise BillingError('review_temporarily_unavailable', 503) from None

    @server.get('/tasks/refund-reviews/<message_id>')
    def refund_review(message_id):
        require_configuration()
        try:
            authenticate_service('OPS')
            return jsonify(service.refund_review(config['PUBSUB_SUBSCRIPTION'], message_id))
        except BillingError:
            raise
        except Exception:
            raise BillingError('review_temporarily_unavailable', 503) from None

    @server.post('/tasks/refund-reviews/<message_id>/record')
    def record_refund_review(message_id):
        require_configuration()
        try:
            identity = authenticate_service('OPS')
            return jsonify(service.record_refund_review(config['PUBSUB_SUBSCRIPTION'], message_id,
                           request.get_json(silent=True), identity['email']))
        except BillingError:
            raise
        except Exception:
            raise BillingError('review_temporarily_unavailable', 503) from None
    return server


app = create_app()
