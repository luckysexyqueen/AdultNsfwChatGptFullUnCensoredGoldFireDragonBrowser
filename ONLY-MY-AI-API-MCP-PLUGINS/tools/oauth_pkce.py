"""Local OAuth PKCE authorization helper. No browser callback server or refresh automation."""
import argparse,base64,hashlib,secrets,urllib.parse
p=argparse.ArgumentParser();p.add_argument('--authorization-url',required=True);p.add_argument('--client-id',required=True);p.add_argument('--redirect-uri',required=True);p.add_argument('--scope',default='');a=p.parse_args()
if not a.authorization_url.startswith('https://'):p.error('HTTPS authorization URL required')
verifier=secrets.token_urlsafe(64);challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode();state=secrets.token_urlsafe(24)
url=a.authorization_url+('' if '?' not in a.authorization_url else '&')+('?' if '?' not in a.authorization_url else '')+urllib.parse.urlencode({'response_type':'code','client_id':a.client_id,'redirect_uri':a.redirect_uri,'scope':a.scope,'state':state,'code_challenge':challenge,'code_challenge_method':'S256'})
print('Authorization URL:',url);print('PKCE verifier (secret, keep locally):',verifier);print('State (verify callback):',state)
