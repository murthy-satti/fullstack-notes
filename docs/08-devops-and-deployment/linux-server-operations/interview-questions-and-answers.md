# Linux Server Operations Interview Questions and Answers

These questions review SSH and remote access, setting up a production
server, running apps with systemd and nginx, troubleshooting CPU,
memory, disk, and network, and scheduled jobs and log rotation. Try
answering each one before reading the answer.

## SSH and remote access

### 1. What happens, in order, when you connect with `ssh`?

A TCP connection to port 22, an exchange of versions and algorithm
lists, and a key exchange (by default `mlkem768x25519-sha256` since
OpenSSH 10.0) that gives both sides session keys. The server signs the
exchange with its host key, which the client checks against
`known_hosts`. Only then does the user authenticate, for example by
proving possession of a private key. Finally the connection carries
channels: a shell, commands, port forwards, or SFTP.

### 2. Why is key-based login safer than passwords, even if you accept an impostor's host key?

A password is sent to whoever answers, so an impostor learns it. With
public key authentication the client only sends a signature over data
that includes the session identifier, which is useless for any other
session, and the private key never leaves the client.

### 3. Which key type should you generate today, and how do you protect it?

Ed25519 (`ssh-keygen -t ed25519`, the default in current OpenSSH), or
`ed25519-sk` on a FIDO2 security key for administrators. Protect the file
with a passphrase (`-a` raises the key-derivation rounds), keep `~/.ssh`
at `700` and private keys at `600`, and use one key per person and
device so access can be revoked individually.

### 4. What does `ssh-agent` do, and why is agent forwarding risky?

The agent holds decrypted keys in memory and signs on request.
Forwarding it (`-A`) exposes a socket on the remote host; anyone with
root there cannot copy the keys but can use them to log in elsewhere
while you are connected. Use `ProxyJump` instead.

### 5. How does `ProxyJump` work?

The client opens an SSH session to the jump host, asks it to open a TCP
connection to the target's port 22, and runs a second, end-to-end
encrypted SSH session through it. Authentication uses keys on your
laptop, and the bastion only relays bytes it cannot read. The bastion
needs `AllowTcpForwarding local` (or `yes`).

```text
# ~/.ssh/config
Host taskflow-app-*
    ProxyJump taskflow-bastion
```

### 6. What does "REMOTE HOST IDENTIFICATION HAS CHANGED" mean, and what do you do?

The server presented a different host key than the one in
`known_hosts`: either it was rebuilt, or someone is intercepting the
connection. Verify the new fingerprint out of band (the provider's
console log, or `ssh-keygen -lf` on the host key through the console),
then `ssh-keygen -R host` and reconnect. Host certificates remove the
problem for rebuilt servers.

### 7. Why might `sshd` still accept passwords after you set `PasswordAuthentication no`?

For most keywords `sshd` uses the first value it reads, and Ubuntu
includes `/etc/ssh/sshd_config.d/*.conf` at the top of the main file.
A drop-in such as `50-cloud-init.conf` can set `yes` first. Put your
settings in a file that sorts earlier (`00-hardening.conf`) and confirm
with `sudo sshd -T`.

### 8. Explain local, remote, and dynamic port forwarding.

`-L` makes your machine listen and the SSH server connect onward (reach a
private admin UI or database). `-R` makes the server listen and send
connections back to your side (bound to the server's loopback by
default). `-D` turns your machine into a SOCKS proxy whose connections
the server makes. `-N` skips the remote command.

### 9. What problem do SSH certificates solve?

They replace per-server `authorized_keys` lists. A CA signs a user's key
with a key ID, principals, and a validity window; servers trust the CA
through `TrustedUserCAKeys` and map principals with
`AuthorizedPrincipalsFile`. With 40 engineers and 30 servers that is one
trusted key instead of 1,200 entries, and access ends when a short-lived
certificate expires. Host certificates (`@cert-authority` in
`known_hosts`) remove trust on first use.

### 10. How can you reach servers without any open SSH port?

