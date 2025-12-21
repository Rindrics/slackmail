# ADR 004: Use Pulumi for Infrastructure Provisioning

## Status

Accepted (Supersedes original CDKTF decision)

## Context

We need to provision AWS infrastructure (S3, Lambda, API Gateway, IAM) for the email reception flow. Several Infrastructure as Code (IaC) options are available:

1. **AWS SAM** - Serverless-focused, CloudFormation-based
2. **AWS CDK** - TypeScript support, CloudFormation-based
3. **Terraform (HCL)** - Multi-cloud, declarative configuration language
4. **CDKTF** - TypeScript support, Terraform-based (deprecated December 10, 2025)
5. **Pulumi** - TypeScript support, multi-cloud, actively maintained

Key requirements:
- TypeScript for consistency with the codebase
- Managed state for team collaboration
- Leverage mature AWS provider ecosystem

### Why not CDKTF?

CDKTF was originally planned but HashiCorp deprecated it on December 10, 2025. The GitHub repository has been archived and is now read-only; no further maintenance or development will occur.

## Decision

Use Pulumi for infrastructure provisioning with Pulumi Cloud for state management.

## Consequences

### Positive

- **TypeScript consistency**: Define infrastructure in the same language as application code
- **Pulumi Cloud integration**: Managed state, secrets management, and collaboration features
- **Active development**: Pulumi is actively maintained with regular updates
- **AWS provider maturity**: First-class AWS support with comprehensive resource coverage
- **Multi-cloud potential**: Easier to add GCP/Azure implementations in the future (per ADR-003 monorepo structure)

### Negative

- **Pulumi Cloud dependency**: State management tied to Pulumi Cloud (or requires alternative backend setup)
- **Learning curve**: Team needs familiarity with Pulumi patterns and concepts
- **Different from Terraform**: Cannot directly reuse existing Terraform modules (though providers are similar)

### Neutral

- Infrastructure code lives in `infra/aws/` directory within the monorepo (allowing future expansion to `infra/gcp/`, `infra/azure/`, etc.)
