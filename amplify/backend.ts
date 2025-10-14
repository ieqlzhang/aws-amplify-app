import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { VpcResource } from './storage/vpc-resource';
import { DatabaseResource } from './storage/database-resource';

const backend = defineBackend({
  auth,
  data,
});

// Create infrastructure stack
const infraStack = backend.createStack('InfraStack');

// Add VPC infrastructure
const vpcResource = new VpcResource(infraStack, 'VpcResource');

// Add database infrastructure
const databaseResource = new DatabaseResource(infraStack, 'DatabaseResource', {
  vpc: vpcResource.vpc,
  databaseSecurityGroup: vpcResource.databaseSecurityGroup,
});

// Export resources for use in Lambda functions and other components
backend.addOutput({
  custom: {
    vpcId: vpcResource.vpc.vpcId,
    databaseSecurityGroupId: vpcResource.databaseSecurityGroup.securityGroupId,
    lambdaSecurityGroupId: vpcResource.lambdaSecurityGroup.securityGroupId,
    databaseEndpoint: databaseResource.databaseEndpoint,
    databaseSecretArn: databaseResource.databaseSecret.secretArn,
    databaseName: 'ordermanagement',
  },
});
