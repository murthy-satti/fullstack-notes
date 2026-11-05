# Reverse Proxy

## Introduction

A reverse proxy accepts client requests and forwards them to backend services. To a visitor, it appears to be the site's server, though the application may run elsewhere.

## Why does it exist?

A reverse proxy provides a front door for application servers. It can route by hostname or path, terminate HTTPS, serve static files, and distribute traffic. With suitable network rules, it can keep backends off the public network.

## How does it work?

The proxy evaluates routing rules, forwards a request to an upstream, then returns its response. It may add headers such as `X-Forwarded-For`. Applications should trust these only from known proxies; a client could otherwise forge them.

## Real-world example

Route `example.com/api/` to an API and `example.com/` to a frontend. Both can stay private while the proxy exposes intended routes.

## Developer perspective

When debugging, identify whether a response came from the proxy or application. Check path rewriting, forwarded headers, TLS settings, and timeouts. See [Nginx](nginx.md) and [load balancing](load-balancing.md).

## Practical example

Configure a development proxy to forward `/api/` to a local API. Compare proxied and direct requests to identify routing problems.

## Important terminology

- **Client:** program or user making the request.
- **Upstream/backend:** service receiving a forwarded request.
- **Forwarded header:** metadata about the original client or connection.
- **TLS termination:** ending the encrypted connection at the proxy.
- **Path rewriting:** changing a URI before forwarding it.

## Advantages and disadvantages

A reverse proxy centralizes routing and can simplify TLS and traffic management. It adds a network hop and can become a bottleneck or single point of failure.

## Common misconceptions

A reverse proxy is not automatically a firewall or authentication system. Backends still need access controls and secure application logic.

## Revision questions

1. What is the reverse proxy's role between client and backend?
2. Why should applications trust forwarded headers only from known proxies?
3. Name a setting that can cause proxy and application behavior to differ.

## Further Learning & References

- **Official Nginx documentation:** [Reverse proxy module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html) explains proxying requests and related directives.
- **Official Cloudflare learning resource:** [What is a reverse proxy?](https://www.cloudflare.com/learning/cdn/glossary/reverse-proxy/) gives a visual overview and compares proxy roles.
