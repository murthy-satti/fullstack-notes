# Three Servers, One Address

Run three TaskFlow API instances behind one load balancer so that any
instance can serve any request, any one can be stopped under load without
errors, deploys drain connections cleanly, scheduled jobs run once, and a
slow dependency cannot take the API down with it.

## Why this project helps

- Builds the core skills of horizontal scaling: stateless services, load
  balancing, health checks, draining, and distributed jobs.
- Improves **availability**: losing one instance, or deploying, no longer
  means losing requests.
- Improves **resilience**: timeouts, jittered retries, and a circuit breaker
  stop one slow dependency from cascading into a full outage.
- These are exactly the topics of system design and on-call interviews.

## What you need

- Three instances: containers on your laptop with Docker Compose, or three
  small virtual servers.
- Nginx or HAProxy as the load balancer, Redis for sessions and locks, and
  object storage for uploads (a cloud bucket or MinIO locally).
- k6 to generate load.
- Builds on [Production Server from Scratch](production-server-from-scratch.md)
  or [Production Image](production-image.md).

## How to do it

1. Find the state that ties a user to one instance (sessions, uploads on
   local disk, in-memory caches, cron jobs) using
   [from one server to many](../load-balancing-and-multi-server/from-one-server-to-many.md).
2. Move sessions to Redis (for example with connect-redis) and uploads to
   object storage with presigned URLs.
3. Put Nginx or HAProxy in front of the three instances with health checks;
   see [load balancers in depth](../load-balancing-and-multi-server/load-balancers-in-depth.md).
4. Run k6 and stop instances one at a time; watch the load balancer remove
   them and the error rate stay flat.
5. For rolling deploys, drain each instance first (for example HAProxy's
   `set server ... state drain`), wait for connections to finish, then
   update and re-enable it.
6. Make the scheduled job run once per scheduled time with a Redis lock
   (`SET key NX` with an expiry) or a single scheduler.
7. Wrap calls to a slow dependency with timeouts, retries with exponential
   backoff and jitter, and a circuit breaker (opossum or cockatiel); see
   [resilience patterns across servers](../load-balancing-and-multi-server/resilience-patterns-across-servers.md).
8. Inject slowness into that dependency and confirm the API degrades
   gracefully instead of hanging.

## Done when

- Requests are spread across all three instances, and a logged-in user
  stays logged in whichever instance answers.
- Stopping any single instance under load causes no failed requests.
- A rolling deploy of all three instances drops no requests.
- The scheduled job runs exactly once per scheduled time across the fleet.
- With the dependency slowed down, the circuit breaker opens and the API
  answers quickly with a fallback or a clear error.

## Stretch goals

- Add autoscaling for the fleet; see
  [autoscaling server fleets](../load-balancing-and-multi-server/autoscaling-server-fleets.md).
- Spread the instances across two zones and fail one zone.
- Read how large companies design their traffic path in
  [how top companies run at scale](../load-balancing-and-multi-server/how-top-companies-run-at-scale.md).

## Lessons to use

- [Load Balancing and Multi-Server Architecture](../load-balancing-and-multi-server.md)
- [Load balancing](../../../07-servers-and-infrastructure/load-balancing.md)
- [Load testing with k6](../performance-and-reliability-testing/load-testing-with-k6.md)

Back to [all projects](../projects.md).
