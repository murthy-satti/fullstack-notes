# Authentication and Authorization

Authentication establishes who a user or service is. Authorization determines its permitted database actions. Atlas console users and database users are different identities: a person who can manage a project does not automatically need application data privileges.

Enable access control on self-managed deployments. Give applications the narrowest role and database scope that supports their work. Built-in roles cover common tasks; custom roles can grant a specific action set. Avoid application use of root or cluster-wide administrator roles.

Use strong, unique credentials or supported enterprise identity integrations. Rotate credentials, remove stale accounts, audit privilege changes, and keep secrets out of source control and client bundles. Authentication does not replace TLS, IP restrictions, or safe application query construction.

See [authorization](https://www.mongodb.com/docs/manual/core/authorization/), [built-in roles](https://www.mongodb.com/docs/manual/reference/built-in-roles/), and [Atlas database users](https://www.mongodb.com/docs/atlas/security-add-mongodb-users/).
