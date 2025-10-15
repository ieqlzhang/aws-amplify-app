import { defineAuth } from '@aws-amplify/backend';
import { userProfileManager } from '../functions/user-profile-manager/resource';

/**
 * Define and configure your auth resource for Ocean Order Management
 * Multi-tenant authentication with custom user attributes
 * @see https://docs.amplify.aws/gen2/build-a-backend/auth
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  userAttributes: {
    // Standard attributes
    email: {
      required: true,
      mutable: true,
    },
    givenName: {
      required: false,
      mutable: true,
    },
    familyName: {
      required: false,
      mutable: true,
    },
    // Custom attributes for multi-tenant authorization
    'custom:salesOrganizations': {
      dataType: 'String',
      mutable: true,
    },
    'custom:allowedCountryPols': {
      dataType: 'String', 
      mutable: true,
    },
    'custom:permissions': {
      dataType: 'String',
      mutable: true,
    },
    'custom:isActive': {
      dataType: 'Boolean',
      mutable: true,
    },
  },
  triggers: {
    // Automatically create user profile after user confirmation
    postConfirmation: userProfileManager,
  },
  multifactor: {
    mode: 'OPTIONAL',
    sms: true,
    totp: true,
  },
  accountRecovery: 'EMAIL_ONLY',
});
