# The Browser Network Panel

The Network panel records requests made by a page, including documents,
scripts, stylesheets, images, fonts, and API calls. It shows what was sent,
what came back, and how long each step took.

## Why it matters

The panel helps distinguish a frontend bug from a failed request, wrong
response, caching issue, or slow dependency. It is also useful for confirming
that a form or page is sending the data the developer intended.

## How to investigate a request

1. Open Network before reproducing the action; enable **Preserve log** if a
   navigation would otherwise clear the list.
2. Filter by request type or search for the endpoint.
3. Inspect the status, method, URL, and initiator.
4. Open **Headers** for request and response headers, **Payload** for submitted
   data, and **Response** or **Preview** for returned content.
5. Use the timing details and waterfall to locate waiting or transfer delays.
6. Retry under a throttled profile only to explore how limited connections
   affect the page; it is not a replacement for real-user measurements.

## Status and timing clues

A `2xx` status usually indicates HTTP success; a `4xx` often points to a
request or authorization problem, and a `5xx` indicates a server-side error.
These are clues, not a complete diagnosis: inspect the response body and
application behavior too. A cached response may not involve a fresh network
transfer.

## Developer perspective and terminology

An **initiator** is the script or document that caused a request. **TTFB**
(time to first byte) measures time until response data begins arriving.
**Waterfall** displays request phases over time. Compare the same action
before and after a change.

## Common misconceptions and safety

- A fast server response does not guarantee a fast page if rendering or
  client-side work is slow.
- The Network panel shows only what happened during its capture.
- HAR exports and screenshots may contain cookies, authorization headers,
  search queries, or personal data. Remove sensitive values before sharing.

## Check your understanding

1. Which request details help explain a failed API call?
2. What does an initiator tell you?
3. Why can a successful HTTP status still correspond to an application error?

## Further learning

- [Chrome DevTools: Network overview](https://developer.chrome.com/docs/devtools/network/)
- [Chrome DevTools: Network reference](https://developer.chrome.com/docs/devtools/network/reference/)
