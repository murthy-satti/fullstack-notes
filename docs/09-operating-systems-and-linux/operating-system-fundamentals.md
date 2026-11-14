# Operating System Fundamentals

## Introduction

An operating system (OS) coordinates hardware and provides common services
to programs. Examples include Linux, Windows, macOS, Android, and iOS.

## Why does it exist?

Without an OS, each program would need to manage hardware itself. The OS
offers shared interfaces and coordinates competing requests.

## How does it work?

Programs have limited privileges. To read a file or create a process, they
request a system call. The kernel performs permitted operations; drivers help
it communicate with hardware.

The OS schedules tasks, manages memory and files, handles input/output, and
enforces isolation. Operating systems expose different interfaces and
policies.

## Real-world example

When an editor opens a document, the OS checks permissions and provides the
file data without exposing the device's physical layout.

## Developer perspective

Applications rely on OS APIs and may behave differently across platforms.
Diagnose whether a problem belongs to the application, OS configuration,
resource pressure, or hardware.

## Practical example

On Linux, `uname -a` reports kernel and machine information and `ps -ef`
shows processes. Both are read-only; the kernel version does not identify
every OS component.

## Important terminology

- **Kernel:** privileged core managing hardware and system resources.
- **System call:** controlled request from a program to the kernel.
- **Driver:** software that helps an OS communicate with a device.
- **User space:** environment where ordinary applications run.

## Advantages and disadvantages

An OS makes hardware easier to share, but adds complexity and can contain
bugs or security weaknesses. Maintenance and limited permissions matter.

## Common misconceptions

- The kernel is not the whole OS, and an OS does not guarantee applications
  are safe. A Linux distribution adds utilities and applications.

## Further Learning & References

- **Official documentation — Linux man-pages project:** [syscalls(2)](https://man7.org/linux/man-pages/man2/syscalls.2.html)
  describes the Linux system-call interface and points to individual calls.
- **Third-party explanation — DigitalOcean:** [An Introduction to Linux
  Basics](https://www.digitalocean.com/community/tutorials/an-introduction-to-linux-basics)
  introduces Linux concepts and common command-line practices.
