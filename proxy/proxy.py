import requests
import re
import yaml
import rfc3987
from flask import Flask, request, make_response
from flask_cors import CORS

app = Flask(__name__)
CORS(app)


config = yaml.safe_load(open("config.yml"));

@app.route("/browse", methods=["GET"])
def browse():
    iri = request.args.get('uri', None)


    is_iri = rfc3987.match(iri)
    if is_iri is None:
        return make_response({"ERROR": f"{is_iri} is not a valid IRI according to RFC3987"},400)

    response = None
    if iri is not None:
        print(iri)
        passed_through_response = do_request(iri, request.headers)
        response = make_response(passed_through_response.content)
        response.headers['Content-Type'] = passed_through_response.headers['Content-Type']
    else: 
        response = make_response({})
        response.headers['Content-Type'] = "application/ld+json"
    
    return response

def do_request(iri, headers):
    
    print(headers.get("Accept"))
    proxy_headers = {
        "Accept": headers.get("Accept")
    }

    for api in config['apis'].values():
        regex = api['regex']
        token_url = api['token_url']
        key = api['key']
        secret = api['secret']
        api_url = api['api_url']

        # Test for match against H-Graph API
        match = re.match(regex,iri)
        
        if match != None:
            # Get token
            response = requests.post(token_url, auth=(key,secret))
            if response.status_code == 200:
                access_token = response.json()['access_token']
                print(access_token)
            else:
                raise Exception("API Token could not be retrieved for API call")
            
            api_call_url = api_url + match.group("id")

            proxy_headers["Authorization"] = f"Bearer {access_token}"

            print(api_call_url)
            try:
                return requests.get(api_call_url, headers=proxy_headers)
            except Exception as e:
                raise e

    for rewrite in config['rewrites'].values():
        regex = rewrite['regex']
        rewrite_url_prefix = rewrite['rewrite_url_prefix']

        match = re.match(regex, iri)
        if match != None:
            rewrite_call_url = rewrite_url_prefix + match.group('id')
            print(rewrite_call_url)
            return requests.get(rewrite_call_url, headers=proxy_headers)

    
    return requests.get(iri, headers=proxy_headers)