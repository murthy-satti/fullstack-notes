# The Browser Performance Panel

The Performance panel records a timeline of browser activity. It helps
investigate slow page loads, delayed interactions, long JavaScript tasks, and
unnecessary rendering work.

## Why it matters

A page can look correct and still feel slow. A recording helps locate when
work happened and which activity occupied the main thread, rather than
relying on a guess or a single timing number.

## A careful profiling workflow

1. Choose one question, such as “Why does opening this menu feel delayed?”
2. Use a representative page and device or throttling profile.
3. Start a recording, perform the same interaction, then stop.
4. Inspect the timeline, main-thread flame chart, network activity, and
   rendering tracks.
5. Find long tasks or repeated work, then inspect the relevant source.
6. Make one change and record again under similar conditions.

The **flame chart** shows nested work over time. **Long tasks** are blocks of
main-thread work that can delay responsiveness. User Timing marks can annotate
application-specific events.

## Developer perspective

Profile realistic production-like builds as well as local development builds:
development tools may add extra work. Check more than one device class, and
pair lab recordings with real-user metrics when available. Optimize the
largest measured bottleneck rather than chasing small isolated numbers.

## Common misconceptions

- A single recording is not proof of performance for every user.
- Network delay and main-thread delay are different bottlenecks.
- Improving a synthetic score may not improve the user's actual task.

## Check your understanding

1. What does a flame chart represent?
2. How can you distinguish network waiting from main-thread work?
3. Why should you repeat a recording after a change?

## Further learning

- [Chrome DevTools: Performance overview](https://developer.chrome.com/docs/devtools/performance/)
- [web.dev: Learn performance](https://web.dev/learn/performance/)
