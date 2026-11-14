# Environment Variables and Secrets

Environment variables are named string values that the operating system
passes to a process when it starts. They are the most common way to give
an application its configuration (which port to listen on, which database
to use, how much to log) without changing its code, so that one build can
run in development, staging, and production. Secrets, such as database
passwords and API keys, often travel the same way, but they need much
more care: who can read them, how they are rotated, and what happens when
one leaks.

## What environment variables and secrets management provide

- **One artifact, many environments:** the same container image or
  release runs everywhere; only its configuration differs.
- **Configuration outside the code:** values change without a rebuild,
  and are not committed to the repository.
- **A standard interface:** every language, runtime, process manager,
  container platform, and CI system can set and read them.
- **Controlled secrets:** a secret store adds encryption, access control,
  audit logs, rotation, and short-lived credentials on top.

They also bring well-known problems: values are untyped strings, tools
load `.env` files with different and surprising precedence rules,
frontend build tools bake variables into public JavaScript, and secrets
in environment variables can leak through logs, crash reports, and child
processes.

## How a typical configuration flow works

For TaskFlow API running in production:

1. The deploy system (Kubernetes, systemd, PM2, or a PaaS) starts the
   process with environment variables from its own configuration.
2. Secrets are injected from a secret store at deploy or start time,
   never committed to Git.
3. In local development, a `.env` file supplies the same variable names
   with development values.
4. At startup, one config module reads `process.env`, converts strings to
   numbers, booleans, and lists, validates every value, and exits with a
   clear error if anything is missing or invalid.
5. The rest of the application imports the typed, frozen config object
   and never touches `process.env` directly.

![Diagram: four sources set environment variables for the TaskFlow API process: shell and CI variables, a .env file in development loaded by Node, dotenv, Vite, or Bun, a process manager or orchestrator such as systemd, PM2, or Kubernetes, and a secret store such as Vault or AWS Secrets Manager; all of them end up in process.env, a flat map where every value is a string, such as PORT, APP_ENV, LOG_LEVEL, and MONGODB_URI; a config module parses and validates the map once at startup, and the application code uses only the typed, frozen configuration, so with invalid configuration the app never starts.](environment-variables-overview.svg)

## Practical example

```js
// src/config.js: validate environment variables once, at startup
import { z } from "zod";

const schema = z.object({
  APP_ENV: z.enum(["development", "test", "staging", "production"]),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MONGODB_URI: z.string().startsWith("mongodb"),
  JWT_SECRET: z.string().min(32),
});

const result = schema.safeParse(process.env);
if (!result.success) {
  // Name the problem, never print the values
  for (const issue of result.error.issues) {
    console.error(`config error: ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = Object.freeze(result.data);
```

```bash
# .env (local development only; listed in .gitignore)
APP_ENV=development
PORT=3000
MONGODB_URI=mongodb://localhost:27017/taskflow
JWT_SECRET=<at-least-32-random-characters>
```

```bash
node --env-file=.env src/server.js
```

A missing or malformed variable stops the process immediately with a
message naming the variable, instead of failing on the first request an
hour later.

## Environment variables and secrets topic map

- [Configuration fundamentals](environment-variables/configuration-fundamentals.md)
- [.env files and precedence](environment-variables/env-files-and-precedence.md)
- [Build-time vs runtime configuration](environment-variables/build-time-vs-runtime-configuration.md)
- [Secrets management](environment-variables/secrets-management.md)

**Review**

- [Environment variables and secrets interview questions and answers](environment-variables/interview-questions-and-answers.md) · [cheat sheet](environment-variables/cheat-sheet.md)

## Developer perspective and common misconceptions

Keep configuration boring: one documented list of variables (an
`.env.example` file), one module that validates them, the same names in
every environment, and secrets that come from a secret store rather than
from files people pass around. When something behaves differently between
environments, compare the *effective* configuration each process actually
received.

- `.env` files are a development convenience, not a secrets management
  system.
- Different tools load `.env` files differently; Node, dotenv, Vite,
  Next.js, Bun, and Docker Compose each have their own rules for which
  file wins.
- Anything in a `VITE_*` or `NEXT_PUBLIC_*` variable ends up in public
  JavaScript. It is never a secret.
- Environment variables are strings. `"false"` is truthy in JavaScript.
- Removing a leaked secret from Git history does not un-leak it; rotate
  it first.

## Further learning

- [The Twelve-Factor App: Config](https://12factor.net/config)
- [Node.js: Environment variables and `--env-file`](https://nodejs.org/api/environment_variables.html)
- [OWASP: Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [Process, environment, and configuration in Node.js](../03-backend-development/nodejs/process-env-and-configuration.md)
- [Environment variables and secrets interview questions and answers](environment-variables/interview-questions-and-answers.md)
