# Tauri

## Introduction

Tauri builds desktop applications with a web-based interface and Rust application layer. The frontend runs in the platform's webview, while Rust commands provide native capabilities.

## Why does it exist?

Tauri lets teams reuse web skills for desktop applications and use Rust for native operations. The result still depends on a webview and operating-system behavior.

## How does it work?

The frontend calls registered Rust commands through Tauri's IPC mechanism. Rust performs approved work and returns results. Capabilities govern access to features. A secure app exposes only needed commands, validates inputs, and treats frontend data as untrusted.

## Real-world example

A notes app might use a web interface for editing and a Rust command to save data to a selected local file. The command should validate the request and apply a clear file-access policy instead of granting broad filesystem access to every frontend component.

## Developer perspective

Treat the UI-to-Rust boundary as an API. A hidden button does not prevent a command call. Keep secrets out of frontend code, minimize permissions, validate commands, and test on supported systems.

## Practical example

A command can be registered in the Rust application and invoked from the frontend using Tauri's documented API. In a real project, configure the command and capability according to the installed Tauri version, handle errors in both layers, and avoid giving a demo command access to sensitive files.

## Important terminology

- **Webview:** a platform component that renders web content inside a desktop application.
- **IPC:** inter-process or component communication used to pass requests and results.
- **Command:** a Rust function exposed to the frontend.
- **Capability:** a policy describing which application components may access particular permissions.

## Advantages and disadvantages

Tauri reuses web UI skills and invokes native Rust code. Behavior can differ among webviews, and developers must secure both the frontend and native boundary.

## Common misconceptions

- Rust commands should not trust data just because it came from the app's own UI.
- A desktop app is not automatically safe from web-style injection.
- Tauri's permission model still requires careful configuration.

## Further Learning & References

- **Official documentation:** [Tauri documentation](https://v2.tauri.app/) explains setup, application architecture, commands, and security concepts for Tauri 2.
- **Official documentation:** [Tauri security documentation](https://v2.tauri.app/security/) describes security practices and the permission model.
- Continue with [Operating System Interaction](operating-system-interaction.md) and [Web Security Fundamentals](../09-security-and-testing/web-security-fundamentals.md).
