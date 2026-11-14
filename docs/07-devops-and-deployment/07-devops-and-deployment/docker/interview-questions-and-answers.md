# Docker Interview Questions and Answers

These questions review container fundamentals, production Dockerfiles,
images and registries, Docker Compose, networking and storage, security,
and day-to-day operations. Try answering each one before reading the
answer.

## Container fundamentals

### 1. What is a container, and how is it different from a virtual machine?

A container is an ordinary Linux process (or process tree) isolated with
kernel namespaces and limited with cgroups. It shares the host kernel. A
VM runs its own kernel on virtual hardware provided by a hypervisor. So
containers are smaller (megabytes instead of gigabytes) and start in
about a second, while VMs give stronger isolation and can run a different
OS kernel.

### 2. Which kernel features make containers possible?

**Namespaces** decide what a process can see: PID, network, mount, UTS
(hostname), IPC, user, cgroup, and time namespaces. **cgroups** decide
what it can use: memory, CPU, I/O, and number of processes. Security
features (capabilities, seccomp, AppArmor or SELinux) further restrict
what it may do.

### 3. What happens at the cgroup memory limit compared with the CPU limit?

Memory is not compressible: when a container exceeds `--memory`, the
kernel reclaims what it can and then the OOM killer kills a process (exit
137, `OOMKilled: true`). CPU is compressible: a container over its
`--cpus` quota is throttled until the next scheduling period, so it gets
slower but keeps running.

### 4. What is an image made of?

An ordered list of read-only filesystem layers plus a JSON configuration
(environment, user, working directory, entry point, command). Each layer
is a tar archive of the files an instruction added, changed, or deleted,
identified by its SHA-256 digest. A manifest lists the config and layers;
its digest identifies the image.

### 5. How does copy-on-write work in a container?

The runtime stacks the image layers read-only and adds a writable layer
using overlayfs. Reads come from the highest layer that has the file.
The first write to an image file copies the whole file up into the
writable layer; deletions create whiteouts. The writable layer is deleted
with the container, which is why data and write-heavy workloads belong in
volumes.

### 6. What sits between `docker run` and the running process?

The `docker` CLI calls the Docker Engine API on `/var/run/docker.sock`;
`dockerd` asks `containerd` over gRPC to create the container; containerd
starts a `containerd-shim-runc-v2` per container; the shim calls `runc`
with an OCI bundle; runc creates the namespaces and cgroups, starts the
process, and exits. Kubernetes nodes skip dockerd and talk to containerd
through the CRI.

### 7. What is the OCI, and why does it matter?

The Open Container Initiative maintains the image, runtime, and
distribution specifications. Because Docker images are OCI images, the
same image runs on containerd, CRI-O, Podman, and every cloud container
service, and registries expose a common push and pull API.

### 8. What states can a container be in?

`created`, `running`, `paused`, `restarting`, `exited`, plus the transient
`removing` and the rare `dead`. A container lives exactly as long as its
main process: when PID 1 exits, the container exits, whatever else was
running inside.

### 9. Why does Docker Desktop need a virtual machine on macOS and Windows?

