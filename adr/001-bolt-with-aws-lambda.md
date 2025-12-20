# ADR 001: Adopt Bolt for JS with AWS Lambda

## Status

Accepted

## Context

We are building a personal Slack-based email client. We need to decide:

1. Which framework to use for the Slack app
2. Where to host the application
3. How to ensure flexibility for future infrastructure changes

Requirements:

- Minimize server management overhead
- Event-driven architecture (no always-on server)
- Infrastructure abstraction to avoid vendor lock-in

Options considered:

- **Slack Platform (Hosted Functions)**: Requires paid Slack plan - rejected
- **Socket Mode + self-hosted server**: Requires always-on server - rejected
- **Bolt for JS + AWS Lambda**: Serverless, event-driven, free tier available - selected

## Decision

We will use **Bolt for JS** with **AWS Lambda + API Gateway** for hosting.

### Architecture

```text
┌─────────────┐     ┌───────────────┐     ┌────────────────┐
│   Slack     │────▶│  API Gateway  │────▶│  AWS Lambda    │
│  (events)   │     │  (public URL) │     │  (Bolt for JS) │
└─────────────┘     └───────────────┘     └────────────────┘
```

### Infrastructure Abstraction via Receiver Pattern

Bolt for JS provides built-in abstraction through the Receiver pattern:

```typescript
// Business logic remains the same regardless of deployment target
app.event('message', async ({ event, say }) => {
  // This code works with any Receiver
});

// Only the Receiver changes based on deployment target
const app = new App({
  receiver: new AwsLambdaReceiver({ ... }),  // AWS Lambda
  // receiver: new ExpressReceiver({ ... }), // Express (any PaaS/VPS)
  // receiver: new SocketModeReceiver({ ... }), // Local development
});
```

This satisfies the requirement "abstract infrastructure implementation via repository pattern" without additional development effort.

## Consequences

### Positive

- No server management required (serverless)
- Event-driven: Lambda runs only when events occur
- Cost-effective: AWS Lambda free tier is sufficient for personal use
- Bolt for JS provides built-in infrastructure abstraction
- Easy to switch deployment targets by changing Receiver
- TypeScript support maintained

### Negative

- Requires AWS account setup
- API Gateway configuration needed
- Cold start latency on Lambda (minor for personal use)
