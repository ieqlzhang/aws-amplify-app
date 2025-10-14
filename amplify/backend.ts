import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { VpcResource } from './storage/vpc-resource';
import { DatabaseResource } from './storage/database-resource';
import { dbInit } from './functions/dbInit/resource';
import { orderResolvers } from './functions/orderResolvers/resource';

const backend = defineBackend({
  auth,
  data,
  dbInit,
  orderResolvers,
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

// Configure dbInit function with environment variables
backend.dbInit.addEnvironment('DB_SECRET_ARN', databaseResource.databaseSecret.secretArn);
backend.dbInit.addEnvironment('DB_ENDPOINT', databaseResource.databaseEndpoint);
backend.dbInit.addEnvironment('DB_NAME', 'ordermanagement');

// Configure orderResolvers function with environment variables
backend.orderResolvers.addEnvironment('DB_SECRET_ARN', databaseResource.databaseSecret.secretArn);
backend.orderResolvers.addEnvironment('DB_ENDPOINT', databaseResource.databaseEndpoint);
backend.orderResolvers.addEnvironment('DB_NAME', 'ordermanagement');

// Note: Lambda permissions for Secrets Manager access will be configured via IAM policies

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
