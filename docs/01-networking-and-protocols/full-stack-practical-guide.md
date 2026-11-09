# Networking for Full Stack Developers

This guide prioritizes the networking knowledge used most often when building, deploying, securing, and troubleshooting web applications. The percentages are learning-priority estimates, not exam scores. A higher score means the topic is more likely to be useful across typical full stack roles.

## What to learn first

| Topic | Priority | Target depth |
|---|---:|---|
| [HTTP and HTTPS](http-and-https.md) | 98% | Learn deeply: requests, responses, methods, headers, status codes, cookies, caching, and browser behavior. |
| [DNS](dns.md) | 87% | Learn deeply: records, resolution, caching, and how to spot name-resolution failures. |
| [TLS](tls-and-ssl.md) | 87% | Learn deeply: certificates, hostname validation, trust, and common handshake failures. SSL is obsolete. |
| [TCP and UDP](tcp-and-udp.md) | 80% | Learn the connection, delivery, and latency tradeoffs that affect web traffic. |
| [Network Ports](network-ports.md) | 80% | Learn how clients, servers, firewalls, and containers use ports. |
| [IP Addressing](ip-addressing.md) | 72% | Understand addresses, routing, private ranges, and IPv4/IPv6 basics. |
| [Internet Fundamentals](internet-fundamentals.md) | 72% | Understand packets, routers, and how the network layers fit together. |
| [QUIC and HTTP/3](quic-and-http3.md) | 48% | Know that HTTP/3 uses QUIC over UDP and recognize it during performance troubleshooting. |
| [WebSockets](web-sockets.md) | 44% | Learn when an application needs a persistent, two-way connection. |
| [ICMP and Network Diagnostics](icmp.md) | 42% | Use basic diagnostic signals, while remembering that blocked ping does not prove a service is down. |
| [Ethernet and Wi-Fi](ethernet-and-wifi.md) | 33% | Know the basics; detailed local-network behavior is usually handled by the operating system or network team. |
| [DHCP](dhcp.md) | 27% | Understand that it provides network configuration to devices. |
| [SSH and SFTP](ssh-and-sftp.md) | 27% | Learn safe remote access and file transfer for server and deployment work. |
| [Email Protocols](email-protocols.md) | 27% | Learn the roles of SMTP and mailbox access protocols when integrating email. |
| [VPNs and Tunneling](vpn-and-tunneling.md) | 23% | Understand how private network access changes connectivity and routing. |
| [NTP and Time Synchronization](ntp-and-time-synchronization.md) | 20% | Know why accurate clocks matter for certificates, logs, and distributed systems. |
| [gRPC](grpc.md) | 18% | Learn when a system uses generated RPC APIs and streaming between services. |
| [ARP and IPv6 Neighbor Discovery](arp-and-neighbor-discovery.md) | 15% | Know their local-network role; study details when diagnosing lower-level connectivity. |
| [MQTT](mqtt.md) | 8% | Learn when working with IoT or lightweight publish/subscribe messaging. |

These estimates assume a typical web application role. Your project can change the priorities: for example, MQTT becomes central in an IoT product, and gRPC matters more in a service-oriented backend.

## Follow one browser request

For `https://api.example.com/products`, the path is roughly:

1. **DNS** resolves `api.example.com` to an IP address. A stale or incorrect record can send the client to the wrong destination or prevent it from finding one.
2. **IP routing** carries packets toward that address. Routers move packets between networks; the client does not need to know every hop.
3. **Transport** establishes communication. HTTP/1.1 and HTTP/2 commonly use TCP; HTTP/3 uses QUIC over UDP. The destination port identifies the service endpoint.
4. **TLS** authenticates the server name and protects the connection when HTTPS is used. Certificate or trust errors can stop the connection before the HTTP request is handled.
5. **HTTP** carries the request method, path, headers, and optional body. The server returns a status, headers, and optional response body.
6. **Application logic** interprets that response. An HTTP `200` means the HTTP request succeeded; it does not by itself prove the business result is correct.

