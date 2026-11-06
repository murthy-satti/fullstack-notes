# Rust Fundamentals

## Introduction

Rust is a systems programming language designed for performance and reliability. It offers low-level control, compile-time memory-safety checks, and strong types. It is used for tools, servers, embedded software, and libraries.

## Why does it exist?

Software close to hardware needs performance and resource control, but memory errors can be easy to introduce. Rust prevents many common errors in safe code before a program runs.

## How does it work?

Rust code uses crates and modules. The compiler checks types and ownership; Cargo manages builds, dependencies, and tests. `match` handles enums such as `Option<T>` and `Result<T, E>`, making missing values and errors explicit.

## Real-world example

A command-line utility can accept a filename, read it, and report a clear error if it does not exist. Rust's standard library provides file access, and `Result` lets the program decide whether to retry, display a message, or return an error status.

## Developer perspective

Use Cargo to build and test, keep dependencies intentional, and read compiler diagnostics carefully. Favor clear code over premature optimization. Use `unsafe` only when needed and document its safety requirements.

## Practical example

```rust
fn greeting(name: &str) -> String {
    format!("Hello, {name}!")
}

fn main() {
    println!("{}", greeting("Rust"));
}
```

The function borrows its input and returns a newly owned string. Save the example in a Cargo project and run it with `cargo run`.

## Important terminology

- **Crate:** a Rust compilation unit and package.
- **Cargo:** Rust's build and package manager.
- **Enum:** a type that can represent one of several named variants.
- **`Result<T, E>`:** a value representing success (`Ok`) or failure (`Err`).

## Advantages and disadvantages

Rust combines performance with strong compile-time guarantees and a productive package toolchain. Its ownership model and compiler messages can take time to learn. Not every task requires low-level control, and Rust's ecosystem or build times may not suit every project.

## Common misconceptions

- Rust is not automatically faster than every other language in every workload.
- A successful compile does not prove program logic is correct.
- Safe Rust greatly reduces certain memory risks but does not remove all security or reliability concerns.

## Further Learning & References

- **Official documentation:** [The Rust Programming Language](https://doc.rust-lang.org/book/) is the primary guided introduction to Rust.
- **Official documentation:** [The Rust standard library](https://doc.rust-lang.org/std/) documents built-in types and APIs.
- Continue with [Ownership and Borrowing](ownership-and-borrowing.md) and [Memory Management](memory-management.md).
