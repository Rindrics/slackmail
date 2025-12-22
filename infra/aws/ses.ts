import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';

import { emailDomain, route53ZoneId } from './config';
import { emailBucket } from './s3';

// Get current AWS region and account
const currentRegion = aws.getRegion();
const currentIdentity = aws.getCallerIdentity();

// =============================================================================
// SES Domain Identity
// =============================================================================

export const sesDomainIdentity = new aws.ses.DomainIdentity('ses-domain', {
  domain: emailDomain,
});

// Domain verification TXT record
export const sesDomainVerificationRecord = new aws.route53.Record(
  'ses-verification-record',
  {
    zoneId: route53ZoneId,
    name: `_amazonses.${emailDomain}`,
    type: 'TXT',
    ttl: 600,
    records: [sesDomainIdentity.verificationToken],
  },
);

// Wait for domain verification
export const sesDomainVerification = new aws.ses.DomainIdentityVerification(
  'ses-domain-verification',
  {
    domain: sesDomainIdentity.domain,
  },
  {
    dependsOn: [sesDomainVerificationRecord],
  },
);

// =============================================================================
// MX Record for receiving emails
// =============================================================================

export const mxRecord = new aws.route53.Record('mx-record', {
  zoneId: route53ZoneId,
  name: emailDomain,
  type: 'MX',
  ttl: 600,
  records: pulumi
    .output(currentRegion)
    .apply((region) => [`10 inbound-smtp.${region.name}.amazonaws.com`]),
});

// =============================================================================
// S3 Bucket Policy for SES
// =============================================================================

export const emailBucketPolicy = new aws.s3.BucketPolicy(
  'email-bucket-policy',
  {
    bucket: emailBucket.id,
    policy: pulumi
      .all([emailBucket.arn, currentIdentity])
      .apply(([bucketArn, identity]) =>
        JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Sid: 'AllowSESPuts',
              Effect: 'Allow',
              Principal: {
                Service: 'ses.amazonaws.com',
              },
              Action: 's3:PutObject',
              Resource: `${bucketArn}/*`,
              Condition: {
                StringEquals: {
                  'AWS:SourceAccount': identity.accountId,
                },
              },
            },
          ],
        }),
      ),
  },
);

// =============================================================================
// SES Receipt Rule Set
// =============================================================================

export const receiptRuleSet = new aws.ses.ReceiptRuleSet('receipt-rule-set', {
  ruleSetName: 'slackmail-rules',
});

// Activate the rule set
export const activeReceiptRuleSet = new aws.ses.ActiveReceiptRuleSet(
  'active-receipt-rule-set',
  {
    ruleSetName: receiptRuleSet.ruleSetName,
  },
);

// =============================================================================
// SES Receipt Rule
// =============================================================================

export const receiptRule = new aws.ses.ReceiptRule(
  'receipt-rule',
  {
    ruleSetName: receiptRuleSet.ruleSetName,
    name: 'store-to-s3',
    enabled: true,
    recipients: [emailDomain],
    scanEnabled: true,
    s3Actions: [
      {
        bucketName: emailBucket.bucket,
        position: 1,
      },
    ],
  },
  {
    dependsOn: [emailBucketPolicy, sesDomainVerification],
  },
);
