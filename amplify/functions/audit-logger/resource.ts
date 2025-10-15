import { defineFunction } from '@aws-amplify/backend';

export const auditLogger = defineFunction({
  name: 'audit-logger',
  entry: './handler.ts',
});
