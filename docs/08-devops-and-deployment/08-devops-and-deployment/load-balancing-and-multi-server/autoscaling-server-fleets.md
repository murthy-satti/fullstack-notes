# Autoscaling Server Fleets

The previous lesson spread the TaskFlow API across Availability Zones and
regions ([multi-AZ and multi-region architecture](multi-az-and-multi-region-architecture.md)).
This one makes each of those fleets size itself. An autoscaling group
keeps a set of identical virtual machines running from a template,
replaces the ones that fail their health checks, and adds or removes
instances as load changes, so you pay for roughly the capacity you need
instead of the peak, all day.

This lesson covers the three big implementations (AWS Auto Scaling
groups, Google Cloud managed instance groups, and Azure Virtual Machine
Scale Sets), launch templates built on immutable machine images, the
scaling policies (target tracking, step, scheduled, and predictive), how
to choose the metric, why new capacity always arrives late and how
warmup, warm pools, and headroom deal with it, lifecycle hooks, scale-in
protection, and draining before termination, how fleet autoscaling
relates to Kubernetes, and the cost guards that stop a scaling policy
from running up a bill.

## Why it matters

Traffic is rarely flat. A business application peaks during office hours
and sleeps at night; a consumer app peaks in the evening; a shop peaks
during a sale. A fleet sized for the peak wastes most of its money off
peak, and a fleet sized for the average falls over at the peak.
Autoscaling also gives you two things beyond cost: **self-healing**
(failed instances are replaced automatically) and a safe way to
**roll out new machine images** by replacing instances gradually.

It is also easy to get wrong in ways that only show up under load:
scaling on a metric that does not track load, capacity that arrives ten
minutes after the spike that needed it, scale-in that kills requests in
flight, or a scale-out triggered by a retry storm that launches hundreds
of instances and still does not help because the database is the real
bottleneck.

## Real-world usage

