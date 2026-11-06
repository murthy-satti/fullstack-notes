# Memory Management

## Introduction

Memory management assigns and protects working memory. Programs use virtual
addresses, which the OS and hardware map to physical memory.

## Why does it exist?

RAM is limited and shared. Virtual memory gives each process an address space
and helps prevent unintended access to another process's memory.

## How does it work?

Hardware translates virtual addresses through page tables. Memory uses
fixed-size pages and frames; the OS controls their mappings and permissions.
Under pressure, it can reclaim caches or move pages to swap. Swap is much
slower than RAM and does not replace sufficient memory.

Processes have separate virtual spaces, while shared libraries and mappings
can share memory. When memory is exhausted, an allocation may fail or a
process may be terminated.

## Real-world example

The OS tracks memory used by browser tabs and can reclaim unused caches to
support active work.

## Developer perspective

Watch for leaks and invalid access. Cached memory may be reclaimable, and
virtual size is not the same as resident physical memory.

## Practical example

On Linux, `free -h` summarizes memory and `vmstat 1 3` samples activity.
These commands are read-only; interpret results alongside application
measurements.

## Important terminology

- **Virtual memory:** per-process address-space abstraction.
- **Page:** fixed-size block used for memory mapping.
- **Swap:** disk-backed space that may hold less-active memory pages.
- **Resident memory:** process memory currently held in physical RAM.

## Advantages and disadvantages

Virtual memory enables isolation and sharing. Translation and page faults
have costs; heavy swapping can make a system slow.

## Common misconceptions

- High memory use may include reclaimable caches; virtual memory is not
  identical to swap.

## Further Learning & References

- **Official documentation — Linux man-pages project:** [mmap(2)](https://man7.org/linux/man-pages/man2/mmap.2.html)
  documents mapping files or anonymous regions into a process address space.
- **Third-party explanation — DigitalOcean:** [How To Add Swap Space on
  Ubuntu 20.04](https://www.digitalocean.com/community/tutorials/how-to-add-swap-space-on-ubuntu-20-04)
  explains what swap is and its trade-offs. The commands in that tutorial
  change a system; this lesson's practical commands remain read-only.
