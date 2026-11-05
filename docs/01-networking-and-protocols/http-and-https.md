# HTTP and HTTPS

## Introduction

HTTP (Hypertext Transfer Protocol) transfers web resources. A browser sends a
request and a server returns a response. HTTPS is HTTP over a protected
connection, usually using TLS. See [DNS](dns.md) and [TCP and UDP](tcp-and-udp.md).

## Why does it exist?

Clients and servers need a shared way to exchange resources. HTTP defines
methods, headers, status codes, and message semantics.

## How does it work?

A request contains a method such as `GET` or `POST`, a target, and headers.
The response contains a status code, headers, and possibly a body. `GET`
normally retrieves a resource; `POST` commonly submits data. `404` means not
found; `200` indicates success according to the response semantics.

HTTP is stateless: requests are understood independently, though cookies can
help maintain user state. Modern versions reuse connections. In HTTPS, TLS
protects data and authenticates the server according to its certificate.

## Real-world example

Opening a product page may send `GET` for HTML and additional requests for
images and stylesheets. Submitting an order form commonly uses `POST`.

## Developer perspective

Use methods and status codes according to their meaning. A connection does
not prove a request succeeded. Validate server inputs, avoid sensitive URLs,
and use HTTPS for private information.

## Practical example

`curl -I https://example.com` sends `HEAD` and prints headers without the
response body. It is diagnostic, but the server still receives the request.

## Important terminology

- **Method:** the intended action, such as `GET` or `POST`.
- **Header:** metadata about a request or response.
- **Status code:** a numeric summary of response outcome.
- **Resource:** a thing identified by a URL, such as a document or image.

## Advantages and disadvantages

HTTP is widely supported and extensible. Plain HTTP does not protect data in
transit; HTTPS adds TLS, but applications still need secure implementation.

## Common misconceptions

- HTTPS does not mean a site is honest, and `200` does not guarantee the
  desired business outcome.
- HTTP is not limited to HTML; it transfers many kinds of data.

## Revision questions

1. What are the main parts of an HTTP request?
2. How does HTTPS add protection?
3. What is the difference between `GET` and `POST` in common use?

## Further Learning & References

- **Official standard — RFC Editor:** [RFC 9110, HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110)
  defines HTTP methods, status codes, fields, and semantics.
- **Third-party explanation — MDN:** [An overview of HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview)
  introduces requests, responses, and the client-server model.
