# Origins, CORS, and Browser Security

Browsers enforce rules that limit how one website can interact with data from
another. The same-origin policy and related protections help prevent a page
from freely reading private data belonging to another site.

## What is an origin?

An origin is the combination of scheme, host, and port. For example,
`https://shop.example:443` and `http://shop.example` have different schemes
and therefore different origins. A different subdomain or port is also a
different origin.

## Same-origin policy and CORS

The same-origin policy restricts certain cross-origin reads by scripts.
Cross-Origin Resource Sharing (CORS) is a server-controlled mechanism that
allows a server to tell browsers which origins may read selected responses.
The browser enforces the response headers; adding a request header in
frontend JavaScript cannot grant permission.

Some cross-origin requests trigger a preflight `OPTIONS` request. Simple
requests may be sent without preflight, but the browser can still block
JavaScript from reading a response if the CORS policy does not allow it.

## Developer perspective

Configure CORS on the server that owns the resource. Allow only the origins
and methods needed. CORS is not authentication: it does not prevent non-browser
clients from calling a public endpoint, and it does not replace authorization
or CSRF protections.

**Origin** is scheme/host/port; **preflight** asks permission before certain
cross-origin requests; **credentialed request** includes credentials such as
cookies under specific browser and server policies.

## Common misconceptions

- CORS is not a frontend setting that can override a server response.
- A CORS error does not necessarily mean the server never received the
  request.
- CORS does not protect an API from all unauthorized access.

## Check your understanding

1. Which parts make up an origin?
2. Which side must return the CORS permission headers?
3. Why is CORS not an authentication mechanism?

## Further learning

- [MDN: Same-origin policy](https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy)
- [MDN: Cross-Origin Resource Sharing](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
