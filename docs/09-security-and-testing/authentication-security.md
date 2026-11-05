# Authentication Security

## Introduction

Authentication checks that a person, device, or service is the identity it claims to be. Authorization determines what that identity may do. Secure authentication protects accounts, private data, and administrative actions.

## Why does it exist?

Applications need to distinguish one user's data and actions from another's. Weak passwords, stolen sessions, and unsafe recovery flows can enable account takeover. Strong checks lower these risks without making legitimate access unnecessarily difficult.

## How does it work?

Users present authenticators such as a password, device-bound credential, or one-time code. The service verifies proof, then creates a session or token. Store passwords with a dedicated, slow hashing function and unique salt, never as plaintext or reversible encryption. Sessions need unpredictable identifiers, secure cookie settings, expiration, and revocation. Protect recovery and enrollment as carefully as sign-in.

## Real-world example

A banking service may ask for a password and a hardware-backed passkey. The password alone is not enough to complete sign-in when stronger verification is required. After success, a short-lived session cookie lets the browser make later requests without resending the password.

## Developer perspective

Choose a mature identity library or provider. Protect login and recovery against guessing, use generic failure messages where appropriate, and revoke sessions after password changes or suspected compromise. MFA reduces some takeover risks but does not make phishing impossible.

## Practical example

In a browser app, issue a session cookie with `HttpOnly`, `Secure`, and an appropriate `SameSite` value. Rotate its identifier after login or privilege changes. On logout, invalidate the session and expire the cookie. Never put session tokens in URLs.

## Important terminology

- **Authenticator:** something used to prove an identity.
- **MFA:** verification using more than one type of factor.
- **Session:** server-recognized state associated with a signed-in client.
- **Password hashing:** one-way transformation designed to protect stored password verifiers.

## Advantages and disadvantages

Passkeys and MFA reduce takeover risk, while sessions add convenience. Added steps complicate recovery, so design for usability and recovery abuse.

## Common misconceptions

- A login form is not secure just because it uses HTTPS.
- Encoding or encrypting passwords is not a substitute for password hashing.
- MFA is valuable, but does not prevent every phishing or session theft scenario.

## Revision questions

1. What is the difference between authentication and authorization?
2. Why should session IDs change after a privilege change?
3. What protections should apply to account recovery?

## Further Learning & References

- **OWASP guidance:** [Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) covers defensive implementation and verification practices.
- **Official standard:** [W3C Web Authentication (WebAuthn) Level 3](https://www.w3.org/TR/webauthn-3/) specifies browser and authenticator interactions for public-key authentication.
- Continue with [API Security](api-security.md) and [Web Security Fundamentals](web-security-fundamentals.md).
