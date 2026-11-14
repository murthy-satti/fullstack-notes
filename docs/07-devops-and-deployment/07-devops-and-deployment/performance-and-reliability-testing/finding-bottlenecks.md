# Finding Bottlenecks

A load test tells you that something broke: p95 jumped at 230 requests per
second, or errors appeared at twice the peak. This lesson is about finding
out why. It covers a repeatable triage loop, the USE method applied during a
load test, finding the knee of the latency curve, event-loop delay and
utilization in Node.js, CPU profiling with `--cpu-prof` (and where Clinic.js
and 0x fit), garbage-collection pressure, slow MongoDB queries and missing
indexes, connection pool exhaustion, N+1 queries, and a worked
investigation from symptom to fix.

Operating-system tools (`top`, `vmstat`, `iostat`, `ss`) are covered in
[troubleshooting CPU, memory, disk, and network](../linux-server-operations/troubleshooting-cpu-memory-disk-and-network.md),
and the Node.js basics behind this page (the event loop, heap snapshots,
worker threads) in
[the event loop](../../../03-backend-development/nodejs/event-loop.md) and
[errors, debugging, and performance](../../../03-backend-development/nodejs/errors-debugging-and-performance.md).

## Why it matters

Without a method, teams guess, and the usual guesses are expensive or
harmful: add instances, double the connection pool, raise the heap limit.
Each can make things worse. A bigger pool pushes more concurrent queries
into a database that is already saturated; more instances multiply the
connections the database must hold; a bigger heap only delays a leak.

A **bottleneck** is the first resource to saturate as load rises, and it
caps the throughput of the whole system. Fixing it moves the limit to the
next bottleneck, so capacity grows in steps, one diagnosis at a time.
Knowing exactly which resource saturates decides whether the fix is a line
of code, an index, a configuration value, or more hardware, which is the
difference between a cheap fix and a recurring bill.

## Real-world usage

