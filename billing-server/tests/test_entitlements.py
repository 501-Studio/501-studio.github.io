import unittest,sys,base64,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from entitlements import *
from cryptography.hazmat.primitives.asymmetric import rsa
NOW=1790460000

def receipt(state='SUBSCRIPTION_STATE_ACTIVE',expiry=None,plan='monthly'):
    expiry=expiry if expiry is not None else NOW+86400
    return {'subscriptionState':state,'acknowledgementState':'ACKNOWLEDGEMENT_STATE_PENDING','lineItems':[{'productId':SUB,'offerDetails':{'basePlanId':plan},'expiryTime':datetime.fromtimestamp(expiry).astimezone().isoformat()}]}
class TestEntitlements(unittest.TestCase):
    def test_active_canceled_paid_through_and_grace(self):
        for s in ['ACTIVE','CANCELED','IN_GRACE_PERIOD']:
            r=decision(SUB,receipt('SUBSCRIPTION_STATE_'+s),NOW);self.assertTrue(r['active']);self.assertTrue(r['ackNeeded'])
    def test_pending_hold_paused_expired_never_grant(self):
        for s in ['PENDING','ON_HOLD','PAUSED','EXPIRED','UNSPECIFIED']:
            self.assertFalse(decision(SUB,receipt('SUBSCRIPTION_STATE_'+s),NOW)['active'])
    def test_expiration_checked_even_active(self):self.assertFalse(decision(SUB,receipt(expiry=NOW-1),NOW)['active'])
    def test_wrong_baseplan_no_grant(self):self.assertFalse(decision(SUB,receipt(plan='unapproved'),NOW)['active'])
    def test_lifetime_pending_or_refunded_no_grant(self):
        for state in [1,2]:self.assertFalse(decision(LIFE,{'purchaseState':state},NOW)['active'])
    def test_nonconsumable_only(self):
        self.assertTrue(decision(LIFE,{'purchaseState':0,'acknowledgementState':0},NOW)['ackNeeded'])
        self.assertFalse(decision(LIFE,{'purchaseState':0,'consumptionState':1},NOW)['active'])
    def test_lease_expires_before_subscription_and_revocation_cache_limit(self):
        d=decision(SUB,receipt(),NOW);c=claims('com.studio501.kotoba','installation-1234',SUB,d,NOW);self.assertEqual(c['exp'],NOW+3600)
        d=decision(SUB,receipt(expiry=NOW+900),NOW);self.assertEqual(claims('com.studio501.kotoba','installation-1234',SUB,d,NOW)['exp'],NOW+900)
    def test_lifetime_lease_is_not_a_year_long_refund_bypass(self):
        d=decision(LIFE,{'purchaseState':0,'acknowledgementState':1},NOW)
        self.assertEqual(claims('com.studio501.kotoba','installation-1234',LIFE,d,NOW)['exp'],NOW+3600)
    def test_malformed_boolean_or_multi_quantity_purchase_does_not_grant(self):
        for r in [{'purchaseState':False,'acknowledgementState':1},{'purchaseState':0},
                  {'purchaseState':0,'acknowledgementState':1,'quantity':2},
                  {'purchaseState':0,'acknowledgementState':1,'refundableQuantity':0}]:
            self.assertFalse(decision(LIFE,r,NOW)['active'])
    def test_unknown_products_rejected(self):
        with self.assertRaises(ValueError):decision('hacked',{},NOW)
    def test_signatures_cover_payload(self):
        key=rsa.generate_private_key(public_exponent=65537,key_size=2048);pem=key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption())
        jwt=sign({'iss':'studio501.kotoba','active':True},pem);a,b,c=jwt.split('.')
        key.public_key().verify(base64.urlsafe_b64decode(c+'='*((-len(c))%4)),(a+'.'+b).encode(),padding.PKCS1v15(),hashes.SHA256())
        self.assertTrue(json.loads(base64.urlsafe_b64decode(b+'='*((-len(b))%4)))['active'])
if __name__=='__main__':unittest.main()
