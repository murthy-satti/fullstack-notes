# Environment Variables

## Introduction

Environment variables are named values supplied to a running process. Applications use them for deployment settings such as a port, feature mode, or external service.

## Why does it exist?

The same code may run on a laptop, test system, and production server with different settings. Environment variables supply those values without changing source code. They are not a complete secrets-management system.

## How does it work?

An operating system, shell, container, or platform sets variables before starting a process. The application reads and validates them. Values are usually strings, so parse numbers and booleans carefully. Protect secret values and do not print them in logs.

## Real-world example

An application might read `PORT` and `DATABASE_URL`. Development and production can receive different database addresses.

## Developer perspective

Document required names and safe defaults; never commit passwords or tokens. Exclude local `.env` files from version control and provide a placeholder `.env.example`. Use an appropriate secret store for production. See [Docker](docker.md) and [CI/CD](ci-cd.md).

## Practical example

Validate `PORT` on startup and show a useful error if it is missing or invalid. Put placeholders in `.env.example`; keep local values separately.

## Important terminology

- **Configuration:** values that control application behavior.
- **Environment variable:** name/value supplied to a process.
- **Secret:** sensitive value such as a token or password.
- **`.env` file:** local text file commonly used by tooling to set variables.
- **Validation:** checking that a value exists and has an acceptable form.

## Advantages and disadvantages

Environment variables separate settings from code and are widely supported. They can leak through logs or diagnostics and are not encrypted automatically.

## Common misconceptions

Environment variables are not automatically secret or shared across processes. A `.env` file is a convention that requires tool or shell support.

## Revision questions

1. Why use different configuration values in different environments?
2. Why should application code validate environment variables?
3. What protection does an environment variable not provide by itself?

## Further Learning & References

- **Official Node.js documentation:** [`process.env`](https://nodejs.org/api/process.html#processenv) describes how Node.js applications access environment variables.
- **Official Docker documentation:** [Environment variables](https://docs.docker.com/compose/how-tos/environment-variables/) explains environment configuration in Docker Compose.
- **Third-party security guidance:** [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html) discusses safe handling and lifecycle management for secrets.