AWS Systems Manager Session Manager (an agent connects outward; IAM
decides who may start sessions), EC2 Instance Connect Endpoint (an
identity-aware TCP proxy into the VPC), Google Cloud IAP TCP forwarding
(port 22 open only to Google's `35.235.240.0/20`), and Azure Bastion.
Session Manager cannot log sessions used for SSH or port forwarding,
because they are encrypted end to end.

### 11. How do you let CI deploy over SSH without giving it a shell?

A dedicated key in the deploy account's `authorized_keys` with
`restrict,command="/usr/local/sbin/taskflow-deploy-gate"`. The gate
validates `$SSH_ORIGINAL_COMMAND` (for example a version string) and
runs one root-owned deploy script through a narrow sudoers rule. CI
pins the server's host key in `known_hosts` and uses
`StrictHostKeyChecking=yes`.

## Setting up a production server

### 12. Why does the order of setup steps matter on a fresh server?

Updates, a named admin user with a key, a tested key login, SSH
hardening, and the firewall each change how you reach the machine. Done
in the wrong order (passwords disabled before a key works, the firewall
enabled before SSH is allowed) they lock you out. Test each from a
second terminal, and know where the provider's console is.

### 13. Why use both a cloud firewall and ufw?

The cloud firewall (security group) drops traffic before it reaches the
VM, lives in the provider's API and Terraform, and keeps working if
someone disables the host firewall. ufw protects the host itself and
travels with the machine. Defense in depth: each layer catches the
other's mistakes.

### 14. How can a Docker container be reachable on a port ufw denies?

Ports published with `-p` are handled by Docker's own NAT rules before
ufw's rules see the packets; Docker's documentation calls the two
"incompatible". Publish to loopback (`-p 127.0.0.1:27017:27017`) and rely
on the cloud firewall.

### 15. What do unattended upgrades do by default on Ubuntu, and what do they not do?

They install updates from the release and `-security` pockets (and
Ubuntu Pro's ESM origins when attached) daily, through
`apt-daily.timer` and `apt-daily-upgrade.timer`. They do not install
from third-party repositories such as NodeSource, and they do not
reboot unless `Unattended-Upgrade::Automatic-Reboot` is set, so new
kernels wait. Since Ubuntu 24.04, `needrestart` restarts affected
services automatically.

### 16. Why does accurate time matter, and what keeps it on Ubuntu 26.04?

TLS validity checks, JWT expiry, TOTP codes, schedules, and log
correlation all depend on it. New Ubuntu 26.04 installations use chrony
with Network Time Security against Ubuntu's servers, which needs
outbound TCP 4460 for the key exchange plus UDP 123. Keep servers on UTC.

### 17. When does a swap file help, and when does it hurt?

On a small VM it absorbs short memory spikes that would otherwise end in
an OOM kill. It hurts when the working set no longer fits: continuous
swapping (`vmstat` `si`/`so` above 0) makes everything slow and only
delays the OOM killer. Keep it modest and alert on sustained swapping.

### 18. What does fail2ban add when SSH already accepts keys only?

Guessing cannot succeed, but it fills logs and costs CPU. OpenSSH's
`PerSourcePenalties` (on by default since 9.8) refuses repeat offenders
inside `sshd`; fail2ban adds firewall bans and can watch other logs such
as nginx. On Ubuntu 26.04 its `sshd` jail is enabled by default, reading
the journal. Put office and VPN ranges in `ignoreip`.

### 19. How should Node.js be installed on an Ubuntu server?

From a supported repository with one major per channel, such as
NodeSource's `node_24.x` apt repository (pinned above Ubuntu's own
package), or from nodejs.org's official binaries. Ubuntu 26.04's archive
ships Node.js 22, whose line ends in April 2027; per-user version
managers like nvm suit developer machines, not system services.

### 20. How should the application's users and files be laid out?

The app runs as a system user with no shell and no home. Releases live in
root-owned, read-only directories with a `current` symlink, the app may
write only to a `shared/` directory, and configuration and secrets sit in
root-only files under `/etc/taskflow`. The app can run its code but never
change it.

### 21. Where do configuration and secrets go, and with which permissions?

Non-secret settings in an `EnvironmentFile=` such as
`/etc/taskflow/api.env`, root-owned, because systemd reads it before
starting the process. Secrets as systemd credentials:
`LoadCredential=` reads a root-only file and gives the service a private
read-only copy under `$CREDENTIALS_DIRECTORY`. The systemd manual warns
that environment variables "are not suitable for passing secrets".
Create secret files with `install -m 0600` before writing them.

## Running apps with systemd and nginx

### 22. Why run a Node.js app under systemd instead of `nohup` or `tmux`?

systemd restarts it after crashes and at boot, runs it as a dedicated
user, captures its output in the journal, enforces memory and CPU limits
through cgroups, sandboxes it, and stops it gracefully with a timeout.
A process in `tmux` gets none of that.

### 23. What is a template unit, and why use one for an API?

A unit named with `@`, such as `taskflow-api@.service`, from which
instances like `taskflow-api@3001` are started; `%i` expands to the
instance name. One file runs several instances, each with its own port,
process, restart counter, and logs, so one can restart while another
serves.

### 24. What is the difference between `Type=simple`, `Type=exec`, and `Type=notify`?

`simple` treats the service as started once `fork()` returns, so even a
missing binary looks like a success. `exec` waits until the program has
been executed and is the recommended choice for long-running services.
`notify` waits for the process to report `READY=1`, which Node.js cannot
do without a library. None of them mean "ready to serve"; health checks
do.

### 25. What do `Restart=on-failure` and the start limit do?

`on-failure` restarts after unclean exit codes, signals, timeouts,
watchdog expiry, and OOM kills, after `RestartSec=` (100 ms by default;
`RestartSteps=` and `RestartMaxDelaySec=` add backoff). If a unit starts
more than `StartLimitBurst=` times within `StartLimitIntervalSec=`
(defaults: 5 in 10 seconds) it stops with `start-limit-hit` until
`systemctl reset-failed`.

### 26. How does systemd stop a service, and how must the timeouts line up?

It sends `KillSignal=` (`SIGTERM`) to the processes of the unit's cgroup
and waits `TimeoutStopSec=` (default 90 seconds) before `SIGKILL`. The
app's drain delay plus its longest request plus cleanup must fit inside
its own deadline, which must be shorter than `TimeoutStopSec`.

### 27. How do `EnvironmentFile=`, `Environment=`, and `LoadCredential=` interact?

Values from `EnvironmentFile=` override `Environment=`, so per-instance
values such as `PORT=%i` must not appear in the shared file. Environment
changes take effect on restart; unit file changes need `systemctl
daemon-reload` first. Secrets belong in `LoadCredential=`, not in either
environment setting.

### 28. What is the difference between `MemoryHigh=` and `MemoryMax=`?

Above `MemoryHigh=` the kernel throttles the unit and reclaims its memory
aggressively; at `MemoryMax=` the OOM killer is invoked inside the unit,
and systemd records the result `oom-kill`. Keep V8's
`--max-old-space-size` well below `MemoryHigh=` so garbage collection
works harder before the cgroup throttles.

### 29. Which systemd sandboxing settings suit a Node.js API, and which break it?

Safe: `NoNewPrivileges`, `ProtectSystem=strict` with `ReadWritePaths=`,
`ProtectHome`, `PrivateTmp`, `PrivateDevices`, the `Protect*` kernel
settings, `RestrictAddressFamilies` (including `AF_NETLINK`), an empty
`CapabilityBoundingSet`, and `SystemCallFilter=@system-service`. Breaks
it: `MemoryDenyWriteExecute=yes`, because V8 is a JIT, and
`ProcSubset=pid`, which hides the `/proc/stat` that `os.cpus()` reads.

### 30. Why does `journalctl -p err` show none of a Node.js app's errors?

journald stores every line from stdout and stderr at priority `info`
unless the line starts with a prefix such as `<3>`. Filter on the
structured log level instead (`journalctl -u 'taskflow-api@*' -g
'"level":50'`) or emit prefixes.

### 31. Why put nginx in front of Node.js on the same server?

It terminates TLS, buffers slow clients so the event loop is not tied up
by them, rejects oversized bodies (`client_max_body_size`), compresses
responses, balances between instances, and retries a failed connection
on the other instance. Node.js then listens only on `127.0.0.1`.

### 32. What is the `proxy_set_header` inheritance trap?

`proxy_set_header` directives are inherited from the enclosing level only
if the current level defines none. A `location` that sets `Upgrade` and
`Connection` silently loses `X-Forwarded-For` and `X-Forwarded-Proto`.
Put the common headers in a snippet and `include` it in every proxied
location.

### 33. How do you proxy WebSockets through nginx?

Use HTTP/1.1 to the upstream and pass the hop-by-hop headers explicitly,
with a map so non-upgrade requests get `Connection: close`, and raise the
read timeout for long-lived sockets:

```nginx
# /etc/nginx/sites-available/ws-example.conf (WebSocket proxying essentials)
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 8080;
    server_name ws.example.com;

    location /ws/ {
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 1h;
        proxy_pass http://127.0.0.1:3001;
    }
}
```

### 34. Why might nginx not compress JSON responses?

Ubuntu's `nginx.conf` turns `gzip on` but leaves `gzip_types` commented
out, and the default `gzip_types` is `text/html` only. Add
`application/json`. `gzip_proxied` is a different setting: it concerns
requests that arrived through another proxy (with a `Via` header), such
as a CDN.

### 35. What changed in nginx 1.29.7 for reverse proxies?

Upstream keep-alive is enabled by default, `proxy_http_version` defaults
to 1.1, and the `Connection` header is no longer sent by default. Ubuntu
26.04 ships nginx 1.28.3, so configurations still need
`proxy_http_version 1.1`, an empty `Connection` header, and `keepalive`
in the upstream; they are harmless on newer versions.

### 36. How do you deploy with zero downtime on a single server?

Unpack each release into its own read-only directory, run
backward-compatible migrations once, switch the `current` symlink
atomically (`ln -sfn` to a temporary name, then `mv -T`), and restart the
two instances one at a time, waiting for `/readyz` and the new
`/version` before the next. nginx sends traffic to whichever instance
accepts connections; on failure, switch back and restart again.

### 37. When would you choose PM2 over plain systemd?

PM2's cluster mode is the simplest way to share one port across all
cores, and `pm2 reload` gives zero-downtime restarts with no script. But
it is another daemon (itself started by systemd), keeps logs in files
that need rotation, and offers no kernel-enforced limits or sandboxing.
systemd alone does the same supervision with fewer moving parts.

## Troubleshooting CPU, memory, disk, and network

### 38. What do you run in the first minute on a slow server?

The Netflix list: `uptime`, `dmesg -T | tail`, `vmstat 1`,
`mpstat -P ALL 1`, `pidstat 1`, `iostat -xz 1`, `free -m`,
`sar -n DEV 1`, `sar -n TCP,ETCP 1`, and `top`, ideally from a script
that saves the output before anything is restarted.

### 39. What does the load average measure on Linux?

Exponentially damped averages, over 1, 5, and 15 minutes, of tasks that
are running, runnable, or in uninterruptible sleep (usually waiting for
I/O). A load of 8 on 4 CPUs can mean busy CPUs or a stalled disk; the CPU
split in `vmstat` (`us`, `sy`, `wa`) tells which.

### 40. The API is slow but the 8-core server is only 12% busy. Why?

One Node.js instance runs JavaScript on a single thread, so it can be
saturated at 100% of one core while the machine is mostly idle.
`mpstat -P ALL 1` or `top` shows the pinned core. Profile it, move CPU
work to worker threads, and run one instance per core.

### 41. What is the difference between "free" and "available" memory?

Free is RAM nobody uses at all; Linux keeps it small by caching files.
Available is the kernel's estimate of memory usable for new work without
swapping: free memory plus page cache it can drop. Judge memory pressure
by available, swap activity, and OOM messages.

### 42. How does the OOM killer choose a victim, and how do you tell a global OOM from a cgroup OOM?

It kills the process with the highest badness score, roughly its share of
memory adjusted by `oom_score_adj` (-1000 to +1000; -1000 exempts it).
The kernel log says "Out of memory: Killed process" for the whole
machine and "Memory cgroup out of memory: Killed process" when one unit
reached its `MemoryMax=`.

### 43. Why can `df` and `du` disagree, and why can a write fail while `df -h` shows free space?

`du` adds up files it can reach through directory entries; `df` asks the
file system how many blocks are allocated. A deleted file that a process
still holds open has no name, so only `df` counts it; `lsof +L1` finds
it, and restarting the process or truncating it through
`/proc/<pid>/fd/<n>` frees the space. A write can also fail with free
blocks when the file system runs out of inodes (`df -i`, usually millions
of small files), and on ext4 ordinary users lose write access when only
the 5% root reserve is left.

### 44. How do you see what is listening and who is connected?

`ss -tulpn` lists listening TCP and UDP sockets with their processes;
`ss -s` summarizes sockets by state; filters such as
`ss -tn state established '( dport = :27017 )'` show specific
connections. A service on `127.0.0.1` is reachable only locally.

### 45. How do you find where an HTTPS request spends its time?

`curl -w` with `time_namelookup`, `time_connect`, `time_appconnect`,
`time_starttransfer`, and `time_total`, then subtract consecutive values:
DNS, TCP (about one round trip), TLS (one more with TLS 1.3), waiting for
the first byte (server time plus a round trip), and transfer.
`--resolve` pins a name to one server to rule DNS out.

### 46. How do you diagnose "EMFILE: too many open files"?

Read the process's real limits in `/proc/<pid>/limits` (not `ulimit -n`
in your shell) and count `/proc/<pid>/fd` over time. A steadily rising
count is a leak, often sockets stuck in `CLOSE-WAIT` (the peer closed but
the application never closed its side, typically an HTTP client without
timeouts); fix it before raising `LimitNOFILE=`. Node.js raises its soft
limit to the hard limit at startup, while nginx needs
`worker_rlimit_nofile`.

