import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { authHandler } from './functions/auth-handler/resource';
import { orderValidator } from './functions/order-validator/resource';
import { userProfileManager } from './functions/user-profile-manager/resource';
import { auditLogger } from './functions/audit-logger/resource';
import { orderManagement } from './functions/order-management/resource';

defineBackend({
  auth,
  data,
  authHandler,
  orderValidator,
  userProfileManager,
  auditLogger,
  orderManagement,
});
