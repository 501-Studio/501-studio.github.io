"""One durable SQLite primary. Transactions serialize receipt/refund changes across workers."""
from contextlib import contextmanager, closing
from pathlib import Path
import hashlib
import sqlite3
from cryptography.fernet import Fernet
from security import BillingError


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


class Store:
    def __init__(self, filename, encryption_key):
        path = Path(filename)
        if not path.is_absolute() or filename == ':memory:':
            raise ValueError('An absolute durable SQLite path is required')
        self.filename, self.cipher = str(path), Fernet(encryption_key.encode())
        # Provision the durable directory outside the app; never silently create ephemeral storage.
        with closing(self.connect()) as db:
            db.execute('PRAGMA journal_mode=WAL')
            db.executescript('''
                CREATE TABLE IF NOT EXISTS purchases (
                  token_hash TEXT PRIMARY KEY, token_cipher TEXT NOT NULL,
                  product TEXT NOT NULL, owner TEXT, active INTEGER NOT NULL DEFAULT 0,
                  valid_until INTEGER NOT NULL DEFAULT 0, current_order TEXT NOT NULL DEFAULT '',
                  superseded INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS voids (
                  token_hash TEXT NOT NULL, order_id TEXT NOT NULL, seen_at INTEGER NOT NULL,
                  PRIMARY KEY(token_hash,order_id)
                );
                CREATE TABLE IF NOT EXISTS notifications (
                  subscription TEXT NOT NULL, message_id TEXT NOT NULL, payload_hash TEXT NOT NULL,
                  payload_cipher TEXT NOT NULL, status TEXT NOT NULL, processed_at INTEGER NOT NULL,
                  PRIMARY KEY(subscription,message_id)
                );
                CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS refund_review_records (
                  subscription TEXT NOT NULL, message_id TEXT NOT NULL,
                  record_hash TEXT NOT NULL, record_cipher TEXT NOT NULL, recorded_at INTEGER NOT NULL,
                  PRIMARY KEY(subscription,message_id),
                  FOREIGN KEY(subscription,message_id) REFERENCES notifications(subscription,message_id)
                );
            ''')

    def connect(self):
        db = sqlite3.connect(self.filename, timeout=2, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA synchronous=FULL')
        db.execute('PRAGMA foreign_keys=ON')
        return db

    @contextmanager
    def transaction(self):
        db = self.connect()
        try:
            db.execute('BEGIN IMMEDIATE')
            yield db
            db.execute('COMMIT')
        except BaseException:
            if db.in_transaction:
                db.execute('ROLLBACK')
            raise
        finally:
            db.close()

    def encrypt(self, value):
        return self.cipher.encrypt(value.encode()).decode()

    def decrypt(self, value):
        return self.cipher.decrypt(value.encode()).decode()

    def purchase(self, db, token):
        return db.execute('SELECT * FROM purchases WHERE token_hash=?', (token_hash(token),)).fetchone()

    def assert_owner(self, db, token, product, owner):
        old = self.purchase(db, token)
        if old and (old['product'] != product or old['owner'] and old['owner'] != owner):
            raise BillingError('purchase_owned_by_another_account', 403)
        return old

    def save(self, db, token, product, owner, result, current_order, now):
        old = self.assert_owner(db, token, product, owner)
        db.execute('''INSERT INTO purchases(token_hash,token_cipher,product,owner,active,valid_until,current_order,updated_at)
          VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(token_hash) DO UPDATE SET
          owner=COALESCE(purchases.owner,excluded.owner),active=excluded.active,
          valid_until=excluded.valid_until,current_order=excluded.current_order,updated_at=excluded.updated_at''',
                   (token_hash(token), self.encrypt(token), product, owner, int(result['active']),
                    result['until'], current_order, now))
        return old

    def void(self, db, token, order, now):
        db.execute('INSERT OR IGNORE INTO voids VALUES(?,?,?)', (token_hash(token), order, now))

    def blocked(self, db, token, product, current_order):
        old = self.purchase(db, token)
        if old and old['superseded']:
            return True
        orders = db.execute('SELECT order_id FROM voids WHERE token_hash=?', (token_hash(token),)).fetchall()
        # Subscription renewals reuse a token. An old refunded order must not revoke a later renewal.
        return bool(orders) and (product == 'kotoba_lifetime' or not current_order
                                or any(row['order_id'] == current_order for row in orders))

    def supersede(self, db, token, owner, now):
        old = self.assert_owner(db, token, 'kotoba_premium', owner)
        if old is None:
            self.save(db, token, 'kotoba_premium', owner,
                      {'active': False, 'until': 0}, '', now)
        db.execute('UPDATE purchases SET superseded=1,active=0,updated_at=? WHERE token_hash=?',
                   (now, token_hash(token)))

    def message_seen(self, db, subscription, message_id, digest):
        old = db.execute('SELECT payload_hash FROM notifications WHERE subscription=? AND message_id=?',
                         (subscription, message_id)).fetchone()
        if old and old['payload_hash'] != digest:
            raise BillingError('notification_id_conflict', 409)
        return old is not None

    def message_done(self, db, subscription, message_id, digest, payload, status, now):
        db.execute('INSERT INTO notifications VALUES(?,?,?,?,?,?)',
                   (subscription, message_id, digest, self.encrypt(payload), status, now))

    def refund_review(self, db, subscription, message_id):
        return db.execute('''SELECT n.*,r.record_cipher,r.recorded_at FROM notifications n
          LEFT JOIN refund_review_records r USING(subscription,message_id)
          WHERE n.subscription=? AND n.message_id=? AND n.status='operator_refund_review_required' ''',
                          (subscription, message_id)).fetchone()

    def refund_reviews(self, db, subscription, state, after, limit):
        filters = {'open': 'AND r.message_id IS NULL', 'recorded': 'AND r.message_id IS NOT NULL', 'all': ''}
        return db.execute('''SELECT n.*,r.record_cipher,r.recorded_at FROM notifications n
          LEFT JOIN refund_review_records r USING(subscription,message_id)
          WHERE n.subscription=? AND n.status='operator_refund_review_required' AND n.message_id>?
          ''' + filters[state] + ' ORDER BY n.message_id LIMIT ?', (subscription, after, limit)).fetchall()

    def record_refund_review(self, db, subscription, message_id, digest, record, now):
        old = db.execute('SELECT record_hash FROM refund_review_records WHERE subscription=? AND message_id=?',
                         (subscription, message_id)).fetchone()
        if old:
            if old['record_hash'] != digest:
                raise BillingError('refund_review_record_conflict', 409)
            return 'duplicate'
        db.execute('INSERT INTO refund_review_records VALUES(?,?,?,?,?)',
                   (subscription, message_id, digest, self.encrypt(record), now))
        return 'recorded'

    def metadata(self, db, key):
        row = db.execute('SELECT value FROM metadata WHERE key=?', (key,)).fetchone()
        return row['value'] if row else None

    def set_metadata(self, db, key, value):
        db.execute('INSERT INTO metadata VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
                   (key, str(value)))
