# OWASP

## Introduction

OWASP, the Open Worldwide Application Security Project, is a nonprofit community creating open software security resources. Projects include risk lists, verification standards, testing guidance, and cheat sheets. OWASP provides guidance, not a product that automatically secures applications.

## Why does it exist?

Application security can feel broad. OWASP helps developers, testers, and organizations share vocabulary and identify common risks. Its materials are starting points for training, design reviews, and security requirements.

## How does it work?

OWASP projects serve different purposes. The Top 10 summarizes major web application risk categories for awareness. The Application Security Verification Standard (ASVS) offers testable requirements, while cheat sheets provide focused implementation advice. Check each resource's version and scope.

## Real-world example

A team planning a new account feature can use the Top 10 to prompt threat discussions, consult the Authentication Cheat Sheet for implementation considerations, and translate applicable ASVS requirements into review and test criteria.

## Developer perspective

Use OWASP materials to ask better questions, then adapt controls to the application's architecture and threats. A list is not a complete audit, and a passing checklist does not prove safety. Revisit assumptions when the product changes.

## Practical example

For file uploads, consider unauthorized access, unsafe handling, and resource exhaustion. Write requirements such as checking ownership, limiting size, validating formats, and storing uploads outside executable paths. Link each requirement to a test.

## Important terminology

- **OWASP Top 10:** an awareness resource describing prevalent web application risk areas.
- **ASVS:** a framework of security verification requirements.
- **Cheat sheet:** concise, topic-specific implementation guidance.
- **Risk:** a combination of potential impact and likelihood in a given context.

## Advantages and disadvantages

OWASP provides accessible, widely used references and a shared vocabulary. Lists can be misused as checkboxes, and generic guidance cannot replace threat modeling or expert review. Always select the resource appropriate to the question.

## Common misconceptions

- OWASP is not a certification that an application is safe.
- The Top 10 is not an exhaustive catalog or a step-by-step secure coding standard.
- A control copied from guidance still needs testing in its real environment.

## Further Learning & References

- **OWASP project:** [OWASP Top 10](https://owasp.org/Top10/) introduces major web application risk categories for awareness.
- **OWASP standard:** [Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/) provides structured, testable security requirements.
- **OWASP guidance:** [Cheat Sheet Series](https://cheatsheetseries.owasp.org/) offers focused defensive implementation advice across many topics.
- Continue with [Web Security Fundamentals](web-security-fundamentals.md) and [API Security](api-security.md).
