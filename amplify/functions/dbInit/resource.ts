import { defineFunction } from '@aws-amplify/backend';

export const dbInit = defineFunction({
  name: 'dbInit',
  entry: './index.py',
  timeoutSeconds: 120,
  memoryMB: 512,
  environment: {
    DB_SECRET_ARN: process.env.DB_SECRET_ARN || '',
    DB_ENDPOINT: process.env.DB_ENDPOINT || '',
    DB_NAME: process.env.DB_NAME || 'ordermanagement',
  },
});
