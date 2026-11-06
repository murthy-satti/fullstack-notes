# ARP and IPv6 Neighbor Discovery

## Introduction

Address Resolution Protocol (ARP) helps an IPv4 device find the local
link-layer address associated with an IPv4 address on its local network.
IPv6 uses Neighbor Discovery Protocol (NDP), which is part of ICMPv6, for
neighbor and router discovery.

IP addresses guide packets between networks. Ethernet and Wi-Fi frames need
link-layer destination addresses for delivery on the current local link.
ARP and NDP connect those two jobs.

## Why do they exist?

A device may know the IP address of its default gateway but still need the
gateway's local MAC address to send the next frame. Address resolution lets
the device deliver an IP packet to the correct next hop without requiring
applications to know local hardware addresses.

## How does it work?

### IPv4 ARP

1. A device checks its ARP cache for a recent IP-to-MAC mapping.
2. If there is no usable mapping and the destination is local, it broadcasts
   an ARP request on the local network: "Who has this IPv4 address?"
3. The device using that IPv4 address replies with its MAC address.
4. The sender stores the mapping temporarily and sends the IP packet inside
   a frame addressed to that MAC address.

If the destination IP is outside the local subnet, the sender resolves the
MAC address of its gateway, not the remote server's MAC address. Routers
forward packets one link at a time; the remote server is not on the sender's
local Ethernet or Wi-Fi link.

### IPv6 Neighbor Discovery

IPv6 does not use ARP. NDP uses ICMPv6 messages and multicast on the local
link to discover neighbors and routers. It also supports functions such as
address reachability checks and duplicate address detection. IPv6 uses
Neighbor Solicitation and Neighbor Advertisement messages for address
resolution.

| Feature | IPv4 ARP | IPv6 Neighbor Discovery |
|---|---|---|
| Network protocol | IPv4-related link operation | ICMPv6 |
| Discovery method | Local broadcast request and reply | Multicast solicitation and advertisement |
| Additional roles | Address-to-link mapping | Router discovery, reachability checks, and other local-link functions |

Both use caches to avoid repeating resolution for every packet. Entries can
expire or change as devices and network configurations change.

## Real-world example

When a laptop opens an online banking site, it resolves the site's name with
DNS and determines the destination is outside the home subnet. Before
sending the first IP packet, it uses ARP (or IPv6 NDP) to find the local
router's link-layer address. The bank's server MAC address is not discovered
directly by the laptop.

## Developer perspective

Application developers rarely send ARP or NDP messages themselves. These
protocols matter when diagnosing local-network failures, IP conflicts, stale
neighbor entries, or problems reaching a gateway. A failure at this layer
can prevent DNS and web requests from working even when the browser is
configured correctly.

## Practical example

On Windows, `arp -a` displays IPv4 ARP cache entries. On Linux,
`ip neigh` displays neighbor-cache information for IPv4 and IPv6. Output
depends on recent local traffic and is not a list of every device on the
Internet.

## Important terminology

- **Address resolution:** finding a local link-layer address for an IP
  neighbor.
- **ARP cache:** temporary IPv4-to-MAC mappings maintained by a device.
- **Neighbor cache:** IPv6 neighbor information maintained by a device.
- **Default gateway:** the router used to reach destinations outside the
  local subnet.
- **Neighbor Solicitation/Advertisement:** ICMPv6 messages used by NDP.

## Advantages and disadvantages

Local resolution enables IP to run over local link technologies without
applications managing hardware addresses. Because devices accept local
network information, network operators should use appropriate link security
and monitoring; ARP and NDP are not cryptographic proof of a user's identity.

## Common misconceptions

- A laptop normally resolves the gateway's MAC address for a remote website,
  not the website server's MAC address.
- ARP is for IPv4; IPv6 uses NDP.
- A MAC address is not routed end-to-end across the Internet.
- A cached neighbor entry can become stale and is not proof that the
  neighbor is currently reachable.

## Further learning

- [RFC 826: An Ethernet Address Resolution Protocol](https://www.rfc-editor.org/rfc/rfc826)
- [RFC 4861: Neighbor Discovery for IP version 6](https://www.rfc-editor.org/rfc/rfc4861)
- [RFC 4862: IPv6 Stateless Address Autoconfiguration](https://www.rfc-editor.org/rfc/rfc4862)
