# Web Security Fundamentals

## Introduction

Web security protects websites, browsers, servers, and exchanged data. Secure applications use multiple controls because no single technique prevents every attack. See [API Security](api-security.md) and [Authentication Security](authentication-security.md) for related topics.

## Why does it exist?

Web applications handle personal information, payments, and business operations. A weakness can expose data, alter records, or disrupt a service. Security protects users and supports reliable operation.

## How does it work?

Identify valuable data and likely threats. Use HTTPS, validate input, encode output for its context, enforce server-side authorization, and store secrets safely. Limit privileges and data collection. Security headers, updates, logging, tests, backups, and incident plans add layers.

## Real-world example

A comment feature should treat submitted text as untrusted. The server validates length and format, stores it safely, and the page encodes it as text rather than interpreting it as markup. The server also checks that the current user is allowed to create or remove the comment.

## Developer perspective

Security is a lifecycle activity. Include it in design, review, deployment, and maintenance. Use least privilege and threat modeling. Log important events without recording passwords, session secrets, or unnecessary personal data.

## Practical example

For a profile update endpoint, verify the session and edit permission, validate fields, and update only allowed properties. Use parameterized queries, return safe errors, and test permitted and denied updates.

## Important terminology

- **Threat:** a possible cause of harm to a system or its data.
- **Vulnerability:** a weakness that could be misused.
- **Least privilege:** granting only the access needed for a task.
- **Defense in depth:** using multiple complementary controls.

## Advantages and disadvantages

Layered security reduces reliance on any one control and limits the impact of mistakes. More controls can add complexity and operational work; select them according to risks and test that they do not create unsafe workarounds.

## Common misconceptions

- HTTPS protects communication in transit, not every stored value or authorization decision.
- Input validation does not replace output encoding or access control.
- Security is not finished when an application launches.

## Revision questions

1. What does defense in depth mean?
2. Why must authorization happen on the server?
3. Name a secret that should not be written to application logs.

## Further Learning & References

- **OWASP project:** [OWASP Top 10](https://owasp.org/Top10/) is an awareness overview of common web application risks.
- **OWASP guidance:** [Content Security Policy Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html) explains how CSP can add a browser-enforced layer against some content injection risks.
- **Official documentation:** [MDN: Transport Layer Security](https://developer.mozilla.org/en-US/docs/Web/Security/Transport_Layer_Security) explains how TLS protects web communications.
