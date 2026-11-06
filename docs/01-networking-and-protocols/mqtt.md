# MQTT

## Introduction

Message Queuing Telemetry Transport (MQTT) is a lightweight
publish-subscribe messaging protocol commonly used by devices with limited
resources or intermittent network connections. Clients exchange messages
through a broker using named topics.

## Why does it exist?

Small sensors and devices may not need a direct connection to every system
that consumes their data. A broker separates publishers from subscribers:
devices publish readings, and interested consumers subscribe to topics.
This reduces tight coupling between device producers and application
consumers.

## How does it work?

1. An MQTT client connects to a broker, commonly over TCP.
2. A publisher sends a message to a topic, such as
   `building/room-4/temperature`.
3. The broker checks its subscriptions and forwards the message to matching
   subscribers.
4. Depending on the Quality of Service (QoS) selected, MQTT provides
   different delivery acknowledgement behavior.
5. Clients may reconnect and optionally use retained messages or persistent
   sessions according to broker and client configuration.

| QoS | Delivery behavior | Trade-off |
|---|---|---|
| 0 | At most once | No protocol acknowledgement; a message may be lost |
| 1 | At least once | Retries may result in duplicates; consumers should handle them |
| 2 | Exactly once within the MQTT exchange | More protocol work and state |

QoS is not the same as a business transaction guarantee. Applications may
still need identifiers, idempotency, durable storage, or reconciliation.
MQTT over plain TCP commonly uses port 1883; MQTT protected with TLS
commonly uses port 8883. Broker deployments can use different ports and
access policies.

## Real-world example

A building sensor publishes temperature updates to an MQTT broker. A
dashboard subscribes to the relevant topic, while an alert service subscribes
to a broader set of measurements. A bank or government portal is not usually
an MQTT client-facing website, though organizations may use MQTT internally
for device telemetry or building systems.

## Developer perspective

MQTT is useful when building IoT telemetry and command systems. Design topic
names, authentication, authorization, message validation, retention, and
offline behavior carefully. TLS protects transport when configured, but
clients still need broker permissions that restrict which topics they can
publish to or subscribe to.

## Practical example

For a development system you control, use an MQTT client and broker to
publish a non-sensitive test value to a topic and subscribe to it from
another authorized client. Do not publish private device data to a public
broker.

## Important terminology

- **Broker:** server that receives publications and forwards messages to
  subscribers.
- **Publisher:** client that sends a message to a topic.
- **Subscriber:** client that registers interest in topics.
- **Topic:** hierarchical name used to route messages.
- **QoS:** MQTT delivery level for a message exchange.
- **Retained message:** broker-held latest message for a topic, available to
  a future matching subscriber when configured.

## Advantages and disadvantages

MQTT has a small messaging model and decouples producers from consumers. It
adds a broker dependency and requires careful topic permissions and message
handling; delivery level alone does not ensure exactly-once business
processing.

## Common misconceptions

- MQTT is not only for tiny devices; it is a messaging protocol often chosen
  for IoT-style communication.
- A broker forwarding a message does not prove that the subscriber processed
  it successfully.
- QoS 2 does not make an entire application workflow exactly once.
- MQTT does not provide authorization policy automatically; the broker must
  be configured to enforce it.

## Further learning

- [OASIS MQTT Version 5.0 Standard](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html)
- [OASIS MQTT Version 3.1.1 Standard](https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/mqtt-v3.1.1.html)
