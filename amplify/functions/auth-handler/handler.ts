import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import * as jwt from 'jsonwebtoken';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// AppSync Authorizer Event Interface
interface AppSyncAuthorizerEvent {
  authorizationToken: string;
  requestContext: {
    apiId: string;
    accountId: string;
    requestId: string;
    queryString: string;
    operationName?: string;
    variables: Record<string, any>;
  };
}

// User Profile Interface
interface UserProfile {
  userId: string;
  email?: string;
  salesOrganizations: string[];
  allowedCountryPols: string[];
  permissions: string[];
  isActive: boolean;
}

// Authorization Response Interface
interface AuthorizerResponse {
  isAuthorized: boolean;
  resolverContext?: Record<string, any>;
  deniedFields?: string[];
  ttlOverride?: number;
}

export const handler = async (event: AppSyncAuthorizerEvent): Promise<AuthorizerResponse> => {
  try {
    console.log('Authorization event received:', JSON.stringify(event, null, 2));

    // Extract and validate JWT token
    const token = extractJWTToken(event.authorizationToken);
    if (!token) {
      console.log('No valid JWT token found');
      return { isAuthorized: false };
    }

    // Get user profile from DynamoDB
    const userProfile = await getUserProfile(token.sub);
    if (!userProfile || !userProfile.isActive) {
      console.log('User profile not found or inactive');
      return { isAuthorized: false };
    }

    // Calculate allowed org-pol access combinations
    const allowedAccess = calculateAllowedOrgPolAccess(
      userProfile.salesOrganizations,
      userProfile.allowedCountryPols
    );

    // Extract resource requirements from the request
    const resourceAccess = extractResourceRequirements(event);
    
    // Validate access permissions
    const isAuthorized = validateAccess(allowedAccess, resourceAccess, userProfile.permissions);

    console.log('Authorization result:', {
      userId: userProfile.userId,
      isAuthorized,
      allowedAccess,
      resourceAccess
    });

    return {
      isAuthorized,
      resolverContext: {
        userId: userProfile.userId,
        userProfile,
        allowedOrgPolAccess: allowedAccess,
        permissions: userProfile.permissions
      }
    };

  } catch (error) {
    console.error('Authorization error:', error);
    return { isAuthorized: false };
  }
};

/**
 * Extract JWT token from authorization header
 */
function extractJWTToken(authorizationToken: string): any {
  try {
    if (!authorizationToken || !authorizationToken.startsWith('Bearer ')) {
      return null;
    }

    const token = authorizationToken.replace('Bearer ', '');
    
    // For development, we'll decode without verification
    // In production, you should verify the token signature
    const decoded = jwt.decode(token);
    
    if (!decoded || typeof decoded === 'string') {
      return null;
    }

    return decoded;
  } catch (error) {
    console.error('Error extracting JWT token:', error);
    return null;
  }
}

/**
 * Get user profile from DynamoDB
 */
async function getUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const tableName = process.env.USER_PROFILE_TABLE_NAME || `UserProfile-${process.env.AMPLIFY_BRANCH}`;
    
    const command = new GetCommand({
      TableName: tableName,
      Key: { userId }
    });

    const response = await docClient.send(command);
    return response.Item as UserProfile || null;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
}

/**
 * Calculate all allowed org-pol access combinations for a user
 */
function calculateAllowedOrgPolAccess(
  salesOrganizations: string[],
  allowedCountryPols: string[]
): string[] {
  const combinations: string[] = [];
  
  for (const org of salesOrganizations) {
    for (const country of allowedCountryPols) {
      combinations.push(`${org}#${country}`);
    }
  }
  
  return combinations;
}

/**
 * Extract resource access requirements from the GraphQL request
 */
function extractResourceRequirements(event: AppSyncAuthorizerEvent): {
  operation: string;
  requestedOrgPolAccess?: string[];
  operationType: 'read' | 'write';
} {
  const { operationName, variables } = event.requestContext;
  
  // Determine operation type based on GraphQL operation name
  const operationType = determineOperationType(operationName || '');
  
  // Extract orgPolAccess requirements from variables
  let requestedOrgPolAccess: string[] = [];
  
  if (variables) {
    // For mutations with input containing salesOrganization and countryPortOfLoading
    if (variables.input?.salesOrganization && variables.input?.countryPortOfLoading) {
      requestedOrgPolAccess.push(
        `${variables.input.salesOrganization}#${variables.input.countryPortOfLoading}`
      );
    }
    
    // For queries with filters
    if (variables.filter?.orgPolAccess) {
      if (Array.isArray(variables.filter.orgPolAccess)) {
        requestedOrgPolAccess.push(...variables.filter.orgPolAccess);
      } else {
        requestedOrgPolAccess.push(variables.filter.orgPolAccess);
      }
    }
  }

  return {
    operation: operationName || 'unknown',
    requestedOrgPolAccess,
    operationType
  };
}

/**
 * Determine if operation is read or write based on operation name
 */
function determineOperationType(operationName: string): 'read' | 'write' {
  const writeOperations = ['create', 'update', 'delete', 'upsert'];
  const lowerName = operationName.toLowerCase();
  
  return writeOperations.some(op => lowerName.includes(op)) ? 'write' : 'read';
}

/**
 * Validate user access against resource requirements
 */
function validateAccess(
  allowedAccess: string[],
  resourceAccess: { operation: string; requestedOrgPolAccess?: string[]; operationType: 'read' | 'write' },
  userPermissions: string[]
): boolean {
  // Check if user has required permissions for the operation type
  const requiredPermission = `orders:${resourceAccess.operationType}`;
  if (!userPermissions.includes(requiredPermission)) {
    console.log(`User missing required permission: ${requiredPermission}`);
    return false;
  }

  // If no specific orgPolAccess is requested, allow (will be filtered at resolver level)
  if (!resourceAccess.requestedOrgPolAccess || resourceAccess.requestedOrgPolAccess.length === 0) {
    return true;
  }

  // Check if all requested orgPolAccess values are allowed for the user
  for (const requestedAccess of resourceAccess.requestedOrgPolAccess) {
    if (!allowedAccess.includes(requestedAccess)) {
      console.log(`User not authorized for orgPolAccess: ${requestedAccess}`);
      return false;
    }
  }

  return true;
}
