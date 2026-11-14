# TLS Termination and Troubleshooting

**TLS termination** is the point where an encrypted connection is
decrypted. Where you put it (CDN, load balancer, reverse proxy, or the
application itself) decides who holds private keys, where plaintext
exists, and what can inspect or route traffic. This lesson compares the
options, covers re-encryption to backends and mutual TLS for
service-to-service traffic, walks through a modern nginx TLS server block
with an HTTP redirect and HSTS, and then gives a systematic way to debug
TLS failures with `openssl s_client`, `curl -v`, and online scanners,
including the error messages for incomplete chains, hostname mismatches,
expired and self-signed certificates, clock skew, and missing SNI.

## Why it matters

TaskFlow API runs behind something: a cloud load balancer, an ingress
controller, nginx, or a CDN. Each hop may terminate TLS, re-encrypt, or
pass it through, and each choice changes your security posture and your
failure modes. A load balancer that terminates TLS and forwards plain HTTP
across a shared network leaves tokens readable inside your environment. A
backend connection that is "encrypted" but never verifies the backend's
certificate can be intercepted. A proxy that strips the original scheme
makes the app generate `http://` links and insecure cookies.

When something does break, TLS errors are cryptic ("handshake failure",
"unable to verify the first certificate") and often client-specific. A
repeatable troubleshooting method turns a two-hour mystery into a
five-minute diagnosis.

## Real-world usage

