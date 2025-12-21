# ADR 003: Monorepo Structure with pnpm Workspace

## Status

Accepted

## Context

We want to:

1. Publish the core logic as an npm package (`juzumaru`) for reusability and usage tracking
2. Keep AWS-specific implementation (S3, Lambda) and infrastructure (CDKTF) in the same repository
3. Support future cloud providers (GCP, Azure) without increasing bundle size
4. Maintain simplicity in development workflow

Options considered:

- **Separate repositories**: Core as npm package, AWS template as separate repo - rejected (harder to maintain)
- **Single package with all implementations**: Include AWS/GCP SDKs - rejected (bloated bundle)
- **Monorepo with pnpm workspace**: Separate packages, shared repository - selected

## Decision

We will use a **pnpm monorepo** structure:

```text
juzumaru/
├── packages/
│   └── core/                 # npm: juzumaru (publishable)
│       ├── src/
│       │   ├── domain/       # Email, EmailParser, StorageRepository interface
│       │   ├── application/  # ReceiveMailUseCase
│       │   └── presentation/ # SlackApp, emailFormatter
│       └── package.json
├── aws/                      # AWS implementation (not published)
│   ├── src/
│   │   ├── infrastructure/   # S3StorageRepository
│   │   └── index.ts          # Lambda handler
│   ├── infra/                # CDKTF
│   └── package.json          # depends on "juzumaru": "workspace:*"
├── pnpm-workspace.yaml
└── package.json              # root (shared devDeps)
```

### Cloud Provider Switching

Each cloud directory (`aws/`, `gcp/`) is an independent deployment unit:

- Users deploy the directory for their chosen cloud
- No runtime switching needed (serverless-friendly)
- Bundle size stays minimal (only required SDK included)

### npm Publishing Strategy

1. Start with `workspace:*` for local development
2. Publish to npm after MVP is stable
3. Usage statistics available via npm download counts

## Consequences

### Positive

- Core package is lightweight (no AWS SDK)
- AWS implementation and CDKTF in same repository (easy to maintain)
- Future cloud providers can be added as new directories
- Shared devDependencies (biome, vitest) in root
- npm publishing is optional and can be added later

### Negative

- Slightly more complex project structure
- Need to manage multiple package.json files
- `workspace:*` protocol requires pnpm (not npm/yarn compatible for consumers)
