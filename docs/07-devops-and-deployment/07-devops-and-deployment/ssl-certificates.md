# SSL Certificates

An SSL (more accurately, TLS) certificate is a signed document that binds a
domain name such as `api.example.com` to a public key. During the TLS
handshake the server presents its certificate, proves it holds the matching
private key, and the client checks that a certificate authority it already
trusts vouched for that binding. The result is an encrypted connection to
the server the user actually meant to reach. Every HTTPS site, API, and
internal service call relies on this, and an expired or misconfigured
certificate takes a service down as completely as a crashed server.

## What SSL certificates provide

- **Authentication:** the client knows it is talking to the real
  `api.example.com`, not an impostor on the network.
- **Confidentiality:** traffic is encrypted, so passwords, tokens, and task
  data cannot be read in transit.
- **Integrity:** any modification of data in transit is detected.
- **A prerequisite for the modern web:** browsers mark HTTP pages as not
  secure, HTTP/2 and HTTP/3 are used over TLS in browsers, and many web
  APIs (service workers, geolocation) require a secure context.

Certificates also bring operational duties: they expire, must be renewed
automatically, must be served with the right intermediate chain, and their
private keys must be protected.

## How a typical HTTPS connection is verified

When a TaskFlow Web user's browser connects to `https://api.example.com`:

1. The browser opens a TCP connection and sends a **ClientHello** with the
   server name it wants (SNI) and a key share for the key exchange.
2. The server replies with its own key share, its **certificate chain**
   (leaf certificate plus intermediate certificates), and a signature made
   with its private key.
3. The browser **verifies the chain**: each certificate is signed by the
   next one up, ending at a root certificate already in its trust store.
4. It checks that `api.example.com` matches a name in the certificate's
   subject alternative name list and that the current date is within the
   validity period.
5. Both sides confirm the handshake with **Finished** messages, derive the
   same session keys, and send HTTP requests and responses encrypted.

![Diagram: a browser of a TaskFlow Web user, with a built-in trust store, connects to api.example.com served by nginx or a load balancer that holds the private key and chain. 1: ClientHello with SNI api.example.com and a key share. 2: ServerHello with a key share, the certificate chain, and a signature. 3: Finished both ways, then encrypted HTTP. Below, what the browser verifies in step 2: the leaf certificate for api.example.com is signed by an intermediate CA that issues leaf certificates, which is signed by a self-signed, offline root CA found in the browser's trust store; it also checks that the hostname matches a SAN entry, the current date is within validity, and the signatures verify up to the root.](ssl-certificates-overview.svg)

## Practical example

Check the certificate a server is actually presenting, its issuer, its
validity dates, and the names it covers:

```bash
# Ask for api.example.com explicitly (SNI), then decode the leaf certificate
openssl s_client -connect api.example.com:443 -servername api.example.com </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates -ext subjectAltName
```

```text
subject=CN=api.example.com
issuer=C=US, O=Example Trust Services, CN=Example TLS CA R1
notBefore=Oct 31 09:12:44 2026 GMT
notAfter=Jan 29 09:12:43 2027 GMT
X509v3 Subject Alternative Name:
    DNS:api.example.com
```

`notAfter` is the date that matters for outages; the subject alternative
name list is what browsers match against the hostname. The troubleshooting
lesson builds on this command.

## SSL certificates topic map

**Foundations**

- [TLS and certificate fundamentals](ssl-certificates/tls-and-certificate-fundamentals.md)

**Operations**

- [Obtaining and renewing certificates](ssl-certificates/obtaining-and-renewing-certificates.md)
- [TLS termination and troubleshooting](ssl-certificates/tls-termination-and-troubleshooting.md)

**Review**

- [SSL certificates interview questions and answers](ssl-certificates/interview-questions-and-answers.md) ·
  [cheat sheet](ssl-certificates/cheat-sheet.md)

## Developer perspective and common misconceptions

Treat certificates as automated infrastructure, not a yearly chore.
Public certificate lifetimes are shrinking under CA/Browser Forum rules
(a 200-day maximum since March 2026, falling to 47 days by 2029), so
manual renewal no longer scales: use ACME (Let's Encrypt, Caddy,
cert-manager) or managed certificates at your load balancer, and monitor
the certificate that is actually served. The protocol itself is covered in
[TLS and SSL](../../01-networking-and-protocols/tls-and-ssl.md) in the
Networking section.

- "SSL" is a historical name. SSL 2.0 and 3.0 are broken and disabled;
  everything today is TLS 1.2 or 1.3.
- HTTPS proves *who* you are talking to and protects data in transit. It
  does not prove the site is honest or that the server is secure.
- A free, automated DV certificate gives the same encryption strength as an
  expensive one. Paid options add validation of the organization, support,
  or warranties, not stronger cryptography.
- Never "fix" certificate errors by disabling verification
  (`curl -k`, `rejectUnauthorized: false`, `NODE_TLS_REJECT_UNAUTHORIZED=0`).
  That removes authentication and invites man-in-the-middle attacks.
- Renewing a certificate is not enough; the server must load the new one,
  and with the full intermediate chain.
- Internal services need TLS too: networks inside a data center or cloud
  VPC are not automatically trustworthy.

## Further learning

- [Let's Encrypt: How It Works](https://letsencrypt.org/how-it-works/)
- [Mozilla SSL Configuration Generator](https://ssl-config.mozilla.org/)
- [MDN: Transport Layer Security](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Transport_Layer_Security)
- [RFC 8446: The TLS Protocol Version 1.3](https://www.rfc-editor.org/rfc/rfc8446)
- [SSL certificates interview questions and answers](ssl-certificates/interview-questions-and-answers.md)