### 47. `mtr` shows 40% loss at hop 2 but 0% at every later hop. Is there packet loss?

No. Loss that does not continue to later hops is a router
rate-limiting its own ICMP replies. Real loss starts at a hop and
persists all the way to the destination.

## Scheduled jobs and log rotation

### 48. Why do scripts that work in your shell fail under cron?

Cron runs them with `sh`, a `PATH` of `/usr/bin:/bin` unless the crontab
sets one, `HOME` and `LOGNAME` from `/etc/passwd`, and nothing from your
profile. Use absolute paths or set `PATH` and `SHELL` in the crontab, or
move the job to a systemd timer whose service declares its environment.

### 49. What are cron's `%` and day-field traps?

An unescaped `%` ends the command and turns the rest into standard
input, so `date +%F` must be `date +\%F`. When both day-of-month and
day-of-week are restricted, either matching is enough: `0 0 13 * 5` runs
on the 13th and on every Friday.

### 50. How does cron behave around daylight saving time?

Debian's cron runs jobs from a skipped hour soon after the change and
does not re-run jobs in a repeated hour (for changes under three hours),
while wildcard jobs follow the new time. It runs everything in the
system time zone. Keeping servers on UTC avoids the issue entirely.

### 51. How do you stop a scheduled job from overlapping with itself?

