# SSH and SFTP

## Introduction

Secure Shell (SSH) is a protocol for authenticated, encrypted communication
with a remote system. It is commonly used for command-line administration
and secure tunneling. SFTP is a file-transfer protocol that runs over an
SSH connection; it is not the same protocol as FTP.

## Why do they exist?

Administrators and automated deployment systems need to manage remote
servers without sending credentials and commands as readable network data.
SSH provides a protected channel and supports multiple authentication
methods. SFTP reuses that channel for file operations.

## How does it work?

1. A client connects to an SSH server, commonly on TCP port 22.
2. The endpoints negotiate algorithms and establish an encrypted session.
3. The client verifies the server's host key against its trust information,
   such as a known-hosts entry.
4. The client authenticates as a user, often with a public/private key pair
   or another configured method.
5. The authenticated connection can carry an interactive shell, commands,
   port forwarding, or an SFTP session, depending on server policy.

Public-key authentication uses a private key kept by the client and a
matching public key registered with the server. A private key should remain
private and may be protected with a passphrase or an agent. The host key
serves a different purpose: it helps the client recognize the server. Do
not automatically accept an unexpected host-key change without verifying it
through a trusted channel.

| Protocol/tool | Purpose | Important distinction |
|---|---|---|
| SSH | Secure remote connection and related channels | Provides transport protection and authentication mechanisms |
| SFTP | File operations over SSH | Not FTP wrapped in TLS |
| FTP | Older file-transfer protocol | Credentials/data protection depends on configuration; plain FTP is not encrypted |
| FTPS | FTP secured with TLS | Different protocol family and connection behavior from SFTP |

## Real-world example

A developer deploys an application to a cloud virtual machine using an
authorized SSH account. A bank or government organization may also use SSH
for restricted server administration or automated transfers, but their
customer-facing websites still commonly use HTTPS. Administrative access
should be separated from public website access and limited by policy.

## Developer perspective

Developers may use SSH for Git operations, deployment, remote debugging, or
access to authorized servers. Use managed keys and accounts, verify server
identity, and follow the organization's access controls. Prefer a provider's
documented deployment workflow when one is available.

## Practical example

For a server you own or are authorized to administer:

```sh
ssh user@server.example
sftp user@server.example
```

The commands initiate a connection; they do not bypass authentication. Use
the actual host and account information supplied by the administrator. Never
paste private keys into a repository, chat, or issue.

## Important terminology

- **Host key:** key used to identify an SSH server to clients.
- **User key pair:** client-held private key and corresponding public key
  used for authentication.
- **Known-hosts file:** client-side record of SSH server host keys.
- **Port forwarding:** carrying another connection through an SSH channel
  when permitted by policy.
- **SFTP:** SSH File Transfer Protocol, a file-transfer protocol carried
  over SSH.

## Advantages and disadvantages

SSH protects remote administration traffic and supports strong key-based
authentication and file transfer. Mismanaged credentials or unverified
server keys can undermine trust, and exposed administrative services need
careful access control and monitoring.

## Common misconceptions

- SFTP and FTPS are different protocols.
- A host key identifies the server; a user key authenticates a client user.
- Encryption does not make an unauthorized login acceptable or safe.
- Port 22 is common for SSH but a port number alone does not prove what
  service is running.

## Further learning

- [RFC 4251: The Secure Shell (SSH) Protocol Architecture](https://www.rfc-editor.org/rfc/rfc4251)
- [RFC 4253: SSH Transport Layer Protocol](https://www.rfc-editor.org/rfc/rfc4253)
- [OpenSSH Manual Pages](https://www.openssh.com/manual.html)
- [OpenSSH: SFTP](https://www.openssh.com/)
