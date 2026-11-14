# TLS Everywhere

Serve TaskFlow over HTTPS with a Let's Encrypt certificate that renews
itself, redirect all HTTP to HTTPS, add HSTS, alert before a certificate
can expire, and practice diagnosing a broken certificate chain with
`openssl s_client`.

## Why this project helps

- Builds working knowledge of certificates, ACME, renewal, and TLS
  termination, which every public service needs.
- Improves **security**: encrypted traffic everywhere, with HSTS preventing
  downgrade to plain HTTP.
- Improves **reliability**: expired certificates cause real outages, and
  automated renewal with alerts prevents them.
- "The site shows a certificate error for some users" is a common incident
  and interview scenario.

## What you need

- A server with a public IP and a domain pointing at it; see
  [Production Server from Scratch](production-server-from-scratch.md) and
  [Your Own Domain, Properly](your-own-domain-properly.md).
- Nginx with certbot, or Caddy (which handles certificates automatically).
- `openssl` and `curl` on your laptop; an uptime or monitoring tool for the
  expiry alert.

## How to do it

1. Read [TLS and certificate fundamentals](../ssl-certificates/tls-and-certificate-fundamentals.md)
   for chains, SNI, and ACME challenges.
2. Request a certificate against Let's Encrypt's staging environment first
   (certbot `--staging`, or Caddy's `acme_ca` setting), and switch to
   production once it works; see
   [obtaining and renewing certificates](../ssl-certificates/obtaining-and-renewing-certificates.md).
3. Configure Nginx (or Caddy) to terminate TLS for TaskFlow and redirect
   port 80 to HTTPS; see
   [TLS termination and troubleshooting](../ssl-certificates/tls-termination-and-troubleshooting.md).
4. Add a `Strict-Transport-Security` header, starting with a short
   `max-age` and raising it once everything works.
5. Prove renewal works with `certbot renew --dry-run` (Caddy renews on its
   own), and check that the renewal timer is active.
6. Add an expiry alert from your monitoring, because Let's Encrypt no longer
   sends expiry emails and certificate lifetimes are getting shorter.
7. Break the chain on purpose (serve only the leaf certificate without the
   intermediate) and diagnose it with `openssl s_client`, passing
   `-servername` for SNI and `-showcerts` to see what the server sends.
8. Fix the chain and confirm with `curl -v` and an online TLS checker.

## Done when

- `http://` requests redirect to `https://` with a permanent redirect.
- Responses carry an HSTS header.
- `certbot renew --dry-run` succeeds (or Caddy shows automatic renewal).
- An alert fires in a test when a certificate is within your warning window.
- You can explain the broken-chain error from the `openssl s_client` output
  and show the fix.

## Stretch goals

- Re-encrypt traffic from Nginx to the app on the internal hop.
- Require client certificates (mTLS) for an internal admin endpoint.
- Test with a certificate from a second ACME CA.

## Lessons to use

- [SSL Certificates](../ssl-certificates.md)
- [TLS and SSL](../../../01-networking-and-protocols/tls-and-ssl.md)
- [Reverse proxy](../../../07-servers-and-infrastructure/reverse-proxy.md)

Back to [all projects](../projects.md).
