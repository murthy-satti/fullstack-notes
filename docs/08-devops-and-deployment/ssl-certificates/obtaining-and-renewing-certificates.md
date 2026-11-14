# Obtaining and Renewing Certificates

A certificate is only useful while it is valid, and public certificates
now live for months, soon weeks. The job is therefore not "buy a
certificate" but "run a system that keeps every certificate valid
forever". This lesson covers the ACME protocol and Let's Encrypt, the
HTTP-01, DNS-01, and TLS-ALPN-01 challenges and when each is required,
certbot and its renewal timers, Caddy's automatic HTTPS, cert-manager in
Kubernetes, managed certificates at cloud load balancers and CDNs, private
CAs for internal services, and why certificate expiry still causes
outages, with a monitoring setup and a renewal automation checklist.

## Why it matters

An expired certificate is a total outage for every client that verifies
certificates, which is all of them: browsers show a full-page warning,
mobile apps and API clients refuse to connect, and webhooks from partners
start failing. It happens to well-run companies because renewal is a
background process that runs rarely, depends on things that change
(DNS records, firewall rules, hosting providers, API tokens), and fails
silently.

Shorter lifetimes (a 200-day maximum since March 2026, 47 days by 2029)
make this both worse and better. Renewal now happens many times a year,
so a manual process is impossible, but a broken automation is discovered
sooner and practised constantly. The goal of this lesson is automation
that renews early, verifies what is actually served, and alerts long
before users notice.

## Real-world usage

