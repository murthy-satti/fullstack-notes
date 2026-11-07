# Project: Node Internals Lab

In this project you build four small command-line tools, each designed to
make one part of the Node.js runtime visible: a log analyzer that processes
a file larger than your memory budget with streams, an event-loop lag
monitor that shows exactly what blocking code does to other requests, a
file hasher that compares the main thread with worker threads, and an HTTP
server that shuts down gracefully on `SIGTERM`. Reading about the event
loop and streams is useful; measuring them on your own machine is what
makes the ideas stick.

## What you'll learn

- Read and write large files with constant memory using streams and
  `pipeline()` ([buffers and streams](buffers-and-streams.md),
  [file system, path, and OS](file-system-path-and-os.md)).
- Respect **backpressure** by checking `write()` and waiting for `drain`
  ([buffers and streams](buffers-and-streams.md)).
- Measure event-loop delay with `monitorEventLoopDelay` and see blocking
  code delay unrelated requests ([the event loop](event-loop.md)).
- Break long CPU work into slices with `setImmediate`
  ([asynchronous programming](asynchronous-patterns.md)).
- Run CPU-bound work in parallel with a small worker pool, and learn when
  that does **not** help ([worker threads, child processes, and cluster](worker-threads-child-processes-and-cluster.md)).
- Handle `SIGTERM` and `SIGINT`, fail readiness, drain, and exit cleanly
  ([process, environment variables, and configuration](process-env-and-configuration.md),
  [the http module](http-module.md)).
- Measure memory and time instead of guessing
  ([errors, debugging, and performance](errors-debugging-and-performance.md)).

## Prerequisites

- **Node.js, Active LTS (22 or newer).** The tools use `fetch`,
  `node:timers/promises`, `os.availableParallelism()`, and ES modules. Check
  with `node --version`; see
  [installing Node.js and managing versions](installation-and-versions.md).
- **About 2 GB of free disk space** for the generated log file.
- **A terminal with `curl`.** In Windows PowerShell, type `curl.exe`, because
  plain `curl` is an alias for `Invoke-WebRequest`.
- **For the `SIGTERM` milestone:** Linux, macOS, WSL, or Docker. Windows
  cannot deliver `SIGTERM` to another process; `Ctrl+C` (which sends
  `SIGINT`) works everywhere.
- **Read first:** [runtime and architecture](runtime-and-architecture.md),
  [the event loop](event-loop.md), and
  [modules: CommonJS and ES modules](modules-commonjs-and-esm.md).

## Architecture

The lab is four independent tools. Each one exercises a different part of
the runtime:

![Overview: generate-log.js writes a large app.log with backpressure; log-analyzer.js reads it line by line into counters; extract-errors.js pipes it through a Transform and gzip into errors.log.gz; lag-monitor.js serves /fast, /block, and /chunked while monitorEventLoopDelay reports the delay; hash-files.js sends files to a pool of worker threads; graceful-server.js turns SIGTERM into failing readiness, draining, closing, and exit code 0.](node-lab-architecture.svg)

The key mechanism of the stream tools is backpressure: data flows forward
in chunks, and a slow consumer makes the producer pause instead of filling
memory.

![Diagram: createReadStream reads 64 KB chunks, the serverErrorsOnly Transform keeps a leftover partial line and passes only 5xx lines, createGzip compresses, and createWriteStream writes errors.log.gz; when a downstream buffer is full, write() returns false and the stream upstream pauses until "drain", so memory stays about 64 MB even for a 588 MB file.](node-lab-stream-pipeline.svg)

The graceful-shutdown server follows a fixed sequence when the platform
asks it to stop:

![Timeline: at 600 ms SIGTERM arrives and /readyz starts returning 503 while the server keeps serving during a 2-second drain delay; at about 2.6 s server.close() stops new connections; the in-flight /slow request finishes with 200 at about 3.4 s; the process exits with code 0, after which new requests get ECONNREFUSED; a timer forces exit 1 if requests are still running 10 s after the drain.](node-lab-graceful-shutdown.svg)

## Starting structure

