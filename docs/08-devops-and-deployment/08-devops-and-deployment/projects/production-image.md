# Production Image

Package TaskFlow API as a small, non-root container image that shuts down
cleanly and reports its health, built and scanned in CI and pushed to a
registry with the commit SHA as its tag. A Docker Compose stack starts the
API, MongoDB, and a database UI in the right order.

## Why this project helps

- Builds the core container skills: multi-stage builds, layer caching,
  users and signals, health checks, tags, and registries.
- Improves **security**: a non-root, minimal image scanned on every build
  has far fewer ways to be exploited.
- Improves **reliability**: graceful `SIGTERM` handling and health checks are
  what let orchestrators restart and roll out without dropping requests.
- Covers interview favorites: image size, why `latest` is dangerous, and
  what PID 1 does with signals.

## What you need

- Docker Engine or Docker Desktop with BuildKit and Docker Compose v2.
- A registry account; GitHub Container Registry (`ghcr.io/example/taskflow-api`)
  is free for public images.
- Trivy (or Grype or Docker Scout) for scanning.
- Builds on [Ship It Pipeline](ship-it-pipeline.md).

## How to do it

1. Write a multi-stage `Dockerfile`: install and build in one stage, copy
   only production files into a slim Node 24 runtime. See
   [writing production Dockerfiles](../docker/writing-production-dockerfiles.md).
2. Run as a non-root user (`USER node`) and keep a `.dockerignore` so
   secrets and `node_modules` never enter the build context.
3. Handle `SIGTERM` in the app (stop accepting connections, finish requests,
   close MongoDB), and run with `--init` or tini so signals reach Node.
4. Add a `HEALTHCHECK` that calls a lightweight health endpoint.
5. In CI, build with `docker/build-push-action@v7` and tag the image
   `sha-<commit>`; see
   [images, registries, and tagging](../docker/images-registries-and-tagging.md).
6. Scan the image before pushing (for example
   `trivy image --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1`);
   see [container security](../docker/container-security.md).
7. Push to the registry only from `main`, and record the image digest.
8. Write `compose.yaml` with the API, MongoDB, and mongo-express, using
   health checks and `depends_on` with `condition: service_healthy`; see
   [Docker Compose for development](../docker/docker-compose-for-development.md).

## Done when

- The runtime image is small, runs as a non-root user, and has no build
  tools.
- `docker stop` finishes in seconds and in-flight requests complete.
- `docker ps` shows the container as `healthy`.
- CI pushes `ghcr.io/example/taskflow-api:sha-<commit>` only after a clean
  scan.
- `docker compose up` starts MongoDB first and the API only when it is
  healthy.

## Stretch goals

- Switch the runtime stage to a distroless image and compare size and CVE
  count.
- Pin the base image by digest and let Dependabot propose updates.
- Sign the image with cosign and verify it before running.

## Lessons to use

- [Docker](../docker.md)
- [Container fundamentals](../docker/container-fundamentals.md)
- [Debugging and operating containers](../docker/debugging-and-operating-containers.md)

Back to [all projects](../projects.md).
