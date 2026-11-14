# Linux Server Operations Cheat Sheet

Quick revision of the Linux server operations lessons, for the day before
an interview or a task on a server.

## Key commands

| Command | What it does |
|---|---|
| `ssh-keygen -t ed25519 -a 100 -f ~/.ssh/id_ed25519_taskflow` | Creates an Ed25519 key pair; `-a 100` slows passphrase guessing |
| `ssh -J ops@203.0.113.20 ops@10.0.2.10` | Reaches a private server through a bastion (`ProxyJump`) |
| `ssh -N -L 127.0.0.1:3300:10.0.2.30:3000 taskflow-bastion` | Forwards a local port to a private service |
| `sudo sshd -t && sudo systemctl reload ssh` | Validates the sshd configuration, then reloads it |
| `sudo sshd -T` | Prints the effective sshd settings after all drop-ins |
| `sudo systemctl daemon-reload` | Loads changed unit files |
| `journalctl -u 'taskflow-api@*' -f` | Follows the logs of every instance |
| `sudo systemctl reset-failed taskflow-api@3001` | Clears `start-limit-hit` so the unit can start again |
| `sudo nginx -t && sudo systemctl reload nginx` | Tests the configuration, then reloads gracefully |
| `systemd-analyze calendar --iterations=3 'Mon..Fri *-*-* 02:30:00 UTC'` | Shows the next runs of a timer schedule |
| `sudo logrotate -d /etc/logrotate.d/taskflow-worker` | Dry run of one logrotate rule |
| `sudo lsof +L1` | Deleted files that a process still holds open |

```bash
# The first minute on a slow server
uptime                    # load averages over 1, 5, 15 minutes
sudo dmesg -T | tail      # OOM kills, I/O errors
vmstat 1 5                # r, b, si/so, wa, st
mpstat -P ALL 1           # one CPU at 100% while others idle?
pidstat 1                 # which process is busy
iostat -xz 1              # r_await, w_await, aqu-sz per device
free -h                   # read "available", not "free"
sar -n TCP,ETCP 1         # retransmits
df -h; df -i              # space and inodes
sudo du -xh -d1 / | sort -h | tail -n 10   # where the space went
```

## Key configuration

```ini
# /etc/systemd/system/taskflow-api@.service (excerpt)
[Unit]
StartLimitIntervalSec=120
StartLimitBurst=5

[Service]
User=taskflow
EnvironmentFile=/etc/taskflow/api.env
Environment=PORT=%i HOST=127.0.0.1
LoadCredential=mongodb-uri:/etc/taskflow/credentials/mongodb-uri
ExecStart=/usr/bin/node --max-old-space-size=448 src/server.js
Restart=on-failure
RestartSec=2s
TimeoutStopSec=30s
MemoryHigh=600M
MemoryMax=700M
```

Release switch: `ln -sfn` to `current.tmp`, then `mv -T` onto `current`,
so the symlink changes atomically.

## Decision guide

| If you need | Choose | Why |
|---|---|---|
| Admin access for a small team | Key-only SSH (Ed25519 with a passphrase), port 22 limited to known ranges | Removes password guessing |
| Access to private servers | A bastion with `ProxyJump` | Agent forwarding lets root on the bastion use your agent |
| Protection for Docker-published ports | A cloud firewall | Docker's rules apply before ufw's |
| A deploy without downtime on one host | Two instances, a rolling restart, an atomic symlink | One instance always serves |
| A job that needs app configuration | A systemd timer with `EnvironmentFile=` and `LoadCredential=` | No overlap, catch-up, `OnFailure=` alerts |
| A job on several servers that must run once | A lock in MongoDB (`updateOne` with upsert) or a managed scheduler | Every server's cron fires otherwise |
| Rotation for a program that can reopen logs | logrotate `create` plus a reopen signal | `copytruncate` can lose lines |

## Numbers and defaults to remember

- systemd: `RestartSec=` 100 ms; start limit 5 starts in 10 s;
  `TimeoutStopSec=` 90 s; `LimitNOFILE=` 1024:524288 (Node raises its
  soft limit to the hard limit).
- journald: 10,000 messages per 30 s per service, multiplied by 1 to 6
  for free disk space; `SystemMaxUse=` 10% of the file system, at most
  4 GiB.
- nginx: `proxy_read_timeout` 60 s; client `keepalive_timeout` 75 s;
  default `gzip_types` is `text/html` only. Upstream keepalive (60 s)
  must stay below Node's `keepAliveTimeout` (65 s in TaskFlow).
- cron: `PATH=/usr/bin:/bin`, `sh` (dash on Ubuntu), `%` ends the command
  (`date +\%F`), and day-of-month OR day-of-week when both are set.
  `/etc/cron.d` file names must not contain dots.
- chrony with NTS needs outbound TCP 4460 as well as UDP 123.
- Load average counts runnable tasks and tasks in uninterruptible sleep
  (`D`); compare it with the CPU count.
- Node.js: Node 24 is maintenance LTS, Node 26 is active LTS; Ubuntu
  26.04's own package is Node 22 (end of life April 2027), so use
  NodeSource.

## Top mistakes

- **Hardening `sshd_config` while `50-cloud-init.conf` sets the value
  first.** Use `00-hardening.conf` and check with `sshd -T`.
- **Changing the SSH port the classic way on Ubuntu.** `ssh.socket` owns
  the port: `daemon-reload`, then restart `ssh.socket`.
- **Trusting ufw for container ports.** Use the cloud firewall, or
  publish on `127.0.0.1`.
- **Putting `PORT` in the shared `EnvironmentFile=`.** It overrides
  `Environment=`; keep per-instance values in the unit.
- **Editing a unit without `daemon-reload`.** systemd keeps running the
  old definition.
- **Deleting a log file that is still open.** The space stays used;
  find it with `lsof +L1` and rotate with logrotate.
- **A job that works in your shell but not in cron.** Set `PATH`, escape
  `%`, and send output to the journal with `systemd-cat`.
- **Overlapping runs of a slow job.** Use `flock -n` or a systemd timer.

## Where to go deeper

- [SSH and remote access](ssh-and-remote-access.md)
- [Setting up a production server](setting-up-a-production-server.md)
- [Running apps with systemd and nginx](running-apps-with-systemd-and-nginx.md)
- [Troubleshooting CPU, memory, disk, and network](troubleshooting-cpu-memory-disk-and-network.md)
- [Scheduled jobs and log rotation](scheduled-jobs-and-log-rotation.md)
- [Linux server operations interview questions and answers](interview-questions-and-answers.md)

Back to the [Linux server operations overview](../linux-server-operations.md).
