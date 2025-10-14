import { defineFunction } from '@aws-amplify/backend';

export const orderResolvers = defineFunction({
  name: 'orderResolvers',
  entry: './index.ts',
  runtime: 20,
  timeoutSeconds: 30,
  memoryMB: 512,
  environment: {
    DB_SECRET_ARN: process.env.DB_SECRET_ARN || '',
    DB_ENDPOINT: process.env.DB_ENDPOINT || '',
    DB_NAME: process.env.DB_NAME || 'ordermanagement',
  },
});
