# Docker

## Introduction

Docker builds and runs containers. A container packages an application with user-space dependencies for a more consistent environment across development and deployment.

## Why does it exist?

Applications can behave differently across libraries and runtime versions. A container image records much of the runtime environment, but does not erase differences in hardware, networking, or external services.

## How does it work?

A Dockerfile describes how to build an image. The Docker engine runs containers from images. Containers are isolated processes; data that must outlive one belongs in a volume or external service. Images are often published to a registry.

## Real-world example

A team builds an API image with declared dependencies and a start command. Teammates and CI run the same setup, connected to a development database.

## Developer perspective

Avoid embedding credentials and use a non-root user when practical. Understand copied files, exposed ports, and where state is stored. See [CI/CD](ci-cd.md), [environment variables](environment-variables.md), and [backups](backups.md).

## Practical example

Build an image for a small app, start a container, and map a local port. Store persistent test data in a volume instead of assuming it survives container removal.

## Important terminology

- **Image:** packaged, read-only template used to create containers.
- **Container:** running instance of an image.
- **Dockerfile:** instructions for building an image.
- **Registry:** service for storing and distributing images.
- **Volume:** managed persistent storage attached to containers.

## Advantages and disadvantages

Containers improve consistency and repeatability. They add networking and storage concepts and are not automatically secure. Handle persistent data and secrets deliberately.

## Common misconceptions

A container is not a full virtual machine; it may share the host kernel. Configuration and external services can still differ in production.

## Revision questions

1. How does an image differ from a container?
2. Where should data go if it must survive container removal?
3. Why should credentials not be built into an image?

## Further Learning & References

- **Official Docker documentation:** [Docker overview](https://docs.docker.com/get-started/overview/) introduces images, containers, and the engine.
- **Official Docker documentation:** [Dockerfile reference](https://docs.docker.com/reference/dockerfile/) explains Dockerfile instructions and syntax.
