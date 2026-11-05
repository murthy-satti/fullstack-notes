# Concurrency

## Introduction

Concurrency makes progress on multiple tasks during overlapping periods. Parallelism executes tasks at the same instant on different processing units. Rust supports both and prevents many data races in safe code.

## Why does it exist?

Applications need to handle network requests, background work, or independent calculations without blocking. Concurrency can improve responsiveness and use processor cores, but introduces coordination challenges.

## How does it work?

Rust threads may communicate through channels or shared state. Start one with `std::thread::spawn`; moving owned data transfers it safely. Channels send values without shared mutable access. Shared state can use `Mutex<T>` and `Arc<T>`: a mutex allows one holder at a time, while `Arc` shares ownership but does not itself make mutation safe.

## Real-world example

A command-line tool can download files on worker threads and send results to a coordinator, which reports progress and handles errors.

## Developer perspective

Prefer message passing or ownership transfer when practical. Shared mutable state requires careful locking and can lead to deadlocks, contention, or difficult-to-reproduce bugs. Choose the simplest model that meets the application's needs and handle thread panics and task failures deliberately.

## Practical example

```rust
use std::thread;

let worker = thread::spawn(|| {
    2 + 2
});
let answer = worker.join().expect("worker panicked");
assert_eq!(answer, 4);
```

`join` waits for the worker and returns its result. Real programs should also consider cancellation, work limits, and graceful shutdown.

## Important terminology

- **Thread:** an execution path managed by the operating system.
- **Data race:** unsynchronized conflicting memory access, including a write.
- **Mutex:** a lock that gives one thread at a time access to protected data.
- **Channel:** a communication path for sending values between tasks.

## Advantages and disadvantages

Concurrency can keep applications responsive and increase throughput. It adds coordination costs and can create nondeterministic behavior. More threads are not always faster, especially when work is small or contends for the same resource.

## Common misconceptions

- Concurrency and parallelism are related but not identical.
- `Arc<T>` provides shared ownership, not automatic thread-safe mutation.
- Rust's safety guarantees do not prevent deadlocks or incorrect business logic.

## Revision questions

1. How does a channel differ from sharing a mutable variable?
2. What does `join` do in the example?
3. Why is `Arc<Mutex<T>>` sometimes used together?

## Further Learning & References

- **Official documentation:** [The Rust Book, Fearless Concurrency](https://doc.rust-lang.org/book/ch16-00-concurrency.html) introduces threads, message passing, and shared state.
- **Official standard library documentation:** [`std::sync`](https://doc.rust-lang.org/std/sync/) documents synchronization primitives including mutexes and atomic reference counting.
- Continue with [Ownership and Borrowing](ownership-and-borrowing.md).
