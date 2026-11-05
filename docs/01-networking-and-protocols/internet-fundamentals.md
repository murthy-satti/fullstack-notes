# Internet Fundamentals

## Introduction

The Internet is a global network of independently operated networks. Your
phone, home router, an Internet service provider (ISP), and a web server may
all belong to different networks, yet they can exchange data using shared
protocols.

## Why does it exist?

Networking lets devices share information and services without requiring one
central computer. The Internet grew from interconnected networks; the Web is
one service that uses it, alongside email, voice calls, games, and file
transfer.

## How does it work?

Applications split information into packets. Routers use addressing
information to forward each packet toward its destination; packets may take
different routes. IP handles addressing and forwarding, transport protocols
such as TCP or UDP carry application data, and application protocols define
what programs say to each other.

When opening a site, a browser commonly uses [DNS](dns.md) to find an IP
address, then sends [HTTP](http-and-https.md) over a transport such as
[TCP](tcp-and-udp.md). [TLS](tls-and-ssl.md) can protect the exchange.

## Real-world example

Loading a news page sends packets from your device through a Wi-Fi access
point, router, and ISP toward the site's network. The response may use another
route.

## Developer perspective

Knowing the layers helps narrow down failures: a resolved address does not
prove the server accepts connections, and an open connection does not prove
the application returned the expected content.

## Practical example

On Linux or macOS, `ping -c 4 example.com` sends four diagnostic echo requests.
No reply does not prove a server is offline; networks often filter ping.
`traceroute example.com` (or Linux `tracepath`) can inspect a route, though
routers may hide replies.

## Important terminology

- **Packet:** a formatted unit of network data.
- **Router:** device that forwards packets between networks.
- **Protocol:** agreed rules for communication.
- **Client/server:** roles in which a client requests a service and a server
  provides it.

## Advantages and disadvantages

Interconnection enables global services and independently managed networks,
but failures, congestion, or policy restrictions along a path can disrupt
communication.

## Common misconceptions

- The Internet and the Web are not synonyms: the Web is an Internet service.
- Packets do not necessarily follow one fixed route, and an IP address does
  not reliably identify a person.

## Revision questions

1. What is the difference between the Internet and the Web?
2. Which job does a router perform?
3. Why might `ping` fail even if a website works?

## Further Learning & References

- **Official standard — RFC Editor:** [RFC 1122, Requirements for Internet
  Hosts](https://www.rfc-editor.org/rfc/rfc1122) describes core Internet
  communication requirements.
- **Third-party explanation — MDN:** [How the Web
  works](https://developer.mozilla.org/en-US/docs/Learn/Getting_started_with_the_web/How_the_Web_works)
  walks through a browser request and response in accessible language.
