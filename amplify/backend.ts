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

// Configure Lambda functions to run inside VPC with proper security groups
// This allows Lambda to access RDS database in private subnets

// Configure VPC access for dbInit Lambda
const cfnDbInitFunction = backend.dbInit.resources.cfnResources.cfnFunction;
cfnDbInitFunction.vpcConfig = {
  subnetIds: vpcResource.vpc.privateSubnets.map(subnet => subnet.subnetId),
  securityGroupIds: [vpcResource.lambdaSecurityGroup.securityGroupId],
};

// Grant Secrets Manager read permission to dbInit Lambda role
const dbInitRole = backend.dbInit.resources.lambda.role;
if (dbInitRole) {
  dbInitRole.addManagedPolicy({
    managedPolicyArn: 'arn:aws:iam::aws:policy/SecretsManagerReadWrite',
  });
}

// Configure VPC access for orderResolvers Lambda
const cfnOrderResolversFunction = backend.orderResolvers.resources.cfnResources.cfnFunction;
cfnOrderResolversFunction.vpcConfig = {
  subnetIds: vpcResource.vpc.privateSubnets.map(subnet => subnet.subnetId),
  securityGroupIds: [vpcResource.lambdaSecurityGroup.securityGroupId],
};

// Grant Secrets Manager read permission to orderResolvers Lambda role
const orderResolversRole = backend.orderResolvers.resources.lambda.role;
if (orderResolversRole) {
  orderResolversRole.addManagedPolicy({
    managedPolicyArn: 'arn:aws:iam::aws:policy/SecretsManagerReadWrite',
  });
}

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
