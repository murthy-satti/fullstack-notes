# API Security

## Introduction

An application programming interface (API) lets software exchange data and request actions. API security designs interfaces so only intended users and services can perform permitted actions and data stays protected. See [Web Security Fundamentals](web-security-fundamentals.md) for related ideas.

## Why does it exist?

APIs often expose private records or powerful operations. A hidden button is not a security control: anyone who can send a request may try it directly. API security limits risks from mistakes, stolen credentials, and unexpected inputs.

## How does it work?

Use HTTPS, authenticate each caller, and authorize every action against its specific resource. Validate input, limit request sizes and rates, and return only needed fields. Keep secrets out of URLs and logs; use safe errors and retire old API versions deliberately.

## Real-world example

A note-taking API may allow a signed-in user to list notes. The server must also check that each requested note belongs to that user; knowing a note ID must not grant access. This is object-level authorization, a frequent API design concern.

## Developer perspective

Treat every request as untrusted, including those from your frontend. Document authorization rules and expected inputs, and test allowed and denied cases. Rate limits and monitoring help, but do not replace authorization.

## Practical example

For `GET /notes/42`, authenticate the caller, load the note, and check its owner before returning it. For creation, accept documented fields such as `title` and `body`, not privileged fields such as `ownerId` or `isAdmin`. Test access denial for another user's note.

## Important terminology

- **Authentication:** establishing who or what is making a request.
- **Authorization:** deciding what that identity may do.
- **Object-level authorization:** checking access to the particular record named by a request.
- **Rate limiting:** restricting request volume over time.

## Advantages and disadvantages

Explicit API controls reduce accidental data exposure and make behavior testable. They take ongoing effort: rules must evolve with features, versions, and data models. Overly broad permissions are unsafe; overly narrow or inconsistent rules can break legitimate clients.

## Common misconceptions

- CORS is not authentication; it mainly controls browser cross-origin access.
- An unguessable identifier does not replace an ownership check.
- A valid token does not automatically authorize every operation.

## Further Learning & References

- **Official standard/project:** [OWASP API Security Project](https://owasp.org/www-project-api-security/) describes common API risks and defensive guidance.
- **OWASP guidance:** [REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html) provides practical controls for REST APIs.
- Continue with [Authentication Security](authentication-security.md) and [Testing Fundamentals](testing-fundamentals.md).
