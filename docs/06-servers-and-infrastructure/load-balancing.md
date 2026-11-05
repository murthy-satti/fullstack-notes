# Load Balancing

## Introduction

Load balancing distributes requests across backend servers or application instances. A load balancer sits between clients and backends and chooses where requests go.

## Why does it exist?

A single server can become overloaded or unavailable. Sharing work across healthy instances increases capacity and reduces the effect of one failure. Other parts of the system must also be designed for failure.

## How does it work?

Clients connect to the balancer, which selects a backend using a policy such as round robin or least connections. Health checks help it avoid unresponsive instances. Some balancers understand HTTP hostnames and paths. Session affinity keeps a client on one backend but may limit flexibility.

## Real-world example

An online store has three web instances. The balancer sends requests to available instances and avoids one that fails its health check.

## Developer perspective

Applications should avoid relying on local memory or disk for shared user state. Store durable data in a shared service and make health checks reflect readiness. Understand forwarded headers, TLS termination, and timeouts. Related: [servers](servers.md), [Nginx](nginx.md), and [reverse proxies](reverse-proxy.md).

## Practical example

Start with two instances and a `/health` endpoint. Route traffic only to healthy instances, then stop one in a test environment and confirm requests still succeed.

## Important terminology

- **Backend/target:** a server receiving forwarded requests.
- **Health check:** a test used to decide whether a target is usable.
- **Algorithm:** rule for choosing a target.
- **Failover:** directing traffic away from an unavailable component.
- **Session affinity:** repeatedly choosing the same backend for a client.

## Advantages and disadvantages

Load balancing spreads load and can help with maintenance or failure recovery. It adds a component to monitor and does not fix slow code or an overloaded database.

## Common misconceptions

Adding instances does not always make an application scale: shared dependencies may still limit it. A passing health check does not prove every feature works.

## Revision questions

1. What is a health check used for?
2. Why can session affinity make scaling less flexible?
3. What kinds of dependencies may remain bottlenecks?

## Further Learning & References

- **Official Nginx documentation:** [HTTP load balancing](https://nginx.org/en/docs/http/load_balancing.html) explains upstream servers and balancing methods.
- **Official AWS documentation:** [Elastic Load Balancing](https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/what-is-load-balancing.html) describes load balancers, targets, and health checks.