- **Netflix.** The post
  [Scryer: Netflix's Predictive Auto Scaling Engine](https://netflixtechblog.com/scryer-netflixs-predictive-auto-scaling-engine-a3f8fc922270)
  (2013) explains why reactive autoscaling was not enough for Netflix:
  instance startup then took 10 to 45 minutes, leaving existing servers
  exposed during a rapid spike, and an outage that suddenly dropped
  traffic could make reactive policies scale in just before the traffic
  came back. Because daily and weekly patterns repeat, Netflix predicted
  demand and provisioned ahead of it.
- **Amazon Builders' Library.** The article
  [Static stability using Availability Zones](https://aws.amazon.com/builders-library/static-stability-using-availability-zones/)
  argues that a service should be overprovisioned so it keeps working
  without launching any new instances if an Availability Zone becomes
  impaired, because reacting to an impairment depends on a control plane
  that may itself be affected.
- **AWS.** The
  [predictive scaling](https://docs.aws.amazon.com/autoscaling/ec2/userguide/predictive-scaling-policy-overview.html)
  documentation describes forecasting from up to 14 days of history
  (after at least 24 hours of data), an hourly forecast for the next 48
  hours refreshed every 6 hours, and a forecast-only mode to check
  accuracy before letting it scale.
- **Google Cloud.** The
  [managed instance group autoscaler](https://cloud.google.com/compute/docs/autoscaler)
  documentation describes an initialization period during which new VMs'
  usage is ignored for scale-out decisions, and a stabilization period
  (10 minutes by default) during which the autoscaler keeps enough
  capacity for the peak it has just seen before deleting VMs.

**Popular tools and providers:** AWS EC2 Auto Scaling, Google Cloud
managed instance groups, Azure Virtual Machine Scale Sets, Packer and
image pipelines for golden images, Terraform and other IaC tools, Spot
and preemptible capacity, and Kubernetes node autoscalers (Cluster
Autoscaler, Karpenter) built on the same groups.

## How it works

### The building blocks

An autoscaling fleet has four parts:

1. **A template** that says what to launch: the machine image, instance
   type, network and security groups, IAM role or service account, and a
   small user-data script.
2. **A group** with a minimum, maximum, and desired size, spread over
   subnets in several Availability Zones, that launches instances from the
   template until the actual count matches the desired count.
3. **Health checks** that decide when an instance is broken and must be
   replaced, ideally using the load balancer's application-level check
   rather than only "the VM is running".
4. **Scaling policies** that change the desired size from metrics,
   schedules, or forecasts.

The same ideas have different names on each cloud:

| Concept | AWS | Google Cloud | Azure |
|---------|-----|--------------|-------|
| Fleet | Auto Scaling group | Managed instance group (zonal or regional) | Virtual Machine Scale Set (Flexible orchestration recommended) |
| Template | Launch template (versioned) | Instance template | Scale set VM profile |
| Replace unhealthy instances | EC2 and ELB health checks | Autohealing with a health check | Automatic instance repairs |
| Roll out a new template | Instance refresh | Rolling update (max surge, max unavailable) | Rolling upgrades |
| Pre-initialized capacity | Warm pools (stopped, hibernated, or running) | Standby pools of suspended or stopped VMs | Standby pools (Flexible orchestration only) |
| Predictive scaling | Predictive scaling policies | Predictive autoscaling (CPU only) | Predictive autoscale (CPU only) |

### Immutable images and launch templates

The faster and more predictable an instance's boot, the better
autoscaling works. Teams therefore **bake** everything into a golden
machine image (the OS patches, the runtime, the agents, and the
application build) with a tool such as Packer, and keep user data to a
few lines of environment-specific configuration. Installing packages at
boot makes every launch slower and makes the fleet depend on package
mirrors being reachable during an incident. Building images is covered
in [immutable infrastructure and GitOps](../infrastructure-as-code/immutable-infrastructure-and-gitops.md).

A release then becomes: build image, create a new launch template
version, and replace instances gradually. On AWS, an **instance refresh**
does the replacement in batches controlled by a minimum and maximum
healthy percentage (for example 90% and 110%: replace about 10% of the
fleet at a time, launching before terminating), with optional
checkpoints, a bake time, skip matching (leave instances already on the
new configuration alone), and automatic rollback when CloudWatch alarms
fire.

### Scaling policies

| Policy | How it decides | Good for |
|--------|----------------|----------|
| **Target tracking** | Keeps a metric near a target value, like a thermostat; the provider creates and manages the alarms | The default for most web fleets |
| **Step scaling** | Adds or removes a fixed or percentage amount per alarm breach band | Precise control, such as adding more instances the further a metric overshoots |
| **Scheduled** | Changes min, max, or desired size at set times | Known patterns: office hours, a planned sale, nightly batch windows |
| **Predictive** | Forecasts load from history and launches capacity ahead of it | Strong daily or weekly cycles combined with slow boots |

Policies combine. A common production setup is target tracking for the
unexpected, plus scheduled or predictive scaling to have capacity ready
before the expected morning ramp. When several policies are active, the
group follows whichever asks for the most capacity, so the extra policies
only ever add safety.

Two provider details matter. AWS target tracking scales in more
gradually than it scales out, to protect availability when traffic
fluctuates. AWS predictive scaling in forecast-and-scale mode only ever
adds capacity; scale-in still needs a dynamic policy. Google Cloud's and
Azure's predictive options forecast CPU only.

### Target tracking with numbers

![Diagram: a target tracking loop for TaskFlow API; the load balancer receives 15,000 requests per minute and reports RequestCountPerTarget to CloudWatch each minute; with 10 instances the metric is 1,500 against a target of 1,000, so the alarm fires and the policy raises the Auto Scaling group's desired capacity from 10 to 15; the group launches 5 instances from launch template version 7 and registers them; the arithmetic panel shows about 10 times 1,500 divided by 1,000 equals 15 instances, inside min 6 and max 40, 1,000 per target after warmup, a night-time need of 4 kept at the minimum of 6, and max size 40 as a cost guard.](target-tracking-loop.svg)

Target tracking assumes the metric moves **in proportion** to the number
of instances. If 10 instances each see 1,500 requests per minute and the
target is 1,000, the group needs roughly 10 × 1,500 / 1,000 = 15
instances to bring each one back to 1,000. The provider rounds
conservatively, so with small groups the metric may settle a little
below the target rather than exactly on it.

### Choosing the metric

| Metric | Works when | Watch out for |
|--------|------------|---------------|
| Average CPU utilization | The service is CPU-bound and instances are identical | I/O-bound services sit at low CPU while queues build; mixed instance sizes skew the average |
| Request count per target | Web services where each request costs about the same | Expensive and cheap requests mixed; it says nothing about response time |
| Backlog per instance (queue depth ÷ instances) | Queue workers | Raw queue length is not proportional to fleet size; divide by instances |
| Custom business metric | You can publish a per-instance load measure | It must rise and fall in proportion to fleet size |
| Latency | Never as the target tracking metric | Latency does not fall in proportion to instances; use it for alarms instead |
| Memory | Rarely | Garbage-collected runtimes keep memory high when idle |

For queue workers, derive the target from what users will tolerate.
If a message takes 2 seconds to process and a message may wait at most
10 minutes, one instance can own a backlog of 600 / 2 = 300 messages. With
15,000 messages waiting, the fleet needs 15,000 / 300 = 50 instances, and
the target tracking metric is "messages per instance" with a target of
300.

### Why capacity arrives late: detection, boot, warmup

![Diagram: a 10-minute timeline; offered load jumps from 10,000 to 15,000 requests per minute at minute 0; the metric stays above target while the alarm collects datapoints until about minute 3, when the group raises desired capacity from 10 to 15 and launches 5 instances; they boot and start the app until minute 6, pass health checks by minute 7, then serve traffic while their warmup period keeps them out of the average until minute 9; the existing 10 instances are overloaded from minute 0 to about minute 7 and return near target afterwards; headroom, warm pools, scheduled or predictive scaling, and faster boot shrink the overloaded period.](scale-out-warmup-timeline.svg)

A reactive policy can only respond after the metric has been high for
long enough to trust it, and then the instance still has to boot, start
the application, and pass health checks. For several minutes the
existing fleet carries the new load alone. The defenses, in order of
cost:

- **Headroom.** A target of 50% to 60% CPU instead of 80% means the fleet
  absorbs a large jump while new instances start.
- **Faster boot.** Golden images, small user data, and lazy loading of
  rarely used data.
- **Warmup.** A warmup period (AWS default instance warmup, Google
  Cloud's initialization period) keeps freshly launched instances' noisy
  start-up metrics out of the average, so the group does not overreact.
- **Warm pools and standby pools.** Pre-initialized instances kept
  stopped or hibernated (you pay for their disks, not their compute), so a
  scale-out resumes them instead of building them from scratch.
- **Scheduled and predictive scaling.** Capacity that is already running
  when the expected ramp starts; AWS can launch ahead of the forecast by
  a configurable buffer.

### The instance lifecycle: hooks, protection, and draining

![Diagram: scale-out takes an instance from the warm pool in Warmed:Stopped, where only volumes are billed, to Pending, then Pending:Wait, where a launch hook finishes setup and warms caches, then InService, registered in the target group and health checked; scale-in picks an unprotected instance, which becomes Terminating, is deregistered from target groups with a deregistration delay of 300 seconds by default, then Terminating:Wait, where a termination hook with a one-hour default heartbeat lets it flush and finish jobs before completing, and finally Terminated, or back to the warm pool with a reuse policy; scale-in protection keeps chosen instances out of the selection.](asg-instance-lifecycle.svg)

- **Lifecycle hooks** pause an instance in a wait state at launch or at
  termination so your code can act: finish bootstrapping before it takes
  traffic, or upload logs and finish a job before it disappears. A hook
  waits up to its heartbeat timeout (one hour by default on AWS, with a
  48-hour overall limit) until your code calls
  `complete-lifecycle-action`. An instance can read its target state from
  the instance metadata item `autoscaling/target-lifecycle-state`.
- **Scale-in protection** removes specific instances from scale-in
  selection, for example a worker in the middle of a long job that sets
  protection when it takes the job and clears it when done.
- **Termination policies** decide which instance goes first; the default
  first balances instances across Availability Zones.
- **Draining.** Deregistration from the load balancer stops new requests
  while the target group's deregistration delay (300 seconds by default
  on an Application Load Balancer) lets requests in flight finish. Set it
  close to your longest normal request, not to the default, or every
  scale-in and rollout waits five minutes per batch. The application must
  still handle `SIGTERM` gracefully, as described for containers in
  [health probes and rolling updates](../kubernetes/health-probes-and-rolling-updates.md).

### Health checks and self-healing

By default AWS only replaces instances whose EC2 status checks fail:
a VM that is running but whose application is hung stays in service.
Setting the group's health check type to **ELB** makes it replace
instances the load balancer considers unhealthy, using the same
`/readyz`-style check that controls traffic. A **health check grace
period** (or Google Cloud's autohealing initial delay) prevents the group
from killing instances that are still booting. Be careful with health
checks that depend on shared dependencies: if the database is down and
every instance fails, the group replaces the whole fleet in a loop and
makes recovery slower.

### Multiple zones and static stability

A group spread over three Availability Zones keeps roughly a third of its
instances in each. If one zone fails, the group launches replacements in
the others, but only if the control plane can launch them and there is
capacity to launch into. The statically stable alternative is to run
enough capacity that losing a zone does not require launching anything.

Worked example: the API needs 12 instances at peak. Spread over 3 zones
that is 4 per zone; losing a zone leaves 8, a third short. Running 6 per
zone (18 instances, 50% overprovisioning) means losing any zone still
leaves 12. With 4 zones, 4 per zone (16 instances) leaves 12 after a loss:
more zones make static stability cheaper.

### Spot capacity and mixed instance types

Spot (AWS), Spot VMs (Google Cloud), and Azure Spot VMs are spare
capacity at a discount that the provider can reclaim; AWS gives a
two-minute interruption notice. A mixed instances policy keeps a base of
On-Demand instances and fills the rest with Spot across several instance
types, so one type running out does not stop scaling. Use Spot for
stateless, interruption-tolerant capacity behind a load balancer, never
for the minimum capacity you need to survive.

### Autoscaling with Kubernetes

On Kubernetes, scaling happens at two layers. The HorizontalPodAutoscaler
changes the number of Pods, and a node autoscaler (Cluster Autoscaler or
Karpenter) adds nodes when Pods cannot be scheduled, usually through the
same cloud groups this page describes (managed node groups are Auto
Scaling groups, GKE node pools are managed instance groups, AKS node pools
are scale sets). The ideas carry over: target tracking becomes the HPA
formula, warmup becomes readiness and startup probes, and draining
becomes Pod termination. See
[scaling and resource management](../kubernetes/scaling-and-resource-management.md).

### Cost guards

Autoscaling spends money automatically, so put limits around it:

- A **maximum size** you would be willing to pay for and that downstream
  systems (database connections, third-party rate limits) can survive.
- **Alarms** on group size and on scaling activity, and a budget alert.
- Care with **automatic maximum increases** (AWS predictive scaling can
  raise the maximum when the forecast approaches it).
- **Scale on the bottleneck.** If the database is saturated, adding API
  instances adds connections and makes it worse; fix or scale the database
  first.
- **Scale-in.** A fleet that never scales in (a missing scale-in policy, or
  a metric that never falls) quietly costs as much as a fixed peak fleet.

## When to use and when not to use

| Workload | Approach |
|----------|----------|
| Steady, predictable load | A fixed-size group (min = max) for self-healing only |
| Web API with daily cycles and boots under a few minutes | Target tracking on request count or CPU, plus a scheduled minimum before the morning ramp |
| Strong weekly patterns and slow boots | Predictive scaling (start in forecast-only mode) plus target tracking |
| Very slow boots (large caches, JIT warmup) | Warm or standby pools, plus a lower target |
| Queue workers | Target tracking on backlog per instance, scale-in protection for long jobs |
| Stateful nodes (databases, brokers) | Do not autoscale on load; scale deliberately |
| Containers already on Kubernetes | HPA plus a node autoscaler |
| Spiky, small workloads | Serverless platforms that scale per request may be simpler |

Do not autoscale to hide a bug (a memory leak "fixed" by replacing
instances), do not let scaling policies fight manual changes, and do not
use autoscaling for components whose state lives on the instance.

## Practical examples

### A TaskFlow API fleet in Terraform

```hcl
# infra/api-fleet.tf: launch template, group, warm pool, and draining hook
resource "aws_launch_template" "api" {
  name_prefix   = "taskflow-api-"
  image_id      = var.api_ami_id            # golden image built by Packer
  instance_type = "c7g.large"
  vpc_security_group_ids = [aws_security_group.api.id]

  iam_instance_profile {
    name = aws_iam_instance_profile.api.name
  }

  metadata_options {
    http_tokens = "required"                # IMDSv2 only
  }

  user_data = base64encode(templatefile("${path.module}/api-user-data.sh", {
    environment = var.environment
  }))
}

resource "aws_autoscaling_group" "api" {
  name_prefix               = "taskflow-api-"
  min_size                  = 6
  max_size                  = 40
  vpc_zone_identifier       = var.private_subnet_ids   # three AZs
  target_group_arns         = [aws_lb_target_group.api.arn]
  health_check_type         = "ELB"
  health_check_grace_period = 120
  default_instance_warmup   = 180

  launch_template {
    id      = aws_launch_template.api.id
    version = aws_launch_template.api.latest_version
  }

  # Replace ~10% at a time, launching before terminating; roll back on alarms
  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 90
      max_healthy_percentage = 110
      skip_matching          = true
      auto_rollback          = true
      alarm_specification {
        alarms = [aws_cloudwatch_metric_alarm.api_5xx.alarm_name]
      }
    }
  }

  warm_pool {
    pool_state                  = "Stopped"
    min_size                    = 4
    max_group_prepared_capacity = 12
    instance_reuse_policy {
      reuse_on_scale_in = true
    }
  }

  initial_lifecycle_hook {
    name                 = "drain"
    lifecycle_transition = "autoscaling:EC2_INSTANCE_TERMINATING"
    heartbeat_timeout    = 300
    default_result       = "CONTINUE"
  }

  lifecycle {
    ignore_changes = [desired_capacity]     # owned by the scaling policies
  }
}
```

Key choices: the ELB health check replaces instances whose application is
broken, not just their VM; the warmup keeps new instances out of the
averages for three minutes; any change to the launch template starts an
instance refresh that rolls back if the 5xx alarm fires; four stopped
instances wait in the warm pool; and the termination hook gives each
instance up to five minutes to drain.

### Scaling policies: target tracking, schedule, and forecast

```hcl
# infra/api-scaling.tf
resource "aws_autoscaling_policy" "requests_per_target" {
  name                   = "requests-per-target"
  autoscaling_group_name = aws_autoscaling_group.api.name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = "${aws_lb.public.arn_suffix}/${aws_lb_target_group.api.arn_suffix}"
    }
    target_value = 1000
  }
}

# Raise the floor before the weekday morning ramp, lower it in the evening.
# -1 means "leave unchanged"; the provider defaults these fields to 0.
resource "aws_autoscaling_schedule" "weekday_morning" {
  scheduled_action_name  = "weekday-morning"
  autoscaling_group_name = aws_autoscaling_group.api.name
  recurrence             = "30 7 * * MON-FRI"
  time_zone              = "Europe/Berlin"
  min_size               = 12
  max_size               = -1
  desired_capacity       = -1
}

resource "aws_autoscaling_schedule" "weekday_evening" {
  scheduled_action_name  = "weekday-evening"
  autoscaling_group_name = aws_autoscaling_group.api.name
  recurrence             = "0 20 * * MON-FRI"
  time_zone              = "Europe/Berlin"
  min_size               = 6
  max_size               = -1
  desired_capacity       = -1
}

# Learn the weekly pattern first; switch mode to "ForecastAndScale" once the
# forecast matches reality.
resource "aws_autoscaling_policy" "predictive_cpu" {
  name                   = "predictive-cpu"
  autoscaling_group_name = aws_autoscaling_group.api.name
  policy_type            = "PredictiveScaling"

  predictive_scaling_configuration {
    mode                   = "ForecastOnly"
    scheduling_buffer_time = 300           # launch 5 minutes ahead of the forecast
    metric_specification {
      target_value = 50
      predefined_metric_pair_specification {
        predefined_metric_type = "ASGCPUUtilization"
      }
    }
  }
}
```

### Draining on termination from inside the instance

```bash
#!/usr/bin/env bash
# /usr/local/bin/asg-drain-watcher.sh: run every 5 s by a systemd timer
set -euo pipefail

IMDS=http://169.254.169.254
token=$(curl -sf -X PUT "$IMDS/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
md() { curl -sf -H "X-aws-ec2-metadata-token: $token" "$IMDS/latest/meta-data/$1"; }

state=$(md autoscaling/target-lifecycle-state || echo "InService")
[ "$state" = "Terminated" ] || exit 0

instance_id=$(md instance-id)
region=$(md placement/region)

# The load balancer has stopped sending new requests. Stop the service:
# systemd sends SIGTERM, and the API finishes in-flight work and exits.
systemctl stop taskflow-api
/usr/local/bin/flush-logs-and-metrics.sh

aws autoscaling complete-lifecycle-action \
  --region "$region" \
  --auto-scaling-group-name taskflow-api \
  --lifecycle-hook-name drain \
  --instance-id "$instance_id" \
  --lifecycle-action-result CONTINUE
```

The instance role needs permission for
`autoscaling:CompleteLifecycleAction` on its own group. If the script
fails, the hook's `default_result` continues termination when the
heartbeat timeout expires, so a broken script delays but never blocks
scale-in.

### The same fleet on Google Cloud and Azure

```bash
# Google Cloud: a regional MIG with autohealing and a CPU autoscaler
gcloud compute instance-groups managed create taskflow-api \
  --region=europe-west1 --template=taskflow-api-v7 --size=6 \
  --health-check=taskflow-api-readyz --initial-delay=120

gcloud compute instance-groups managed set-autoscaling taskflow-api \
  --region=europe-west1 --min-num-replicas=6 --max-num-replicas=40 \
  --target-cpu-utilization=0.6 --cool-down-period=120

# Azure: a Flexible scale set and a CPU autoscale rule pair
az vmss create --resource-group taskflow --name taskflow-api \
  --orchestration-mode Flexible --image <image-id> --instance-count 6 \
  --zones 1 2 3
az monitor autoscale create --resource-group taskflow \
  --resource taskflow-api --resource-type Microsoft.Compute/virtualMachineScaleSets \
  --name taskflow-api-autoscale --min-count 6 --max-count 40 --count 6
az monitor autoscale rule create --resource-group taskflow \
  --autoscale-name taskflow-api-autoscale \
  --condition "Percentage CPU > 60 avg 5m" --scale out 3
az monitor autoscale rule create --resource-group taskflow \
  --autoscale-name taskflow-api-autoscale \
  --condition "Percentage CPU < 30 avg 10m" --scale in 1
```

On Google Cloud the `--cool-down-period` flag sets the initialization
period. On Azure, metric rules come in pairs, and the scale-in rule uses a
lower threshold and a longer window than the scale-out rule so the two
cannot chase each other.

## Best practices

- Bake golden images and keep boot under a few minutes; measure it.
- Spread every group over at least three Availability Zones, and size it
  so losing a zone does not require launching anything.
- Use the load balancer's health check for replacement, with a grace
  period longer than boot.
- Scale on a metric that falls in proportion to fleet size; keep latency
  for alarms.
- Leave headroom in the target, and add scheduled or predictive scaling for
  known ramps.
- Set warmup so new instances do not distort the averages.
- Drain before termination: a deregistration delay that matches your
  longest requests, a termination hook, and graceful `SIGTERM` handling.
- Roll out images with instance refresh or rolling updates, with alarms
  that stop and roll back.
- Cap maximum size, alarm on fleet size, and scale the real bottleneck.

## In production

- **Latency spikes every weekday morning before the fleet catches up.**
  *Detect:* p99 latency and CPU climb from 08:00, and scaling activity
  shows instances launching after the peak has started. *Cause:* reactive
  scaling plus a multi-minute boot cannot follow a steep, predictable ramp.
  *Fix:* raise the minimum with a scheduled action before the ramp, try
  predictive scaling in forecast-only mode, and lower the target.
- **The fleet oscillates: scale out, scale in, scale out.**
  *Detect:* the activity history shows launches and terminations every few
  minutes. *Cause:* new instances' start-up CPU distorts the average (no
  warmup), or step and target tracking policies with overlapping
  thresholds fight each other. *Fix:* set a default warmup, keep scale-in
  slower than scale-out, and use one primary policy.
- **Every scale-in produces a burst of 502 errors.**
  *Detect:* load balancer 5xx errors coincide with terminations.
  *Cause:* instances are terminated while requests are in flight: a
  deregistration delay of zero, no termination hook, or an app that exits
  immediately on `SIGTERM`. *Fix:* a delay that covers the longest normal
  request, a draining hook, and graceful shutdown in the application.
- **A broken application stays in service for hours.**
  *Detect:* the load balancer marks targets unhealthy, but the group never
  replaces them. *Cause:* the group uses only EC2 status checks. *Fix:*
  switch the health check type to ELB with a sensible grace period.
- **A traffic spike launched 200 instances and the site still failed.**
  *Detect:* the group hit its maximum while database CPU and connection
  counts were saturated. *Cause:* the bottleneck was the database, and
  each new instance opened more connections. *Fix:* a lower maximum,
  connection pooling or a proxy, load shedding at the edge, and scaling
  decisions based on the real bottleneck.
- **A new image rolled out and half the fleet failed to boot.**
  *Detect:* an instance refresh stalls with new instances failing health
  checks. *Cause:* a broken image or user-data change. *Fix:* checkpoints,
  alarm-based automatic rollback, and testing new images in staging with
  the same refresh settings.
- **Scale-out silently stops in one zone.**
  *Detect:* activity history shows "insufficient capacity" errors for one
  instance type. *Cause:* the provider has no spare capacity of that type in
  that zone. *Fix:* allow several instance types (a mixed instances policy)
  and keep static-stability headroom.

## Important terminology

- **Autoscaling group:** A set of identical instances kept between a
  minimum and maximum size from a template.
- **Launch template / instance template:** The versioned definition of
  what each instance runs.
- **Golden image:** A pre-baked machine image containing the OS,
  runtime, agents, and application.
- **Desired capacity:** The instance count the group is currently
  working toward.
- **Target tracking:** A policy that keeps a metric near a target value.
- **Step / scheduled / predictive scaling:** Scaling by alarm bands, by
  time, or by forecast.
- **Warmup / initialization period:** Time during which a new instance's
  metrics are ignored or not trusted.
- **Warm pool / standby pool:** Pre-initialized stopped, hibernated, or
  suspended instances ready for fast scale-out.
- **Lifecycle hook:** A pause at launch or termination for custom actions.
- **Scale-in protection:** A flag that keeps an instance from being chosen
  for scale-in.
- **Deregistration delay:** How long a load balancer lets in-flight
  requests finish on a deregistering target.
- **Instance refresh / rolling update:** Gradual replacement of instances
  with a new template.
- **Static stability:** Surviving an impairment without needing to make
  changes, such as launching instances.

## Common mistakes and misconceptions

- Scaling on latency or raw queue length with target tracking.
- Assuming new capacity arrives within seconds of a spike.
- Installing software at boot instead of baking an image.
- Leaving the health check type at EC2 status checks only.
- Terminating instances without draining.
- Setting no maximum, or a maximum the database cannot survive.
- Relying on launching replacements during a zone failure instead of
  pre-provisioned headroom.
- Running the minimum capacity on Spot instances.
- Treating autoscaling as a fix for leaks and crashes.

## Revision questions

1. What are the four building blocks of an autoscaling fleet, and what is
   each called on AWS, Google Cloud, and Azure?
2. A target tracking policy targets 1,000 requests per target per minute.
   Eight instances receive 14,000 requests per minute. About how many
   instances does the group need, and why does the metric have to be
   proportional to the fleet size?
3. A worker takes 4 seconds per message, and messages may wait at most 5
   minutes. What target backlog per instance would you choose, and how many
   instances does a backlog of 9,000 messages need?
4. Walk through the minutes between a traffic spike and new instances
   taking traffic. Name four ways to shorten or hide that gap.
5. How do a deregistration delay, a termination lifecycle hook, and
   graceful `SIGTERM` handling work together during scale-in?
6. Why should a group use the load balancer's health check, and what can go
   wrong if that check depends on the database?
7. Your API needs 18 instances at peak across 3 zones. How many must you run
   to stay statically stable through the loss of one zone? How many with 4
   zones?
8. Which cost guards would you put around an autoscaling group, and why can
   scaling out make a database bottleneck worse?

## Further learning

- [AWS: Target tracking scaling policies](https://docs.aws.amazon.com/autoscaling/ec2/userguide/as-scaling-target-tracking.html)
- [AWS: Warm pools for Amazon EC2 Auto Scaling](https://docs.aws.amazon.com/autoscaling/ec2/userguide/ec2-auto-scaling-warm-pools.html)
- [AWS: Instance refresh](https://docs.aws.amazon.com/autoscaling/ec2/userguide/instance-refresh-overview.html)
- [AWS: Lifecycle hooks](https://docs.aws.amazon.com/autoscaling/ec2/userguide/lifecycle-hooks.html)
- [Google Cloud: Predictive autoscaling](https://cloud.google.com/compute/docs/autoscaler/predictive-autoscaling)
- [Azure: Standby pools for Virtual Machine Scale Sets](https://learn.microsoft.com/en-us/azure/virtual-machine-scale-sets/standby-pools-overview)
- [Stateless services and autoscaling](../../../05-application-architecture/scalability/stateless-services-and-autoscaling.md)
  in the Application Architecture section
- Next: [service discovery and service mesh](service-discovery-and-service-mesh.md).
  Back to the [load balancing and multi-server overview](../load-balancing-and-multi-server.md).
