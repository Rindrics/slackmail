import * as pulumi from "@pulumi/pulumi";

// Stack configuration
const config = new pulumi.Config();
const projectName = pulumi.getProject();
const stackName = pulumi.getStack();

// Export stack information
export const project = projectName;
export const stack = stackName;
