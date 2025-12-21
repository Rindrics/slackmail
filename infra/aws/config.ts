import * as pulumi from '@pulumi/pulumi';

export const config = new pulumi.Config();
export const projectName = pulumi.getProject();
export const stackName = pulumi.getStack();

// Helper to get config from env var or Pulumi config
function getConfig(key: string, envVar: string): string {
  const envValue = process.env[envVar];
  if (envValue) {
    return envValue;
  }
  return config.require(key);
}

// Email domain configuration
export const emailDomain = getConfig('emailDomain', 'EMAIL_DOMAIN');
export const route53ZoneId = getConfig('route53ZoneId', 'ROUTE53_ZONE_ID');

export const tags = {
  Project: projectName,
  Environment: stackName,
  repo: 'juzumaru',
};
