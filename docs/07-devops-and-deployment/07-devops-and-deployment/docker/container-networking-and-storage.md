# Container Networking and Storage

Every container gets its own network stack and its own filesystem, and
both are thrown away when the container is removed. This lesson explains
how containers talk to each other, to the host, and to the outside world
(network drivers, the default and user-defined bridges, embedded DNS,
port publishing), and how they keep data that must outlive them (named
volumes, bind mounts, and tmpfs mounts), including backups, file
ownership problems, and the performance quirks of Docker Desktop.

## Why it matters

Most "it works on my machine but not in Docker" problems are networking or
storage problems: an API that connects to `localhost` and finds nothing,
a database port accidentally published to the whole internet, a container
that cannot reach a service on the host, data that vanished with a
container, or a bind mount that the container user cannot write to.

These are also security and reliability decisions. A port published on
`0.0.0.0` is reachable by every machine that can reach the host, and on
Linux it can bypass the host firewall. A database stored in a container's
writable layer is lost on the next deploy. Knowing exactly where packets
go and where bytes are stored prevents both.

## Real-world usage

- **Docker: firewalls.** The
  [packet filtering and firewalls](https://docs.docker.com/engine/network/packet-filtering-firewalls/)
  documentation explains that Docker writes its own NAT and filter rules
  for published ports, and warns that this makes published ports
  incompatible with simple host firewalls such as `ufw` and `firewalld`
  rules that only filter the host's input chain.
- **Docker: user-defined bridges.** The
  [bridge network driver](https://docs.docker.com/engine/network/drivers/bridge/)
  page lists why user-defined bridges are better than the default bridge:
  automatic DNS resolution between containers, better isolation, and
  attaching or detaching containers without restarting them.
- **Docker: volumes.** The [volumes](https://docs.docker.com/engine/storage/volumes/)
  guide describes volumes as the preferred mechanism for persisting data
  generated and used by containers, because Docker manages them and they
  work the same on Linux and Docker Desktop.
- **Docker Desktop on Windows.** The
  [WSL best practices](https://docs.docker.com/desktop/features/wsl/best-practices/)
  page recommends storing project files in the Linux file system rather
  than the Windows one for bind-mount performance and file-change events.

**Popular tools and providers:** Docker networks and volumes, the
`netshoot` debugging image, `nsenter`, `ss` and `tcpdump`, CNI plugins in
Kubernetes (Calico, Cilium), and volume plugins and CSI drivers for
network storage.

## How it works

### Network drivers

| Driver | What the container gets | Typical use |
|--------|------------------------|-------------|
| `bridge` | Its own network namespace on a virtual switch on the host, with a private IP and NAT to the outside | The default for single-host containers |
| `host` | No network isolation: it uses the host's interfaces and ports directly | Network-heavy tools on Linux; avoids NAT |
| `none` | Only a loopback interface | Batch jobs that must not use the network |
| `overlay` | A virtual network spanning several Docker hosts (Swarm) | Multi-host Swarm services |
| `macvlan`, `ipvlan` | An address directly on the physical network | Legacy apps that need to look like physical hosts |

On Docker Desktop the "host" is the Linux VM, so host networking behaves
differently from native Linux; treat it as a Linux-only feature. Kubernetes
does not use these drivers at all: it uses CNI plugins that give every
pod a routable IP (see
[pods, deployments, and services](../kubernetes/pods-deployments-and-services.md)).

### The default bridge compared with user-defined bridges

Docker creates a bridge called `docker0` (network name `bridge`) at
install time, and containers started without `--network` join it. It is
kept for backwards compatibility and lacks the features you want:

| | Default bridge (`docker0`) | User-defined bridge |
|-|----------------------------|---------------------|
| Resolve other containers by name | No (only the legacy `--link` flag) | Yes, through embedded DNS |
| Isolation | Every unconfigured container shares it | Only containers you attach |
| Attach or detach a running container | Requires a restart | `docker network connect` / `disconnect` |
| Created by | Docker at install | `docker network create`, or Compose per project |

Always create a network for an application (Compose does this
automatically). Inside each container, `/etc/resolv.conf` points to
Docker's embedded DNS server at `127.0.0.11`, which answers for container
names, service names, and `--network-alias` names on that network and
forwards everything else to the host's resolvers. Several containers can
share an alias, in which case DNS returns all their addresses.

### How port publishing works

A container's ports are reachable from other containers on the same
network, but not from outside the host, until you publish them.
`docker run -p 8080:3000` tells Docker to forward the host's port 8080 to
the container's port 3000.

![Diagram: a LAN client connects to the host's eth0 address 192.0.2.10 on port 8080, and NAT rules created by -p 8080:3000 forward it to the api container at 172.18.0.2 port 3000 on the user-defined bridge taskflow_default; another LAN client's attempt on port 27017 is refused because MongoDB is published only on 127.0.0.1; a developer on the host reaches mongo at 172.18.0.3 port 27017 through -p 127.0.0.1:27017:27017; api reaches mongo by the name mongo, resolved by embedded DNS at 127.0.0.11; the default bridge docker0 has no name resolution, and outbound container traffic is masqueraded to the host's IP.](bridge-network-port-mapping.svg)

What happens underneath on Linux:

1. Docker adds a destination NAT (DNAT) rule: packets arriving at the
   host on port 8080 are rewritten to `172.18.0.2:3000`.
2. Filter rules allow the forwarded traffic to reach the bridge.
3. For connections from the host itself to `localhost:8080`, Docker by
   default also runs a small `docker-proxy` process that listens on the
   port.
4. Outbound traffic from containers is masqueraded (source NAT) to the
   host's address, so containers can reach the internet without being
   reachable from it.

The forms of `-p` you need:

| Flag | Listens on | Reachable from |
|------|------------|----------------|
| `-p 8080:3000` | All host addresses (`0.0.0.0` and `::`) | Every machine that can reach the host |
| `-p 127.0.0.1:8080:3000` | Host loopback only | Only the host itself |
| `-p 3000` | A random high host port | Every machine; see it with `docker port` |
| `-P` | Random ports for every `EXPOSE`d port | Every machine |
| (no `-p`) | Nothing on the host | Only containers on the same network |

`EXPOSE` in a Dockerfile documents a port; it publishes nothing.

Because published ports are handled by NAT before the host's normal input
rules, a firewall such as `ufw` that blocks port 27017 does **not** stop a
container published with `-p 27017:27017`. Publish databases on
`127.0.0.1` or not at all, and put your own filtering rules in Docker's
`DOCKER-USER` chain if you must filter published ports.

### Reaching the host from a container

`localhost` inside a container is the container itself. To reach a
service running on your machine (a database you started outside Docker,
a mock server):

- On **Docker Desktop**, use the special name `host.docker.internal`.
- On **Linux**, add it yourself with
  `--add-host=host.docker.internal:host-gateway` (or `extra_hosts` in
  Compose). `host-gateway` resolves to the host's address on the bridge.
- The host service must listen on an address the container can reach. A
  database bound only to `127.0.0.1` on a Linux host is not reachable
  from the bridge; bind it to the bridge address or `0.0.0.0` behind a
  firewall.

### Storage options

A container's own filesystem is the image plus a writable layer that is
deleted with the container. Anything that must survive, or must be fast,
or must be shared with the host, needs a mount.

![Diagram: four storage options compared; a path with no mount such as /app/data lives in the container's overlayfs upper layer, is lost on docker rm, and pays copy-on-write costs; a named volume such as -v mongo-data:/data/db lives in a Docker-managed directory under /var/lib/docker/volumes, survives docker rm at native disk speed, and suits databases and uploads; a bind mount such as -v "$(pwd)/src:/app/src" maps any host directory, survives because the files belong to the host, is native on Linux but slower through Docker Desktop, and suits source code and config; a tmpfs mount such as --tmpfs /tmp lives in RAM, is lost when the container stops, and suits secrets and scratch files.](storage-options-comparison.svg)

| | Named volume | Bind mount | tmpfs |
|-|--------------|------------|-------|
| Syntax | `-v mongo-data:/data/db` | `-v "$(pwd)/src:/app/src"` | `--tmpfs /tmp` |
| Long syntax | `--mount type=volume,src=mongo-data,dst=/data/db` | `--mount type=bind,src=$(pwd)/src,dst=/app/src` | `--mount type=tmpfs,dst=/tmp,tmpfs-size=64m` |
| Where the data is | Docker's storage area on the host (inside the VM on Docker Desktop) | The host path you name | Host memory |
| Survives `docker rm` | Yes | Yes (host files) | No |
| Pre-filled from the image | Yes, if empty on first mount | No: it hides the image's files at that path | No |
| Portable across hosts and OSes | Yes | No: depends on host paths | Yes |
| Typical use | Databases, uploads, caches | Source code in development, config files | Secrets, scratch space, `--read-only` containers |

`-v` with a host path that does not exist silently creates an empty
directory owned by root; `--mount` fails with an error instead, which is
why scripts and production configurations should prefer `--mount`.
Append `:ro` (or `readonly` in `--mount`) to mount read-only.

### Volume lifecycle

- **Named volumes** are created by `docker volume create`, by the first
  `docker run -v name:/path`, or by Compose. They persist until removed
  explicitly with `docker volume rm` or a prune.
- **Anonymous volumes** are created by `-v /path` without a name or by a
  `VOLUME` instruction in the image. They get a random name and are
  removed together with the container only if it was started with `--rm`
  or removed with `docker rm -v`.
- **Pruning:** `docker volume prune` removes unused anonymous volumes;
  add `--all` to include unused named volumes (Docker Engine 23 changed
  the default to anonymous-only).
- `docker volume inspect` shows the `Mountpoint` on the host; do not edit
  files there while a database is running.

### Backing up a volume

A volume is just a directory, so a helper container can archive it. For a
database, a file-level copy is only consistent if the database is
stopped (or the storage supports snapshots); otherwise use the
database's own backup tool, such as `mongodump`, which produces a
consistent logical backup while it runs. Backups in depth are covered in
[database backups and point-in-time recovery](../backups/database-backups-and-point-in-time-recovery.md).

### File ownership and UIDs

The kernel compares numeric user IDs, not names. Inside the official
Node image the `node` user is UID 1000; on your Linux host, UID 1000 is
whoever was created first. With a bind mount:

- Files the container creates appear on the host owned by the
  container's UID (root-owned files in your project folder if the
  container runs as root).
- A container running as UID 1000 cannot write to a host directory owned
  by UID 1001 with mode `755`.

Fixes: run the container with your own IDs
(`--user "$(id -u):$(id -g)"`), create and `chown` directories in the
image for named volumes, or use named volumes instead of bind mounts for
data. On SELinux systems (Fedora, RHEL), bind mounts also need the `:z`
or `:Z` option to relabel the files. Docker Desktop's file-sharing layer
usually hides UID mismatches, which is why these errors often appear
only on Linux servers and CI.

### Docker Desktop file-sharing performance

On macOS and Windows, a bind mount crosses from your OS into the Linux
VM, and every file operation pays for that crossing. Directories with
tens of thousands of small files (`node_modules`, `.git`) make it worst.

- **Windows:** keep the project inside the WSL 2 Linux filesystem (for
  example `~/code/taskflow` in your distribution), not under `C:\`.
  Bind mounts from the Windows filesystem are slower and do not deliver
  file-change events reliably, so watchers miss edits.
- **macOS:** the VirtioFS file-sharing implementation is much faster than
  the older ones; select it in Docker Desktop's settings if it is not
  already the default.
- **Both:** never bind-mount the host's `node_modules` into the
  container. Use `docker compose watch` to sync only source files, or
  mount the project and put `node_modules` in a volume.

## When to use and when not to use

| Need | Choose |
|------|--------|
| Containers of one app talking to each other | A user-defined bridge (Compose's default network) |
| Access to the API from your browser | `-p 3000:3000` (or `127.0.0.1:3000:3000` on shared machines) |
| Access to a local database from your tools | `-p 127.0.0.1:27017:27017` |
| A database that must never be reachable from outside | No `-p` at all |
| Maximum network performance on Linux | `--network host`, accepting port conflicts and no isolation |
| Persist database files | Named volume (or a managed database in production) |
| Live-edit source code | Compose watch, or a bind mount on Linux |
| A secret or scratch files that must not touch disk | tmpfs |
| Share files between hosts | Object storage or a network volume driver, not a bind mount |

Do not use host networking to work around a misunderstanding of
`localhost`, and do not run production databases on bind mounts to
arbitrary host folders without backups and permission management.

## Practical examples

### A user-defined network and name resolution

```bash
docker network create taskflow-net

docker run -d --name mongo --network taskflow-net \
  -v mongo-data:/data/db mongo:8.0

docker run -d --name api --network taskflow-net -p 3000:3000 \
  -e MONGODB_URI=mongodb://mongo:27017/taskflow \
  taskflow-api:dev

# How names resolve inside the network
docker run --rm --network taskflow-net busybox:1.37 nslookup mongo
# Server:    127.0.0.11
# Name:      mongo
# Address:   172.18.0.2

docker network inspect taskflow-net --format '{{json .Containers}}'
```

The same `nslookup` from a container on the default bridge fails, because
the default bridge has no embedded DNS for container names.

### Publishing ports safely and checking them

```bash
# API for the browser; MongoDB only for tools on this machine
docker run -d --name api -p 3000:3000 taskflow-api:dev
docker run -d --name mongo -p 127.0.0.1:27017:27017 mongo:8.0

docker port mongo
# 27017/tcp -> 127.0.0.1:27017

sudo ss -ltnp | grep -E ':3000|:27017'   # what is listening, on which address
```

### Reaching a service on the host

```bash
# Docker Desktop: works out of the box
docker run --rm curlimages/curl:8.15.0 http://host.docker.internal:4000/health

# Linux: map the name to the host's bridge gateway first
docker run --rm --add-host=host.docker.internal:host-gateway \
  curlimages/curl:8.15.0 http://host.docker.internal:4000/health
```

```yaml
# compose.yaml (excerpt): the same mapping in Compose
services:
  api:
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

### Backing up and restoring a volume

```bash
# File-level archive of a volume (stop the database first for consistency)
docker compose stop mongo
docker run --rm \
  -v taskflow_mongo-data:/data:ro \
  -v "$(pwd)":/backup \
  alpine:3.22 tar czf /backup/mongo-data-$(date +%F).tgz -C /data .
docker compose start mongo

# Restore into a new, empty volume
docker volume create taskflow_mongo-data-restored
docker run --rm \
  -v taskflow_mongo-data-restored:/data \
  -v "$(pwd)":/backup \
  alpine:3.22 tar xzf /backup/mongo-data-2026-11-13.tgz -C /data

# Logical backup while MongoDB keeps running (-T: no TTY, binary-safe)
docker compose exec -T mongo mongodump --archive --gzip > taskflow-$(date +%F).archive.gz
docker compose exec -T mongo mongorestore --archive --gzip --drop < taskflow-2026-11-13.archive.gz
```

### Fixing ownership on a bind mount

```bash
# Files created in ./output belong to your user, not root
docker run --rm --user "$(id -u):$(id -g)" \
  -v "$(pwd)/output:/out" \
  taskflow-api:dev node dist/scripts/export.js /out/tasks.json
```

```dockerfile
# Dockerfile (excerpt): a writable directory for a named volume
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node
VOLUME ["/app/uploads"]
```

An empty named volume mounted at `/app/uploads` copies the directory's
ownership from the image on first use, so the `node` user can write to it.
(This is one of the few good reasons to declare `VOLUME`; many teams still
prefer to declare the mount only in Compose or Kubernetes.)

### A read-only container with tmpfs scratch space

```bash
docker run -d --name api --read-only \
  --tmpfs /tmp:rw,size=64m \
  -p 3000:3000 taskflow-api:dev
```

The root filesystem cannot be modified, which blocks a whole class of
attacks, while `/tmp` still works for libraries that need scratch files.
This pattern returns in [container security](container-security.md).

### Compose: keep `node_modules` out of a bind mount

```yaml
# compose.yaml (excerpt): bind-mount the code, keep dependencies in the image
services:
  api:
    build:
      context: .
      target: build
    volumes:
      - ./:/app                # project from the host
      - /app/node_modules      # anonymous volume masks the host's node_modules
```

The anonymous volume at `/app/node_modules` is pre-filled from the image
on first creation, so the container uses the Linux dependencies installed
during the build. When dependencies change, recreate it with
`docker compose up -d --build --renew-anon-volumes`. Compose Watch avoids
this trick entirely.

## Best practices

- Create a network per application; never rely on the default bridge.
- Connect services by name; never hard-code container IP addresses.
- Publish only what a human or external client needs, and bind
  development and database ports to `127.0.0.1`.
- Remember that published ports bypass simple host firewalls on Linux.
- Store data in named volumes (or managed services), never in the
  writable layer.
- Prefer `--mount` in scripts so a missing host path is an error.
- Back up databases with their own tools, and test restores.
- Run containers as a non-root user and plan ownership of writable paths.
- On Docker Desktop, keep projects in the VM-friendly location and avoid
  bind-mounting `node_modules`.

## In production

- **A database is reachable from the internet although `ufw` blocks it.**
  *Detect:* an external port scan shows 27017 open; `docker ps` shows
  `0.0.0.0:27017->27017/tcp`. *Cause:* `-p 27017:27017` publishes on all
  interfaces, and Docker's NAT rules are evaluated before `ufw`'s input
  rules. *Fix:* do not publish database ports, or bind them to
  `127.0.0.1`; filter in the `DOCKER-USER` chain or a cloud firewall;
  enable authentication regardless.
- **The API logs `ECONNREFUSED 127.0.0.1:27017`.**
  *Detect:* the error appears only in the container, and the same
  configuration works outside Docker. *Cause:* the connection string uses
  `localhost`, which inside the container is the container itself.
  *Fix:* use the service name (`mongodb://mongo:27017`), or
  `host.docker.internal` for a database on the host.
- **Containers cannot resolve each other's names.**
  *Detect:* `getaddrinfo ENOTFOUND mongo`; `docker inspect` shows the
  containers on the `bridge` network. *Cause:* containers started without
  `--network` join the default bridge, which has no name DNS. *Fix:*
  create a user-defined network (or use Compose) and attach both.
- **Some corporate addresses become unreachable when Docker starts.**
  *Detect:* VPN or office subnets in the `172.17.0.0/16` to
  `172.31.0.0/16` range stop responding while Docker networks exist.
  *Cause:* Docker's default address pools overlap the corporate ranges.
  *Fix:* set `bip` and `default-address-pools` in
  `/etc/docker/daemon.json` (or Docker Desktop's settings) to unused
  ranges, then recreate the networks.
- **`EACCES: permission denied` writing to a mounted directory.**
  *Detect:* the error appears on Linux servers but not on Docker
  Desktop; `ls -ln` shows a different numeric owner. *Cause:* the
  container's UID does not own the host directory. *Fix:* match UIDs
  with `--user`, `chown` the directory, or use a named volume prepared in
  the image.
- **The host disk fills up with volumes nobody recognizes.**
  *Detect:* `docker system df -v` lists many anonymous volumes with
  64-character names. *Cause:* images with `VOLUME` instructions and
  containers removed without `-v`. *Fix:* `docker volume prune`, run
  short-lived containers with `--rm`, and avoid `VOLUME` in your images.
- **File watching is slow or misses changes on Windows.**
  *Detect:* saves take seconds to appear, or the dev server never
  reloads. *Cause:* the project is bind-mounted from the Windows
  filesystem through the VM. *Fix:* move the project into the WSL 2
  filesystem or use Compose Watch.

## Important terminology

- **Network namespace:** The kernel feature that gives a container its
  own interfaces, routes, and ports.
- **Bridge network:** A virtual switch on the host connecting containers
  with private IPs and NAT to the outside.
- **User-defined bridge:** A bridge created with `docker network create`
  (or by Compose) that provides name resolution.
- **Embedded DNS:** Docker's DNS server at `127.0.0.11` inside containers
  on user-defined networks.
- **Port publishing:** Mapping a host port to a container port with
  `-p`, implemented with NAT rules.
- **DNAT / masquerading:** Rewriting a packet's destination (inbound) or
  source (outbound) address.
- **Named volume:** Docker-managed persistent storage referenced by name.
- **Anonymous volume:** A volume with a random name, created by `VOLUME`
  or `-v /path`.
- **Bind mount:** A host file or directory mounted into a container.
- **tmpfs mount:** A memory-backed filesystem that disappears when the
  container stops.

## Common mistakes and misconceptions

- Believing `EXPOSE` makes a port reachable.
- Using `localhost` to reach another container or the host.
- Publishing every port on `0.0.0.0` and trusting the host firewall.
- Hard-coding container IP addresses, which change on every recreation.
- Copying a running database's files and calling it a backup.
- Assuming `docker volume prune` only deletes anonymous volumes in every
  version, or that it never deletes named ones (`--all` does).
- Expecting bind mounts to behave the same on Linux, macOS, and Windows.

## Revision questions

1. Why can the API reach `mongo:27017` on a Compose network but not on the
   default bridge?
2. What is the difference between `-p 27017:27017` and
   `-p 127.0.0.1:27017:27017`, and why does `ufw` not protect the first?
3. A container connects to `localhost:5432` for a PostgreSQL server
   running on the host. Why does it fail, and what are two fixes?
4. Compare named volumes, bind mounts, and tmpfs for persistence,
   performance, and portability.
5. A volume holds 12 GB of MongoDB data. A `tar` backup runs at 60 MB/s.
   How long must MongoDB stay stopped for a consistent file-level copy,
   and what would you use instead to avoid the downtime?
6. Why do permission errors on bind mounts often appear on Linux servers
   but not on a developer's Mac?
7. What happens to the image's files at `/app/uploads` when you mount an
   empty named volume there, and when you bind-mount an empty host
   directory there?

## Further learning

- [Docker documentation: Networking overview](https://docs.docker.com/engine/network/)
- [Docker documentation: Port publishing and mapping](https://docs.docker.com/engine/network/port-publishing/)
- [Docker documentation: Bind mounts](https://docs.docker.com/engine/storage/bind-mounts/)
- [Docker documentation: tmpfs mounts](https://docs.docker.com/engine/storage/tmpfs/)
- [Linux manual: network_namespaces(7)](https://man7.org/linux/man-pages/man7/network_namespaces.7.html)
- Next: [container security](container-security.md). Back to the
  [Docker overview](../docker.md).
