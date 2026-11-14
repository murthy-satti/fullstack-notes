# Container Security

Containers isolate processes, but the isolation is only as strong as the
way you build and run them. A default container runs as root, keeps a
set of Linux capabilities, has a writable filesystem, and shares the
host's kernel with every other container. This lesson works through the
attack surface layer by layer, from the image contents and the build
process to the running process, the kernel, and the host: non-root users,
read-only filesystems, dropped capabilities, `no-new-privileges`,
rootless Docker, keeping secrets out of layers, minimal base images,
vulnerability scanning, pinning by digest, signing images, and why the
Docker socket is effectively root on the host.

## Why it matters

Container security failures tend to be quiet and severe. A token copied
into a layer is readable by anyone who can pull the image, for as long as
the image exists. A compromised process running as root with extra
capabilities, the Docker socket, or `--privileged` can take over the
host and every container on it. An image built a year ago carries a
year of unpatched vulnerabilities into production on every deploy.

Most of the defenses cost a few lines in a Dockerfile or a run
configuration. They also map directly onto Kubernetes `securityContext`
settings, so learning them once pays off on every platform.

## Real-world usage

- **NIST.** [Special Publication 800-190, Application Container Security
  Guide](https://csrc.nist.gov/pubs/sp/800/190/final) groups container
  risks into image, registry, orchestrator, container, and host-OS risks,
  and recommends countermeasures such as minimal images, vulnerability
  management, and treating the shared kernel as a risk boundary.
- **OWASP.** The
  [Docker Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html)
  lists rules that this page applies: do not expose the Docker socket,
  set a user, limit capabilities, prevent privilege escalation with
  `no-new-privileges`, use read-only filesystems, and scan images.
- **Docker.** The [Docker Engine security](https://docs.docker.com/engine/security/)
  documentation explains that only trusted users should control the
  daemon, because access to it is equivalent to root on the host, and
  describes the default capability set, seccomp, and AppArmor profiles.
- **CIS.** The [CIS Docker Benchmark](https://www.cisecurity.org/benchmark/docker)
  is a widely used checklist for host configuration, daemon settings,
  images, and runtime flags that auditors and scanners measure against.

**Popular tools and providers:** Trivy, Grype with Syft, Docker Scout,
Snyk Container, Sigstore `cosign`, Notation, distroless images,
Chainguard Images, Docker Hardened Images, gVisor, Kata Containers, and
Falco for runtime threat detection.

## How it works

### The threat model

Four things can go wrong, and each needs different controls:

1. **A vulnerable or malicious image.** Known CVEs in base packages or
   dependencies, or a compromised upstream image.
2. **Leaked secrets.** Credentials in image layers, environment
   variables, logs, or build metadata.
3. **A compromised process escalating.** An attacker who gets code
   execution in the app tries to become root in the container, then to
   reach the host.
4. **Escape through the host interface.** Mounted sockets, host paths,
   privileged mode, or a kernel vulnerability let the attacker leave the
   container entirely.

![Diagram: nine layers of container attack surface each paired with a control; the image's shell, package manager, and CVEs are reduced with slim or distroless bases, scanning, and frequent rebuilds; secrets in layers with BuildKit secret mounts and .dockerignore; running as root with USER node and rootless Docker or user namespaces; default capabilities with --cap-drop ALL; a writable root with --read-only plus tmpfs; setuid escalation with no-new-privileges; dangerous syscalls with the default seccomp and AppArmor profiles; host access through docker.sock or --privileged by never using them; and the shared kernel with patched hosts and gVisor or Kata for untrusted code.](container-attack-surface.svg)

### Run as a non-root user

Root inside a default container is UID 0 on the host kernel. It is
restricted by capabilities, seccomp, and AppArmor or SELinux, but every
kernel or runtime vulnerability is more dangerous when the attacker is
already root. Set a non-root user in the image (`USER node` in the
official Node images, UID 1000) and keep application files owned by
root so the process cannot modify them.

Use a **numeric** UID when an orchestrator must verify it: Kubernetes'
`runAsNonRoot: true` cannot check a user name like `node` and refuses to
start the pod, while `USER 1000` passes the check.

### Drop Linux capabilities

Linux splits root's power into about 40 capabilities. Docker grants a
default set of 14 to every container: `AUDIT_WRITE`, `CHOWN`,
`DAC_OVERRIDE`, `FOWNER`, `FSETID`, `KILL`, `MKNOD`, `NET_BIND_SERVICE`,
`NET_RAW`, `SETFCAP`, `SETGID`, `SETPCAP`, `SETUID`, and `SYS_CHROOT`. A
Node.js API needs none of them when it runs as a non-root user on port
3000. `--cap-drop ALL` removes them all; `--cap-add NET_BIND_SERVICE`
adds back only the one you need (binding ports below 1024). `NET_RAW`, for
example, allows crafting raw packets for spoofing attacks inside the
container network.

### Prevent privilege escalation

A setuid binary (such as `su` or `passwd`) runs with its owner's
privileges, which can turn a non-root foothold into root.
`--security-opt no-new-privileges:true` sets the kernel's
`no_new_privs` flag so no process in the container can gain privileges
through setuid or file capabilities. Kubernetes exposes the same flag as
`allowPrivilegeEscalation: false`.

### Read-only root filesystem

`--read-only` mounts the container's root filesystem read-only. An
attacker cannot drop tools, modify the app, or plant persistence, and
accidental writes to the container layer (which would be lost anyway)
fail loudly. Paths that genuinely need writes get a `tmpfs`
(`--tmpfs /tmp`) or a volume.

### seccomp, AppArmor, and SELinux

Docker applies a default **seccomp** profile that blocks dozens of
system calls rarely needed by applications (for example those that load
kernel modules or change the system clock), plus an **AppArmor**
(`docker-default`) or **SELinux** policy on hosts that support them.
Keep the defaults. `--privileged` disables seccomp and AppArmor, grants
every capability, and exposes host devices: it is effectively running on
the host and should be reserved for system tools you fully trust.

### Rootless Docker and user namespaces

Two options remove "root in the container is root on the host":

- **Rootless mode** runs the Docker daemon and containers as an ordinary
  user. A container escape lands in that user's account, not root. Some
  features are limited (privileged ports, some network and storage
  drivers, cgroup limits on older setups).
- **User-namespace remapping** (`userns-remap` in `daemon.json`) keeps a
  root daemon but maps container UID 0 to an unprivileged range of host
  UIDs.

Podman runs rootless by default. Kubernetes supports user namespaces for
pods through the `hostUsers: false` field on recent versions.

### The Docker socket is root on the host

The Docker API lets its caller start a container with the host's root
filesystem mounted and `--privileged` set. Therefore:

- Membership in the `docker` group is root-equivalent on that host.
- Mounting `/var/run/docker.sock` into a container gives that container
  full control of the host. CI runners, dashboards, and "Docker in
  Docker" setups that do this must be treated as root on the host.
- Exposing the daemon on TCP without TLS client authentication gives the
  host to anyone who can reach the port.

Alternatives: rootless daemons, a per-job VM for CI builds, a socket
proxy that allows only specific read-only API calls, or daemonless
builders (BuildKit in rootless mode, Buildah).

### Secrets never belong in layers

Every layer is a tar archive anyone with pull access can extract with
`docker save`. A file copied in one layer and deleted in the next is only
hidden by a whiteout; the earlier layer still contains it. Build
arguments are recorded too: `docker history` shows the command line of
every `RUN`, including `ARG` values used in it.

![Diagram: on the left, an image built FROM node:24-slim then COPY .npmrc (the token is stored in this layer), RUN npm ci, and RUN rm .npmrc (only a whiteout) still contains the token for anyone who runs docker save and extracts the COPY layer, and ARG NPM_TOKEN leaks because its value is recorded in the image history; on the right, RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci mounts the token only while that step runs, never writes it to a layer, and docker history shows the step without its content; the secret is passed with docker build --secret id=npmrc,src=$HOME/.npmrc.](secret-layer-leak-vs-mount.svg)

Build-time secrets go through BuildKit secret mounts. Runtime secrets
are injected when the container starts, preferably as files (Compose and
Swarm mount them under `/run/secrets/`, Kubernetes as volumes) rather
than environment variables, which appear in `docker inspect`, crash
reports, and child processes. Where secrets come from is covered in
[secrets management](../environment-variables/secrets-management.md).

### Minimal base images

Every package in the image is something to patch and something an
attacker can use. Smaller bases have fewer packages and therefore fewer
CVEs to triage:

| Base | Shell and package manager | Typical CVE count | Debugging |
|------|---------------------------|-------------------|-----------|
| `node:24` (full Debian) | Yes, plus compilers and tools | Highest | Easiest |
| `node:24-slim` | Yes | Lower | Easy |
| `node:24-alpine` | `sh` and `apk` | Low | Easy |
| Distroless (`gcr.io/distroless/nodejs24-debian13`) | None | Lowest of the Debian-based options | Needs ephemeral debug containers |
| Hardened images (Chainguard, Docker Hardened Images) | Usually none in runtime variants | Very low, frequently rebuilt | As distroless |

Distroless images contain the runtime and its libraries but no shell,
so an attacker who gets code execution cannot simply run `sh`, `curl`,
or `apt-get`. Their `:nonroot` variants run as UID 65532 by default.

### Image scanning

Scanners build an inventory of the image (OS packages from the package
database, language packages from lockfiles and `node_modules`) and match
it against vulnerability databases. Run them:

- **in CI**, failing the build for fixable high and critical findings;
- **in the registry or continuously**, because new CVEs are published
  against images that were clean when built;
- **with judgment**: a CVE in a library the app never loads is lower
  priority than one in Node itself. VEX documents and ignore files with
  expiry dates record those decisions.

The usual fix is not a code change but a rebuild on a patched base:
which is why images should be rebuilt on a schedule, not only when the
code changes.

### Pinning base images by digest

`FROM node:24-slim` resolves to whatever the tag points to at build
time, so two builds of the same commit can produce different images.
`FROM node:24-slim@sha256:<digest>` always resolves to the same bytes.
Pinning gives reproducibility and protects against a compromised or
broken upstream tag, but it also freezes security patches, so pair it
with a bot (Renovate or Dependabot) that opens pull requests when the
tag's digest changes.

### Signing images

A digest proves *which* bytes you have, not *who* built them. Signing
adds that proof. Sigstore's `cosign` supports keyless signing: in CI,
the workflow's OIDC identity is exchanged for a short-lived certificate,
the signature is stored in the registry next to the image, and the event
is recorded in a public transparency log. At deploy time, an admission
policy (Kyverno, Sigstore policy-controller, or a cloud provider's
binary authorization) rejects images not signed by your CI identity.
Provenance attestations and SLSA levels extend the same idea to "how was
it built"; see
[pipeline and supply-chain security](../ci-cd/pipeline-and-supply-chain-security.md).

## When to use and when not to use

| Control | Local development | Production | Untrusted code (multi-tenant) |
|---------|-------------------|------------|-------------------------------|
| Non-root user | Yes | Required | Required |
| `--cap-drop ALL` | Optional | Yes | Required |
| `no-new-privileges` | Optional | Yes | Required |
| Read-only root filesystem | Optional | Yes, with tmpfs where needed | Required |
| Default seccomp and AppArmor | Yes | Yes | Plus stricter custom profiles |
| Distroless or hardened base | Slim is fine | Recommended | Required |
| Scanning | Occasionally | Every build plus continuous | Every build plus continuous |
| Signing and admission policy | No | Recommended | Required |
| Rootless or user namespaces | Optional | Recommended where supported | Plus gVisor, Kata, or VMs |

Do not skip the basics because "it is only internal": most container
compromises start with an ordinary application vulnerability, and the
controls above decide what happens next. Conversely, do not use a
container boundary alone for code you do not trust; use a sandboxed
runtime or a VM.

## Practical examples

### A hardened `docker run`

```bash
docker run -d --name taskflow-api \
  --user 1000:1000 \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --memory 512m --cpus 1 --pids-limit 200 \
  -p 127.0.0.1:3000:3000 \
  --env-file ./api.env \
  ghcr.io/example/taskflow-api@sha256:<digest>
```

Each line closes one layer of the attack surface: an unprivileged user, an
immutable root filesystem, a small non-executable scratch area, no
capabilities, no setuid escalation, resource limits that stop fork bombs
and memory exhaustion, a port reachable only through a local reverse
proxy, and an image pinned by digest.

### The same settings in Compose

```yaml
# compose.prod.yaml (excerpt): hardened TaskFlow API service
services:
  api:
    image: ghcr.io/example/taskflow-api@sha256:<digest>
    user: "1000:1000"
    read_only: true
    tmpfs:
      - /tmp:rw,noexec,nosuid,size=64m
    cap_drop: [ALL]
    security_opt:
      - no-new-privileges:true
    pids_limit: 200
    mem_limit: 512m
    cpus: 1.0
    secrets:
      - mongodb_uri
    environment:
      MONGODB_URI_FILE: /run/secrets/mongodb_uri
    restart: unless-stopped

secrets:
  mongodb_uri:
    file: ./secrets/mongodb_uri.txt      # not committed; created on the server
```

The connection string arrives as a file at `/run/secrets/mongodb_uri`
instead of an environment variable; the app reads `MONGODB_URI_FILE` when
it is set.

### A distroless runtime stage

```dockerfile
# syntax=docker/dockerfile:1
# Dockerfile: TaskFlow API on a distroless, non-root runtime
# (keep the Node major version and the Debian release the same in every
# stage: node:24-trixie-slim and distroless nodejs24 are both Debian 13)

FROM node:24-trixie-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

FROM node:24-trixie-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM gcr.io/distroless/nodejs24-debian13:nonroot AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
EXPOSE 3000
# The image's ENTRYPOINT is the node binary, so CMD is only the script
CMD ["dist/server.js"]
```

There is no shell in the final image, so health checks and debugging
must use `node` itself or an ephemeral debug container that shares the
container's namespaces.

### Scanning in CI and locally

```bash
# Trivy: fail on fixable HIGH or CRITICAL findings
trivy image --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 \
  ghcr.io/example/taskflow-api:sha-3f9c2e1

# Docker Scout: summary, then the CVE list
docker scout quickview ghcr.io/example/taskflow-api:sha-3f9c2e1
docker scout cves --only-severity critical,high ghcr.io/example/taskflow-api:sha-3f9c2e1

# Grype: generate the inventory with Syft, then scan it
syft ghcr.io/example/taskflow-api:sha-3f9c2e1 -o spdx-json > sbom.spdx.json
grype sbom:./sbom.spdx.json --fail-on high
```

### Proving a leaked secret is in the image

```bash
# The image history shows build commands, including ARG values used in RUN
docker history --no-trunc taskflow-api:bad

# Every layer can be extracted and searched
mkdir leak && docker save taskflow-api:bad -o leak/image.tar
tar -xf leak/image.tar -C leak
grep -rl "_authToken" leak/ || echo "no token found"
```

If a secret is found in a published image, deleting the tag is not
enough: copies may already exist in caches, mirrors, and other people's
machines. Revoke and rotate the credential first, then rebuild with a
secret mount.

### Keyless signing in GitHub Actions and verification

```yaml
# .github/workflows/image.yml (excerpt, after the build step with id "build")
permissions:
  contents: read
  packages: write
  id-token: write            # lets the job request an OIDC token for Sigstore

steps:
  - uses: sigstore/cosign-installer@756fe2d284c7292c4e9b62c8a28f1e5629c59532 # v4.1.3
  - name: Sign the pushed image by digest
    run: cosign sign --yes ghcr.io/example/taskflow-api@${{ steps.build.outputs.digest }}
```

```bash
# Anyone can verify who signed it
cosign verify ghcr.io/example/taskflow-api@sha256:<digest> \
  --certificate-identity-regexp '^https://github.com/example/taskflow-api/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

Sign the digest, never a tag, so the signature cannot be moved to other
content. The installer action is pinned to a full commit SHA, like every
third-party action in a job that can sign or push: in March 2026 the tags
of Trivy's `setup-trivy` installer action were repointed to code that stole
CI secrets (CVE-2026-33634). The cosign version changes only when you
upgrade the pinned installer.

### Pinning a base image by digest

```bash
# The "Digest:" line near the top is the digest of the multi-platform index
docker buildx imagetools inspect node:24-slim
```

```dockerfile
# Dockerfile (excerpt): readable tag plus the digest that is actually used
FROM node:24-slim@sha256:<digest> AS base
```

Renovate and Dependabot both understand this `tag@digest` form and update
the digest when the tag moves.

## Best practices

- Run as a non-root numeric UID, with application files owned by root.
- Drop all capabilities and add back only those you can justify.
- Set `no-new-privileges` and keep the default seccomp and AppArmor or
  SELinux profiles; never use `--privileged` for applications.
- Run with a read-only root filesystem and explicit tmpfs or volume
  mounts for writable paths.
- Never mount the Docker socket into application containers, and treat
  the `docker` group as root.
- Keep secrets out of `COPY`, `ARG`, and `ENV`; use secret mounts at build
  time and files at runtime.
- Use slim, distroless, or hardened base images, pinned by digest and
  updated automatically.
- Scan in CI and continuously; rebuild images on a schedule.
- Sign images in CI and verify signatures before deploy.
- Set memory, CPU, and PID limits on every container.

## In production

- **A CI runner can control the whole host.**
  *Detect:* `docker inspect` on the runner container shows
  `/var/run/docker.sock` mounted or `"Privileged": true`. *Cause:* the
  runner builds images by talking to the host's daemon. *Fix:* use
  ephemeral VMs per job, rootless BuildKit, or a remote builder, and treat
  existing hosts as fully trusted infrastructure.
- **A registry token is found inside a public image.**
  *Detect:* a secret scanner or a researcher reports the token; `docker
  history --no-trunc` or an extracted layer shows `.npmrc`. *Cause:* the
  file was copied into a layer and deleted later, or passed as an `ARG`.
  *Fix:* revoke and rotate the token immediately, rebuild with secret
  mounts, delete the affected images, and add secret scanning to CI.
- **Every scan reports hundreds of vulnerabilities.**
  *Detect:* scanner output is dominated by OS packages from the base image.
  *Cause:* a full `node` base image with compilers, rarely rebuilt.
  *Fix:* multi-stage build onto slim or distroless, `--ignore-unfixed`
  for gating, and scheduled rebuilds with `--pull`.
- **The app crashes with `EROFS: read-only file system` after hardening.**
  *Detect:* the error names a path such as `/tmp` or a cache directory.
  *Cause:* the application or a library writes to the root filesystem.
  *Fix:* mount a tmpfs or volume at exactly those paths, or configure the
  library to write elsewhere.
- **A service fails to start after `--cap-drop ALL`.**
  *Detect:* `EACCES` when binding port 80 or `Operation not permitted`
  on `chown`. *Cause:* the process needed `NET_BIND_SERVICE` or ran
  ownership changes at startup as root. *Fix:* listen on a high port (for
  nginx, the unprivileged image on 8080) or add back the single
  capability required.
- **Secrets appear in logs and support bundles.**
  *Detect:* `docker inspect` output, crash dumps, or debug endpoints show
  `MONGODB_URI` with credentials. *Cause:* secrets passed as environment
  variables are visible to anyone who can inspect the container and are
  often dumped wholesale. *Fix:* mount secrets as files, redact
  configuration in logs, and restrict who can run `docker inspect`.
- **The same commit builds an image with different contents.**
  *Detect:* digests differ between two builds of one commit, and a new
  CVE or behaviour change appears without a code change. *Cause:* the
  base tag moved upstream. *Fix:* pin the base by digest and let a bot
  propose updates through reviewed pull requests.

## Important terminology

- **Attack surface:** Everything an attacker can interact with or use.
- **Capability:** One of the privileges Linux splits root's power into,
  such as `NET_BIND_SERVICE` or `SYS_ADMIN`.
- **`no-new-privileges`:** A kernel flag that stops processes from
  gaining privileges through setuid binaries or file capabilities.
- **seccomp:** A kernel filter that restricts which system calls a
  process may make.
- **AppArmor / SELinux:** Mandatory access control systems that confine
  what a container's processes may access.
- **Rootless mode:** Running the container engine and containers without
  root privileges on the host.
- **User namespace:** A mapping of container UIDs to different,
  unprivileged host UIDs.
- **Distroless image:** A base image with only the application runtime
  and its libraries.
- **CVE:** A publicly catalogued vulnerability identifier.
- **SBOM:** A software bill of materials: the inventory of packages in an
  image.
- **Image signing:** Attaching a verifiable signature to an image digest
  to prove who built it.

## Common mistakes and misconceptions

- Believing containers are a security boundary as strong as VMs.
- Running as root because "it is inside a container".
- Mounting the Docker socket to let a dashboard or CI job "just work".
- Using `--privileged` to fix a permission error.
- Deleting a secret in a later `RUN` and assuming it is gone.
- Passing secrets with `--build-arg`.
- Scanning only once at build time and never again.
- Pinning digests without automation, so patches never arrive.
- Signing a tag instead of a digest.

## Revision questions

1. Why is a process running as root in a default Docker container more
   dangerous than the same process running as UID 1000?
2. Which Docker flags implement a non-root user, no capabilities, no
   privilege escalation, and an immutable filesystem?
3. Explain how a token copied into a layer and then deleted can still be
   recovered. How does a BuildKit secret mount avoid this?
4. Why is mounting `/var/run/docker.sock` equivalent to giving a container
   root on the host?
5. A scan finds 180 vulnerabilities in a `node:24` based image, 150 of
   them in OS packages. Which two changes would remove most of them, and
   why?
6. What do pinning by digest and signing each prove, and why do you need
   both?
7. When would you choose gVisor, Kata Containers, or a VM over a hardened
   container?

## Further learning

- [Docker documentation: Rootless mode](https://docs.docker.com/engine/security/rootless/)
- [Docker documentation: Seccomp security profiles](https://docs.docker.com/engine/security/seccomp/)
- [Docker documentation: Build secrets](https://docs.docker.com/build/building/secrets/)
- [Distroless container images](https://github.com/GoogleContainerTools/distroless)
- [Trivy documentation](https://trivy.dev/)
- [Sigstore documentation](https://docs.sigstore.dev/)
- Next: [debugging and operating containers](debugging-and-operating-containers.md).
  Back to the [Docker overview](../docker.md).