Wrap it in `flock -n lockfile command`: a run that finds the lock held
exits immediately, and the kernel releases the lock when the process
exits. A systemd timer does this by design: if the service is still
active when the timer elapses, it is left running and no second instance
starts.

### 52. Why are systemd timers usually better than cron?

The service unit declares its user, environment file, credentials,
limits, sandbox, and timeout; output goes to the journal; failures are
recorded and can trigger `OnFailure=`; `Persistent=true` catches up after
downtime; `RandomizedDelaySec=` spreads load; schedules can be tested
with `systemd-analyze calendar` and run on demand with `systemctl start`.

### 53. How do you run a scheduled job once when three servers run the same image?

Choose one runner: a designated job server, a lock in a shared store (for
example a MongoDB `updateOne` with `upsert` on a lock document that
expires, where losers get duplicate key error 11000), a managed or
cluster scheduler, or a queue with repeatable jobs. Make the job
idempotent anyway, because managed schedulers deliver at least once.

### 54. What is the difference between logrotate's `create` and `copytruncate`?

`create` renames the log and creates a new file; the program keeps
writing to the renamed file until it is told to reopen (a `postrotate`
signal). `copytruncate` copies the log and truncates it in place, which
works for programs that cannot reopen but loses lines written between
the copy and the truncate.