```text
node-internals-lab/
├── package.json            "type": "module" and npm scripts
├── scripts/
│   ├── generate-log.js     writes a large access log (milestone 2)
│   └── generate-blobs.js   writes random binary files (milestone 7)
├── tools/
│   ├── log-analyzer.js     stream + readline analyzer (milestone 3)
│   ├── extract-errors.js   Transform + gzip pipeline (milestone 4)
│   ├── lag-monitor.js      HTTP server + loop-delay monitor (milestones 5–6)
│   ├── hash-file.js        hashes one file
│   ├── hash-worker.js      worker thread entry point
│   ├── hash-files.js       main thread vs worker pool (milestone 7)
│   └── graceful-server.js  SIGTERM handling (milestone 8)
└── data/                   generated files (add to .gitignore)
```

## Milestones

### Milestone 1: Set up the lab

**Goal:** an ES-module project with one npm script per tool.

**Read first:** [modules: CommonJS and ES modules](modules-commonjs-and-esm.md),
[npm and package management](npm-and-package-management.md).

**Steps**

1. Create the folder and run `npm init -y`.
2. Add `"type": "module"` so `.js` files use `import`.
3. Add scripts for each tool and a `.gitignore` containing `data/` and
   `node_modules/`.

```json
{
  "name": "node-internals-lab",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "gen:log": "node scripts/generate-log.js data/app.log 30000000",
    "analyze": "node tools/log-analyzer.js data/app.log",
    "errors": "node tools/extract-errors.js data/app.log data/errors.log.gz",
    "lag": "node tools/lag-monitor.js",
    "gen:blobs": "node scripts/generate-blobs.js data/blobs 8 64",
    "hash": "node tools/hash-files.js data/blobs",
    "hash:workers": "node tools/hash-files.js data/blobs --workers",
    "server": "node tools/graceful-server.js"
  }
}
```

The project needs no dependencies: everything comes from Node.js core
modules.

**Done when:**

- `node --version` prints `v22.` or later.
- `npm run` lists the eight scripts.

### Milestone 2: Generate a multi-gigabyte log with backpressure

**Goal:** write tens of millions of lines without the writer's memory
growing.

**Read first:** [buffers and streams](buffers-and-streams.md),
[file system, path, and OS](file-system-path-and-os.md).

**Steps**

1. Open a write stream with `createWriteStream(file)`.
2. Build one line per iteration in the format
   `2026-11-07T10:00:00.000Z GET /api/cart 200 123ms`.
3. Call `out.write(line)`. When it returns `false`, the stream's internal
   buffer is full: `await once(out, "drain")` before writing more.
4. Call `out.end()` and wait for `"finish"`.

```js
// scripts/generate-log.js (core loop)
import { createWriteStream } from "node:fs";
import { once } from "node:events";

const out = createWriteStream(file);
for (let i = 0; i < total; i++) {
  const line = `${time} ${pick(methods)} ${pick(paths)} ${pick(statuses)} ${ms}ms\n`;
  // write() returns false when the buffer is full: wait for "drain"
  if (!out.write(line)) await once(out, "drain");
}
out.end();
await once(out, "finish");
```

Use a status list that includes `500` and `503` so later milestones have
errors to find. Without the `drain` check the loop still works, but every
line waits in memory until the disk catches up, and memory grows with the
file size.

**Done when:**

- `node scripts/generate-log.js data/app.log 2000000` prints
  `wrote 2,000,000 lines to data/app.log` and the file is about 98 MB
  (about 49 bytes per line).
- `npm run gen:log` (30 million lines) produces a file of about 1.5 GB.
  Expect it to take a few minutes; 12 million lines took 66 seconds on the
  test machine.

### Milestone 3: Analyze the log with constant memory

**Goal:** count lines by status and path for a file larger than you would
ever load into memory.

**Read first:** [buffers and streams](buffers-and-streams.md),
[asynchronous programming](asynchronous-patterns.md) (the `for await`
section).

**Steps**

1. First, see why the obvious approach fails. Try reading the whole file:

    ```js
    import { readFile } from "node:fs/promises";
    const text = await readFile("data/app.log", "utf8"); // whole file as one string
    ```

    On a file larger than about 512 MB this throws
    `RangeError: Invalid string length`: V8 caps strings at
    `buffer.constants.MAX_STRING_LENGTH` characters (536,870,888 in
    Node.js 22). Smaller files load, but memory grows with the file.

2. Read the file as a stream and split it into lines with
   `node:readline`, which also handles lines split across chunks.
3. Update two `Map` counters per line.
4. Sample `process.memoryUsage().rss` every 100 ms to record peak memory.