A failure at one step does not establish that the next step is broken. For example, DNS can succeed while a firewall blocks the port, and TLS can succeed while the application returns an error.

## Troubleshooting practice

For each case, identify the likely layer and the next useful check before changing code.

| Symptom | Likely area | Useful next check |
|---|---|---|
| A site works by IP address but not by name | DNS | Check the hostname's resolution and the intended DNS record. |
| The browser reports a certificate or secure-connection warning | TLS | Check expiry, hostname match, certificate chain, and system clock. |
| `curl` reports connection refused | Destination host or port | Confirm the service is running and listening on the expected interface and port; inspect firewall rules. |
| The request connects but returns `404` | HTTP or application routing | Inspect the URL path, method, proxy routing, and server route. |
| The API returns `500` | Server application | Inspect server logs and trace the failing operation; connectivity may already be working. |
| `ping` fails but the website loads | ICMP filtering or policy | Test the actual service with an HTTP request; ping is not required for HTTPS. |
| A WebSocket connects locally but fails in production | Proxy, TLS, or WebSocket configuration | Check `wss`, upgrade handling, proxy timeouts, and load-balancer settings. |

Useful tools include browser DevTools Network panel, `curl -v https://host/path` for HTTP/TLS details, `nslookup` or `dig` for DNS, `ping` for ICMP reachability when allowed, and `traceroute`/`tracert` for an approximate route. Tool output is evidence about one layer, not a guarantee that the whole application works.

## Compare similar technologies

| Compare | Practical distinction |
|---|---|
| HTTP vs HTTPS | HTTPS is HTTP protected by TLS. Use HTTPS for web traffic that needs confidentiality and server authentication. |
| TCP vs UDP | TCP provides an ordered byte stream; UDP sends datagrams without TCP's delivery guarantees. Applications choose based on their needs. |
| TLS vs SSH | TLS commonly protects web and other application connections; SSH provides secure remote login and related server administration functions. |
| HTTP polling vs WebSockets | Polling repeats requests; WebSockets keep a connection open for two-way messages when the application needs ongoing updates. |
| HTTP/2 vs HTTP/3 | HTTP/2 commonly runs over TCP; HTTP/3 runs over QUIC, which uses UDP. Both carry HTTP semantics. |
| gRPC vs a typical JSON REST API | gRPC uses defined service methods and generated clients, often for service-to-service communication; JSON REST APIs are broadly convenient for browser-facing APIs. |

## Short glossary

- **IP address:** A network-layer address used to route packets to a destination.
- **Port:** A number that identifies a transport endpoint on a host, such as a web server listener.
- **DNS:** A distributed naming system that maps domain names to records such as IP addresses.
- **Handshake:** Initial messages used to establish connection parameters or identity before normal data exchange.
- **Certificate:** A digitally signed binding between an identity, such as a hostname, and a public key.
- **Proxy:** An intermediary that receives and forwards requests, often for routing, caching, filtering, or TLS handling.
- **Latency:** The time taken for data to travel between endpoints and for a response to return.
- **Status code:** An HTTP response code describing the broad result of a request, such as success, redirection, or error.

## Suggested study order

1. Learn [Internet Fundamentals](internet-fundamentals.md), [IP Addressing](ip-addressing.md), and [Network Ports](network-ports.md).
2. Learn [DNS](dns.md), [TCP and UDP](tcp-and-udp.md), [TLS](tls-and-ssl.md), and [HTTP and HTTPS](http-and-https.md) well enough to explain a complete request.
3. Practice the troubleshooting cases above with a local app and browser DevTools or command-line tools.
4. Study WebSockets, HTTP/3, SSH, email, VPNs, and time synchronization when your application or deployment uses them.
5. Study gRPC, MQTT, and lower-level local-network details when your system architecture calls for them.
