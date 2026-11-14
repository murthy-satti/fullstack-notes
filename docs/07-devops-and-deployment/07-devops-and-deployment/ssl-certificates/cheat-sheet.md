# SSL Certificates Cheat Sheet

Quick revision of the SSL certificates lessons, for a last look before an
interview or a certificate task.

## Key commands

| Command | What it does |
|---|---|
| `openssl s_client -connect api.example.com:443 -servername api.example.com -showcerts </dev/null` | Shows the chain the server really sends (always pass SNI) |
| `openssl s_client -connect api.example.com:443 -servername api.example.com -tls1_2 </dev/null` | Tests whether TLS 1.2 is accepted |
| `openssl x509 -in fullchain.pem -noout -subject -issuer -dates -ext subjectAltName` | Names, issuer, and validity of the first (leaf) certificate |
| `openssl verify -CAfile root.pem -untrusted intermediate.pem leaf.pem` | Checks that the leaf chains up to the root |
| `curl -v --resolve api.example.com:443:203.0.113.10 https://api.example.com/healthz` | Tests one server directly, without changing DNS |
| `sudo certbot certonly --webroot -w /var/www/acme -d api.example.com --deploy-hook "systemctl reload nginx"` | HTTP-01 issuance; the hook reloads nginx after every renewal |
| `sudo certbot renew --dry-run` | Proves renewal works end to end without a real certificate |
| `sudo certbot certificates` | Lists the certificates certbot manages and their expiry |
| `sudo nginx -t && sudo systemctl reload nginx` | Validates the config, including the key match, before reloading |
| `kubectl -n taskflow describe certificate taskflow-api-tls` | cert-manager status and events for one certificate |

```bash
# Does this private key belong to this certificate? The two hashes must match.
openssl x509 -in leaf.pem -noout -pubkey | openssl sha256
openssl pkey -in privkey.pem -pubout | openssl sha256
```

## Key configuration

```nginx
# /etc/nginx/conf.d/api.example.com.conf (excerpt): TLS termination with HSTS
server {
    listen 443 ssl;
    http2 on;
    server_name api.example.com;

    ssl_certificate     /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # Start with a small max-age, then raise it to two years
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
}
```

## Decision guide

| If you need | Choose | Why |
|---|---|---|
| HTTPS on one server | certbot with webroot and a deploy hook, or Caddy | Free ACME certificates with automatic renewal |
| A wildcard certificate | DNS-01, for example certbot-dns-route53 | Wildcards need DNS validation |
| TLS on a cloud load balancer or CDN | The provider's managed certificates | The platform renews and deploys them |
| Kubernetes ingress | cert-manager with an ACME issuer | Certificates as resources, renewed automatically |
| Internal service names | A private CA (step-ca, Vault PKI, a cloud private CA) | Public CAs cannot validate internal names |
| Service-to-service identity | mTLS with short-lived certificates or a mesh | Proves who is calling; authorization stays separate |
| Testing automation | Let's Encrypt staging | Avoids production rate limits |
| HTTPS from a CDN to the origin | Full (strict) or an equivalent verify mode | Plain "Full" accepts any certificate |

## Numbers and defaults to remember

| Item | Value |
|---|---|
| Public maximum validity (SC-081v3) | 398 days, then 200 from March 15, 2026, 100 from March 15, 2027, 47 from March 15, 2029 |
| Domain validation reuse | 200 days, then 100 days, then 10 days (2029) |
| Let's Encrypt lifetimes | 90 days by default; 64 days from February 10, 2027; 45 days from February 16, 2028 |
| Let's Encrypt options | Opt-in 45-day `tlsserver` profile since May 2026; optional 6-day certificates |
| certbot renewal | Runs twice a day; renews with a third of the lifetime left (30 of 90 days); follows ARI since 4.1 |
| Alert thresholds | 90-day certificates: ticket below 21 days, page below 7; 45-day: below 10 and 4 |
| Let's Encrypt rate limit | 5 certificates for the same set of names in 7 days |
| HSTS `max-age` | Seconds; 63,072,000 is two years; roll out with a small value such as 300 |
| OCSP | Let's Encrypt removed OCSP URLs and ended OCSP in 2025; stapling does nothing for its certificates |
| Renewal pace at 47 days | About once a month when renewing at two-thirds of the lifetime |

## Top mistakes

- **Serving `cert.pem` instead of `fullchain.pem`.** Browsers may cope, but
  curl, Java, and mobile clients report an unknown issuer; serve the chain.
- **Renewing without reloading.** nginx keeps the old certificate in
  memory; add a deploy hook such as `systemctl reload nginx`.
- **Redirecting the ACME path to HTTPS.** Let
  `/.well-known/acme-challenge/` win on port 80, or HTTP-01 fails.
- **A CAA record that omits your CA.** Issuance fails even though the
  challenge passes; list every CA your automation and platforms use.
- **Hard-coded renewal intervals.** A 60-day timer breaks with 45-day
  certificates; renew by remaining lifetime or ARI.
- **Watching files instead of served certificates.** Probe every hostname
  and listener from outside, for example `probe_ssl_earliest_cert_expiry`.
- **Requesting a new certificate on every container start.** Persist the
  ACME storage, or rate limits stop issuance.
- **Re-encrypting without verifying.** nginx defaults to
  `proxy_ssl_verify off`; turn it on, and use Full (strict) at CDNs.

## Where to go deeper

- [TLS and certificate fundamentals](tls-and-certificate-fundamentals.md)
- [Obtaining and renewing certificates](obtaining-and-renewing-certificates.md)
- [TLS termination and troubleshooting](tls-termination-and-troubleshooting.md)
- [SSL certificates interview questions and answers](interview-questions-and-answers.md)

Back to the [SSL certificates overview](../ssl-certificates.md).
