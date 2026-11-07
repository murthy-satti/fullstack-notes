# Scalability

Scalability is a system's ability to handle more load, such as more users,
requests, or data, by adding resources, while keeping response times and
error rates acceptable. A scalable system grows by adding capacity rather than
by being rewritten, and it stays available and correct enough while it grows.

## What scalability involves

- **Vertical scaling:** giving one machine more CPU, memory, or faster disks.
  Simple, but limited and often a single point of failure.
- **Horizontal scaling:** adding more machines or instances behind a load
  balancer. Nearly unlimited, but requires stateless services and shared
  state stores.
- **Data scaling:** read replicas, connection pooling, partitioning, and
  sharding when one database can no longer keep up.
- **Availability:** redundancy and failover so the system keeps serving when
  parts fail.
- **Consistency trade-offs:** deciding where slightly stale data is acceptable
  in exchange for speed and availability.
- **Capacity planning:** estimating future load and keeping enough headroom.

## How a system usually scales

1. **Measure:** load test and profile to find the real bottleneck.
2. **Optimize:** fix slow queries, add indexes, and remove unnecessary work.
3. **Cache:** serve repeated reads from memory or a CDN.
4. **Scale out the stateless tier:** run more application instances behind a
   load balancer, with sessions and files moved out of instance memory.
5. **Offload work:** move slow tasks to queues and background workers.
6. **Scale the data tier:** add read replicas, then partition or shard when
   writes or data size outgrow one primary.

Each step adds complexity, so take the next one only when measurements show
the current setup cannot meet the requirements.

## Practical example

```text
Availability target    Allowed downtime per year    Allowed downtime per month
99%                    about 3.65 days              about 7.3 hours
99.9%                  about 8.77 hours             about 43.8 minutes
99.99%                 about 52.6 minutes           about 4.4 minutes
99.999%                about 5.26 minutes           about 26 seconds
```

Each extra nine cuts the allowed downtime by a factor of ten, and usually
requires more redundancy, automation, and cost.

## Scalability topic map

**Scaling the system**

- [Scalability fundamentals](scalability/scalability-fundamentals.md)
- [Stateless services and autoscaling](scalability/stateless-services-and-autoscaling.md)
- [Database scaling](scalability/database-scaling.md)

**Staying available and correct**

- [Availability and reliability](scalability/availability-and-reliability.md)
- [Consistency and the CAP theorem](scalability/consistency-and-cap-theorem.md)

**Measuring and planning**

- [Performance and latency](scalability/performance-and-latency.md)
- [Capacity planning](scalability/capacity-planning.md)

**Review**

- [Scalability interview questions and answers](scalability/interview-questions-and-answers.md)

## Developer perspective and common misconceptions

Design services to be stateless from the start, keep data access efficient,
and measure with percentiles rather than averages. Scale the part that is
actually the bottleneck, and remember that every added component is also
something that can fail.

- Scalability is not the same as performance: a fast system for one user can
  still collapse under load.
- Adding servers does not help if the database or a shared lock is the
  bottleneck.
- Microservices are not required for scalability; a stateless monolith scales
  horizontally too.
- High availability is not achieved by one powerful machine; it comes from
  redundancy without single points of failure.

## Further learning

- [Google SRE Book](https://sre.google/sre-book/table-of-contents/)
- [AWS Well-Architected Framework](https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html)
- [Load balancing](../06-servers-and-infrastructure/load-balancing.md)
- [Scalability interview questions and answers](scalability/interview-questions-and-answers.md)