- **Let's Encrypt and ACME.** Let's Encrypt's
  [How It Works](https://letsencrypt.org/how-it-works/) page explains how
  an ACME client proves control of a domain and obtains certificates
  automatically and for free. The protocol is standardized as
  [RFC 8555](https://www.rfc-editor.org/rfc/rfc8555), and ACME Renewal
  Information (ARI), which lets the CA suggest when to renew, as
  [RFC 9773](https://www.rfc-editor.org/rfc/rfc9773).
- **Tailscale (March 2024).** In
  [TLS certificate outage](https://tailscale.com/blog/tls-outage-20240307),
  Tailscale describes how the certificates for its website expired and took
  it down for about 90 minutes: automatic renewal had been broken by a
  workaround from a hosting migration, and its probes checked only the
  IPv6 path, which served a different, valid certificate.
- **Bazel (December 2025).** The Bazel team's
  [post-mortem](https://blog.bazel.build/2026/01/16/ssl-cert-expiry.html)
  explains how a managed certificate for several subdomains expired,
  breaking builds for hours: renewal failed after one subdomain on the
  certificate was removed from DNS, and nothing alerted on the failures.
- **cert-manager.** The [cert-manager documentation](https://cert-manager.io/docs/)
  describes the de facto standard Kubernetes controller that issues and
  renews certificates from ACME CAs, private CAs, and cloud issuers,
  storing them as Secrets.

**Popular tools and providers:** certbot, acme.sh, lego, Caddy, Traefik,
cert-manager, AWS Certificate Manager, Google Cloud Certificate Manager,
Azure Key Vault and App Service certificates, Cloudflare, step-ca,
HashiCorp Vault PKI, and AWS Private CA.

## How it works

### The ACME protocol

ACME (Automatic Certificate Management Environment) is how a client and a
CA automate issuance:

1. **Account:** the client creates an account key pair and registers it
   with the CA. Every later request is signed with this key.
2. **Order:** the client asks for a certificate for a set of identifiers
   (`api.example.com`).
3. **Authorizations and challenges:** for each identifier, the CA offers
   challenges that prove control of the domain.
4. **Validation:** the client fulfils one challenge and tells the CA; the
   CA checks it, from several network vantage points (multi-perspective
   validation, now required of public CAs by CA/Browser Forum rules) so
   one hijacked network path cannot fool it.
5. **Finalize:** the client sends a CSR for a fresh key pair; the CA
   issues the certificate.
6. **Download:** the client fetches the certificate chain and installs it.

![Diagram: the ACME client (certbot on the server), nginx on port 80 for api.example.com, and the ACME CA (Let's Encrypt). 1: newOrder for api.example.com. 2: the CA returns an authorization with an http-01 challenge and token. 3: the client writes the key authorization into the web root. 4: the client says the challenge is ready. 5: the CA, from several regions, sends GET /.well-known/acme-challenge/ with the token on port 80. 6: nginx answers 200 with token.thumbprint. 7: the authorization is valid. 8: the client finalizes with a CSR for a new key pair. 9: the CA returns the certificate chain. 10: the client installs fullchain.pem and reloads nginx. The key authorization is the token, a dot, and the base64url SHA-256 thumbprint of the account public key.](acme-http01-sequence.svg)

Authorizations are cached for a while, so renewals often skip step 4.
The CA/Browser Forum schedule also shortens how long a validation may be
reused, down to 10 days in 2029, so challenges will run more often.

### HTTP-01, DNS-01, and TLS-ALPN-01

| | HTTP-01 | DNS-01 | TLS-ALPN-01 |
|---|---|---|---|
| Proof | File at `http://<domain>/.well-known/acme-challenge/<token>` | TXT record at `_acme-challenge.<domain>` | Special self-signed certificate offered on port 443 with ALPN `acme-tls/1` |
| Port | 80 (redirects to 80 or 443 are followed) | None; DNS only | 443 |
| Wildcards (`*.example.com`) | No | **Yes (required)** | No |
| Server must be publicly reachable | Yes | No: works for internal hosts | Yes |
| Many servers behind a load balancer | Every server must serve the file (or route the path to one) | Easy: validation is independent of servers | Every server must answer |
| Main risk | Port 80 blocked, or a redirect rule breaks the path | DNS API credentials on servers; propagation delay | Few clients support it |
| Typical users | certbot on a single server, cert-manager HTTP solver | Wildcards, internal services, CI-issued certificates | TLS-terminating proxies such as Caddy and Traefik |

Decision rules:

- **Need a wildcard?** DNS-01 is the only option.
- **Server not reachable from the internet** (internal dashboard)? DNS-01.
- **Single public server or ingress, port 80 open?** HTTP-01 is simplest.
- **Port 80 blocked, but you terminate TLS yourself?** TLS-ALPN-01.

DNS-01 security tip: an API token that can edit your whole DNS zone is a
powerful secret to leave on a web server. Limit it to TXT records where
the provider allows, or delegate `_acme-challenge.example.com` with a
CNAME to a separate zone used only for validation. Some hosting platforms
ask for an NS delegation of the same name instead, so they can issue
wildcards while your DNS stays where it is (see
[connecting domains to hosting](../domains-dns-and-email/connecting-domains-to-hosting.md)).

**CAA records decide which CAs may issue at all.** Before issuing, a
public CA looks up the domain's CAA records and must refuse if they exist
but do not list it. A CAA set that omits your CA (common after moving to
a platform or CDN that uses a different one) makes issuance and renewal
fail with a CAA error even though the challenge would pass. The record
format and lookup rules are in
[domains and DNS records](../domains-dns-and-email/domains-and-dns-records.md#caa-which-cas-may-issue).

### certbot and renewal timers

certbot, from the Electronic Frontier Foundation, is the reference ACME
client for single servers:

- **Plugins** decide how the challenge is answered and how the certificate
  is installed: `--nginx` and `--apache` edit the web server config,
  `--webroot` writes files into an existing site, `--standalone` runs a
  temporary server on port 80, and DNS plugins (for example
  `certbot-dns-route53`) create TXT records.
- **Files** live in `/etc/letsencrypt/live/<name>/`: `fullchain.pem` (leaf
  plus intermediates, what servers should use), `privkey.pem`, `cert.pem`,
  and `chain.pem`. They are symlinks to the latest versions in
  `/etc/letsencrypt/archive/`.
- **Renewal** runs from a systemd timer (or cron) installed with the
  package, which runs `certbot renew` twice a day. Since certbot 4.0 a
  certificate is renewed by default when a third of its lifetime remains
  (30 days for a 90-day certificate; configurable as `renew_before_expiry`
  in its renewal file), and since certbot 4.1 it also follows the CA's ARI
  suggestion when the CA provides one.
- **Deploy hooks** run only after a successful renewal, for example
  `systemctl reload nginx`. Without one, nginx keeps serving the old
  certificate from memory until something reloads it.

### Caddy: automatic HTTPS

Caddy obtains and renews certificates by default for every site address
that is a domain name: no separate client, no timer, no reload. It
redirects HTTP to HTTPS, solves HTTP-01 or TLS-ALPN-01 challenges itself,
uses Let's Encrypt and ZeroSSL as issuers, staples OCSP where the CA still
offers it, and stores certificates in its data directory. For a small
deployment of TaskFlow API on one or two VMs, Caddy as the reverse proxy
removes most certificate operations.

### cert-manager in Kubernetes

![Diagram: an Ingress with the cert-manager.io/cluster-issuer annotation leads cert-manager to create a Certificate with dnsNames and a secretName, then an Order and Challenge with a temporary HTTP-01 solver pod. The ACME CA validates and issues the signed chain, which cert-manager stores in the Secret taskflow-api-tls with tls.crt and tls.key. The ingress controller reads the Secret and terminates TLS for clients connecting over HTTPS to api.example.com. cert-manager renews at two thirds of the lifetime and updates the same Secret.](cert-manager-flow.svg)

cert-manager adds Kubernetes resources for certificates:

- **Issuer / ClusterIssuer:** how to obtain certificates (an ACME account
  with HTTP-01 or DNS-01 solvers, a private CA, Vault, or cloud CAs).
- **Certificate:** the desired certificate: names, Secret name, key
  algorithm, duration. It can be created explicitly or from an Ingress or
  Gateway annotation.
- **CertificateRequest, Order, Challenge:** the in-progress steps, useful
  when debugging (`kubectl describe` them).
- **Secret:** the result, holding `tls.crt` and `tls.key`, which the
  ingress controller or application mounts.

By default cert-manager renews when two-thirds of a certificate's lifetime
has passed (configurable with `renewBefore`), and it updates the Secret in
place, so ingress controllers that watch Secrets pick up the new
certificate without a restart. The Kubernetes side (Ingress, Gateway,
controllers) is covered in
[ingress, networking, and Helm](../kubernetes/ingress-networking-and-helm.md).

### Managed certificates at load balancers and CDNs

Cloud providers can own the whole lifecycle when TLS terminates on their
infrastructure:

- **AWS Certificate Manager (ACM)** issues public certificates at no
  charge for use with integrated services (Application and Network Load
  Balancers, CloudFront, API Gateway). With DNS validation, ACM renews
  them automatically while they are in use, keeping the same ARN.
  Certificates are regional, and CloudFront only uses certificates from
  `us-east-1`.
- **Google Cloud Certificate Manager**, **Azure** (App Service managed
  certificates, Front Door), and CDNs such as **Cloudflare** offer the
  same model.

The trade-off: you never touch a private key (good), but you can only use
those certificates on that provider's services, and renewal can still
fail if the DNS validation record is deleted or a name on the certificate
stops resolving, as the Bazel incident shows.

### Private CAs for internal services

Service-to-service traffic inside TaskFlow's network (the API calling an
internal reports service, mutual TLS between services) should not use
public certificates: internal names would be published in CT logs, public
CAs cannot validate internal names, and public lifetimes and rate limits
do not fit thousands of short-lived workloads. Use a **private CA**:

- **step-ca** (Smallstep), **HashiCorp Vault PKI**, **AWS Private CA**,
  **Google Cloud CA Service**, or cert-manager's CA issuer.
- A **service mesh** (Istio, Linkerd) runs its own CA and rotates workload
  certificates automatically, often every day.
- Distribute the private root to every client's trust store (for Node.js,
  `NODE_EXTRA_CA_CERTS`), protect its key offline, and issue from an
  intermediate.
- Keep lifetimes short (hours to days) and automate renewal, just as with
  public certificates.

### Why expirations still cause outages

Common causes, roughly in order of frequency:

1. **Renewal fails silently:** port 80 closed by a new firewall rule, an
   HTTP to HTTPS redirect that breaks the challenge path, an expired DNS
   API token, a name on the certificate that no longer resolves, a CAA
   record that does not list the CA, a CA rate limit hit after repeated
   failures.
2. **Renewal succeeds but the old certificate is still served:** no
   deploy hook to reload nginx, a Java keystore or appliance that needs a
   manual import, a copy of the certificate baked into a container image or
   another server.
3. **The certificate was never in the automation:** one manually issued
   certificate on a forgotten host, an internal service, a client
   certificate used for a partner integration, or a code-signing or
   push-notification certificate with its own expiry.
4. **Monitoring checks the wrong thing:** checking the file on disk, not
   the certificate served; probing one of several paths (IPv4 versus
   IPv6, one of several edge locations).
5. **Notification gaps:** relying on CA expiry emails. Let's Encrypt
   stopped sending expiration emails in June 2025, so any process that
   depended on them now depends on nothing.

![Diagram: two lifetimes on a 0 to 90 day axis. For a 90-day certificate (the Let's Encrypt default): valid with nothing to do until day 60, renewal starts at day 60 with 30 days left and the client retries, a ticket at day 69 with 21 days left, a page at day 83, and expiry at day 90. For a 45-day certificate (tlsserver profile, default planned from 2028): renewal starts at day 30 with 15 days left, a ticket at day 35 with 10 days left, a page at day 41, and expiry at day 45. Green is valid with nothing to do, orange the renewal window where the client retries, and red means a person must act.](renewal-timeline.svg)

### Monitoring expiry the right way

- **Measure the certificate actually served**, from outside, on every
  hostname and every path (IPv4 and IPv6, each region or edge, each load
  balancer listener). The Prometheus blackbox exporter exposes
  `probe_ssl_earliest_cert_expiry`; synthetic monitoring services offer
  the same.
- **Scale thresholds to the lifetime.** For 90-day certificates renewed
  at 30 days left: a ticket below 21 days (renewal has been failing for
  over a week) and a page below 7. For 45-day certificates renewed at 15
  days left: a ticket below 10 days and a page below 4.
- **Alert on renewal failures directly** where you can: failed certbot or
  cert-manager runs, `Certificate` resources not `Ready`.
- **Inventory every certificate**, including internal, client, and
  third-party ones, with an owner. Certificate Transparency monitoring
  finds public ones you forgot.

## When to use and when not to use

| Situation | Recommended approach |
|---|---|
| One or two VMs running TaskFlow behind a reverse proxy | Caddy, or nginx with certbot (`--nginx` or `--webroot`) and a deploy hook |
| Kubernetes cluster | cert-manager with an ACME ClusterIssuer; DNS-01 for wildcards |
| TLS terminates at a cloud load balancer or CDN | The provider's managed certificates (ACM, Google Certificate Manager, Cloudflare) |
| Wildcard for many tenant subdomains | DNS-01 (certbot DNS plugin, cert-manager DNS solver, or the provider) |
| Internal services and mutual TLS | Private CA or service mesh with short-lived certificates |
| Environments that cannot reach a public CA | Private CA, or DNS-01 run from a host that can |
| Testing your automation | The CA's staging environment (Let's Encrypt staging) to avoid production rate limits |

Avoid manually purchased certificates installed by hand unless something
truly prevents automation, and if you must, put them in the inventory with
calendar reminders and monitoring, as Tailscale did after its outage.

## Practical examples

### certbot with nginx

```bash
# Install certbot (snap is the method recommended by the certbot project)
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot

# Option 1: let certbot edit the nginx server block for api.example.com
sudo certbot --nginx -d api.example.com

# Option 2: keep nginx config under your control; certbot only writes challenge files
sudo certbot certonly --webroot -w /var/www/acme -d api.example.com \
  --deploy-hook "systemctl reload nginx"

# Prove renewal works end to end without issuing a real certificate
sudo certbot renew --dry-run

# Where renewal is scheduled, and what certbot manages
systemctl list-timers | grep -i certbot
sudo certbot certificates
```

```nginx
# /etc/nginx/conf.d/acme-challenge.conf (included in the port 80 server block)
location ^~ /.well-known/acme-challenge/ {
    root /var/www/acme;
    default_type "text/plain";
}
```

The `location` must take precedence over any HTTP to HTTPS redirect on
port 80 (or the redirect must keep the path), otherwise HTTP-01 validation
breaks. The deploy hook given at issuance is saved in the certificate's
renewal configuration under `/etc/letsencrypt/renewal/` and runs after
every successful renewal.

### A wildcard certificate with DNS-01 (Route 53)

```bash
sudo snap install certbot-dns-route53
sudo snap set certbot trust-plugin-with-root=ok
sudo snap connect certbot:plugin certbot-dns-route53

# Credentials come from the instance role or the standard AWS environment/profile;
# the IAM policy needs route53:ListHostedZones, route53:GetChange, and
# route53:ChangeResourceRecordSets on the hosted zone.
sudo certbot certonly --dns-route53 \
  -d example.com -d "*.example.com" \
  --deploy-hook "systemctl reload nginx"
```

`*.example.com` does not cover `example.com`, so both names are listed.

### Caddy as an automatic-HTTPS reverse proxy

```text
# Caddyfile
{
    email ops@example.com
}

api.example.com {
    reverse_proxy 127.0.0.1:3000
}

app.example.com {
    root * /srv/taskflow-web
    file_server
}
```

That is the whole TLS configuration: Caddy obtains certificates for both
names, redirects HTTP to HTTPS, and renews automatically. Persist its data
directory (in containers, mount a volume at `/data`) so certificates and
the ACME account survive restarts; losing it means re-issuing everything
on every restart and running into rate limits.

### cert-manager with Let's Encrypt

```yaml
# k8s/cluster-issuer.yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-staging
spec:
  acme:
    server: https://acme-staging-v02.api.letsencrypt.org/directory
    email: ops@example.com
    privateKeySecretRef:
      name: letsencrypt-staging-account-key
    solvers:
      - http01:
          ingress:
            ingressClassName: nginx   # your ingress controller's class
---
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ops@example.com
    privateKeySecretRef:
      name: letsencrypt-prod-account-key
    solvers:
      - http01:
          ingress:
            ingressClassName: nginx
```

```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: taskflow-api
  namespace: taskflow
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - api.example.com
      secretName: taskflow-api-tls   # cert-manager creates and renews this Secret
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: taskflow-api
                port:
                  number: 3000
```

```bash
# Watch issuance and debug failures
kubectl -n taskflow get certificate,certificaterequest,order,challenge
kubectl -n taskflow describe certificate taskflow-api-tls
```

Test a new setup against `letsencrypt-staging` first (its certificates are
not trusted by browsers, but its rate limits are far higher), then switch
the annotation to `letsencrypt-prod`.

### An explicit wildcard Certificate with a DNS-01 solver

```yaml
# k8s/wildcard-certificate.yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-dns
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ops@example.com
    privateKeySecretRef:
      name: letsencrypt-dns-account-key
    solvers:
      - dns01:
          route53:
            region: us-east-1   # credentials from the pod's cloud identity, not static keys
---
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: wildcard-example-com
  namespace: taskflow
spec:
  secretName: wildcard-example-com-tls
  dnsNames:
    - example.com
    - "*.example.com"
  privateKey:
    algorithm: ECDSA
    size: 256
  issuerRef:
    name: letsencrypt-dns
    kind: ClusterIssuer
```

### A managed certificate with AWS Certificate Manager (Terraform)

```hcl
# infra/certificate.tf
resource "aws_acm_certificate" "api" {
  domain_name       = "api.example.com"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "api_validation" {
  for_each = {
    for o in aws_acm_certificate.api.domain_validation_options : o.domain_name => o
  }

  zone_id = var.zone_id
  name    = each.value.resource_record_name
  type    = each.value.resource_record_type
  records = [each.value.resource_record_value]
  ttl     = 300
}

resource "aws_acm_certificate_validation" "api" {
  certificate_arn         = aws_acm_certificate.api.arn
  validation_record_fqdns = [for r in aws_route53_record.api_validation : r.fqdn]
}
```

The validation CNAME records must stay in DNS for ACM's automatic renewal
to keep working; deleting them during a DNS cleanup is a classic way to
break renewal months later. See
[Terraform in practice](../infrastructure-as-code/terraform-in-practice.md)
for managing this in code.

### A private CA issuer for internal services

```yaml
# k8s/internal-ca-issuer.yaml (cert-manager CA issuer; the CA key pair lives in a Secret)
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: internal-ca
spec:
  ca:
    secretName: internal-ca-key-pair   # tls.crt and tls.key of an internal intermediate CA
---
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: reports-internal
  namespace: taskflow
spec:
  secretName: reports-internal-tls
  duration: 72h
  renewBefore: 24h
  dnsNames:
    - reports.internal.example.com
  issuerRef:
    name: internal-ca
    kind: ClusterIssuer
```

Clients of the reports service trust the internal root (for example with
`NODE_EXTRA_CA_CERTS`), and three-day certificates make a leaked key
short-lived.

### Checking expiry from a script

```bash
#!/usr/bin/env bash
# scripts/check-cert-expiry.sh: fail if any served certificate expires within WARN_DAYS
set -euo pipefail
WARN_DAYS="${WARN_DAYS:-21}"
status=0

for host in api.example.com app.example.com; do
  cert="$(openssl s_client -connect "${host}:443" -servername "${host}" </dev/null 2>/dev/null)"
  end="$(printf '%s' "$cert" | openssl x509 -noout -enddate | cut -d= -f2)"
  if printf '%s' "$cert" | openssl x509 -noout -checkend $(( WARN_DAYS * 86400 )) >/dev/null; then
    echo "OK    ${host} expires ${end}"
  else
    echo "WARN  ${host} expires ${end} (within ${WARN_DAYS} days)" >&2
    status=1
  fi
done
exit "$status"
```

`openssl x509 -checkend N` exits non-zero if the certificate expires
within N seconds. Run a script like this from CI on a schedule as a cheap
second check, but rely on continuous probes (blackbox exporter or a
synthetic monitoring service) with alerts as the main defence; the alert
rule is shown in [alerting and on-call](../monitoring-and-logging/alerting-and-on-call.md).

### Renewal automation checklist

- Every certificate is issued and renewed by automation (ACME client,
  cert-manager, or a managed provider), and listed in an inventory with an
  owner.
- Renewal starts at about two-thirds of the lifetime and retries daily;
  the client supports ARI where available.
- A successful renewal reloads or redeploys every consumer (deploy hook,
  Secret watch, or managed attachment).
- The challenge path is protected: port 80 and the
  `/.well-known/acme-challenge/` path for HTTP-01, a scoped DNS token or
  delegated zone for DNS-01, validation records left in place for managed
  certificates.
- CAA records list every CA your automation and platforms use, and are
  checked with every hosting or CDN change.
- Changes to DNS, firewalls, redirects, and hosting trigger a review of
  certificate automation for the affected names.
- `certbot renew --dry-run` (or staging issuance) runs in CI or on a
  schedule.
- Served certificates are probed from outside on every hostname and path,
  with ticket and page thresholds scaled to the lifetime.
- Renewal failures alert directly, not only through the expiry check.
- ACME account keys and data directories are persisted and backed up.

## Best practices

- Automate everything; treat a manual certificate as an incident waiting
  to happen.
- Prefer HTTP-01 for simple public servers and DNS-01 for wildcards and
  internal names; scope DNS credentials tightly.
- Test against the CA's staging environment before production.
- Reload consumers after renewal, and verify the served certificate.
- Monitor every hostname and network path from outside; alert days left
  scaled to lifetime.
- Use managed certificates where TLS terminates at a cloud load balancer
  or CDN, and keep their validation records.
- Use a private CA or service mesh for internal traffic, with short
  lifetimes.
- Keep an inventory, including client certificates and certificates in
  third-party systems.
- Plan now for 100-day (2027) and 47-day (2029) maximums.

## In production

- **The site serves an expired certificate although certbot renewed it.**
  *Detect:* `openssl s_client` shows the old `notAfter`, while
  `certbot certificates` shows a fresh certificate. *Cause:* no deploy
  hook, so nginx never reloaded and keeps the old certificate in memory.
  *Fix:* add `--deploy-hook "systemctl reload nginx"` (or a script in
  `/etc/letsencrypt/renewal-hooks/deploy/`) and monitor the served
  certificate, not the file.
- **HTTP-01 renewal starts failing after a security hardening change.**
  *Detect:* `certbot renew` logs a connection or 404 error for
  `/.well-known/acme-challenge/`. *Cause:* port 80 was closed, or a new
  redirect rule sends the challenge path elsewhere. *Fix:* allow port 80
  for the challenge path (redirect everything else), or switch to DNS-01
  or TLS-ALPN-01.
- **cert-manager Certificate stuck at "Issuing" for hours.**
  *Detect:* `kubectl describe challenge` shows a failed self-check or a
  DNS propagation wait. *Cause:* the solver Ingress uses the wrong class,
  a network policy blocks the solver pod, or the DNS-01 credentials lack
  permission. *Fix:* fix the solver configuration, test with the staging
  issuer, and alert when Certificates are not Ready.
- **Too many certificates issued: rate limited.**
  *Detect:* the ACME error says a rate limit was hit, for example 5
  certificates for the same set of names in 7 days at Let's Encrypt.
  *Cause:* containers that request a new certificate on every start because
  their certificate storage is not persistent, or a retry loop. *Fix:*
  persist the ACME data directory or Secret, use staging for tests, and
  rely on renewal, not re-issuance.
- **A managed certificate silently stopped renewing.**
  *Detect:* the provider console shows renewal pending or failed; expiry
  approaches. *Cause:* a DNS cleanup deleted the validation CNAME, or one
  name on the certificate no longer resolves. *Fix:* restore the record or
  remove the dead name, and alert on the provider's renewal status as well
  as on days left.
- **One region serves an expired certificate while others are fine.**
  *Detect:* probes from one region or over IPv6 fail with
  `certificate has expired`. *Cause:* a separate server, proxy, or edge
  configuration with its own certificate outside the automation. *Fix:*
  probe every path separately and bring the outlier under the same
  automation.

## Important terminology

- **ACME:** The protocol for automated certificate issuance (RFC 8555).
- **ACME account key:** The key pair that identifies the client to the CA.
- **Order / authorization / challenge:** The request for a certificate, the
  proof needed per identifier, and the method used to prove it.
- **HTTP-01 / DNS-01 / TLS-ALPN-01:** Challenge types using a web file, a
  DNS TXT record, or a special TLS certificate.
- **Key authorization:** The challenge token joined to the account key
  thumbprint.
- **ARI:** ACME Renewal Information, the CA's suggested renewal window
  (RFC 9773).
- **Deploy hook:** A command run after a successful renewal.
- **ClusterIssuer / Certificate (cert-manager):** Resources describing how
  to obtain certificates and which certificate is wanted.
- **Managed certificate:** A certificate issued and renewed by a cloud
  provider for use on its services.
- **Private CA:** A CA you run for internal names, trusted only by your
  clients.
- **Staging environment:** A CA endpoint for testing that issues untrusted
  certificates with relaxed rate limits.

## Common mistakes and misconceptions

- Treating renewal as solved because "certbot is installed".
- Monitoring the certificate file instead of what clients receive.
- Relying on CA expiry emails (Let's Encrypt no longer sends them).
- Redirecting all of port 80 to HTTPS in a way that breaks HTTP-01.
- Storing a DNS API token with full zone access on every web server.
- Requesting new certificates on every container start without persistent
  storage, hitting rate limits.
- Using public certificates for internal hostnames, publishing them in CT
  logs.
- Deleting "unused" DNS validation records for managed certificates.
- Hard-coding a 60-day renewal interval that will break with 45-day
  certificates.

## Revision questions

1. Describe the ACME flow from account creation to installing a
   certificate.
2. When must you use DNS-01, and what are its security risks?
3. Why can a valid renewal still leave users with an expired certificate?
4. What does cert-manager create when you annotate an Ingress, and where
   does the certificate end up?
5. For a 45-day certificate renewed at two-thirds of its lifetime, on
   which day does renewal start, and how many days does a failing renewal
   have before expiry? (Day 30; 15 days.)
6. Why should internal services use a private CA rather than public
   certificates?
7. Your team has 60 certificates on 90-day lifetimes. How many renewals
   happen per year, and what changes when lifetimes drop to 47 days with
   renewal at two-thirds? (About 60 x 365 / 60 = 365 per year when renewed
   every 60 days; at roughly every 31 days it becomes about 700 per year.)
8. List four reasons certificate expiry still causes outages, and one
   control for each.

## Further learning

- [Let's Encrypt: Challenge types](https://letsencrypt.org/docs/challenge-types/)
- [Let's Encrypt: Rate limits](https://letsencrypt.org/docs/rate-limits/)
- [Let's Encrypt: Staging environment](https://letsencrypt.org/docs/staging-environment/)
- [Certbot documentation](https://eff-certbot.readthedocs.io/)
- [Caddy: Automatic HTTPS](https://caddyserver.com/docs/automatic-https)
- [cert-manager: ACME issuer](https://cert-manager.io/docs/configuration/acme/)
- [AWS Certificate Manager: Managed certificate renewal](https://docs.aws.amazon.com/acm/latest/userguide/managed-renewal.html)
- Next: [TLS termination and troubleshooting](tls-termination-and-troubleshooting.md).
  Back to the [SSL certificates overview](../ssl-certificates.md).
