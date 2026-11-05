# Linux Fundamentals

## Introduction

Linux is an open-source kernel used across many kinds of devices. A Linux
distribution combines it with utilities, libraries, package management, and
applications. The command line helps inspect and manage a system.

## Why does it exist?

Distributions provide flexible environments used on developer computers,
containers, and servers. Core conventions make troubleshooting easier across
interfaces.

## How does it work?

A shell reads commands and starts programs. Pipes connect one program's
output to another's input. The file tree starts at `/`; `/home` commonly
contains user files. Absolute paths start with `/`; relative paths use the
current directory.

Permissions control file access. `PATH` helps the shell find programs.
Distributions differ in package managers, shells, and service tools.

## Real-world example

A developer may inspect logs, processes, and disk space to diagnose a server
without changing its configuration.

## Developer perspective

Read manual pages before using unfamiliar commands. Be careful with commands
that delete, change ownership, or require administrator privileges.

## Practical example

`pwd`, `ls -la`, `whoami`, and `uname -a` inspect directory, files, account,
and system details. `man ls` opens documentation where available; press `q`
to exit.

## Important terminology

- **Distribution (distro):** packaged Linux system built around the kernel.
- **Shell:** command interpreter, such as Bash.
- **Root directory:** top of the file-system tree, written `/`.
- **Package manager:** tool for installing and tracking software packages.

## Advantages and disadvantages

Linux supports automation and configurable systems, but distribution
differences and command-line complexity can challenge beginners.

## Common misconceptions

- Linux is not one distribution. A terminal hosts a shell, and diagnostic
  output alone does not guarantee system health.

## Revision questions

1. What does a Linux distribution add to the kernel?
2. How do absolute and relative paths differ?
3. Which commands in the practical example only inspect state?

## Further Learning & References

- **Official documentation — Linux man-pages project:** [Linux manual page
  index](https://man7.org/linux/man-pages/) provides searchable references
  for Linux commands, system calls, and interfaces.
- **Official documentation — GNU:** [Bash Reference
  Manual](https://www.gnu.org/software/bash/manual/bash.html) explains Bash
  syntax, commands, and shell behavior.
- **Third-party explanation — DigitalOcean:** [An Introduction to Linux
  Basics](https://www.digitalocean.com/community/tutorials/an-introduction-to-linux-basics)
  gives new Linux users a guided overview of the command line.
