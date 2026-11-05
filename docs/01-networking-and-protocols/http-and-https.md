# HTTP and HTTPS

## Introduction

HTTP (Hypertext Transfer Protocol) is an application protocol used to request
and transfer web resources. A client, such as a browser, sends a request to a
server, which returns a response. HTTPS is HTTP carried over a protected
connection, usually using TLS. See [DNS](dns.md) and [TCP and UDP](tcp-and-udp.md)
for the network services commonly used underneath.

## Why does it exist?

Web clients and servers need a shared way to ask for pages, images, data, and
other resources. HTTP defines request methods, headers, status codes, and
message semantics so independent software can interoperate.

## How does it work?

A request identifies a method such as `GET` or `POST`, a target, and headers.
The response contains a status code, headers, and possibly a body. `GET`
normally retrieves a representation; `POST` commonly submits data for
processing. A response such as `404` reports that a resource was not found,
while `200` means the request succeeded according to the response semantics.

HTTP is stateless by design: each request is understood independently, though
cookies or other mechanisms can help applications maintain user state. Modern
HTTP versions can reuse connections and support multiple exchanges. In HTTPS,
TLS helps protect confidentiality and integrity and authenticates the server
according to the certificate and trust system.

## Real-world example

When a browser opens a product page, it may send a `GET` request. The server
responds with HTML, and the browser then requests linked images, stylesheets,
and scripts. Submitting an order form may use `POST` to send information for
processing.

## Developer perspective

Use methods and status codes according to their meaning. Do not assume a
successful transport connection means the HTTP request succeeded. Validate
inputs on the server, avoid placing sensitive data in URLs, and use HTTPS for
sites handling private information.

## Practical example

`curl -I https://example.com` sends an HTTP `HEAD` request and prints response
headers without downloading the response body. It is a read-only diagnostic
request, though the server still receives it. `curl -v` can show connection
and protocol details; avoid sharing output that contains private headers.

## Important terminology

- **Method:** the intended action, such as `GET` or `POST`.
- **Header:** metadata about a request or response.
- **Status code:** a numeric summary of response outcome.
- **Resource:** a thing identified by a URL, such as a document or image.

## Advantages and disadvantages

HTTP is widely supported and extensible. Plain HTTP does not protect data from
observation or modification in transit; HTTPS addresses this with TLS, but
application security still depends on correct implementation.

## Common misconceptions

- HTTPS does not mean a site is honest or its content is safe.
- A `200` response does not guarantee that the page's business operation had
  the desired effect.
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