Linux containers need a Linux kernel. Docker Desktop runs a lightweight
Linux VM (WSL 2 on Windows, Apple's virtualization framework on macOS)
with dockerd inside. That is why bind mounts are slower there, why
`host.docker.internal` exists, and why resources come from the VM's
allocation.

## Dockerfiles and builds

### 10. Why copy `package.json` and the lockfile before the source code?

The build cache reuses a step only if its instruction and inputs are
unchanged and every previous step was reused. Copying the manifests and
running `npm ci` first means a source-only change reuses the cached
dependency layer; only the final `COPY` and later steps rebuild, so the
build takes seconds instead of a full reinstall.

### 11. What is a multi-stage build, and what does it achieve?

A Dockerfile with several `FROM` stages where later stages copy only
selected outputs with `COPY --from=<stage>`. Build tools, dev
dependencies, source files, and caches stay in earlier stages, so the
final image is smaller, has fewer vulnerabilities, and contains only what
runs.

### 12. What is the difference between exec form and shell form?

Exec form (`CMD ["node", "dist/server.js"]`) runs the program directly as
PID 1. Shell form (`CMD node dist/server.js`) runs it under `/bin/sh -c`,
so the shell is PID 1 and usually does not forward signals; it does
expand variables. Use exec form for `CMD` and `ENTRYPOINT`.

### 13. How do `ENTRYPOINT` and `CMD` interact?

`ENTRYPOINT` is the executable; `CMD` supplies default arguments (or the
whole command if there is no entry point). `docker run <image> <args>`
replaces `CMD` only; `--entrypoint` replaces the entry point. An entry
point script must end with `exec "$@"` so the app replaces the shell.

### 14. Why is PID 1 special, and how do you handle signals in Node?

The kernel applies no default signal actions to PID 1, so a signal it has
no handler for is ignored, and PID 1 should reap orphaned zombies. Node
has no default `SIGTERM` handler, so as PID 1 it ignores `docker stop`
and is killed after 10 seconds. Use exec form, handle `SIGTERM` in the
app (stop accepting, finish requests, close pools, exit), and use
`--init` or `tini` when the app spawns children.

### 15. What does a graceful shutdown handler in Express do?

```js
process.on("SIGTERM", () => {
  server.close(async () => {          // stop accepting; wait for in-flight requests
    await mongoose.disconnect();      // release pools
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 8000).unref(); // before the platform's SIGKILL
});
```

### 16. What is the difference between `ARG` and `ENV`?

`ARG` exists only during the build (from `--build-arg`) and is not in the
running container's environment; `ENV` is set during the build and at
runtime and can be overridden with `docker run -e`. Neither is safe for
secrets: `ARG` values used in `RUN` appear in the image history.

### 17. What does `.dockerignore` protect against?

It excludes files from the build context: the host's `node_modules`
(possibly built for another OS), `.git` (which breaks the cache on every
commit), `.env` files and credentials, and build outputs. A smaller
context also uploads faster.

### 18. Which BuildKit features matter most for production builds?

Cache mounts (`RUN --mount=type=cache,target=/root/.npm`) keep package
caches between builds without storing them in layers; secret mounts
(`--mount=type=secret`) expose credentials to one step only; parallel and
skipped stages; `--target` to stop at a stage; and cache export to a
registry for CI.

### 19. Does a `HEALTHCHECK` make Docker restart an unhealthy container?

No. Docker Engine only records `healthy` or `unhealthy`. Compose uses it
for `depends_on: condition: service_healthy`, Swarm replaces unhealthy
tasks, and monitoring can alert on it. Kubernetes ignores `HEALTHCHECK`
and uses probes.

## Images, registries, and tagging

### 20. What are the parts of an image reference?

`registry/namespace/repository:tag@digest`, for example
`ghcr.io/example/taskflow-api:1.4.0@sha256:...`. The registry defaults to
`docker.io`, Docker Hub Official Images use the `library` namespace, and
the tag defaults to `latest` only when neither a tag nor a digest is
given.

### 21. Why should production deployments reference digests instead of tags?

Tags are mutable pointers that anyone with push access (including CI) can
move; nodes that pull at different times can run different code under the
same tag. A digest is the hash of the manifest, so it always names the
same bytes. Deploying by digest makes every node identical and rollbacks
exact.

### 22. Describe a good tagging strategy.

Tag every CI build with its commit SHA and push it once; add semantic
version tags (`1.4.0`, `1.4`) to that same digest at release time without
rebuilding; reference the digest in deployment manifests; never deploy
`latest`; enable tag immutability where the registry supports it; add OCI
labels for the source repository and revision.

### 23. How does a multi-architecture image work?

The tag points to an image index (manifest list) containing one manifest
per platform, such as `linux/amd64` and `linux/arm64`. The client picks
the entry matching its own platform and pulls only those layers. `docker
buildx build --platform linux/amd64,linux/arm64 --push` builds and
publishes all of them.

### 24. What are the ways to build for another CPU architecture?

QEMU emulation (works for anything, slow for heavy steps), native builder
nodes per architecture (fast, needs the hardware), and cross-compilation
with `FROM --platform=$BUILDPLATFORM` for steps whose output does not
depend on the CPU, such as compiling TypeScript.

### 25. How do you keep Docker builds fast in CI?

Order the Dockerfile for the cache, use BuildKit cache mounts, and export
and import the cache across runs with `--cache-to` and `--cache-from`
(a registry reference or the CI cache) in `mode=max`, so intermediate
stages are cached too.

### 26. Why do pulls fail with `toomanyrequests`, and how do you prevent it?

Docker Hub limits pulls per hour, with much lower limits for anonymous
pulls, and many runners or nodes behind one NAT address share the
anonymous quota. Authenticate pulls, use a pull-through cache or mirror,
or copy base images into your own registry.

### 27. How do you clean up a registry safely?

Use lifecycle or cleanup policies: expire untagged manifests after some
days, keep the newest N commit builds, and keep release tags for the
support window. Never delete a digest that is deployed or needed for a
rollback.

## Docker Compose

### 28. What problem does Docker Compose solve?

It declares a multi-container application (services, images or builds,
ports, environment, volumes, networks, health checks, dependencies) in
one file, so `docker compose up` reproduces the whole stack for
development, tests, demos, or small single-host deployments.

### 29. How do services find each other in Compose?

Compose creates a user-defined bridge network per project, and Docker's
embedded DNS resolves each service name to its container. The API
connects to `mongodb://mongo:27017`; `localhost` inside a container means
the container itself. Services use container ports, not published ports.

### 30. Does `depends_on` wait until a database is ready?

Only with a condition. The short form waits for the container to start.
`condition: service_healthy` waits for the dependency's health check to
pass, and `service_completed_successfully` waits for a one-off task such
as a migration to exit with 0. Apps should still retry connections.

### 31. What is the difference between `.env`, `env_file`, and `environment`?

The project `.env` file feeds `${VAR}` interpolation in the Compose file
and is not passed into containers by itself. `env_file` and `environment`
set variables inside the container, with `environment` winning on
conflicts. `docker compose config` shows the resolved result.

### 32. What are profiles and override files for?

Profiles mark optional services (an admin UI, a mail catcher) that start
only with `--profile`. `compose.override.yaml` is merged automatically on
top of `compose.yaml` for local tweaks; `-f` combines files explicitly,
for example a CI or production overlay.

### 33. What does `docker compose watch` do?

It applies `develop.watch` rules: `sync` copies changed source files into
the running container, `rebuild` rebuilds and recreates the service when
files such as `package-lock.json` change, and `sync+restart` syncs then
restarts. It avoids slow bind mounts on Docker Desktop and never mounts
the host's `node_modules`.

### 34. Is Docker Compose suitable for production?

For small, single-host deployments, yes, with restart policies, log
rotation, backups, and no source bind mounts. It cannot schedule across
hosts, fail over when the host dies, autoscale, or roll out without a
brief gap; that is where Kubernetes or a managed container platform fits.

## Networking and storage

### 35. Why should applications use a user-defined bridge instead of the default bridge?

User-defined bridges provide DNS resolution by container name, isolate the
application from unrelated containers, and allow connecting or
disconnecting containers without restarts. The default bridge has none of
these.

### 36. How does `-p 8080:3000` work, and what is the security catch?

Docker adds NAT rules that forward the host's port 8080 to the
container's port 3000, listening on all interfaces by default. Those rules
are evaluated before simple host-firewall input rules such as `ufw`, so a
published port can be reachable even when the firewall "blocks" it. Bind
sensitive ports to `127.0.0.1` or do not publish them.

### 37. Does `EXPOSE` publish a port?

No. It documents the port the app listens on and is used by `-P`.
Publishing requires `-p` or `ports:`.

### 38. How does a container reach a service running on the host?

Use `host.docker.internal`, which Docker Desktop provides; on Linux add
`--add-host=host.docker.internal:host-gateway` (or `extra_hosts`). The
host service must listen on an address reachable from the bridge, not
only on `127.0.0.1`.

### 39. Compare named volumes, bind mounts, and tmpfs mounts.

Named volumes are Docker-managed, persist past `docker rm`, are pre-filled
from the image when empty, and suit databases and uploads. Bind mounts map
a specific host path, hide the image's files at the target, and suit
source code and config. tmpfs mounts live in memory, vanish when the
container stops, and suit secrets and scratch space.

### 40. How do you back up a Docker volume?

For general files, archive the volume from a helper container:
`docker run --rm -v vol:/data:ro -v "$(pwd)":/backup alpine tar czf
/backup/vol.tgz -C /data .`. For a database, stop it first or, better,
use the database's own tool (`mongodump`) for a consistent backup while
it runs, and test restores.

### 41. Why do bind mounts cause permission errors on Linux but rarely on Docker Desktop?

The kernel checks numeric UIDs: a container running as UID 1000 cannot
write to a host directory owned by another UID, and files a root
container creates become root-owned on the host. Docker Desktop's
file-sharing layer translates ownership, hiding the mismatch. Fix with
`--user "$(id -u):$(id -g)"`, ownership changes, or named volumes.

## Security

### 42. Why run containers as a non-root user?

Without user namespaces, root in a container is UID 0 on the host kernel,
limited only by capabilities, seccomp, and AppArmor or SELinux. Any
escape or kernel bug is far more dangerous from root. Use `USER` with a
numeric UID so orchestrators can verify it, and keep app files read-only
to that user.

### 43. Which runtime flags harden a container?

`--user 1000:1000`, `--read-only` with `--tmpfs /tmp`,
`--cap-drop ALL` (adding back only what is needed),
`--security-opt no-new-privileges:true`, memory, CPU, and PID limits,
publishing on `127.0.0.1`, and never `--privileged`.

### 44. Why is mounting `/var/run/docker.sock` dangerous?

Whoever can call the Docker API can start a privileged container with the
host's root filesystem mounted, so socket access equals root on the host.
The same applies to membership in the `docker` group and to an
unauthenticated TCP daemon.

### 45. How can a secret end up in an image, and how do you prevent it?

`COPY` of a credentials file (even if a later `RUN rm` deletes it, the
earlier layer keeps it), `ARG` or `ENV` values (visible in history and
config), or an unignored `.env` in the context. Use BuildKit secret mounts
for build-time secrets, a `.dockerignore`, and runtime injection as files
for runtime secrets.

### 46. What do distroless images give you?

Only the language runtime and its libraries: no shell, no package
manager, far fewer packages. That reduces CVEs and leaves an attacker
without the usual tools. Debugging needs an ephemeral sidecar container
that shares the target's namespaces.

### 47. How does image scanning fit into a pipeline?

Scanners (Trivy, Grype, Docker Scout) inventory OS and language packages
and match them against vulnerability databases. Scan in CI and fail on
fixable high or critical issues, scan continuously in the registry because
new CVEs appear after the build, and fix mostly by rebuilding on patched
bases.

### 48. What do pinning by digest and signing each prove?

Pinning a base image by digest makes builds reproducible and immune to a
moved or compromised tag (pair it with an update bot). Signing an image
digest with `cosign` proves who built it; admission policies can then
reject unsigned images. Together they answer "which bytes" and "from
whom".

## Debugging and operations

### 49. What does exit code 137 mean, and how do you confirm the cause?

128 + 9: the process received `SIGKILL`. Check `docker inspect --format
'{{.State.OOMKilled}}'`: `true` means the memory limit was hit. Otherwise
it was `docker kill`, or a process that ignored `SIGTERM` until `docker
stop`'s timeout.

### 50. What do exit codes 125, 126, 127, 139, and 143 indicate?

125: the `docker run` command itself failed. 126: the command could not be
executed (permissions, not a program). 127: the command was not found.
139: segmentation fault (128 + 11), usually native code. 143: terminated by
`SIGTERM` (128 + 15) without a handler that exited cleanly.

### 51. How do you debug a container in a crash loop?

Read the state (`docker inspect`: exit code, `OOMKilled`, restart count,
health), read the failed run's logs (`docker logs --tail 100`), check
`docker events` for kills and stops, then reproduce interactively with
`docker run --rm -it --entrypoint sh <image>` or by overriding the
command with `sleep infinity` and `exec`ing in.

### 52. Compare the restart policies.

`no` never restarts. `on-failure[:N]` restarts on non-zero exits, up to N
times. `always` restarts on any exit and again after a daemon restart,
even if you stopped it. `unless-stopped` is like `always` but stays
stopped after a daemon restart if you stopped it. Docker doubles the
delay between restarts, starting at 100 ms.

### 53. Why do Docker hosts run out of disk, and how do you prevent it?

Unrotated `json-file` logs, old images and stopped containers, build
cache, anonymous volumes, and apps writing into container layers. Set log
rotation (or the `local` driver) in `daemon.json`, prune images,
containers, and build cache on a schedule, run short-lived containers with
`--rm`, and monitor `/var/lib/docker`.

### 54. How do you debug a container that has no shell?

Start a debugging container in its namespaces:
`docker run --rm -it --network container:api --pid container:api
nicolaka/netshoot`. It shares the app's `localhost`, sees its processes,
and can read its filesystem through `/proc/<pid>/root`. Docker Desktop's
`docker debug` does the same.

## Scenario-based questions

### 55. A one-line code change makes the CI image build take four minutes. What do you check?

**What to check first:** the Dockerfile's instruction order and whether
`npm ci` shows `CACHED` in the build log.

**How to confirm:** the dependency install runs on commits that only
change source files; the `.dockerignore` is missing `.git`, or CI imports
no cache.

**Likely causes and fixes:** `COPY . .` before `npm ci`, a context that
changes on every commit, or fresh runners with no cache. Copy the
manifests first, add `.dockerignore`, and export the cache with
`--cache-to ... mode=max`. See
[writing production Dockerfiles](writing-production-dockerfiles.md).

### 56. Every deploy takes ten extra seconds per container, and some requests fail with 502. Why?

**What to check first:** the exit code of the old containers and the
`CMD` form.

**How to confirm:** `docker stop` always takes the full timeout and the
old container exits with 137.

**Likely causes and fixes:** PID 1 is a shell or `npm`, or the app has no
`SIGTERM` handler. Use exec-form `CMD ["node", ...]`, add a graceful
shutdown handler, and use `--init` or `tini`. See
[writing production Dockerfiles](writing-production-dockerfiles.md).

### 57. An image built on a developer's MacBook fails on the server with `exec format error`. What happened?

**What to check first:** the image's architecture with `docker image
inspect --format '{{.Architecture}}'`.

**How to confirm:** it reports `arm64` while the server is `amd64`.

**Likely causes and fixes:** the image was built on Apple silicon for the
local platform. Build in CI for the target platform or publish a
multi-platform image with `docker buildx --platform
linux/amd64,linux/arm64`. See
[images, registries, and tagging](images-registries-and-tagging.md).

### 58. After a "deploy", half of the servers still run the old version. How do you fix the process?

**What to check first:** the image reference in the deployment
configuration.

**How to confirm:** it uses a mutable tag (`latest` or `1.4`), and
`docker inspect` shows different image IDs on different servers.

**Likely causes and fixes:** nodes pulled the tag at different times or
reused cached images. Deploy by digest or an immutable commit-SHA tag and
promote the same digest through environments. See
[images, registries, and tagging](images-registries-and-tagging.md).

### 59. `docker compose up` fails because the API cannot connect to MongoDB, but a second `up` works. Why?

**What to check first:** the `depends_on` definition and MongoDB's health
check.

**How to confirm:** the API logs `ECONNREFUSED` in the first seconds while
MongoDB is still initializing.

**Likely causes and fixes:** `depends_on` without a condition only waits
for the container to start. Add a `mongosh` ping health check, use
`condition: service_healthy`, and add connection retries. See
[Docker Compose for development](docker-compose-for-development.md).

### 60. The API container logs `ECONNREFUSED 127.0.0.1:27017`, but MongoDB is running. What is wrong?

**What to check first:** the connection string.

**How to confirm:** it uses `localhost`, and MongoDB runs in another
container or on the host.

**Likely causes and fixes:** `localhost` inside a container is the
container itself. Use the service name (`mongo`) on a shared network, or
`host.docker.internal` for a database on the host. See
[container networking and storage](container-networking-and-storage.md).

### 61. A security scan of the internet finds your MongoDB port open although `ufw` denies it. How?

**What to check first:** `docker ps` port mappings on that host.

**How to confirm:** the container shows `0.0.0.0:27017->27017/tcp`.

**Likely causes and fixes:** published ports are handled by Docker's NAT
rules before `ufw`'s input rules. Remove the mapping or bind it to
`127.0.0.1`, filter in `DOCKER-USER` or a cloud firewall, and enable
database authentication. See
[container networking and storage](container-networking-and-storage.md).

### 62. Users' uploaded files disappear after every deploy. Why?

**What to check first:** where the API writes uploads and the
container's mounts.

**How to confirm:** `docker inspect` shows no volume at the upload path,
and `docker diff` on a running container lists the files as added.

**Likely causes and fixes:** files go to the writable layer, which is
deleted with the container. Mount a named volume there, or better, store
uploads in object storage so any instance can serve them. See
[container networking and storage](container-networking-and-storage.md).

### 63. A registry token is discovered in a public image. What do you do?

**What to check first:** which credential leaked and in which layers and
tags.

**How to confirm:** `docker history --no-trunc` or an extracted layer
shows `.npmrc` or the token in an `ARG`.

**Likely causes and fixes:** a `COPY` of the file or a build argument.
Revoke and rotate the token immediately, rebuild with a secret mount,
delete the affected images, and add secret scanning to CI. See
[container security](container-security.md).

### 64. A monitoring dashboard container has `/var/run/docker.sock` mounted. Is that a problem?

**What to check first:** whether the dashboard is reachable by other
users and whether the mount is read-write.

**How to confirm:** `docker inspect` shows the socket mount; anyone who
compromises the dashboard can call the Docker API.

**Likely causes and fixes:** socket access is root on the host (a
read-only mount does not change that, because API calls are still
possible). Remove it, use a socket proxy that allows only read-only
endpoints, or run the tool on an isolated host. See
[container security](container-security.md).

### 65. A service restarts every few hours with exit code 137. How do you investigate?

**What to check first:** `OOMKilled` and the memory trend in
`docker stats` or metrics.

**How to confirm:** `OOMKilled: true`, `oom` events, and memory climbing
steadily before each restart.

**Likely causes and fixes:** a leak or a limit below the working set.
Take heap snapshots, set `--max-old-space-size` to about 75% of the limit,
and size the limit from measured peaks. See
[debugging and operating containers](debugging-and-operating-containers.md).

### 66. A Docker host runs out of disk space overnight. What do you check?

**What to check first:** `docker system df -v` and the size of
`/var/lib/docker/containers/*/*-json.log`.

**How to confirm:** one container's log file is many gigabytes, or images
and build cache dominate.

**Likely causes and fixes:** unrotated `json-file` logs, accumulated
images, or build cache. Configure log rotation in `daemon.json`, recreate
containers, prune on a schedule, and ship logs centrally. See
[debugging and operating containers](debugging-and-operating-containers.md).

### 67. A container shows `(unhealthy)` for an hour but still serves traffic. Why didn't Docker fix it?

**What to check first:** what consumes the health status on this host.

**How to confirm:** the container uses only a restart policy; nothing
listens to `health_status` events.

**Likely causes and fixes:** Docker Engine reports health but never
restarts unhealthy containers. Use an orchestrator or a watchdog that
restarts them, and make the load balancer check health. See
[debugging and operating containers](debugging-and-operating-containers.md).

### 68. A container with `--cpus 1` has high p99 latency at peak, but average CPU looks fine. What is happening?

**What to check first:** throttling counters in the container's
`cpu.stat`.

**How to confirm:** `nr_throttled` rises with traffic, and `docker stats`
shows bursts at 100%.

**Likely causes and fixes:** the CPU quota throttles bursts within each
100 ms period even when the average is low. Raise the quota, add
replicas, or reduce CPU work per request. See
[container fundamentals](container-fundamentals.md).

## Further learning

- [Docker overview](../docker.md)
- [Container fundamentals](container-fundamentals.md) ·
  [Writing production Dockerfiles](writing-production-dockerfiles.md) ·
  [Images, registries, and tagging](images-registries-and-tagging.md) ·
  [Docker Compose for development](docker-compose-for-development.md) ·
  [Container networking and storage](container-networking-and-storage.md) ·
  [Container security](container-security.md) ·
  [Debugging and operating containers](debugging-and-operating-containers.md)
- [Docker documentation](https://docs.docker.com/)
- [OWASP Docker Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html)
