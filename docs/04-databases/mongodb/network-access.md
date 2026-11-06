# Atlas Network Access and IP Allowlisting

An Atlas project IP access list restricts which client source addresses can connect to its database deployments. Add the public egress IP used by the application or workstation, or a carefully controlled CIDR range. Private networking options such as VPC/VNet peering and private endpoints may be preferable for production environments.

Atlas requires both network permission and a valid database user. An allowed IP without credentials cannot authenticate; valid credentials from an unlisted IP cannot connect. Home and office public addresses can change, causing previously working clients to fail. Some access-list entries can be temporary for short-lived administration.

Do not add 0.0.0.0/0 for convenience. It allows connection attempts from anywhere and increases exposure. Use the narrowest viable range, strong authentication, TLS, and least-privilege roles. Removing an entry may not close already established sessions immediately.

Client firewalls may also need documented outbound TCP access to Atlas hosts and ports. Check DNS/SRV resolution, outbound routing, TLS verification, Atlas allowlist entries, database credentials, then roles when diagnosing a connection failure. See [Atlas IP access lists](https://www.mongodb.com/docs/atlas/security/ip-access-list/) and [Atlas connection requirements](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/).
