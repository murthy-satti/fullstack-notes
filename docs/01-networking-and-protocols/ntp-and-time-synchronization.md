# NTP and Network Time Synchronization

## Introduction

Network Time Protocol (NTP) lets computers synchronize their clocks with
time sources across a network. Correct time supports useful logs, scheduled
jobs, certificate validation, and coordination among distributed services.

## Why does it exist?

Independent device clocks drift. If servers disagree about time, event logs
are difficult to compare, scheduled actions can run incorrectly, and
time-based security checks may fail. NTP provides a way to estimate and
correct clock offset while accounting for network delay.

## How does it work?

1. A client sends a time request to an NTP server, commonly over UDP port
   123.
2. The server responds with timestamps describing the exchange.
3. The client estimates clock offset and round-trip delay.
4. The operating system gradually adjusts its clock and may compare several
   configured sources according to its time-synchronization policy.

Internet time is not perfectly instantaneous. Network delay and asymmetric
routes affect measurements. Systems often use a hierarchy of time sources;
organizations may operate internal servers for consistency and policy.

Network Time Security (NTS) adds authentication and protection for NTP
client-server exchanges. Ordinary NTP without such protection should not be
assumed to authenticate its time source.

## Real-world example

A government portal's servers, a bank's application logs, and a crypto
exchange's monitoring systems need consistent clocks to correlate events.
Their business rules and auditing requirements are separate from NTP itself;
NTP provides time synchronization, not proof that a transaction occurred.
High-precision financial or industrial systems may require specialized
timing methods such as Precision Time Protocol (PTP).

## Developer perspective

Developers use synchronized time for log correlation, certificate checks,
token expiry, distributed tracing, and scheduled work. Prefer server-side
time for security-sensitive decisions, and design distributed systems with
clock skew in mind. A client's wall-clock time is user-controlled and should
not be trusted for authorization.

## Practical example

On Windows, `w32tm /query /status` reports Windows Time status. On Linux,
inspect the time synchronization service configured for the distribution,
such as `timedatectl status` where available. These commands inspect local
time service state; they do not validate a financial transaction timestamp.

## Important terminology

- **Clock offset:** difference between a local clock and a reference clock.
- **Clock drift:** gradual divergence between clocks over time.
- **Stratum:** a level in an NTP time-source hierarchy; lower stratum does
  not automatically mean a source is more trustworthy in every respect.
- **NTS:** Network Time Security, which adds authentication and protection
  for NTP exchanges.
- **PTP:** Precision Time Protocol, used where tighter synchronization is
  required than typical Internet NTP provides.

## Advantages and disadvantages

NTP provides practical clock synchronization across general-purpose
networks. It is affected by network conditions and source trust; ordinary
NTP should not be treated as a cryptographic timestamp or transaction
receipt.

## Common misconceptions

- NTP synchronizes clocks; it does not synchronize application data.
- A timestamp in a client request is not trustworthy just because servers
  use NTP.
- NTP does not guarantee exact zero-offset time.
- Time synchronization and authentication of a user are unrelated functions.

## Further learning

- [RFC 5905: Network Time Protocol Version 4](https://www.rfc-editor.org/rfc/rfc5905)
- [RFC 8915: Network Time Security for the Network Time Protocol](https://www.rfc-editor.org/rfc/rfc8915)
- [RFC 8573: Message Authentication Code for the Network Time Protocol](https://www.rfc-editor.org/rfc/rfc8573)