```js
// tools/log-analyzer.js (core loop)
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
for await (const line of rl) {
  if (line === "") continue;
  const [, , path, status] = line.split(" ");
  byStatus.set(status, (byStatus.get(status) ?? 0) + 1);
  byPath.set(path, (byPath.get(path) ?? 0) + 1);
}
// TODO: print the line count, time, peak RSS, 5xx total, and top 3 paths
```

**Done when:** `npm run analyze` prints a report like this (counts are
random; the shape and the flat memory are what matter):

```text
lines:          12,000,000
time:           10.8 s
peak memory:    64 MB (RSS)
5xx responses:  2,001,694
```

Peak memory stays roughly the same (around 60–100 MB) whether the file is
100 MB or 1.5 GB. On the test machine a 98 MB file peaked at 67 MB and a
588 MB file at 64 MB.

### Milestone 4: A Transform and gzip pipeline

**Goal:** copy only server errors (5xx) into a compressed file, using a
custom `Transform` stream inside `pipeline()`.

**Read first:** [buffers and streams](buffers-and-streams.md) (Transform
streams, `pipeline`, backpressure).

**Steps**

1. Open the input with `{ encoding: "utf8" }` so chunks are strings that
   never split a multi-byte character.
2. Write a `Transform` that splits each chunk on `"\n"`, keeps the last,
   possibly incomplete piece in `leftover` for the next chunk, and pushes
   only lines whose status starts with `5`.
3. Handle `leftover` once more in `flush()`, which runs after the last
   chunk.
4. Connect `read → transform → createGzip() → write` with `pipeline()` from
   `node:stream/promises`. It handles backpressure across all four streams
   and destroys all of them if one fails.

```js
// tools/extract-errors.js (the tricky part)
function serverErrorsOnly() {
  let leftover = ""; // a chunk can end in the middle of a line
  return new Transform({
    transform(chunk, encoding, callback) {
      const lines = (leftover + chunk).split("\n");
      leftover = lines.pop();
      const errors = lines.filter((line) => line.split(" ")[3]?.startsWith("5"));
      if (errors.length > 0) this.push(errors.join("\n") + "\n");
      callback();
    },
    flush(callback) {
      if (leftover.split(" ")[3]?.startsWith("5")) this.push(leftover + "\n");
      callback();
    },
  });
}

await pipeline(
  createReadStream(input, { encoding: "utf8" }),
  serverErrorsOnly(),
  createGzip(),
  createWriteStream(output),
);
```

**Done when:**

- `npm run errors` prints `kept N lines` and `wrote data/errors.log.gz`,
  where `N` equals the `5xx responses` count from milestone 3.
- This check prints the same count and `true`:

    ```bash
    node -e "const z=require('zlib'),fs=require('fs');const l=z.gunzipSync(fs.readFileSync('data/errors.log.gz')).toString().split('\n').filter(Boolean);console.log(l.length,l.every(x=>x.split(' ')[3].startsWith('5')))"
    ```

    For a 2,000,000-line file the test run kept 333,226 lines in a 2.3 MB
    gzip file.

### Milestone 5: Watch blocking code freeze the event loop

**Goal:** see, in numbers, that one synchronous request delays every other
request.

**Read first:** [the event loop](event-loop.md),
[building HTTP servers with the http module](http-module.md).

**Steps**

1. Create a `node:http` server with three routes: `/fast` answers
   immediately, `/block?ms=800` runs a busy loop for 800 ms, and
   `/chunked?ms=800` comes in milestone 6.
2. Enable a loop-delay histogram and print it every second, then reset it.

```js
// tools/lag-monitor.js (monitor and blocking route)
import { monitorEventLoopDelay } from "node:perf_hooks";

const histogram = monitorEventLoopDelay({ resolution: 10 });
histogram.enable();
setInterval(() => {
  const ms = (ns) => (ns / 1e6).toFixed(1); // the histogram reports nanoseconds
  console.log(`loop delay p50=${ms(histogram.percentile(50))}ms ` +
    `p99=${ms(histogram.percentile(99))}ms max=${ms(histogram.max)}ms`);
  histogram.reset();
}, 1000);

function blockFor(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {} // nothing else can run until this returns
}
```

3. Start it with `npm run lag`. In a second terminal start a slow request,
   and in a third time a fast one while the slow one runs:

