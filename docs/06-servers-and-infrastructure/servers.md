# Servers

## Introduction

A server is a computer or software process that provides a service to clients. A web server receives HTTP requests and returns pages or data. “Server” describes a role, not necessarily hardware.

## Why does it exist?

Applications need a place to run and respond to requests. A server can provide a website, API, or database. It may be physical hardware, a virtual machine, or a managed platform.

## How does it work?

A server process listens on an address and port. A client connects and sends a request using an agreed protocol; the server returns a response. Operating systems, networking rules, and software affect whether it works. Public servers need updates and access control.

## Real-world example

When a browser requests `https://example.com`, DNS helps find the service address and web software handles the request. The server may return a file or call an application and database.

## Developer perspective

Know what listens on each port, how to view logs, and how services restart. Keep private services private and apply updates. Applications must handle timeouts and unavailable dependencies. Related: [DNS](domains-and-dns-configuration.md), [Nginx](nginx.md), and [AWS](aws.md).

## Practical example

Run a local development server and open its address in a browser. If it fails, check the process, port, and firewall or container mapping. Do not expose development servers publicly without understanding their protections.

## Important terminology

- **Client:** requester of a service.
- **Host:** a network-connected computer.
- **Port:** number identifying a service endpoint on a host.
- **Process:** running program managed by an operating system.
- **Virtual machine:** software-defined computer with its own operating environment.

## Advantages and disadvantages

Servers give teams control over software and runtime settings. They require planning, patching, backups, and monitoring. Managed hosting reduces some work but not application responsibilities.

## Common misconceptions

A server need not be a large physical computer. One host can run several services, and one service can span hosts. “Always on” does not mean “always available.”

## Revision questions

1. How is a server different from a client?
2. What role does a port play?
3. Name two responsibilities involved in operating a server.

## Further Learning & References

- **Official AWS documentation:** [Amazon EC2 concepts](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/concepts.html) introduces virtual servers and their lifecycle.
- **Third-party tutorial:** [DigitalOcean: What Is a Server?](https://www.digitalocean.com/community/tutorials/what-is-a-server) explains the client-server model in plain language.