### 55. What are journald's default size limits?

`SystemMaxUse=` is 10% of the file system and `SystemKeepFree=` 15%, each
capped at 4 GiB, with individual files up to one eighth of the maximum
(at most 128 MiB). Change them with a drop-in in
`/etc/systemd/journald.conf.d/`; `journalctl --rotate --vacuum-size=`
trims immediately.

### 56. How do you prevent disk-full incidents?

Cap everything that grows: logrotate rules (run hourly for busy logs),
journald limits, Docker log options, a fixed number of releases, backups
shipped off the server and pruned locally. Alert on disk and inode usage
at around 80% and 90%, and keep large data on its own volume.

## Scenario-based questions

### 57. Right after disabling password authentication, nobody can log in over SSH. What do you check?

**What to check first:** the provider's console access, then
`journalctl -u ssh` for the rejection reason.

**How to confirm:** messages about bad ownership or modes on `~/.ssh` or
`authorized_keys`, a user missing from the `AllowGroups` group, or no
key installed for that account.

**Likely causes and fixes:** keys never installed for the account,
`StrictModes` rejecting group- or world-writable files, or `AllowGroups`
excluding the user. Fix permissions (`700` and `600`), add the group,
and next time test a key login from a second session before reloading.
See [SSH and remote access](ssh-and-remote-access.md).

