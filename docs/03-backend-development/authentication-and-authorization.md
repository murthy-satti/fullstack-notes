# Authentication and Authorization

## Introduction

Authentication asks, “Who are you?” Authorization asks, “What are you
allowed to do?” An application identifies a user and checks permissions
before exposing or changing data.

## Why does it exist?

Authentication establishes identity or a session; authorization applies
rules to the identity and requested action. Without authorization, a signed-in
user might access someone else's records.

## How does it work?

A user may authenticate with a password, passkey, or identity provider. The
application maintains proof of sign-in, often with a session cookie or token.
For protected requests, the backend validates it and checks permission.
Passwords require a dedicated password hashing scheme, never plain text.

## Real-world example

A task application can let users view their own tasks. Authentication
identifies the user; authorization checks task ownership. A successful login
does not permit access to every task.

## Developer perspective

Enforce access on the server, deny by default, and check resource ownership.
Protect credentials and plan for session expiration and revocation.
[REST APIs](rest-apis.md) should not leak private details in errors.

## Practical example

Query a record using both its ID and the current user's ID:

```sql
SELECT id, title FROM tasks WHERE id = ? AND owner_id = ?;
```

This does not treat a user-supplied ID as proof of permission.

## Important terminology

- **Identity:** The person or service represented by a request.
- **Authentication:** Establishing or verifying identity.
- **Authorization:** Deciding whether an identity may perform an action.
- **Session:** Server-recognized state associated with a client.
- **Credential:** Evidence used to authenticate, such as a password or token.

## Advantages and disadvantages

Separate identity and permission checks to keep rules clear. Credentials can
be stolen and overly broad permissions can expose data. Use established
protocols and libraries rather than inventing schemes.

## Common misconceptions

- Being authenticated does not mean a user is authorized for every action.
- Hiding a button in the frontend is not an access-control check.
- Encoding a token does not necessarily encrypt it or make it trustworthy.

## Revision questions

1. Explain authentication and authorization in your own words.
2. Why must a backend check ownership when retrieving a record?
3. Why should passwords never be stored as plain text?

## Further Learning & References

- **Reference:** [MDN: HTTP authentication](https://developer.mozilla.org/en-US/docs/Web/HTTP/Authentication) explains HTTP authentication mechanisms and challenges.
- **Official standard:** [RFC 6749: OAuth 2.0](https://www.rfc-editor.org/rfc/rfc6749) specifies an authorization framework for delegated access; it is not itself a user-login protocol.
- **Third-party security guidance:** [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) offers practical recommendations for authentication design.
