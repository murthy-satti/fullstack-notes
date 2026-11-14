# SSL Certificates Interview Questions and Answers

These questions review TLS and certificate fundamentals, obtaining and
renewing certificates, and TLS termination and troubleshooting. Try
answering each one before reading the answer.

## TLS and certificate fundamentals

### 1. What is the difference between SSL and TLS?

SSL is the original protocol (SSL 2.0 and 3.0), now prohibited because of
serious weaknesses. TLS replaced it; TLS 1.0 and 1.1 are also deprecated
(RFC 8996), so modern servers offer TLS 1.2 and 1.3 only. "SSL
certificate" is a historical name: the same X.509 certificate is used with
any TLS version.

### 2. What three security properties does TLS provide?

Confidentiality (traffic is encrypted with keys from the handshake),
integrity (each record carries an authentication tag, so tampering is
detected), and authentication (the server proves, with its certificate and
a signature, that it is the named host; mutual TLS also authenticates the
client).

### 3. What does TLS not hide from a network observer?

The IP addresses, the size and timing of traffic, and, unless Encrypted
Client Hello is used, the hostname in the SNI field of ClientHello. It also
says nothing about whether the server itself is trustworthy or secure.

### 4. Walk through the TLS 1.3 handshake.

The client sends ClientHello with supported versions, cipher suites,
signature algorithms, SNI, ALPN, and a key share. The server replies with
ServerHello and its key share; both derive handshake keys via ECDHE. The
server then sends, encrypted, EncryptedExtensions, Certificate,
CertificateVerify (a signature over the handshake), and Finished. The
client verifies everything and sends Finished, and application data can
flow after one round trip.

### 5. Why is TLS 1.3 faster and more private than TLS 1.2?

TLS 1.3 needs one round trip for a full handshake instead of two, because
the client sends its key share in the first message. It encrypts the
certificate and most handshake messages, removes static RSA key exchange
and legacy ciphers, and makes forward secrecy mandatory.

### 6. What is forward secrecy?

Session keys are derived from ephemeral (EC)DHE key shares that are
discarded after the handshake, so an attacker who records traffic and
later steals the server's long-term private key still cannot decrypt the
recorded sessions.

### 7. What is 0-RTT early data, and what is its risk?

With session resumption, a TLS 1.3 client can send application data in its
first flight. That data can be replayed by an attacker, so it is safe only
for idempotent requests, and many servers leave it disabled.

### 8. What are the most important fields in an X.509 server certificate?

The subject alternative name list (the hostnames it is valid for), the
validity period (notBefore and notAfter), the issuer, the public key, key
usage and extended key usage (serverAuth), basic constraints (CA:FALSE),
and the issuer's signature. Clients match the hostname against the SAN
entries, not the subject CN.

### 9. Explain the chain of trust.

The leaf certificate is signed by an intermediate CA, which is signed by a
root CA. Roots are self-signed and trusted because they are in the client's
trust store (browser, OS, runtime). The client verifies each signature up
the chain and checks that it ends at a trusted root.

### 10. Why must the server send intermediate certificates, and why not the root?

Clients have the roots but not necessarily the intermediates, so the
server sends the leaf plus all intermediates (`fullchain.pem`). The root is
already on the client and sending it adds bytes without adding trust.
Browsers can sometimes fetch missing intermediates; most API clients
cannot.

### 11. What are DV, OV, and EV certificates?

