# Debugging and Operating Containers

Running containers in production means answering questions quickly: why
did this container stop, why does it keep restarting, why is it slow,
what is it doing right now, and why is the disk full. This lesson is the
operator's toolkit: `docker logs`, `exec`, `inspect`, `stats`, `top`,
`events`, and `cp`; a systematic way to debug a crash loop; what each
exit code means; restart policies; memory and CPU limits and exactly what
happens when a container reaches them; logging drivers and log rotation;
health-check status; and keeping disk usage under control.

## Why it matters

Containers fail differently from processes on a server you can log in to.
The filesystem may have no shell, the process may already be gone,
restart policies can hide a crash behind a fresh container every few
seconds, and the kernel can kill a container silently when it reaches its
memory limit. Without a method, debugging turns into guessing.

The same knowledge prevents incidents: unrotated logs and unpruned images
are among the most common reasons a Docker host runs out of disk, and
missing memory limits let one leaking container take down every other
service on the machine.

## Real-world usage

- **Docker: resource constraints.** The
  [resource constraints](https://docs.docker.com/engine/containers/resource_constraints/)
  documentation explains that without limits a container can use as much
  memory as the host kernel allows, that the kernel OOM killer may then
  kill any process including the Docker daemon, and how `--memory`,
  `--memory-swap`, and `--cpus` change that.
- **Docker: logging.** The
  [logging drivers](https://docs.docker.com/engine/logging/configure/)
  guide notes that the default `json-file` driver does not rotate logs
  unless configured and recommends the `local` driver, which rotates and
  compresses by default, to prevent disk exhaustion.
- **Docker: restart policies.** The
  [start containers automatically](https://docs.docker.com/engine/containers/start-containers-automatically/)
  page defines `no`, `on-failure`, `always`, and `unless-stopped`, and the
  increasing delay Docker adds between restarts.
- **The Twelve-Factor App.** The [logs](https://12factor.net/logs) factor
  says an app should write its event stream unbuffered to standard
  output and let the execution environment collect and route it: exactly
  what `docker logs` and logging drivers expect.

**Popular tools and providers:** the Docker CLI, `nicolaka/netshoot` for
network debugging, `ctop` and `lazydocker` for terminal dashboards,
Dozzle for viewing logs, cAdvisor and Prometheus for container metrics,
and log shippers such as Fluent Bit and Vector.

## How it works

### The debugging toolbox

| Question | Command |
|----------|---------|
| What is running, and what stopped? | `docker ps -a` |
| What did it print? | `docker logs --tail 100 -f <name>` |
| Why did it stop? | `docker inspect --format '{{.State.ExitCode}} {{.State.OOMKilled}}' <name>` |
| What is its full configuration? | `docker inspect <name>` |
| What is happening inside right now? | `docker exec -it <name> sh` |
| Which processes run in it? | `docker top <name>` |
| How much CPU, memory, I/O does it use? | `docker stats` |
| What happened to it over time? | `docker events --filter container=<name>` |
| How do I get a file out (or in)? | `docker cp <name>:/path ./local` |
| What changed in its filesystem? | `docker diff <name>` |
| Where did the disk space go? | `docker system df -v` |

### Logs

`docker logs` shows what the container's main process wrote to standard
output and standard error. Useful flags: `-f` to follow, `--tail 100` to
start near the end, `--since 10m` or a timestamp, and `--timestamps`.
Logs survive while the container exists, so you can read the output of a
container that has already exited; they are deleted with `docker rm`.

Two consequences for applications: log to stdout and stderr, not to files
inside the container (those are invisible to `docker logs` and fill the
writable layer), and write structured, one-line JSON entries so log
pipelines can parse them (see
[structured logging](../monitoring-and-logging/structured-logging.md)).

### Getting inside a container

- `docker exec -it api sh` starts a new process in the running
  container's namespaces. Add `-u 0` to run it as root when the container
  runs as a non-root user and you need to install a tool temporarily.
- Distroless and other shell-less images cannot run `sh`. Start a
  debugging container that joins the target's namespaces instead:
  `docker run --rm -it --network container:api --pid container:api
  nicolaka/netshoot`. It sees the app's processes and shares its
  `localhost`, and `/proc/<pid>/root` exposes the app's filesystem.
  Docker Desktop also offers `docker debug` for the same purpose.
- A container that exits immediately cannot be `exec`ed into. Start the
  same image with a different entry point:
  `docker run --rm -it --entrypoint sh <image>`.

### `inspect`, `stats`, `top`, and `events`

`docker inspect` returns the full JSON state and configuration. The
fields you will read most often are `State` (status, exit code,
`OOMKilled`, start and finish times, health), `RestartCount`,
`Config.Env` and `Config.Cmd`, `HostConfig` (limits, restart policy,
mounts), `Mounts`, and `NetworkSettings`. Go templates with `--format`
extract single fields.

`docker stats` streams per-container CPU percentage (where 100% is one
full core), memory usage against the limit, network and block I/O, and
the number of processes. `docker top` lists processes as the host sees
them. `docker events` streams lifecycle events (`create`, `start`, `die`,
`oom`, `kill`, `stop`, `restart`, `health_status`) with timestamps, which
answers "who stopped this container, and when?".

### Exit codes

When a container stops, its exit code is the main process's exit code.
Codes above 128 mean a signal killed the process.

![Diagram: a table of exit codes; codes above 128 mean 128 plus the signal number; 0 is success, normal for a job but suspicious for a server; 1 is an application error to read in docker logs; 125 means the docker run command itself failed; 126 means the command could not be executed; 127 means the command was not found; 130 is SIGINT (128 + 2) from Ctrl+C; 137 is SIGKILL (128 + 9), which is the memory limit if OOMKilled is true and otherwise docker kill or a stop timeout; 139 is SIGSEGV (128 + 11), a native-code crash; 143 is SIGTERM (128 + 15), a stop or deploy where the app had no handler that exits cleanly.](exit-code-decision.svg)

The most misread code is **137**. It means "killed by `SIGKILL`", which
happens when the kernel kills the process for exceeding its memory limit
(then `OOMKilled` is `true`), but also on `docker kill` and when a
process ignores `SIGTERM` until `docker stop`'s timeout runs out. Check
`OOMKilled` before raising memory limits.

### Debugging a crash loop

A container with a restart policy that keeps failing shows a status such
as `Restarting (1) 3 seconds ago` and a climbing `RestartCount`. Work
through it in order:

![Diagram: a flowchart for a container that restarts in a loop; first docker ps -a and docker inspect for ExitCode, OOMKilled, RestartCount, and Health; if OOMKilled is yes, the memory limit was hit, so raise the limit, cap the heap, and find the leak; if no, branch on the exit code: 1 or another code is an application error to read with docker logs --tail 100 (missing env var or database down), 126 or 127 means the command cannot run (check CMD, ENTRYPOINT, PATH, image architecture), 137 or 143 means killed by a signal (docker events shows who), and 139 means native code crashed (rebuild native modules for this libc and CPU); if still unclear, reproduce interactively with docker run --rm -it --entrypoint sh or by overriding the command with sleep infinity and using docker exec.](crash-loop-debugging-flow.svg)

1. **Read the state**: exit code, `OOMKilled`, restart count, and the
   last health-check output.
2. **Read the logs of the failed run** with `docker logs --tail 100`.
   Most crash loops are configuration errors that print a clear message:
   a missing environment variable, a wrong connection string, a port
   already in use.
3. **Check what killed it** with `docker events` when the code is a
   signal.
4. **Reproduce interactively**: run the image with `--entrypoint sh`, or
   override the command with `sleep infinity` and `exec` in, then start
   the app by hand and watch it fail.

### Restart policies

| Policy | Restarts when | After a daemon restart |
|--------|---------------|------------------------|
| `no` (default) | Never | Not started |
| `on-failure[:N]` | The process exits with a non-zero code, optionally at most N times | Not restarted |
| `always` | The process exits for any reason | Started again, even if you had stopped it manually |
| `unless-stopped` | The process exits for any reason | Started again unless you had stopped it |

Docker waits before each restart, doubling the delay from 100 ms, and
resets the delay once a container has run for at least 10 seconds. A
manual `docker stop` is respected until the daemon or the container is
restarted. Restart policies are the single-host equivalent of an
orchestrator's self-healing; they do not move containers to another
machine and do not react to an `unhealthy` health status.

### Limits and what happens at the limit

| Resource | Flag | At the limit |
|----------|------|--------------|
| Memory | `--memory 512m` | The kernel reclaims page cache, then the OOM killer kills a process in the container (exit 137, `OOMKilled: true`) |
| Memory + swap | `--memory-swap 512m` | Equal to `--memory` disables swap; unset, the container may also use swap up to the same amount if the host has swap |
| Soft memory | `--memory-reservation 256m` | Only enforced when the host is short of memory |
| CPU quota | `--cpus 1.5` | The process is throttled for the rest of each 100 ms period: slower, never killed |
| CPU weight | `--cpu-shares 512` | Only matters when CPUs are contended |
| CPU pinning | `--cpuset-cpus 0,1` | Runs only on those cores |
| Processes | `--pids-limit 200` | New processes and threads fail to start |

For Node.js, memory needs extra care: V8's heap is only part of the
process's memory (buffers, native modules, and thread stacks add more),
and the default maximum heap size may not match the container limit. Set
`--max-old-space-size` (in MB) explicitly to roughly 75% of the container
limit so the garbage collector works harder before the kernel steps in.
A process that hits the heap limit dies with a JavaScript "heap out of
memory" error you can read in the logs; a process that hits the container
limit is killed without a message.

### Logging drivers and rotation

Docker captures stdout and stderr through a logging driver:

| Driver | Where logs go | Rotation by default | `docker logs` works |
|--------|---------------|---------------------|---------------------|
| `json-file` (default) | JSON files under `/var/lib/docker/containers/` | No: grows without limit | Yes |
| `local` | Compressed files in an optimized format | Yes: 5 files of 20 MB per container | Yes |
| `journald` | The systemd journal | By journald's settings | Yes |
| `syslog`, `fluentd`, `gelf`, `awslogs`, `gcplogs`, ... | External systems | Handled by the receiver | Yes, through Docker's local cache (dual logging) |

Set the driver and options for the whole host in
`/etc/docker/daemon.json`; they apply to containers created afterwards.
In production, the usual pattern is the `local` or `json-file` driver
with rotation on each host plus a log shipper (Fluent Bit, Vector, the
cloud provider's agent) that sends logs to central storage.

### Health status

When an image or Compose file defines a health check, `docker ps` shows
`(health: starting)`, `(healthy)`, or `(unhealthy)` after the status, and
`docker inspect --format '{{json .State.Health}}'` shows the last five
check results with their output. A `health_status` event is emitted on
every change. Docker Engine does not restart unhealthy containers;
Compose dependencies, Swarm, monitoring, or a small watchdog must act on
the status.

### Disk usage and cleanup

`docker system df` summarizes space used by images, containers, local
volumes, and the build cache, including how much is reclaimable;
`-v` lists every item.

| Command | Removes |
|---------|---------|
| `docker container prune` | Stopped containers |
| `docker image prune` | Dangling images (untagged leftovers of rebuilds) |
| `docker image prune -a` | Every image not used by a container |
| `docker builder prune` | Build cache (`-a` for all of it) |
| `docker volume prune` | Unused anonymous volumes (`--all` adds unused named volumes) |
| `docker network prune` | Networks no container uses |
| `docker system prune` | Stopped containers, unused networks, dangling images, and unused build cache; `-a` and `--volumes` widen it |

All prune commands accept `--filter until=<duration>` so a scheduled job
can remove only old objects. Never run `--volumes` or `volume prune --all`
on a host whose databases might be temporarily stopped.

## When to use and when not to use

| Situation | Tool | Avoid |
|-----------|------|-------|
| A container exited | `docker ps -a`, `inspect`, `logs` | Recreating it before reading its state |
| It restarts in a loop | Crash-loop method above | Raising limits blindly |
| It is slow | `docker stats`, throttling in `cpu.stat`, app metrics | Restarting it and hoping |
| Network problem | `exec` with `curl`, or netshoot in its namespace | Installing tools in the production image |
| Need a file from it | `docker cp` | Bind-mounting host paths after the fact |
| Disk is full | `docker system df -v`, targeted prunes | `system prune -a --volumes` on a database host |
| Many hosts | Central logs and metrics | SSH-ing to each host to run `docker logs` |

Interactive debugging is for diagnosis. The fix belongs in the image or
the configuration, followed by a new deploy: changes made with `exec` are
lost when the container is recreated.

## Practical examples

### The first five commands for any broken container

```bash
docker ps -a --filter name=taskflow-api
docker inspect --format \
  'status={{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}} restarts={{.RestartCount}} finished={{.State.FinishedAt}}' \
  taskflow-api
docker logs --tail 100 --timestamps taskflow-api
docker events --since 30m --filter container=taskflow-api \
  --format '{{.Time}} {{.Action}} exit={{.Actor.Attributes.exitCode}}'
docker inspect --format '{{json .State.Health}}' taskflow-api
```

### A crash loop caused by configuration

```bash
docker run -d --name taskflow-api --restart on-failure:5 \
  -p 3000:3000 taskflow-api:1.4.0

docker ps -a --filter name=taskflow-api --format '{{.Status}}'
# Restarting (1) 2 seconds ago

docker logs --tail 5 taskflow-api
# Error: MONGODB_URI is not set
#     at loadConfig (file:///app/dist/config.js:12:11)

docker rm -f taskflow-api
docker run -d --name taskflow-api --restart on-failure:5 -p 3000:3000 \
  --env-file ./api.env taskflow-api:1.4.0
```

Exit code 1 plus a clear log line: the configuration was missing, so the
fix is the run configuration, not the image. `on-failure:5` stops after
five attempts instead of retrying forever.

### Keeping a crashing image alive to inspect it

```bash
# Override the entry point and get a shell in the same image
docker run --rm -it --entrypoint sh taskflow-api:1.4.0
# inside: ls -la /app; node -e "console.log(process.versions.node)"; node dist/server.js

# Or keep a container running and exec into it
docker run -d --name api-debug --entrypoint sleep taskflow-api:1.4.0 infinity
docker exec -it api-debug sh
docker rm -f api-debug
```

### Debugging a distroless container from a sidecar

```bash
docker run --rm -it \
  --network container:taskflow-api \
  --pid container:taskflow-api \
  nicolaka/netshoot

# inside netshoot:
ps aux                                  # the app's node process is visible
curl -s localhost:3000/healthz          # same localhost as the app
dig mongo                               # name resolution from the app's network
ss -tnp                                 # the app's open connections
ls /proc/1/root/app/dist                # the app's filesystem
```

### Watching resources and adjusting limits

```bash
docker stats --no-stream --format \
  'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.PIDs}}'

# Raise the memory limit of a running container (no restart needed)
docker update --memory 768m --memory-swap 768m taskflow-api

# Was it throttled? Read the cgroup counters
docker exec taskflow-api cat /sys/fs/cgroup/cpu.stat
# nr_periods 51231
# nr_throttled 8452        <- 16% of periods hit the quota
# throttled_usec 912834120
```

```bash
# Size the Node heap to the container limit (512 MB -> about 384 MB of heap)
docker run -d --name taskflow-api --memory 512m \
  -e NODE_OPTIONS=--max-old-space-size=384 \
  taskflow-api:1.4.0
```

### Log rotation for the whole host and for one service

```json
{
  "log-driver": "local",
  "log-opts": {
    "max-size": "20m",
    "max-file": "5"
  },
  "live-restore": true
}
```

```bash
sudo cp daemon.json /etc/docker/daemon.json
sudo systemctl restart docker      # live-restore keeps running containers up
docker info --format '{{.LoggingDriver}}'
```

```yaml
# compose.yaml (excerpt): per-service rotation with the default driver
services:
  api:
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

### A cleanup routine

```bash
docker system df
docker container prune -f --filter until=72h
docker image prune -af --filter until=168h      # unused images older than 7 days
docker builder prune -f --filter until=168h
docker system df
```

Run it from a systemd timer or cron on build hosts and single-server
deployments. Leave volumes to an explicit, reviewed process.

## Best practices

- Read the exit code, `OOMKilled`, and logs before changing anything.
- Log to stdout and stderr in a structured format; never to files inside
  the container.
- Set memory limits on every container and size runtimes (such as the
  Node heap) below them.
- Prefer `on-failure` with a retry limit for jobs and `unless-stopped`
  for long-running services on single hosts; alert on restart counts.
- Configure log rotation on every host and ship logs centrally.
- Enable `live-restore` so daemon upgrades do not stop containers.
- Keep production images free of debugging tools and debug from a
  sidecar container instead.
- Schedule pruning of old images, containers, and build cache; never
  prune volumes automatically.
- Watch CPU throttling, not just CPU percentage, for latency-sensitive
  services.

## In production

- **A container restarts every few hours with exit code 137.**
  *Detect:* `docker inspect` shows `OOMKilled: true`, `docker events`
  shows `oom` events, and memory in `docker stats` climbs steadily before
  each restart. *Cause:* a memory leak or a limit below the real working
  set; the kernel killed the process at the cgroup limit. *Fix:* take heap
  snapshots to find the leak, set `--max-old-space-size` below the limit,
  and size the limit from measured peak usage.
- **The host's disk is full and every container fails.**
  *Detect:* `df -h` shows `/var/lib/docker` at 100%, and
  `du -sh /var/lib/docker/containers/*` shows multi-gigabyte
  `*-json.log` files. *Cause:* the default `json-file` driver without
  rotation. *Fix:* set rotation in `daemon.json` (new containers) and
  `logging` options in Compose, recreate the containers, and ship logs
  off the host.
- **A crash loop goes unnoticed for days.**
  *Detect:* `RestartCount` is in the hundreds, and the logs show the same
  error repeating. *Cause:* `restart: always` hides failures because the
  service keeps coming back briefly. *Fix:* alert on restart counts or
  `die` events, and use `on-failure` with a limit for things that should
  not restart forever.
- **An `unhealthy` container keeps receiving traffic.**
  *Detect:* `docker ps` shows `(unhealthy)` while the reverse proxy still
  routes to it. *Cause:* Docker Engine only reports health; nothing acts
  on it. *Fix:* use an orchestrator (Swarm, Kubernetes) or a watchdog
  that restarts unhealthy containers, and make the proxy check health too.
- **p99 latency doubles under load though CPU usage looks moderate.**
  *Detect:* `nr_throttled` in `cpu.stat` rises with traffic; `docker
  stats` shows CPU pinned at the `--cpus` value. *Cause:* the CPU quota
  throttles bursts within each 100 ms period. *Fix:* raise `--cpus`, run
  more replicas, or reduce CPU work per request.
- **A container exits immediately with code 0.**
  *Detect:* `docker ps -a` shows `Exited (0)` seconds after start, and the
  logs end normally. *Cause:* the main process finished: a command that
  starts the server in the background (`npm start &`), or a daemon that
  forks away (nginx without `daemon off`). *Fix:* run the server in the
  foreground as the container's main process.
- **The build host runs out of space although few images exist.**
  *Detect:* `docker system df` shows tens of gigabytes of build cache.
  *Cause:* BuildKit cache from many builds and branches is never
  collected. *Fix:* `docker builder prune` on a schedule, or configure
  BuildKit garbage collection limits for the builder.

## Important terminology

- **Exit code:** The main process's exit status; 128 + N means killed by
  signal N.
- **OOMKilled:** A flag set when the kernel killed the container's process
  for exceeding its memory limit.
- **Crash loop:** A container that repeatedly starts and fails, restarted
  by a restart policy or an orchestrator.
- **Restart policy:** The rule Docker uses to restart a container after
  it exits.
- **CPU throttling:** Pausing a cgroup's processes for the rest of a
  period after they used their CPU quota.
- **Logging driver:** The plugin that receives a container's stdout and
  stderr and stores or forwards it.
- **Log rotation:** Capping log size by rolling to a new file and deleting
  the oldest.
- **Health status:** `starting`, `healthy`, or `unhealthy`, from the
  container's health check.
- **Dangling image:** An untagged image layer set left behind by a
  rebuild.
- **Live restore:** A daemon setting that keeps containers running while
  `dockerd` restarts.

## Common mistakes and misconceptions

- Treating every 137 as out-of-memory without checking `OOMKilled`.
- Deleting and recreating a failed container before reading its logs and
  state.
- Writing logs to files inside the container.
- Running production hosts with the default unrotated `json-file` logs.
- Expecting Docker to restart an `unhealthy` container.
- Using `restart: always` and assuming a service is healthy because it is
  "Up".
- Installing debugging tools in production images instead of using a
  debugging sidecar.
- Running `docker system prune -a --volumes` on a server that holds data.

## Revision questions

1. A container exited with code 137. List three possible causes and the
   command that distinguishes the out-of-memory case.
2. What do exit codes 126, 127, and 139 each suggest, and where would you
   look next?
3. Describe the steps you would follow to debug a container in a crash
   loop.
4. A host runs 20 containers, each logging 2 MB per minute with the
   default `json-file` driver. How much disk do the logs use per day, and
   what configuration fixes it?
5. What is the difference between `always` and `unless-stopped` after a
   daemon restart?
6. What happens when a container reaches its memory limit compared with
   its CPU limit?
7. How do you debug a distroless container that has no shell?
8. Why should automatic cleanup jobs avoid pruning volumes?

## Further learning

- [Docker CLI reference: docker container inspect](https://docs.docker.com/reference/cli/docker/container/inspect/)
- [Docker CLI reference: docker system prune](https://docs.docker.com/reference/cli/docker/system/prune/)
- [Docker documentation: Local file logging driver](https://docs.docker.com/engine/logging/drivers/local/)
- [Docker documentation: Live restore](https://docs.docker.com/engine/daemon/live-restore/)
- [netshoot: a network troubleshooting container](https://github.com/nicolaka/netshoot)
- Next: [Docker interview questions and answers](interview-questions-and-answers.md).
  Back to the [Docker overview](../docker.md).
