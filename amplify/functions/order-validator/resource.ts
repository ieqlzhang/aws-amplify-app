import { defineFunction } from '@aws-amplify/backend';

export const orderValidator = defineFunction({
  name: 'order-validator',
  entry: './handler.ts',
});
