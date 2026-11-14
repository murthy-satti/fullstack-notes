# Running Apps with systemd and nginx

This lesson deploys the TaskFlow API on one Ubuntu 26.04 server from end
to end: a systemd template unit that runs two instances of the app, the
journal that collects their output, an nginx site that terminates TLS
and proxies HTTP and WebSocket traffic with sensible limits, a
certificate from certbot, and a deploy script that unpacks each release
into its own directory, switches a symlink, and restarts the instances
one at a time so users never see an error.

The application side of this story (health endpoints, graceful
shutdown, PM2 cluster mode) is covered in
[deploying backend services](../deployment-strategies/deploying-backend-services.md).
This lesson goes deeper on the operating-system side: what systemd does
with each setting, how to sandbox a Node.js process, how nginx
inheritance and timeouts really behave, and how to roll a release across
two instances on a single machine.

## Why it matters

A Node.js process started by hand in `tmux` or with `nohup` is not a
service. It stops when it crashes and nobody notices, does not come back
after a reboot, runs as whatever user started it, writes logs to a
terminal nobody reads, and can use all the memory on the machine. systemd
fixes every one of these with a few lines of configuration that the
operating system enforces, not your code.

nginx in front of Node.js matters for different reasons. It terminates
TLS, absorbs slow clients so the event loop is not tied up waiting for
uploads, rejects oversized bodies before they reach the app, and can
send each request to whichever instance is up. Together they make the
difference between a deploy that drops requests and one that nobody
notices.

## Real-world usage

