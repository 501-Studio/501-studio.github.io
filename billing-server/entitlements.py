"""Pure receipt interpretation. Google responses, never client booleans, grant access."""
from __future__ import annotations
import base64,json,re
from datetime import datetime
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import padding,rsa
SUB='kotoba_premium'; LIFE='kotoba_lifetime'

def epoch(text: str)->int:
    try:
        value=datetime.fromisoformat(text.replace('Z','+00:00'))
        return int(value.timestamp()) if value.tzinfo is not None else 0
    except (ValueError,TypeError,AttributeError): return 0

def decision(product: str, receipt: dict, now: int)->dict:
    if product not in (SUB,LIFE): raise ValueError('Unknown product')
    if not isinstance(receipt,dict): receipt={}
    if product==SUB:
        state=receipt.get('subscriptionState','')
        raw=receipt.get('lineItems',[])
        items=[x for x in raw if isinstance(x,dict) and x.get('productId')==SUB and isinstance(x.get('offerDetails'),dict) and x['offerDetails'].get('basePlanId') in ('monthly','annual')] if isinstance(raw,list) else []
        until=max((epoch(x.get('expiryTime')) for x in items),default=0)
        active=state in ('SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_CANCELED','SUBSCRIPTION_STATE_IN_GRACE_PERIOD') and until>now and receipt.get('acknowledgementState') in ('ACKNOWLEDGEMENT_STATE_PENDING','ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED')
        return {'active':active,'kind':'subscription','until':until,'ackNeeded':active and receipt.get('acknowledgementState')=='ACKNOWLEDGEMENT_STATE_PENDING'}
    # purchases.products GET is used for the non-consumable; never consume this token.
    active=(type(receipt.get('purchaseState')) is int and receipt['purchaseState']==0
            and type(receipt.get('consumptionState',0)) is int and receipt.get('consumptionState',0)==0
            and type(receipt.get('acknowledgementState')) is int and receipt['acknowledgementState'] in (0,1)
            and type(receipt.get('quantity',1)) is int and receipt.get('quantity',1)==1
            and receipt.get('refundableQuantity',1)==1 and receipt.get('productId',LIFE)==LIFE)
    return {'active':active,'kind':'lifetime','until':0,'ackNeeded':active and receipt.get('acknowledgementState')==0}

def claims(package: str, installation: str, product: str, result: dict, now: int, *, account: str='', ttl: int=3600)->dict:
    if not re.fullmatch(r'[A-Za-z0-9-]{10,80}',installation): raise ValueError('Invalid installation')
    if product not in (SUB,LIFE) or not 300<=ttl<=3600: raise ValueError('Invalid lease policy')
    expiry=now+ttl if result['active'] else now+300
    if result['active'] and result['kind']=='subscription': expiry=min(expiry,result['until'])
    return {'iss':'studio501.kotoba','aud':package,'sub':installation,'account':account,'iat':now,'exp':expiry,'active':result['active'],'kind':result['kind'],'product':product}

def sign(payload:dict,pem:bytes)->str:
    def b64(data):return base64.urlsafe_b64encode(data).rstrip(b'=').decode()
    content=b64(b'{"alg":"RS256","typ":"JWT"}')+'.'+b64(json.dumps(payload,separators=(',',':'),sort_keys=True).encode())
    key=serialization.load_pem_private_key(pem,password=None)
    if not isinstance(key,rsa.RSAPrivateKey) or key.key_size<2048: raise ValueError('RSA key must be at least 2048 bits')
    signature=key.sign(content.encode(),padding.PKCS1v15(),hashes.SHA256())
    return content+'.'+b64(signature)
