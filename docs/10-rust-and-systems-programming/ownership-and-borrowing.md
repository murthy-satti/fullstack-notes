# Ownership and Borrowing

## Introduction

Ownership decides which part of a program is responsible for a value. Borrowing gives temporary reference-based access. These rules prevent dangling references and unsafe shared mutation in safe Rust.

## Why does it exist?

Systems programs need resource control and predictable cleanup. Memory errors can happen when data is freed too early or twice, or changed while another part of a program assumes it is stable. Rust checks many such constraints at compile time.

## How does it work?

Each value has one owner. Assigning many non-`Copy` values moves ownership, so the old binding cannot be used. A reference borrows a value. You may have multiple immutable references or one mutable reference at a time. Lifetimes describe how long references remain valid; the compiler often infers them.

## Real-world example

A function can borrow a string to count its characters without consuming it. The caller keeps ownership and can use the string after the call. If the function needs to return newly created text, it can return an owned `String`.

## Developer perspective

When the compiler reports a borrow error, consider borrowing, moving, or cloning. Cloning may copy more data than needed. First clarify ownership intent rather than using unsafe code to silence an error.

## Practical example

```rust
fn byte_count(text: &str) -> usize {
    text.len()
}

let message = String::from("hello");
let count = byte_count(&message);
println!("{message}: {count}");
```

The function receives a shared borrow. It does not own or modify the string, so the caller can still use it afterward.

## Important terminology

- **Move:** transfer of ownership from one binding to another.
- **Borrow:** temporary access through a reference.
- **Immutable reference (`&T`):** read-only access.
- **Mutable reference (`&mut T`):** exclusive mutable access while the borrow is active.

## Advantages and disadvantages

Ownership enables automatic cleanup without a garbage collector. Its rules can be unfamiliar when sharing data, but clear ownership can simplify architecture.

## Common misconceptions

- Borrowing is not the same as copying.
- A reference cannot safely outlive the value it refers to.
- `&mut` means exclusive access, not simply a preference to mutate.

## Revision questions

1. What happens to the old binding after a move?
2. Which combination of immutable and mutable borrows is allowed?
3. Why might cloning not be the best response to a borrow error?

## Further Learning & References

- **Official documentation:** [The Rust Book, References and Borrowing](https://doc.rust-lang.org/book/ch04-02-references-and-borrowing.html) gives examples of borrowing rules.
- **Official documentation:** [The Rust Book, Ownership](https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html) explains scope, moves, and cleanup.
- Continue with [Memory Management](memory-management.md) and [Concurrency](concurrency.md).
