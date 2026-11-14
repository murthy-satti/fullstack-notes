# Setting Up a Production Server

A new VPS from any provider boots with sensible defaults, but defaults
are written for convenience, not for an application that holds user
data. This lesson turns a fresh Ubuntu Server 26.04 LTS machine into a
production baseline for the TaskFlow API, in the order that avoids
locking yourself out: updates, a named admin user, SSH hardening, a
two-layer firewall, automatic security updates, time synchronization,
swap, fail2ban, Node.js from a supported repository, an unprivileged app
user with a sane directory layout, configuration and secret files with
correct permissions, and backups.

Every step is shown as commands you can run by hand once, and the
lesson ends with the same baseline as cloud-init user data, because a
server you cannot rebuild from a script is a server you are afraid to
touch.

## Why it matters

A VM with a public IP address is probed by automated scanners within
minutes of booting, and nothing about a default install knows that this
machine will hold a production database password. What separates a
safe server from a risky one is a short list of decisions: who can log
in and how, which ports answer at all, whether security patches arrive
without anyone remembering, whether the clock is right (TLS, JWT
expiry, and log correlation all depend on it), and whether the
application runs with the least privilege it needs.

Order matters as much as content. Disable password logins before your
key works, or enable the firewall before allowing SSH, and the next
step is a support ticket or a rebuild. Doing the risky access steps
first, deliberately and with a second session open, makes everything
after them routine.

## Real-world usage

