import { defineFunction } from '@aws-amplify/backend';

export const userProfileManager = defineFunction({
  name: 'user-profile-manager',
  entry: './handler.ts',
});
