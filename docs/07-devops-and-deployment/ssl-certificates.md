# SSL Certificates

## Introduction

TLS certificates help a browser verify a website's identity and establish an encrypted HTTPS connection. “SSL certificate” is a common older name; modern web encryption uses TLS.

## Why does it exist?

Without HTTPS, traffic could be read or changed in transit. TLS protects confidentiality and integrity and helps authenticate a domain when the certificate is correctly checked.

## How does it work?

A certificate binds a public key to a domain and is signed by a trusted certificate authority. During a TLS handshake, the server presents it and proves possession of the private key. The browser checks the chain, domain, and validity period. Certificates expire; protect private keys.

## Real-world example

When a user visits `https://shop.example`, the server presents a certificate for that hostname. An expired or mismatched certificate triggers a browser warning.

## Developer perspective

Use HTTPS throughout the site and renew certificates before expiry. Protect private keys; never put them in source control. Related: [reverse proxies](../06-servers-and-infrastructure/reverse-proxy.md) and [DNS](../06-servers-and-infrastructure/domains-and-dns-configuration.md).

## Practical example

For a test domain, use a tool such as Certbot with a compatible web server. Confirm the hostname and test automatic renewal.

## Important terminology

- **TLS:** protocol for securing communication over a network.
- **Certificate authority (CA):** organization that issues certificates.
- **Public/private key pair:** cryptographic keys used for authentication and secure exchanges.
- **Certificate chain:** links from a site certificate to a trusted root.
- **Renewal:** replacing a certificate before expiration.

## Advantages and disadvantages

TLS protects data in transit. Certificate renewal requires care, and HTTPS does not prove a site is honest or encrypt data after it reaches the server.

## Common misconceptions

A certificate does not guarantee an application is safe or prevent phishing. It is not an endorsement of the site's content.

## Revision questions

1. What does a browser check in a website certificate?
2. Why must a private key be protected?
3. What does HTTPS protect, and what does it not prove?

## Further Learning & References

- **Official Let’s Encrypt documentation:** [Getting started](https://letsencrypt.org/getting-started/) explains free automated certificates and how to begin.
- **Official Cloudflare learning resource:** [What is an SSL certificate?](https://www.cloudflare.com/learning/ssl/what-is-an-ssl-certificate/) explains certificates, HTTPS, and validation in accessible terms.
- **Internet standard:** [RFC 8446: The Transport Layer Security Protocol Version 1.3](https://www.rfc-editor.org/rfc/rfc8446) specifies TLS 1.3 for readers seeking the protocol details.
