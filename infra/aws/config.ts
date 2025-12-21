import * as pulumi from '@pulumi/pulumi';

export const config = new pulumi.Config();
export const projectName = pulumi.getProject();
export const stackName = pulumi.getStack();

export const tags = {
  Project: projectName,
  Environment: stackName,
  repo: 'juzumaru',
};
