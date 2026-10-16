"""Pure receipt interpretation. Google responses, never client booleans, grant access."""
from __future__ import annotations
import base64,json,re,time
from datetime import datetime
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import padding
SUB='kotoba_premium'; LIFE='kotoba_lifetime'

def epoch(text: str)->int:
    try: return int(datetime.fromisoformat(text.replace('Z','+00:00')).timestamp())
    except (ValueError,TypeError,AttributeError): return 0

def decision(product: str, receipt: dict, now: int)->dict:
    if product not in (SUB,LIFE): raise ValueError('Unknown product')
    if product==SUB:
        state=receipt.get('subscriptionState','')
        items=[x for x in receipt.get('lineItems',[]) if x.get('productId')==SUB and x.get('offerDetails',{}).get('basePlanId') in ('monthly','annual')]
        until=max((epoch(x.get('expiryTime')) for x in items),default=0)
        active=state in ('SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_CANCELED','SUBSCRIPTION_STATE_IN_GRACE_PERIOD') and until>now
        return {'active':active,'kind':'subscription','until':until,'ackNeeded':active and receipt.get('acknowledgementState')=='ACKNOWLEDGEMENT_STATE_PENDING'}
    # purchases.products GET is used for the non-consumable; never consume this token.
    active=receipt.get('purchaseState')==0 and receipt.get('consumptionState',0)==0
    return {'active':active,'kind':'lifetime','until':0,'ackNeeded':active and receipt.get('acknowledgementState')==0}

def claims(package: str, installation: str, product: str, result: dict, now: int)->dict:
    if not re.fullmatch(r'[A-Za-z0-9-]{10,80}',installation): raise ValueError('Invalid installation')
    ttl=365*86400 if result['kind']=='lifetime' else 7*86400
    expiry=now+ttl if result['active'] else now+300
    if result['active'] and result['kind']=='subscription': expiry=min(expiry,result['until'])
    return {'iss':'studio501.kotoba','aud':package,'sub':installation,'iat':now,'exp':expiry,'active':result['active'],'kind':result['kind'],'product':product}

def sign(payload:dict,pem:bytes)->str:
    def b64(data):return base64.urlsafe_b64encode(data).rstrip(b'=').decode()
    content=b64(b'{"alg":"RS256","typ":"JWT"}')+'.'+b64(json.dumps(payload,separators=(',',':'),sort_keys=True).encode())
    key=serialization.load_pem_private_key(pem,password=None)
    signature=key.sign(content.encode(),padding.PKCS1v15(),hashes.SHA256())
    return content+'.'+b64(signature)
