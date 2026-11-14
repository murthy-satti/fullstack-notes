# Docker Cheat Sheet

Quick revision after the Docker lessons, before an interview or a task.

## Key commands

| Command | What it does |
|---|---|
| `docker build -t taskflow-api:dev .` | Builds an image from the Dockerfile here |
| `docker build --target build .` | Stops at one stage of a multi-stage build |
| `docker build --secret id=npmrc,src=$HOME/.npmrc .` | Passes a secret that never lands in a layer |
| `docker build --check .` | Lints the Dockerfile with BuildKit's checks |
| `docker buildx build --platform linux/amd64,linux/arm64 --push -t <image> .` | Builds and pushes one multi-platform image |
| `docker run -d --name api -p 3000:3000 taskflow-api:dev` | Starts a container and publishes a port |
| `docker run --rm -it --entrypoint sh <image>` | Opens a shell in an image whose app crashes |
| `docker exec -it api sh` | Runs a shell in a running container |
| `docker logs --tail 100 api` | Shows the last lines of stdout and stderr |
| `docker inspect --format '{{.State.ExitCode}} {{.State.OOMKilled}}' api` | Reads the exit code and whether memory ran out |
| `docker events` | Shows who stopped, killed, or restarted what |
| `docker history --no-trunc <image>` | Lists layers and the commands behind them |
| `docker system df -v` | Shows disk used by images, volumes, and cache |
| `docker compose watch` | Syncs or rebuilds services as files change |
| `docker compose config` | Prints the merged, interpolated Compose file |

## Key configuration

```dockerfile
# syntax=docker/dockerfile:1
# Dockerfile (shape): dependencies, build, and a small non-root runtime
FROM node:24-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

FROM base AS build
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
CMD ["node", "dist/server.js"]
```

```yaml
# compose.yaml (excerpt): start the API after a healthy database
services:
  api:
    build: { context: ., target: build }
    command: npm run dev
    depends_on:
      mongo:
        condition: service_healthy
    develop:
      watch:
        - { action: sync, path: ./src, target: /app/src }
        - { action: rebuild, path: package-lock.json }
  mongo:
    image: mongo:8.0
    volumes: ["mongo-data:/data/db"]
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping').ok"]
volumes:
  mongo-data:
```

## Decision guide

| If you need | Choose | Why |
|---|---|---|
| A small runtime image | Multi-stage on `node:24-slim`, or distroless `:nonroot` | Compilers stay in the build stage |
| Fast rebuilds | Lockfile and `npm ci` before the source; cache mounts | Unchanged layers come from cache |
| A secret during the build | `--mount=type=secret` with `docker build --secret` | `ARG` and `ENV` values stay in the image |
| A clean shutdown | Exec-form `CMD`, a SIGTERM handler, `--init` or tini | A shell as PID 1 may not forward SIGTERM |
| Data that survives the container | A named volume | Bind mounts are for source code |
| Containers that talk by name | A user-defined network | The default bridge has no name DNS |
| Start order in Compose | `condition: service_healthy` | `service_started` waits only for the process |
| A port only for local tools | `-p 127.0.0.1:27017:27017` | Published ports bypass ufw |
| What a deploy runs | The digest, `@sha256:...` | Tags can move; digests cannot |

## Numbers and defaults to remember

| Item | Value |
|---|---|
| `docker stop` | SIGTERM, then SIGKILL after 10 s; Kubernetes waits 30 s |
| `HEALTHCHECK` | Interval 30s, timeout 30s, start period 0s, retries 3 |
| Exit codes | 125 run failed, 126 not executable, 127 not found, 137 SIGKILL or OOM, 139 SIGSEGV, 143 SIGTERM |
| Restart backoff | Doubles from 100 ms; resets after 10 s of running |
| Logs | `json-file` (default) never rotates; `local` keeps 5 x 20 MB |
| Limits | `--memory 512m` = 536870912 bytes; `--cpus 1.5` = `cpu.max 150000 100000` |
| Node heap | `--max-old-space-size` at about 75% of the memory limit |
| Users | `node` is UID 1000; distroless `nonroot` is 65532 |
| Capabilities | 14 by default; `--cap-drop ALL`, then add back only what is needed |
| Embedded DNS | 127.0.0.11 on user-defined networks |
| `docker volume prune` | Anonymous volumes only (Engine 23+); `--all` for named |
| Tags | Up to 128 characters; `latest` when omitted |
| Image size | About 1.3 GB single-stage, about 250 MB multi-stage |

## Top mistakes

- **A shell as PID 1.** Use exec-form `CMD` so SIGTERM reaches Node.
- **Secrets in `ARG`, `ENV`, or a copied `.npmrc`.** Use build secrets.
- **`COPY . .` before `npm ci`.** Copy the lockfile first; add
  `.dockerignore`.
- **Running as root.** Set `USER node` and drop capabilities.
- **Deploying `:latest`.** Deploy a digest or an immutable version tag.
- **Publishing a database on all interfaces.** Bind it to `127.0.0.1`.
- **`down -v` or `volume prune --all` by habit.** Both delete named
  volumes and the data in them.
- **`depends_on` without a condition.** Add a health check and
  `service_healthy`.

## Where to go deeper

- [Container fundamentals](container-fundamentals.md)
- [Writing production Dockerfiles](writing-production-dockerfiles.md)
- [Images, registries, and tagging](images-registries-and-tagging.md)
- [Docker Compose for development](docker-compose-for-development.md)
- [Container networking and storage](container-networking-and-storage.md)
- [Container security](container-security.md)
- [Debugging and operating containers](debugging-and-operating-containers.md)
- [Docker interview questions and answers](interview-questions-and-answers.md)

Back to the [Docker overview](../docker.md).
