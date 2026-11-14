# Load Balancing and Multi-Server Architecture

A multi-server architecture runs the same application on several machines
at once, and a load balancer spreads incoming requests across them, stops
sending traffic to machines that fail, and lets you add or remove machines
without users noticing. The same idea repeats at every scale: two Node.js
processes behind Nginx, a fleet of instances behind a cloud load balancer
in three data centers, or whole regions behind DNS and anycast. It is how a
service grows past one machine and survives the failure of any single one.

## What load balancing and multi-server architecture provide

- **Capacity:** ten instances handle roughly ten times the requests of one,
  as long as nothing they share (usually the database) becomes the
  bottleneck.
- **Availability:** when an instance, a zone, or a region fails, health
  checks remove it and the remaining capacity keeps serving.
- **Zero-downtime changes:** instances can be drained, replaced, and
  re-added one at a time, which is what rolling, blue-green, and canary
  deployments are built on.
- **Lower latency for distant users:** DNS, anycast, and edge locations send
  each user to a nearby entry point.
- **Fault isolation:** zones, regions, and cells limit how many users a
  single failure can reach.

These benefits have a price: the application must be **stateless** (no
sessions, files, or schedules that live on one machine), the load balancer
itself must be redundant, and every extra zone or region adds data
replication, cost, and failure modes to understand.

## How a typical multi-server request path works

A request for the TaskFlow API travels through several layers, each of
which can route around a failure:

1. The client looks up `api.taskflow.example.com`. DNS answers with the
   address of a nearby edge location (GeoDNS or latency-based routing, or
   one anycast address announced from many places).
2. The client opens an HTTPS connection to the **edge** (a CDN point of
   presence or a global load balancer), which terminates TLS, answers
   cached static content, and filters attacks.
3. API calls and cache misses continue to a **region**, where a regional
   load balancer receives them on nodes in several Availability Zones.
4. The load balancer picks a **healthy instance** with its balancing
   algorithm. Instances that fail health checks get no new requests;
   instances being replaced are drained first.
5. The instance reads and writes the **data tier**: a database replicated
   across zones, Redis for sessions, rate limits, and locks, and object
   storage for uploads. Because no state lives on the instance, any
   instance can serve any user.

![Diagram: a user's client looks up the API name in DNS, which returns the address of a nearby edge location; the client connects over HTTPS to a CDN or edge point of presence that terminates TLS, serves cached static files, and runs a WAF; API calls and cache misses go to a regional load balancer in eu-west-1, which health-checks instances and sends each request to a healthy TaskFlow API instance in Availability Zone a, b, or c, two instances per zone; a MongoDB replica set has its primary in zone a and secondaries in zones b and c with data replicating across zones; Redis for sessions, rate limits, and locks and object storage for uploads are shared regional services.](load-balancing-and-multi-server-overview.svg)

## Practical example

Nginx as a load balancer in front of three TaskFlow API instances:

```nginx
# /etc/nginx/conf.d/taskflow-api.conf
upstream taskflow_api {
    least_conn;                                 # fewest active connections wins
    server 10.0.1.11:3000 max_fails=3 fail_timeout=10s;
    server 10.0.2.11:3000 max_fails=3 fail_timeout=10s;
    server 10.0.3.11:3000 max_fails=3 fail_timeout=10s;
    keepalive 32;                               # idle connections kept open to the app
}

server {
    listen 80;                                  # TLS ends at the edge or cloud LB in front
    server_name api.taskflow.example.com;

    location / {
        proxy_pass http://taskflow_api;
        proxy_http_version 1.1;                 # default since nginx 1.29.7; set for older versions
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_next_upstream error timeout http_502 http_503;
        proxy_next_upstream_tries 2;
    }
}
```

If an instance refuses connections or times out three times within 10
seconds, Nginx stops using it for 10 seconds, and the failed request is
retried once on another instance. Nginx never retries a `POST` or `PATCH`
that already reached an instance unless you add `non_idempotent`, which
protects against creating a task twice.

## Load balancing and multi-server topic map

**Foundations**

- [From one server to many](load-balancing-and-multi-server/from-one-server-to-many.md)
- [Load balancers in depth](load-balancing-and-multi-server/load-balancers-in-depth.md)

**Going global**

- [Global traffic management](load-balancing-and-multi-server/global-traffic-management.md)
- [Multi-AZ and multi-region architecture](load-balancing-and-multi-server/multi-az-and-multi-region-architecture.md)

**Running the fleet**

- [Autoscaling server fleets](load-balancing-and-multi-server/autoscaling-server-fleets.md)
- [Service discovery and service mesh](load-balancing-and-multi-server/service-discovery-and-service-mesh.md)
- [Resilience patterns across servers](load-balancing-and-multi-server/resilience-patterns-across-servers.md)

**Case studies**

- [How top companies run at scale](load-balancing-and-multi-server/how-top-companies-run-at-scale.md)

**Review**

- [Load balancing and multi-server interview questions and answers](load-balancing-and-multi-server/interview-questions-and-answers.md) · [cheat sheet](load-balancing-and-multi-server/cheat-sheet.md)

## Developer perspective and common misconceptions

Scale out only after the application is stateless and the database can
take the extra connections; then add instances, then zones, and only add
regions when a measured need (latency for distant users, a regional
outage you cannot accept, data residency) justifies the cost.

- A load balancer does not make an application scalable. An app that keeps
  sessions or uploads in local memory breaks the moment a second instance
  appears.
- More instances do not fix a slow database; they usually add connections
  and make it worse.
- "The process is running" is not a health check. The load balancer needs
  a readiness endpoint that says whether the instance can serve now.
- The load balancer is also a single point of failure unless it is a
  managed, multi-zone service or a redundant pair.
- DNS failover is not instant: resolvers and clients cache answers, and
  open connections stay where they are.
- Multi-region is not a free upgrade from multi-AZ; it turns data
  replication and write conflicts into everyday problems.

## Further learning

- [Nginx: Using nginx as HTTP load balancer](https://nginx.org/en/docs/http/load_balancing.html)
- [AWS: What is Elastic Load Balancing?](https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/what-is-load-balancing.html)
- [Google SRE book: Load Balancing at the Frontend](https://sre.google/sre-book/load-balancing-frontend/)
- [Amazon Builders' Library: Static stability using Availability Zones](https://aws.amazon.com/builders-library/static-stability-using-availability-zones/)
- [Load balancing](../../06-servers-and-infrastructure/load-balancing.md) and
  [reverse proxy](../../06-servers-and-infrastructure/reverse-proxy.md) in the
  Servers and Infrastructure section
- [Load balancing and multi-server interview questions and answers](load-balancing-and-multi-server/interview-questions-and-answers.md)
