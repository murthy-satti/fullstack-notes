# AWS

## Introduction

Amazon Web Services (AWS) is a cloud platform offering computing, storage, databases, and networking. Instead of maintaining physical machines, a team can rent resources and manage them through a console, command-line tools, or APIs.

## Why does it exist?

Organizations need infrastructure that can be provisioned and resized quickly. Cloud services let teams start small and pay for measured usage, but do not remove the need to secure and monitor infrastructure.

## How does it work?

AWS divides its infrastructure into geographic Regions and Availability Zones. Amazon EC2 provides virtual servers, S3 stores objects, and Route 53 offers DNS. Teams combine services and configure access permissions. Costs depend on service and usage.

## Real-world example

A small web application might run its API on EC2, save images in S3, and use Route 53 for its domain. More instances can later sit behind a load balancer. This is only one possible design.

## Developer perspective

Developers should understand service dependencies, data location, and who can access resources. Keep configuration repeatable, use least-privilege permissions, and review costs and backups. See [servers](servers.md), [load balancing](load-balancing.md), and [CDNs](cdn.md).

## Practical example

Before deploying, list application, storage, and DNS needs. Choose services, set a spending alert, and test a small deployment. Never place credentials in source code.

## Important terminology

- **Cloud computing:** on-demand access to computing resources over a network.
- **Region:** a geographic AWS area.
- **Availability Zone:** an isolated location within a Region.
- **EC2 instance:** a virtual server.
- **IAM:** AWS identity and access management.

## Advantages and disadvantages

AWS offers broad choices and global infrastructure. Its breadth can make selection difficult, and unmonitored usage can create unexpected bills. Cloud hosting does not automatically make an application reliable.

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
