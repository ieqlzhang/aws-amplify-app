import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// User Profile Interface
interface UserProfile {
  userId: string;
  email?: string;
  salesOrganizations: string[];
  allowedCountryPols: string[];
  permissions: string[];
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// Cognito Post Confirmation Event
interface CognitoPostConfirmationEvent {
  version: string;
  region: string;
  userPoolId: string;
  userName: string;
  callerContext: {
    awsSdkVersion: string;
    clientId: string;
  };
  triggerSource: string;
  request: {
    userAttributes: {
      [key: string]: string;
    };
  };
  response: {};
}

// User Profile Management Event
interface UserProfileEvent {
  operation: 'createProfile' | 'updateProfile' | 'getUserProfile' | 'listUsers' | 'validateUserAccess';
  arguments?: {
    userId?: string;
    input?: Partial<UserProfile>;
    filter?: any;
  };
  identity?: {
    sub: string;
    username?: string;
  };
}

// Response Interface
interface UserProfileResponse {
  success: boolean;
  data?: UserProfile | UserProfile[];
  error?: string;
}

export const handler = async (event: CognitoPostConfirmationEvent | UserProfileEvent): Promise<any> => {
  try {
    console.log('User profile manager event received:', JSON.stringify(event, null, 2));

    // Handle Cognito post-confirmation trigger
    if ('triggerSource' in event && event.triggerSource === 'PostConfirmation_ConfirmSignUp') {
      return await handlePostConfirmation(event as CognitoPostConfirmationEvent);
    }

    // Handle user profile management operations
    const profileEvent = event as UserProfileEvent;
    
    switch (profileEvent.operation) {
      case 'createProfile':
        return await createUserProfile(profileEvent.arguments?.input!, profileEvent.identity?.sub);
      case 'updateProfile':
        return await updateUserProfile(profileEvent.arguments?.userId!, profileEvent.arguments?.input!, profileEvent.identity?.sub);
      case 'getUserProfile':
        return await getUserProfile(profileEvent.arguments?.userId!);
      case 'listUsers':
        return await listUsers(profileEvent.arguments?.filter);
      case 'validateUserAccess':
        return await validateUserAccess(profileEvent.arguments?.userId!, profileEvent.arguments?.input);
      default:
        return {
          success: false,
          error: 'Unknown operation'
        };
    }

  } catch (error) {
    console.error('User profile manager error:', error);
    return {
      success: false,
      error: 'Internal error occurred'
    };
  }
};

/**
 * Handle Cognito post-confirmation trigger to create user profile
 */
async function handlePostConfirmation(event: CognitoPostConfirmationEvent): Promise<CognitoPostConfirmationEvent> {
  try {
    const userId = event.userName;
    const email = event.request.userAttributes.email;

    // Create default user profile
    const defaultProfile: UserProfile = {
      userId,
      email,
      salesOrganizations: [], // Will be assigned by admin
      allowedCountryPols: [], // Will be assigned by admin
      permissions: ['orders:read'], // Default read-only permission
      isActive: false, // Requires admin activation
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await createUserProfileRecord(defaultProfile);

    console.log('User profile created successfully for user:', userId);
    return event;

  } catch (error) {
    console.error('Error in post-confirmation handler:', error);
    // Don't fail the Cognito flow, just log the error
    return event;
  }
}

/**
 * Create a new user profile
 */
async function createUserProfile(profileData: Partial<UserProfile>, requesterId?: string): Promise<UserProfileResponse> {
  try {
    // Validate required fields
    if (!profileData.userId) {
      return {
        success: false,
        error: 'User ID is required'
      };
    }

    // Check if profile already exists
    const existingProfile = await getUserProfileRecord(profileData.userId);
    if (existingProfile) {
      return {
        success: false,
        error: 'User profile already exists'
      };
    }

    // Validate permissions and organizations
    const validationErrors = validateProfileData(profileData);
    if (validationErrors.length > 0) {
      return {
        success: false,
        error: validationErrors.join(', ')
      };
    }

    const newProfile: UserProfile = {
      userId: profileData.userId,
      email: profileData.email,
      salesOrganizations: profileData.salesOrganizations || [],
      allowedCountryPols: profileData.allowedCountryPols || [],
      permissions: profileData.permissions || ['orders:read'],
      isActive: profileData.isActive ?? false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await createUserProfileRecord(newProfile);

    return {
      success: true,
      data: newProfile
    };

  } catch (error) {
    console.error('Error creating user profile:', error);
    return {
      success: false,
      error: 'Failed to create user profile'
    };
  }
}

/**
 * Update an existing user profile
 */
async function updateUserProfile(userId: string, updates: Partial<UserProfile>, requesterId?: string): Promise<UserProfileResponse> {
  try {
    // Get existing profile
    const existingProfile = await getUserProfileRecord(userId);
    if (!existingProfile) {
      return {
        success: false,
        error: 'User profile not found'
      };
    }

    // Validate updates
    const validationErrors = validateProfileData(updates);
    if (validationErrors.length > 0) {
      return {
        success: false,
        error: validationErrors.join(', ')
      };
    }

    // Prepare update expression
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    if (updates.email !== undefined) {
      updateExpressions.push('#email = :email');
      expressionAttributeNames['#email'] = 'email';
      expressionAttributeValues[':email'] = updates.email;
    }

    if (updates.salesOrganizations !== undefined) {
      updateExpressions.push('salesOrganizations = :salesOrganizations');
      expressionAttributeValues[':salesOrganizations'] = updates.salesOrganizations;
    }

    if (updates.allowedCountryPols !== undefined) {
      updateExpressions.push('allowedCountryPols = :allowedCountryPols');
      expressionAttributeValues[':allowedCountryPols'] = updates.allowedCountryPols;
    }

    if (updates.permissions !== undefined) {
      updateExpressions.push('permissions = :permissions');
      expressionAttributeValues[':permissions'] = updates.permissions;
    }

    if (updates.isActive !== undefined) {
      updateExpressions.push('isActive = :isActive');
      expressionAttributeValues[':isActive'] = updates.isActive;
    }

    // Always update the updatedAt timestamp
    updateExpressions.push('updatedAt = :updatedAt');
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    if (updateExpressions.length === 1) { // Only updatedAt
      return {
        success: false,
        error: 'No valid updates provided'
      };
    }

    const tableName = process.env.USER_PROFILE_TABLE_NAME || `UserProfile-${process.env.AMPLIFY_BRANCH}`;

    const command = new UpdateCommand({
      TableName: tableName,
      Key: { userId },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    });

    const response = await docClient.send(command);

    return {
      success: true,
      data: response.Attributes as UserProfile
    };

  } catch (error) {
    console.error('Error updating user profile:', error);
    return {
      success: false,
      error: 'Failed to update user profile'
    };
  }
}

/**
 * Get a user profile by userId
 */
async function getUserProfile(userId: string): Promise<UserProfileResponse> {
  try {
    const profile = await getUserProfileRecord(userId);
    
    if (!profile) {
      return {
        success: false,
        error: 'User profile not found'
      };
    }

    return {
      success: true,
      data: profile
    };

  } catch (error) {
    console.error('Error getting user profile:', error);
    return {
      success: false,
      error: 'Failed to retrieve user profile'
    };
  }
}

/**
 * List all users with optional filtering
 */
async function listUsers(filter?: any): Promise<UserProfileResponse> {
  try {
    const tableName = process.env.USER_PROFILE_TABLE_NAME || `UserProfile-${process.env.AMPLIFY_BRANCH}`;

    let scanParams: any = {
      TableName: tableName
    };

    // Apply filters if provided
    if (filter) {
      const filterExpressions: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, any> = {};

      if (filter.isActive !== undefined) {
        filterExpressions.push('isActive = :isActive');
        expressionAttributeValues[':isActive'] = filter.isActive;
      }

      if (filter.salesOrganization) {
        filterExpressions.push('contains(salesOrganizations, :salesOrganization)');
        expressionAttributeValues[':salesOrganization'] = filter.salesOrganization;
      }

      if (filter.email) {
        filterExpressions.push('contains(#email, :email)');
        expressionAttributeNames['#email'] = 'email';
        expressionAttributeValues[':email'] = filter.email;
      }

      if (filterExpressions.length > 0) {
        scanParams.FilterExpression = filterExpressions.join(' AND ');
        scanParams.ExpressionAttributeNames = Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined;
        scanParams.ExpressionAttributeValues = expressionAttributeValues;
      }
    }

    const command = new ScanCommand(scanParams);
    const response = await docClient.send(command);

    return {
      success: true,
      data: response.Items as UserProfile[]
    };

  } catch (error) {
    console.error('Error listing users:', error);
    return {
      success: false,
      error: 'Failed to list users'
    };
  }
}

/**
 * Validate user access to specific resources
 */
async function validateUserAccess(userId: string, accessRequirements?: any): Promise<UserProfileResponse> {
  try {
    const profile = await getUserProfileRecord(userId);
    
    if (!profile) {
      return {
        success: false,
        error: 'User profile not found'
      };
    }

    if (!profile.isActive) {
      return {
        success: false,
        error: 'User account is not active'
      };
    }

    // If no specific requirements, just return the profile
    if (!accessRequirements) {
      return {
        success: true,
        data: profile
      };
    }

    // Validate specific access requirements
    const validationResults: Record<string, boolean> = {};

    if (accessRequirements.salesOrganization) {
      validationResults.salesOrganization = profile.salesOrganizations.includes(accessRequirements.salesOrganization);
    }

    if (accessRequirements.countryPortOfLoading) {
      validationResults.countryPortOfLoading = profile.allowedCountryPols.includes(accessRequirements.countryPortOfLoading);
    }

    if (accessRequirements.permission) {
      validationResults.permission = profile.permissions.includes(accessRequirements.permission);
    }

    // Check if all requirements are met
    const hasAccess = Object.values(validationResults).every(result => result);

    return {
      success: hasAccess,
      data: profile,
      error: hasAccess ? undefined : 'User does not have required access'
    };

  } catch (error) {
    console.error('Error validating user access:', error);
    return {
      success: false,
      error: 'Failed to validate user access'
    };
  }
}

/**
 * Create user profile record in DynamoDB
 */
async function createUserProfileRecord(profile: UserProfile): Promise<void> {
  const tableName = process.env.USER_PROFILE_TABLE_NAME || `UserProfile-${process.env.AMPLIFY_BRANCH}`;

  const command = new PutCommand({
    TableName: tableName,
    Item: profile,
    ConditionExpression: 'attribute_not_exists(userId)' // Prevent overwriting existing profiles
  });

  await docClient.send(command);
}

/**
 * Get user profile record from DynamoDB
 */
async function getUserProfileRecord(userId: string): Promise<UserProfile | null> {
  try {
    const tableName = process.env.USER_PROFILE_TABLE_NAME || `UserProfile-${process.env.AMPLIFY_BRANCH}`;

    const command = new GetCommand({
      TableName: tableName,
      Key: { userId }
    });

    const response = await docClient.send(command);
    return response.Item as UserProfile || null;

  } catch (error) {
    console.error('Error getting user profile record:', error);
    return null;
  }
}

/**
 * Validate profile data
 */
function validateProfileData(profileData: Partial<UserProfile>): string[] {
  const errors: string[] = [];

  // Validate sales organizations format
  if (profileData.salesOrganizations) {
    for (const org of profileData.salesOrganizations) {
      if (!/^[A-Z0-9]{4}$/.test(org)) {
        errors.push(`Invalid sales organization format: ${org}. Must be 4 alphanumeric characters (e.g., NL20)`);
      }
    }
  }

  // Validate country codes format
  if (profileData.allowedCountryPols) {
    for (const country of profileData.allowedCountryPols) {
      if (!/^[A-Z]{2}$/.test(country)) {
        errors.push(`Invalid country code format: ${country}. Must be 2 letter country code (e.g., CN)`);
      }
    }
  }

  // Validate permissions
  if (profileData.permissions) {
    const validPermissions = ['orders:read', 'orders:write', 'users:read', 'users:write', 'admin'];
    for (const permission of profileData.permissions) {
      if (!validPermissions.includes(permission)) {
        errors.push(`Invalid permission: ${permission}. Valid permissions are: ${validPermissions.join(', ')}`);
      }
    }
  }

  // Validate email format if provided
  if (profileData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileData.email)) {
    errors.push('Invalid email format');
  }

  return errors;
}
