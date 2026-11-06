# VPNs and Tunneling

## Introduction

A Virtual Private Network (VPN) creates a logical tunnel across an underlying
network. VPN technologies can authenticate endpoints and protect traffic
between a device and a VPN gateway, or between two networks. IPsec,
WireGuard, and OpenVPN are examples of VPN technologies with different
designs and deployment models.

## Why does it exist?

Organizations need to connect remote users or separate offices to internal
services over networks they do not fully control. A VPN can provide an
authenticated, protected path to a private network without making every
internal service directly public.

## How does it work?

1. A VPN client establishes a tunnel to a configured VPN gateway or peer.
2. The endpoints authenticate and negotiate or use configured cryptographic
   keys.
3. The sender places inner network traffic inside an outer tunnel packet.
4. The tunnel protects the traffic across the underlying network according
   to its configuration.
5. The receiving endpoint removes the tunnel wrapper and forwards the inner
   traffic according to its routing and access policy.

Some VPNs route only selected traffic (split tunneling); others route most
or all device traffic through the tunnel. A site-to-site VPN connects
networks, while a remote-access VPN connects a user's device to an
organization's network.

| Type | Typical purpose | Example |
|---|---|---|
| Remote access | Connect an authorized user device to an organization | An employee reaches an internal development or finance service |
| Site-to-site | Connect two controlled networks | A branch office reaches approved services at a data center |
| Consumer privacy VPN | Route traffic through a provider's gateway | A user changes the network path visible to public services |

These are different use cases. A VPN does not make an untrusted VPN provider
trustworthy, and it does not automatically provide end-to-end encryption
between an application and its service. HTTPS/TLS is still valuable inside a
VPN.

## Real-world example

A bank employee may use an organization-managed VPN to reach restricted
administrative systems. Customers using the bank's public website commonly
connect through HTTPS without needing that employee VPN. Government agencies
and cloud teams may use site-to-site tunnels for controlled service
connectivity.

## Developer perspective

Developers may encounter VPNs when accessing development environments,
private databases, or company source-control services. A VPN can change
routes, DNS resolvers, and the apparent source address, so connection
problems may differ between on-VPN and off-VPN use. Follow organizational
policy; do not expose private services as a workaround for a VPN issue.

## Practical example

Check the VPN provider's documented client and connection status, then
compare the device's routes and DNS settings before and after connecting.
On Windows, `route print` displays routes; on Linux, `ip route` does. These
commands inspect local configuration and do not test whether an internal
service grants access.

## Important terminology

- **Tunnel:** encapsulated traffic carried through another network.
- **VPN gateway:** endpoint that terminates or forwards VPN traffic.
- **Remote-access VPN:** tunnel between a user device and an organization.
- **Site-to-site VPN:** tunnel connecting networks through their gateways.
- **Split tunneling:** sending only selected traffic through the VPN.
- **Encapsulation:** wrapping one protocol's packet inside another for
  transport.

## Advantages and disadvantages

VPNs can protect traffic to a trusted gateway and provide controlled access
to private networks. They add configuration and operational complexity, can
change routing and name resolution, and do not remove the need for
application-level authentication and TLS.

## Common misconceptions

- A VPN does not make every website connection end-to-end encrypted; HTTPS
  remains important.
- A VPN hides some network-path information from local observers but moves
  trust to the VPN operator and endpoint.
- Connecting to a VPN does not automatically authorize access to every
  internal service.
- A VPN is not a substitute for application authentication, authorization,
  or a firewall.

## Further learning

- [RFC 4301: Security Architecture for the Internet Protocol](https://www.rfc-editor.org/rfc/rfc4301)
- [WireGuard: Conceptual Overview](https://www.wireguard.com/)
- [OpenVPN Documentation](https://openvpn.net/community-resources/)
