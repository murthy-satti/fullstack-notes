# Email Deliverability: SPF, DKIM and DMARC

TaskFlow sends invitations, password resets, and "tasks due today"
reminders. Whether those messages reach the inbox depends less on the
code that sends them than on DNS records, sending reputation, and how
bounces and complaints are handled. This lesson covers why application
email lands in spam, transactional versus marketing email, choosing a
sending provider (Amazon SES, SendGrid, Postmark, Mailgun, Resend), SPF
and its 10-lookup limit, DKIM signing, DMARC alignment, policies, reports,
and a safe rollout, the 2026 update to the DMARC standard, the sender
requirements of Gmail, Yahoo, and Outlook.com, bounce and complaint
handling, and dedicated IPs and warm-up.

How mail moves between servers (SMTP, MX lookups, IMAP) is covered in
[email protocols](../../01-networking-and-protocols/email-protocols.md),
and designing a notification service with queues, retries, and provider
failover in
[the notification system case study](../../05-application-architecture/system-design/case-study-notification-system.md).

## Why it matters

A password reset that lands in spam is an outage for that user, and
support usually hears about it before monitoring does. Mailbox providers
decide where a message goes from two kinds of evidence: **authentication**
(is this message really from `example.com`?) and **reputation** (does mail
from this domain and these IPs get marked as spam, bounce, or hit spam
traps?). Since 2024 Gmail and Yahoo, and since 2025 Outlook.com, require
authentication from bulk senders and reject or junk mail that lacks it.

There is a security side too. Without SPF, DKIM, and an enforced DMARC
policy, anyone can send phishing email that claims to come from
`example.com`, and your users have no way to tell.

## Real-world usage

