# MongoDB Atlas

Atlas is MongoDB's managed database platform. Its hierarchy includes organizations, projects, database deployments, Atlas users, and database users. Atlas users sign in to manage cloud resources; database users authenticate applications and tools to database data. These identities are separate and have separate privileges.

## Create a learning deployment

Create a project and development deployment, create a narrowly privileged database user, add the client network to the project's IP access list, then connect using the Atlas connection dialog. A database deployment is not reachable merely because it exists: network access and database authentication both need configuration.

Atlas tiers, regions, backup features, and network options vary. Review current availability and pricing before choosing a production design. Clean up test users, access-list entries, and unused deployments when finished. Store connection URIs as secrets; never commit them to source control.

Atlas provides managed infrastructure features, but application teams still own data modeling, indexes, authorization, retention, recovery objectives, cost controls, and safe query behavior. See the official [Atlas documentation](https://www.mongodb.com/docs/atlas/) and [connect guide](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/).
