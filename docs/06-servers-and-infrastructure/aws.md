# AWS

## Introduction

Amazon Web Services (AWS) is a cloud platform offering computing, storage, databases, networking, and many other services. Instead of purchasing and maintaining every physical machine, a team can rent resources through AWS and manage them using a console, command-line tools, or APIs.

## Why does it exist?

Organizations need infrastructure that can grow, shrink, and be provisioned faster than traditional hardware. Cloud services let teams start with modest capacity, automate routine setup, and pay for measured usage. They do not remove the need to plan, secure, or monitor infrastructure.

## How does it work?

AWS divides its global infrastructure into geographic Regions and Availability Zones. A service such as Amazon EC2 provides virtual servers; Amazon S3 stores objects; Route 53 offers DNS services. A project combines services and configures access with identity and permissions. Resources are created in a chosen Region, and costs depend on service, configuration, and usage.

## Real-world example

A small web application might run its API on EC2, save uploaded images in S3, and use Route 53 to direct its domain. A team can later add more application instances behind a load balancer. This is one possible design, not a requirement to use every AWS service.

## Developer perspective

Developers should understand which services their application depends on, which Region contains the data, and who can change or access resources. Keep infrastructure configuration repeatable, use least-privilege permissions, and review cost and backup requirements. See [servers](servers.md), [load balancing](load-balancing.md), and [CDNs](cdn.md).

## Practical example

Before deploying, write down the application, storage, and DNS needs. Choose one service for each need, set a spending alert, and test a small deployment. Avoid placing credentials in source code; use a managed identity or secret store where available.

## Important terminology

- **Cloud computing:** on-demand access to computing resources over a network.
- **Region:** a geographic AWS area.
- **Availability Zone:** an isolated location within a Region.
- **EC2 instance:** a virtual server.
- **IAM:** AWS identity and access management.

## Advantages and disadvantages

AWS offers broad service choices, automation, and global infrastructure. Its breadth can make selection and security configuration difficult, and poorly monitored usage can create unexpected bills. Cloud hosting also does not automatically make an application reliable.

## Common misconceptions

Cloud resources are not free or maintenance-free. AWS manages underlying facilities, but customers remain responsible for application behavior, data protection, access rules, and many configuration choices.

## Revision questions

1. What is the difference between a Region and an Availability Zone?
2. Name one AWS service for virtual servers and one for object storage.
3. Why should a team set spending alerts?

## Further Learning & References

- **Official AWS documentation:** [What is Amazon EC2?](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/concepts.html) introduces virtual server concepts and EC2 terminology.
- **Official AWS documentation:** [What is Amazon S3?](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html) explains object storage and buckets.
- **Third-party explainer:** [Cloudflare: What is cloud computing?](https://www.cloudflare.com/learning/cloud/what-is-the-cloud/) gives a vendor-neutral introduction to cloud concepts.