- **The USE method.** Brendan Gregg's
  [USE method](https://www.brendangregg.com/usemethod.html) is a checklist
  for performance investigations: "For every resource, check utilization,
  saturation, and errors." It applies to software resources too: for a
  thread pool or a lock, saturation is the number of requests waiting.
- **Discord: GC pauses.** In
  [Why Discord is switching from Go to Rust](https://discord.com/blog/why-discord-is-switching-from-go-to-rust)
  (2020), Discord describes latency and CPU spikes roughly every two
  minutes in its Read States service. The cause was Go's garbage collector,
  which runs at least every two minutes and had to scan a very large
  in-memory cache. Shrinking the cache cut the spikes but raised p99,
  because more lookups went to the database; the team load-tested cache
  sizes before rewriting the service in Rust, which removed the spikes.
- **Netflix: flame graphs for Node.js.**
  [Node.js in Flames](https://netflixtechblog.com/node-js-in-flames-ddd073803aa4)
  (2014) describes rising request latency on Netflix's Node.js website.
  CPU flame graphs showed the time growing inside Express's route
  handling; the cause was route handlers being registered again and again,
  so every request walked an ever longer list.
- **Node.js documentation.** The official
  [flame graphs guide](https://nodejs.org/en/learn/diagnostics/flame-graphs)
  recommends 0x for a single-step flame graph locally, and Linux `perf`
  with V8's `--perf-basic-prof` options for production systems.

**Popular tools and providers:** `node --cpu-prof` with Chrome DevTools or
VS Code, 0x, Linux `perf`, Clinic.js (no longer actively maintained),
`perf_hooks` and prom-client's default metrics, OpenTelemetry traces,
MongoDB `explain()` and the database profiler, the Atlas Query Profiler
and Performance Advisor, and continuous profilers such as Grafana
Pyroscope.

## How it works

### The triage loop

Investigations go wrong in two ways: chasing the first thing that looks
odd, and changing several things at once. A fixed order avoids both:

1. **Reproduce the symptom under load** with the same test, at the step
   where it starts.
2. **Rule out the test itself.** If the generator is saturated or dropping
   iterations, nothing else you read is trustworthy.
3. **Check saturation, cheapest signals first:** event-loop utilization,
   then connection pools and the database, then dependencies seen in
   traces.
4. **Measure the suspect directly:** a CPU profile, an `explain()` plan, a
   pool wait-time metric.
5. **Change one thing**, re-run the same test, and compare with the
   baseline. The next bottleneck appears at a higher load.

![Diagram: a triage flowchart. Start when p95 or errors rise under load. Is the load generator healthy, with no dropped iterations and CPU below 80 percent? If not, fix the test first with more VUs, more generator hosts, and stubbed third parties. If yes, is event-loop utilization above about 80 percent? If yes, the service is CPU-bound in JavaScript: record a CPU profile with --cpu-prof under load, read the flame graph, and check GC time. If not, are there pool waiters or slow queries in the database? If yes, use the slow query log, explain, indexes, N+1 checks, and the pool size. If not, do traces show slow dependencies or network time? If yes, look at timeouts, connection reuse, caching, and the dependency's own limits. If not, check other limits such as rate limiters, file descriptors, and memory. After every fix, re-run the same test and compare with the baseline.](bottleneck-triage-flowchart.svg)

### The USE method during a load test

For every resource on the request path, check **utilization** (how busy
it is), **saturation** (how much work is waiting), and **errors**. Build
the checklist before the test, so the dashboards are ready when it runs.

| Resource | Utilization | Saturation | Errors |
|---|---|---|---|
| CPU (host or container) | CPU % per core | Run-queue length; CPU throttling in containers | - |
| Node.js event loop | Event-loop utilization (ELU) | Event-loop delay | Request timeouts |
| Memory and heap | Heap used against the limit | GC time and frequency | Out-of-memory restarts |
| Database connection pool | Connections in use / `maxPoolSize` | Requests waiting; checkout wait time | Checkout timeouts |
| MongoDB server | CPU, disk I/O, cache use | Queued operations, slow operations | Errors, failovers |
| Downstream API | In-flight calls against its limit | Calls waiting for a socket | Timeouts, 429, 5xx |
| File descriptors | Open sockets and files | - | `EMFILE` errors |
| Load generator | CPU, network | Dropped iterations | Request errors at the client |

USE complements the RED view of each service (rate, errors, duration per
route) described in
[metrics and dashboards](../monitoring-and-logging/metrics-and-dashboards.md):
RED tells you which endpoint hurts, USE tells you which resource is behind
it. Container CPU throttling is explained in
[scaling and resource management](../kubernetes/scaling-and-resource-management.md).

### Finding the knee

Run a **step test**: raise the offered load in steps and hold each one long
enough to read steady-state numbers (a few minutes in a real test). For
each step, compare the achieved throughput with the offered load, and
watch p95. Below the limit, throughput follows the offered load and latency
stays flat. At the **knee**, throughput stops following and latency turns
sharply upward, because every extra request now waits in a queue. The last
step before the knee that still meets the SLO is the measured capacity;
plan to run well below it (see
[capacity planning](../../../05-application-architecture/scalability/capacity-planning.md)
for the queueing math and headroom).

![Diagram: results of one local step test against a lab server whose database pool has 5 connections and queries of about 21 ms, stepping the offered load from 100 to 300 requests per second with a 5 second ramp and a 20 second hold per step. Achieved throughput: 98, 144, and 194 requests per second at 100, 150, and 200 offered, then a plateau of 232 at 250 and only 209 at 300, because 5 connections divided by 0.0215 seconds per query is about 233 per second. p95 latency: 30, 29, and 40 ms, then 726 ms at 250 and 4,589 ms at 300. The knee lies between 200 and 250 requests per second. Event-loop utilization stayed at 4 to 6 percent and the pool's wait queue reached 995 requests.](latency-throughput-knee.svg)

The chart comes from the step-test script in the practical examples, run
with shortened holds against a local stand-in server. Little's law
predicted the plateau before the test: a pool of 5 connections whose
queries take about 0.0215 s can complete at most 5 / 0.0215, about 233
queries per second. Event-loop utilization stayed at 4-6% throughout, so
adding CPU would not have helped; the queue was in front of the pool.

### Event-loop delay and utilization

Node.js runs all JavaScript on one thread. Two built-in measurements
describe how busy it is:

- **Event-loop utilization (ELU):** the share of time the loop spent
  running code rather than waiting for I/O, from
  `performance.eventLoopUtilization()`. Near 100% means the process is
  CPU-bound.
- **Event-loop delay:** how late timers fire, from
  `perf_hooks.monitorEventLoopDelay()`. Long synchronous work (a huge
  `JSON.parse`, a deep copy, synchronous crypto) delays every other
  request in the process.

Each event-loop-delay sample includes the sampling interval itself: an idle
loop reports values close to the `resolution` (10 ms in the sampler below),
and on Windows, where timers are coarser, about 15.6 ms. Judge the delay by
how far p99 and the maximum rise above that baseline. A 200 ms block, in a
local check, showed up as a 200 ms maximum.

Read the two together:

| ELU | Event-loop delay | Request latency | Likely bottleneck |
|---|---|---|---|
| High (above about 80%) | High | High | CPU-bound JavaScript or GC in this process |
| Low | At the baseline | High | Waiting on I/O: a pool, the database, a dependency, a lock |
| Low | Occasional spikes | Occasional spikes | Rare long synchronous tasks |

Measured on the local lab server with the sampler from the practical
examples:

| Run | Throughput | p95 latency | ELU | Event-loop delay p99 |
|---|---|---|---|---|
| Healthy: 100 requests/s to a cheap endpoint | 100/s, no errors | 11 ms | 3-5% | about 20 ms |
| CPU-bound: 150/s offered to an endpoint doing heavy synchronous work | 131/s achieved, 341 dropped iterations | 1.58 s | 99-100% | 110-403 ms |
| Pool-bound: the 250/s step of the knee test | 232/s achieved | 726 ms | 4-6% | about 16-23 ms |

The second and third runs are both slow, for opposite reasons; only the
second would improve with more CPU. When the event loop is saturated,
timers and I/O callbacks also run late, so pools and queries look slow too:
check ELU before blaming the database.

### CPU profiling under load

When ELU is high, find out which functions use the CPU. Node's built-in
sampling profiler records the stack every millisecond by default
(`--cpu-prof-interval`, in microseconds) and writes a `.cpuprofile` file
**when the process exits**:

```bash
node --cpu-prof --cpu-prof-dir=./profiles src/server.js
# run the load test against it, then stop the server with SIGINT or SIGTERM;
# the file is named like CPU.20261114.012039.16912.0.001.cpuprofile
```

The process must exit normally for the profile to be written, so the
server needs a shutdown handler that closes and calls `process.exit()` on
SIGTERM and SIGINT (as in a graceful-shutdown handler). Open the file in
Chrome DevTools (the Performance panel's load-profile button) or VS Code to
see a flame chart, which puts time on the x-axis, or summarize it from the
command line with the script in the practical examples. Profile under the
realistic load from your test, for a bounded time, against one instance:
profiling a process with no traffic shows only start-up code.

![Diagram: an illustrative flame graph of on-CPU samples for GET /tasks with a slow statistics builder. Bottom row: all on-CPU samples. Above it, GC takes 10 percent and the GET /tasks handler 90 percent. Above the handler, buildTaskStats appears in 70 percent of samples, the driver's find in 5 percent, and res.json in 15 percent. Above buildTaskStats, JSON.parse and JSON.stringify take 25 percent each and the map callback 15 percent; above res.json, JSON.stringify takes 12.5 percent. Callouts mark the widest top edges, the deep copies, as self time and the first place to look, and serializing the response as the second. Width is the share of CPU samples with frames sorted by name, not time; height is stack depth.](flame-graph-reading.svg)

How to read a flame graph: the x-axis is the population of samples sorted
alphabetically, not the passage of time; the y-axis is stack depth, with
callers below callees. A box's width is how often that frame was on the
stack. The **top edges** are what was actually running, so wide plateaus at
the top are where the CPU time goes. A flame **chart** (the DevTools view)
keeps time on the x-axis instead, which is better for finding one long
task.

Two well-known tools wrap this workflow:

- **0x** profiles a process and writes an interactive flame graph in a
  single command (`npx 0x -o src/server.js`, then Ctrl+C); its README lists
  Node.js 20 and later.
- **Clinic.js** (Doctor, Flame, Bubbleprof, Heap Profiler), originally
  developed by NearForm, carries a notice that it is not being actively
  maintained and that its results may be inaccurate on current Node.js
  versions; its last npm release dates from 2023. Prefer `--cpu-prof`, 0x,
  or a continuous profiler on new projects.

In production, use short, targeted captures, Linux `perf` with
`--perf-basic-prof`, or a continuous profiler that samples all the time at
low overhead, rather than leaving `--cpu-prof` running.

### Memory and garbage-collection pressure

Every allocation must eventually be collected, and collection takes time
on the same thread. GC pressure shows up as:

- latency spikes that line up with **major** collections;
- a large share of ELU spent in GC (the `(garbage collector)` frame in a
  profile, or `nodejs_gc_duration_seconds` from prom-client);
- a heap that saws up and down at a high rate, or a floor that keeps
  rising (a leak).

Typical causes in an API are per-request allocations that scale with data
(serializing huge result sets, deep copies, building large strings) and
caches without bounds. The fixes are to allocate less (smaller pages,
projections, streaming), to bound caches, and to find leaks with heap
snapshots taken minutes apart under load. Raising `--max-old-space-size`
is right only when the working set is genuinely larger; for a leak it only
delays the crash.

### Slow queries and missing indexes

Most API latency under load is database time. Three tools find it:

- **The slow query log.** `mongod` logs operations slower than `slowms`
  (100 ms by default). Lower it in a performance environment to see more.
- **The database profiler.** `db.setProfilingLevel(1, { slowms: 20 })`
  records slow operations into the capped `system.profile` collection.
  MongoDB's documentation warns that the profiler can degrade performance
  and suggests the Atlas Query Profiler, the Performance Advisor, or the
  `$queryStats` stage first; on a self-managed test environment it is
  fine for a short run.
- **`explain("executionStats")`** on a suspect query, comparing
  `nReturned` with `totalKeysExamined` and `totalDocsExamined`. A query
  that returns 20 documents after examining 40,000 is the classic missing
  index. A `COLLSCAN` stage is a full collection scan; a `SORT` stage means
  an in-memory sort the index could not provide.

For compound indexes, MongoDB's **ESR guideline** puts **E**quality fields
first, then **S**ort fields, then **R**ange fields. TaskFlow's main list
query, `{ ownerId, status: "open" }` sorted by `dueDate`, therefore wants
`{ ownerId: 1, status: 1, dueDate: 1 }`. Index basics are covered in
[MongoDB index design](../../../04-databases/mongodb/indexes-and-performance.md)
and [explain and query plans](../../../04-databases/mongodb/query-plans-explain.md).

### Connection pool exhaustion

Every query needs a connection from the driver's pool. Little's law gives
the number of connections busy on average:

```text
busy connections = requests/s × queries per request × seconds per query
```

When that approaches `maxPoolSize`, requests queue for a connection. The
MongoDB Node.js driver's defaults are a `maxPoolSize` of 100 and a
`waitQueueTimeoutMS` of 0, meaning no limit on the wait; the driver does not
limit the number of waiters either, so a saturated pool shows up as rising
latency, not errors, until your own request timeout fires. Setting
`waitQueueTimeoutMS` makes the driver fail a checkout that waits too long
with a `MongoWaitQueueTimeoutError`, which turns a hidden queue into a
visible error.

![Diagram: one API instance receives 120 requests per second with 2 queries each, 240 queries per second. Requests wait in the driver's wait queue, unbounded by default, for one of 20 pool connections, 19 of them busy; MongoDB is at 92 percent CPU with queries of about 80 ms because of an unindexed sort. Before the fix, busy connections are 240 times 0.080 seconds, 19.2: the pool of 20 is full, requests queue, and a bigger pool only adds load to a database at 92 percent CPU. After an index that follows the equality, sort, range guideline, busy connections are 240 times 0.002 seconds, 0.48: the pool is almost idle, database CPU drops, and the knee moves to a higher rate.](connection-pool-queue.svg)

A full pool is usually a **symptom**. If the queries are slow because the
database is saturated, a bigger pool sends more concurrent work into it and
makes every query slower. Raise `maxPoolSize` only when the database has
headroom and the queries are already fast, and remember that every
instance has its own pool: 10 instances with `maxPoolSize: 100` can open
1,000 connections to one server.

### N+1 queries

An N+1 pattern runs one query for a list and then one more per item, so
the query count grows with the page size and the data. The pattern and its
fixes (one batched `$in` query, `$lookup`, embedding, DataLoader for
GraphQL) are explained in
[performance and latency](../../../05-application-architecture/scalability/performance-and-latency.md).
Under load it shows up as database operations per second rising faster
than requests per second. The cheapest guard is a test that counts the
commands one request sends, shown in the practical examples.

### Other common limits

- **Dependencies:** a slow downstream service holds sockets and memory for
  every waiting request. Traces show it (see
  [distributed tracing](../monitoring-and-logging/distributed-tracing.md));
  timeouts and bulkheads contain it (see
  [resilience patterns across servers](../load-balancing-and-multi-server/resilience-patterns-across-servers.md)).
- **No connection reuse:** a client or proxy that opens a new TLS
  connection per request spends CPU on handshakes; k6's
  `http_req_tls_handshaking` and the server's CPU show it.
- **Rate limiters and quotas:** a wall of 429 responses at a round number
  is a limiter, not a capacity limit.
- **File descriptors:** `EMFILE` errors mean the process hit its open-file
  limit; see the Linux troubleshooting page.
- **Autoscaling lag:** new instances arrive after the spike; see
  [autoscaling server fleets](../load-balancing-and-multi-server/autoscaling-server-fleets.md).

## When to use and when not to use

| Symptom under load | First tool | Then |
|---|---|---|
| Latency rises with ELU near 100% | CPU profile under load (`--cpu-prof`, 0x) | Optimize the hot functions or move work to worker threads |
| Latency rises with ELU low | Pool wait time, slow query log | `explain()`, indexes, N+1 checks |
| Periodic latency spikes | GC timing, event-loop delay maximum | Reduce allocations, find the long synchronous task |
| Memory grows during a soak test | Heap snapshots minutes apart | Fix the leak; bound caches |
| One endpoint slow, others fine | Traces for that route | Its queries and dependencies |
| Everything slow, servers idle | Load-generator health, network | Fix the test or the network path |

Do not profile or tune before you have a reproducible symptom under a
realistic load: micro-optimizing code that is not on the critical path
costs time and readability for nothing. And do not tune production by
experiment; reproduce the problem in a performance environment first.

## Practical examples

### A runtime health sampler

```js
// src/runtime-stats.js: event-loop delay, event-loop utilization, and GC pauses every 10 s
import { monitorEventLoopDelay, performance, PerformanceObserver, constants } from "node:perf_hooks";

export function startRuntimeStats({ intervalMs = 10_000, log = console.log } = {}) {
  const delay = monitorEventLoopDelay({ resolution: 10 }); // samples every 10 ms
  delay.enable();
  let lastElu = performance.eventLoopUtilization();
  const gc = { pauses: 0, major: 0, totalMs: 0, maxMs: 0 };

  const gcObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      gc.pauses += 1;
      gc.totalMs += entry.duration;
      gc.maxMs = Math.max(gc.maxMs, entry.duration);
      if (entry.detail?.kind === constants.NODE_PERFORMANCE_GC_MAJOR) gc.major += 1;
    }
  });
  gcObserver.observe({ entryTypes: ["gc"] });

  const ms = (ns) => Number((ns / 1e6).toFixed(1)); // the histogram records nanoseconds
  const timer = setInterval(() => {
    const elu = performance.eventLoopUtilization(lastElu); // only the last interval
    lastElu = performance.eventLoopUtilization();
    log({
      eluPercent: Math.round(elu.utilization * 100),
      loopDelayP50Ms: ms(delay.percentile(50)),
      loopDelayP99Ms: ms(delay.percentile(99)),
      loopDelayMaxMs: ms(delay.max),
      gcPauses: gc.pauses,
      gcMajor: gc.major,
      gcTotalMs: Math.round(gc.totalMs),
      gcMaxMs: Number(gc.maxMs.toFixed(1)),
      heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1048576),
    });
    delay.reset();
    Object.assign(gc, { pauses: 0, major: 0, totalMs: 0, maxMs: 0 });
  }, intervalMs);
  timer.unref(); // never keeps the process alive on its own

  return function stop() {
    clearInterval(timer);
    delay.disable();
    gcObserver.disconnect();
  };
}
```

```js
// src/server.js (excerpt): log runtime stats next to the request logs
import { startRuntimeStats } from "./runtime-stats.js";
import { logger } from "./observability.js";

startRuntimeStats({ log: (stats) => logger.info({ runtime: stats }, "runtime stats") });
```

```text
# two samples from the lab runs (5-second interval)
CPU-bound:  {"eluPercent":100,"loopDelayP50Ms":88.7,"loopDelayP99Ms":403.2,"gcPauses":57,"gcMajor":1,"gcTotalMs":255,"heapUsedMb":33}
Pool-bound: {"eluPercent":5,"loopDelayP50Ms":11.5,"loopDelayP99Ms":23.2,"gcPauses":13,"gcMajor":2,"gcTotalMs":13,"heapUsedMb":37}
```

Each line covers only the last interval: `eventLoopUtilization(lastElu)`
returns the difference since the previous reading, and the histogram and GC
counters are reset after each log. In production, export the same values as
metrics (prom-client's `collectDefaultMetrics()` already provides
`nodejs_eventloop_lag_p99_seconds` and `nodejs_gc_duration_seconds`) and put
them on the dashboard you watch during load tests. The samples above are
trimmed to the most telling fields.

### Profiling under load and summarizing the profile

```bash
# terminal 1: the API under the profiler, on a performance host
node --cpu-prof --cpu-prof-dir=./profiles src/server.js

# terminal 2: steady load on the suspect endpoint for 60 seconds
k6 run --vus 20 --duration 60s -e BASE_URL=http://localhost:3000 perf/smoke.js

# terminal 1: stop the server with Ctrl+C (its shutdown handler exits cleanly), then
node perf/tools/cpuprofile-top.js profiles/CPU.*.cpuprofile
```

```js
// perf/tools/cpuprofile-top.js: the functions with the most CPU samples in a .cpuprofile
import { readFileSync } from "node:fs";

const profile = JSON.parse(readFileSync(process.argv[2], "utf8"));
const totalSamples = profile.samples.length;
const msPerSample = (profile.endTime - profile.startTime) / 1000 / totalSamples; // times are in µs

const selfSamples = new Map();
for (const { callFrame, hitCount = 0 } of profile.nodes) {
  const file = callFrame.url ? ` ${callFrame.url.split("/").pop()}:${callFrame.lineNumber + 1}` : "";
  const name = `${callFrame.functionName || "(anonymous)"}${file}`;
  selfSamples.set(name, (selfSamples.get(name) ?? 0) + hitCount);
}

console.log("self %   self ms  function");
for (const [name, hits] of [...selfSamples].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  const pct = ((hits / totalSamples) * 100).toFixed(1).padStart(6);
  const ms = (hits * msPerSample).toFixed(0).padStart(8);
  console.log(`${pct}  ${ms}  ${name}`);
}
```

```text
self %   self ms  function
  78.2     18809  (idle)
  13.8      3316  buildTaskStats stats.mjs:2
   5.2      1254  (anonymous) stats.mjs:5
   0.9       215  (garbage collector)
   0.3        83  (program)
   0.3        71  writeUtf8String
```

The output is from a 24-second profile of the lab server while k6 sent 60
requests per second to an endpoint with a deliberately wasteful statistics
builder. `(idle)` is time the loop waited for I/O; among the busy samples,
`buildTaskStats` and its `map` callback dominate, so that is the function
to fix. Each profile node records `hitCount`, the samples in which it was
the running (top) frame, which is exactly the self time a flame graph shows
as top edges. On a real API run, the same script points at the busiest
handlers in seconds and works in CI, where no browser is available.

### Finding the knee with a step test

```js
// perf/find-the-knee.js: step the arrival rate up and watch where latency turns upward
import http from "k6/http";

const steps = [100, 150, 200, 250, 300]; // requests per second, held for 2 minutes each

export const options = {
  scenarios: {
    steps: {
      executor: "ramping-arrival-rate",
      startRate: steps[0],
      timeUnit: "1s",
      preAllocatedVUs: 100,
      maxVUs: 1000,
      stages: steps.flatMap((rate) => [
        { target: rate, duration: "10s" }, // move to the next step
        { target: rate, duration: "2m" },  // hold it
      ]),
    },
  },
  thresholds: {
    http_req_failed: [{ threshold: "rate<0.05", abortOnFail: true }],
  },
};

export default function () {
  http.get(`${__ENV.BASE_URL}/tasks?limit=20`, {
    headers: { Authorization: `Bearer ${__ENV.API_TOKEN}` },
    tags: { name: "GET /tasks" },
  });
}
```

```js
// perf/tools/k6-steps-report.js: throughput and latency per time window from k6 --out json
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const [file, windowSeconds = "60"] = process.argv.slice(2);
const bySecond = new Map(); // epoch second -> request durations in ms

for await (const line of createInterface({ input: createReadStream(file) })) {
  if (!line.includes('"type":"Point"') || !line.includes('"metric":"http_req_duration"')) continue;
  const { data } = JSON.parse(line);
  const second = Math.floor(Date.parse(data.time) / 1000);
  if (!bySecond.has(second)) bySecond.set(second, []);
  bySecond.get(second).push(data.value);
}

// Windows start at the first sample, so each one lines up with a step of the test.
const first = Math.min(...bySecond.keys());
const windows = new Map();
for (const [second, durations] of bySecond) {
  const w = Math.floor((second - first) / Number(windowSeconds));
  windows.set(w, (windows.get(w) ?? []).concat(durations));
}

const pick = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
console.log("window   req/s    p50 ms   p95 ms   p99 ms");
for (const w of [...windows.keys()].sort((a, b) => a - b)) {
  const d = windows.get(w).sort((a, b) => a - b);
  const cols = [d.length / Number(windowSeconds), pick(d, 0.5), pick(d, 0.95), pick(d, 0.99)];
  console.log(`${String(w + 1).padStart(6)}  ${cols.map((v) => v.toFixed(0).padStart(7)).join("  ")}`);
}
```

```text
$ k6 run --out json=results/knee.json perf/find-the-knee.js
$ node perf/tools/k6-steps-report.js results/knee.json 25
window   req/s    p50 ms   p95 ms   p99 ms
     1       98       20       30       36
     2      144       21       29       44
     3      194       21       40       91
     4      232      336      726      772
     5      209     2365     4589     5029
     6       43     6003     6375     6389
```

This output is from the lab run behind the knee chart, with each step held
for 20 seconds instead of 2 minutes, so 25-second windows line up with the
steps. Window 4 is the knee. In window 5 the achieved rate falls below the
offered 300 per second because k6 reached its 1,000 VUs and dropped
iterations; window 6 is the queue draining after the test ended. With real
2-minute holds, use 130-second windows and read the steady part of each.

### Reading the database side

```js
// mongosh, in the performance environment: record operations slower than 20 ms
db.setProfilingLevel(1, { slowms: 20 })

// the slowest recent operations on the tasks collection
db.system.profile.find(
  { ns: "taskflow.tasks", millis: { $gt: 20 } },
  { op: 1, millis: 1, planSummary: 1, keysExamined: 1, docsExamined: 1, nreturned: 1, hasSortStage: 1 }
).sort({ millis: -1 }).limit(5)

// the suspect query, with execution statistics
db.tasks.find({ ownerId: ObjectId("<user-id>"), status: "open" })
  .sort({ dueDate: 1 }).limit(20)
  .explain("executionStats")

db.setProfilingLevel(0) // switch the profiler off again
```

```text
# trimmed and illustrative: field names as documented, layout varies by version
before  winning plan: SORT <- FETCH <- IXSCAN { ownerId: 1 }
        nReturned: 20, totalKeysExamined: 41200, totalDocsExamined: 41200, executionTimeMillis: 85
after   winning plan: LIMIT <- FETCH <- IXSCAN { ownerId: 1, status: 1, dueDate: 1 }
        nReturned: 20, totalKeysExamined: 20, totalDocsExamined: 20, executionTimeMillis: 1
```

Before, the only index was on `ownerId`: a heavy user's 41,200 tasks were
fetched, filtered by status, and sorted in memory to return 20. After an
ESR index, the index delivers the 20 open tasks already in `dueDate` order.
Build indexes on large collections as a planned change (see
[zero-downtime database migrations](../deployment-strategies/zero-downtime-database-migrations.md)).

### Watching the connection pool

```js
// src/db/pool-stats.js: connection pool use and checkout waits, from MongoDB driver events
export function trackPoolWaits(client, { intervalMs = 10_000, log = console.log } = {}) {
  let inUse = 0;
  let waitsMs = [];
  let timeouts = 0;

  client.on("connectionCheckedOut", (event) => {
    inUse += 1;
    waitsMs.push(event.durationMS); // how long this checkout waited for a connection
  });
  client.on("connectionCheckedIn", () => {
    inUse -= 1;
  });
  client.on("connectionCheckOutFailed", (event) => {
    if (event.reason === "timeout") timeouts += 1; // waitQueueTimeoutMS was exceeded
  });

  const timer = setInterval(() => {
    waitsMs.sort((a, b) => a - b);
    const p99 = waitsMs.length ? waitsMs[Math.ceil(0.99 * waitsMs.length) - 1] : 0;
    log({ poolInUse: inUse, checkouts: waitsMs.length, checkoutWaitP99Ms: Math.round(p99), checkoutTimeouts: timeouts });
    waitsMs = [];
    timeouts = 0;
  }, intervalMs);
  timer.unref();
}
```

```js
// src/db/client.js (excerpt): one client per process, with a bounded wait
import { MongoClient } from "mongodb";
import { trackPoolWaits } from "./pool-stats.js";
import { logger } from "../observability.js";

export const client = new MongoClient(process.env.MONGODB_URI, {
  maxPoolSize: 20,
  waitQueueTimeoutMS: 2000, // fail a checkout after 2 s instead of waiting forever
});
trackPoolWaits(client, { log: (stats) => logger.info({ pool: stats }, "pool stats") });
```

The driver emits connection pool events on the client by default.
`connectionCheckedOut` carries `durationMS`, the time the checkout took
(in current driver versions), which is the wait a request spent in front
of the pool; its p99 rising while `poolInUse` sits at `maxPoolSize` is the
signature of a saturated pool. A non-zero `checkoutTimeouts` means requests
are now failing with `MongoWaitQueueTimeoutError` instead of waiting
silently.

### A test that catches N+1 queries

```js
// test/integration/tasks-query-count.test.js: fail the build when GET /tasks queries per item
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { MongoClient } from "mongodb";
import { createApp } from "../../src/app.js";

const client = new MongoClient(process.env.MONGODB_URI, { monitorCommands: true });
const commands = [];
let app;

before(async () => {
  await client.connect();
  client.on("commandStarted", (event) => commands.push(event.commandName));
  app = createApp({ db: client.db() });
});

after(() => client.close());

test("GET /tasks sends the same number of queries for 5 and 50 tasks", async () => {
  commands.length = 0;
  await request(app).get("/tasks?limit=5").expect(200);
  const forFive = commands.filter((name) => name === "find" || name === "aggregate").length;

  commands.length = 0;
  await request(app).get("/tasks?limit=50").expect(200);
  const forFifty = commands.filter((name) => name === "find" || name === "aggregate").length;

  assert.equal(forFifty, forFive, `query count grew with page size: ${forFive} -> ${forFifty}`);
});
```

Command monitoring is off by default; `monitorCommands: true` makes the
client emit `commandStarted` for every command. With one request at a time
there is no doubt which request sent which command, which makes this a
reliable guard in the integration suite from
[testing and quality gates](../ci-cd/testing-and-quality-gates.md). It needs
seeded data with at least 50 tasks for the test user.

### A worked investigation

An example investigation on TaskFlow API, with illustrative numbers. The
setup: three API instances, `maxPoolSize: 20` each, one MongoDB replica-set
primary.

1. **Symptom.** A breakpoint test shows p95 of `GET /tasks` flat around
   45 ms up to 300 requests per second, then 900 ms at 360, with timeouts
   from 400. Achieved throughput plateaus near 370 per second.
   `dropped_iterations` is zero and the generator's CPU is 35%: the test
   is sound.
2. **USE.** On the API instances, ELU is about 30% and event-loop delay is
   at its baseline: not CPU. The pool sampler shows `poolInUse` at 20 of 20
   and a checkout-wait p99 of 600 ms: the pool is saturated. MongoDB's CPU
   is at 92%.
3. **Little's law.** At 360 requests per second, each instance serves 120,
   each request runs 2 queries, and queries now take about 80 ms:
   120 × 2 × 0.080 = 19.2 busy connections, which is the whole pool. A
   larger pool would push more concurrent queries into a database already
   at 92% CPU, so the pool is the symptom.
4. **The database.** The profiler shows the list query on top, with
   `hasSortStage: true` and `docsExamined` in the tens of thousands for
   heavy users; `explain()` confirms an in-memory sort after scanning every
   task the user owns.
5. **The fix.** A single ESR index, `{ ownerId: 1, status: 1, dueDate: 1 }`,
   built in the performance environment and then rolled out as a planned
   change. The query now examines 20 documents and takes about 2 ms;
   busy connections at the same load fall to 120 × 2 × 0.002 = 0.48.
6. **Re-run.** The same breakpoint test now holds p95 under 50 ms to 800
   requests per second, MongoDB's CPU is about 35% at 360, and the new
   knee appears near 850, where ELU on the API instances reaches 95%. The
   next bottleneck is CPU: a profile under load is the next step.

The pattern generalizes: rule out the test, read utilization and
saturation for each resource, use Little's law to check that the numbers
agree, fix the cause rather than the symptom, and expect the next
bottleneck.

## Best practices

- Investigate in a fixed order: the test, then CPU, then pools and the
  database, then dependencies.
- Prepare RED and USE dashboards for the request path before the test,
  including event-loop utilization, delay, GC, pool waits, and database
  saturation.
- Find capacity with a step test and read it where throughput stops
  following the offered load.
- Use Little's law to check that pool sizes, concurrency, and throughput
  agree before changing any of them.
- Profile under realistic load, for a bounded time, on one instance.
- Fix causes, not symptoms: a slow query, not a bigger pool; a leak, not a
  bigger heap.
- Bound every wait: request timeouts, `waitQueueTimeoutMS`, and timeouts on
  dependencies.
- Change one thing per run and re-run the same test against the baseline.
- Keep a regression guard for each bottleneck you fix: an index check, a
  query-count test, a threshold.

## In production

- **p95 rises with load while the CPU looks idle.**
  *Detect:* ELU and CPU are low, latency grows with the request rate, and
  the pool's checkout wait rises. *Cause:* requests queue for database
  connections because queries are slow or the pool is too small for
  rate × queries × query time. *Fix:* find and fix the slow queries first;
  then size the pool with Little's law, within the database's connection
  budget.
- **Every endpoint slows down at once.**
  *Detect:* event-loop delay p99 and ELU jump together, on unrelated
  routes. *Cause:* synchronous CPU work in one handler (large
  serialization, deep copies, synchronous crypto) blocks the whole
  process. *Fix:* profile under load, optimize or move the work to worker
  threads (see
  [worker threads, child processes, and cluster](../../../03-backend-development/nodejs/worker-threads-child-processes-and-cluster.md)),
  and paginate large responses.
- **Latency spikes at regular intervals.**
  *Detect:* p99 spikes that line up with major GC events or with a timer.
  *Cause:* large heaps with many live objects, or a periodic job running on
  the request thread. *Fix:* allocate less per request, bound caches, and
  move periodic jobs out of the API process.
- **Raising `maxPoolSize` made things worse.**
  *Detect:* after the change, database CPU and query time rise and p95
  gets worse at the same load. *Cause:* the database was the real
  bottleneck; more connections meant more concurrent work on it. *Fix:*
  revert, find the slow queries with the profiler and `explain()`, and add
  the missing index.
- **Database load grows faster than traffic after a release.**
  *Detect:* database operations per request jump at the deploy time.
  *Cause:* a new N+1 query pattern. *Fix:* batch the queries, and add a
  query-count test so it cannot come back unnoticed.
- **Requests hang instead of failing during an overload.**
  *Detect:* requests take as long as the client timeout, with no errors
  logged by the API. *Cause:* unbounded waits: no `waitQueueTimeoutMS`, no
  timeouts on dependencies. *Fix:* bound every wait so overload turns into
  fast, visible errors that load shedding and retries can handle.

## Important terminology

- **Bottleneck:** The first resource to saturate as load rises; it caps
  the system's throughput.
- **USE method:** Checking utilization, saturation, and errors for every
  resource.
- **Saturation:** Work waiting for a resource, such as a queue length or a
  wait time.
- **Knee:** The load where throughput stops following the offered load and
  latency rises sharply.
- **Event-loop utilization (ELU):** The share of time the Node.js event
  loop is busy running code.
- **Event-loop delay:** How late the event loop runs scheduled callbacks.
- **CPU profile:** A sampled record of which functions were running.
- **Flame graph:** Aggregated stacks with width for sample share and
  height for stack depth.
- **Flame chart:** Stacks drawn against time.
- **Self time:** Samples in which a function itself, not its callees, was
  running.
- **GC pressure:** Latency and CPU lost to garbage collection because of
  heavy allocation.
- **Connection pool exhaustion:** All pool connections busy, so requests
  queue for one.
- **N+1 queries:** One query for a list plus one per item.
- **ESR guideline:** Equality, Sort, Range order for compound index fields.

## Common mistakes and misconceptions

- Adding instances or connections before finding the saturated resource.
- Trusting the results of a test whose generator was saturated or dropping
  iterations.
- Profiling an idle process, or a different version from the one tested.
- Reading a flame graph's x-axis as time.
- Treating event-loop delay values as pure lag, without subtracting the
  sampling interval.
- Blaming the database when the event loop is saturated and every callback
  runs late.
- Raising the heap limit to "fix" a memory leak.
- Fixing several things between runs, so nobody knows what helped.
- Stopping after the first fix, without re-testing for the next
  bottleneck.

## Revision questions

1. Apply the USE method to a Node.js API and its MongoDB database: name
   the utilization, saturation, and error signal for four resources.
2. In a step test, how do you recognize the knee, and what is the measured
   capacity?
3. ELU is 8% and p95 is 2 seconds. What kind of bottleneck is likely, and
   where do you look next?
4. An instance serves 150 requests per second, each with 3 queries of 40
   ms. How many connections are busy on average? What happens with
   `maxPoolSize: 10`, and is raising it the right fix? (150 x 3 x 0.040 =
   18 busy connections; with 10 the pool saturates and requests queue;
   first check why queries take 40 ms and whether the database has
   headroom.)
5. Why must a process exit normally for `--cpu-prof` to write its profile,
   and how do you arrange that for a server?
6. What do the x-axis, y-axis, and box width mean in a flame graph?
7. How does `explain("executionStats")` reveal a missing index? Which
   fields do you compare?
8. How would you stop an N+1 pattern from reaching production again?

## Further learning

- [Brendan Gregg: The USE Method](https://www.brendangregg.com/usemethod.html)
- [Brendan Gregg: Flame Graphs](https://www.brendangregg.com/flamegraphs.html)
- [Node.js: Flame graphs](https://nodejs.org/en/learn/diagnostics/flame-graphs)
- [Node.js API: perf_hooks](https://nodejs.org/api/perf_hooks.html)
- [MongoDB: Explain results](https://www.mongodb.com/docs/manual/reference/explain-results/)
- [MongoDB: The ESR guideline](https://www.mongodb.com/docs/manual/tutorial/equality-sort-range-guideline/)
- [MongoDB Node.js driver: Connection pools](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/connection-pools/)
- Next: [chaos engineering and game days](chaos-engineering-and-game-days.md). Back to the
  [performance and reliability testing overview](../performance-and-reliability-testing.md).
