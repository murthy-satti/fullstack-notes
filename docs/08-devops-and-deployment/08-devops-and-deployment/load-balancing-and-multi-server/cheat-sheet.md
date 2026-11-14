# Load Balancing and Multi-Server Architecture Cheat Sheet

Quick revision of the load balancing and multi-server lessons, for use
before an interview or a scaling task.

## Key commands

| Command | What it does |
|---|---|
| `nginx -t` | Test the Nginx configuration before a reload |
| `aws elbv2 describe-target-health --target-group-arn "<arn>"` | Target states: initial, healthy, unhealthy, draining, unused |
| `aws elbv2 modify-target-group-attributes --target-group-arn "<arn>" --attributes Key=deregistration_delay.timeout_seconds,Value=30` | Drain for 30 s instead of 300 s |
| `aws arc-zonal-shift start-zonal-shift --resource-identifier "<load-balancer-arn>" --away-from use1-az2 --expires-in 2h --comment "drain"` | Move load balancer traffic away from one zone |
| `dig +noall +answer api.taskflow.example.com @1.1.1.1` | One resolver's answer and its remaining TTL |

## Key configuration

```nginx
# /etc/nginx/conf.d/taskflow-api.conf (excerpt)
upstream taskflow_api {
    least_conn;
    server 10.0.1.11:3000 max_fails=3 fail_timeout=10s;  # passive checks
    server 10.0.2.11:3000 max_fails=3 fail_timeout=10s;
    keepalive 32;
}

server {
    listen 80;
    location / {
        proxy_pass http://taskflow_api;
        proxy_next_upstream error timeout http_502 http_503;
        proxy_next_upstream_tries 2;  # one retry, never for a sent POST
    }
}
```

```ini
# /etc/haproxy/haproxy.cfg (excerpt)
backend taskflow_api
    balance leastconn
    option httpchk
    http-check send meth GET uri /readyz
    default-server inter 2s fall 3 rise 2 slowstart 30s
    server api1 10.0.1.11:3000 check
```

```js
// src/server.js (excerpt): behind exactly one load balancer
app.set("trust proxy", 1);         // req.ip: the address the balancer saw
const server = app.listen(3000);
server.keepAliveTimeout = 65_000;  // above the ALB's 60 s idle timeout
```

## Decision guide

| If you need | Choose | Why |
|---|---|---|
| A public HTTP API | A managed L7 balancer, least outstanding requests | Per-request balancing, TLS, retries |
| TCP or UDP, static IPs | A managed L4 balancer with PROXY protocol v2 | Any protocol, high throughput |
| gRPC between services | An L7 proxy, a mesh, or client-side `round_robin` | L4 pins each HTTP/2 connection to one pod |
| A cache tier | Consistent hashing | Adding a node moves about 1/N of keys |
| Many independent balancers | Power of two choices | No herd behavior |
| Sessions on many instances | A shared Redis store or short-lived tokens | Any instance serves any request |
| A cron job on many instances | A per-run claim, one scheduler, or a queue | Runs once, not once per instance |
| A production baseline | Three zones, sized so two carry peak | A lost zone needs no scaling |
| Regional failover in seconds | Anycast or a global L7 proxy | No DNS caches to wait out |
| Users on several continents | A home region per user or tenant | Local writes, no conflicts |
| A flaky dependency | Timeouts, retries at one layer with jitter, a breaker | Fails fast without a retry storm |

## Numbers and defaults to remember

| Item | Value |
|---|---|
| ALB health checks | 30 s interval; out after 2 failures (~60 s), back after 5 passes (~150 s) |
| ALB deregistration delay | 300 s by default (0 to 3,600) |
| ALB slow start | 30 to 900 s; not with least outstanding requests |
| Idle timeouts | ALB 60 s; Nginx `proxy_read_timeout` 60 s; Node keep-alive 5 s |
| Fail open | ALB and NLB use every target when none is healthy |
| Route 53 checks | 10 s x 3 = ~30 s to detect; healthy above 18% of checkers |
| CloudFront failover | 3 attempts x 10 s = up to 30 s; `GET`, `HEAD`, `OPTIONS` only |
| Light in fiber | ~200 km per ms; Sydney to Virginia: 157 ms round trip or more |
| Zone capacity | Peak x N / (N - 1): 200% with 2 zones, 150% with 3 |
| After losing k of N | Utilization x N / (N - k): 3 at 60%, lose 1: 90% |
| Database connections | Instances x processes x `maxPoolSize` (MongoDB: 100) |
| 4 to 5 servers | Modulo hashing moves 80% of keys; consistent hashing ~20% |
| Async RPO | Lag x write rate: 2 s x 500/s = 1,000 writes |
| Target tracking | Current x metric / target: 10 x 1,500 / 1,000 = 15 |
| AWS lifecycle hook | 1 h heartbeat by default, 48 h limit |
| Eureka | Renew every 30 s; removed after 90 s without one |
| Retries | 3 tries at 5 layers: 3^5 = 243 calls; budget ~10% |

## Top mistakes

- **Keeping state on the instance.** Move sessions, uploads, cron jobs,
  socket rooms, and counters off it before adding a second instance.
- **Health-checking a shared dependency.** Check local readiness; when
  every target fails, balancers and Route 53 stop protecting you.
- **Keeping the 300 s deregistration delay.** Set it just above the
  longest normal request, and drain on `SIGTERM`.
- **A keep-alive shorter than the balancer's idle timeout.** Raise it
  above the balancer's, or reused connections end in 502s.
- **Retrying at every layer.** Retry at one layer, idempotent requests
  only, with full jitter and a budget.
- **Trusting the leftmost `X-Forwarded-For` entry.** Trust only your own
  proxy hops.
- **Expecting DNS failover within one TTL.** Lower TTLs in advance,
  recycle connections, or use anycast or a global proxy.

## Where to go deeper

- [From one server to many](from-one-server-to-many.md)
- [Load balancers in depth](load-balancers-in-depth.md)
- [Global traffic management](global-traffic-management.md)
- [Multi-AZ and multi-region architecture](multi-az-and-multi-region-architecture.md)
- [Autoscaling server fleets](autoscaling-server-fleets.md)
- [Service discovery and service mesh](service-discovery-and-service-mesh.md)
- [Resilience patterns across servers](resilience-patterns-across-servers.md)
- [How top companies run at scale](how-top-companies-run-at-scale.md)
- [Interview questions and answers](interview-questions-and-answers.md)

Back to the [load balancing and multi-server overview](../load-balancing-and-multi-server.md).
