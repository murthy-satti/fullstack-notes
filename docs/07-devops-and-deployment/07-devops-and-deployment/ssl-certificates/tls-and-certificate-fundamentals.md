# TLS and Certificate Fundamentals

TLS (Transport Layer Security) is the protocol that puts the "S" in HTTPS.
It encrypts traffic, detects tampering, and lets the client confirm it is
talking to the right server using a **certificate**: a document signed by
a certificate authority (CA) that binds a domain name to a public key. This
lesson explains the SSL and TLS naming, what TLS does and does not protect,
the TLS 1.3 handshake step by step, the fields of an X.509 certificate,
the chain of trust from leaf to root, validation levels, wildcard and
multi-domain certificates, Certificate Transparency, HSTS, revocation, and
the shrinking maximum lifetime of public certificates.

## Why it matters

Every request from TaskFlow Web to TaskFlow API carries a session token.
Without TLS, anyone on the same Wi-Fi network, ISP, or compromised router
could read it and take over the account, or silently change responses.
With TLS, they see only encrypted bytes, and a forged server cannot
present a valid certificate for `api.example.com`.

Understanding the mechanism matters operationally too. Most "SSL problems"
in production are not cryptography failures but configuration ones: a
missing intermediate certificate, a hostname that is not in the
certificate, an expired certificate, a client with an outdated trust
store, or a clock that is wrong. You cannot debug those quickly without
knowing what the client checks and in what order.

## Real-world usage

