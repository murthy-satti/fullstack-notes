# Monitoring and Logging

## Introduction

Monitoring collects signals about a system. Logging records events and messages. Together they help teams detect failures and investigate behavior.

## Why does it exist?

Without operational information, a developer may know only that a user reported a problem. Metrics show trends, alerts notify a team, and logs provide details. They do not repair a system automatically.

## How does it work?

Applications and infrastructure emit signals. Metrics are numeric measurements over time, such as request duration. Logs are timestamped events; traces follow a request across components. Dashboards visualize signals, while alert rules notify people when a threshold is met. Correlation IDs connect logs for one request.

## Real-world example

After a release, a dashboard shows rising API errors. Request logs with a correlation ID reveal that an endpoint fails when a dependency times out.

## Developer perspective

Use structured logs, but do not record passwords, tokens, or unnecessary personal data. Track latency and errors; set actionable alerts. Related: [servers](../06-servers-and-infrastructure/servers.md), [CI/CD](ci-cd.md), and [backups](backups.md).

## Practical example

Add a request ID to each request and include it in logs. Track successes, failures, and latency. Generate a test error and confirm it appears without private data.

## Important terminology

- **Metric:** numeric measurement over time.
- **Log:** record of an event or message.
- **Trace:** connected view of work across services.
- **Alert:** notification triggered by a rule.
- **Observability:** ability to infer system behavior from its outputs.

## Advantages and disadvantages

Monitoring shortens diagnosis and reveals trends. It needs storage and access controls; excessive logging creates cost and privacy risks.

## Common misconceptions

More logs do not automatically ease debugging. An alert is not a diagnosis, and dashboards cannot show uncollected data.

## Further Learning & References

- **Official AWS documentation:** [What is Amazon CloudWatch?](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/WhatIsCloudWatch.html) describes metrics, logs, alarms, and monitoring.
- **Official OpenTelemetry documentation:** [What is OpenTelemetry?](https://opentelemetry.io/docs/what-is-opentelemetry/) introduces vendor-neutral instrumentation for traces, metrics, and logs.