Domain validation proves control of the domain only and is issued
automatically (Let's Encrypt issues only DV). Organization validation and
extended validation also verify the organization, with stricter checks for
EV. The encryption is identical, and browsers no longer show special EV
indicators.

### 12. What does a wildcard certificate for `*.example.com` cover?

Exactly one label: `api.example.com` and `app.example.com`, but not
`example.com` and not `v2.api.example.com`. It is convenient for many
subdomains, but one private key then protects them all. Let's Encrypt
requires the DNS-01 challenge for wildcards.

### 13. What is Certificate Transparency, and why should you monitor it?

Public, append-only logs where CAs record every publicly trusted
certificate; browsers require proof of logging (SCTs). Monitoring the logs
for your domains reveals certificates you did not request. It also means
every hostname in a public certificate is public, so internal names belong
on a private CA.

### 14. How do HSTS and the preload list work?

The `Strict-Transport-Security` header tells browsers to use only HTTPS
for the domain for `max-age` seconds, optionally for all subdomains. The
preload list builds this into browsers so even the first visit is
protected; it requires a long `max-age`, `includeSubDomains`, and HTTPS on
every subdomain, and it is slow to undo.

### 15. How long can a public TLS certificate be valid today?

Under CA/Browser Forum Ballot SC-081v3, certificates issued from March 15,
2026 may be valid for at most 200 days, falling to 100 days from March 15,
2027 and 47 days from March 15, 2029 (it was 398 days before). Let's
Encrypt issues 90-day certificates by default, moving to 64 days on
February 10, 2027 and 45 days on February 16, 2028.

### 16. Why is revocation considered unreliable, and what replaces it?

Many clients soft-fail when they cannot check CRLs or OCSP, OCSP has
privacy and availability problems, and Let's Encrypt shut down its OCSP
service in 2025. Browsers use aggregated revocation data (CRLSets,
CRLite), and the main mitigation is short certificate lifetimes.

### 17. What are SNI and ALPN?

Server Name Indication is the hostname the client puts in ClientHello so
a server hosting many names can choose the right certificate. ALPN
(Application-Layer Protocol Negotiation) lets client and server agree on
the protocol inside TLS, such as `h2` or `http/1.1`, without an extra round
trip.

### 18. Should you use RSA or ECDSA certificates?

Both are secure at recommended sizes (RSA 2048 bits or more, ECDSA P-256).
ECDSA keys and signatures are much smaller and faster, and all modern
clients support them. Many sites serve ECDSA, and some serve both an ECDSA
and an RSA certificate for very old clients.

### 19. What are PEM, DER, and PKCS#12 files?

PEM is Base64 text between `-----BEGIN ...-----` lines and can hold several
certificates or a key (`fullchain.pem`, `privkey.pem`). DER is the same
data in binary. PKCS#12 (`.p12`, `.pfx`) is a password-protected bundle of
a certificate chain and its private key, common on Windows and in Java.

## Obtaining and renewing certificates

### 20. What is ACME, and what are its main steps?

The protocol (RFC 8555) for automated issuance: the client registers an
account key, creates an order for identifiers, completes a challenge for
each authorization, finalizes the order with a CSR, and downloads the
certificate chain. Let's Encrypt, ZeroSSL, and other CAs support it.

### 21. Compare HTTP-01, DNS-01, and TLS-ALPN-01 challenges.

HTTP-01 serves a token file on port 80 and is simplest for public servers.
DNS-01 creates a TXT record at `_acme-challenge.<domain>`, works for
internal hosts, and is required for wildcards. TLS-ALPN-01 answers on port
443 with a special certificate and suits TLS-terminating proxies when port
80 is blocked. Only DNS-01 issues wildcards.

### 22. What are the risks of DNS-01, and how do you reduce them?

The client needs DNS API credentials, often able to change the whole zone,
stored on a server. Reduce the risk with tokens limited to TXT records,
delegating `_acme-challenge` via CNAME to a dedicated validation zone, or
running issuance on a separate, hardened host. Also allow for DNS
propagation delays.

### 23. How does certbot renew certificates, and what is a deploy hook?

A systemd timer or cron job runs `certbot renew` twice a day; since certbot
4.0, certificates are renewed by default when a third of their lifetime
remains (30 days for a 90-day certificate), or earlier when the CA's ARI
suggests it. A deploy hook runs only after a successful renewal,
for example `systemctl reload nginx`, so the server actually starts using
the new certificate.

### 24. What is ACME Renewal Information (ARI)?

An ACME extension (RFC 9773) where the CA tells the client when to renew a
specific certificate. It lets the CA spread load and ask for early renewal
before a mass revocation, and at Let's Encrypt, ARI-driven renewals are
exempt from rate limits.

### 25. What does Caddy do differently from nginx with certbot?

Caddy obtains and renews certificates automatically for every site address
that is a domain, redirects HTTP to HTTPS, and loads renewed certificates
itself. There is no separate client, timer, or reload to configure; you
only persist its data directory.

### 26. How does cert-manager work in Kubernetes?

Issuers and ClusterIssuers describe how to get certificates (ACME, private
CA, cloud CAs). A Certificate resource, created directly or from an Ingress
annotation, declares names and a Secret name. cert-manager runs the order
and challenges, stores `tls.crt` and `tls.key` in the Secret, and renews at
about two-thirds of the lifetime by default.

### 27. What are managed certificates, and what can still go wrong with them?

Certificates issued and renewed by a cloud provider for its load balancers
and CDNs, such as AWS Certificate Manager with DNS validation. The private
key never leaves the provider. Renewal can still fail if the validation DNS
record is deleted or a name on the certificate stops resolving.

### 28. When should you use a private CA?

For internal services and mutual TLS: internal names should not appear in
public CT logs, public CAs cannot validate internal names, and private CAs
can issue very short-lived certificates at high volume. Tools include
step-ca, Vault PKI, cloud private CAs, cert-manager CA issuers, and service
meshes.

### 29. Why do certificate expiries still cause outages?

Renewal fails silently (port 80 closed, broken redirects, expired DNS
tokens, removed names), renewal succeeds but the server is not reloaded,
some certificates are outside the automation, monitoring checks the file
rather than the served certificate or only one network path, and teams
relied on CA expiry emails that no longer exist.

### 30. How should certificate expiry be monitored?

Probe the served certificate from outside, on every hostname and network
path, with thresholds scaled to the lifetime (for 90-day certificates, a
ticket under 21 days and a page under 7). Also alert directly on renewal
failures, keep an inventory with owners, and monitor CT logs for
certificates you did not expect.

### 31. What is the ACME staging environment for?

Testing issuance and renewal automation without hitting production rate
limits. Its certificates are not trusted by browsers, but it exercises the
same flow, which makes it ideal for new setups and CI.

### 32. Why do CAs validate domain control from several network locations?

An attacker who hijacks one network path (for example with a BGP route
leak) could otherwise answer a challenge and obtain a certificate.
Multi-perspective validation requires the challenge to succeed from
several vantage points, and CA/Browser Forum rules now require it of
public CAs.

## TLS termination and troubleshooting

### 33. Where can TLS be terminated, and how do you choose?

At a CDN, a cloud load balancer, a reverse proxy or ingress, or the
application; or passed through to the app by an L4 load balancer. Choose
based on where plaintext may exist, who should hold keys, whether you need
HTTP-aware routing or a WAF at the edge, and where certificates can be
automated.

### 34. What is re-encryption, and what makes it secure?

Terminating TLS at the load balancer and opening a new TLS connection to
the backend. It is only meaningful if the load balancer verifies the
backend certificate (for example `proxy_ssl_verify on` in nginx or a strict
mode at a CDN); without verification it stops passive eavesdropping but
not an active attacker.

### 35. What does an app need when TLS terminates at a proxy?

The original scheme and client IP from `X-Forwarded-Proto` and
`X-Forwarded-For` (or `Forwarded`), and configuration to trust only its
proxy for those headers, such as `app.set("trust proxy", 1)` in Express.
Otherwise it sees every request as plain HTTP, causing redirect loops and
missing `Secure` cookies.

### 36. What are the key settings in a modern nginx TLS server block?

`listen 443 ssl` with `http2 on`, `ssl_certificate` pointing at the full
chain, the private key, `ssl_protocols TLSv1.2 TLSv1.3`, ECDHE AEAD cipher
suites for TLS 1.2, a shared session cache, session tickets off unless
keys are rotated, HSTS with `always`, and a port 80 server that redirects
to HTTPS except for the ACME challenge path.

### 37. What is mutual TLS, and where is it used?

TLS in which the server requests a certificate from the client and verifies
it against a trusted CA, so both sides are authenticated. It is used for
service-to-service traffic (often via a service mesh with SPIFFE
identities), partner APIs, and devices. It proves identity; authorization
is still a separate decision.

### 38. Which `openssl s_client` options matter most when debugging?

`-connect host:443`, `-servername host` (send SNI), `-showcerts` (print the
chain), `-verify_return_error` and `-verify_hostname` (fail on problems),
`-tls1_2` or `-tls1_3` (test a protocol), `-alpn h2`, and `-brief` for a
summary. Pipe the output into `openssl x509 -noout -dates -ext subjectAltName`
to decode the leaf.

### 39. What do OpenSSL verify errors 10, 18, 19, 20, and 21 mean?

10: certificate has expired. 18: the leaf is self-signed. 19: a
self-signed certificate (an untrusted root) is in the chain. 20: unable to
get the local issuer certificate, and 21: unable to verify the first
certificate, both usually meaning a missing intermediate or an unknown CA.

### 40. Why does forgetting SNI cause confusing results?

A server hosting several names chooses the certificate by SNI. Without it,
the server returns its default certificate, so you see a hostname mismatch
or a different certificate than real clients get.

### 41. How do you test one backend server behind a load balancer for TLS problems?

Use `curl -v --resolve api.example.com:443:<backend-ip> https://api.example.com/`
(or `openssl s_client -connect <backend-ip>:443 -servername api.example.com`),
which connects to that IP while sending the real hostname for SNI and
verification.

### 42. How do you check that a private key matches a certificate?

Compare the public keys: hash the output of
`openssl x509 -in cert.pem -noout -pubkey` and of
`openssl pkey -in key.pem -pubout`; the hashes must be identical. This
works for RSA and ECDSA keys.

### 43. Why is `NODE_TLS_REJECT_UNAUTHORIZED=0` dangerous?

It disables certificate verification for every TLS connection in the
process, so any attacker on the path can impersonate any server. Fix the
real cause instead: serve the full chain, or trust a private CA with
`NODE_EXTRA_CA_CERTS` or the `ca` option.

### 44. How can `add_header` in nginx silently drop HSTS?

A `location` block inherits `add_header` directives from the server level
only if it defines none of its own. Adding any header in a location drops
the inherited HSTS header there. Repeat security headers in such
locations (or use an include), and use `always` so they appear on error
responses too.

### 45. How do you rotate a certificate in a Node.js HTTPS server without a restart?

Call `server.setSecureContext({ key, cert })` with the new files, for
example when a file watcher sees cert-manager update the mounted Secret.
New connections use the new certificate; existing connections are
unaffected.

## Scenario-based questions

### 46. Browsers load `https://api.example.com`, but the mobile app and Node.js clients fail with certificate errors. What do you check?

**What to check first:** the chain the server sends, with
`openssl s_client -connect api.example.com:443 -servername api.example.com -showcerts`.

**How to confirm:** only the leaf appears, and the verify return code is 21
(unable to verify the first certificate); Node.js reports
`UNABLE_TO_VERIFY_LEAF_SIGNATURE`.

**Likely causes and fixes:** the server uses `cert.pem` instead of
`fullchain.pem`; browsers fill the gap from caches, other clients cannot.
Configure the full chain and reload. See
[TLS and certificate fundamentals](tls-and-certificate-fundamentals.md).

### 47. The site went down at midnight with "certificate expired", although certbot is installed. What happened?

**What to check first:** `sudo certbot certificates` and the certbot log in
`/var/log/letsencrypt/`.

**How to confirm:** either renewals have been failing for weeks (challenge
errors), or a renewed certificate exists on disk while `openssl s_client`
shows the old `notAfter`.

**Likely causes and fixes:** a broken challenge (port 80 closed, redirect,
DNS change) or a missing deploy hook so nginx never reloaded. Fix the
challenge, add `--deploy-hook "systemctl reload nginx"`, and monitor the
served certificate with ticket and page thresholds. See
[obtaining and renewing certificates](obtaining-and-renewing-certificates.md).

### 48. After moving TLS termination from nginx on the VM to a cloud load balancer, the site loops on redirects. Why?

**What to check first:** what scheme the app thinks requests use, and the
`X-Forwarded-Proto` header arriving at the app.

**How to confirm:** app logs show `http` requests and 301 redirects to
`https` for every request.

**Likely causes and fixes:** the app redirects plain HTTP to HTTPS but now
receives HTTP from the load balancer and does not trust its forwarded
headers. Configure `trust proxy` for the load balancer, or do the redirect
only at the load balancer. See
[TLS termination and troubleshooting](tls-termination-and-troubleshooting.md).

### 49. A new subdomain `v2.api.example.com` shows `NET::ERR_CERT_COMMON_NAME_INVALID`, even though you have a `*.example.com` certificate. Why?

**What to check first:** the SAN list of the served certificate.

**How to confirm:** it contains `*.example.com` only, which matches one
label, not `v2.api`.

**Likely causes and fixes:** wildcards do not cover deeper subdomains.
Issue a certificate that includes `v2.api.example.com` or
`*.api.example.com`. See
[TLS and certificate fundamentals](tls-and-certificate-fundamentals.md).

### 50. A cert-manager Certificate has been stuck in "Issuing" for an hour. How do you debug it?

**What to check first:** `kubectl describe` on the Certificate,
CertificateRequest, Order, and Challenge.

**How to confirm:** the Challenge shows a failing self-check (HTTP-01 path
not reachable, wrong ingress class, a network policy blocking the solver)
or DNS-01 permission or propagation errors.

**Likely causes and fixes:** fix the solver configuration or credentials,
test against the staging issuer, and alert when Certificates are not Ready.
See [obtaining and renewing certificates](obtaining-and-renewing-certificates.md).

### 51. Let's Encrypt returns a rate-limit error for a service that restarts often. What is wrong?

**What to check first:** how often new certificates are issued for the
same names, and where the client stores its certificates and account.

**How to confirm:** each container start creates a new account or order
because the data directory is ephemeral; the limit of 5 certificates for
the same set of names in 7 days is hit.

**Likely causes and fixes:** persist the ACME data (a volume or a
Kubernetes Secret), rely on renewal instead of re-issuance, and use the
staging environment for tests. See
[obtaining and renewing certificates](obtaining-and-renewing-certificates.md).

### 52. Only one VM reports "certificate is not yet valid" for a certificate issued an hour ago. What do you check?

**What to check first:** the VM's clock (`date -u`, `timedatectl status`).

**How to confirm:** the clock is behind by hours or days compared with
other hosts.

**Likely causes and fixes:** NTP is not running or blocked. Enable chrony or
systemd-timesyncd, allow NTP traffic, and alert on clock offset. See
[TLS and certificate fundamentals](tls-and-certificate-fundamentals.md).

### 53. Users behind one corporate network report certificate warnings for your site, but nobody else does. Why?

**What to check first:** the issuer of the certificate those users see.

**How to confirm:** the issuer is the company's proxy CA, not your CA.

**Likely causes and fixes:** a TLS-intercepting proxy re-signs traffic and
some devices lack the proxy's root, or a pinned client rejects it. This is
outside your server; the network's administrators must fix their trust
distribution or exempt your domain. See
[TLS termination and troubleshooting](tls-termination-and-troubleshooting.md).

### 54. A security review finds that the load balancer forwards to backends over HTTPS but accepts any backend certificate. Is that acceptable?

**What to check first:** the backend TLS verification settings of the load
balancer, proxy, or CDN mode.

**How to confirm:** `proxy_ssl_verify` is off (the nginx default), or the
CDN uses "Full" rather than "Full (strict)".

**Likely causes and fixes:** re-encryption without verification protects
only against passive eavesdropping. Issue backend certificates from an
internal CA and enable verification, or use a service mesh with mTLS. See
[TLS termination and troubleshooting](tls-termination-and-troubleshooting.md).

### 55. After rotating the internal CA, one service's mTLS calls fail with "bad certificate". What happened?

**What to check first:** which CA issued the failing client's certificate
and which CAs the server trusts.

**How to confirm:** the client has a certificate from the new intermediate,
and the server's CA bundle contains only the old one.

**Likely causes and fixes:** trust was not distributed before issuance from
the new CA. Add new trust anchors first, keep old and new during the
overlap, then rotate issuance in stages. See
[TLS termination and troubleshooting](tls-termination-and-troubleshooting.md).

### 56. Certificate expiry probes are green, yet some users get an expired certificate. How can that be?

**What to check first:** whether every network path is probed: IPv4 and
IPv6, each region or edge location, each load balancer listener.

**How to confirm:** probing the failing path directly (for example over
IPv6 or from the affected region) shows a different, expired certificate.

**Likely causes and fixes:** a separate proxy or edge configuration with its
own certificate outside the automation. Probe every path separately and
bring it under the same automation. See
[obtaining and renewing certificates](obtaining-and-renewing-certificates.md).

### 57. HSTS was enabled with `includeSubDomains`, and an old HTTP-only subdomain is now unreachable in browsers. What do you do?

**What to check first:** the HSTS header served on the apex domain and the
affected subdomain's HTTPS support.

**How to confirm:** browsers refuse HTTP for the subdomain and it has no
valid HTTPS endpoint.

**Likely causes and fixes:** `includeSubDomains` forces HTTPS everywhere,
and browsers cache the policy for `max-age`. The quick fix is to serve
HTTPS on that subdomain; in future, roll out HSTS with a short `max-age`
first and preload only when all subdomains support HTTPS. See
[TLS and certificate fundamentals](tls-and-certificate-fundamentals.md).

### 58. An internal hostname such as `admin.internal.example.com` appears in a public certificate search. Is that a problem?

**What to check first:** crt.sh results for your domain and which team
requested the certificate.

**How to confirm:** a publicly trusted certificate lists the internal name.

**Likely causes and fixes:** internal services were given public
certificates, which are logged in Certificate Transparency. Treat the names
as public, move internal services to a private CA or a wildcard, and keep
monitoring CT for unexpected certificates. See
[TLS and certificate fundamentals](tls-and-certificate-fundamentals.md).

## Further learning

- [SSL certificates overview](../ssl-certificates.md)
- [TLS and certificate fundamentals](tls-and-certificate-fundamentals.md) ·
  [Obtaining and renewing certificates](obtaining-and-renewing-certificates.md) ·
  [TLS termination and troubleshooting](tls-termination-and-troubleshooting.md)
- [RFC 8446: TLS 1.3](https://www.rfc-editor.org/rfc/rfc8446)
- [Let's Encrypt documentation](https://letsencrypt.org/docs/)
- [Mozilla SSL Configuration Generator](https://ssl-config.mozilla.org/)