- **IETF TLS 1.3.** [RFC 8446](https://www.rfc-editor.org/rfc/rfc8446)
  (2018) defines TLS 1.3: a one-round-trip handshake, encryption of most
  handshake messages including the certificate, removal of static RSA key
  exchange and legacy ciphers, and forward secrecy for every connection.
  [RFC 8996](https://www.rfc-editor.org/rfc/rfc8996) (2021) formally
  deprecates TLS 1.0 and 1.1.
- **CA/Browser Forum.** Ballot
  [SC-081v3](https://cabforum.org/2025/04/11/ballot-sc081v3-introduce-schedule-of-reducing-validity-and-data-reuse-periods/)
  (2025) introduced a schedule that reduces the maximum validity of
  publicly trusted TLS certificates from 398 days in steps starting in
  March 2026 and ending at 47 days in March 2029, and shortens how long
  domain validation results may be reused.
- **Certificate Transparency.** The
  [Certificate Transparency project](https://certificate.transparency.dev/)
  describes public, append-only logs of issued certificates that browsers
  require for publicly trusted certificates, and that anyone can monitor
  (for example through [crt.sh](https://crt.sh/)) to spot certificates
  issued for their domains.
- **Let's Encrypt root transition.** Let's Encrypt's post
  [Help with chaining](https://letsencrypt.org/2021/10/01/cert-chaining-help/)
  covers the planned expiry of the DST Root CA X3 cross-signature in
  September 2021, after which some outdated clients and OpenSSL
  configurations failed to build a valid chain: a real example of chain of
  trust problems at internet scale.

**Popular tools and providers:** OpenSSL, `mkcert` for local development,
Let's Encrypt, ZeroSSL, Google Trust Services, DigiCert, Sectigo, AWS
Certificate Manager, the Mozilla SSL Configuration Generator, Qualys SSL
Labs, and crt.sh.

## How it works

### SSL or TLS?

"SSL" is the name of the original Netscape protocol. It was replaced by
TLS, but the old name stuck in product names ("SSL certificate", "SSL
termination").

| Version | Year | Status |
|---|---|---|
| SSL 2.0 | 1995 | Prohibited (RFC 6176) |
| SSL 3.0 | 1996 | Prohibited (RFC 7568); broken by the POODLE attack |
| TLS 1.0 | 1999 | Deprecated (RFC 8996) |
| TLS 1.1 | 2006 | Deprecated (RFC 8996) |
| TLS 1.2 | 2008 | Still widely supported; acceptable with modern cipher suites |
| TLS 1.3 | 2018 | Current; preferred |

The certificate itself is not "SSL" or "TLS": the same X.509 certificate
works with any protocol version. Servers today should offer TLS 1.2 and
1.3 only.

### What TLS provides, and what it does not

| Property | How TLS provides it |
|---|---|
| **Confidentiality** | Symmetric authenticated encryption (AES-GCM or ChaCha20-Poly1305) with keys derived during the handshake |
| **Integrity** | Every record carries an authentication tag; modified bytes fail decryption |
| **Server authentication** | The certificate binds the name to a public key; the server proves it holds the private key by signing the handshake |
| **Forward secrecy** | Session keys come from ephemeral (EC)DHE key shares, so stealing the server's private key later does not decrypt recorded traffic |
| **Client authentication** (optional) | Mutual TLS: the client also presents a certificate |

TLS does **not** hide which IP address you connect to, the size and timing
of traffic, or (without Encrypted Client Hello, which is being deployed by
browsers and some CDNs) the hostname in the SNI field. It also says
nothing about whether the server itself is secure or honest.

### The TLS 1.3 handshake, step by step

![Diagram: a sequence between client and server. The client sends ClientHello with supported_versions TLS 1.3, a key_share such as X25519, signature_algorithms, SNI, and ALPN. The server replies ServerHello with the chosen cipher suite and its key_share. Both sides derive handshake keys from the two key shares (ECDHE). The server then sends, encrypted with handshake keys, EncryptedExtensions (ALPN h2), Certificate (leaf and intermediates), CertificateVerify (signed with the private key), and Finished (a MAC over the handshake); this takes one round trip. The client verifies the chain, name, signature, and Finished, then sends its own Finished, and application data flows both ways encrypted with application traffic keys.](tls13-handshake.svg)

1. **ClientHello.** The client sends the versions it supports (the
   `supported_versions` extension lists TLS 1.3), cipher suites, the
   signature algorithms it accepts, the server name (**SNI**) so one IP can
   host many certificates, the application protocols it wants (**ALPN**:
   `h2`, `http/1.1`), and, importantly, a **key share**: an ephemeral
   public value for a key exchange group it guesses the server supports,
   usually X25519.
2. **ServerHello.** The server picks the version and cipher suite and
   sends its own ephemeral key share. Now both sides can compute the same
   shared secret (ECDHE) and derive **handshake keys**. If the server does
   not support the client's guessed group, it sends a HelloRetryRequest
   and the handshake takes one extra round trip.
3. **Encrypted server flight.** Everything after ServerHello is
   encrypted:
   - **EncryptedExtensions:** the remaining negotiated settings, such as
     the chosen ALPN protocol.
   - **Certificate:** the leaf certificate and intermediates.
   - **CertificateVerify:** a signature, made with the certificate's
     private key, over the whole handshake so far. This proves the server
     holds the private key and binds the certificate to this handshake.
   - **Finished:** a MAC over the handshake, proving nothing was tampered
     with.
4. **Client verification.** The client builds and checks the chain, checks
   the hostname against the SAN list and the validity dates, verifies the
   CertificateVerify signature and the server's Finished.
5. **Client Finished**, and the client can send its first HTTP request in
   the same flight. One round trip after the ClientHello, application data
   is flowing, encrypted with **application traffic keys**.

Compared with TLS 1.2, which needs two round trips for a full handshake,
sends the certificate in clear text, and allows static RSA key exchange
without forward secrecy, TLS 1.3 is faster and leaks less.

TLS 1.3 cipher suites are short because key exchange and signatures are
negotiated separately:

| Cipher suite | Notes |
|---|---|
| `TLS_AES_128_GCM_SHA256` | Mandatory to implement; fast with AES hardware |
| `TLS_AES_256_GCM_SHA384` | Larger key |
| `TLS_CHACHA20_POLY1305_SHA256` | Fast on devices without AES acceleration |

Two related features:

- **Session resumption:** a returning client presents a pre-shared key
  (session ticket) and skips certificate processing.
- **0-RTT early data:** with resumption, the client may send data in its
  very first flight. That data can be **replayed** by an attacker, so it
  is only safe for idempotent requests; many deployments leave it off.

Key exchange is also evolving: major browsers and CDNs now commonly
negotiate a **hybrid post-quantum** group (X25519 combined with ML-KEM,
named `X25519MLKEM768`) so that traffic recorded today cannot be decrypted
by a future quantum computer. Certificates and signatures are unchanged
by this.

### What a certificate contains

![Diagram: a table of X.509 v3 fields for api.example.com. Version v3. Serial number, unique per issuing CA and used in revocation lists. Signature algorithm, for example ecdsa-with-SHA256. Issuer CN=Example TLS CA R1, which must match the next certificate up. Validity, notBefore and notAfter 90 days apart, checked by every client. Subject CN=api.example.com, legacy and ignored for hostname checks. Subject public key, for example ECDSA P-256, whose private half never leaves the server. Subject alternative name DNS:api.example.com and DNS:app.example.com, matched against the hostname. Key usage and extended key usage digitalSignature and serverAuth. Basic constraints CA:FALSE. Authority information access with the issuer certificate URL. CRL distribution points. Signed certificate timestamps proving Certificate Transparency logging. The issuer's signature over all fields.](certificate-anatomy.svg)

Points that trip people up:

- **The SAN list is what counts.** Browsers match the hostname against
  the subject alternative name (SAN) entries; the subject common name (CN)
  is ignored for that purpose. A certificate with only a CN fails in
  modern clients.
- **The private key is not in the certificate.** The certificate holds
  the public key and is public information; the private key stays on the
  server (file mode `600`, never in Git) or in a hardware security module
  or cloud key service.
- **Key types:** RSA (2048 bits or more) is universally supported; ECDSA
  P-256 keys and signatures are much smaller and faster and are supported
  by all modern clients. Many sites serve ECDSA certificates.

Common file formats:

| Format | Looks like | Holds |
|---|---|---|
| PEM (`.pem`, `.crt`, `.key`) | Base64 between `-----BEGIN ...-----` lines | Certificates, keys, CSRs; can concatenate several |
| DER (`.der`, `.cer`) | Binary | One certificate or key |
| PKCS#12 (`.p12`, `.pfx`) | Binary, password-protected | Certificate chain plus private key in one file |
| CSR (`.csr`) | PEM | A certificate signing request: public key plus requested names, signed by the private key |
| `fullchain.pem` | PEM | Leaf followed by intermediates: what a server should serve |

### The chain of trust

![Diagram: left, sent by the server in fullchain.pem: the leaf for api.example.com, issued by Example TLS CA R1, SAN api.example.com, valid 90 days, CA false, signed by the intermediate Example TLS CA R1, which is issued by Example Root X1, CA true with path length 0, valid a few years, and online to issue leaf certificates. Right, already on the client in its trust store: the root Example Root X1, self-signed, in OS, browser, and runtime stores, valid many years, with its private key offline in an HSM. The intermediate is signed by the root. The client checks bottom up: the leaf signature with the intermediate's key, the intermediate signature with the root's key, and that the root is in the trust store. Serve the leaf and every intermediate, not the root; a missing intermediate gives "unable to get local issuer certificate".](chain-of-trust.svg)

- A **root CA** certificate is self-signed. Clients trust it only because
  it is shipped in a **trust store**: Mozilla's root store (Firefox and
  most Linux distributions' `ca-certificates`), the Chrome Root Store,
  Apple's and Microsoft's stores, Java's `cacerts`, and the Mozilla-derived
  list compiled into Node.js. Root programs audit CAs and can remove them.
- Root private keys are kept offline. Day-to-day issuance uses
  **intermediate CAs**, signed by the root, which can be rotated or
  revoked without touching every device's trust store.
- The server sends its **leaf and all intermediates**; the client supplies
  the root. Browsers can sometimes fetch a missing intermediate using the
  Authority Information Access URL or a cache, but many clients (Node.js,
  curl, Java, mobile apps) cannot, which is why a missing intermediate
  "works in my browser" but fails for API clients.
- **Cross-signing** lets a new root be trusted by older devices: the new
  root's intermediate is also signed by an older, widely trusted root.
  When that cross-signature expires, old clients without the new root
  break, as happened with DST Root CA X3 in 2021.

### Validation levels: DV, OV, and EV

| Level | What the CA verifies | Typical use |
|---|---|---|
| **DV** (domain validation) | Control of the domain only, automatically (ACME challenges) | Almost all websites and APIs; Let's Encrypt issues only DV |
| **OV** (organization validation) | Domain control plus that the organization exists | Some corporate policies; details visible only when inspecting the certificate |
| **EV** (extended validation) | Stricter organization checks | Formerly shown as a green bar; major browsers removed special EV indicators around 2019 |

The encryption is identical at every level. For TaskFlow, DV certificates
issued automatically are the right choice.

### Wildcard and multi-domain certificates

- A **multi-domain (SAN) certificate** lists several names explicitly,
  such as `example.com`, `www.example.com`, and `api.example.com`.
- A **wildcard** certificate for `*.example.com` covers exactly one label:
  `api.example.com` and `app.example.com`, but **not** `example.com` itself
  and **not** `v2.api.example.com`. List `example.com` as a second SAN if
  you need it.

Wildcards are convenient for many subdomains and keep individual
hostnames out of Certificate Transparency logs, but the same private key
then protects every subdomain: one compromised server exposes them all.
Let's Encrypt issues wildcards only with the DNS-01 challenge (see
[obtaining and renewing certificates](obtaining-and-renewing-certificates.md)).

### Certificate Transparency

Publicly trusted CAs submit every certificate (as a precertificate) to
several **Certificate Transparency (CT) logs**, which return signed
certificate timestamps (SCTs) embedded in the final certificate. Browsers
such as Chrome and Safari reject publicly trusted certificates without
enough valid SCTs.

Consequences for you:

- You can **monitor CT logs** for your domains (crt.sh, or monitoring
  services) and detect certificates you did not request: mis-issuance,
  a forgotten team's shadow infrastructure, or an attacker who briefly
  controlled DNS.
- Every hostname in a public certificate becomes **public**. Internal names
  such as `jenkins.internal.example.com` in a public certificate reveal
  infrastructure; use a wildcard or a private CA for internal services.

### Revocation

A certificate can be **revoked** before it expires (for example if its key
leaks). Clients learn about revocation through:

- **CRLs** (certificate revocation lists) published by the CA.
- **OCSP**, an online per-certificate status check, and **OCSP stapling**,
  where the server attaches a recent OCSP response to the handshake.
- **Browser-aggregated revocation data** such as Chrome's CRLSets and
  Firefox's CRLite, built from CA data and pushed to browsers.

Revocation has always been unreliable because many clients "soft fail"
(accept the certificate if they cannot check). Let's Encrypt removed OCSP
URLs from its certificates and shut down its OCSP service in 2025, relying
on CRLs. The industry's main answer is **short certificate lifetimes**: a
leaked key is only useful until the certificate expires.

### HSTS

**HTTP Strict Transport Security** tells browsers to use HTTPS only for a
domain, for a period, even if the user types `http://` or clicks an old
link:

```text
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

- `max-age` is in seconds (63,072,000 is two years).
- `includeSubDomains` applies the rule to every subdomain.
- `preload` signals consent to be included in the **HSTS preload list**
  built into browsers (submitted at hstspreload.org), which protects even
  the first visit. Preload requires a valid certificate, an HTTP to HTTPS
  redirect on the same host, HTTPS for all subdomains, and a `max-age` of
  at least one year with `includeSubDomains`.

HSTS is effectively irreversible for its duration: if any subdomain still
needs plain HTTP, `includeSubDomains` breaks it. Roll out with a short
`max-age` (for example 300 seconds), verify, then increase; treat preload
as a long-term commitment because removal takes months to reach users.

### Certificate lifetimes are shrinking

Public certificate lifetimes are capped by the CA/Browser Forum's Baseline
Requirements and browser root programs. The maximum was 398 days from 2020
until Ballot SC-081v3 introduced this schedule:

| Certificates issued on or after | Maximum validity | Domain validation reuse |
|---|---|---|
| March 15, 2026 | 200 days | 200 days |
| March 15, 2027 | 100 days | 100 days |
| March 15, 2029 | 47 days | 10 days |

Let's Encrypt already issues 90-day certificates by default, offers
optional 6-day short-lived certificates, and has announced shorter
defaults: 64-day certificates from February 10, 2027 and 45-day
certificates from February 16, 2028, with domain validation reuse cut to
10 days and then 7 hours (opt-in 45-day certificates through its
`tlsserver` profile became available in May 2026). These rules cover publicly trusted
TLS certificates; a private CA for internal services sets its own policy,
though short lifetimes are good practice there too.

The practical consequence: **renewal must be fully automated**. At 47 days
with renewal at about two-thirds of the lifetime, each certificate is
renewed roughly every month.

## When to use and when not to use

| Situation | Choice |
|---|---|
| Public website or API (TaskFlow Web, TaskFlow API) | DV certificate from a public CA via ACME, or a managed certificate at the load balancer or CDN |
| Many subdomains created dynamically | Wildcard via DNS-01, or on-demand issuance per host |
| Internal service-to-service traffic | Private CA (or a service mesh) with short-lived certificates; do not put internal names in public CT logs |
| Machine clients that must prove identity | Mutual TLS with client certificates from a private CA |
| Local development | `mkcert` (a locally trusted development CA); never disable verification instead |
| Requirement to show the organization's verified identity | OV or EV, knowing browsers no longer display EV specially |

Do not use self-signed certificates in production for anything users or
other teams connect to: every client then has to disable verification or
pin a one-off certificate, which defeats the point.

## Practical examples

### Generate a private key and CSR with SANs

```bash
# OpenSSL 3: ECDSA P-256 key and a CSR for two names (use -nodes on OpenSSL 1.1.1)
openssl req -new \
  -newkey ec -pkeyopt ec_paramgen_curve:P-256 -noenc \
  -keyout api.example.com.key \
  -out api.example.com.csr \
  -subj "/CN=api.example.com" \
  -addext "subjectAltName=DNS:api.example.com,DNS:app.example.com"

chmod 600 api.example.com.key
openssl req -in api.example.com.csr -noout -text | grep -A1 "Subject Alternative Name"
```

With ACME clients you rarely do this by hand (they generate keys and CSRs
for you), but private CAs and some commercial CAs still take a CSR.

### Inspect a certificate file

```bash
openssl x509 -in fullchain.pem -noout \
  -subject -issuer -serial -dates \
  -ext subjectAltName,keyUsage,extendedKeyUsage,basicConstraints

# Full decoded dump, including SCTs and the public key
openssl x509 -in fullchain.pem -noout -text
```

`openssl x509` reads only the first certificate in a file, which in
`fullchain.pem` is the leaf. To see every certificate, split the file or
use `openssl crl2pkcs7 -nocrl -certfile fullchain.pem | openssl pkcs7 -print_certs -noout`.

### Verify a chain and match a key to a certificate

```bash
# Does the leaf chain up to this root through this intermediate?
openssl verify -CAfile root.pem -untrusted intermediate.pem leaf.pem
# leaf.pem: OK

# Does this private key belong to this certificate? (works for RSA and ECDSA)
openssl x509 -in leaf.pem -noout -pubkey | openssl sha256
openssl pkey -in privkey.pem -pubout | openssl sha256
# The two hashes must be identical.
```

A key and certificate mismatch is a common cause of a server refusing to
start after a manual renewal.

### Trusted certificates for local development

```bash
# mkcert creates a local CA, installs it in the system and browser trust stores,
# and issues certificates signed by it. Development machines only.
mkcert -install
mkcert localhost 127.0.0.1 ::1
# Created localhost+2.pem and localhost+2-key.pem
```

Never share the mkcert root key or install it on servers; anyone with it
can issue certificates your machine trusts.

### Trusting a private CA from Node.js

```bash
# Adds a private CA to Node's built-in Mozilla roots for https, tls, and fetch
NODE_EXTRA_CA_CERTS=/etc/taskflow/internal-ca.pem node src/server.js
```

```js
// src/clients/reports.js: a client for an internal service with a private CA
import https from "node:https";
import { readFileSync } from "node:fs";

const ca = readFileSync("/etc/taskflow/internal-ca.pem");

export function getReport(id) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { host: "reports.internal.example.com", path: `/reports/${id}`, ca, timeout: 3000 },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve(JSON.parse(body)));
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}
```

Passing `ca` replaces the default trust store for that request, so only
the private CA is trusted there; `NODE_EXTRA_CA_CERTS` adds to the
defaults for the whole process. Both keep verification on, unlike
`rejectUnauthorized: false`.

### Sending HSTS from Express

```js
// src/app.js (when TLS terminates in front of the app, the proxy can set this instead)
import express from "express";
import helmet from "helmet";

const app = express();
app.use(
  helmet({
    strictTransportSecurity: {
      maxAge: 63072000,        // seconds; start small (e.g. 300) when first rolling out
      includeSubDomains: true,
      preload: true,
    },
  })
);
```

Browsers ignore HSTS headers received over plain HTTP, so the header only
takes effect once users reach the site over HTTPS.

## Best practices

- Offer TLS 1.2 and 1.3 only; prefer TLS 1.3 and AEAD cipher suites with
  forward secrecy.
- Serve the leaf plus all intermediates (`fullchain.pem`), never just the
  leaf.
- Use SAN entries for every hostname; do not rely on the CN.
- Prefer ECDSA P-256 keys where clients allow; keep private keys out of
  Git, with tight permissions, or in a key management service.
- Automate issuance and renewal; plan for 47-day certificates.
- Monitor Certificate Transparency for your domains.
- Keep internal hostnames out of public certificates; use a private CA
  internally.
- Roll out HSTS gradually; preload only when every subdomain is HTTPS.
- Keep client trust stores and OpenSSL versions up to date.
- Never disable certificate verification to make an error go away.

## In production

- **Browsers are fine, but API clients fail with "unable to verify the first certificate".**
  *Detect:* Node.js reports `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, curl reports
  "unable to get local issuer certificate", while Chrome loads the site.
  *Cause:* the server sends only the leaf, and browsers fill in the
  missing intermediate from their cache or the AIA URL. *Fix:* configure
  the server with the full chain (`fullchain.pem`) and verify with
  `openssl s_client -showcerts`.
- **Some users get certificate errors and others do not.**
  *Detect:* errors only for some regions, devices, or old Android
  versions. *Cause:* different servers or edge nodes serve different
  certificates, or old clients lack a newer root after a cross-sign
  expired. *Fix:* check every endpoint behind the load balancer, align
  certificates, and decide which old clients you still support.
- **`NET::ERR_CERT_COMMON_NAME_INVALID` on a new subdomain.**
  *Detect:* the browser error names the hostname; the certificate's SAN
  list does not include it. *Cause:* the subdomain was added to DNS but
  not to the certificate, or a wildcard was expected to cover a
  second-level name (`v2.api.example.com`). *Fix:* reissue with the name in
  the SAN list or add a matching wildcard.
- **Internal hostnames appear in public search tools.**
  *Detect:* a crt.sh search lists `admin.internal.example.com`. *Cause:*
  internal services were given publicly trusted certificates, which are
  logged in CT. *Fix:* use a private CA for internal services, or a
  wildcard, and assume any logged name is public.
- **A subdomain becomes unreachable after enabling HSTS.**
  *Detect:* users cannot open `legacy.example.com`, which only serves
  HTTP. *Cause:* `includeSubDomains` forced HTTPS on every subdomain.
  *Fix:* serve HTTPS on that subdomain (the only quick fix while browsers
  hold the policy), and roll out HSTS with short `max-age` first next time.
- **TLS handshakes fail on one host with "certificate is not yet valid".**
  *Detect:* errors on a single VM or container host, with a recently
  issued certificate. *Cause:* the host clock is wrong (behind by hours or
  days). *Fix:* run NTP or chrony and alert on clock offset; see
  [NTP and time synchronization](../../../01-networking-and-protocols/ntp-and-time-synchronization.md).

## Important terminology

- **TLS:** The protocol that secures connections; SSL is its obsolete
  predecessor.
- **Handshake:** The negotiation that authenticates the server and derives
  session keys.
- **Forward secrecy:** Past sessions stay secret even if the long-term
  private key later leaks.
- **SNI:** Server Name Indication, the hostname sent in ClientHello.
- **ALPN:** Application-Layer Protocol Negotiation, choosing `h2` or
  `http/1.1` during the handshake.
- **X.509 certificate:** The standard certificate format binding names to
  a public key, signed by an issuer.
- **SAN:** Subject Alternative Name, the list of names a certificate is
  valid for.
- **CA:** Certificate authority; root CAs are trusted directly, intermediate
  CAs are trusted through roots.
- **Trust store:** The set of root certificates a client trusts.
- **CSR:** Certificate signing request.
- **DV / OV / EV:** Validation levels of a certificate.
- **Certificate Transparency:** Public logs of all publicly trusted
  certificates.
- **SCT:** Signed certificate timestamp, proof that a certificate was
  logged.
- **HSTS:** A header telling browsers to use HTTPS only.
- **Revocation:** Invalidating a certificate before its expiry (CRL,
  OCSP).

## Common mistakes and misconceptions

- Calling the protocol SSL and assuming SSL 3.0 or TLS 1.0 are acceptable.
- Serving only the leaf certificate because "it works in Chrome".
- Expecting a wildcard to cover the apex domain or deeper subdomains.
- Believing EV or paid certificates are more secure cryptographically.
- Assuming HTTPS hides which site a user visits; IPs and, without ECH,
  SNI are visible.
- Disabling verification in clients to work around errors.
- Relying on revocation to protect against a leaked key instead of short
  lifetimes and fast rotation.
- Enabling HSTS preload before every subdomain supports HTTPS.
- Committing private keys to repositories or baking them into images.

## Revision questions

1. What does TLS provide, and what does it leave visible to a network
   observer?
2. Walk through the TLS 1.3 handshake. When can the client send its first
   HTTP request, and why is the certificate encrypted?
3. What is forward secrecy, and which part of the handshake provides it?
4. Why does a server need to send intermediate certificates but not the
   root?
5. Which of these does a certificate for `*.example.com` cover:
   `example.com`, `api.example.com`, `v2.api.example.com`?
   (Only `api.example.com`.)
6. A publicly trusted certificate is issued on March 20, 2026. What is the
   latest possible expiry date under the current CA/Browser Forum rules?
   (200 days later: October 6, 2026.)
7. With 47-day certificates renewed at about two-thirds of their
   lifetime, roughly how many renewals per year does each certificate
   need, and for 150 certificates? (About every 31 days, so roughly 12 per
   year per certificate, about 1,800 for 150.)
8. Why can enabling HSTS with `includeSubDomains` break a site, and how do
   you roll it out safely?

## Further learning

- [RFC 8446: TLS 1.3](https://www.rfc-editor.org/rfc/rfc8446)
- [Mozilla: Server Side TLS guidelines](https://wiki.mozilla.org/Security/Server_Side_TLS)
- [CA/Browser Forum: Baseline Requirements](https://cabforum.org/working-groups/server/baseline-requirements/requirements/)
- [Let's Encrypt: Certificate lifetime rationale and plans](https://letsencrypt.org/docs/cert-lifetimes/)
- [Let's Encrypt: Chains of trust](https://letsencrypt.org/certificates/)
- [HSTS preload list](https://hstspreload.org/)
- [TLS and SSL](../../../01-networking-and-protocols/tls-and-ssl.md) in the Networking section
- Next: [obtaining and renewing certificates](obtaining-and-renewing-certificates.md).
  Back to the [SSL certificates overview](../ssl-certificates.md).
