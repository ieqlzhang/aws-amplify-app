import { defineFunction } from '@aws-amplify/backend';

export const authHandler = defineFunction({
  name: 'auth-handler',
  entry: './handler.ts',
});