```bash
curl "http://localhost:3000/block?ms=800"
curl -s -o /dev/null -w "%{time_total}s\n" http://localhost:3000/fast
```

**Done when:**

- The `/fast` request sent during `/block` takes about as long as the
  block (747 ms in the test run, instead of a few milliseconds).
- The monitor prints a line such as
  `loop delay p50=15.7ms p99=813.7ms max=813.7ms` for that second.

At idle the numbers sit near the 10 ms sampling resolution (a little
higher on Windows, whose timers tick about every 15.6 ms). The jump in
`p99` and `max` is the signal.

### Milestone 6: Keep the loop responsive by slicing work

**Goal:** do the same 800 ms of CPU work without freezing other requests.

**Read first:** [the event loop](event-loop.md) (splitting long work into
chunks), [asynchronous programming](asynchronous-patterns.md).

**Steps**

1. Add `/chunked?ms=800`, which does the work in 10 ms slices.
2. After each slice, `await` `setImmediate()` from `node:timers/promises`
   so timers, I/O, and other requests can run.

```js
import { setImmediate as yieldToLoop } from "node:timers/promises";

async function workInSlices(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    blockFor(Math.min(10, end - Date.now()));
    await yieldToLoop(); // let other callbacks run between slices
  }
}
```

**Done when:**

- A `/fast` request sent during `/chunked?ms=800` returns in a few
  milliseconds (8 ms in the test run), while `/chunked` itself still takes
  about 800 ms.
- The monitor's `max` stays near 20 ms during `/chunked`.

Slicing keeps the server responsive but does not make the work faster or
use more cores. For that, use worker threads (next milestone).

### Milestone 7: Hash files with a worker pool

**Goal:** compare hashing on the main thread with a pool of worker
threads, and find out when workers help.

**Read first:** [worker threads, child processes, and cluster](worker-threads-child-processes-and-cluster.md).

**Steps**

1. Generate test data: `npm run gen:blobs` writes 8 files of 64 MB of
   random bytes.
2. Write `hashFile(file, algorithm)`: stream the file and call
   `hash.update(chunk)` for each chunk, then `hash.digest("hex")`.
3. Main-thread mode: hash the files one after another.
4. Worker mode: start `min(files, os.availableParallelism())` workers and
   send each one the next file path when it finishes the previous one.
5. Print the first 16 hex characters of each digest and the total time.

```js
// tools/hash-worker.js
import { parentPort, workerData } from "node:worker_threads";
import { hashFile } from "./hash-file.js";

parentPort.on("message", async (file) => {
  try {
    parentPort.postMessage({ file, digest: await hashFile(file, workerData.algorithm) });
  } catch (error) {
    parentPort.postMessage({ file, error: error.message });
  }
});
```

```js
// tools/hash-files.js (pool skeleton)
const worker = new Worker(new URL("./hash-worker.js", import.meta.url), {
  workerData: { algorithm },
});
const giveNextFile = () => {
  const file = queue.shift();
  if (file) return worker.postMessage(file);
  worker.terminate();
  // TODO: resolve the promise when the last worker has finished
};
worker.on("message", (result) => { results.push(result); giveNextFile(); });
worker.on("error", reject);
giveNextFile();
```

**Done when:**

- Both modes print **identical digests**.
- You can explain these timings from the test machine (8 cores):

```text
8 files, sha256,   main thread: 0.72 s
8 files, sha256,   8 workers:   0.67 s
8 files, sha3-512, main thread: 5.48 s
8 files, sha3-512, 8 workers:   1.36 s
```

SHA-256 is hardware-accelerated on most CPUs, so the job is limited by
reading the files and workers barely help. SHA3-512 is much more CPU
intensive, so spreading it across cores is about four times faster.
Measure before adding workers.

### Milestone 8: Shut down gracefully on SIGTERM

**Goal:** when the platform stops the process (a deploy, `docker stop`,
Kubernetes), finish in-flight requests instead of dropping them.

**Read first:** [process, environment variables, and configuration](process-env-and-configuration.md)
(signals and graceful shutdown), [building HTTP servers with the http module](http-module.md).

**Steps**

1. Count in-flight requests: increment on each request, decrement on the
   response's `"close"` event.
2. Add `/readyz` (200 normally, 503 while shutting down) and a `/slow`
   route that takes 3 seconds.
3. On `SIGTERM` or `SIGINT`: fail readiness, keep serving for a short
   drain delay so the load balancer notices, then call `server.close()`,
   which stops new connections and waits for in-flight requests.
