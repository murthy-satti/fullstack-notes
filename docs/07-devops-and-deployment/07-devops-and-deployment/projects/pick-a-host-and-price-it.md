# Pick a Host and Price It

Write down what TaskFlow actually needs, estimate three hosting setups at
three traffic levels with the providers' official calculators, deploy the
two cheapest, and compare deploy time, cold starts, and the real bill after
a month. Budget alerts are in place before anything is created.

## Why this project helps

- Builds the judgment to choose where software runs: static hosts,
  container platforms, managed databases, all-in-one platforms, and plain
  virtual servers.
- Improves **cost control**: you learn what drives a bill (compute hours,
  data transfer, database size, requests) and catch surprises early.
- Improves **decision quality**: choices are backed by requirements and
  measurements instead of habit.
- "Which host would you pick and why?" is a common design and interview
  question; you will have numbers of your own.

## What you need

- Accounts with the providers you compare, each with a budget alert set up
  first (for example AWS Budgets, or the budget tools in Google Cloud and
  Azure).
- The AWS Pricing Calculator, Google Cloud Pricing Calculator, Azure Pricing
  Calculator, or the pricing pages of the platforms you choose.
- The image from [Production Image](production-image.md) and TaskFlow Web.

## How to do it

1. List the requirements: expected traffic, data size, regions, compliance,
   and how much operations work you can take on; see
   [choosing where to run software](../hosting-and-platforms/choosing-where-to-run-software.md).
2. Pick three setups, for example a static host plus a container platform
   plus a managed database, an all-in-one platform, and one virtual server.
3. Model each at 10,000, 1 million, and 50 million monthly page views with
   the official calculators, writing down your assumptions.
4. Compare which setup is cheapest at each level and why; costs usually
   cross over as traffic grows. Use
   [cost optimization and cloud bills](../hosting-and-platforms/cost-optimization-and-cloud-bills.md).
5. Set budget alerts on every account before creating any resource.
6. Deploy the two cheapest setups, following
   [hosting websites and frontends](../hosting-and-platforms/hosting-websites-and-frontends.md)
   and [running backend servers and APIs](../hosting-and-platforms/running-backend-servers-and-apis.md).
7. Measure deploy time, cold start latency, and response times with the same
   test on both.
8. After a month, compare the real bills with your estimates and explain the
   differences.

## Done when

- A one-page requirements list exists.
- A table shows all three setups at all three traffic levels, with
  assumptions.
- Budget alerts exist on every account and one test alert has fired.
- Both deployed setups serve TaskFlow, with measured deploy time and cold
  starts.
- You can say which setup you would choose at each traffic level and why.

## Stretch goals

- Price the database separately with
  [managed databases](../hosting-and-platforms/managed-databases.md) and
  compare it with self-hosting MongoDB.
- Estimate storage and transfer costs for uploads with
  [object and file storage](../hosting-and-platforms/object-and-file-storage.md).

## Lessons to use

- [Hosting and Cloud Platforms](../hosting-and-platforms.md)
- [AWS](../../../06-servers-and-infrastructure/aws.md)

Back to [all projects](../projects.md).
