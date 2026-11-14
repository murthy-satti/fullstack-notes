# Linux Server Operations

Linux server operations is the work of running software on Linux machines
you manage yourself: reaching them securely over SSH, turning a fresh
virtual machine into a hardened server, running applications as
supervised services behind a reverse proxy, scheduling jobs, keeping logs
and disks under control, and finding out quickly what is wrong when
something breaks. Even teams that deploy only containers rely on these
skills, because every container host, Kubernetes node, and CI runner is a
Linux server underneath. This section uses Ubuntu Server 26.04 LTS
("Resolute Raccoon", released in April 2026 and supported until 2031) and
the TaskFlow API as its running example.

## What Linux server operations provide

- **Full control at a predictable price:** one virtual machine can run
  nginx, two Node.js instances, and scheduled jobs; you choose versions,
  limits, and tuning, and you pay for the VM, not per request.
- **An understanding of what platforms do for you:** a PaaS or Kubernetes
  restarts crashed processes, collects logs, and terminates TLS. On a
  server you configure each of those yourself, which teaches you what to
  expect, and what to check, on any platform.
- **Debugging skills that transfer:** `uptime`, `free`, `df`, `ss`, and
  `journalctl` work the same on a VPS, a container host, and a Kubernetes
  node.
- **A secure baseline:** key-only SSH, a default-deny firewall, automatic
  security updates, and services that run as unprivileged users.

The price of that control is ownership: patching, monitoring, backups,
capacity, and being on call for the machine are your job. Choosing between
a VM and a managed platform is covered in
[running backend servers and APIs](hosting-and-platforms/running-backend-servers-and-apis.md).

## How a typical Linux server works

1. An engineer connects from a laptop with `ssh` and an Ed25519 key.
   Password logins and direct root logins are disabled.
2. The cloud firewall and `ufw` on the host allow only SSH (ideally from
   known addresses), HTTP, and HTTPS. Everything else is dropped.
3. A user's HTTPS request reaches nginx on port 443, which terminates TLS,
   enforces body-size limits and timeouts, and proxies the request to the
   app on `127.0.0.1`.
4. systemd runs two TaskFlow API instances (`taskflow-api@3001` and
   `taskflow-api@3002`) as the unprivileged `taskflow` user, restarts an
   instance if it crashes, and stops instances gracefully during deploys.
5. Everything the app writes to stdout and stderr lands in the systemd
   journal, read with `journalctl`; nginx writes its own access and error
   logs, which logrotate rotates daily.
6. systemd timers start scheduled work: database backups, log rotation,
   certificate renewal, and apt's automatic security updates.

![Diagram: an engineer's laptop connects over SSH with an Ed25519 key and users send HTTPS requests; both pass a cloud firewall and ufw that leave only ports 22, 80, and 443 open; inside the Ubuntu 26.04 LTS server, sshd accepts keys only and no root login, and the engineer uses systemctl and journalctl from that session; nginx on port 443 terminates TLS and proxies to 127.0.0.1 ports 3001 and 3002; systemd supervises the taskflow-api@3001 and taskflow-api@3002 instances running Node 24 as the taskflow user, restarting them on a crash and stopping them gracefully on deploys; their output goes to journald; systemd timers start backups, log rotation, and apt updates; the app talks to a managed MongoDB replica set over TLS on a private network.](linux-server-operations-overview.svg)

## Practical example

The first minute on an unfamiliar server: what is it, is anything
broken, and what is listening?

```bash
# first-look.sh: read-only checks to run when you log in to a server
hostnamectl                               # OS release, kernel, virtualization
uptime                                    # load averages over 1, 5, and 15 minutes
systemctl --failed                        # units that crashed or failed to start
systemctl status 'taskflow-api@*'         # the app instances: state, PID, memory, last log lines
journalctl -u 'taskflow-api@*' --since "1 hour ago" --no-pager | tail -n 50
sudo ss -tlnp                             # listening TCP ports and the process behind each
df -h / && free -h                        # disk and memory headroom
```

Every command only reads state, so the checklist is safe on a production
machine. `journalctl` stores a Node.js app's output at the `info`
priority unless the app adds a priority prefix, so filtering with
`-p err` hides its errors; search the structured log fields instead, as
the troubleshooting lesson shows.

## Linux server operations topic map

**Access and setup**

- [SSH and remote access](linux-server-operations/ssh-and-remote-access.md)
- [Setting up a production server](linux-server-operations/setting-up-a-production-server.md)

**Running applications**

- [Running apps with systemd and nginx](linux-server-operations/running-apps-with-systemd-and-nginx.md)

**Day-to-day operations**

- [Troubleshooting CPU, memory, disk, and network](linux-server-operations/troubleshooting-cpu-memory-disk-and-network.md)
- [Scheduled jobs and log rotation](linux-server-operations/scheduled-jobs-and-log-rotation.md)

**Review**

- [Linux server operations interview questions and answers](linux-server-operations/interview-questions-and-answers.md) · [cheat sheet](linux-server-operations/cheat-sheet.md)

## Developer perspective and common misconceptions

Treat a server as something you can rebuild from a script in minutes, not
a pet you repair by hand. Keep its setup in a script or in
[infrastructure as code](infrastructure-as-code.md), keep secrets out of
Git, ship logs off the machine, and back up data to somewhere the server
cannot delete. The concepts underneath (processes, memory, file systems)
are introduced in the
[Operating Systems and Linux](../09-operating-systems-and-linux/index.md)
section; this section applies them to a production server.

- "The cloud provider secures the server." The provider secures the
  hypervisor and network; the operating system, SSH, firewall rules, and
  patches are yours.
- `free` showing almost no free memory is normal: Linux uses spare RAM as
  page cache. The `available` column is the number that matters.
- A process running in `tmux` or with `nohup` is not a service. It does
  not restart after a crash or a reboot; systemd does both.
- Changing the SSH port is not a security control on its own; key-only
  authentication is.
- A high load average does not always mean busy CPUs. On Linux it also
  counts tasks waiting on disk I/O.
- Containers do not remove the need for these skills; the host still needs
  patching, disk space, and log rotation.

## Further learning

- [Ubuntu Server documentation](https://ubuntu.com/server/docs)
- [systemd manual pages](https://www.freedesktop.org/software/systemd/man/latest/)
- [nginx documentation](https://nginx.org/en/docs/)
- [OpenSSH manual pages](https://www.openssh.org/manual.html)
- [Linux server operations interview questions and answers](linux-server-operations/interview-questions-and-answers.md)
