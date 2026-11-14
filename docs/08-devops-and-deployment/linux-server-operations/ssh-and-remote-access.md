# SSH and Remote Access

SSH is how you reach a Linux server's shell, run commands on it from
scripts and CI, copy files to it, and tunnel to services that are not
exposed to the internet. This lesson goes past the basics in
[SSH and SFTP](../../01-networking-and-protocols/ssh-and-sftp.md): what
happens during a connection, Ed25519 keys and the agent, a client
configuration that keeps many servers manageable, host key verification
and what to do when it fails, hardening `sshd` on Ubuntu 26.04, jump hosts
with `ProxyJump`, port forwarding, SSH certificates, cloud services that
need no open SSH port, and copying files with `scp` and `rsync`.

Every example uses the TaskFlow servers: a bastion at `203.0.113.20` and
private app servers `10.0.2.10` and `10.0.2.11`, all running Ubuntu
26.04 LTS with OpenSSH 10.2.

## Why it matters

Port 22 on a public address is scanned and hit with automated
password-guessing attempts all day, every day, so SSH is the most
attacked door on most servers. The defaults are reasonable, but a few
settings decide whether a server can be broken into with a guessed
password, whether a stolen laptop file is enough to log in, and whether
someone on the network path can impersonate the server.

SSH mistakes also cause outages of a different kind. Disabling password
logins before a key works locks you out. Changing the port without
opening the firewall locks you out. A CI job with
`StrictHostKeyChecking=no` will happily deploy to an impostor. And as a
team grows, copying public keys into `authorized_keys` on every server
turns offboarding into a hunt through dozens of machines. Knowing how
keys, host keys, agents, jump hosts, and certificates fit together lets
you avoid all of these.

## Real-world usage

