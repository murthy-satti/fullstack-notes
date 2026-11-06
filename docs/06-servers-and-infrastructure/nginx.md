# Nginx

## Introduction

Nginx (pronounced “engine-x”) is web-server software used to serve files and handle HTTP traffic. It can also act as a reverse proxy, TLS endpoint, or load balancer.

## Why does it exist?

Web applications need to accept requests, serve static content, and route requests to application processes. Nginx can sit in front of an application server, separating public traffic entry from application execution.

## How does it work?

Nginx reads configuration blocks describing listeners, hostnames, and actions. A `server` block can match a hostname; a `location` block serves a file or proxies to an upstream application. Configuration changes should be syntax-tested before reload.

## Real-world example

A Node.js app listens on a private port while Nginx listens on port 443. Nginx serves `/assets/` and forwards `/api/` to the app.

## Developer perspective

Included files can affect the effective configuration. Restrict public access to upstream applications when appropriate, preserve needed headers, and configure timeouts. Related: [reverse proxies](reverse-proxy.md) and [load balancing](load-balancing.md).

## Practical example

Configure a development host to proxy an API path to a local service. Run `nginx -t` before reloading. If it fails, inspect the error log and confirm the upstream is listening.

## Important terminology

- **Directive:** a configuration instruction.
- **Server block:** virtual host configuration for a listener and host.
- **Location:** rule matching a request URI.
- **Upstream:** one or more proxy backend servers.
- **TLS termination:** decrypting HTTPS at a front-end component.

## Advantages and disadvantages

Nginx is flexible, widely deployed, and can efficiently serve static files or proxy traffic. Its configuration language has details that take time to learn; mistakes in headers, paths, or access rules can cause outages or expose unintended content.

## Common misconceptions

Nginx is not a programming language or a replacement for an application's business logic. It can be a web server and proxy at once, but those roles are distinct and independently configured.

## Further Learning & References

- **Official Nginx documentation:** [Beginner’s Guide](https://nginx.org/en/docs/beginners_guide.html) introduces configuration structure and common tasks.
- **Official Nginx documentation:** [Reverse proxy module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html) documents proxy directives and behavior.
