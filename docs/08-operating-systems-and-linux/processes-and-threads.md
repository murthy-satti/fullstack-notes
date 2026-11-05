# Processes and Threads

## Introduction

A process is a running program with execution state and resources. A thread
is an execution path within a process. The OS schedules many tasks across
available processor cores.

## Why does it exist?

Processes isolate programs. Threads let one program perform activities such
as handling input while working in the background. The OS creates and
schedules them.

## How does it work?

A process has an address space and resources such as open files. Threads
typically share memory but have their own execution state and stack.
Uncoordinated access to shared data can cause race conditions.

The scheduler selects runnable work; switching has a cost, and busy tasks
compete for CPU time. Linux tasks have identifiers and states.

## Real-world example

A web server may use processes or threads for multiple clients. Shared state
must be managed carefully when using threads.

## Developer perspective

Threads share data but require synchronization. Processes offer more
isolation but need communication mechanisms. Consider failures and cleanup,
not only speed.

## Practical example

On Linux, `ps -ef` lists processes and `ps -eLf` includes threads. They
inspect state; output varies by system. Exit live `top` with `q`.

## Important terminology

- **PID:** process identifier.
- **Thread:** scheduled execution path within a process.
- **Scheduler:** OS component choosing runnable work.
- **Race condition:** outcome depends on timing of concurrent operations.

## Advantages and disadvantages

Concurrency can improve responsiveness, but races, deadlocks, and
oversubscription make programs harder to test.

## Common misconceptions

- A process is a running instance, threads sharing a process are not isolated,
  and adding threads does not guarantee speed.

## Revision questions

1. Which resources are commonly shared by threads in one process?
2. What is a race condition?
3. When might a separate process be preferable to another thread?

## Further Learning & References

- **Official documentation — Linux man-pages project:** [clone(2)](https://man7.org/linux/man-pages/man2/clone.2.html)
  documents the Linux interface used to create tasks with selected sharing
  behavior.
- **Third-party explanation — Wikipedia:** [Process
  (computing)](https://en.wikipedia.org/wiki/Process_%28computing%29) describes
  processes and their relationship to programs and threads.
