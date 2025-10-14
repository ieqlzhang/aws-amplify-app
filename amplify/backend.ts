import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { VpcResource } from './storage/vpc-resource';

const backend = defineBackend({
  auth,
  data,
});

// Create VPC stack
const vpcStack = backend.createStack('VpcStack');

// Add VPC infrastructure
const vpcResource = new VpcResource(vpcStack, 'VpcResource');

// Export VPC resource for use in other resources
backend.addOutput({
  custom: {
    vpcId: vpcResource.vpc.vpcId,
    databaseSecurityGroupId: vpcResource.databaseSecurityGroup.securityGroupId,
    lambdaSecurityGroupId: vpcResource.lambdaSecurityGroup.securityGroupId,
  },
});
