# .env Files and Precedence

A `.env` file is a plain text file of `KEY=value` lines that a tool reads
and turns into environment variables, so developers do not have to export
a dozen variables by hand. The format looks universal, but it is not a
standard: Node.js, the `dotenv` package, Vite, Next.js, Bun, and Docker
Compose each parse it slightly differently, load different files, and
decide differently which value wins when the same key is set in several
places.

This lesson covers the `.env` format, how each of those tools loads files
and resolves precedence (only rules stated in their official
documentation, plus behavior tested for this page), the parser
differences that cause silent bugs, and a debugging recipe for "the
variable is in the file but the app does not see it".

## Why it matters

When a value comes from the wrong place, nothing crashes. The app simply
runs with a different database, a different API URL, or a missing key
that a default quietly replaces. Typical surprises:

- A variable exported in your shell overrides the `.env` file, so editing
  the file "does nothing".
- `.env.local` wins in one framework and loses in another.
- A Docker Compose `.env` file is used to fill `${VAR}` in `compose.yaml`
  but is not passed into the container at all.
- A line with only spaces, a byte order mark, or an unclosed quote makes
  one parser drop or merge keys while another reads the same file fine.

Knowing each tool's rules turns an afternoon of confusion into a
two-minute check.

## Real-world usage

- **Node.js.** The [command-line documentation](https://nodejs.org/api/cli.html#--env-filefile)
  for `--env-file` states: "If the same variable is defined in the
  environment and in the file, the value from the environment takes
  precedence", and that with several `--env-file` flags, "subsequent files
  override pre-existing variables defined in previous files". The flag
  was added in v20.6.0 and is no longer experimental as of v24.10.0 and
  v22.21.0.
- **dotenv.** The [dotenv README](https://github.com/motdotla/dotenv)
  says "By default, we will never modify any environment variables that
  have already been set", offers `override: true` to change that, and,
  for several files, "the first value set for a variable will win, unless
  the `options.override` flag is set".
- **Vite.** The [env variables and modes guide](https://vite.dev/guide/env-and-mode)
  lists `.env`, `.env.local`, `.env.[mode]`, and `.env.[mode].local`, says
  mode-specific files take priority over generic ones and that variables
  already in the environment when Vite runs "have the highest priority and
  will not be overwritten by `.env` files", and warns that `VITE_*`
  variables "should not contain sensitive information".
- **Next.js.** The [environment variables guide](https://nextjs.org/docs/app/guides/environment-variables)
  gives the lookup order `process.env`, `.env.$(NODE_ENV).local`,
  `.env.local` (not checked when `NODE_ENV` is `test`),
  `.env.$(NODE_ENV)`, then `.env`.
- **Docker Compose.** The page on
  [environment variable precedence](https://docs.docker.com/compose/how-tos/environment-variables/envvars-precedence/)
  ranks `docker compose run -e` highest, then `environment` or `env_file`
  values interpolated from the shell or an environment file, then plain
  `environment` entries, then `env_file`, then `ENV` in the image.

**Popular tools and providers:** Node.js `--env-file` and
`process.loadEnvFile`, dotenv and dotenv-expand, Vite, Next.js and
`@next/env`, Bun, Docker Compose, direnv, and secret-manager CLIs that
inject variables into a command (`doppler run`, `op run`, `infisical
run`).

## How it works

### The `.env` format

```bash
# .env: one KEY=value per line; this line is a comment
APP_ENV=development
PORT=3000
LOG_LEVEL=debug            # inline comment (unquoted values only)
GREETING="Hello, world"    # quotes are removed from the value
PASSWORD_HINT="has a # sign"
export MONGODB_URI=mongodb://localhost:27017/taskflow   # 'export ' is ignored
TLS_CERT="-----BEGIN CERTIFICATE-----
...multi-line values inside double quotes...
-----END CERTIFICATE-----"
```

Rules that hold across the tools on this page:

- Keys are usually uppercase letters, digits, and underscores.
- Everything after an unquoted `#` is a comment, so a value containing
  `#` must be quoted.
- Quotes around the whole value are removed. Single, double, and backtick
  quotes are accepted by Node and dotenv.
- Multi-line values work inside double quotes in Node (since v20.12.0 /
  v21.7.0), dotenv (since v15), Next.js, and Bun.
- A leading `export ` is ignored (tested with Node, dotenv, and Bun).
- **Variable expansion differs:** Node's loader and the `dotenv` package
  keep `${HOST}` literally (tested); Bun, Vite (through dotenv-expand), and
  Next.js expand references to earlier variables. Escape `$` with `\` in
  the tools that expand.
- There is no type information: every value is a string.

### Node.js: `--env-file`, `process.loadEnvFile`, `util.parseEnv`

| API | What it does | Precedence |
|---|---|---|
| `node --env-file=.env app.js` | Loads the file before your code runs (v20.6.0+). Errors if the file is missing | Existing environment variables win; with several flags, later files override earlier ones |
| `node --env-file-if-exists=.env app.js` | Same, but a missing file is not an error (v22.9.0+) | Same |
| `process.loadEnvFile(path = "./.env")` | Loads a file from inside your code (v20.12.0 / v21.7.0+) | In testing on v22.12, an already-set variable was not overwritten |
| `util.parseEnv(content)` | Parses a string and returns an object; does not touch `process.env` | Not applicable |

With `--env-file`, variables that configure Node itself (such as
`NODE_OPTIONS`) are applied; the documentation notes that `NODE_OPTIONS`
inside a file loaded with `process.loadEnvFile()` has no effect, because
Node is already running.

### The `dotenv` package

```js
import "dotenv/config";                         // load ./.env as a side effect
// or, with options:
import dotenv from "dotenv";
dotenv.config({ path: [".env.local", ".env"] }); // first value set wins
dotenv.config({ path: ".env.test", override: true }); // file beats existing variables
```

- Existing variables are never overwritten unless `override: true`.
- With several files, the **first** file that sets a key wins (unless
  `override`), which is the opposite of Node's "later `--env-file` wins".
- Recent major versions print a short "injected env" line when they load
  a file (version 18 does by default, as tested); pass `quiet: true` to
  silence it.
- `dotenv` does not expand `${VAR}` references; the separate
  `dotenv-expand` package does.

### Vite

Vite loads, for the current mode (`development` for `vite`, `production`
for `vite build`, or `--mode staging`):

| Priority | Source |
|---|---|
| 1 (highest) | Variables already set in the environment when Vite runs, for keys with the `VITE_` prefix |
| 2 | `.env.[mode].local` |
| 3 | `.env.[mode]` |
| 4 | `.env.local` |
| 5 (lowest) | `.env` |

Vite's source merges the files in the order `.env`, `.env.local`,
`.env.[mode]`, `.env.[mode].local`, with later files overwriting earlier
ones, and then copies prefixed keys from the real environment on top.
Only keys with the `VITE_` prefix (configurable with `envPrefix`) are
exposed to client code as `import.meta.env.VITE_*`, and they are inlined
into the JavaScript bundle at build time. `.local` files are meant to be
ignored by Git. Inside `vite.config.js`, `.env` values are not yet in
`process.env`; use Vite's `loadEnv(mode, process.cwd(), "")` to read them
there.

### Next.js

| Priority | Source |
|---|---|
| 1 (highest) | `process.env` |
| 2 | `.env.$(NODE_ENV).local` |
| 3 | `.env.local` (not checked when `NODE_ENV` is `test`) |
| 4 | `.env.$(NODE_ENV)` |
| 5 (lowest) | `.env` |

Compare with Vite: Next.js puts `.env.local` **above** `.env.production`,
Vite puts `.env.production` **above** `.env.local`. A value in
`.env.local` therefore wins in a local Next.js production build but loses
in a local Vite production build. Next.js inlines only `NEXT_PUBLIC_*`
variables into browser code, at build time. Outside the Next.js runtime
(an ORM config, a test runner), `loadEnvConfig` from `@next/env` loads
files the same way.

### Bun

Bun's runtime reads `.env` files automatically, in increasing order of
precedence: `.env`, then `.env.production`, `.env.development`, or
`.env.test` depending on `NODE_ENV`, then `.env.local` (skipped when
`NODE_ENV=test`), then `.env.[NODE_ENV].local`. Variables already set in
the shell are not overwritten (tested with `--env-file`). Other details
from the Bun documentation and CLI:

- `--env-file` replaces the automatic choice of files; it can be given
  several times.
- `--no-env-file`, or `env = false` in `bunfig.toml`, turns automatic
  loading off.
- `Bun.env` and `import.meta.env` are aliases of `process.env`.
- Values are expanded: `URL=mongodb://${HOST}:27017` becomes
  `mongodb://db:27017` when `HOST=db` (tested).
- Standalone executables built with `bun build --compile` also autoload
  `.env` by default in recent versions (`--no-compile-autoload-dotenv`
  disables it, per `bun build --help` in Bun 1.4), so a compiled binary's
  configuration can depend on the directory it is started from.

### Docker Compose

Compose uses `.env` files for **two different things**:

1. **Interpolation of `compose.yaml`.** A `.env` file in the project
   directory (or the file given with `docker compose --env-file`) fills in
   `${VAR}` references in the Compose file itself. Shell variables take
   precedence over it for interpolation. These values do **not** reach the
   container unless the Compose file passes them on.
2. **The container's environment.** Set by `environment:` and
   `env_file:` in the service definition.

```yaml
# compose.yaml
services:
  api:
    image: ghcr.io/example/taskflow-api:${API_TAG:-latest}   # interpolated from shell or .env
    env_file:
      - ./config/api.env                                      # file contents become container env
    environment:
      LOG_LEVEL: debug                                         # beats the same key in env_file
      MONGODB_URI: ${MONGODB_URI}                              # interpolated, then passed in
```

Container environment precedence, highest first: `docker compose run -e`;
`environment` or `env_file` values interpolated from the shell or an
environment file; plain `environment` values; `env_file` values; `ENV`
from the image.

![Diagram: six precedence ladders with the highest priority at the top; Node with --env-file: variables already in the environment, then a later --env-file, then an earlier one; the dotenv package: variables already set unless override is true, then the first file in the path list, then later files; Vite for VITE_ keys: the real process environment, then .env.mode.local, .env.mode, .env.local, and .env; Next.js: process.env, then .env.NODE_ENV.local, .env.local skipped in test, .env.NODE_ENV, and .env; Bun's runtime: variables already set in the shell, then the same order as Next.js; Docker Compose for a container: run -e, interpolated values, environment entries, env_file entries, then ENV in the image; the trap is that Vite ranks .env.mode above .env.local while Next.js ranks .env.local above .env.NODE_ENV.](env-precedence-ladder.svg)

### Kubernetes and process managers do not read `.env` files

In production, variables come from the platform: Kubernetes `env` and
`envFrom` entries referencing ConfigMaps and Secrets, systemd
`Environment=` and `EnvironmentFile=`, PM2 ecosystem files, or a PaaS
dashboard. systemd's `EnvironmentFile` uses its own parsing rules (`#`
starts a comment only at the beginning of a line, `export` is not
accepted, and `${VAR}` is not expanded), so a file that works with dotenv
is not guaranteed to work there.
Keep `.env` files for local development and treat production
configuration as a separate, managed source.

### Parser differences and gotchas

These results come from feeding identical files to Node v22.12.0
(`--env-file` and `util.parseEnv`), `dotenv` 18.0.10, and Bun 1.4.4 while
writing this page. Other versions may behave differently: Node v24.22.3
skips whitespace-only and tab-only lines, but its byte order mark and
unclosed-quote results match v22.12. The point is that parsers disagree,
so test with the loader you actually use.

| File content | Node 22.12 | dotenv 18 | Bun 1.4 |
|---|---|---|---|
| A line containing only spaces between two keys | The next key is merged into a broken name (`"\nB"`), so `B` is missing | Line skipped, `B` set | Line skipped, `B` set |
| A line containing only a tab | Same as above: next key lost | Skipped | Skipped |
| UTF-8 byte order mark at the start | First key's name starts with `\uFEFF`, so it is missing | Handled | Handled |
| `A="hello` with no closing quote, and a later line such as `C="x"` | Lines up to the next `"` are swallowed into `A`; `B` and `C` lost | Only `A` affected | Same as Node |
| File saved as UTF-16 | Nothing is loaded, silently | Nothing is loaded | Nothing is loaded |
| CRLF line endings | Handled | Handled | Handled |
| The same key twice | Last one wins | Last one wins | Last one wins |
| `KEY = value` with spaces around `=` | Handled | Handled | Handled |

![Diagram: before, an env file has APP_ENV=staging on line 1, three spaces on line 2, MONGODB_URI on line 3, and PORT on line 4; dotenv 18 and Bun 1.4 skip line 2 and set all three keys, while Node 22.12 with --env-file joins lines 2 and 3 into one broken key so MONGODB_URI is missing; after, with line 2 truly empty, every loader sets all three keys; startup validation catches the missing key either way; to debug, print each expected key and whether it is set without its value, and inspect the file with cat -A or a hex dump for spaces, tabs, CRLF, a byte order mark, or UTF-16.](env-parser-blank-line.svg)

Practical rules:

- Keep `.env` files boring: no indentation, no whitespace-only lines, no
  trailing spaces, plain ASCII or UTF-8 without a byte order mark, LF line
  endings, and quotes only where needed.
- Add an `.editorconfig` rule (`trim_trailing_whitespace = true`,
  `charset = utf-8`, `end_of_line = lf`) for `.env*` files.
- Validate configuration at startup, so a key that a parser dropped
  becomes an immediate, named error instead of a silent default.

### Debugging recipe: "it is in the file, but the app does not see it"

1. **Ask the process, not the file.** Print, for each expected key,
   whether it is set and what *kind* of value it has, never the value.
2. **Check what is already exported in your shell** (`env | cut -d= -f1 |
   sort`, names only). In most tools the shell wins.
3. **Check which files the tool loads in this mode** (Vite mode, Next.js
   `NODE_ENV`, Bun `NODE_ENV`, Compose project directory).
4. **Inspect the file's bytes:** `cat -A .env` shows tabs (`^I`), line
   endings (`^M$` for CRLF), and trailing spaces; `head -c 4 .env | od -c`
   shows a byte order mark; `file .env` reports UTF-16.
5. **Compare loaders:** run the same check under the loader you use in
   production and the one you use locally.
6. **In containers,** check the container, not the Compose file: `docker
   compose exec api printenv LOG_LEVEL` for non-secret keys.

## When to use and when not to use

| Situation | Use |
|---|---|
| Local development of a Node service | `node --env-file-if-exists=.env` (no dependency) or `dotenv` |
| Several local layers (shared defaults plus personal overrides) | `.env` committed with safe defaults, `.env.local` ignored by Git, loaded in a documented order |
| Frontend builds | The framework's own loader (Vite, Next.js); only public values |
| Docker Compose development stacks | `env_file:` for container variables, a project `.env` only for interpolation |
| Production | The platform's configuration (Kubernetes, systemd, PaaS) and a secret store, not `.env` files |
| CI | CI variables and secrets, not committed `.env` files |

Do not commit `.env` files containing secrets, do not copy `.env` files
between people over chat, and do not rely on implicit autoloading in
production binaries.

## Practical examples

### Loading `.env` in Node without a dependency

```json
{
  "scripts": {
    "dev": "node --watch --env-file-if-exists=.env --env-file-if-exists=.env.local src/server.js",
    "start": "node src/server.js"
  }
}
```

In `package.json`, the `dev` script loads `.env` and then `.env.local`
(later file wins for keys set in both), but anything already exported in
the shell still wins. `start` loads nothing: production variables come
from the platform.

### A key checker that never prints values

```js
// scripts/check-env.js: show which expected keys are set, and their shape
const EXPECTED = ["APP_ENV", "PORT", "LOG_LEVEL", "MONGODB_URI", "JWT_SECRET", "CORS_ORIGINS"];

function shape(value) {
  if (value === undefined) return "MISSING";
  if (value === "") return "empty string";
  if (/^\s|\s$/.test(value)) return "has leading/trailing whitespace";
  if (/^\d+$/.test(value)) return "integer";
  if (/^(true|false|1|0|yes|no)$/i.test(value)) return "boolean-like";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return `URL (${value.split(":")[0]})`;
  return `string, ${value.length} chars`;
}

for (const key of EXPECTED) {
  console.log(`${key.padEnd(14)} ${shape(process.env[key])}`);
}

// Keys that look broken: names containing whitespace or a byte order mark
const odd = Object.keys(process.env).filter((k) => /[\s\uFEFF]/.test(k));
if (odd.length > 0) console.log("suspicious key names:", odd.map((k) => JSON.stringify(k)));
```

```bash
node --env-file=.env scripts/check-env.js        # what Node's loader produced
node -r dotenv/config scripts/check-env.js        # what dotenv produced
bun scripts/check-env.js                          # what Bun's autoloading produced
```

Run against the file from the whitespace example, Node 22.12 prints
`MONGODB_URI MISSING` and a suspicious key name starting with a newline,
while the other two print `URL (mongodb)`. The URL scheme is shown, but
never credentials.

### Vite: reading env values inside `vite.config.js`

```js
// vite.config.js
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // Third argument "" loads all keys, not only VITE_*; use them for the dev server only
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    server: {
      proxy: { "/api": env.DEV_API_PROXY_TARGET ?? "http://localhost:3000" },
    },
  };
});
```

Values read here configure the build and the dev server; only `VITE_*`
keys reach browser code.

### Docker Compose: see what the container actually received

```bash
docker compose config --no-interpolate | less     # the file before interpolation
docker compose exec api printenv APP_ENV LOG_LEVEL   # non-secret values inside the container
docker compose exec api node scripts/check-env.js    # shapes of everything, values hidden
```

`docker compose config` without `--no-interpolate` prints the fully
resolved file, which includes any secrets passed through interpolation;
avoid pasting its output anywhere.

## Best practices

- Use one loader per project and know its precedence rules.
- Commit `.env.example` (names and safe examples), never `.env` with real
  secrets; add `.env*` (except the example) to `.gitignore`.
- Remember that shell variables usually win; unset stale exports.
- Keep `.env` files plain: no whitespace-only lines, no indentation, UTF-8
  without BOM, LF endings.
- Use `.local` files for personal overrides, and learn which way your
  framework ranks them.
- Never put secrets in `VITE_*` or `NEXT_PUBLIC_*` variables.
- Do not use `.env` files in production; configure the platform and a
  secret store.
- Validate configuration at startup and debug with name-and-shape checks,
  never by printing values.

## In production

- **"I changed the `.env` file and nothing happened."**
  *Detect:* the process still shows the old value. *Cause:* the variable
  is also exported in the shell or CI environment, which wins in Node,
  dotenv, Vite, Next.js, and Bun; or the process was not restarted.
  *Fix:* unset the exported variable, restart, and check with a key
  checker.
- **A value works in development and differs in a local production
  build.**
  *Detect:* `vite build` and `next build` pick different values from the
  same files. *Cause:* different ranking of `.env.local` against
  `.env.production`. *Fix:* avoid setting the same key in both, or
  document the order for your framework.
- **The container does not see a variable from `.env`.**
  *Detect:* `docker compose exec api printenv KEY` prints nothing.
  *Cause:* the project `.env` file is only used for interpolation of
  `compose.yaml`. *Fix:* pass it with `environment: KEY: ${KEY}` or put it
  in an `env_file:`.
- **One key silently disappeared after someone edited the file.**
  *Detect:* the key checker shows it missing and a suspicious key name
  with whitespace. *Cause:* a whitespace-only or indented line, a BOM, or
  an unclosed quote, read by a strict parser. *Fix:* clean the file,
  enforce `.editorconfig`, and validate at startup.
- **A compiled binary uses different settings depending on where it is
  started.**
  *Detect:* the same binary behaves differently in two directories.
  *Cause:* the runtime autoloads `.env` from the working directory.
  *Fix:* disable autoloading for production builds and pass configuration
  through the process manager.
- **A secret showed up in a CI log.**
  *Detect:* log search; secret scanning alert. *Cause:* a debug step
  printed `env` or `docker compose config`. *Fix:* rotate the secret,
  remove the step, and use name-only checks.

## Important terminology

- **`.env` file:** a text file of `KEY=value` lines loaded into
  environment variables by a tool.
- **Precedence:** the rule deciding which source wins when a key is set
  more than once.
- **Override:** letting a file replace a variable that is already set.
- **Mode (Vite):** the named configuration (`development`, `production`,
  or custom) that selects which env files load.
- **Interpolation (Compose):** replacing `${VAR}` in `compose.yaml` with
  values from the shell or an env file.
- **Expansion:** replacing `${VAR}` references inside env file values.
- **Byte order mark (BOM):** invisible bytes at the start of some text
  files that can corrupt the first key.
- **Autoloading:** a runtime loading `.env` files without being asked.

## Common mistakes and misconceptions

- Believing the `.env` file always wins over shell variables.
- Assuming every tool loads the same files in the same order.
- Expecting Compose's project `.env` to appear inside containers.
- Expecting `${VAR}` references to expand in Node's loader or in dotenv.
- Committing `.env` "just for the team" with real credentials.
- Debugging by printing `process.env` to logs.
- Saving env files from editors that add a BOM or UTF-16 encoding.
- Using `.env` files on production servers instead of platform
  configuration.

## Revision questions

1. In Node with `--env-file=.env`, `PORT=4000` is in the file and
   `PORT=5000` is exported in the shell. Which value does the app see?
2. With `node --env-file=a.env --env-file=b.env`, which file wins for a
   key set in both? With `dotenv.config({ path: ["a.env", "b.env"] })`?
3. List Vite's env files from highest to lowest priority and say where
   real environment variables fit.
4. Why can the same `.env.local` value win in a Next.js build and lose in
   a Vite build?
5. What are the two different uses of `.env` files in Docker Compose?
6. A colleague's `MONGODB_URI` disappears with Node's loader but works
   with dotenv. Name three file problems that could cause this.
7. How would you debug a missing variable without ever printing a secret?
8. Why should production not rely on `.env` files?

## Further learning

- [Node.js: `--env-file`](https://nodejs.org/api/cli.html#--env-filefile)
- [Node.js: `process.loadEnvFile`](https://nodejs.org/api/process.html#processloadenvfilepath)
- [dotenv README](https://github.com/motdotla/dotenv)
- [Vite: Env variables and modes](https://vite.dev/guide/env-and-mode)
- [Next.js: Environment variables](https://nextjs.org/docs/app/guides/environment-variables)
- [Bun: Environment variables](https://bun.com/docs/runtime/environment-variables)
- [Docker Compose: Environment variable precedence](https://docs.docker.com/compose/how-tos/environment-variables/envvars-precedence/)
- Next: [build-time vs runtime configuration](build-time-vs-runtime-configuration.md). Back to the
  [environment variables overview](../environment-variables.md).