- **Ubuntu Server documentation.** The
  [automatic updates guide](https://ubuntu.com/server/docs/how-to/software/automatic-updates/)
  states that `unattended-upgrades` is installed by default and applies
  security updates, and that since Ubuntu 24.04 LTS `needrestart`
  restarts affected services automatically after updates. Your service
  will therefore be restarted by the system at times you did not pick,
  which only works if it shuts down gracefully.
- **Docker documentation.** The
  [packet filtering and firewalls](https://docs.docker.com/engine/network/packet-filtering-firewalls/)
  page warns that "Docker and ufw use firewall rules in ways that make
  them incompatible with each other": ports published by containers are
  routed before ufw's rules apply. A cloud firewall in front of the VM
  is what actually protects them.
- **Ubuntu's chrony guide.** The
  [chrony client documentation](https://ubuntu.com/server/docs/how-to/networking/chrony-client/)
  shows the 26.04 default: chrony with Network Time Security (NTS)
  against Ubuntu's time servers, which needs outbound TCP 4460 for the
  key exchange in addition to UDP 123.
- **Ubuntu Security Guide.** For regulated environments, Canonical's
  [Ubuntu Security Guide](https://documentation.ubuntu.com/security/compliance/usg/)
  (part of Ubuntu Pro) audits and applies CIS benchmark hardening
  automatically, which turns a checklist like this one into a report an
  auditor accepts.
- **Node.js release schedule.** The
  [previous releases page](https://nodejs.org/en/about/previous-releases)
  lists Node.js 24 and 26 as LTS lines; per the release working group,
  Node.js 24 is in maintenance until April 2028 and Node.js 26 became
  Active LTS in October 2026. Ubuntu 26.04's own `nodejs` package is
  Node.js 22 from the community-maintained universe component, a line
  that reaches end of life in April 2027, which is why this lesson uses
  NodeSource's repository.

**Popular tools and providers:** cloud-init, Ansible, Terraform and
Packer, ufw (on nftables), fail2ban, unattended-upgrades, Ubuntu Pro
(ESM, Livepatch, USG), NodeSource, and VPS providers such as
DigitalOcean, Hetzner, Akamai (Linode), Vultr, and AWS Lightsail and EC2.

## How it works

### The order of the steps

![Diagram: fourteen steps in a snake-shaped path. Row one: 1 update packages, 2 admin user with sudo and an SSH key, 3 test the key login from a second terminal, 4 harden SSH, 5 firewall allowing SSH first; steps 3 to 5 are marked as lockout risks. Row two, right to left: 6 automatic security updates, 7 time sync with chrony and NTS, 8 swap file, 9 fail2ban, 10 Node.js 24 from NodeSource. Row three: 11 the taskflow app user with no shell, 12 config and secret files with mode 0600 owned by root, 13 backups and a snapshot, 14 audit and record the baseline. Legend: red lockout risks, blue system baseline, orange application steps, green verification.](server-setup-sequence.svg)

The first five steps change how you reach the machine. Each can cut off
your current session, so each ends with a test from a second terminal
before you close the first. The provider's browser console (or
Session Manager) is your way back in if something goes wrong; make sure
you know where it is before you start.

### Accounts: a named admin, an app user, and no shared root

Cloud images log you in as a default user (`ubuntu` on Ubuntu images)
with a key the provider injected, and that user can run any command
through `sudo` without a password. For production:

- Create a **named admin account** per person (here `ops`), give it a
  password for `sudo`, and log in with keys only. Logs then show who ran
  what, and removing one person does not affect anyone else.
- Keep **root** without a usable password and with SSH login refused.
  Ubuntu 26.04's `sudo` is sudo-rs, a Rust rewrite that reads the same
  `/etc/sudoers` and `/etc/sudoers.d/` files.
- Run the app as a **system user** (`taskflow`) with no login shell and
  no home directory. If the app is compromised, the attacker gets a user
  that cannot log in, cannot `sudo`, and cannot write its own code.

### SSH: keys only, applied as a drop-in

The hardening options, why each matters, and how `sshd` reads drop-in
files are covered in [SSH and remote access](ssh-and-remote-access.md).
The short version for setup: put the settings in
`/etc/ssh/sshd_config.d/00-hardening.conf` so they sort before the
`50-cloud-init.conf` file the installer writes, validate with
`sudo sshd -t`, check the effective values with `sudo sshd -T`, reload,
and test a fresh login before closing your session.

### Firewalls: two layers, and the Docker exception

![Diagram: four lanes cross a cloud firewall at the edge and ufw on the host. An admin at 198.51.100.7 reaches sshd on port 22: the security group allows 22 from the office VPN and ufw rate-limits 22/tcp. A user reaches nginx on 443 through both layers. A scanner trying port 3001 is dropped at the edge, and node listens only on 127.0.0.1 anyway. A scanner reaches port 27017 because a mistaken security group rule leaves it open, and the traffic skips ufw because Docker's NAT rules handle published ports first, reaching a MongoDB container published with -p 27017:27017.](server-firewall-layers.svg)

- **The cloud firewall** (an AWS security group, DigitalOcean Cloud
  Firewall, Hetzner Firewall, or Google Cloud VPC firewall rule) filters
  traffic before it reaches the VM. It is managed through the provider's
  API, so it can live in Terraform with the rest of the infrastructure,
  and it keeps working even if someone on the server disables ufw.
- **ufw** is Ubuntu's front end for the kernel's packet filter. It is
  disabled by default. Its rules are evaluated in order and the first
  match wins; the default policy decides everything that matches no
  rule. `ufw limit` denies an address that opens 6 or more connections
  within 30 seconds, a cheap brake on SSH guessing.
- **Docker publishes ports around ufw.** Container port mappings are
  handled by Docker's own NAT rules before ufw sees the packets, so a
  database started with `-p 27017:27017` is reachable from the internet
  even when `ufw status` says otherwise. Publish to loopback
  (`-p 127.0.0.1:27017:27017`) and rely on the cloud firewall.
- **Bind private services to loopback.** TaskFlow's Node.js instances
  listen on `127.0.0.1`, so even a firewall mistake cannot expose them;
  only nginx listens on public interfaces.

Network design across many servers (private subnets, security group
references, and egress control) is covered in
[network security in the cloud](../devsecops-and-cloud-security/network-security-in-the-cloud.md).

### Automatic security updates

Two systemd timers drive APT on Ubuntu: `apt-daily.timer` refreshes the
package lists and `apt-daily-upgrade.timer` runs `unattended-upgrade`,
each at a randomized time. The defaults install updates from the
release and its `-security` pocket (plus Ubuntu Pro's ESM origins when
attached) but not the general `-updates` pocket, and never from
third-party repositories such as NodeSource.

Three consequences shape the configuration:

- **Kernel and libc updates need a reboot.** Their packages create
  `/var/run/reboot-required`, and unattended-upgrades does not reboot
  unless you set `Unattended-Upgrade::Automatic-Reboot "true"`. Choose a quiet time
  with `Automatic-Reboot-Time`, and stagger it across servers so two
  instances never restart together.
- **Services restart on their own.** `needrestart` restarts services
  that still use replaced libraries. With two instances and graceful
  shutdown this is invisible; with one instance it is a short outage.
- **Patch policy lives elsewhere.** Severity-based deadlines, handling a
  critical CVE, and reporting belong to the process described in
  [vulnerability and patch management](../devsecops-and-cloud-security/vulnerability-and-patch-management.md);
  automatic updates are only the mechanism.

### Time synchronization

TLS certificate checks, JWT `exp` claims, TOTP codes, scheduled jobs,
and log correlation across servers all assume an accurate clock. New
Ubuntu 26.04 installations use **chrony** with **NTS**, which
authenticates the time servers so an attacker on the path cannot shift
your clock. The default sources are `1.ntp.ubuntu.com` to
`4.ntp.ubuntu.com` plus a bootstrap server, defined under
`/etc/chrony/sources.d/`. NTS performs its key exchange on TCP port
4460 and then uses UDP 123; if a restrictive egress firewall blocks
4460, chrony cannot authenticate its sources and the clock drifts.
Keep servers in **UTC**: logs line up across regions and daylight
saving time cannot run a job twice (see
[scheduled jobs and log rotation](scheduled-jobs-and-log-rotation.md)).
The protocol itself is covered in
[NTP and time synchronization](../../01-networking-and-protocols/ntp-and-time-synchronization.md).

### Swap and memory headroom

Many cloud images ship without swap. On a small VM, a short memory spike
(an `npm ci` during a deploy, a burst of large requests) then goes
straight to the out-of-memory killer. A modest swap file gives the
kernel somewhere to put rarely used pages, turning a crash into a slow
moment. It is a safety net, not extra capacity: a server that swaps
continuously is too small, and the troubleshooting lesson shows how to
spot that with `vmstat`.

- `mkswap --file --size 2G /swapfile` (util-linux 2.41 and later, as in
  Ubuntu 26.04) creates the file with safe permissions and fully
  allocated blocks. Files with holes, which `cp` and `truncate` create,
  are rejected by `swapon`.
- `vm.swappiness` (0 to 200, default 60) sets the relative cost the
  kernel assigns to swapping compared with dropping page cache. Lower
  values keep application memory in RAM longer.
- On Ubuntu 26.04, `/tmp` is a RAM-backed `tmpfs` (the upstream systemd
  `tmp.mount`, sized at up to 50% of RAM). Large temporary files consume
  memory, not disk; check with `findmnt /tmp`.

### fail2ban and connection penalties

With key-only SSH, password guessing cannot succeed, but it still fills
logs and uses CPU. Two layers reduce it:

- **OpenSSH's `PerSourcePenalties`** (on by default since 9.8) makes
  `sshd` itself refuse addresses that repeatedly fail.
- **fail2ban** watches logs and adds firewall bans. On Ubuntu 26.04 the
  package enables the `sshd` jail out of the box, reading the systemd
  journal (`backend = systemd`) and banning through nftables. Defaults:
  5 failures (`maxretry`) within 10 minutes (`findtime`) earn a
  10-minute ban (`bantime`). Your own changes go in
  `/etc/fail2ban/jail.local`, never in `jail.conf`.

Add your office or VPN range to `ignoreip`, or one colleague with a
stale key can ban the whole office behind its shared NAT address.

### Installing Node.js

| Method | What you get | Fit for a production VM |
|---|---|---|
| NodeSource apt repository | One Node.js major per repository (`node_24.x`), updated by apt, pinned above Ubuntu's own package | Good default: system-wide, scriptable, upgrades with apt |
| Official binaries from nodejs.org | A tarball for linux-x64 or linux-arm64 | Good when you need an exact version; you handle updates |
| Ubuntu archive `nodejs` | Node.js 22 from universe on 26.04 | Works, but the line ends in April 2027 and it is not the version the rest of this section uses |
| nvm, fnm, or mise | Per-user installs under a home directory | Developer machines; awkward for system services |
| Container image `node:24` | Node.js inside an image | When you deploy containers instead of processes |

NodeSource's setup script adds a signing key under
`/usr/share/keyrings/`, a deb822 source file
`/etc/apt/sources.list.d/nodesource.sources` with the `nodistro` suite,
and an APT pin (priority 600) so its `nodejs` beats Ubuntu's. It supports
amd64 and arm64. Read the script before running it as root; it is short.
This section's examples use Node.js 24 to match the CI pipelines; the
same steps with `setup_26.x` install the newer LTS line.

### The app user and the directory layout

![Diagram: a table of paths. /srv/taskflow is root-owned 0755 and holds releases 1.8.0 and 1.9.0, root-owned and read-only to the app, with 1.8.0 kept for rollback; the symlink current points to releases/1.9.0 and is switched atomically on deploy; /srv/taskflow/shared is owned by taskflow:taskflow 0750 and is the only path the app may write. /etc/taskflow is root-owned 0700 and holds api.env, root-owned 0600 with non-secret settings read by systemd, and credentials/mongodb-uri, root-owned 0600, a secret passed with LoadCredential. The unit file is root-owned 0644. At runtime systemd creates /run/credentials/taskflow-api@3001.service, a read-only copy only the app's user can read. /var/log/nginx holds www-data:adm 0640 files rotated daily, and /var/log/journal holds the app's stdout and stderr.](server-directory-layout.svg)

The layout follows one rule: **the app can read its code but not change
it**. Releases are extracted by root-owned deploy tooling, the app
writes only to `shared/`, and systemd's `ProtectSystem=strict` (next
lesson) enforces the same rule at the kernel level. The release
directories and the `current` symlink are what make the zero-downtime
deploy in
[running apps with systemd and nginx](running-apps-with-systemd-and-nginx.md)
possible.

### Configuration and secrets on the server

- **Non-secret settings** go in `/etc/taskflow/api.env`, read by systemd
  through `EnvironmentFile=`. systemd's parser accepts `KEY=value` lines
  and `#` comments but has its own quoting rules, so keep the file plain
  (the differences between `.env` parsers are in
  [.env files and precedence](../environment-variables/env-files-and-precedence.md)).
  The file can be `0600` and owned by root, because systemd reads it
  before it starts the process as the service user.
- **Secrets** are better passed as systemd credentials. The
  `systemd.exec` manual warns that "environment variables are not
  suitable for passing secrets": they are visible over D-Bus and
  inherited by every child process. With `LoadCredential=`, systemd
  reads a root-only file and gives the service a private, read-only copy
  under `$CREDENTIALS_DIRECTORY` that only the service's user can read.
- **Neither belongs in the release directory or in Git.** The source of
  truth for secrets is a secret manager; the file on the server is a
  delivery mechanism. Rotation and secret stores are covered in
  [secrets management](../environment-variables/secrets-management.md).

### Backups for a single server

| What | Where its backup comes from |
|---|---|
| MongoDB data | The managed service's continuous backups, or scheduled `mongodump` with point-in-time recovery ([database backups](../backups/database-backups-and-point-in-time-recovery.md)) |
| User uploads in `/srv/taskflow/shared` | Better stored in object storage from the start; otherwise synced to it on a schedule |
| `/etc/taskflow` configuration and secrets | The secret manager and the provisioning code, not the server |
| The server itself | Rebuilt from cloud-init or Ansible; a provider snapshot before risky changes for a fast way back |

A backup that lives only on the same disk, or that the server can delete
with its own credentials, does not survive the incidents that matter
(ransomware, a deleted volume, a compromised host). The scheduled job
that runs the dumps is in
[scheduled jobs and log rotation](scheduled-jobs-and-log-rotation.md);
restore drills are in
[restore testing and runbooks](../backups/restore-testing-and-runbooks.md).

## When to use and when not to use

| Situation | Approach |
|---|---|
| One to a few long-lived VMs | This checklist, captured as cloud-init user data or an Ansible playbook |
| A fleet behind a load balancer or an autoscaling group | A baked image (Packer) plus cloud-init for per-instance settings; never configure instances by hand ([autoscaling server fleets](../load-balancing-and-multi-server/autoscaling-server-fleets.md)) |
| Compliance requirements (SOC 2, PCI DSS, HIPAA) | The same baseline, verified by CIS benchmark tooling such as USG, with evidence kept |
| A team that does not want to operate servers | A PaaS or container platform; the provider owns this checklist ([choosing where to run software](../hosting-and-platforms/choosing-where-to-run-software.md)) |
| A quick throwaway experiment | Still key-only SSH and a firewall; skip the rest |

Do not configure production servers by hand and leave it at that. Hand
steps drift between servers and are forgotten during the 2 a.m. rebuild.
Run them by hand once to learn them, then encode them.

## Practical examples

### Step 1: first login and updates

```bash
# From your laptop, with the key you gave the provider
ssh ubuntu@203.0.113.10

# Refresh package lists, apply all updates (dist-upgrade = apt's full-upgrade), check for a reboot
sudo apt-get update
sudo apt-get dist-upgrade -y
[ -f /var/run/reboot-required ] && echo "reboot required" && sudo reboot

# Name the machine and keep it on UTC
sudo hostnamectl set-hostname taskflow-app-1
sudo timedatectl set-timezone Etc/UTC
```

Scripts use `apt-get` rather than `apt`: the `apt` manual says its
command line "may change behavior between versions" and points scripts
to `apt-get` and `apt-cache`.

### Step 2: a named admin user with your key

```bash
# Interactive: sets a password (used by sudo) and creates the home directory
sudo adduser ops
sudo usermod -aG sudo ops

# Group that may log in over SSH (used by AllowGroups in step 4)
sudo groupadd sshusers
sudo usermod -aG sshusers ops

# Install your public key for ops (or run ssh-copy-id from your laptop)
sudo install -d -m 700 -o ops -g ops /home/ops/.ssh
echo 'ssh-ed25519 <ops-public-key> ops laptop 2026' | sudo tee /home/ops/.ssh/authorized_keys > /dev/null
sudo chown ops:ops /home/ops/.ssh/authorized_keys
sudo chmod 600 /home/ops/.ssh/authorized_keys
```

### Step 3: test the new login before changing anything else

```bash
# From a SECOND terminal on your laptop; keep the first session open
ssh -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519_taskflow ops@203.0.113.10 'sudo -v && echo sudo works'
```

Only continue when this prints `sudo works`. The default `ubuntu` user
is not in `sshusers`, so the next step also stops it from logging in
over SSH.

### Step 4: harden SSH

Create `/etc/ssh/sshd_config.d/00-hardening.conf` with the settings from
[the hardening drop-in](ssh-and-remote-access.md#one-hardening-drop-in-for-sshd),
then:

```bash
sudo sshd -t && sudo systemctl reload ssh
sudo sshd -T | grep -Ei '^(permitrootlogin|passwordauthentication|allowgroups) '
# From a second terminal: a fresh login as ops must still work
```

### Step 5: firewalls, SSH first

```bash
# Host firewall: deny inbound by default, allow outbound
sudo ufw default deny incoming
sudo ufw default allow outgoing

# SSH only from the office VPN range, rate-limited; HTTP and HTTPS for everyone
sudo ufw limit proto tcp from 198.51.100.0/24 to any port 22 comment 'SSH from office VPN'
sudo ufw allow proto tcp from any to any port 80,443 comment 'HTTP and HTTPS'

# Enable (ufw asks for confirmation because you are connected over SSH)
sudo ufw enable
sudo ufw status verbose
```

Example output of `ufw status verbose`:

```text
Status: active
Logging: on (low)
Default: deny (incoming), allow (outgoing), disabled (routed)
New profiles: skip

To                         Action      From
--                         ------      ----
22/tcp                     LIMIT IN    198.51.100.0/24            # SSH from office VPN
80,443/tcp                 ALLOW IN    Anywhere                   # HTTP and HTTPS
80,443/tcp (v6)            ALLOW IN    Anywhere (v6)              # HTTP and HTTPS
```

If admins have no fixed address range, use `sudo ufw limit 22/tcp`
instead and rely on keys, `PerSourcePenalties`, and fail2ban. Mirror the
same rules in the cloud firewall, for example on AWS:

```bash
# Security group: SSH from the office range; repeat with --port 443 (and 80) and --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id sg-0123456789abcdef0 \
    --protocol tcp --port 22 --cidr 198.51.100.0/24
```

### Step 6: automatic security updates with a reboot window

```bash
# Confirm the periodic settings (installed and enabled by default on Ubuntu Server)
cat /etc/apt/apt.conf.d/20auto-upgrades
```

Example output:

```text
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
```

```text
// /etc/apt/apt.conf.d/52unattended-upgrades-local
// Read after 50unattended-upgrades, so these values win. app-2 uses 04:30.
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "03:30";
Unattended-Upgrade::Automatic-Reboot-WithUsers "true";
```

```bash
# What would be installed right now, without installing it
sudo unattended-upgrade -v --dry-run

# What it did on previous runs
sudo ls -l /var/log/unattended-upgrades/
systemctl list-timers 'apt-daily*'
```

APT reads the files in `/etc/apt/apt.conf.d/` in alphanumeric order and
later values override earlier ones, so a local file with a higher number
keeps your settings separate from the package's own file, which package
upgrades may replace.

### Step 7: check time synchronization

```bash
timedatectl status | grep -E 'Time zone|synchronized|NTP service'
chronyc -N tracking
sudo chronyc -N authdata
```

Example output (trimmed):

```text
                Time zone: Etc/UTC (UTC, +0000)
System clock synchronized: yes
              NTP service: active

Reference ID    : B97DBE7B (2.ntp.ubuntu.com)
System time     : 0.000000004 seconds slow of NTP time
Leap status     : Normal

Name/IP address             Mode KeyID Type KLen Last Atmp  NAK Cook CLen
=========================================================================
1.ntp.ubuntu.com             NTS     6   30  128  14d    0    0    8   64
```

`Mode NTS` with non-zero `KeyID`, `Type`, and `KLen` means the sources
are authenticated. If `authdata` shows no NTS keys and the clock is not
synchronized, check that outbound TCP 4460 and UDP 123 are allowed.

### Step 8: a swap file

```bash
# Create, enable, and persist a 2 GiB swap file
sudo mkswap --file --size 2G /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Prefer keeping application memory in RAM over swapping it out
echo 'vm.swappiness = 10' | sudo tee /etc/sysctl.d/90-swappiness.conf
sudo sysctl --system > /dev/null

swapon --show
free -h
```

Size it modestly: on a 2 GiB VM, 1 to 2 GiB of swap absorbs spikes; a
larger file mostly lets a leaking process thrash longer before the OOM
killer acts.

### Step 9: fail2ban

```bash
sudo apt-get install -y fail2ban
sudo fail2ban-client status sshd
```

```ini
# /etc/fail2ban/jail.local
[DEFAULT]
# Never ban localhost or the office VPN range
ignoreip = 127.0.0.1/8 ::1 198.51.100.0/24
bantime = 1h
findtime = 10m
maxretry = 5
```

```bash
sudo systemctl restart fail2ban
sudo fail2ban-client status sshd
# Unban an address that was banned by mistake
sudo fail2ban-client set sshd unbanip 203.0.113.55
```

Example output of `fail2ban-client status sshd`:

```text
Status for the jail: sshd
|- Filter
|  |- Currently failed: 2
|  |- Total failed:     341
|  `- Journal matches:  _SYSTEMD_UNIT=ssh.service + _COMM=sshd
`- Actions
   |- Currently banned: 3
   |- Total banned:     27
   `- Banned IP list:   203.0.113.55 203.0.113.81 203.0.113.140
```

### Step 10: Node.js 24 from NodeSource

```bash
# Download and read the setup script before running it as root
curl -fsSL https://deb.nodesource.com/setup_24.x -o /tmp/nodesource_setup.sh
less /tmp/nodesource_setup.sh
sudo bash /tmp/nodesource_setup.sh

sudo apt-get install -y nodejs
node --version
apt-cache policy nodejs
```

Example output of `apt-cache policy nodejs` (versions abbreviated):

```text
nodejs:
  Installed: 24.y.z-1nodesource1
  Candidate: 24.y.z-1nodesource1
  Version table:
 *** 24.y.z-1nodesource1 600
        600 https://deb.nodesource.com/node_24.x nodistro/main amd64 Packages
        100 /var/lib/dpkg/status
     22.22.1+dfsg+~cs22.19.15-1ubuntu1 500
        500 http://archive.ubuntu.com/ubuntu resolute/universe amd64 Packages
```

The priority 600 pin is why `apt-get install nodejs` picks NodeSource's
build over the Ubuntu archive's Node.js 22. Because unattended upgrades
ignore third-party origins by default, Node.js patch releases arrive
when you run `apt-get upgrade` yourself; schedule that like any deploy,
since `needrestart` will then restart the app.

### Step 11: the app user and directories

```bash
# System user and group: no login shell, no home directory
sudo adduser --system --group --no-create-home taskflow

# Code: root-owned, readable by everyone; data: writable only by the app
sudo install -d -m 0755 -o root -g root /srv/taskflow /srv/taskflow/releases
sudo install -d -m 0750 -o taskflow -g taskflow /srv/taskflow/shared

# Configuration and secrets: root only
sudo install -d -m 0700 -o root -g root /etc/taskflow /etc/taskflow/credentials

getent passwd taskflow
```

Example output of `getent passwd taskflow`:

```text
taskflow:x:998:998::/nonexistent:/usr/sbin/nologin
```

### Step 12: configuration and secret files

```bash
# /etc/taskflow/api.env: non-secret settings shared by every instance (PORT is set per instance)
sudo install -m 0600 -o root -g root /dev/null /etc/taskflow/api.env
sudo tee /etc/taskflow/api.env > /dev/null <<'EOF'
NODE_ENV=production
APP_ENV=production
LOG_LEVEL=info
CORS_ORIGINS=https://app.example.com
EOF

# Secret: create the file with mode 0600 FIRST, then paste the value (Ctrl+D to finish)
sudo install -m 0600 -o root -g root /dev/null /etc/taskflow/credentials/mongodb-uri
sudo tee /etc/taskflow/credentials/mongodb-uri > /dev/null
```

Creating the empty file with `install -m 0600` before writing means the
secret is never readable by others, not even for a moment, and pasting
it into `tee` keeps it out of your shell history. The unit file in the
next lesson loads it with
`LoadCredential=mongodb-uri:/etc/taskflow/credentials/mongodb-uri`, and
the app reads it like this:

```js
// src/config/credentials.js: read a systemd credential, falling back to an env var in development
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function credential(name, envFallback) {
  const dir = process.env.CREDENTIALS_DIRECTORY;
  if (dir) return readFileSync(join(dir, name), "utf8").trim();
  const value = process.env[envFallback];
  if (!value) throw new Error(`missing credential ${name} (or env ${envFallback})`);
  return value;
}

// Usage: const mongoUri = credential("mongodb-uri", "MONGODB_URI");
```

### Step 13: backups and a snapshot

Take a provider snapshot now that the baseline is complete; it is the
fastest way back if a later change goes wrong. Then confirm the database
backups exist and that a restore has been tested (the
[backups](../backups.md) section), and schedule any server-side dumps
with a systemd timer as shown in
[scheduled jobs and log rotation](scheduled-jobs-and-log-rotation.md).

### Step 14: audit the baseline

```bash
#!/usr/bin/env bash
# scripts/audit-baseline.sh: print this server's security baseline (read-only checks)
set -u
. /etc/os-release
echo "== OS: $PRETTY_NAME, kernel $(uname -r)"
echo "== Listening sockets";   sudo ss -tlnp
echo "== Firewall";            sudo ufw status verbose
echo "== SSH";                 sudo sshd -T | grep -Ei '^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication|allowgroups) '
echo "== Automatic updates";   cat /etc/apt/apt.conf.d/20auto-upgrades
[ -f /var/run/reboot-required ] && echo "!! reboot required"
echo "== Time";                timedatectl status | grep -E 'Time zone|synchronized'
echo "== Swap";                swapon --show
echo "== fail2ban";            sudo fail2ban-client status sshd | grep -E 'Currently|Total'
echo "== Node.js";             node --version
echo "== App user";            getent passwd taskflow
```

Keep the output with the server's record; running it again later shows
drift.

### The whole baseline as cloud-init user data

```yaml
#cloud-config
# user-data.yaml: the baseline from this lesson, applied once at first boot
# (cloud-init requires "#cloud-config" as the very first line)
hostname: taskflow-app-1
timezone: Etc/UTC
package_update: true
package_upgrade: true
package_reboot_if_required: true
packages:
  - fail2ban

groups:
  - sshusers

users:
  - name: ops
    groups: [sudo, sshusers]
    shell: /bin/bash
    lock_passwd: true
    sudo: "ALL=(ALL) NOPASSWD:ALL"
    ssh_authorized_keys:
      - ssh-ed25519 <ops-public-key> ops laptop 2026

ssh_pwauth: false
disable_root: true

write_files:
  - path: /etc/ssh/sshd_config.d/00-hardening.conf
    permissions: "0644"
    content: |
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
  - path: /etc/apt/apt.conf.d/52unattended-upgrades-local
    permissions: "0644"
    content: |
      Unattended-Upgrade::Automatic-Reboot "true";
      Unattended-Upgrade::Automatic-Reboot-Time "03:30";
  - path: /etc/fail2ban/jail.local
    permissions: "0644"
    content: |
      [DEFAULT]
      ignoreip = 127.0.0.1/8 ::1 198.51.100.0/24
      bantime = 1h

runcmd:
  - [ufw, default, deny, incoming]
  - [ufw, default, allow, outgoing]
  - [ufw, limit, proto, tcp, from, 198.51.100.0/24, to, any, port, "22"]
  - [ufw, allow, proto, tcp, from, any, to, any, port, "80,443"]
  - [ufw, --force, enable]
  - [mkswap, --file, --size, 2G, /swapfile]
  - [swapon, /swapfile]
  - [sh, -c, "echo '/swapfile none swap sw 0 0' >> /etc/fstab"]
  - [systemctl, try-reload-or-restart, ssh]
  - [systemctl, restart, fail2ban]
  - [sh, -c, "curl -fsSL https://deb.nodesource.com/setup_24.x -o /root/nodesource_setup.sh && bash /root/nodesource_setup.sh && apt-get install -y nodejs"]
  - [adduser, --system, --group, --no-create-home, taskflow]
```

Validate the file before you boot anything with it:
`cloud-init schema --config-file user-data.yaml`. Two choices here
differ from the manual walkthrough on purpose. The `ops` account has no
password, so it gets passwordless `sudo`, like the default cloud user;
compensate with hardware-backed keys or short-lived SSH certificates, or
set a password at first login. And `ufw --force enable` skips the
interactive prompt, which is only safe because the SSH rule is added
first. Directory creation and secrets are left to the deploy tooling and
the secret manager, which should never be baked into user data.

## Best practices

- Script the baseline (cloud-init, Ansible, or a baked image) and run it
  for every server; treat hand changes as drift.
- Do the access steps first, test each from a second terminal, and know
  where the provider console is before you start.
- One named admin account per person, keys only, root login refused,
  `AllowGroups` set.
- A cloud firewall in front of the VM plus ufw on the host, default deny
  inbound, and private services bound to `127.0.0.1`.
- Never publish container ports on all interfaces of an internet-facing
  host.
- Automatic security updates with a staggered reboot window, and services
  that restart gracefully.
- UTC everywhere, chrony with NTS, and an egress rule for TCP 4460.
- A modest swap file on small VMs, with alerts on sustained swapping.
- Node.js from a supported repository, upgraded deliberately.
- The app as a system user that cannot write its own code; secrets as
  systemd credentials, never in Git or the release directory.
- Backups stored off the server and restore-tested; a snapshot before
  risky changes.

## In production

- **Locked out right after enabling ufw.**
  *Detect:* new SSH connections time out; the existing session froze or
  dropped. *Cause:* `ufw enable` ran before an SSH rule existed, or the
  rule allows a different source range than your current address.
  *Fix:* use the provider console to `ufw allow` your range or
  `ufw disable`; next time add the SSH rule first and keep a second
  session open.
- **A database container is reachable from the internet although ufw
  denies the port.**
  *Detect:* an external port scan or a security alert shows 27017 open;
  `ufw status` does not list it. *Cause:* the container was published
  with `-p 27017:27017`, and Docker's rules handle published ports
  before ufw. *Fix:* publish to `127.0.0.1`, close the port in the cloud
  firewall, rotate the database credentials, and check access logs.
- **The API restarted in the middle of the day with no deploy.**
  *Detect:* the journal shows `taskflow-api@3001` stopping and starting
  at the time an apt run finished; `/var/log/apt/history.log` lists
  upgraded libraries. *Cause:* `needrestart` restarted services that
  used replaced libraries. *Fix:* expected behavior; make shutdown
  graceful and run two instances so restarts are invisible, and run
  manual upgrades in a planned window.
- **Kernel security fixes installed weeks ago but not running.**
  *Detect:* `/var/run/reboot-required` exists; `uname -r` is older than
  the installed kernel. *Cause:* automatic reboots are off. *Fix:*
  enable `Automatic-Reboot` with staggered times, or schedule reboots,
  and alert when the file has existed for more than a few days.
- **TLS handshakes and token validation fail on one server.**
  *Detect:* errors such as "certificate is not yet valid" or JWTs
  rejected as expired only on that host; `timedatectl` shows
  `System clock synchronized: no`. *Cause:* chrony cannot reach its NTS
  sources because egress TCP 4460 is blocked. *Fix:* allow outbound TCP
  4460 and UDP 123, or point chrony at internal time servers, then
  confirm with `chronyc -N authdata`.
- **The office cannot SSH in after one person's failed attempts.**
  *Detect:* `fail2ban-client status sshd` lists the office's public
  address. *Cause:* everyone shares one NAT address and a stale key
  produced repeated failures. *Fix:* unban it, add the office range to
  `ignoreip`, and remove the stale key from the colleague's agent.
- **The server crawls, then the OOM killer stops the API.**
  *Detect:* `vmstat 1` shows non-zero `si` and `so` columns for minutes;
  `journalctl -k` shows an out-of-memory kill. *Cause:* the working set
  no longer fits in RAM; swap only delayed the failure. *Fix:* find the
  memory consumer, cap it with `MemoryMax=`, and resize the VM.

## Important terminology

- **Baseline:** The minimum, repeatable configuration every server must
  have before it runs anything.
- **Cloud firewall / security group:** Provider-managed packet filtering
  in front of the VM.
- **ufw:** Ubuntu's uncomplicated firewall, a front end for the kernel's
  packet filter.
- **unattended-upgrades:** The service that installs security updates
  automatically on Debian and Ubuntu.
- **needrestart:** The tool that restarts services still using replaced
  libraries after an upgrade.
- **NTS (Network Time Security):** Authentication for NTP using a TLS
  key exchange on TCP 4460.
- **Swap file:** Disk space the kernel can move rarely used memory pages
  into.
- **tmpfs:** A RAM-backed file system; `/tmp` on Ubuntu 26.04.
- **System user:** An account for a service, with no login shell and
  usually no home directory.
- **systemd credential:** A secret that systemd reads as root and hands
  to one service as a private, read-only file.
- **cloud-init:** The tool that applies user data (users, files,
  packages, commands) on a cloud instance's first boot.

## Common mistakes and misconceptions

- Hardening SSH or enabling the firewall without a tested second way in.
- Believing ufw protects ports that Docker publishes.
- Leaving automatic reboots off forever, so patched kernels never run.
- Running the app as root, or as the admin user, "to avoid permission
  problems".
- Installing Node.js with a per-user version manager and pointing a
  system service at a path in someone's home directory.
- Writing secrets with `echo` on the command line, which stores them in
  shell history.
- Making the release directory writable by the app.
- Treating a provider snapshot as the backup strategy.
- Assuming the clock is right because the VM is in the cloud.

## Revision questions

1. Why must steps 3 to 5 come first, and what do you do before closing
   the session after each of them?
2. Explain why a port published by Docker can be reachable when
   `ufw status` does not allow it, and two ways to prevent it.
3. A 2 GiB VM runs two Node.js instances capped at 700 MiB each with
   `MemoryMax=`, nginx using about 50 MiB, and system services using
   about 250 MiB. How much RAM is left for the page cache and spikes, and
   what does a 2 GiB swap file change? (About 2048 - 1400 - 50 - 250 =
   348 MiB of headroom; swap absorbs short spikes but cannot fix a
   working set that no longer fits.)
4. What does `unattended-upgrades` install by default, what does it not
   install, and what must you configure for kernel fixes to take effect?
5. Why does chrony on Ubuntu 26.04 need outbound TCP 4460, and what
   breaks when it is blocked?
6. Why should `/etc/taskflow/credentials/mongodb-uri` be passed with
   `LoadCredential=` rather than placed in `api.env`?
7. Two servers both use `Automatic-Reboot-Time "03:30"`. What can go
   wrong, and how do you fix it?
8. Why does this lesson install Node.js from NodeSource rather than from
   the Ubuntu archive, and what keeps apt from picking the archive
   version?

## Further learning

- [Ubuntu Server: Automatic updates](https://ubuntu.com/server/docs/how-to/software/automatic-updates/)
- [Ubuntu Server: Firewalls](https://ubuntu.com/server/docs/how-to/security/firewalls/)
- [Ubuntu Server: Synchronize time using chrony](https://ubuntu.com/server/docs/how-to/networking/chrony-client/)
- [ufw(8) on Ubuntu 26.04](https://manpages.ubuntu.com/manpages/resolute/man8/ufw.8.html)
- [NodeSource distributions](https://github.com/nodesource/distributions)
- [cloud-init documentation](https://docs.cloud-init.io/en/latest/)
- [systemd.exec: credentials](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html#Credentials)
- Next: [running apps with systemd and nginx](running-apps-with-systemd-and-nginx.md). Back to the [Linux server operations overview](../linux-server-operations.md).