- **Gmail's sender guidelines.** Google's
  [Email sender guidelines](https://support.google.com/a/answer/81126)
  require every sender to personal Gmail accounts to use SPF or DKIM,
  valid forward and reverse DNS, TLS, and a spam rate below 0.3%; bulk
  senders (close to 5,000 or more messages a day to Gmail accounts) also
  need SPF and DKIM, a DMARC policy (at least `p=none`), alignment, and
  one-click unsubscribe. The
  [FAQ](https://support.google.com/a/answer/14229414) adds that bulk
  status is permanent and that from November 2025 Gmail is ramping up
  enforcement, with temporary and permanent rejections.
- **Yahoo's Sender Hub.** Yahoo's
  [sender best practices](https://senders.yahooinc.com/best-practices/)
  set the same baseline: SPF or DKIM for everyone; SPF, DKIM, and a
  passing DMARC policy of at least `p=none` for bulk senders; one-click
  unsubscribe honored within two days; and a spam rate below 0.3%.
- **Outlook.com high-volume senders.** Microsoft's
  [announcement](https://techcommunity.microsoft.com/blog/microsoftdefenderforoffice365blog/strengthening-email-ecosystem-outlook%E2%80%99s-new-requirements-for-high%E2%80%90volume-senders/4399730)
  requires domains sending more than 5,000 messages a day to Outlook.com
  consumer addresses (outlook.com, hotmail.com, live.com) to pass SPF and
  DKIM and publish DMARC of at least `p=none`, aligned with SPF or DKIM,
  from May 5, 2025. An April 2025 update dropped the planned Junk-folder
  stage: non-compliant mail is rejected with `550 5.7.515`.
- **DMARC as a proposed standard.** The original DMARC specification,
  RFC 7489, was published as an informational document in 2015. In May
  2026 the IETF published
  [RFC 9989](https://www.rfc-editor.org/info/rfc9989) ("DMARCbis") on the
  Standards Track, obsoleting RFC 7489 and RFC 9091, with aggregate and
  failure reporting split into RFC 9990 and RFC 9991.

**Popular tools and providers:** Amazon SES, SendGrid, Postmark, Mailgun,
and Resend for sending; Google Postmaster Tools, Yahoo's Sender Hub, and
Microsoft's SNDS for reputation data; DMARC report processors such as the
open-source parsedmarc or a hosted service; and DNSControl's
`SPF_BUILDER` for managing SPF records in code.

## How it works

### Why application email lands in spam

| Signal | What receivers look at | What you control |
|---|---|---|
| Authentication | SPF, DKIM, DMARC results and alignment with the visible `From` | DNS records and provider configuration |
| Domain and IP reputation | Spam complaints, bounces, spam traps, history of the domain and IPs | List quality, consent, volume patterns, shared or dedicated IPs |
| Engagement | Opens, replies, deletions without reading, "not spam" clicks | Sending only mail people asked for and want |
| Infrastructure | Reverse DNS, TLS, standards-compliant messages | Mostly the provider's job |
| Content | Links, formatting, misleading subjects | Honest, plain templates |

Authentication is the entry ticket; reputation decides the folder.
Google asks senders to keep the spam rate reported in Postmaster Tools
below 0.1% and never to reach 0.3%.

### Transactional and marketing email

| | Transactional | Marketing (broadcast) |
|---|---|---|
| Examples | Password reset, invitation, receipt, security alert | Newsletter, product announcement, promotion |
| Trigger | One user's action | A campaign to many people |
| Expectation | Must arrive within seconds | Can wait; must respect consent |
| Unsubscribe | Not for security mail; offer it for optional notifications | Required, including one-click for bulk senders |
| Risk | Low complaint rate when done right | Higher complaint rate |

Keep the two apart so a campaign's complaints cannot sink password
resets: send marketing from its own subdomain (for example
`news.example.com`) and its own provider stream or IP pool. Postmark,
for example, runs transactional and broadcast message streams on
separate infrastructure. Note that Gmail counts mail from subdomains
toward the primary domain when deciding whether you are a bulk sender.

### Choosing a sending provider

| Provider | DNS you add | Notable details |
|---|---|---|
| Amazon SES | Three Easy DKIM CNAMEs (2048-bit keys by default); a custom MAIL FROM subdomain with an MX to `feedback-smtp.<region>.amazonses.com` and SPF `include:amazonses.com` | New accounts start in a sandbox (verified recipients only, 200 messages a day, 1 per second); account-level suppression list on by default; review at 5% bounces or 0.1% complaints, possible pause at 10% or 0.5% |
| SendGrid | Domain authentication with automated security: CNAMEs `em<number>`, `s1._domainkey`, `s2._domainkey`, plus link-branding CNAMEs | SendGrid updates the SPF and DKIM targets behind the CNAMEs for you |
| Postmark | A DKIM TXT record; a custom Return-Path CNAME such as `pm-bounces` pointing to `pm.mtasv.net` | Separate transactional and broadcast streams on separate IP pools |
| Mailgun | A sending subdomain such as `mg.example.com` with SPF `include:mailgun.org`, a DKIM TXT key, and an optional tracking CNAME | Mailgun recommends a subdomain rather than the root domain |
| Resend | DKIM and SPF records (TXT and MX or CNAME) generated per domain; Return-Path defaults to `send.<your domain>` | Recommends sending from subdomains; do not proxy its CNAMEs through Cloudflare |

Whichever you choose, the pattern is the same: prove the domain with
DKIM, give the provider a bounce (Return-Path) subdomain so SPF aligns,
and publish DMARC yourself.

### The three identities in every message

![Diagram: a sequence of one TaskFlow email. TaskFlow API asks the sending service to send a reminder from reminders@example.com. The sending service signs it with DKIM using d=example.com and selector s1, and sends it from 198.51.100.25 with the envelope MAIL FROM bounce@bounce.example.com. The receiving mail server, for example Gmail, makes three DNS lookups: the SPF record of bounce.example.com, which lists the sending service, so SPF passes; the DKIM public key at s1._domainkey.example.com, which verifies the signature, so DKIM passes; and the DMARC policy at _dmarc.example.com. It then checks alignment: both bounce.example.com and the DKIM domain example.com belong to the same organizational domain as the visible From address, example.com, so DMARC passes and the message goes to the inbox. Had both failed or not aligned, the published policy would decide: none delivers, quarantine sends to spam, reject refuses it. Once a day the receiver sends an aggregate report to the address in the rua tag.](email-authentication-flow.svg)

- **Header `From`** (`reminders@example.com`): what the user sees. DMARC
  protects this domain.
- **Envelope `MAIL FROM`** (the Return-Path, `bounce@bounce.example.com`):
  where bounces go. **SPF** checks this domain, not the header `From`.
- **DKIM signing domain** (`d=example.com` in the `DKIM-Signature`
  header): the domain whose key signed the message.

### SPF: which servers may send

An SPF record is a TXT record on the envelope sender's domain:

```text
bounce.example.com.  TXT  "v=spf1 include:amazonses.com ~all"
example.com.         TXT  "v=spf1 include:_spf.mail.example.net -all"
```

- Mechanisms are checked left to right: `ip4:` and `ip6:` ranges,
  `include:` another domain's SPF, `a` and `mx` (the domain's own hosts),
  and `all` at the end. The qualifier on `all` decides the default:
  `-all` fails anything not listed, `~all` soft-fails it.
- One SPF record per name. Two records make every check a permanent
  error.
- SPF breaks when mail is forwarded, because the forwarder's IP is not in
  your record. DKIM survives forwarding, which is why DMARC accepts
  either.

**The 10-lookup limit.** RFC 7208 caps the DNS lookups an SPF check may
trigger at 10. The `include`, `a`, `mx`, `ptr`, and `exists` mechanisms
and the `redirect` modifier each count, *including those inside included
records*; `ip4`, `ip6`, and `all` do not. Going over the limit is a
`permerror`, so SPF fails for every message, not just the last sender.
RFC 7208 also asks receivers to allow at most two "void" lookups (names
that return nothing).

![Diagram: counting SPF lookups for a domain with ten slots. The record v=spf1 a mx include:_spf.mail.example.net include:_spf.support.example.net include:_spf.crm.example.net -all uses one lookup for a, one for mx, four for the mail provider's include (one plus three nested includes), three for the support desk (one plus two nested), and two for the CRM (one plus one nested): eleven lookups, one over the limit, so every SPF check returns permerror. The fix removes a and mx, which the domain does not send from, saving two, and moves the CRM to its own subdomain crm.example.com with its own SPF record and its own budget of ten, leaving seven lookups at example.com.](spf-lookup-budget.svg)

Ways to stay under the limit: remove mechanisms for hosts that do not
send mail (`a`, `mx`), never use `ptr`, give each third-party sender its
own subdomain (each name has its own budget of 10), and use the custom
MAIL FROM or Return-Path subdomain your provider offers. Flattening
includes into IP ranges works but breaks silently when the provider
changes its IPs; DNSControl's documentation recommends flattening only
when it is the only way under 10.

### DKIM: a signature from your domain

The provider signs selected headers and a hash of the body with a
private key and adds a header such as:

```text
DKIM-Signature: v=1; a=rsa-sha256; d=example.com; s=s1; c=relaxed/relaxed;
        h=from:to:subject:date:message-id:list-unsubscribe:list-unsubscribe-post;
        bh=<body-hash>; b=<signature>
```

The receiver fetches the public key from `s1._domainkey.example.com`:

```text
s1._domainkey.example.com.  TXT  "v=DKIM1; k=rsa; p=MIIBIjANBgkq...truncated...IDAQAB"
```

- **Key size:** RFC 8301 requires at least 1024-bit RSA keys and
  recommends 2048; `rsa-sha1` must no longer be used. SES Easy DKIM uses
  2048-bit keys by default.
- **Selectors** (`s=`) let several keys coexist, which is how keys are
  rotated: publish a new selector, switch signing to it, and remove the
  old key after mail in transit has been delivered. When the provider
  gives you CNAMEs for the selectors (SES, SendGrid), it can rotate keys
  without you touching DNS.
- **What breaks DKIM:** anything that changes signed headers or the body,
  such as mailing lists that add footers. ARC (RFC 8617) lets such
  intermediaries vouch for the original results.

### DMARC: alignment, policy, and reports

DMARC is a TXT record at `_dmarc.<domain>`:

```text
_dmarc.example.com.  TXT  "v=DMARC1; p=quarantine; sp=quarantine; adkim=r; aspf=r; rua=mailto:dmarc-reports@example.com"
```

A message passes DMARC when SPF **or** DKIM passes **and** the passing
domain aligns with the header `From` domain.

![Diagram: alignment checks for mail with the visible From address reminders@example.com. Case 1: envelope MAIL FROM bounce.example.com with SPF pass, DKIM d=example.com with pass: under relaxed alignment both align, because they share the organizational domain example.com; under strict alignment only DKIM aligns, because bounce.example.com is not exactly example.com; DMARC passes either way. Case 2: the provider's default MAIL FROM amazonses.com with SPF pass, and DKIM d=provider.example.net with pass: neither domain belongs to example.com, so nothing aligns and DMARC fails although both checks passed. Case 3: a forwarded message where SPF fails at the forwarder but DKIM d=example.com still passes: DMARC passes through DKIM.](dmarc-alignment.svg)

| Tag | Meaning |
|---|---|
| `p` | Policy for the domain: `none` (monitor), `quarantine` (treat as suspicious, usually the spam folder), `reject` |
| `sp` | Policy for existing subdomains (defaults to `p`) |
| `np` | Policy for subdomains that do not exist (from RFC 9091, now part of RFC 9989) |
| `adkim`, `aspf` | Alignment mode: `r` relaxed (same organizational domain, the default) or `s` strict (exact match) |
| `rua` | Where to send daily aggregate reports |
| `ruf` | Where to send per-message failure reports (few receivers send them) |
| `t` | Test mode in RFC 9989: `t=y` asks receivers to apply the next weaker policy |

**Reports** are what make DMARC safe to enforce. Aggregate reports are
XML files, usually daily, listing every IP that sent mail as your domain
with counts and SPF and DKIM results. They reveal the CRM, the support
desk, and the forgotten script that send as `example.com`. If `rua`
points at another domain (a reporting service), that domain must
publish a record authorizing it, which hosted services set up for you.

**What changed in RFC 9989.** The `pct` tag (apply the policy to a
percentage of mail) was removed because receivers rarely applied it
accurately except at 0 and 100; `t=y` replaces its main use. The `rf`
and `ri` tags were removed, `np` and `psd` were added, and receivers now
find the organizational domain with a DNS tree walk instead of the Public
Suffix List. It also makes explicit (Section 7.4) that domains whose
users might post to mailing lists should not publish `p=reject`; any
such domain that still wants it should first run `p=none`, then
`p=quarantine`, for at least a month each. Receivers ignore tags they
do not know, so existing records keep parsing, but receivers that
still implement RFC 7489 ignore `t`, so treat every step to a stricter
`p` as real.

### Rolling DMARC out safely

![Diagram: a DMARC rollout over several months. Stage 1, weeks 0 to 4: publish p=none with a rua address, collect aggregate reports, and inventory every service that sends as example.com. Stage 2: fix each legitimate sender, adding DKIM with d=example.com or a custom return path so SPF aligns, or moving it to its own subdomain. Stage 3: publish p=quarantine with t=y as a test, then p=quarantine, watching reports for legitimate mail that fails. Stage 4: publish p=reject with t=y, then p=reject, with sp and np for subdomains. Reports keep arriving and are monitored for good. Each step forward happens only when reports show all legitimate mail aligned; any new failing source sends you back to fixing it.](dmarc-rollout-timeline.svg)

1. Publish `p=none` with `rua` and collect reports for a few weeks.
2. For each legitimate source, make it align: DKIM with `d=example.com`
   (or the subdomain it sends from) and a custom Return-Path where
   possible. Move hard-to-fix senders to their own subdomain.
3. Move to `p=quarantine` (optionally first with `t=y`), and watch.
4. Move to `p=reject` (optionally first with `t=y`), and set `sp` and
   `np` deliberately.
5. Keep reading reports; a new SaaS tool sending as your domain shows up
   there first.

Domains that never send mail should go straight to `p=reject` together
with a null MX and `v=spf1 -all`, as shown in
[domains and DNS records](domains-and-dns-records.md).

### What Gmail, Yahoo, and Outlook.com require

| Requirement | Gmail (personal accounts) | Yahoo | Outlook.com (consumer) |
|---|---|---|---|
| Who is covered | All senders; extra rules for bulk senders (close to 5,000+ messages a day, status permanent) | All senders; extra rules for bulk senders | Domains sending more than 5,000 messages a day |
| SPF and DKIM | All: SPF or DKIM. Bulk: both | All: SPF or DKIM. Bulk: both | SPF must pass and DKIM must pass |
| DMARC | Bulk: published (`p=none` allowed), with alignment | Bulk: at least `p=none`, must pass; relaxed alignment is fine | At least `p=none`, aligned with SPF or DKIM |
| Unsubscribe | Bulk marketing and subscribed mail: one-click (RFC 8058) plus a visible link; honor within 48 hours | Bulk: one-click (`POST` highly recommended, `mailto` accepted) plus a visible link; honor within 2 days | A clear, working unsubscribe is recommended |
| Spam rate | Below 0.3%, aim below 0.1% | Below 0.3% | Not stated as a number |
| Other | Valid forward and reverse DNS, TLS, RFC 5322 format | Valid forward and reverse DNS, RFC 5321 and 5322 | Valid, reply-capable From or Reply-To |
| Enforcement | Since February 2024; ramping up from November 2025 with rejections | Since February 2024 | Since May 5, 2025: rejected with `550 5.7.515` |

These rules do not apply to mail sent to Google Workspace business
accounts, but meeting them everywhere is simpler than tracking
exceptions.

### Bounces, complaints, and suppression lists

| Event | Meaning | Action |
|---|---|---|
| Hard bounce | Permanent failure, such as an address that does not exist | Stop sending to the address immediately |
| Soft bounce | Temporary failure, such as a full mailbox | Retry; suppress after repeated failures |
| Complaint | The recipient marked the message as spam (reported through a feedback loop) | Stop sending that kind of mail to them immediately |
| Unsubscribe | The recipient opted out of a category | Stop that category; keep security mail |

Providers keep their own suppression lists (SES's account-level list
holds addresses that hard-bounced or complained until you remove them),
but keep yours too, per message category, so it survives a provider
change. Two details matter. SES places an account under review at a 5%
bounce rate or a 0.1% complaint rate, and recommends staying below 2%
bounces. And Gmail does not send complaint data to SES, so for Gmail
users your signals are the spam rate in Postmaster Tools and the
unsubscribes you receive, which is one more reason to offer one-click
unsubscribe on optional mail.

### Shared and dedicated IPs, and warm-up

Providers send most customers' mail from shared IP pools whose
reputation they manage. A dedicated IP gives you your own reputation,
good or bad, and needs steady volume: SES advises sending around 1,000
emails a day to each mailbox provider you want to keep a good reputation
with. New IPs have no history, so they must be **warmed up**: volume
rises gradually over weeks (SES's automatic warm-up for standard
dedicated IPs takes 45 days, and mailbox providers need roughly two to
six weeks), starting with the most engaged recipients. Choose dedicated
IPs only for high, steady volume; for most applications a reputable
shared pool plus good domain reputation is the better choice.

## When to use and when not to use

| Situation | Recommended setup |
|---|---|
| Password resets and invitations for TaskFlow | A transactional provider (Postmark, SES, Resend, SendGrid, or Mailgun) on a shared pool, DKIM with `d=example.com`, a custom Return-Path, DMARC |
| Optional reminders and digests | The transactional setup plus `List-Unsubscribe` and `List-Unsubscribe-Post` headers and per-category preferences |
| Newsletters and announcements | A separate subdomain and broadcast stream, explicit consent, one-click unsubscribe |
| High, steady volume | Dedicated IPs with warm-up and monitoring per mailbox provider |
| Third-party tools sending as you (CRM, help desk) | Their custom DKIM for your domain, or their own subdomain |
| Domains that send no mail | Null MX, `v=spf1 -all`, DMARC `p=reject` |

Do not:

- Send marketing through the transactional stream or IPs.
- Buy, rent, or scrape lists; spam traps and complaints follow.
- Send from a `no-reply` address that bounces replies; Microsoft asks
  for a valid, reply-capable From or Reply-To.
- Jump to `p=reject` before reports show every legitimate sender aligned.

## Practical examples

### TaskFlow's email DNS records

```text
; Inbound mail (a hosted mailbox provider)
example.com.                    MX     10 mx1.mail.example.net.
example.com.                    MX     20 mx2.mail.example.net.
; Only the mailbox provider sends directly as @example.com
example.com.                    TXT    "v=spf1 include:_spf.mail.example.net -all"

; Transactional mail through Amazon SES, From: reminders@example.com
; Easy DKIM: three CNAMEs; copy the exact names and targets from the SES console
<token1>._domainkey.example.com. CNAME  <token1>.dkim.amazonses.com.
<token2>._domainkey.example.com. CNAME  <token2>.dkim.amazonses.com.
<token3>._domainkey.example.com. CNAME  <token3>.dkim.amazonses.com.
; Custom MAIL FROM, so SPF aligns with example.com
bounce.example.com.             MX     10 feedback-smtp.us-east-1.amazonses.com.
bounce.example.com.             TXT    "v=spf1 include:amazonses.com ~all"

; Newsletters from a separate subdomain and provider
news.example.com.               TXT    "v=spf1 include:_spf.news-provider.example.net -all"
nl1._domainkey.news.example.com. TXT   "v=DKIM1; k=rsa; p=MIIBIjANBgkq...truncated...IDAQAB"

; One DMARC policy for the domain and its subdomains
_dmarc.example.com.             TXT    "v=DMARC1; p=quarantine; sp=quarantine; np=reject; rua=mailto:dmarc-reports@example.com"
```

- SES's MAIL FROM subdomain must be used only for that purpose (not for
  sending from or receiving mail) and must have exactly one MX record.
- `news.example.com` has its own SPF budget and its own reputation, and
  the `_dmarc` record at `example.com` covers it through `sp`.
- `np=reject` tells receivers to reject mail from subdomains that do not
  exist, which phishers like to invent; receivers that only implement
  RFC 7489 ignore it.

### Sending through SES with unsubscribe headers (Node.js)

```js
// src/email/send-reminder.js: send a "tasks due today" email via Amazon SES (API v2)
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { isSuppressed } from "./suppressions.js";
import { renderReminder } from "./templates.js";

const ses = new SESv2Client({ region: process.env.AWS_REGION });

export async function sendReminder({ to, tasks, unsubscribeUrl }) {
  if (await isSuppressed(to, "reminders")) return null; // bounced, complained, or opted out

  const { subject, text, html } = renderReminder(tasks, unsubscribeUrl);
  const result = await ses.send(new SendEmailCommand({
    FromEmailAddress: "TaskFlow <reminders@example.com>",
    ReplyToAddresses: ["support@example.com"],
    Destination: { ToAddresses: [to] },
    ConfigurationSetName: "taskflow-transactional", // publishes bounce and complaint events
    Content: {
      Simple: {
        Subject: { Data: subject },
        Body: { Text: { Data: text }, Html: { Data: html } },
        Headers: [
          { Name: "List-Unsubscribe", Value: `<${unsubscribeUrl}>` },
          { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
        ],
      },
    },
  }));
  return result.MessageId; // store it to match later bounce and complaint events
}
```

- The unsubscribe headers go on optional mail such as reminders, never on
  password resets or security alerts.
- RFC 8058 requires both headers to be covered by the DKIM signature, and
  receivers should not offer one-click unsubscribe otherwise. Check the
  `h=` list in the `DKIM-Signature` of a delivered message to confirm
  your provider signs them.
- Run sends from a background job with retries rather than inside the
  HTTP request, as described in
  [background jobs and scheduling](../../03-backend-development/backend-concepts/background-jobs-and-scheduling.md).

### The one-click unsubscribe endpoint (Express)

```js
// src/routes/unsubscribe.js: RFC 8058 one-click unsubscribe plus a page for humans
import express from "express";
import { verifyUnsubscribeToken } from "../email/tokens.js";
import { Preferences } from "../models/preferences.js";

export const router = express.Router();
const CATEGORIES = new Map([["reminders", "task reminders"], ["digests", "weekly digests"]]);

async function optOut(req) {
  const { category } = req.params;
  if (!CATEGORIES.has(category)) return false; // never use raw input as a field name
  const userId = verifyUnsubscribeToken(req.query.t, category); // signed, expiring token
  if (!userId) return false;
  await Preferences.updateOne(
    { userId },
    { $set: { [`email.${category}`]: false } },
    { upsert: true },
  );
  return true;
}

// Mail clients POST the body "List-Unsubscribe=One-Click" with no cookies or login
router.post("/unsubscribe/:category", async (req, res) => {
  res.status((await optOut(req)) ? 200 : 400).end(); // no redirect: RFC 8058 forbids one
});

// The visible link in the email body opens a confirmation page instead
router.get("/unsubscribe/:category", (req, res) => {
  const label = CATEGORIES.get(req.params.category);
  if (!label) return res.status(404).end();
  res.send(`<form method="post"><button>Unsubscribe from ${label}</button></form>`);
});
```

The token in the URL identifies the user and category, because the
request carries no cookies or authentication. Categories come from an
allowlist, so URL input is never echoed into HTML or used as a database
field name. The `GET` route does not unsubscribe by itself: link scanners
and prefetchers follow links in emails, and must not opt users out. The
form has no `action`, so it posts back to the same URL, token included.

### Handling SES bounce and complaint events (Lambda)

```js
// src/email/ses-events.js: SES events delivered through SNS to a Lambda function
import { Suppressions } from "../models/suppressions.js";

export async function handler(event) {
  for (const record of event.Records) {
    const msg = JSON.parse(record.Sns.Message);
    const type = msg.eventType ?? msg.notificationType; // configuration set events vs identity notifications

    if (type === "Bounce" && msg.bounce.bounceType === "Permanent") {
      for (const r of msg.bounce.bouncedRecipients) {
        await suppress(r.emailAddress, "hard-bounce", msg.mail.messageId);
      }
    } else if (type === "Complaint") {
      for (const r of msg.complaint.complainedRecipients) {
        await suppress(r.emailAddress, "complaint", msg.mail.messageId);
      }
    }
    // Transient bounces are retried by SES; count them and suppress after repeats
  }
}

async function suppress(email, reason, messageId) {
  await Suppressions.updateOne(
    { email: email.toLowerCase() },
    { $setOnInsert: { reason, messageId, createdAt: new Date() } },
    { upsert: true },
  );
}
```

SES reports `bounceType` as `Permanent`, `Transient`, or `Undetermined`.
Many mailbox providers redact who complained, so `complainedRecipients`
lists every recipient of that message on the complaining domain; for
one-recipient transactional mail that is exactly the person.

### Reading the verdict on a received message

```text
; Example header added by a receiving server
Authentication-Results: mx.receiver.example.org;
       dkim=pass header.i=@example.com header.s=s1;
       spf=pass smtp.mailfrom=bounce.example.com;
       dmarc=pass (p=QUARANTINE sp=QUARANTINE) header.from=example.com
```

Send a test message to a mailbox you control and open the raw headers:
all three should pass, and the domains after `header.i`,
`smtp.mailfrom`, and `header.from` should share `example.com`.

### Reading an aggregate report

```text
; Excerpt of a DMARC aggregate report (XML), one record
<record>
  <row>
    <source_ip>203.0.113.77</source_ip>
    <count>1250</count>
    <policy_evaluated><disposition>none</disposition><dkim>fail</dkim><spf>fail</spf></policy_evaluated>
  </row>
  <identifiers><header_from>example.com</header_from></identifiers>
  <auth_results>
    <dkim><domain>crm.example.net</domain><result>pass</result></dkim>
    <spf><domain>crm.example.net</domain><result>pass</result></spf>
  </auth_results>
</record>
```

1,250 messages claiming to be from `example.com` came from a CRM: SPF
and DKIM passed for the CRM's own domain, but neither aligned, so DMARC
failed (`disposition` is `none` only because the policy was still
`p=none`). Enabling the CRM's custom DKIM for `example.com`, or moving it
to `crm.example.com`, fixes it before enforcement.

## Best practices

- Authenticate everything: DKIM with your domain, a custom Return-Path
  for SPF alignment, and DMARC with `rua` reporting.
- Roll DMARC out from `none` to `reject` on evidence from reports, and
  give non-sending domains `p=reject` from day one.
- Separate transactional and marketing mail by subdomain and stream.
- Keep each name's SPF under 10 lookups; prefer subdomains to
  flattening.
- Use 2048-bit DKIM keys and rotate them through selectors.
- Add one-click unsubscribe to optional mail and honor it within two
  days.
- Suppress hard bounces and complaints immediately, in your own store as
  well as the provider's.
- Watch Postmaster Tools, your provider's reputation metrics, and DMARC
  reports; alert on bounce and complaint rates.
- Use dedicated IPs only with steady volume and a warm-up plan.

## In production

- **Password resets go to spam at Gmail only.**
  *Detect:* raw headers show `dmarc=fail` or `spf=pass` with
  `smtp.mailfrom` on the provider's domain; Postmaster Tools shows a
  rising spam rate. *Cause:* no alignment (default provider Return-Path
  and DKIM signed with the provider's domain), or a marketing stream
  sharing the domain and IPs. *Fix:* custom DKIM and Return-Path for
  `example.com`, separate marketing onto its own subdomain and stream.
- **Every message fails SPF after a new tool was added.**
  *Detect:* reports and headers show `spf=permerror`. *Cause:* the new
  `include` pushed the record past 10 lookups, or a second SPF record was
  created. *Fix:* merge into one record, remove unused mechanisms, and
  move the tool to its own subdomain.
- **Mail to Outlook.com addresses bounces with `550 5.7.515`.**
  *Detect:* bounce events carry that code for hotmail.com and outlook.com
  recipients. *Cause:* the domain sends more than 5,000 messages a day and
  fails SPF, DKIM, or aligned DMARC. *Fix:* make both SPF and DKIM pass
  and publish an aligned DMARC record.
- **The provider pauses sending.**
  *Detect:* an account review or pause notice; SES's `Reputation.BounceRate`
  above 5%. *Cause:* sending to stale or imported addresses, or ignoring
  bounce events. *Fix:* suppress bounces automatically, confirm addresses
  with double opt-in, and stop sending to inactive recipients.
- **Legitimate mail is rejected right after moving to `p=reject`.**
  *Detect:* complaints from a team whose tool's mail vanished; reports
  show a source with failing alignment. *Cause:* a sender that was never
  fixed during the `p=none` phase. *Fix:* step back to `quarantine`, fix
  the sender, and only advance when reports are clean.
- **Email stops entirely after a DNS migration.**
  *Detect:* DKIM `fail (no key)` or missing SPF in headers. *Cause:* DKIM
  selectors, SPF, or the MAIL FROM MX were not copied to the new DNS
  provider. *Fix:* restore them; include underscore names in every zone
  inventory (see [DNS migrations and troubleshooting](dns-migrations-and-troubleshooting.md)).

## Important terminology

- **Header From:** The address the recipient sees; DMARC protects its
  domain.
- **Envelope MAIL FROM (Return-Path):** The bounce address used in SMTP;
  SPF checks its domain.
- **SPF:** A TXT record listing which servers may send for a domain.
- **DKIM:** A signature over headers and body, verified with a public key
  published under a selector.
- **Selector:** The label (`s=`) that tells receivers which DKIM key to
  fetch.
- **DMARC:** A policy that requires SPF or DKIM to pass and align with
  the header From domain, plus reporting.
- **Alignment:** The authenticated domain matching the From domain,
  exactly (strict) or by organizational domain (relaxed).
- **Aggregate report (rua):** Daily XML summaries of authentication
  results per sending IP.
- **One-click unsubscribe:** RFC 8058's `List-Unsubscribe-Post` mechanism
  that lets mail clients unsubscribe with one `POST`.
- **Hard and soft bounce:** Permanent and temporary delivery failures.
- **Feedback loop:** A mailbox provider's channel for reporting spam
  complaints to the sender.
- **IP warm-up:** Gradually increasing volume on a new IP to build
  reputation.

## Common mistakes and misconceptions

- Believing SPF protects the visible From address; it checks the
  envelope sender, and only DMARC ties authentication to the From.
- Publishing two SPF records, or one with more than 10 lookups.
- Letting providers sign with their own domain, so DKIM passes but
  DMARC fails.
- Jumping to `p=reject` without reading aggregate reports.
- Sending newsletters and password resets from the same stream.
- Treating "accepted by the provider" as "delivered to the inbox".
- Unsubscribing users on `GET` requests that link scanners trigger.
- Assuming a dedicated IP improves deliverability by itself.

## Revision questions

1. Name the three domains involved in authenticating one message and
   which check uses each.
2. Why can a message pass both SPF and DKIM and still fail DMARC?
3. Count the lookups in `v=spf1 a mx include:x.example.net -all` if
   `x.example.net` includes two more records, one of which includes one
   more. Is it under the limit? (a 1, mx 1, x 1, its two includes 2, the
   nested one 1: 6 lookups, under 10.)
4. Describe a safe DMARC rollout from `p=none` to `p=reject`, and what
   evidence allows each step.
5. What did RFC 9989 change compared with RFC 7489, and what replaces
   `pct`?
6. Which headers does RFC 8058 require, and why must the `GET` handler
   for an unsubscribe link not unsubscribe by itself?
7. TaskFlow sends 8,000 reminders a day to Gmail users. Which Gmail
   requirements apply, and how long does that status last?
8. When is a dedicated IP worth it, and how would you warm one up?

## Further learning

- [RFC 7208: Sender Policy Framework (SPF)](https://www.rfc-editor.org/rfc/rfc7208)
- [RFC 6376: DomainKeys Identified Mail (DKIM) Signatures](https://www.rfc-editor.org/rfc/rfc6376)
- [RFC 9989: Domain-Based Message Authentication, Reporting, and Conformance (DMARC)](https://www.rfc-editor.org/rfc/rfc9989)
- [RFC 8058: Signaling One-Click Functionality for List Email Headers](https://www.rfc-editor.org/rfc/rfc8058)
- [Google: Postmaster Tools dashboards](https://support.google.com/a/answer/14668346)
- [Amazon SES: Authenticating email with DKIM](https://docs.aws.amazon.com/ses/latest/dg/send-email-authentication-dkim.html)
- [Amazon SES: Using a custom MAIL FROM domain](https://docs.aws.amazon.com/ses/latest/dg/mail-from.html)
- [Postmark: Message streams](https://postmarkapp.com/message-streams)
- Next: [domains, DNS and email interview questions and answers](interview-questions-and-answers.md). Back to the [domains, DNS and email overview](../domains-dns-and-email.md).