### 58. A CI deploy fails with "Host key verification failed" after the server was rebuilt. What do you do?

**What to check first:** whether the server was really rebuilt and what
its new host key fingerprint is.

**How to confirm:** compare the fingerprint in the provider's console
log with what `ssh-keyscan` returns from the CI network.

**Likely causes and fixes:** a legitimate rebuild generated new host
keys. Update the pinned `known_hosts` value after verifying it out of
band; never switch CI to `StrictHostKeyChecking=no`. Host certificates
avoid the problem on future rebuilds. See
[SSH and remote access](ssh-and-remote-access.md).

### 59. Users see a burst of 502 errors for a few seconds during every deploy. How do you fix it?

**What to check first:** nginx's error log at deploy time and how the
deploy restarts the instances.

**How to confirm:** `connect() failed (111: Connection refused) while
connecting to upstream` at the moment of `systemctl restart`, with both
instances restarting together or only one instance configured.

**Likely causes and fixes:** all instances restarted at once, no
graceful shutdown, or no `proxy_next_upstream error`. Restart one
instance at a time, wait for readiness and the new version, keep nginx's
retry on connection errors, and make the app drain before closing. See
[running apps with systemd and nginx](running-apps-with-systemd-and-nginx.md).

### 60. File uploads larger than about 1 MB fail with "413 Request Entity Too Large". Why?

**What to check first:** whether the 413 comes from nginx or the app.

**How to confirm:** nginx's own error page and no matching request in
the app's logs.

**Likely causes and fixes:** `client_max_body_size` is at its 1 MB
default. Raise it for the server or the upload location only, and keep
the app's body limit consistent. See
[running apps with systemd and nginx](running-apps-with-systemd-and-nginx.md).

### 61. WebSocket connections drop after exactly 60 seconds of silence. Why?

**What to check first:** the WebSocket `location` and its timeouts.

**How to confirm:** close events at regular 60-second intervals while
no messages flow.

**Likely causes and fixes:** `proxy_read_timeout` defaults to 60 seconds.
Raise it in the WebSocket location, send application-level pings more
often than the timeout, and make sure the location passes `Upgrade` and
`Connection`. See
[running apps with systemd and nginx](running-apps-with-systemd-and-nginx.md).

### 62. An API instance restarts every few hours. What do you look for?

**What to check first:** `systemctl show taskflow-api@3001 -p Result -p NRestarts`
and the kernel log.

**How to confirm:** `Result=oom-kill` and "Memory cgroup out of memory:
Killed process" in `journalctl -k`, with memory climbing steadily before
each restart.

**Likely causes and fixes:** a memory leak reaching `MemoryMax=`. Keep
the limit (it protects the server), take heap snapshots to find the
leak, and check that the V8 heap limit sits below `MemoryHigh=`. See
[troubleshooting CPU, memory, disk, and network](troubleshooting-cpu-memory-disk-and-network.md).

### 63. A 4-vCPU server shows a load average of 12, yet the CPUs are mostly idle. What is happening?

**What to check first:** `vmstat 1 5` for `wa` and `b`, then
`iostat -xz 1`.

**How to confirm:** high `wa`, several blocked tasks, high `r_await` or
`w_await`, and a process doing heavy I/O in `pidstat -d 1`.

**Likely causes and fixes:** tasks in uninterruptible sleep waiting for
a slow or throttled disk, often a backup or a burst of logging. Move the
heavy job off peak, reduce the I/O, or provision a faster volume. See
[troubleshooting CPU, memory, disk, and network](troubleshooting-cpu-memory-disk-and-network.md).

### 64. The disk is 97% full, but `du` accounts for only a third of it. What do you do?

**What to check first:** `sudo lsof +L1`.

**How to confirm:** a large file marked `(deleted)` with `NLINK 0`, held
open by a running process.

