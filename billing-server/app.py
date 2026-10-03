"""Deploy behind HTTPS + API gateway rate limits. No tokens in logs or client-side secrets.
Not deployed or approved for production until Play credentials, RTDN and abuse tests pass.
"""
import json,os,re,time
from pathlib import Path
from urllib.parse import quote
from flask import Flask,request,jsonify
import google.auth
from google.auth.transport.requests import AuthorizedSession
from entitlements import SUB,LIFE,decision,claims,sign

app=Flask(__name__);app.config['MAX_CONTENT_LENGTH']=16384
PACKAGE=os.environ.get('PLAY_PACKAGE','com.studio501.kotoba')
KEY_PATH=os.environ.get('ENTITLEMENT_KEY_FILE','')
# Require an explicit deploy switch; no credential grants happen on accidental startup.
ENABLED=os.environ.get('RECEIPT_VERIFICATION_ENABLED')=='true'
ROOT='https://androidpublisher.googleapis.com/androidpublisher/v3/applications/'

def store_session():
    credentials,_=google.auth.default(scopes=['https://www.googleapis.com/auth/androidpublisher'])
    return AuthorizedSession(credentials)

def verify(product,token):
    base=ROOT+quote(PACKAGE,safe='')+'/purchases/'
    if product==SUB:
        get_url=base+'subscriptionsv2/tokens/'+quote(token,safe='')
        ack_url=base+'subscriptions/'+SUB+'/tokens/'+quote(token,safe='')+':acknowledge'
    else:
        get_url=base+'products/'+LIFE+'/tokens/'+quote(token,safe='')
        ack_url=get_url+':acknowledge'
    with store_session() as session:
        response=session.get(get_url,timeout=12)
        if response.status_code in (400,404,410):return {'active':False,'kind':'subscription' if product==SUB else 'lifetime','until':0,'ackNeeded':False}
        response.raise_for_status()
        result=decision(product,response.json(),int(time.time()))
        if result['ackNeeded']:
            # Idempotent retry safety: if acknowledgement failed, re-fetch before returning success.
            ack=session.post(ack_url,json={},timeout=12)
            if ack.status_code not in (200,204):
                recheck=session.get(get_url,timeout=12);recheck.raise_for_status()
                result=decision(product,recheck.json(),int(time.time()))
                if result['ackNeeded']:raise RuntimeError('Acknowledgement not confirmed')
        return result

@app.after_request
def headers(response):
    response.headers['Cache-Control']='no-store'
    response.headers['X-Content-Type-Options']='nosniff'
    return response

@app.get('/health')
def health():return jsonify({'ready':ENABLED and bool(KEY_PATH),'service':'kotoba-verifier'})

@app.post('/verify')
def receipt():
    if not ENABLED or not KEY_PATH:return jsonify(error='service_not_configured'),503
    body=request.get_json(silent=True) or {}
    package=body.get('packageName');product=body.get('productId');token=body.get('purchaseToken');installation=body.get('installationId')
    if package!=PACKAGE or product not in (SUB,LIFE) or not isinstance(token,str) or not 8<=len(token)<=4096 or not isinstance(installation,str) or not re.fullmatch(r'[A-Za-z0-9-]{10,80}',installation):
        return jsonify(error='invalid_request'),400
    try:
        result=verify(product,token)
        payload=claims(PACKAGE,installation,product,result,int(time.time()))
        return jsonify(lease=sign(payload,Path(KEY_PATH).read_bytes()))
    except Exception:
        # A network timeout is NOT proof that a legitimate purchase is invalid.
        # Do not log the exception: HTTP exceptions may contain purchase tokens in URL.
        return jsonify(error='verification_temporarily_unavailable'),503

# Pub/Sub endpoint is intentionally not exposed here until authenticated push identity,
# replay protection and durable token ownership/notification store are configured.
# Release gate rtdnAndRefunds remains false. Client refresh alone is not a full RTDN solution.
