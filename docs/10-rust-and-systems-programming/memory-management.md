# Memory Management

## Introduction

Memory management is how a program obtains, uses, and releases memory. Rust combines ownership rules with types such as `Box`, `Vec`, and `String` to make common errors difficult to express in safe code without a tracing garbage collector.

## Why does it exist?

Programs need memory for values and collections. Incorrect lifetime handling can cause leaks, invalid references, or double frees. Rust helps manage resource lifetimes with predictable runtime costs.

## How does it work?

Each value has an owner. When it leaves scope, Rust drops it and releases its resources. Moving transfers ownership; borrowing gives temporary access. Stack-local values are typically released at scope end, while growable data commonly uses the heap. Types can implement `Drop` for cleanup. The borrow checker ensures references do not outlive their data.

## Real-world example

A `Vec<String>` owns a growable list of strings. When the vector is dropped, it drops its strings, which in turn release their allocations. The developer can pass a reference to inspect the list without copying ownership.

## Developer perspective

Prefer standard library types: `Box<T>` for a heap allocation, `Vec<T>` for growable sequences, and `String` for owned UTF-8 text. Unsafe code shifts proof obligations to the programmer; keep it small and carefully reviewed.

## Practical example

```rust
fn first_length(words: &[String]) -> Option<usize> {
    words.first().map(String::len)
}
```

The slice borrow lets the function inspect strings without taking ownership of the vector. The returned length is an owned integer, so it remains valid after the borrow ends.

## Important terminology

- **Stack:** common storage for scoped values with known layout.
- **Heap:** storage used for values whose size or lifetime needs dynamic allocation.
- **Drop:** cleanup behavior run when an owned value is released.
- **Leak:** memory that remains allocated when no longer useful; Rust memory safety does not guarantee that programs never leak.

## Advantages and disadvantages

Ownership provides predictable cleanup and prevents many memory errors in safe code. Lifetimes and shared access take practice. Reference counting and interior mutability add runtime costs or complexity.

## Common misconceptions

- Rust does not put every value on the stack; containers commonly own heap allocations.
- Borrowing does not duplicate the owned value.
- Memory safety does not prevent all leaks or excessive memory use.

## Revision questions

1. What happens when an owned value leaves its scope?
2. How does borrowing avoid transferring ownership?
3. Does safe Rust guarantee that a program cannot leak memory?

## Further Learning & References

- **Official documentation:** [The Rust Book, Understanding Ownership](https://doc.rust-lang.org/book/ch04-00-understanding-ownership.html) explains moves, references, and lifetimes.
- **Official standard library documentation:** [`std::boxed::Box`](https://doc.rust-lang.org/std/boxed/struct.Box.html) documents owned heap allocation.
- Continue with [Ownership and Borrowing](ownership-and-borrowing.md) and [Rust Fundamentals](rust-fundamentals.md).