- **Mozilla.** The
  [Mozilla SSL Configuration Generator](https://ssl-config.mozilla.org/)
  and the [Server Side TLS](https://wiki.mozilla.org/Security/Server_Side_TLS)
  guidelines publish "modern", "intermediate", and "old" configurations for
  nginx, Apache, HAProxy, and others, the starting point most teams use
  for protocol and cipher settings.
- **Cloudflare.** The documentation on
  [SSL/TLS encryption modes](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/)
  shows the termination choices in practice: "Flexible" (HTTPS to the edge,
  plain HTTP to the origin), "Full" (HTTPS to the origin without
  validating its certificate), and "Full (strict)" (HTTPS to the origin
  with certificate validation), recommending strict modes.
- **nginx.** The guide
  [Configuring HTTPS servers](https://nginx.org/en/docs/http/configuring_https_servers.html)
  explains certificate chains (the leaf must come before the
  intermediates in the file), SNI-based virtual hosting, and session
  caching.
- **Qualys SSL Labs.** The [SSL Server Test](https://www.ssllabs.com/ssltest/)
  grades public endpoints on protocol support, key exchange, cipher
  strength, chain completeness, and HSTS, and is a standard check before
  and after TLS changes.

**Popular tools and providers:** nginx, HAProxy, Envoy, Caddy, Traefik,
AWS Application and Network Load Balancers, Google Cloud Load Balancing,
Azure Application Gateway, Cloudflare, Istio and Linkerd for mutual TLS,
OpenSSL, curl, testssl.sh, and SSL Labs.

## How it works

### Where to terminate TLS

![Diagram: three options. A: terminate at the load balancer with plain HTTP inside: the client uses TLS 1.3 to a load balancer holding the certificate and key, which forwards plain HTTP to TaskFlow API pods on port 3000. Pro: simplest, certificates in one managed place, and the load balancer can inspect HTTP for routing and a WAF. Con: traffic between the load balancer and pods is plaintext. B: terminate and re-encrypt: the load balancer holds the public certificate and opens verified TLS to pods with internal certificates on port 8443. Pro: encrypted inside your network while still routing on HTTP. Con: two certificate systems, and backend verification is often forgotten. C: TCP passthrough: an L4 load balancer routes by SNI without keys, and the pods hold the public certificate and terminate TLS. Pro: the load balancer never sees keys or plaintext. Con: no HTTP-aware routing, WAF, or header injection, and certificates on every pod.](tls-termination-options.svg)

| Termination point | Holds the private key | Typical use | Watch out for |
|---|---|---|---|
| **CDN or edge** (Cloudflare, CloudFront) | The CDN | Static sites, global APIs, DDoS protection | The edge-to-origin leg needs its own TLS with validation |
| **Cloud load balancer** (ALB, Google HTTPS LB) | The provider (managed certificates) | Most cloud deployments | Traffic to targets is plain HTTP unless you re-encrypt |
| **Reverse proxy or ingress** (nginx, Envoy, ingress controllers) | Your proxy | VMs, Kubernetes, self-managed | Certificate renewal and reload are your job |
| **Application** (Node.js `https.createServer`) | Every app instance | Small services, end-to-end requirements, mTLS between services | Key distribution to every instance; TLS work in the app process |
| **Passthrough** (L4 load balancer, SNI routing) | The application | Strict end-to-end encryption, client certificates checked by the app | No HTTP-level routing, caching, or WAF at the load balancer |

For TaskFlow, the common setup is TLS at the cloud load balancer or
ingress with a managed or cert-manager certificate, plus re-encryption or
a service mesh inside the cluster if the network is shared or compliance
requires encryption in transit everywhere.

### Re-encryption to backends

Re-encrypting means the load balancer or proxy opens a **new** TLS
connection to the backend. Two rules make it meaningful:

1. **Verify the backend certificate** against a CA you trust (usually an
   internal CA) and check the name. Encryption without verification
   protects against passive eavesdropping only; an active attacker inside
   the network can present any certificate. Some managed load balancers do
   not validate target certificates at all, and Cloudflare's "Full" mode
   (as opposed to "Full (strict)") does not either, so check what your
   provider does.
2. **Reuse connections.** A full handshake per request adds latency and
   CPU; keep-alive connection pools to backends make re-encryption cheap.

### What the application needs to know after termination

When TLS ends before the app, the app sees plain HTTP from the proxy and
must learn the original details from headers the proxy sets:

- `X-Forwarded-Proto: https` (or the standard `Forwarded` header): the
  original scheme, used for redirects, absolute URLs, and `Secure`
  cookies.
- `X-Forwarded-For`: the client IP chain.
- In Express, `app.set("trust proxy", 1)` (or the proxy's address) makes
  `req.secure`, `req.protocol`, and `req.ip` use these headers. Only trust
  them from your own proxy: a client can send fake ones directly. See
  [production and performance](../../../03-backend-development/express/production-and-performance.md)
  in the Express section.

### A modern nginx TLS configuration, explained

The practical example below configures TaskFlow API behind nginx. The key
directives:

| Directive | Purpose |
|---|---|
| `listen 443 ssl;` and `http2 on;` | TLS on port 443 and HTTP/2 (the separate `http2` directive replaced the `listen ... http2` parameter in nginx 1.25.1) |
| `ssl_certificate` | **`fullchain.pem`**: leaf first, then intermediates |
| `ssl_certificate_key` | The private key, readable only by root |
| `ssl_protocols TLSv1.2 TLSv1.3;` | Disable SSL and TLS 1.0/1.1 |
| `ssl_ecdh_curve` | Key exchange groups in preference order |
| `ssl_ciphers` | TLS 1.2 cipher suites (ECDHE with AES-GCM or ChaCha20); TLS 1.3 suites are configured separately and are safe by default |
| `ssl_prefer_server_ciphers off;` | With only strong ciphers offered, let clients pick (mobile devices prefer ChaCha20) |
| `ssl_session_cache` / `ssl_session_timeout` | Resume sessions to skip full handshakes |
| `ssl_session_tickets off;` | Avoid long-lived ticket keys that weaken forward secrecy unless you rotate them |
| `add_header Strict-Transport-Security ... always;` | HSTS on every response, including errors |
| Port 80 server with `return 301 https://...` | Redirect HTTP to HTTPS, except the ACME challenge path |

A classic nginx pitfall: `add_header` directives are inherited by a
`location` block only if that block defines no `add_header` of its own.
Adding a header in one location silently drops HSTS there; repeat it or use
an include file.

OCSP stapling (`ssl_stapling on`) only helps if your CA runs OCSP; Let's
Encrypt certificates no longer include OCSP URLs, so stapling does nothing
for them.

### Mutual TLS for service-to-service traffic

![Diagram: a TaskFlow worker acting as the client connects to the internal reports service. 1: ClientHello. 2: ServerHello and an encrypted CertificateRequest listing accepted CAs. 3: the server's Certificate, CertificateVerify, and Finished; the worker verifies the server as usual. 4: the worker's Certificate with SAN URI spiffe://example.com/ns/taskflow/sa/worker. 5: CertificateVerify signed with the client private key. 6: Finished. The server verifies the client chain against the internal CA and maps the SAN to "worker". 7: application data with both identities proven.](mtls-handshake.svg)

In ordinary TLS only the server is authenticated. In **mutual TLS (mTLS)**
the server also sends a CertificateRequest, and the client must present a
certificate and prove it holds the key. The server verifies the client
certificate against a CA it trusts (normally a private CA) and uses an
identity from it, such as a SAN URI, to authorize the request.

Where it fits:

- **Service-to-service** calls inside TaskFlow (API to reports service,
  worker to API): strong workload identity without shared API keys.
  Service meshes such as Istio and Linkerd issue short-lived workload
  certificates (often with SPIFFE IDs like
  `spiffe://example.com/ns/taskflow/sa/worker`) and do mTLS transparently
  in sidecars or node proxies.
- **Partner and B2B APIs**, IoT devices, and admin endpoints, where each
  caller gets a client certificate.

Costs: you run a private CA, distribute and rotate client certificates
(short lifetimes, automated), and need a way to revoke or block a
compromised identity quickly. Browsers support client certificates, but
the user experience is poor, so mTLS is mostly for machines.

### A troubleshooting method

![Diagram: start with a TLS error and run openssl s_client. Does the handshake complete? If no: a connection or protocol problem; check port, firewall, TLS version, ciphers, and SNI. If yes: is the verify return code 0 (ok)? If no: read the verify error number: 10 expired means renew and reload; 20 or 21 missing intermediate means serve the full chain; 18 or 19 self-signed means use a trusted or private CA; 9 not yet valid means fix the server or client clock. If yes: is the hostname in the SAN list? If no: a name mismatch; reissue with the name or fix SNI routing. If yes: does it fail for one client only? If yes: a client-side cause such as an old trust store, an intercepting proxy, or a pinned certificate. If no: the certificate and chain look right; scan with SSL Labs or testssl.sh.](tls-troubleshooting-flowchart.svg)

Work from the bottom of the stack up:

1. **Can you connect and complete a handshake?** If not, the issue is
   below certificates: DNS, port, firewall, a protocol or cipher mismatch,
   or a server that needs SNI.
2. **Does the chain verify?** `openssl s_client` prints a verify return
   code; `0 (ok)` means the chain built to a trusted root.
3. **Does the name match?** The hostname must be in the SAN list.
4. **Is it one client?** Then look at that client: its trust store, its
   clock, a corporate proxy re-signing traffic, or certificate pinning in a
   mobile app.

Always pass `-servername` to `openssl s_client`. Without SNI, a server
hosting several names returns its default certificate, and you debug the
wrong one.

### Common errors and what they mean

| Problem | OpenSSL | Node.js | curl / browser | Fix |
|---|---|---|---|---|
| Incomplete chain | `verify error:num=20:unable to get local issuer certificate`, `num=21:unable to verify the first certificate` | `UNABLE_TO_VERIFY_LEAF_SIGNATURE` | curl `(60) SSL certificate problem: unable to get local issuer certificate`; browsers may work | Serve `fullchain.pem` |
| Hostname mismatch | Fails with `-verify_hostname` | `ERR_TLS_CERT_ALTNAME_INVALID` | curl `no alternative certificate subject name matches target host name`; Chrome `NET::ERR_CERT_COMMON_NAME_INVALID` | Add the name to the SAN list; check SNI routing |
| Expired | `num=10:certificate has expired` | `CERT_HAS_EXPIRED` | Chrome `NET::ERR_CERT_DATE_INVALID` | Renew, reload, and fix the automation |
| Not yet valid | `num=9:certificate is not yet valid` | `CERT_NOT_YET_VALID` | `NET::ERR_CERT_DATE_INVALID` | Fix the clock (NTP) on the client or server |
| Self-signed or unknown CA | `num=18:self-signed certificate`, `num=19:self-signed certificate in certificate chain` | `DEPTH_ZERO_SELF_SIGNED_CERT`, `SELF_SIGNED_CERT_IN_CHAIN` | `NET::ERR_CERT_AUTHORITY_INVALID` | Use a publicly trusted CA, or add the private root to the client's trust store |
| Protocol or cipher mismatch | `alert handshake failure` or `protocol version` alerts, `no protocols available` | `ERR_SSL_...` errors such as unsupported protocol | `ERR_SSL_VERSION_OR_CIPHER_MISMATCH` | Align TLS versions and cipher suites; upgrade old clients |
| SNI missing | Default certificate returned, then a name mismatch | Rare (Node sends SNI for hostnames) | Old clients, scripts connecting by IP | Send SNI (`-servername`), or give the default server the right certificate |
| Key does not match certificate | Server fails to start (`key values mismatch`) | `ERR_OSSL_...` key errors | Site down | Compare public key hashes; reinstall the matching pair |

`curl -k`, `rejectUnauthorized: false`, and
`NODE_TLS_REJECT_UNAUTHORIZED=0` hide every one of these errors by turning
off verification. They are diagnostic switches for a lab, never fixes.

## When to use and when not to use

| Requirement | Recommended termination |
|---|---|
| Standard public web app or API on a cloud provider | Cloud load balancer or ingress with managed or ACME certificates |
| Compliance requires encryption in transit inside the network | Terminate at the edge and re-encrypt with verification, or use a service mesh |
| Load balancer must never see plaintext | TCP passthrough with SNI routing; TLS in the app |
| Service-to-service authentication without shared secrets | Mutual TLS from a private CA or service mesh |
| Global static content | CDN termination with a strict, validated origin connection |
| Local development | Plain HTTP on localhost, or `mkcert` certificates when features need HTTPS |

Avoid terminating TLS in every Node.js process when a proxy or load
balancer can do it: key distribution and renewal multiply with each
instance. Avoid "Flexible"-style setups (HTTPS to the edge, HTTP over the
internet to the origin) for anything with logins or personal data.

## Practical examples

### nginx: HTTPS for TaskFlow API with redirect and HSTS

```nginx
# /etc/nginx/conf.d/api.example.com.conf
# Port 80: ACME challenges and a redirect to HTTPS for everything else
server {
    listen 80;
    listen [::]:80;
    server_name api.example.com;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/acme;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# Port 443: TLS termination in front of the Node.js app on 127.0.0.1:3000
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name api.example.com;

    ssl_certificate     /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

    # Based on Mozilla's "intermediate" profile; regenerate from ssl-config.mozilla.org
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ecdh_curve X25519:prime256v1:secp384r1;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
    ssl_prefer_server_ciphers off;

    ssl_session_timeout 1d;
    ssl_session_cache shared:TLS:10m;
    ssl_session_tickets off;

    # Start with a small max-age when first rolling out HSTS, then raise it.
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-Id $request_id;
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

`nginx -t` validates the configuration (including that the key matches
the certificate) before the reload, so a mistake does not take the site
down. With a recent OpenSSL (3.5 or later) you can also list the hybrid
post-quantum group `X25519MLKEM768` first in `ssl_ecdh_curve`; check your
nginx and OpenSSL versions before doing so.

### Express behind the proxy

```js
// src/app.js
import express from "express";

export const app = express();

// Trust exactly one proxy hop (nginx on the same host or the load balancer).
app.set("trust proxy", 1);

app.get("/whoami", (req, res) => {
  // With trust proxy: req.protocol === "https" and req.secure === true behind nginx
  res.json({ protocol: req.protocol, secure: req.secure, ip: req.ip });
});
```

Without `trust proxy`, `req.secure` is false behind a TLS-terminating
proxy, and libraries that set `Secure` cookies or build absolute URLs
behave as if the site were plain HTTP.

### Re-encrypting to a backend and verifying it

```nginx
# /etc/nginx/conf.d/reports-upstream.conf (fragment inside a server block)
location /reports/ {
    proxy_pass https://reports.internal.example.com:8443;

    proxy_ssl_verify              on;    # off by default: without it, any certificate is accepted
    proxy_ssl_verify_depth        2;
    proxy_ssl_trusted_certificate /etc/nginx/tls/internal-ca.pem;
    proxy_ssl_server_name         on;    # send SNI to the backend
    proxy_ssl_name                reports.internal.example.com;
    proxy_ssl_protocols           TLSv1.3;

    # Optional: present a client certificate to the backend (mutual TLS)
    proxy_ssl_certificate         /etc/nginx/tls/gateway-client.crt;
    proxy_ssl_certificate_key     /etc/nginx/tls/gateway-client.key;
}
```

`proxy_ssl_verify` defaults to `off` in nginx, which is exactly the
"encrypted but not authenticated" trap described above.

### Requiring client certificates (mTLS) at nginx

```nginx
# /etc/nginx/conf.d/partners.example.com.conf
server {
    listen 443 ssl;
    http2 on;
    server_name partners.example.com;

    ssl_certificate     /etc/letsencrypt/live/partners.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/partners.example.com/privkey.pem;

    ssl_client_certificate /etc/nginx/tls/partner-ca.pem;  # CA that issues partner client certs
    ssl_verify_client      on;
    ssl_verify_depth       2;

    location / {
        # Overwrite (never pass through) identity headers for the app.
        proxy_set_header X-Client-Subject $ssl_client_s_dn;
        proxy_set_header X-Client-Verify  $ssl_client_verify;
        proxy_pass http://127.0.0.1:3000;
    }
}
```

The app trusts `X-Client-Subject` only because nginx always overwrites it
and the app is reachable only through nginx.

### Mutual TLS and certificate reload in Node.js

```js
// src/reports-server.js: an internal service that requires client certificates
import https from "node:https";
import { readFileSync, watch } from "node:fs";
import express from "express";

const dir = "/etc/taskflow/tls";
const load = () => ({
  key: readFileSync(`${dir}/tls.key`),
  cert: readFileSync(`${dir}/tls.crt`),
});

const app = express();
app.get("/reports/:id", (req, res) => {
  const peer = req.socket.getPeerCertificate();
  // subjectaltname looks like "URI:spiffe://example.com/ns/taskflow/sa/worker"
  if (!req.socket.authorized || !peer.subjectaltname?.includes("/sa/worker")) {
    return res.status(403).json({ error: "forbidden" });
  }
  res.json({ id: req.params.id });
});

const server = https.createServer(
  {
    ...load(),
    ca: readFileSync(`${dir}/internal-ca.pem`), // trusted issuer of client certificates
    requestCert: true,
    rejectUnauthorized: true,
    minVersion: "TLSv1.2",
  },
  app
);

// Pick up renewed certificates (for example from cert-manager) without a restart.
watch(dir, () => {
  try {
    server.setSecureContext({ ...load(), ca: readFileSync(`${dir}/internal-ca.pem`) });
  } catch {
    // keep serving the previous certificate if files are mid-update
  }
});

server.listen(8443);
```

`setSecureContext` replaces the key and certificate for new connections,
which matters when certificates live for days.

### A troubleshooting session

```bash
# 1. Handshake, chain, and certificate details (always send SNI with -servername)
openssl s_client -connect api.example.com:443 -servername api.example.com -showcerts </dev/null

# 2. Fail on verification errors and check the hostname explicitly
openssl s_client -connect api.example.com:443 -servername api.example.com \
  -verify_return_error -verify_hostname api.example.com -brief </dev/null

# 3. Protocol and ALPN checks
openssl s_client -connect api.example.com:443 -servername api.example.com -tls1_2 </dev/null
openssl s_client -connect api.example.com:443 -servername api.example.com -alpn h2 </dev/null 2>/dev/null | grep -i alpn

# 4. Dates on the served leaf certificate
openssl s_client -connect api.example.com:443 -servername api.example.com </dev/null 2>/dev/null \
  | openssl x509 -noout -dates -subject -ext subjectAltName

# 5. The client's view, step by step
curl -v https://api.example.com/healthz

# 6. Test one backend behind DNS or a load balancer without changing DNS
curl -v --resolve api.example.com:443:203.0.113.10 https://api.example.com/healthz

# 7. Trust a private CA for this request only
curl --cacert /etc/taskflow/tls/internal-ca.pem https://reports.internal.example.com:8443/healthz

# 8. Clock check on the machine that reports "not yet valid"
date -u && timedatectl status
```

A healthy `-showcerts` result (OpenSSL 3) looks like this:

```text
Certificate chain
 0 s:CN=api.example.com
   i:C=US, O=Example Trust Services, CN=Example TLS CA R1
   v:NotBefore: Oct 31 09:12:44 2026 GMT; NotAfter: Jan 29 09:12:43 2027 GMT
 1 s:C=US, O=Example Trust Services, CN=Example TLS CA R1
   i:C=US, O=Example Trust Services, CN=Example Root X1
---
New, TLSv1.3, Cipher is TLS_AES_256_GCM_SHA384
Verify return code: 0 (ok)
```

An incomplete chain shows only certificate `0` and ends with:

```text
verify error:num=20:unable to get local issuer certificate
verify error:num=21:unable to verify the first certificate
Verify return code: 21 (unable to verify the first certificate)
```

For a full configuration audit of a public endpoint, run the SSL Labs
Server Test, or for internal endpoints `testssl.sh`:

```bash
docker run --rm -t ghcr.io/testssl/testssl.sh https://api.example.com
```

## Best practices

- Terminate TLS as few times as practical, at a layer with automated
  certificates; re-encrypt or use mTLS inside when the network is shared
  or compliance requires it.
- Always verify backend certificates when re-encrypting
  (`proxy_ssl_verify on`, strict modes at CDNs).
- Serve `fullchain.pem`, TLS 1.2 and 1.3 only, ECDHE with AEAD ciphers.
- Redirect HTTP to HTTPS (keeping the ACME path), and send HSTS with
  `always`.
- Set `X-Forwarded-Proto` at the proxy and configure the app to trust
  exactly that proxy.
- Use mTLS with short-lived certificates for service identity; prefer a
  mesh or automated issuer to hand-made client certificates.
- Debug with `openssl s_client -servername` and `curl -v` before changing
  anything; never "fix" errors by disabling verification.
- Re-run SSL Labs or testssl.sh after every TLS configuration change.

## In production

- **API clients fail while browsers work.**
  *Detect:* `openssl s_client -showcerts` lists only one certificate;
  Node.js clients report `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. *Cause:* the
  server is configured with `cert.pem` instead of `fullchain.pem`.
  *Fix:* point `ssl_certificate` at the full chain, reload, and add a
  synthetic check from a non-browser client.
- **Infinite redirect loop after moving TLS to the load balancer.**
  *Detect:* the browser reports too many redirects; logs show the app
  redirecting every request to HTTPS. *Cause:* the app receives plain HTTP
  from the load balancer and does not trust `X-Forwarded-Proto`, so it
  thinks every request is insecure. *Fix:* set `trust proxy` (or the
  framework equivalent) for the load balancer, or redirect only at the
  load balancer.
- **A multi-tenant host serves the wrong certificate to some clients.**
  *Detect:* `openssl s_client` without `-servername` returns a different
  certificate than with it; old clients or IP-based health checks report
  name mismatches. *Cause:* the client does not send SNI and gets the
  default server's certificate. *Fix:* make the default server's
  certificate correct for health checks, and upgrade or reconfigure
  clients to send SNI.
- **HSTS is missing on some responses.**
  *Detect:* `curl -sI` on different paths shows the header only on some.
  *Cause:* a `location` block with its own `add_header` does not inherit
  the server-level HSTS header, or the header lacks `always` and is
  missing on error responses. *Fix:* use `always` and repeat or include
  security headers in locations that add headers.
- **Internal traffic is "encrypted" but an attacker could intercept it.**
  *Detect:* a review finds `proxy_ssl_verify off` (the default), CDN mode
  "Full" rather than "Full (strict)", or clients with
  `rejectUnauthorized: false`. *Cause:* re-encryption configured without
  verification. *Fix:* issue backend certificates from an internal CA and
  enable verification end to end.
- **Only one service's mTLS calls fail after a CA rotation.**
  *Detect:* `certificate verify failed` or `bad certificate` alerts from
  one client; its certificate was issued by the new intermediate.
  *Cause:* the server's trusted CA bundle was not updated with the new
  intermediate or root. *Fix:* distribute new trust anchors before issuing
  from a new CA, keep old and new in the bundle during the overlap, and
  rotate in stages.

## Important terminology

- **TLS termination:** Decrypting TLS at a proxy, load balancer, or app.
- **Re-encryption (TLS bridging):** Terminating TLS and opening a new TLS
  connection to the backend.
- **Passthrough:** Forwarding encrypted traffic without terminating it,
  usually routed by SNI.
- **Mutual TLS (mTLS):** TLS where the client also presents a certificate.
- **SPIFFE ID:** A URI-form workload identity (`spiffe://...`) often
  carried in mTLS certificates.
- **X-Forwarded-Proto:** A header carrying the original scheme to the app.
- **SNI:** The hostname the client requests in ClientHello, used to pick a
  certificate.
- **Verify return code:** OpenSSL's result of chain verification (`0` is
  OK).
- **Full chain:** Leaf plus intermediate certificates, as served.
- **SSL Labs / testssl.sh:** Tools that audit a TLS endpoint's
  configuration.

## Common mistakes and misconceptions

- Assuming traffic inside a VPC or cluster cannot be read.
- Re-encrypting to backends without verifying their certificates.
- Using the leaf-only certificate file in the server configuration.
- Debugging with `openssl s_client` but forgetting `-servername`.
- Disabling verification "temporarily" and shipping it.
- Not telling the app that TLS was terminated upstream, causing redirect
  loops and insecure cookies.
- Losing HSTS on some paths because of `add_header` inheritance.
- Rotating a CA without first distributing the new trust anchor.
- Treating mTLS as authorization; it proves identity, and the app or mesh
  policy must still decide what that identity may do.

## Revision questions

1. Compare terminating TLS at the load balancer, re-encrypting, and
   passthrough. What does each mean for who can read plaintext?
2. Why is re-encryption without certificate verification weak, and which
   nginx directive enables verification?
3. What must an Express app configure when TLS terminates at a proxy, and
   what breaks if it does not?
4. Explain each directive in the nginx TLS server block and why session
   tickets are often disabled.
5. How does mutual TLS work, and how does the server decide who the
   client is?
6. A Node.js client reports `UNABLE_TO_VERIFY_LEAF_SIGNATURE` while Chrome
   works. What do you run, what do you expect to see, and what is the fix?
7. With a 60 ms round trip time, how long does it take before the first
   HTTP request can be sent on a new HTTPS connection with TLS 1.3, and with
   TLS 1.2? (TCP needs 1 RTT; TLS 1.3 adds 1 RTT, so about 120 ms; TLS 1.2
   adds 2 RTTs, so about 180 ms. Session resumption and keep-alive avoid
   most of this.)
8. A certificate error appears only on one VM: "certificate is not yet
   valid". What is the likely cause and fix?

## Further learning

- [nginx: ngx_http_ssl_module](https://nginx.org/en/docs/http/ngx_http_ssl_module.html)
- [nginx: ngx_http_proxy_module (proxy_ssl_* directives)](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)
- [Express: Behind proxies](https://expressjs.com/en/guide/behind-proxies.html)
- [Node.js: TLS](https://nodejs.org/api/tls.html)
- [testssl.sh](https://github.com/testssl/testssl.sh)
- [SPIFFE overview](https://spiffe.io/docs/latest/spiffe-about/overview/)
- [nginx](../../../06-servers-and-infrastructure/nginx.md) and
  [reverse proxy](../../../06-servers-and-infrastructure/reverse-proxy.md) in
  the Servers and Infrastructure section
- Next: [SSL certificates interview questions and answers](interview-questions-and-answers.md).
  Back to the [SSL certificates overview](../ssl-certificates.md).
