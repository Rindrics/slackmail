# ADR 002: Use esbuild for Lambda Bundling

## Status

Accepted

## Context

We need to deploy Bolt for JS application to AWS Lambda (as decided in ADR 001). Lambda deployment requires either:

1. Uploading all source files and `node_modules` separately
2. Bundling everything into a single file

Bundling is preferred because:

- Reduces cold start latency
- Simplifies deployment (single file)
- Smaller deployment package size

We also want to keep the current `tsconfig.json` setting of `moduleResolution: "Bundler"`, which requires a bundler at build time.

Options considered:

- **esbuild**: Extremely fast, simple configuration, widely adopted for Lambda
- **webpack**: Feature-rich but complex configuration
- **Rollup**: Primarily for libraries, not ideal for applications

## Decision

We will use **esbuild** to bundle the application for Lambda deployment.

### Build Configuration

```bash
esbuild src/index.ts --bundle --platform=node --target=node20 --outfile=dist/index.js
```

### Why esbuild

- Extremely fast build times
- Simple CLI interface (no config file needed for basic usage)
- Native TypeScript support
- Handles `moduleResolution: "Bundler"` without issues
- No dependency on SAM or CDK

## Consequences

### Positive

- Fast build times
- Simple deployment workflow
- `moduleResolution: "Bundler"` can be used in `tsconfig.json`
- No complex configuration files needed
- Independent of AWS deployment tools (SAM, CDK)

### Negative

- Another dev dependency to maintain
- Some edge cases with native modules may require additional configuration
