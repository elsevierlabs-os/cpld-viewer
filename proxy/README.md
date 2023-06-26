# Simple Linked Data Redirect Proxy

The `proxy.py` script in this folder can be used as a simple proxy for redirecting requests from the viewer to Linked Data services on the web. This is particularly useful when:

* The services require authentication
* The services do not dereference from the original Linked Data URI
* The services are not CORS enabled.

## Configuration

* Rename `config.template.yml` to `config.yml`
* Make adjustments in the config file to suit your needs:
  * The `rewrites` dictionary should contain entries that match the requested IRI to a regex, with an `id` part. 
  * If a match is found, this `id` part is then concatenated at the back of the `rewrite_url_prefix` and the request is forwarded to that.
  * The `apis` dictionary are also triggered by a regex match.
  * Create an object for each api, including an address for retrieving a JSON web token.
* The proxy will always forward only to the first service that matches.