- **Express documentation.** The
  [production best practices](https://expressjs.com/en/advanced/best-practice-performance.html)
  guide says that to make an app restart when the server restarts you
  should "use the init system built into your OS. The main init system in
  use today is systemd", that the best place for compression on a
  high-traffic site is "at a reverse proxy level", and that Express should
  run "behind a reverse proxy like Nginx or HAProxy in production".
- **systemd documentation.** The
  [systemd.service](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html)
  manual states "It is recommended to use `Type=exec` for long-running
  services", and the
  [systemd.exec](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html)
  manual warns that environment variables "are not suitable for passing
  secrets" and offers credentials and dozens of sandboxing options
  instead.
- **nginx documentation.** The
  [WebSocket proxying](https://nginx.org/en/docs/http/websocket.html)
  guide explains that `Upgrade` and `Connection` are hop-by-hop headers
  that must be passed explicitly and that idle WebSocket connections are
  closed after 60 seconds by default. The
  [nginx changelog](https://nginx.org/en/CHANGES) shows that version
  1.29.7 (March 2026) made upstream keep-alive and HTTP/1.1 the proxy
  defaults; Ubuntu 26.04 ships nginx 1.28.3, so its configurations must
  still set them explicitly.
- **PM2 documentation.** PM2's
  [startup guide](https://pm2.keymetrics.io/docs/usage/startup/)
  generates an init-system script so the process list survives reboots;
  on Linux that means PM2 itself runs as a systemd service.

**Popular tools and providers:** systemd, nginx (Ubuntu's package or
nginx.org's own repository), Caddy, HAProxy, Traefik, PM2, certbot, and
supervisord on systems without systemd.

## How it works

### The request path on one server

![Diagram: a client sends HTTPS to nginx on port 443, which terminates TLS, gzips JSON, enforces client_max_body_size 10m, applies timeouts and buffering, and upgrades /ws/ to WebSocket; nginx passes requests to the upstream taskflow_api, which balances between 127.0.0.1:3001 and 127.0.0.1:3002, keeps 16 idle keep-alive connections, and retries on connection errors; the two upstream servers are the systemd instances taskflow-api@3001 and taskflow-api@3002, running Node 24 as the taskflow user; they query MongoDB over TLS on a private network and write stdout and stderr to journald; certbot.timer renews the certificate and its deploy hook reloads nginx.](single-server-request-path.svg)

Only nginx listens on public interfaces (ports 80 and 443). Each
TaskFlow API instance listens on `127.0.0.1`, so a firewall mistake
cannot expose it, and two instances exist so one can restart while the
other serves. The app reads its bind address from the environment:

```js
// src/server.js (excerpt): listen on loopback only; nginx is the public entry point
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "127.0.0.1";
const server = app.listen(PORT, HOST, () => {
  console.log(JSON.stringify({ level: 30, msg: `listening on ${HOST}:${PORT}` }));
});
```

### Unit files, templates, and instances

A **unit file** describes one thing systemd manages. Administrator units
live in `/etc/systemd/system/`, package units in `/usr/lib/systemd/system/`,
and a unit is changed without editing its file through **drop-ins**:
`systemctl edit nginx` writes `/etc/systemd/system/nginx.service.d/override.conf`
and reloads systemd. After editing unit files by hand, run
`systemctl daemon-reload`; `systemctl cat unit` shows exactly what systemd
loaded. Lines that start with `#` or `;` are comments, and systemd has no
trailing comments: text after a setting on the same line becomes part of
its value.

A **template** has an `@` before the suffix: `taskflow-api@.service`.
Starting `taskflow-api@3001.service` creates an **instance** in which the
specifier `%i` expands to `3001`. One template therefore runs any number
of instances, each with its own port, process, cgroup, logs, and restart
counter:

| Section | Purpose | Settings used here |
|---|---|---|
| `[Unit]` | What it is and how it relates to other units | `Description=`, `After=`/`Wants=network-online.target`, start limits |
| `[Service]` | How to run, restart, stop, limit, and sandbox the process | `Type=`, `User=`, `ExecStart=`, `Restart=`, `MemoryMax=`, `Protect*=` |
| `[Install]` | What `systemctl enable` hooks it into | `WantedBy=multi-user.target` (start at boot) |

`After=` only orders startup; `Wants=` pulls the other unit in without
failing if it fails. Ordering after `network-online.target` matters for
an app that connects to a remote database at startup.

### Service types and readiness

| `Type=` | systemd considers the service started when... | Fit for Node.js |
|---|---|---|
| `simple` | `fork()` returned, even if the binary then fails to execute | Works, but a typo in `ExecStart=` still looks like a successful start |
| `exec` | The program has been executed | The recommended default for long-running services |
| `notify` | The process sends `READY=1` over `sd_notify` | Node.js has no built-in `sd_notify`; needs a library |
| `forking` | The parent process exits after forking a daemon | Old-style daemons only |
| `oneshot` | The process exits | Scripts and jobs (used by timers) |

`Type=exec` still does not mean "ready to serve": the app may need a few
seconds to connect to MongoDB. That is why the deploy script below waits
for `/readyz` and `/version` instead of trusting `systemctl restart`.

### Restart policy and the start limit

![Diagram: a state machine. From inactive, systemctl start leads to activating, where ExecStart runs; when the program has been executed it is active. systemctl stop leads to deactivating, where SIGTERM is sent and SIGKILL follows after TimeoutStopSec, and when all processes have exited it is inactive again. A crash, an error exit, or an OOM kill leads to auto-restart, which waits RestartSec, growing with RestartSteps to 2, 4, 8 seconds and so on, and then starts the service again. When the start limit is hit, for example 5 starts in 10 seconds, the service ends in failed with result start-limit-hit until someone runs systemctl reset-failed and starts it again.](systemd-service-states.svg)

| `Restart=` | Restarts after |
|---|---|
| `no` (default) | Never |
| `on-failure` | An unclean exit code, a signal, a timeout, a watchdog timeout, or an OOM kill |
| `on-abnormal` | Signals, timeouts, watchdog, and OOM kills, but not error exit codes |
| `always` | Any exit, including a clean one, except when you stop it yourself |

- `RestartSec=` (default 100 ms) is the pause before a restart. Since
  systemd 254, `RestartSteps=` and `RestartMaxDelaySec=` grow that pause
  exponentially, which keeps a crash loop from hammering a database that
  is struggling.
- `StartLimitIntervalSec=` and `StartLimitBurst=` belong in `[Unit]`
  (defaults: 5 starts in 10 seconds). When a unit exceeds them, systemd
  stops restarting it and the result is `start-limit-hit`.
  `systemctl reset-failed` clears the counter.
- Choose `on-failure` when a clean exit means "done"; choose `always`
  when the process should never stop on its own, even with exit code 0.

### Stopping cleanly

On `systemctl stop` (and on every restart), systemd sends `KillSignal=`
(default `SIGTERM`) to the main process. With the default
`KillMode=control-group`, every other process left in the unit's cgroup
gets it too. If anything is still running after `TimeoutStopSec=`
(default 90 seconds, from `DefaultTimeoutStopSec=`), systemd sends
`SIGKILL`. The app's own shutdown deadline must be shorter than
`TimeoutStopSec`, which must be longer than the drain delay plus the
longest request; the Node.js side of that sequence is in
[deploying backend services](../deployment-strategies/deploying-backend-services.md#graceful-shutdown).

### Environment, configuration, and credentials

`EnvironmentFile=` reads `KEY=value` lines "shortly before the process is
executed". Empty lines and lines starting with `#` or `;` are ignored,
single and double quotes work like a POSIX shell's, and a leading `-` on
the path makes a missing file acceptable. Two rules cause most surprises:

- **Values from `EnvironmentFile=` override `Environment=`.** If
  `api.env` contained `PORT=3000`, both instances would try to use port
  3000 and the second would fail. Per-instance values (`PORT=%i`) must
  not appear in the shared file.
- **Edits need the right reload.** A changed environment file takes
  effect on the next restart of the service. A changed unit file needs
  `systemctl daemon-reload` first, or systemd keeps using the old one and
  warns that the unit "changed on disk".

Secrets travel better as credentials:
`LoadCredential=mongodb-uri:/etc/taskflow/credentials/mongodb-uri` makes
systemd read the root-only file and expose a read-only copy at
`$CREDENTIALS_DIRECTORY/mongodb-uri` that only the service's user can
read; the app-side helper is in
[setting up a production server](setting-up-a-production-server.md#step-12-configuration-and-secret-files).

### Resource limits

Every service runs in its own cgroup, so limits apply to the instance and
all of its children:

- **`MemoryHigh=`** is "the main mechanism to control memory usage": above
  it, the kernel throttles the unit and reclaims its memory aggressively.
  **`MemoryMax=`** is the hard ceiling: "If memory usage cannot be
  contained under the limit, out-of-memory killer is invoked inside the
  unit." The service then fails with result `oom-kill`, and
  `Restart=on-failure` brings it back. One leaking instance can no longer
  take down nginx or the other instance.
- Set V8's old-space limit (`--max-old-space-size`) well below
  `MemoryHigh`, so the garbage collector works harder before the cgroup
  starts throttling. Buffers, native modules, and thread stacks live
  outside the V8 heap and need room too.
- **`TasksMax=`** caps processes and threads; **`CPUQuota=200%`** would
  cap a unit at two CPUs' worth of time.
- **`LimitNOFILE=`** sets the open-file limit. systemd's default is
  `1024:524288` (soft:hard), and Node.js raises its own soft limit to the
  hard limit at startup, so a Node service rarely hits the soft limit;
  nginx and most other programs do not do this.

### Sandboxing the service

systemd can remove most of what a compromised web app could abuse. The
settings below suit a typical Node.js API; test them in staging, because
an over-tight sandbox shows up as odd runtime errors.

| Setting | Effect | Node.js notes |
|---|---|---|
| `NoNewPrivileges=yes` | No privilege gain through setuid binaries | Safe |
| `ProtectSystem=strict` | The whole file system is read-only except `/dev`, `/proc`, `/sys` | Add `ReadWritePaths=/srv/taskflow/shared` for uploads |
| `ProtectHome=yes` | `/home`, `/root`, `/run/user` look empty | Safe; the app needs no home directory |
| `PrivateTmp=yes` | A private `/tmp` and `/var/tmp` | Safe; temp files vanish with the service |
| `PrivateDevices=yes` | Only pseudo devices such as `/dev/null` and `/dev/urandom` | Safe |
| `ProtectKernelTunables=`, `ProtectKernelModules=`, `ProtectKernelLogs=`, `ProtectControlGroups=`, `ProtectClock=`, `ProtectHostname=` | Kernel settings, modules, logs, cgroups, clock, and hostname become untouchable | Safe |
| `RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK` | Only these socket types can be created | `AF_NETLINK` is used by glibc's `getaddrinfo()` to see which address families are configured and by `os.networkInterfaces()` |
| `RestrictNamespaces=yes`, `RestrictRealtime=yes`, `RestrictSUIDSGID=yes`, `LockPersonality=yes` | No namespaces, real-time scheduling, setuid files, or personality changes | Safe |
| `CapabilityBoundingSet=` (empty) | No Linux capabilities, ever | Ports above 1024 need none |
| `SystemCallFilter=@system-service` with `SystemCallErrorNumber=EPERM` | Only common system calls; others fail with `EPERM` instead of killing the process with `SIGSYS` | Covers Node.js; the `EPERM` setting turns a surprise into a logged error |
| `ProtectProc=invisible` | Other users' processes are hidden in `/proc` | Safe |
| `MemoryDenyWriteExecute=yes` | Forbids writable and executable memory | **Do not use**: the manual notes it is incompatible with JIT engines, and V8 is one |
| `ProcSubset=pid` | Hides everything in `/proc` that is not about processes | **Avoid**: `os.cpus()` reads `/proc/stat` and returns an empty array without it |

`systemd-analyze security taskflow-api@3001.service` estimates the
result from 0.0 (tightly sandboxed) to 10.0 (fully exposed) and lists
every setting it checked with its contribution. It only measures what
systemd enforces, not your code, so use it to find settings you missed,
not as a security grade. `DynamicUser=yes` is a further option that
allocates a throwaway user per run, but a fixed `taskflow` user is
simpler when the app owns files in `shared/`.

### Logs in the journal

By default, a service's stdout and stderr go to systemd-journald, which
stores each line with fields such as `_SYSTEMD_UNIT`, `_PID`, and
`SYSLOG_IDENTIFIER` (the program name unless `SyslogIdentifier=` sets
one; without it every instance shows up as `node`). Things to know:

- **Priorities.** Every line from stdout or stderr is stored at
  priority `info` unless it starts with a kernel-style prefix such as
  `<3>` (error) or `<4>` (warning). `journalctl -p err` therefore shows
  none of a Node.js app's errors; search your JSON log level instead
  (`-g '"level":50'` for pino's error level), or emit prefixes.
- **Rate limits.** journald drops a service's messages beyond 10,000 per
  30 seconds, a burst it multiplies by a factor of 1 to 6 based on free
  disk space (5 for up to 64 GB free), and logs how many it suppressed.
  `LogRateLimitIntervalSec=` and `LogRateLimitBurst=` change it per unit.
- **Storage.** Recent systemd versions keep the journal on disk
  (`Storage=persistent`), capped by default at 10% of the file system
  (at most 4 GiB). Size limits and vacuuming are covered in
  [scheduled jobs and log rotation](scheduled-jobs-and-log-rotation.md).
- **Shipping.** The journal is the server's local buffer, not your log
  platform. An agent such as Vector, Fluent Bit, or the OpenTelemetry
  Collector reads it and ships JSON lines to a central store, as
  described in [structured logging](../monitoring-and-logging/structured-logging.md).

### nginx in front of Node.js

nginx accepts client connections and, by default, buffers both request
bodies and responses, so a slow mobile client uploading a 5 MB file ties
up an nginx connection rather than the Node.js event loop. The rest is
configuration, and four behaviors cause most production surprises:

- **`proxy_set_header` is all-or-nothing per level.** The directives are
  inherited from the enclosing block "if and only if there are no
  `proxy_set_header` directives defined on the current level". A
  `location` that sets `Upgrade` and `Connection` silently loses the
  server-level `X-Forwarded-For` and `X-Forwarded-Proto`. Keep the common
  headers in a snippet and `include` it in every proxied `location`.
- **WebSockets need explicit headers and a longer timeout.** `Upgrade`
  and `Connection` are hop-by-hop, so nginx does not forward them unless
  told to, and `proxy_read_timeout` (default 60 seconds) closes a quiet
  WebSocket unless you raise it or send pings.
- **Compression is off for JSON.** Ubuntu's `nginx.conf` turns `gzip on`
  but leaves `gzip_types` commented out, and the default `gzip_types` is
  `text/html` only. API responses stay uncompressed until you add
  `application/json`. `gzip_proxied` is often misread: it concerns
  requests that arrived through another proxy (detected by a `Via`
  header, as CDNs add), not the responses nginx gets from Node.js.
- **Proxy defaults changed in nginx 1.29.7.** From that version, nginx
  speaks HTTP/1.1 to upstreams and keeps upstream connections alive by
  default. Ubuntu 26.04's nginx 1.28.3 still defaults to HTTP/1.0 with
  `Connection: close`, so set `proxy_http_version 1.1`, an empty
  `Connection` header, and `keepalive` in the `upstream` yourself; the
  settings are harmless on newer versions.

Limits and timeouts worth setting deliberately:

| Directive | Default | Set here | Why |
|---|---|---|---|
| `client_max_body_size` | `1m` | `10m` | Larger uploads get `413 Request Entity Too Large` from nginx before reaching Node |
| `client_body_timeout`, `client_header_timeout` | `60s` | `15s` | Clients that stall get `408` instead of holding a connection |
| `proxy_connect_timeout` | `60s` | `2s` | A loopback connect is instant; failing fast lets nginx try the other instance |
| `proxy_read_timeout` | `60s` | `30s` (API), `1h` (WebSocket) | Longest normal response, and long-lived sockets |
| `keepalive_timeout` (client side) | `75s` | `65s` | Idle client connections are cheap but not free |
| `keepalive_timeout` (upstream) | `60s` | default | Must stay below Node's `server.keepAliveTimeout` (65 s in TaskFlow) so nginx closes idle upstream connections first |

**Failover between instances.** In the `upstream` block, each server
defaults to `max_fails=1` and `fail_timeout=10s`: one failed attempt
marks it unavailable for 10 seconds. `proxy_next_upstream` (default
`error timeout`) retries a request on the other instance when a
connection fails, but nginx does not retry non-idempotent requests such
as `POST` once it has sent them upstream, and cannot retry anything once
it has started sending the response to the client.

**Reloading.** `nginx -t` checks the configuration; `systemctl reload
nginx` sends `HUP`, after which the master process applies the new
configuration, starts new workers, and asks the old ones to "shut down
gracefully", letting them finish their current requests. If the new
configuration cannot be applied, nginx keeps running with the old one.
Run `nginx -t` first anyway, because a broken file still breaks the next
full restart or reboot.

**Real client addresses.** nginx passes the client address in
`X-Forwarded-For`, and Express needs `app.set("trust proxy", 1)` to use
it. If a load balancer or CDN sits in front of nginx too, use the realip
module (`set_real_ip_from` with the balancer's ranges and
`real_ip_header X-Forwarded-For`) so nginx itself logs and rate-limits by
the real client.

### TLS with certbot

Certificates come from Let's Encrypt through certbot, renewed by a
systemd timer that runs `certbot renew` twice a day; the full lifecycle,
challenge types, and monitoring are covered in
[obtaining and renewing certificates](../ssl-certificates/obtaining-and-renewing-certificates.md).
Two details matter for this setup. The port 80 server keeps serving
`/.well-known/acme-challenge/` while redirecting everything else, so
renewal works forever. And on the very first issuance the HTTPS server
block cannot load yet, because the certificate files do not exist: start
with the port 80 block only, obtain the certificate, then add the HTTPS
block and reload.

### Zero-downtime deploys on one server

![Diagram: a timeline from 0 to 33 seconds. At 0 seconds the deploy script switches the current symlink to release 1.9.0 and restarts taskflow-api@3001, which drains and closes until 7 seconds, starts until 10 seconds, and then serves 1.9.0; taskflow-api@3002 keeps serving 1.8.0. At 11 seconds, with 3001 ready on 1.9.0, the script restarts 3002, which drains and closes until 18 seconds, starts until 21 seconds, and then serves 1.9.0. nginx sends requests to both instances for the first 5 seconds, to 3002 only from 5 to 10 seconds, to both with mixed versions from 10 to 16 seconds, to 3001 only from 16 to 21 seconds, and to both on 1.9.0 after that.](rolling-restart-two-instances.svg)

Node.js cannot swap its code in place, so on one server "reload" means
replacing processes one at a time:

1. **Prepare the release** in `/srv/taskflow/releases/1.9.0`: download
   the artifact CI built, verify its checksum, unpack it as root so the
   app cannot modify it. Nothing running is touched yet.
2. **Migrate** the database with changes that the old version still
   understands, once ([zero-downtime database migrations](../deployment-strategies/zero-downtime-database-migrations.md)).
3. **Switch** the `current` symlink atomically: create a new symlink and
   rename it over the old one. Running processes keep the directory they
   started in; new processes start in the new release.
4. **Restart instance 3001.** It receives `SIGTERM`, drains, and closes;
   while it refuses connections, nginx sends everything to 3002.
5. **Wait** until 3001 answers `/readyz` and reports `1.9.0` on
   `/version`, then restart 3002 the same way.
6. **Roll back** automatically if an instance does not become ready:
   point `current` at the previous release and restart the instances
   again.

For a few seconds both versions serve requests at once, so every release
must be compatible with its predecessor, the same rule as for any
rolling deployment ([rolling, blue-green, and canary](../deployment-strategies/rolling-blue-green-and-canary.md)).
Two alternatives exist on one host: systemd socket activation keeps the
listening socket open across a restart (described in the deploying
backend services lesson), and a blue-green variant runs a second pair of
instances on other ports and switches nginx's upstream with a reload,
which lets old workers finish their requests on the old pair.

### systemd compared with PM2

| | systemd only | PM2 (itself started by systemd) |
|---|---|---|
| Supervisor | The init system, PID 1 | A Node.js daemon, started by a unit that `pm2 startup` generates |
| Using several CPU cores | One template instance per core, balanced by nginx | Cluster mode: workers share one port |
| Zero-downtime restart | Rolling restart script (this lesson) or socket activation | `pm2 reload` in cluster mode |
| Logs | journald: structured fields, rate limits, size caps | Files under the user's `~/.pm2/logs`, rotated with the `pm2-logrotate` module |
| Memory limits | Kernel-enforced cgroups (`MemoryHigh=`, `MemoryMax=`) | `max_memory_restart`: restart when memory exceeds a threshold |
| Sandboxing and secrets | `ProtectSystem=`, `SystemCallFilter=`, `LoadCredential=`, and more | None of its own |
| Language | Any program | Built for Node.js, works for others |
| License | Part of the OS | PM2 is AGPL-3.0 |

PM2 is convenient on a developer-friendly VM, and its cluster mode is the
simplest way to use every core behind one port. systemd gives the same
supervision with one fewer moving part, plus isolation and limits PM2
cannot provide. If you use PM2, still run it under systemd and keep its
logs rotated.

## When to use and when not to use

| Situation | Recommended setup |
|---|---|
| One small API on one VM | systemd template with two instances, nginx in front, this lesson's deploy script |
| A VM with many cores and CPU-bound load | One instance per core as template units, or PM2 cluster mode under systemd |
| Several VMs | The same units on each VM behind a load balancer, deployed one VM at a time ([from one server to many](../load-balancing-and-multi-server/from-one-server-to-many.md)) |
| Apps already packaged as containers | Docker or Compose with restart policies, or an orchestrator; systemd then supervises the container runtime |
| A team that does not want to operate servers | A PaaS or serverless container platform |

Avoid running a single instance where a restart must not drop requests,
running the app as root or as a login user, and editing files under
`/srv/taskflow/current` on the server instead of deploying a new release.

## Practical examples

### The template unit

```ini
# /etc/systemd/system/taskflow-api@.service: one instance per port, e.g. taskflow-api@3001
[Unit]
Description=TaskFlow API on port %i
Documentation=https://docs.example.com/runbooks/taskflow-api
After=network-online.target
Wants=network-online.target
# Give up after 5 failed starts within 2 minutes (result: start-limit-hit)
StartLimitIntervalSec=120
StartLimitBurst=5

[Service]
Type=exec
User=taskflow
Group=taskflow
WorkingDirectory=/srv/taskflow/current
# Shared settings first; per-instance values must not appear in api.env
EnvironmentFile=/etc/taskflow/api.env
Environment=PORT=%i HOST=127.0.0.1
LoadCredential=mongodb-uri:/etc/taskflow/credentials/mongodb-uri
ExecStart=/usr/bin/node --max-old-space-size=448 src/server.js
SyslogIdentifier=taskflow-api-%i

# Restart after crashes: 2 s, then growing to at most 60 s between attempts
Restart=on-failure
RestartSec=2s
RestartSteps=5
RestartMaxDelaySec=60s

# Stop: SIGTERM, then SIGKILL after 30 s (the app's own deadline is 25 s)
KillSignal=SIGTERM
TimeoutStopSec=30s

# Resource limits for this instance
MemoryHigh=600M
MemoryMax=700M
TasksMax=128
LimitNOFILE=65536

# Sandbox
NoNewPrivileges=yes
ProtectSystem=strict
ReadWritePaths=/srv/taskflow/shared
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
ProtectProc=invisible
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK
RestrictNamespaces=yes
RestrictRealtime=yes
RestrictSUIDSGID=yes
LockPersonality=yes
CapabilityBoundingSet=
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM
UMask=0027
# Never set MemoryDenyWriteExecute=yes for Node.js: V8 compiles code at runtime

[Install]
WantedBy=multi-user.target
```

- `WorkingDirectory=/srv/taskflow/current` follows the symlink when the
  process starts, so a restarted instance runs the newly linked release
  while the other keeps its old directory.
- `--max-old-space-size=448` keeps the V8 heap well under `MemoryHigh=600M`,
  leaving room for buffers and native memory.
- `SyslogIdentifier=taskflow-api-%i` labels each instance's journal
  lines, so they are not all called `node`.

### Enable, start, and inspect

```bash
# Check the unit file for errors, then load it
sudo systemd-analyze verify /etc/systemd/system/taskflow-api@.service
sudo systemctl daemon-reload

# Start both instances now and at every boot
sudo systemctl enable --now taskflow-api@3001 taskflow-api@3002

systemctl status taskflow-api@3001
systemctl show taskflow-api@3001 -p NRestarts -p Result -p MemoryCurrent
```

Example output of `systemctl status` (trimmed):

```text
● taskflow-api@3001.service - TaskFlow API on port 3001
     Loaded: loaded (/etc/systemd/system/taskflow-api@.service; enabled; preset: enabled)
     Active: active (running) since Fri 2026-11-13 09:12:41 UTC; 2h 3min ago
   Main PID: 41873 (node)
      Tasks: 11 (limit: 128)
     Memory: 182.4M (high: 600M, max: 700M, available: 417.6M, peak: 201.7M)
        CPU: 1min 12.904s
     CGroup: /system.slice/system-taskflow\x2dapi.slice/taskflow-api@3001.service
             └─41873 /usr/bin/node --max-old-space-size=448 src/server.js
```

`NRestarts` counts automatic restarts since the unit was started, and
`Result` shows why it last stopped (`success`, `exit-code`, `signal`,
`oom-kill`, `start-limit-hit`, and so on).

### Reading the logs

```bash
# Follow both instances live
journalctl -u 'taskflow-api@*' -f

# The last hour for one instance, without a pager
journalctl -u taskflow-api@3001 --since "1 hour ago" --no-pager

# Errors only: pino writes "level":50 for errors, and the journal stores everything as info
journalctl -u 'taskflow-api@*' --since today -g '"level":(50|60)' -o cat

# Why did it stop? systemd's own messages about the unit, including the exit status
journalctl -u taskflow-api@3001 -b -o short-iso | grep -E 'Main process exited|Failed|Scheduled restart'

# Machine-readable entries with fields, for scripts
journalctl -u taskflow-api@3001 -n 5 -o json --output-fields=MESSAGE,_PID,SYSLOG_IDENTIFIER
```

Example output of the stop-reason query:

```text
2026-11-13T07:41:08+00:00 taskflow-app-1 systemd[1]: taskflow-api@3001.service: Main process exited, code=killed, status=9/KILL
2026-11-13T07:41:08+00:00 taskflow-app-1 systemd[1]: taskflow-api@3001.service: Failed with result 'oom-kill'.
2026-11-13T07:41:10+00:00 taskflow-app-1 systemd[1]: taskflow-api@3001.service: Scheduled restart job, restart counter is at 1.
```

An `oom-kill` result with `status=9/KILL` means the instance hit
`MemoryMax`; the troubleshooting lesson shows how to find out why.

### Measure the sandbox

```bash
# Every check with its exposure contribution, then the overall estimate on the last line
sudo systemd-analyze security taskflow-api@3001.service

# Compare with an unhardened unit on the same machine
sudo systemd-analyze security cron.service | tail -n 1
```

The report lists each sandboxing setting as enabled or not with its
weight, and ends with a line of the form "Overall exposure level for
*unit*: *score* *label*" (the manual's own example, for
`systemd-logind.service`, scores 4.1 and is labelled OK). Read it as a
to-do list: settings still open in this unit, such as network access
(`PrivateNetwork=`, `IPAddressDeny=`), are open because an API that
talks to MongoDB needs them.

### The nginx site

```nginx
# /etc/nginx/snippets/taskflow-proxy.conf: shared proxy settings, included in every proxied location
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Request-Id $request_id;
```

```nginx
# /etc/nginx/sites-available/taskflow-api.conf (enable with a symlink in sites-enabled)
upstream taskflow_api {
    server 127.0.0.1:3001 max_fails=1 fail_timeout=10s;
    server 127.0.0.1:3002 max_fails=1 fail_timeout=10s;
    keepalive 16;
}

# Connection header for WebSocket requests: "upgrade" when the client asks, otherwise "close"
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    listen [::]:80;
    server_name api.example.com;

    # Let's Encrypt HTTP-01 challenges must stay reachable over plain HTTP
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/acme;
        default_type "text/plain";
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name api.example.com;

    ssl_certificate     /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

    server_tokens off;
    access_log /var/log/nginx/taskflow-api.access.log;
    error_log  /var/log/nginx/taskflow-api.error.log warn;

    # Limits: body size and slow clients
    client_max_body_size 10m;
    client_body_timeout 15s;
    client_header_timeout 15s;
    keepalive_timeout 65s;

    # Compress JSON and text responses (Ubuntu's nginx.conf only turns gzip on)
    gzip on;
    gzip_types application/json text/plain text/css application/javascript;
    gzip_min_length 1024;
    gzip_vary on;
    gzip_proxied any;

    # Upstream timeouts and failover to the other instance
    proxy_connect_timeout 2s;
    proxy_send_timeout 30s;
    proxy_read_timeout 30s;
    proxy_next_upstream error timeout http_502 http_503;
    proxy_next_upstream_tries 2;

    # Job endpoints for local cron and timers only (they call 127.0.0.1:3001 directly)
    location ^~ /internal/ {
        return 404;
    }

    # Live task updates over WebSocket
    location /ws/ {
        include snippets/taskflow-proxy.conf;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 1h;
        proxy_send_timeout 1h;
        proxy_pass http://taskflow_api;
    }

    location / {
        include snippets/taskflow-proxy.conf;
        # Empty Connection header: keep upstream connections alive (nginx before 1.29.7)
        proxy_set_header Connection "";
        proxy_pass http://taskflow_api;
    }
}
```

```bash
# Enable the site, test, and reload without dropping connections
sudo ln -s /etc/nginx/sites-available/taskflow-api.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Check what the outside sees: TLS, compression, and the proxied response
curl -sS -o /dev/null -w '%{http_code} %{size_download} bytes\n' \
    -H 'Accept-Encoding: gzip' https://api.example.com/tasks
curl -sSI https://api.example.com/tasks | grep -iE '^(content-encoding|vary|server):'
```

- Each proxied `location` includes the snippet, because setting any
  `proxy_set_header` in a location discards the inherited ones.
- `proxy_next_upstream error timeout http_502 http_503` retries on the
  other instance when a connection fails or an instance answers 502 or
  503, which covers the moment an instance closes during a restart;
  `proxy_next_upstream_tries 2` stops a failing request from being tried
  against both instances more than once.
- With a CDN or load balancer in front, `gzip_proxied any` lets nginx
  compress responses to requests that arrive with a `Via` header.
- `location ^~ /internal/` keeps job endpoints off the public site; the
  `^~` modifier means no regular-expression location can override it.
  Scheduled jobs call them on `127.0.0.1` directly (see
  [scheduled jobs and log rotation](scheduled-jobs-and-log-rotation.md)).

### Get the first certificate

```bash
# 1. Temporarily enable only the port 80 server block, then obtain the certificate
sudo install -d -m 755 /var/www/acme
sudo certbot certonly --webroot -w /var/www/acme -d api.example.com \
    --deploy-hook "systemctl reload nginx"

# 2. Enable the full site (with the 443 block), test, and reload
sudo nginx -t && sudo systemctl reload nginx

# 3. Prove that renewal works end to end
sudo certbot renew --dry-run
systemctl list-timers | grep -i certbot
```

### The deploy script

```bash
#!/usr/bin/env bash
# /usr/local/sbin/deploy-taskflow-api: release directory, symlink switch, rolling restart
# usage: deploy-taskflow-api 1.9.0   (runs as root, through sudo or the CI deploy key)
set -euo pipefail

VERSION="$1"
APP_DIR=/srv/taskflow
RELEASE="$APP_DIR/releases/$VERSION"
ARTIFACT_URL="https://artifacts.example.com/taskflow-api/taskflow-api-$VERSION.tar.gz"
PORTS=(3001 3002)
KEEP=5

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }

# Only one deploy at a time on this machine
exec 9> /run/lock/taskflow-deploy.lock
flock -n 9 || { log "another deploy is running"; exit 1; }

wait_until_serving() {   # port version: ready, and running the expected version
  local port="$1" want="$2"
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 2 "http://127.0.0.1:$port/readyz" > /dev/null &&
       curl -fsS --max-time 2 "http://127.0.0.1:$port/version" | grep -q "\"version\":\"$want\""; then
      return 0
    fi
    sleep 1
  done
  return 1
}

rolling_restart() {   # version
  local port
  for port in "${PORTS[@]}"; do
    log "restarting taskflow-api@$port"
    systemctl restart "taskflow-api@$port"
    if ! wait_until_serving "$port" "$1"; then
      log "taskflow-api@$port is not serving $1"
      return 1
    fi
  done
}

switch_to() {   # release directory: atomic symlink replacement
  ln -sfn "$1" "$APP_DIR/current.tmp"
  mv -T "$APP_DIR/current.tmp" "$APP_DIR/current"
}

previous="$(readlink -f "$APP_DIR/current" || true)"

# 1. Prepare the release once: download, verify, unpack as root, make it read-only to others
if [ ! -d "$RELEASE" ]; then
  tmp="$(mktemp -d "$APP_DIR/releases/.incoming.XXXXXX")"
  curl -fsSL "$ARTIFACT_URL" -o "$tmp/release.tar.gz"
  expected="$(curl -fsSL "$ARTIFACT_URL.sha256" | cut -d' ' -f1)"   # bare hash or sha256sum output
  echo "$expected  $tmp/release.tar.gz" | sha256sum -c -
  tar --no-same-owner -xzf "$tmp/release.tar.gz" -C "$tmp"
  rm "$tmp/release.tar.gz"
  chmod -R go-w "$tmp" && chmod 755 "$tmp"
  mv "$tmp" "$RELEASE"
fi

# 2. Backward-compatible migrations, once, with the same user, settings, and credential as the app
systemd-run --wait --pipe --collect --unit="taskflow-migrate-$VERSION" \
  --uid=taskflow --gid=taskflow --working-directory="$RELEASE" \
  -p EnvironmentFile=/etc/taskflow/api.env \
  -p LoadCredential=mongodb-uri:/etc/taskflow/credentials/mongodb-uri \
  /usr/bin/node scripts/migrate.js

# 3. Switch, then restart instances one at a time
touch "$RELEASE"            # newest mtime: protects it from the cleanup below
switch_to "$RELEASE"
if rolling_restart "$VERSION"; then
  log "deployed $VERSION"
  ls -1dt "$APP_DIR"/releases/*/ | tail -n +$((KEEP + 1)) | xargs -r rm -rf
  exit 0
fi

# 4. Failure: point back at the previous release and restart again
log "deploy of $VERSION failed; rolling back to ${previous:-nothing}"
if [ -n "$previous" ] && [ "$previous" != "$RELEASE" ]; then
  switch_to "$previous"
  rolling_restart "$(basename "$previous")" || log "ROLLBACK FAILED: page the on-call engineer"
fi
exit 1
```

What each part guarantees:

- **Idempotent preparation.** A release directory appears only after it
  has been downloaded, verified against its published SHA-256 sum, and
  unpacked, because `mv` renames the finished temporary directory in one
  step. Running the script twice reuses it.
- **Read-only code.** `tar --no-same-owner` run as root leaves the files
  owned by root, and `go-w` removes write access for everyone else, so
  the `taskflow` user can run the code but never change it.
- **Migrations in the app's sandbox.** `systemd-run` starts the migration
  as a transient service with the app's user, environment file, and
  credential, and `--wait --pipe` shows its output and returns its exit
  status, so a failed migration stops the deploy before any instance
  restarts.
- **Atomic switch.** `ln -sfn` followed by `mv -T` replaces the symlink
  with a rename, so `current` always points at a complete release, never
  at nothing.
- **Verified rollout.** Each instance must answer `/readyz` and report
  the new version on `/version` before the next one restarts; otherwise
  the script switches back and restarts onto the previous release.
- **Locking and cleanup.** `flock` prevents two concurrent deploys; the
  five newest releases stay on disk for fast rollbacks.

### Roll back by hand

```bash
# Which releases exist, and which one is live?
ls -1t /srv/taskflow/releases/
readlink -f /srv/taskflow/current

# Redeploy the previous version: the script finds its directory and skips the download
sudo /usr/local/sbin/deploy-taskflow-api 1.8.0
```

Rolling back is just deploying an older version, which is why releases
stay on disk and why every migration in the newer release must leave the
schema usable by the older one.

### The PM2 equivalent, for comparison

```bash
# PM2 keeps its state in ~/.pm2, so the app user first needs a home directory
sudo npm install -g pm2
sudo install -d -m 750 -o taskflow -g taskflow /var/lib/taskflow
sudo usermod -d /var/lib/taskflow taskflow

# Generate and enable a systemd unit that starts PM2's daemon as taskflow at boot
sudo env PATH="$PATH" pm2 startup systemd -u taskflow --hp /var/lib/taskflow

# Start the app under PM2 as that user, then save the process list for the next boot
sudo -u taskflow env HOME=/var/lib/taskflow pm2 start /srv/taskflow/current/ecosystem.config.cjs --env production
sudo -u taskflow env HOME=/var/lib/taskflow pm2 save
```

The ecosystem file, cluster mode, and `pm2 reload` are shown in
[deploying backend services](../deployment-strategies/deploying-backend-services.md#pm2-in-cluster-mode).
Count the extra pieces: a global npm package, a home directory for the
daemon's state, and a second supervisor between systemd and Node.js,
which is why this lesson runs the app under systemd directly.

## Best practices

- Run every long-lived process as a systemd service with `Type=exec`, a
  dedicated user, and a restart policy with backoff.
- Use a template unit and at least two instances on one server, behind
  nginx, so restarts never drop traffic.
- Bind the app to `127.0.0.1`; only nginx listens publicly.
- Keep shared settings in an environment file, per-instance values in
  the unit, and secrets in `LoadCredential=`.
- Cap memory with `MemoryHigh=` and `MemoryMax=`, and keep the V8 heap
  below them.
- Sandbox with `ProtectSystem=strict`, an allow-list of writable paths,
  and the other `Protect*` settings; check with `systemd-analyze security`.
- Set `SyslogIdentifier=`, log JSON to stdout, and ship the journal off
  the server.
- In nginx, put common proxy headers in a snippet, set explicit HTTP/1.1
  and keep-alive settings, raise timeouts only where needed, add JSON to
  `gzip_types`, and run `nginx -t` before every reload.
- Deploy by preparing a release directory, switching a symlink
  atomically, and restarting instances one at a time with verification
  and automatic rollback.

## In production

- **A burst of 502 errors on every deploy.**
  *Detect:* nginx's error log shows `connect() failed (111: Connection
  refused) while connecting to upstream` at deploy times. *Cause:* both
  instances restarted together (`systemctl restart 'taskflow-api@*'`), or
  only one instance exists. *Fix:* restart one instance at a time and
  wait for readiness, keep `proxy_next_upstream error`, and make the app
  drain before closing.
- **Uploads fail with "413 Request Entity Too Large".**
  *Detect:* the response comes from nginx (its error page, no app log
  line). *Cause:* `client_max_body_size` is still the 1 MB default.
  *Fix:* raise it in the server or the upload `location` only, and keep
  the app's own body limit in line.
- **WebSocket clients disconnect after exactly one minute of silence.**
  *Detect:* the browser console shows close code 1006 at regular
  60-second intervals. *Cause:* `proxy_read_timeout` defaults to 60
  seconds and nothing is sent. *Fix:* raise it in the WebSocket
  `location` and send application-level pings more often than the
  timeout.
- **The app logs the proxy's address instead of the client's for some
  routes.** *Detect:* `req.ip` is `127.0.0.1` only on `/ws/`.
  *Cause:* that `location` sets its own `proxy_set_header` lines and lost
  the inherited `X-Forwarded-For`. *Fix:* include the shared snippet in
  every proxied location.
- **The service stays down after a crash loop.**
  *Detect:* `systemctl status` shows `failed (Result: start-limit-hit)`.
  *Cause:* more than `StartLimitBurst` starts within
  `StartLimitIntervalSec`, often a bad release or a missing credential.
  *Fix:* read the journal for the first failure, fix it, then
  `systemctl reset-failed taskflow-api@3001` and start it.
- **An instance restarts every few hours with result 'oom-kill'.**
  *Detect:* `journalctl -u taskflow-api@3001` shows `Failed with result
  'oom-kill'` and the memory graph climbs steadily before each one.
  *Cause:* a memory leak reaches `MemoryMax=`. *Fix:* the restarts
  protect the server for now; take heap snapshots to find the leak.
- **Some log lines are missing during traffic peaks.**
  *Detect:* the journal contains `Suppressed N messages from
  taskflow-api@3001.service`. *Cause:* the service exceeded journald's
  per-service rate limit. *Fix:* log less per request (sample debug
  lines), or raise `LogRateLimitBurst=` for that unit.
- **A new setting in api.env has no effect.**
  *Detect:* `systemctl show taskflow-api@3001 -p Environment` and the
  app's behavior show the old value. *Cause:* the service was not
  restarted, or the unit itself was edited without
  `systemctl daemon-reload`. *Fix:* daemon-reload after unit edits,
  rolling restart after environment changes.

## Important terminology

- **Unit / unit file:** Something systemd manages, described by an
  INI-style file.
- **Template unit / instance:** A unit file with `@` in its name, and a
  running copy of it with a value for `%i`.
- **Drop-in:** A `.conf` file in `unit.d/` that overrides part of a unit
  without editing it.
- **cgroup:** The kernel group systemd puts each service in, used for
  accounting, limits, and killing every process of a unit.
- **Start limit:** The rate limit on starts that ends a crash loop.
- **Credential:** A secret systemd passes to one service as a private,
  read-only file.
- **Upstream:** nginx's name for the group of backend servers it proxies
  to.
- **Hop-by-hop header:** A header such as `Connection` or `Upgrade` that
  applies to one connection and is not forwarded automatically.
- **Release directory:** An immutable directory holding one version of
  the app.
- **Atomic symlink switch:** Replacing the `current` link with a rename,
  so it is never missing or half-written.
- **Rolling restart:** Restarting instances one at a time while the
  others serve.

## Common mistakes and misconceptions

- Writing `Restart=always # keep it up` (the comment becomes part of the
  value) or editing a unit file and forgetting `daemon-reload`.
- Putting `PORT` in a shared `EnvironmentFile`, which overrides the
  per-instance `Environment=PORT=%i`.
- Believing `Type=simple` or `Type=exec` means the app is ready.
- Setting `MemoryDenyWriteExecute=yes` on a Node.js service.
- Expecting `journalctl -p err` to show a Node.js app's errors.
- Assuming a location inherits `proxy_set_header` lines after adding one
  of its own.
- Thinking `gzip on` compresses JSON.
- Restarting all instances at once and calling it a deploy.
- Letting the app user write to its own release directory.

## Revision questions

1. What does `%i` expand to in `taskflow-api@3002.service`, and why
   does each instance need its own port?
2. Explain the difference between `Restart=on-failure` and
   `Restart=always`, and what happens after 5 failed starts in 10
   seconds.
3. Why must `TimeoutStopSec=` be longer than the app's shutdown deadline,
   and what does systemd do when it expires?
4. Why can a `location /ws/` block lose the `X-Forwarded-For` header,
   and how does a snippet fix it?
5. A service logs 2,000 lines per second and the journal's file system
   has 20 GB free. With journald's defaults, how many lines are dropped
   per 30-second window? (The burst is 10,000 x 5 = 50,000 per 30 s; the
   service writes 60,000, so about 10,000 are suppressed every 30 s.)
6. Walk through the deploy script and explain what makes the symlink
   switch atomic and the rollout safe.
7. Why does Ubuntu 26.04's nginx need `proxy_http_version 1.1` and an
   empty `Connection` header for upstream keep-alive, while nginx 1.29.7
   and later do not?
8. Name three sandboxing settings that are safe for a Node.js API and
   one that breaks it, and explain why.

## Further learning

- [systemd.service](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html)
- [systemd.exec: sandboxing and credentials](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html)
- [systemd.resource-control](https://www.freedesktop.org/software/systemd/man/latest/systemd.resource-control.html)
- [journalctl(1) on Ubuntu 26.04](https://manpages.ubuntu.com/manpages/resolute/man1/journalctl.1.html)
- [nginx: ngx_http_proxy_module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)
- [nginx: ngx_http_upstream_module](https://nginx.org/en/docs/http/ngx_http_upstream_module.html)
- [nginx: Controlling nginx (reloads)](https://nginx.org/en/docs/control.html)
- Next: [troubleshooting CPU, memory, disk, and network](troubleshooting-cpu-memory-disk-and-network.md). Back to the [Linux server operations overview](../linux-server-operations.md).