**Likely causes and fixes:** someone deleted a log that a process still
writes to. Truncate it through `/proc/<pid>/fd/<n>` or restart the
process, then replace manual deletion with logrotate or journald limits.
See [troubleshooting CPU, memory, disk, and network](troubleshooting-cpu-memory-disk-and-network.md).

### 65. A nightly backup job has not produced a backup for three weeks, and nobody noticed. How do you prevent a repeat?

**What to check first:** `systemctl status` of the backup service and its
journal, or cron's log lines if it runs from cron.

**How to confirm:** a failed result on every recent run, or cron
discarding output because no mail transfer agent exists.

**Likely causes and fixes:** a failure with no alert, such as expired
credentials or a full target. Run it as a timer with `OnFailure=`
notifications, add a dead man's switch that alerts when no success
arrives, and schedule restore tests. See
[scheduled jobs and log rotation](scheduled-jobs-and-log-rotation.md).

### 66. After scaling from one server to three, every user receives the weekly digest three times. Why?

**What to check first:** where the job is scheduled.

**How to confirm:** three runs logged at the same time, one per server.

**Likely causes and fixes:** the same timer is on every instance. Choose
one runner (a lock in MongoDB, a managed scheduler, or a queue) and make
the job idempotent by recording who already received the digest. See
[scheduled jobs and log rotation](scheduled-jobs-and-log-rotation.md).

### 67. On one server, TLS handshakes fail with "certificate is not yet valid" and JWTs are rejected as expired. What do you check?

**What to check first:** `timedatectl status` and `chronyc -N tracking`.

**How to confirm:** `System clock synchronized: no`, and
`sudo chronyc -N authdata` shows no NTS keys.

**Likely causes and fixes:** chrony cannot reach its NTS sources because
outbound TCP 4460 (or UDP 123) is blocked. Allow both, or point chrony at
internal time servers, then confirm synchronization. See
[setting up a production server](setting-up-a-production-server.md).

### 68. The API restarted in the middle of the day without a deploy. What happened?

**What to check first:** the journal around the restart and
`/var/log/apt/history.log`.

**How to confirm:** an apt or unattended-upgrades run that replaced
libraries just before the instance stopped and started.

**Likely causes and fixes:** `needrestart` restarted services that used
replaced libraries, which Ubuntu does automatically since 24.04. This is
expected; make shutdown graceful, run two instances so restarts are
invisible, and plan manual upgrades. See
[setting up a production server](setting-up-a-production-server.md).

### 69. Calls to an external API sometimes take 5 seconds longer than usual. How do you narrow it down?

**What to check first:** `curl -w` timings for the external host, run
several times.

**How to confirm:** `time_namelookup` near 5 seconds on slow runs, and
`resolvectl status` listing a DNS server that does not answer.

**Likely causes and fixes:** one configured resolver times out before
the next is tried. Remove or fix it, and give the app's HTTP clients
sensible timeouts. See
[troubleshooting CPU, memory, disk, and network](troubleshooting-cpu-memory-disk-and-network.md).

### 70. After a bad release, the service sits in "failed (Result: start-limit-hit)" even though the release was rolled back. Why?

**What to check first:** `systemctl status taskflow-api@3001` and the
first failure in its journal.

**How to confirm:** repeated start attempts that exceeded
`StartLimitBurst=` within `StartLimitIntervalSec=`.

**Likely causes and fixes:** systemd stopped retrying after the crash
loop and keeps the unit failed until told otherwise. Fix the cause, run
`systemctl reset-failed taskflow-api@3001`, start it, and make the
deploy script verify readiness so a broken release is rolled back before
the limit is reached. See
[running apps with systemd and nginx](running-apps-with-systemd-and-nginx.md).

## Further learning

- [Linux server operations overview](../linux-server-operations.md)
- [SSH and remote access](ssh-and-remote-access.md) ·
  [Setting up a production server](setting-up-a-production-server.md) ·
  [Running apps with systemd and nginx](running-apps-with-systemd-and-nginx.md) ·
  [Troubleshooting CPU, memory, disk, and network](troubleshooting-cpu-memory-disk-and-network.md) ·
  [Scheduled jobs and log rotation](scheduled-jobs-and-log-rotation.md)
- [systemd manual pages](https://www.freedesktop.org/software/systemd/man/latest/)
- [Brendan Gregg: The USE Method](https://www.brendangregg.com/usemethod.html)
- [OpenSSH manual pages](https://www.openssh.org/manual.html)
