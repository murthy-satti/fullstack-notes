# Production Server from Scratch

Turn a fresh Ubuntu LTS virtual server into a hardened home for TaskFlow
API: locked-down SSH, a firewall, automatic security updates, a hardened
systemd service behind Nginx, one-command rollbacks, rotated logs, and a
nightly job that never overlaps. Then break the server on purpose and
diagnose it.

## Why this project helps

- Builds the Linux operations skills that sit under every platform:
  users, SSH, firewalls, systemd, Nginx, cron, and logs.
- Improves **security**: key-only SSH, a default-deny firewall, and
  automatic patches remove the most common ways servers are taken over.
- Improves **recovery speed**: release folders with a symlink switch make a
  rollback one command, and practiced troubleshooting shortens outages.
- "The disk is full, what do you do?" is a classic interview question.

## What you need

- The smallest virtual server from any cloud or VPS provider, on a current
  Ubuntu LTS image, and an SSH key pair.
- The TaskFlow API code and a MongoDB it can reach (a managed free tier or
  a local container).
- Builds on [Ship It Pipeline](ship-it-pipeline.md).

## How to do it

1. Create a non-root user with sudo, copy your public key, and set
   `PasswordAuthentication no` and `PermitRootLogin no`; see
   [SSH and remote access](../linux-server-operations/ssh-and-remote-access.md).
2. Follow [setting up a production server](../linux-server-operations/setting-up-a-production-server.md):
   enable `ufw` with default deny incoming, add fail2ban, and confirm
   unattended-upgrades applies security updates.
3. Install Node.js 24 by a supported method (the lesson uses NodeSource) and
   create a dedicated app user and directories.
4. Run TaskFlow under a systemd unit with restart, an environment file, and
   hardening options, and check it with `systemd-analyze security`; see
   [running apps with systemd and Nginx](../linux-server-operations/running-apps-with-systemd-and-nginx.md).
5. Put Nginx in front as a reverse proxy, with timeouts and body size
   limits.
6. Deploy into timestamped release folders and switch a `current` symlink
   with `ln -sfn`; a rollback points it back and restarts the service.
7. Add a logrotate rule and limit journald's disk use; schedule the nightly
   job with `flock -n` (or a systemd timer) so runs cannot overlap; see
   [scheduled jobs and log rotation](../linux-server-operations/scheduled-jobs-and-log-rotation.md).
8. Fill the disk with `fallocate` and exhaust memory with a test process,
   then diagnose with `df -h`, `du`, `free -h`, `dmesg`, and `journalctl`
   using [troubleshooting CPU, memory, disk, and network](../linux-server-operations/troubleshooting-cpu-memory-disk-and-network.md).

## Done when

- SSH accepts only keys for the non-root user; root and password logins
  fail.
- Only SSH, HTTP, and HTTPS are reachable from the internet.
- TaskFlow restarts automatically after a crash or a reboot.
- A deploy and a rollback each take one command and drop no requests.
- The nightly job never runs twice at once, and logs rotate.
- You found the cause of the full disk and the memory exhaustion from the
  tools, not from memory.

## Stretch goals

- Script the whole setup with cloud-init or Ansible and rebuild the server.
- Add a second server and move to
  [Three Servers, One Address](three-servers-one-address.md).

## Lessons to use

- [Linux Server Operations](../linux-server-operations.md)
- [Servers](../../07-servers-and-infrastructure/servers.md) and
  [Nginx](../../07-servers-and-infrastructure/nginx.md)

Back to [all projects](../projects.md).
