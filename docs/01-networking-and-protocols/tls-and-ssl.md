# TLS and SSL

## Introduction

Transport Layer Security (TLS) protects communication between two endpoints.
It can provide confidentiality, integrity, and authentication. Secure
websites commonly use HTTP over TLS, written as HTTPS. SSL is the older
predecessor name; SSL versions are obsolete and should not be used.

## Why does it exist?

Data sent across networks can pass through equipment that neither endpoint
controls. Without protection, an observer might read or alter it, and a client
might connect to an impostor. TLS helps protect a channel while data travels.

## How does it work?

During a TLS handshake, the client and server negotiate supported settings,
agree on cryptographic keys, and authenticate the server using its certificate
and the client's trust store. The exact handshake depends on the TLS version
and configuration. Afterward, symmetric cryptography protects application
records efficiently. TLS 1.3 supports modern cryptographic choices and
removed many older options.

Certificates bind a public key to a name under a certificate authority's
signature. The client checks the chain, validity, and requested hostname.
This proves control of an authenticated name under the trust model; it does
not prove that a website is trustworthy or that its content is harmless.

## Real-world example

When visiting an online banking site, the browser checks the certificate for
the requested domain and establishes a TLS session. HTTPS then carries HTTP
requests and responses within the protected channel.

## Developer perspective

Use maintained TLS libraries and current secure defaults rather than
implementing cryptography yourself. Keep certificates valid, configure
hostnames correctly, and do not disable certificate checks to silence errors.
TLS protects data in transit, not data after it reaches a compromised device
or server.

## Practical example

`curl -I https://example.com` checks whether a TLS-protected HTTP endpoint
responds and reports headers. `openssl s_client -connect example.com:443
-servername example.com` displays handshake and certificate details when
OpenSSL is installed. These commands connect to the named public service and
do not modify it.

## Important terminology

- **Handshake:** initial negotiation and authentication exchange.
- **Certificate:** signed information binding a public key to an identity.
- **Certificate authority (CA):** organization trusted to issue certificates.
- **Cipher suite:** negotiated cryptographic algorithms and parameters.

## Advantages and disadvantages

TLS reduces eavesdropping and tampering risks and helps authenticate a server.
It adds configuration and computational work; weak settings, expired
certificates, or compromised endpoints can undermine protection.

## Common misconceptions

- SSL is not a safe modern alternative to TLS.
- The padlock indicates an encrypted connection and certificate checks, not
  that a business or page is legitimate.
- Encryption alone does not prevent phishing, malware, or server compromise.

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
