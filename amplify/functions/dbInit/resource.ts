import { defineFunction } from '@aws-amplify/backend';

export const dbInit = defineFunction({
  name: 'dbInit',
  entry: './index.ts',
  runtime: 20,
  timeoutSeconds: 120,
  memoryMB: 512,
  environment: {
    DB_SECRET_ARN: process.env.DB_SECRET_ARN || '',
    DB_ENDPOINT: process.env.DB_ENDPOINT || '',
    DB_NAME: process.env.DB_NAME || 'ordermanagement',
  },
});

// Note: VPC configuration will be added in backend.ts using CDK
// This allows the function to access RDS database in private subnets
