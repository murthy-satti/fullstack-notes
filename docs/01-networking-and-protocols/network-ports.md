# Network Ports

## Introduction

A network port is a number that helps deliver transport traffic to an
application endpoint. An IP address identifies a destination; a port
distinguishes services sharing that address. TCP and UDP have separate port
spaces.

## Why does it exist?

A server can provide several services at one address, and one computer can
run many clients. Ports help route data to the right socket.

## How does it work?

TCP and UDP headers include source and destination ports. Servers may listen
on known ports; clients usually receive a temporary (ephemeral) source port.
A socket combines an address, transport protocol, and port.

The ranges are system ports `0–1023`, user ports `1024–49151`, and
dynamic/private ports `49152–65535`. Registration does not force software to
use a port, and an open port does not prove a service is safe.

## Real-world example

A browser connects to TCP port 443 for HTTPS, typically using a temporary
local source port. Replies return to the browser's socket.

## Developer perspective

Services bind to a local address and port; firewalls may control access. A
service bound only to loopback is available locally, not directly to other
machines. Do not assume a client's ephemeral port.

## Practical example

On Linux, `ss -tuln` lists listening TCP and UDP sockets without changing
configuration. External reachability also depends on firewalls and routing.

## Important terminology

- **Listening:** waiting for incoming connections or datagrams.
- **Ephemeral port:** temporary port commonly selected for a client.
- **Socket:** operating-system communication endpoint.
- **Port range:** group of numbers reserved or assigned for use.

## Advantages and disadvantages

Ports let services share addresses. Misconfigured listeners can expose
services; port numbers provide no authentication or encryption.

## Common misconceptions

- A port is not a physical connector, and port 443 alone does not guarantee
  correct TLS or distinguish application shutdown from firewall blocking.

## Revision questions

1. How does a port complement an IP address?
2. Why does a client usually use an ephemeral port?
3. What does a listening socket report fail to tell you about reachability?

## Further Learning & References

- **Official standard — RFC Editor:** [RFC 6335, Internet Assigned Numbers
  Authority (IANA) Procedures for the Management of the Service Name and
  Transport Protocol Port Number Registry](https://www.rfc-editor.org/rfc/rfc6335)
  describes port-number ranges and registration procedures.
- **Third-party explanation — MDN:** [Port](https://developer.mozilla.org/en-US/docs/Glossary/Port)
  introduces network ports and their role in communication.
