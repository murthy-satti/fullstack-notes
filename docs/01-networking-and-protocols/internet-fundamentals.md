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

Applications split information into packets. Each packet carries addressing
information so routers can forward it toward its destination. The route may
vary, and routers do not need a map of the entire Internet. IP provides
addressing and forwarding; transport protocols such as TCP or UDP support
communication between applications. Application protocols define what the
communicating programs say to each other.

When opening a site, a browser commonly uses [DNS](dns.md) to find an IP
address, establishes a transport exchange using [TCP or UDP](tcp-and-udp.md),
then sends [HTTP](http-and-https.md) messages. [TLS](tls-and-ssl.md) can
protect those messages. The layers cooperate, rather than one protocol doing
every job.

## Real-world example

When you load a news page on Wi-Fi, your laptop sends data to the access point.
Your router forwards it to your ISP, and routers along the route carry packets
toward the site's network. The server sends a response back; it need not take
the exact same route.

## Developer perspective

Knowing the layers helps narrow down failures. A correct URL does not prove
DNS works; a resolved address does not prove the server accepts connections;
and an open connection does not prove the application returned the expected
content. Each stage has its own diagnostic evidence.

## Practical example

On Linux or macOS, `ping -c 4 example.com` sends four diagnostic echo requests
and reports responses when the destination and network allow them. No reply
does not prove that a server is offline: networks often filter ping. Use
`traceroute example.com` (or `tracepath example.com` on some Linux systems) to
inspect a route where the tool is installed; intermediate routers may also
hide replies.

## Important terminology

- **Packet:** a formatted unit of network data.
- **Router:** a device that forwards packets between networks.
- **Protocol:** agreed rules for communication.
- **Client/server:** roles in which a client requests a service and a server
  provides it.

## Advantages and disadvantages

Interconnection enables global services and lets networks evolve independently.
It also means communication depends on many separately managed links and
systems; failures, congestion, and policy restrictions can affect a path.

## Common misconceptions

- The Internet and the Web are not synonyms: the Web is an Internet service.
- Packets do not necessarily follow one fixed route.
- An IP address identifies a network endpoint at a particular time; it does
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
