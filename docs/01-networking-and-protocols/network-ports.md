# Network Ports

## Introduction

A network port is a number that helps a computer deliver incoming transport
traffic to the right application endpoint. An IP address identifies a network
interface or destination; the port helps distinguish services that share
that address. TCP and UDP each have their own port space.

## Why does it exist?

A server can provide several services at one IP address, and one computer can
run many client applications at once. Port numbers give transport protocols
a way to route data to the appropriate socket and help identify a conversation.

## How does it work?

TCP and UDP headers include source and destination port numbers. A server
application may listen on a known port, while clients usually receive a
temporary (ephemeral) source port. A socket is commonly described using an
address, transport protocol, and port; real operating systems track additional
details as well.

The familiar ranges are system ports `0–1023`, user ports `1024–49151`, and
dynamic/private ports `49152–65535`. These ranges are used for registration
and assignment guidance, not a complete security boundary. A port being
registered does not force software to use it, and an open port does not prove
that a service is safe.

## Real-world example

A browser connects to a web server's TCP port 443 for HTTPS. The browser may
use a temporary local source port. Replies addressed to that connection are
delivered back to the browser's socket.

## Developer perspective

Services must bind to an appropriate local address and port, and firewalls or
network rules may control access. A service bound only to loopback is
available to local programs but usually not directly to other machines.
Avoid hard-coding assumptions about a client's ephemeral port.

## Practical example

On Linux, `ss -tuln` lists listening TCP and UDP sockets numerically without
changing configuration. `ss -ltn` focuses on TCP listeners. Whether a port is
reachable from outside also depends on firewalls, routing, and address
translation.

## Important terminology

- **Listening:** waiting for incoming connections or datagrams.
- **Ephemeral port:** temporary port commonly selected for a client.
- **Socket:** operating-system communication endpoint.
- **Port range:** group of numbers reserved or assigned for use.

## Advantages and disadvantages

Ports allow many services and conversations to share network addresses.
Misconfigured listeners can expose unwanted services, and port numbers alone
do not provide authentication or encryption.

## Common misconceptions

- A port is not a physical connector or a separate IP address.
- Port 443 does not guarantee that the traffic is correctly secured with TLS.
- Closing a port in an application and blocking it in a firewall are
  different controls.

## Revision questions

1. How does a port complement an IP address?
2. Why does a client usually use an ephemeral port?
3. What does a listening socket report fail to tell you about reachability?

## Further Learning & References

- **Official standard — RFC Editor:** [RFC 6335, Internet Assigned Numbers
  Authority (IANA) Procedures for the Management of the Service Name and
  Transport Protocol Port Number Registry](https://www.rfc-editor.org/rfc/rfc6335)
  describes port-number ranges and registration procedures.
- **Third-party explanation — Cloudflare Learning Center:** [What is a
  port?](https://www.cloudflare.com/learning/network-layer/what-is-a-computer-port/)
  gives an introductory explanation of ports and common uses.