4. Exit with code 0 when `close()` calls back. Start an unref'd timer that
   forces `process.exit(1)` if something hangs.

```js
// tools/graceful-server.js (shutdown sequence)
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true; // /readyz now answers 503
  setTimeout(() => {
    server.closeAllConnections();
    process.exit(1); // safety net: never hang a deploy
  }, DRAIN_DELAY_MS + 10_000).unref();

  await sleep(DRAIN_DELAY_MS); // keep serving while the load balancer drains us
  // close() waits for in-flight requests; since Node.js 19 it also closes idle keep-alive sockets
  server.close((error) => process.exit(error ? 1 : 0));
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
```

**Done when** (Linux, macOS, or WSL):

1. Start the server: `npm run server` prints its process ID.
2. In a second terminal start a slow request:
   `curl http://localhost:3000/slow`.
3. Within a second, send `kill -TERM <pid>`.
4. `curl http://localhost:3000/readyz` during the drain delay prints
   `shutting down` with status 503.
5. The slow request still completes with `slow request finished`, and the
   server logs:

```text
SIGTERM: readiness now fails, 1 request(s) in flight
closing server, 1 request(s) still running
all requests finished, exiting
```

6. `echo $?` in the server's terminal prints `0`, and new requests fail
   with "connection refused".

On Windows, press `Ctrl+C` in the server's terminal instead of `kill`; the
same handler runs for `SIGINT`.

## Stretch goals

- Process the log in parallel: split the file into byte ranges, give each
  range to a worker, and handle lines that cross range boundaries.
- Expose the loop-delay histogram as a `/metrics` endpoint and graph it.
- Profile `/block` with `node --cpu-prof tools/lag-monitor.js` and open the
  `.cpuprofile` file in Chrome DevTools.
- Replace the hand-written pool with a library such as Piscina and compare
  the code.
- Cancel the analyzer cleanly on `Ctrl+C` with an `AbortController` passed
  to `createReadStream`.
- Run the graceful server in a container and stop it with `docker stop`,
  which sends `SIGTERM` and then `SIGKILL` after a grace period; see
  [Docker](../../07-devops-and-deployment/docker.md).

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `SyntaxError: Cannot use import statement outside a module` | `package.json` has no `"type": "module"` | Add it, or rename the files to `.mjs` |
| The generator's memory keeps growing | `write()`'s return value is ignored, so lines pile up in the buffer | `if (!out.write(line)) await once(out, "drain")` |
| `RangeError: Invalid string length` | The whole file was read into one string | Stream it with `createReadStream` and `readline` |
| Counts are slightly off or the last line is missing | Lines split across chunks were dropped or counted twice | Keep a `leftover` in the Transform and handle it in `flush()`, or use `readline` |
| `Error: listen EADDRINUSE: address already in use :::3000` | Another server (often an earlier run) holds the port | Stop it, or run with `PORT=3001` |
| Workers are not faster | The work is limited by I/O, not CPU (SHA-256 with hardware support) | Measure first; workers help only CPU-bound work, such as `--algorithm=sha3-512` |
| `Cannot find module .../hash-worker.js` | The worker path was resolved from the current directory | Use `new URL("./hash-worker.js", import.meta.url)` |
| `kill -TERM` or `Stop-Process` ends the server without the shutdown logs | Windows terminates the process instead of delivering `SIGTERM` | Use `Ctrl+C` (SIGINT) on Windows, or test in WSL or Docker |

## Further learning

- [Node.js API: Stream](https://nodejs.org/api/stream.html)
- [Node.js: Backpressuring in streams](https://nodejs.org/en/learn/modules/backpressuring-in-streams)
- [Node.js API: Readline](https://nodejs.org/api/readline.html)
- [Node.js API: perf_hooks.monitorEventLoopDelay](https://nodejs.org/api/perf_hooks.html#perf_hooksmonitoreventloopdelayoptions)
- [Node.js: Don't block the event loop (or the worker pool)](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop)
- [Node.js API: Worker threads](https://nodejs.org/api/worker_threads.html)
- [Node.js API: server.close()](https://nodejs.org/api/http.html#serverclosecallback)
- [Node.js API: Signal events](https://nodejs.org/api/process.html#signal-events)
- Back to the [Node.js overview](../nodejs.md).
