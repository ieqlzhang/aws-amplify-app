import { defineFunction } from '@aws-amplify/backend';

export const orderManagement = defineFunction({
  name: 'order-management',
  entry: './handler.ts',
});
