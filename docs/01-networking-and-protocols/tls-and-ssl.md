# TLS and SSL

## Introduction

Transport Layer Security (TLS) protects communication between endpoints,
providing confidentiality, integrity, and authentication. HTTP over TLS is
HTTPS. SSL is its obsolete predecessor.

## Why does it exist?

Data may pass through equipment neither endpoint controls. Without protection,
others could read or alter it, or a client could connect to an impostor. TLS
protects the channel in transit.

## How does it work?

During a handshake, client and server negotiate settings, agree on keys, and
authenticate the server using its certificate and the client's trust store.
Symmetric cryptography then protects application records. TLS 1.3 removed
many older options.

Certificates bind a public key to a name. The client checks the issuer chain,
validity, and hostname. This does not prove that the site or content is safe.

## Real-world example

For an online bank, the browser checks the domain certificate, then carries
HTTP requests and responses through TLS.

## Developer perspective

Use maintained TLS libraries and secure defaults, not custom cryptography.
Keep certificates valid and hostnames correct; do not disable certificate
checks to silence errors. TLS cannot protect a compromised endpoint.

## Practical example

`curl -I https://example.com` requests headers through TLS.
`openssl s_client -connect example.com:443 -servername example.com` displays
handshake details if OpenSSL is installed. Both only query the service.

## Important terminology

- **Handshake:** initial negotiation and authentication exchange.
- **Certificate:** signed information binding a public key to an identity.
- **Certificate authority (CA):** organization trusted to issue certificates.
- **Cipher suite:** negotiated cryptographic algorithms and parameters.

## Advantages and disadvantages

TLS reduces eavesdropping and tampering, but needs correct configuration.
Expired certificates or compromised endpoints can undermine protection.

## Common misconceptions

- The browser padlock signals a protected connection, not a legitimate
  business; encryption does not prevent phishing or malware.

## Revision questions

1. What security properties does TLS help provide?
2. What does a browser check in a server certificate?
3. Why is TLS not a guarantee that a site is safe?

## Further Learning & References

- **Official standard — RFC Editor:** [RFC 8446, The Transport Layer Security
  (TLS) Protocol Version 1.3](https://www.rfc-editor.org/rfc/rfc8446)
  specifies TLS 1.3.
- **Third-party explanation — MDN:** [Transport Layer Security
  (TLS)](https://developer.mozilla.org/en-US/docs/Web/Security/Transport_Layer_Security)
  explains how TLS protects web communication and how certificates fit in.