- **Meta (Facebook).** In
  [Scalable and secure access with SSH](https://engineering.fb.com/2016/09/12/security/scalable-and-secure-access-with-ssh/)
  (2016), Facebook's engineers explain that trust defined per key pair in
  `authorized_keys` "does not scale", so their servers trust a single SSH
  certificate authority instead. Certificates are issued on bastion hosts
  that require two-factor authentication, principals decide which
  accounts an engineer may use, and the post recommends short-lived
  certificates (for example 24 hours) to shrink an attacker's window.
- **GitHub Enterprise Cloud.** The
  [SSH certificate authorities](https://docs.github.com/en/organizations/managing-git-access-to-your-organizations-repositories/about-ssh-certificate-authorities)
  documentation shows organizations signing developers' keys with
  `ssh-keygen -s ... -V '+1d'`, and states that an issued certificate
  cannot be revoked, which is exactly why lifetimes must be short.
- **AWS Systems Manager Session Manager.** The guide to
  [SSH connections through Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-getting-started-enable-ssh-connections.html)
  describes reaching instances "without opening inbound ports or
  maintaining bastion hosts", with IAM policies deciding who may connect.
  It also warns that Session Manager cannot log sessions used for SSH or
  port forwarding, because they are encrypted end to end.
- **OpenSSH 10.0.** The
  [OpenSSH release notes](https://www.openssh.org/releasenotes.html)
  record the removal of DSA keys and the switch to the hybrid
  post-quantum key agreement `mlkem768x25519-sha256` as the default.
  Ubuntu 26.04 ships OpenSSH 10.2, so new servers and laptops negotiate
  it without any configuration.

**Popular tools and providers:** OpenSSH (client and server), the
OpenSSH client built into Windows, PuTTY, Teleport, Smallstep step-ca,
HashiCorp Vault's SSH secrets engine, AWS Systems Manager Session Manager
and EC2 Instance Connect, Google Cloud IAP TCP forwarding and OS Login,
Azure Bastion, and Tailscale SSH.

## How it works

### What happens when you run `ssh`

![Diagram: a sequence between the ssh client on your laptop and sshd on the server. Transport: 1, a TCP connection to port 22; 2, both sides exchange version strings and algorithm lists; 3, the client sends a key share for mlkem768x25519-sha256; 4, the server replies with its key share, its host key, and a signature, after which both sides hold the same session keys and everything is encrypted. Host check: 5, the client compares the host key with known_hosts; a match continues, an unknown key asks, a changed key refuses. User authentication: 6, the client offers its Ed25519 public key; 7, the server finds it in authorized_keys; 8, the server asks for proof; 9, the client sends a signature over the session identifier; 10, success. Session: 11, the client opens channels for a shell, commands, port forwards, or sftp.](ssh-connection-sequence.svg)

An SSH connection is built in three layers:

1. **Transport.** After the TCP handshake, client and server agree on
   algorithms and run a key exchange. Since OpenSSH 10.0 the default is
   `mlkem768x25519-sha256`, which combines the post-quantum ML-KEM
   algorithm with classic X25519, so the session stays protected even if
   one of the two is broken later, including by a future quantum
   computer applied to recorded traffic. OpenSSH 10.1 and later print a
   warning when a connection falls back to a key agreement without
   post-quantum protection, which you will see when connecting to old
   network appliances. In the same step the server signs the exchange
   with its **host key**, proving it holds the matching private key.
2. **User authentication.** The client checks the host key against
   `~/.ssh/known_hosts` first; only then does it authenticate the user.
   With public key authentication, the client offers a public key, the
   server looks for it in the account's `~/.ssh/authorized_keys`, and the
   client proves it holds the private key by signing data that includes
   the session identifier. The private key never leaves the client, and
   the signature is useless for any other session.
3. **Connection.** One authenticated connection carries many channels: an
   interactive shell, a single command (`ssh host uptime`), forwarded TCP
   ports, and the SFTP subsystem used by `sftp`, `scp`, and `rsync`.

The order matters for security. A password is sent to whoever answers,
so if you accept an impostor's host key, the impostor learns your
password. With key authentication, the impostor receives a signature that
only works for its own fake session. Host key checking plus key-only
login closes both doors.

### Keys, passphrases, and the agent

| Key type | `ssh-keygen -t` | When to use it |
|---|---|---|
| Ed25519 | `ed25519` (the default) | Everything new: short keys, fast, no parameter choices to get wrong |
| Ed25519 on a FIDO2 security key | `ed25519-sk` | Admin access: the private key lives in the hardware token and every use needs a touch |
| ECDSA | `ecdsa`, `ecdsa-sk` | Systems or tokens that lack Ed25519 |
| RSA | `rsa` | Only for old systems that accept nothing newer |
| DSA | none | Removed in OpenSSH 10.0 |

A private key file on disk is protected by its passphrase, which
encrypts the file; `ssh-keygen -a` sets how many key-derivation rounds an
attacker must pay for each guess (the default is 16). The `ssh` client
refuses to use a private key that other users can read, and `sshd`
refuses an `authorized_keys` file (or a `~/.ssh` directory or home
directory) that other users can write, unless `StrictModes` is turned
off. Most "the key is right but it still asks for a password" problems
are permissions: `~/.ssh` should be `700`, private keys and
`authorized_keys` `600`.

**ssh-agent** holds decrypted keys in memory so you type the passphrase
once per login session. `ssh-add -t 8h` makes a key expire from the agent
after a working day, `ssh-add -c` asks for confirmation on every use, and
`AddKeysToAgent yes` in the client config adds a key the first time you
use it.

**Agent forwarding** (`ssh -A`, `ForwardAgent yes`) gives the remote
server a socket that talks back to your agent. The `ssh_config` manual
spells out the risk: an attacker on that server "cannot obtain key
material from the agent, however they can perform operations on the
keys". Anyone with root on a shared bastion can use your keys to log in
anywhere you can for as long as you stay connected. `ProxyJump` solves
the same problem without that exposure.

### The client configuration file

`~/.ssh/config` turns a command like this one into `ssh taskflow-app-1`:

```bash
# Without a client configuration: key, jump host, user, and address every time
ssh -i ~/.ssh/id_ed25519_taskflow -J ops@203.0.113.20 ops@10.0.2.10
```

Two rules explain most surprises:

- **The first value wins.** For each option, `ssh` uses the first value
  it finds, reading the command line, then `~/.ssh/config`, then
  `/etc/ssh/ssh_config`, top to bottom. Put specific `Host` blocks first
  and a catch-all `Host *` block last.
- **The agent offers every key it holds.** Servers allow `MaxAuthTries`
  attempts (6 by default), so a well-stocked agent can trigger
  `Too many authentication failures` before the right key is tried.
  `IdentitiesOnly yes` limits a host to the keys you name.

`ControlMaster auto` with `ControlPath` and `ControlPersist` reuses one
TCP connection for later `ssh`, `scp`, and `rsync` runs to the same host,
which makes scripts and tools such as Ansible much faster. `ssh -G host`
prints the configuration that will actually be used.

### Host keys and known_hosts

The first connection to a server is **trust on first use**: `ssh` shows
the host key fingerprint and asks. `StrictHostKeyChecking` controls this:

| Value | New host | Changed host key |
|---|---|---|
| `ask` (default) | Ask the user | Refuse |
| `accept-new` | Add automatically | Refuse |
| `yes` | Refuse unless already in `known_hosts` | Refuse |
| `no` | Add automatically | Connect anyway (dangerous) |

Answering "yes" without checking defeats the point. Verify the
fingerprint through a channel the attacker cannot touch: cloud-init
prints every host key fingerprint to the instance's console log on first
boot by default, and most providers show that log in their console; or
run `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` through the
provider's browser console. Automation should use pre-seeded
`known_hosts` entries (`StrictHostKeyChecking yes`) or `accept-new`,
never `no`. `ssh-keyscan` fetches host keys conveniently, but its manual
warns that a `known_hosts` file built from it without verifying the keys
leaves you open to man-in-the-middle attacks.

A **changed host key** means one of two things: the server was rebuilt
or its keys were regenerated, or someone is intercepting the connection.
Confirm the new fingerprint out of band, then remove the old entry with
`ssh-keygen -R host` and reconnect. For planned key rotation,
`UpdateHostKeys` (on by default unless you changed `UserKnownHostsFile`)
lets a server announce additional host keys so clients learn them before
the old one is retired. **Host certificates**, covered below, remove
trust on first use entirely.

### Hardening sshd on Ubuntu 26.04

Ubuntu's `/etc/ssh/sshd_config` includes `/etc/ssh/sshd_config.d/*.conf`
at the top, and for most keywords `sshd` uses the first value it reads.
Two consequences:

- Settings in drop-in files override the main file, so the main file can
  say `PasswordAuthentication no` while a drop-in silently re-enables it.
  The Ubuntu installer and cloud-init write
  `/etc/ssh/sshd_config.d/50-cloud-init.conf` for exactly this setting.
- Your own drop-in must sort first. Name it `00-hardening.conf`, then
  confirm the result with `sshd -T`, which prints the effective
  configuration.

| Setting | Default | Recommended | Why |
|---|---|---|---|
| `PermitRootLogin` | `prohibit-password` | `no` | Log in as a named user, then use `sudo`; logs show who did what |
| `PasswordAuthentication` | `yes` | `no` | Guessable secrets are the main SSH attack |
| `KbdInteractiveAuthentication` | `yes` (Ubuntu's file sets `no`) | `no` | The other route to password prompts through PAM |
| `AuthenticationMethods` | any one method | `publickey` | States the policy explicitly |
| `AllowGroups` | everyone | `sshusers` | Only intended accounts can log in at all |
| `MaxAuthTries` | `6` | `3` | Fewer guesses per connection |
| `LoginGraceTime` | `120` seconds | `30` | Unauthenticated connections close sooner |
| `AllowAgentForwarding` | `yes` | `no` | Nobody parks an agent socket on the server |
| `AllowTcpForwarding` | `yes` | `no` on app servers, `local` on bastions | Forwarding can bypass network controls |
| `X11Forwarding` | `no` (Ubuntu's file sets `yes`) | `no` | Not needed on servers |

OpenSSH 9.8 and later also enable `PerSourcePenalties` by default: an
address that fails authentication or connects without authenticating is
refused for a while (5 seconds per authentication failure, up to 10
minutes, with longer penalties for causing crashes). Monitoring systems
or office VPN ranges that should never be penalized go in
`PerSourcePenaltyExemptList`. Together with key-only logins this makes
brute force pointless; fail2ban, covered in
[setting up a production server](setting-up-a-production-server.md),
adds firewall-level bans.

Apply changes safely: validate with `sudo sshd -t`, reload, and test a
new login **from a second terminal** while the first session stays open.
Ubuntu's `ssh.service` runs `sshd -t` again before every reload and
restart, and existing sessions survive both because they are separate
processes. On current Ubuntu releases, socket activation is the default:
systemd's `ssh.socket` owns the listening socket, and a generator derives
it from `sshd_config`. After changing `Port`, `ListenAddress`, or
`AddressFamily` you must therefore run
`sudo systemctl daemon-reload` and `sudo systemctl restart ssh.socket`,
as the comment in Ubuntu's `sshd_config` says. Open the new port in the
firewall before you do.

### Jump hosts and bastions

![Diagram: your laptop keeps its keys. 1: it opens an outer SSH session to the bastion at 203.0.113.20 in the public subnet of the VPC; the bastion accepts port 22 only from 198.51.100.0/24 and allows only local forwarding. 2: the bastion opens a TCP connection to app-1 at 10.0.2.10 port 22 in a private subnet. 3: the laptop runs an inner SSH session to app-1 through it, encrypted end to end, so the bastion relays only ciphertext. app-2 and MongoDB have no public addresses and accept SSH only from the bastion; MongoDB has no SSH at all. A warning box: avoid agent forwarding, because root on the bastion could use your keys.](ssh-proxyjump-bastion.svg)

A **bastion** (jump host) is the one machine that accepts SSH from
outside; app servers and databases sit in private subnets and accept SSH
only from the bastion's security group. With `ProxyJump` (`ssh -J`), the
client opens an SSH session to the bastion, asks it to open a plain TCP
connection to the target's port 22, and runs a second SSH session to the
target through that connection. The inner session is authenticated with
keys on your laptop and encrypted end to end, so the bastion never sees
your keys or your commands. Compare the alternatives:

| Approach | Where keys live | What a compromised bastion can do |
|---|---|---|
| `ProxyJump` | Your laptop only | Relay or block traffic it cannot read |
| Agent forwarding (`-A`) | Your laptop, usable from the bastion | Use your keys while you are connected |
| Keys copied to the bastion | The bastion's disk | Steal the keys and use them forever |

Keep the bastion boring: no other services, patched automatically, port
22 open only to known address ranges, `AllowTcpForwarding local`, and
accounts that can forward but not get a shell. A `Match Group` block with
`PermitTTY no` and `ForceCommand /usr/sbin/nologin` does that, because
`ForceCommand` applies to shell, command, and subsystem sessions, while
`ProxyJump` only opens a TCP forwarding channel; `PermitOpen` can limit
which `host:port` destinations may be forwarded to. Where the network
design is concerned (security groups, private endpoints, and the
trade-offs between bastions and identity-aware proxies), see
[network security in the cloud](../devsecops-and-cloud-security/network-security-in-the-cloud.md).

### Port forwarding

![Diagram: three rows. -L, local forward: the laptop listens on port 3300, connections travel through the SSH tunnel to the bastion, which opens a TCP connection to Grafana at 10.0.2.30 port 3000; command ssh -N -L 127.0.0.1:3300:10.0.2.30:3000 taskflow-bastion. -R, remote forward: app-1 listens on port 9000 and a client on app-1 that connects to it reaches a development app on the laptop's port 3000 through the tunnel; command ssh -N -R 127.0.0.1:9000:localhost:3000 taskflow-app-1. -D, dynamic forward: the laptop runs a SOCKS proxy on port 1080 and the bastion dials any host and port it can reach; command ssh -N -D 127.0.0.1:1080 taskflow-bastion.](ssh-port-forwarding-modes.svg)

- **`-L [bind:]port:host:hostport` (local):** your machine listens, and
  the SSH server connects onward to `host:hostport`. Use it to reach a
  private admin UI or database port without exposing it. `host` is
  resolved from the server's point of view, so `10.0.2.30` or
  `localhost` means the server's network, not yours.
- **`-R [bind:]port:host:hostport` (remote):** the server listens and
  connections come back to your side. By default `sshd` binds remote
  forwards to the server's loopback address (`GatewayPorts no`), so only
  processes on the server can use them.
- **`-D [bind:]port` (dynamic):** your machine runs a SOCKS proxy and the
  server dials whatever destination each request names.
- **`-N`** runs no remote command (forwarding only) and **`-f`** sends
  `ssh` to the background once it has authenticated. In scripts add
  `-o ExitOnForwardFailure=yes` so `ssh` fails loudly when the port is
  already taken.

`ssh` binds local forwards to the loopback address by default; keep it
that way (no `GatewayPorts yes`, no `0.0.0.0` bind address), because a
forward listening on all interfaces of your laptop shares the private
service with everyone on the same Wi-Fi. Writing `127.0.0.1:` in front
of the port makes the intent explicit. On the server side, forwarding can
carry traffic past network controls, which is why app servers that never
need it should set `AllowTcpForwarding no`.

### SSH certificates

![Diagram: 1, the engineer signs in to the SSH certificate authority (step-ca, Vault, or Teleport) with SSO and MFA and sends a public key; 2, the CA returns a certificate with principals, valid for 8 hours; 3, the engineer connects with the key and certificate; the server's sshd checks that the certificate is signed by a trusted CA key, is within its validity window, and has a principal allowed for the user, then logs the engineer in as deploy. Below, a comparison: authorized_keys on every server means 40 engineers times 30 servers equals 1,200 entries, offboarding means editing 30 servers, and keys never expire on their own; short-lived certificates mean 30 servers trust one CA public key, access ends when the 8-hour certificate expires, and every login records a key ID and principal.](ssh-user-certificates.svg)

An SSH certificate is a public key signed by a certificate authority key,
together with a **key ID** (recorded in the server's log), a list of
**principals** (names the certificate may log in as), a **validity
window**, and optional restrictions. OpenSSH certificates are not X.509
certificates; `ssh-keygen` creates and signs them.

- **User certificates:** servers trust the CA with
  `TrustedUserCAKeys /etc/ssh/taskflow_user_ca.pub`, so no per-user
  `authorized_keys` lines are needed. `AuthorizedPrincipalsFile` maps
  principals to local accounts: `/etc/ssh/auth_principals/deploy`
  containing `taskflow-ops` lets any certificate carrying that principal
  log in as `deploy`.
- **Host certificates:** the CA signs each server's host key
  (`ssh-keygen -h`), `sshd` presents it with `HostCertificate`, and
  clients trust every server the CA signed with one line in `known_hosts`:
  `@cert-authority *.example.com ssh-ed25519 <ca-public-key>`. Rebuilt
  servers no longer trigger host key warnings.
- **Revocation:** `RevokedKeys` accepts a list or an OpenSSH key
  revocation list (KRL), but the practical control is a short lifetime.
  An 8-hour certificate expires before most incident responses even
  begin, which is the reasoning in Facebook's post and GitHub's warning
  that its certificates cannot be revoked.
- **Protect the CA key** like the most powerful credential you own, since
  it can sign a login to every server. Keep it offline or in a secrets
  engine (step-ca, Vault, Teleport) that issues certificates only after
  SSO and MFA.

### Remote access without an open SSH port

Cloud providers offer access paths that need no public SSH port at all:

| Service | How you connect | Inbound port 22 from the internet | Identity and audit |
|---|---|---|---|
| AWS Systems Manager Session Manager | `aws ssm start-session --target i-...`; the SSM Agent on the instance connects outward to AWS | Not needed | IAM policies; shell sessions can be logged, SSH and port-forward sessions cannot |
| EC2 Instance Connect | Pushes your public key to the instance metadata for 60 seconds, then you SSH | Needed, or use an EC2 Instance Connect Endpoint for private instances | IAM; connection requests logged to CloudTrail |
| Google Cloud IAP TCP forwarding | `gcloud compute ssh vm --tunnel-through-iap` | Only from Google's range `35.235.240.0/20` | IAM role `roles/iap.tunnelResourceAccessor` |
| Azure Bastion | The Azure portal in a browser, or your own SSH client (Standard and Premium tiers), through a managed bastion in your virtual network | Not needed; VMs need no public IP | Azure RBAC; Microsoft Entra ID sign-in with the native client |

Session Manager can also carry real SSH (useful for `scp` and `rsync`)
and port forwarding with the `AWS-StartPortForwardingSession` documents.
An EC2 Instance Connect Endpoint is an identity-aware TCP proxy into a
VPC; each endpoint supports up to 20 concurrent connections, and a
connection lasts at most one hour, so it suits management access rather
than data transfer. These services are the network-level answer to "how
do we get rid of the bastion", compared in
[network security in the cloud](../devsecops-and-cloud-security/network-security-in-the-cloud.md).

### Copying files: scp, sftp, and rsync

- **`scp`** has used the SFTP protocol for transfers by default since
  OpenSSH 9.0 (`-O` selects the legacy protocol for old servers). It
  copies whole files every time.
- **`sftp`** gives an interactive or batch file-transfer session.
- **`rsync`** compares source and destination and sends only what
  changed, over SSH by default, honoring your `~/.ssh/config` (including
  `ProxyJump`). `-a` (archive) means `-rlptgoD`: recursive, symlinks,
  permissions, times, group, owner, and devices. A trailing slash on the
  source copies the directory's contents rather than the directory
  itself, and `--delete` removes destination files missing from the
  source, so always preview with `-n` (`--dry-run`) first.

For application deploys, copying source code to servers is the weakest
pattern; CI should build an artifact once and the server should fetch a
specific version, as in
[deploying backend services](../deployment-strategies/deploying-backend-services.md).

## When to use and when not to use

| Situation | Recommended access |
|---|---|
| One or two VMs, small team | Key-only SSH (Ed25519, passphrase), port 22 limited to known addresses where possible, a hardening drop-in, fail2ban or `PerSourcePenalties` for noise |
| Several servers in private subnets | A bastion with `ProxyJump`, or a cloud service with no open port |
| AWS fleet | Session Manager (IAM, no inbound ports); EC2 Instance Connect Endpoint when you need real SSH to private instances |
| Google Cloud fleet | IAP TCP forwarding with OS Login |
| Growing team, compliance audits, frequent joiners and leavers | SSH certificates from an issuer behind SSO and MFA, with lifetimes of hours |
| CI deploying to a VM | A dedicated deploy key restricted to one forced command, plus a pinned host key |
| Immutable servers or containers | No interactive SSH in normal operation; replace instead of fixing in place ([immutable infrastructure](../infrastructure-as-code/immutable-infrastructure-and-gitops.md)) |

Do not:

- share one private key across a team; every person and every system
  gets its own key, so access can be removed one at a time;
- disable host key checking to make a script "work";
- use agent forwarding to reach servers behind a bastion;
- treat a non-standard SSH port as protection.

## Practical examples

### Create a key and prove it works before disabling passwords

```bash
# On your laptop: an Ed25519 key with a passphrase and 100 KDF rounds
ssh-keygen -t ed25519 -a 100 -C "ops laptop 2026" -f ~/.ssh/id_ed25519_taskflow

# Append the public key to ~/.ssh/authorized_keys on the server
ssh-copy-id -i ~/.ssh/id_ed25519_taskflow.pub ops@203.0.113.20

# Log in with the key only; password prompts are disabled for this attempt
ssh -i ~/.ssh/id_ed25519_taskflow -o IdentitiesOnly=yes \
    -o PasswordAuthentication=no ops@203.0.113.20 'echo key login works'
```

`ssh-copy-id` uses whatever access you already have (a password or the
provider's initial key) and creates `~/.ssh/authorized_keys` if it is
missing. Only after the last command succeeds is it safe to turn off
password authentication on the server.

### A client configuration for the TaskFlow servers

```text
# ~/.ssh/config
Host taskflow-bastion
    HostName 203.0.113.20

Host taskflow-app-1
    HostName 10.0.2.10

Host taskflow-app-2
    HostName 10.0.2.11

Host taskflow-app-*
    ProxyJump taskflow-bastion

Host taskflow-*
    User ops
    IdentityFile ~/.ssh/id_ed25519_taskflow
    IdentitiesOnly yes

Host *
    AddKeysToAgent yes
    ServerAliveInterval 30
    ServerAliveCountMax 4
    ControlMaster auto
    ControlPath ~/.ssh/cm-%C
    ControlPersist 10m
```

`ssh taskflow-app-1` now picks up its `HostName` from the first matching
block, `ProxyJump` from the second, the user and key from the third, and
keep-alives and multiplexing from the last. Because the first obtained
value wins, a `User` line in `Host *` would never override the one set
above it. `ServerAliveInterval 30` sends a keep-alive through the
encrypted channel every 30 seconds and disconnects after 4 missed
replies, which stops idle sessions from being cut by NAT gateways and
detects dead connections in about two minutes. `%C` is a hash of the
local host name, remote host, port, user, and jump host, which keeps
control socket paths short and unique.

### One hardening drop-in for sshd

```text
# /etc/ssh/sshd_config.d/00-hardening.conf
# Sorts before 50-cloud-init.conf; for most keywords sshd keeps the FIRST value it reads.
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
AuthenticationMethods publickey
AllowGroups sshusers
MaxAuthTries 3
LoginGraceTime 30
AllowAgentForwarding no
AllowTcpForwarding no
X11Forwarding no
ClientAliveInterval 300
ClientAliveCountMax 2
```

```bash
# Create the login group first, or AllowGroups locks everyone out
sudo groupadd sshusers
sudo usermod -aG sshusers ops
sudo usermod -aG sshusers deploy

# Validate, inspect the effective values, then reload (keep this session open)
sudo sshd -t
sudo sshd -T | grep -Ei '^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication|authenticationmethods|allowgroups) '
sudo systemctl reload ssh

# From a SECOND terminal: a password attempt must now be refused
ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password ops@203.0.113.20
```

Example output of the `sshd -T` check (values are lowercased):

```text
permitrootlogin no
passwordauthentication no
kbdinteractiveauthentication no
authenticationmethods publickey
allowgroups sshusers
```

The final command should end with `Permission denied (publickey)`. On a
bastion, use `AllowTcpForwarding local` instead of `no`, or `ProxyJump`
through it stops working. `ClientAliveInterval 300` with
`ClientAliveCountMax 2` makes the server drop clients that stop
answering after about ten minutes.

### Reach a private admin UI through the bastion

```bash
# Forward 127.0.0.1:3300 on your laptop to Grafana on the private network; -N: no shell
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:3300:10.0.2.30:3000 taskflow-bastion
# Then open http://127.0.0.1:3300 in a browser; Ctrl+C closes the tunnel
```

The bastion connects to `10.0.2.30:3000` on your behalf, so its
`sshd_config` must allow local forwarding and its security group must
reach Grafana. Nothing about Grafana is exposed to the internet.

### A deploy key that can run exactly one command

CI needs to trigger deploys, not to get a shell. A dedicated key in the
`deploy` account's `authorized_keys`, restricted to a forced command,
gives it exactly that:

```text
# /home/deploy/.ssh/authorized_keys (one line per key)
restrict,command="/usr/local/sbin/taskflow-deploy-gate" ssh-ed25519 <ci-public-key> ci-deploy
```

```bash
#!/usr/bin/env bash
# /usr/local/sbin/taskflow-deploy-gate: the only command the CI key can run
set -euo pipefail

# What the client asked to run, for example "1.8.0"
version="${SSH_ORIGINAL_COMMAND:-}"

if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "usage: ssh deploy@host <major.minor.patch>" >&2
  exit 2
fi

exec sudo /usr/local/sbin/deploy-taskflow-api "$version"
```

```text
# /etc/sudoers.d/deploy-taskflow (edit with: sudo visudo -f /etc/sudoers.d/deploy-taskflow)
deploy ALL=(root) NOPASSWD: /usr/local/sbin/deploy-taskflow-api
```

`restrict` disables port, agent, and X11 forwarding and PTY allocation
for this key, and future restrictions OpenSSH adds are included
automatically. `command=` runs the gate whatever the client asked for;
the requested text arrives in `SSH_ORIGINAL_COMMAND` and is validated
before use. The sudoers rule lets the deploy account run one root-owned
script (the release script from
[running apps with systemd and nginx](running-apps-with-systemd-and-nginx.md))
and nothing else. Ubuntu 26.04 uses sudo-rs as `sudo`, which reads the
same `/etc/sudoers.d` files; check the result with `sudo -l -U deploy`.

### Pin the host key in a CI workflow

```yaml
# .github/workflows/deploy-vm.yml
name: deploy-vm
on:
  workflow_dispatch:
    inputs:
      version:
        description: "Release version to deploy, for example 1.8.0"
        required: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    concurrency: deploy-production
    steps:
      - name: Install the deploy key and the pinned host key
        env:
          DEPLOY_KEY: ${{ secrets.DEPLOY_SSH_KEY }}
          KNOWN_HOSTS: ${{ vars.PROD_KNOWN_HOSTS }}
        run: |
          install -d -m 700 ~/.ssh
          printf '%s\n' "$DEPLOY_KEY" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          printf '%s\n' "$KNOWN_HOSTS" > ~/.ssh/known_hosts

      - name: Trigger the deploy
        env:
          VERSION: ${{ inputs.version }}
        run: |
          ssh -i ~/.ssh/deploy_key -o IdentitiesOnly=yes \
              -o StrictHostKeyChecking=yes deploy@203.0.113.10 "$VERSION"
```

`PROD_KNOWN_HOSTS` is a configuration variable holding the server's
verified `known_hosts` line, so the job refuses to talk to anything else.
The version is passed through an environment variable rather than pasted
into the script, which prevents script injection through the input, and
the forced command on the server validates it again. The `production`
environment can require an approval, and `concurrency` stops two deploys
from overlapping. Pipeline security in general is covered in
[pipeline and supply chain security](../ci-cd/pipeline-and-supply-chain-security.md).

### Sign a short-lived user certificate

```bash
# Once, on the CA machine (offline, or inside step-ca or Vault): the user CA key
ssh-keygen -t ed25519 -f ./taskflow_user_ca -C "taskflow user CA"

# Per login session: sign an engineer's public key for 8 hours as principal taskflow-ops
ssh-keygen -s ./taskflow_user_ca -I "ops-laptop-2026-11-14" -n taskflow-ops \
    -V +8h ~/.ssh/id_ed25519_taskflow.pub

# Inspect the result (written as id_ed25519_taskflow-cert.pub next to the key)
ssh-keygen -L -f ~/.ssh/id_ed25519_taskflow-cert.pub
```

```text
# /etc/ssh/sshd_config.d/10-user-ca.conf
TrustedUserCAKeys /etc/ssh/taskflow_user_ca.pub
AuthorizedPrincipalsFile /etc/ssh/auth_principals/%u
```

```bash
# On each server: the deploy account accepts certificates for principal taskflow-ops
sudo install -d -m 755 /etc/ssh/auth_principals
echo taskflow-ops | sudo tee /etc/ssh/auth_principals/deploy
sudo sshd -t && sudo systemctl reload ssh
```

`ssh` picks up `<key>-cert.pub` automatically when it sits next to the
private key. In production an issuer service runs the signing step after
SSO and MFA, and nobody handles the CA key directly.

### Copy a directory with rsync

```bash
# Preview: what would change? (trailing slash = copy the CONTENTS of dist/)
rsync -avzn --delete dist/ taskflow-app-1:/srv/taskflow-web/

# Apply, with resumable partial transfers and progress
rsync -avz --delete -P dist/ taskflow-app-1:/srv/taskflow-web/
```

Because `rsync` runs `ssh`, the jump through the bastion, the key, and
multiplexing all come from `~/.ssh/config`.

## Best practices

- One Ed25519 key per person and per device, protected by a passphrase;
  a FIDO2 (`-sk`) key for administrators.
- Key-only logins, no root login, an `AllowGroups` list, and a hardening
  drop-in that sorts before anything cloud-init writes; verify with
  `sshd -T`.
- Keep a second session open while changing SSH or firewall settings.
- Verify host keys out of band; pin them in CI; never use
  `StrictHostKeyChecking=no`.
- Reach private servers with `ProxyJump`, not agent forwarding.
- Prefer no public SSH at all: Session Manager, IAP, or a bastion that
  only accepts known address ranges.
- Move to SSH certificates with lifetimes of hours once more than a
  handful of people need access.
- Give automation restricted keys with forced commands and narrow sudo
  rules.
- Collect `sshd` logs centrally so a login can be traced to a person.

## In production

- **"REMOTE HOST IDENTIFICATION HAS CHANGED" after a server rebuild.**
  *Detect:* `ssh` refuses to connect and prints the old and new
  fingerprints. *Cause:* the rebuilt server generated new host keys, or
  someone is intercepting the connection. *Fix:* compare the new
  fingerprint with the console log or `ssh-keygen -lf` run through the
  provider console; if it matches, run `ssh-keygen -R host` and
  reconnect; move to host certificates to stop the warnings.
- **Locked out right after disabling passwords.**
  *Detect:* `Permission denied (publickey)` for every account.
  *Cause:* the key was never installed for that user, `~/.ssh` or
  `authorized_keys` is writable by others (`StrictModes`), or the user is
  missing from the `AllowGroups` group. *Fix:* get in through the
  provider's console or Session Manager, fix ownership and permissions
  (`700` and `600`), add the group membership, and next time test from a
  second session first.
- **"Too many authentication failures" before the right key is tried.**
  *Detect:* `ssh -v` shows several keys offered and rejected. *Cause:*
  the agent offers every loaded key and the server stops at
  `MaxAuthTries`. *Fix:* `IdentitiesOnly yes` with the right
  `IdentityFile` for that host.
- **Password authentication still accepted after hardening.**
  *Detect:* `sudo sshd -T | grep passwordauthentication` prints `yes`.
  *Cause:* `/etc/ssh/sshd_config.d/50-cloud-init.conf` sets it first, and
  `sshd` keeps the first value. *Fix:* name your file `00-...conf` (or
  correct the cloud-init file), reload, and check again.
- **The new SSH port does not take effect, or the server becomes
  unreachable.** *Detect:* `ss -tlnp` still shows `:22`, or connections
  time out. *Cause:* on Ubuntu, systemd's `ssh.socket` owns the port and
  needs `daemon-reload` plus a socket restart; or the firewall or
  security group was not opened first. *Fix:* open the port in `ufw` and
  the security group, run both systemctl commands, and test before
  closing your session.
- **Idle SSH sessions freeze after a few minutes.**
  *Detect:* the terminal stops responding after idle time; reconnecting
  works. *Cause:* a NAT gateway or firewall drops idle TCP flows.
  *Fix:* `ServerAliveInterval 30` on the client (or `ClientAliveInterval`
  on the server).
- **The auth log fills with failed logins from all over the internet.**
  *Detect:* `journalctl -u ssh` shows thousands of `Invalid user`
  lines per hour. *Cause:* port 22 open to the world. *Fix:* key-only
  authentication makes them harmless; restrict the source ranges in the
  security group, or remove public SSH and use Session Manager or IAP.

## Important terminology

- **Host key:** The server's key pair; proves the server's identity to
  clients.
- **known_hosts:** The client's record of trusted host keys.
- **authorized_keys:** The per-account list of public keys allowed to log
  in, optionally with restrictions such as `command=` and `restrict`.
- **Trust on first use (TOFU):** Accepting a host key the first time it
  is seen and checking it on every later connection.
- **ssh-agent:** A process that holds decrypted private keys and signs on
  request.
- **Agent forwarding:** Exposing your agent to a remote server.
- **ProxyJump:** Connecting to a target through a jump host with an
  end-to-end encrypted inner session.
- **Bastion (jump host):** The single hardened entry point into a private
  network.
- **Port forwarding:** Carrying TCP connections through an SSH session:
  local (`-L`), remote (`-R`), or dynamic SOCKS (`-D`).
- **SSH certificate:** A public key signed by a CA with a key ID,
  principals, and a validity window.
- **Principal:** A name in a certificate that maps to accounts a holder
  may use.
- **Forced command:** A command that runs whenever a given key is used,
  regardless of what the client asked for.

## Common mistakes and misconceptions

- Believing a passphrase-less key "is fine on my laptop": a stolen
  backup or synced folder is enough to log in.
- Copying the same private key to colleagues, CI, and servers, so it can
  never be revoked without breaking everything.
- Fixing a changed host key with `ssh-keygen -R` without checking why it
  changed.
- `StrictHostKeyChecking=no` in scripts and CI.
- Editing `/etc/ssh/sshd_config` while a drop-in silently overrides it.
- Thinking a different port, or fail2ban alone, is what secures SSH;
  key-only authentication is.
- Using agent forwarding through a bastion "just this once".
- Assuming `scp` and `rsync` bypass your `~/.ssh/config`; they use it.

## Revision questions

1. Describe the steps of an SSH connection in order, and explain why
   key-based login protects you even if you accidentally accept an
   impostor's host key, while password login does not.
2. Why does `sshd` on Ubuntu 26.04 keep accepting passwords when
   `/etc/ssh/sshd_config` says `PasswordAuthentication no`, and how do
   you prove which value is in effect?
3. What does `StrictHostKeyChecking accept-new` do differently from
   `ask`, `yes`, and `no`, and which would you use in CI?
4. Explain why `ProxyJump` is safer than agent forwarding when reaching
   private servers through a bastion.
5. Write the command that makes a private Grafana at `10.0.2.30:3000`
   available on your laptop's port 3300 through the bastion, and explain
   which machine resolves `10.0.2.30`.
6. A team has 40 engineers and 30 servers, and every engineer's key is
   in `authorized_keys` on every server. How many entries must be
   managed, how many servers change when one person leaves, and how do
   8-hour certificates change both numbers? (1,200 entries and 30 servers
   to edit; with certificates the servers trust one CA key and nothing
   changes on them, because access ends when the certificate expires.)
7. Compare Session Manager, EC2 Instance Connect, and IAP TCP forwarding:
   which need an inbound port, and how is access granted?
8. Why does changing `Port` in `sshd_config` on Ubuntu need
   `systemctl daemon-reload` and a restart of `ssh.socket`?

## Further learning

- [OpenSSH manual pages](https://www.openssh.org/manual.html)
- [sshd_config(5) on Ubuntu 26.04](https://manpages.ubuntu.com/manpages/resolute/man5/sshd_config.5.html)
- [ssh_config(5) on Ubuntu 26.04](https://manpages.ubuntu.com/manpages/resolute/man5/ssh_config.5.html)
- [Ubuntu Server: OpenSSH server](https://ubuntu.com/server/docs/how-to/security/openssh-server/)
- [AWS: Start a Session Manager session](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-sessions-start.html)
- [Google Cloud: Using IAP for TCP forwarding](https://docs.cloud.google.com/iap/docs/using-tcp-forwarding)
- [AWS: EC2 Instance Connect Endpoint](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/connect-with-ec2-instance-connect-endpoint.html)
- Next: [setting up a production server](setting-up-a-production-server.md). Back to the [Linux server operations overview](../linux-server-operations.md).
