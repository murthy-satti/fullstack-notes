# File Systems

## Introduction

A file system organizes data and metadata on storage. Programs can create,
find, and manage files without knowing how a drive stores bits.

## Why does it exist?

Storage devices provide blocks; a file system tracks names, directories,
ownership, permissions, and content locations. File systems vary in features
and supported devices.

## How does it work?

Linux exposes files in one tree rooted at `/`. Directories map names to
entries. On Unix-like systems, an inode stores file metadata and points to
data; a filename is a directory entry, so hard links can give data multiple
names.

Mounting attaches another file system at a directory called a mount point.
Permissions and ownership help control access but are not a complete security
model.

## Real-world example

Saving `/home/lee/project/app.py` asks the OS to write through the mounted
file system. Opening it later looks up the path and reads the contents.

## Developer perspective

Use file APIs rather than assuming a disk layout. Handle missing files,
permissions, full storage, and partial failures. File extensions do not prove
file contents.

## Practical example

On Linux, `ls -l` displays permissions and sizes, `stat file.txt` shows
metadata, and `df -h` reports file-system space. These are read-only.

## Important terminology

- **Directory:** collection of named entries.
- **Metadata:** information about a file beyond its content.
- **Mount point:** directory where a file system is attached.
- **Inode:** Unix-like file metadata object, distinct from its filename.

## Advantages and disadvantages

File systems organize persistent data and access. Hardware faults or software
errors can damage them, so backups remain necessary; formats are not
universally compatible.

## Common misconceptions

- A directory is not necessarily a physical folder, and deleting a name does
  not ensure that its data is unrecoverable.

## Revision questions

1. What information does file-system metadata describe?
2. What does mounting do?
3. Why are backups needed even when a file system is reliable?

## Further Learning & References

- **Official documentation — Linux man-pages project:** [inode(7)](https://man7.org/linux/man-pages/man7/inode.7.html)
  explains Unix inode metadata and directory entries.
- **Official documentation — GNU:** [GNU Coreutils
  manual](https://www.gnu.org/software/coreutils/manual/coreutils.html)
  documents standard file and directory inspection utilities.
- **Third-party explanation — DigitalOcean:** [An Introduction to Linux
  Permissions](https://www.digitalocean.com/community/tutorials/an-introduction-to-linux-permissions)
  explains common owner, group, and permission concepts.
