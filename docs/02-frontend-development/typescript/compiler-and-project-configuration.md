# TypeScript Compiler and Project Configuration

The TypeScript compiler (`tsc`) checks TypeScript source and can emit
JavaScript. A project configuration describes which files and language
features the compiler should use.

## `tsconfig.json`

`tsconfig.json` marks a TypeScript project and configures compiler behavior.
Options such as `strict`, `target`, `module`, and `moduleResolution` affect
checking or output. Frontend frameworks often provide recommended defaults;
understand and extend those defaults instead of copying an unrelated setup.

## Type checking and emitting

Some tools transpile TypeScript without performing full type checking.
Therefore a project may need a separate `tsc --noEmit` check in addition to
its bundler or framework build.

## Practical example

```json
{
  "compilerOptions": {
    "strict": true,
    "noEmit": true,
    "target": "ES2022",
    "module": "ESNext"
  },
  "include": ["src"]
}
```

This illustrates options only; actual projects should use compatible
settings for their runtime, module system, and build tool.

## Developer perspective and terminology

Keep the compiler version and configuration under version control so local
and CI checks agree. **Type checking** analyzes type compatibility; **emit**
writes output files; **module resolution** determines how imports map to
files or packages.

## Common misconceptions

- Successful transpilation does not necessarily mean type checking passed.
- `strict` affects multiple checks and may reveal existing issues when
  enabled.
- A `tsconfig` option copied from another framework may conflict with the
  project's build system.

## Further learning

- [TypeScript Handbook: TSConfig](https://www.typescriptlang.org/docs/handbook/tsconfig-json.html)
- [TypeScript: Compiler options](https://www.typescriptlang.org/tsconfig/)
