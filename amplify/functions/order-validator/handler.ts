import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Order Input Interface
interface OrderInput {
  id?: string;
  salesOrganization: string;
  countryPortOfLoading: string;
  orgPolAccess?: string;
  orderNumber: string;
  shipTo?: string;
  status: string;
  isGoodIssued: boolean;
  carrier?: string;
  resourceType?: string;
  departureLocation?: string;
  destinationLocation?: string;
  countryPortOfDestination?: string;
  pol?: string;
  pod?: string;
  etd?: string;
  eta?: string;
  trackingNumber?: string;
  estimatedDelivery?: string;
  containerType?: string;
  createdBy?: string;
  lastModifiedBy?: string;
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

// Validation Event Interface
interface ValidationEvent {
  operation: 'createOrder' | 'updateOrder' | 'deleteOrder';
  arguments: {
    input: OrderInput;
  };
  identity: {
    sub: string;
    username?: string;
  };
  source?: any;
}

// Validation Response Interface
interface ValidationResponse {
  isValid: boolean;
  errors?: string[];
  validatedInput?: OrderInput;
}

export const handler = async (event: ValidationEvent): Promise<ValidationResponse> => {
  try {
    console.log('Order validation event received:', JSON.stringify(event, null, 2));

    const { operation, arguments: args, identity } = event;
    
    switch (operation) {
      case 'createOrder':
        return await validateCreateOrder(args.input, identity);
      case 'updateOrder':
        return await validateUpdateOrder(args.input, identity);
      case 'deleteOrder':
        return await validateDeleteOrder(args.input, identity);
      default:
        return {
          isValid: false,
          errors: ['Unknown operation']
        };
    }

  } catch (error) {
    console.error('Order validation error:', error);
    return {
      isValid: false,
      errors: ['Internal validation error']
    };
  }
};

/**
 * Validate order creation
 */
async function validateCreateOrder(orderInput: OrderInput, identity: any): Promise<ValidationResponse> {
  const errors: string[] = [];
  
  try {
    // Get user profile for authorization
    const userProfile = await getUserProfile(identity.sub);
    if (!userProfile || !userProfile.isActive) {
      return {
        isValid: false,
        errors: ['User profile not found or inactive']
      };
    }

    // Validate required fields
    const requiredFieldErrors = validateRequiredFields(orderInput);
    errors.push(...requiredFieldErrors);

    // Validate business rules
    const businessRuleErrors = validateBusinessRules(orderInput);
    errors.push(...businessRuleErrors);

    // Check user authorization for org/pol combination
    const authErrors = await validateUserAuthorization(orderInput, userProfile);
    errors.push(...authErrors);

    // Check for duplicate order numbers
    const duplicateErrors = await validateUniqueOrderNumber(orderInput.orderNumber, orderInput.salesOrganization);
    errors.push(...duplicateErrors);

    if (errors.length > 0) {
      return {
        isValid: false,
        errors
      };
    }

    // Set computed fields
    const validatedInput: OrderInput = {
      ...orderInput,
      orgPolAccess: `${orderInput.salesOrganization}#${orderInput.countryPortOfLoading}`,
      createdBy: identity.sub,
      lastModifiedBy: identity.sub,
      status: orderInput.status || 'DRAFT'
    };

    return {
      isValid: true,
      validatedInput
    };

  } catch (error) {
    console.error('Error in validateCreateOrder:', error);
    return {
      isValid: false,
      errors: ['Validation failed due to internal error']
    };
  }
}

/**
 * Validate order update
 */
async function validateUpdateOrder(orderInput: OrderInput, identity: any): Promise<ValidationResponse> {
  const errors: string[] = [];
  
  try {
    // Get user profile for authorization
    const userProfile = await getUserProfile(identity.sub);
    if (!userProfile || !userProfile.isActive) {
      return {
        isValid: false,
        errors: ['User profile not found or inactive']
      };
    }

    // Check if user has write permissions
    if (!userProfile.permissions.includes('orders:write')) {
      return {
        isValid: false,
        errors: ['User does not have write permissions for orders']
      };
    }

    // Validate required fields for update
    if (!orderInput.id) {
      errors.push('Order ID is required for updates');
    }

    // Get existing order to validate access
    if (orderInput.id) {
      const existingOrder = await getExistingOrder(orderInput.id);
      if (!existingOrder) {
        errors.push('Order not found');
      } else {
        // Validate user can access this order
        const hasAccess = validateUserAccessToOrder(existingOrder, userProfile);
        if (!hasAccess) {
          errors.push('User not authorized to update this order');
        }

        // Validate status transitions
        const statusErrors = validateStatusTransition(existingOrder.status, orderInput.status);
        errors.push(...statusErrors);
      }
    }

    // Validate business rules
    const businessRuleErrors = validateBusinessRules(orderInput);
    errors.push(...businessRuleErrors);

    if (errors.length > 0) {
      return {
        isValid: false,
        errors
      };
    }

    // Set computed fields for update
    const validatedInput: OrderInput = {
      ...orderInput,
      orgPolAccess: orderInput.salesOrganization && orderInput.countryPortOfLoading 
        ? `${orderInput.salesOrganization}#${orderInput.countryPortOfLoading}`
        : orderInput.orgPolAccess,
      lastModifiedBy: identity.sub
    };

    return {
      isValid: true,
      validatedInput
    };

  } catch (error) {
    console.error('Error in validateUpdateOrder:', error);
    return {
      isValid: false,
      errors: ['Validation failed due to internal error']
    };
  }
}

/**
 * Validate order deletion
 */
async function validateDeleteOrder(orderInput: OrderInput, identity: any): Promise<ValidationResponse> {
  try {
    // Get user profile for authorization
    const userProfile = await getUserProfile(identity.sub);
    if (!userProfile || !userProfile.isActive) {
      return {
        isValid: false,
        errors: ['User profile not found or inactive']
      };
    }

    // Check if user has write permissions
    if (!userProfile.permissions.includes('orders:write')) {
      return {
        isValid: false,
        errors: ['User does not have write permissions for orders']
      };
    }

    if (!orderInput.id) {
      return {
        isValid: false,
        errors: ['Order ID is required for deletion']
      };
    }

    // Get existing order to validate access
    const existingOrder = await getExistingOrder(orderInput.id);
    if (!existingOrder) {
      return {
        isValid: false,
        errors: ['Order not found']
      };
    }

    // Validate user can access this order
    const hasAccess = validateUserAccessToOrder(existingOrder, userProfile);
    if (!hasAccess) {
      return {
        isValid: false,
        errors: ['User not authorized to delete this order']
      };
    }

    // Business rule: Cannot delete orders that have been shipped
    if (existingOrder.isGoodIssued) {
      return {
        isValid: false,
        errors: ['Cannot delete orders that have goods issued']
      };
    }

    return {
      isValid: true,
      validatedInput: orderInput
    };

  } catch (error) {
    console.error('Error in validateDeleteOrder:', error);
    return {
      isValid: false,
      errors: ['Validation failed due to internal error']
    };
  }
}

/**
 * Validate required fields for order creation
 */
function validateRequiredFields(orderInput: OrderInput): string[] {
  const errors: string[] = [];
  const requiredFields = ['orderNumber', 'salesOrganization', 'countryPortOfLoading', 'status'];
  
  for (const field of requiredFields) {
    if (!orderInput[field as keyof OrderInput]) {
      errors.push(`${field} is required`);
    }
  }

  return errors;
}

/**
 * Validate business rules
 */
function validateBusinessRules(orderInput: OrderInput): string[] {
  const errors: string[] = [];

  // Validate order number format (should be alphanumeric, 6-20 characters)
  if (orderInput.orderNumber && !/^[A-Z0-9]{6,20}$/.test(orderInput.orderNumber)) {
    errors.push('Order number must be 6-20 alphanumeric characters');
  }

  // Validate sales organization format
  if (orderInput.salesOrganization && !/^[A-Z0-9]{4}$/.test(orderInput.salesOrganization)) {
    errors.push('Sales organization must be 4 alphanumeric characters (e.g., NL20)');
  }

  // Validate country code format
  if (orderInput.countryPortOfLoading && !/^[A-Z]{2}$/.test(orderInput.countryPortOfLoading)) {
    errors.push('Country port of loading must be 2 letter country code (e.g., CN)');
  }

  // Validate status values
  const validStatuses = ['DRAFT', 'CONFIRMED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'];
  if (orderInput.status && !validStatuses.includes(orderInput.status)) {
    errors.push(`Status must be one of: ${validStatuses.join(', ')}`);
  }

  // Validate dates if provided
  if (orderInput.etd && !isValidISODate(orderInput.etd)) {
    errors.push('ETD must be a valid ISO date');
  }

  if (orderInput.eta && !isValidISODate(orderInput.eta)) {
    errors.push('ETA must be a valid ISO date');
  }

  // Business rule: ETA should be after ETD
  if (orderInput.etd && orderInput.eta) {
    const etd = new Date(orderInput.etd);
    const eta = new Date(orderInput.eta);
    if (eta <= etd) {
      errors.push('ETA must be after ETD');
    }
  }

  return errors;
}

/**
 * Validate user authorization for org/pol combination
 */
async function validateUserAuthorization(orderInput: OrderInput, userProfile: UserProfile): Promise<string[]> {
  const errors: string[] = [];

  // Check if user has write permissions
  if (!userProfile.permissions.includes('orders:write')) {
    errors.push('User does not have write permissions for orders');
  }

  // Check if user is authorized for this sales organization
  if (!userProfile.salesOrganizations.includes(orderInput.salesOrganization)) {
    errors.push(`User not authorized for sales organization: ${orderInput.salesOrganization}`);
  }

  // Check if user is authorized for this country port of loading
  if (!userProfile.allowedCountryPols.includes(orderInput.countryPortOfLoading)) {
    errors.push(`User not authorized for country port of loading: ${orderInput.countryPortOfLoading}`);
  }

  return errors;
}

/**
 * Validate unique order number within sales organization
 */
async function validateUniqueOrderNumber(orderNumber: string, salesOrganization: string): Promise<string[]> {
  try {
    const tableName = process.env.ORDER_TABLE_NAME || `Order-${process.env.AMPLIFY_BRANCH}`;
    
    const command = new QueryCommand({
      TableName: tableName,
      IndexName: 'orderNumber-index',
      KeyConditionExpression: 'orderNumber = :orderNumber',
      FilterExpression: 'salesOrganization = :salesOrganization',
      ExpressionAttributeValues: {
        ':orderNumber': orderNumber,
        ':salesOrganization': salesOrganization
      }
    });

    const response = await docClient.send(command);
    
    if (response.Items && response.Items.length > 0) {
      return ['Order number already exists for this sales organization'];
    }

    return [];
  } catch (error) {
    console.error('Error checking order number uniqueness:', error);
    return ['Unable to validate order number uniqueness'];
  }
}

/**
 * Validate status transition rules
 */
function validateStatusTransition(currentStatus: string, newStatus: string): string[] {
  const errors: string[] = [];

  // Define valid status transitions
  const validTransitions: Record<string, string[]> = {
    'DRAFT': ['CONFIRMED', 'CANCELLED'],
    'CONFIRMED': ['IN_TRANSIT', 'CANCELLED'],
    'IN_TRANSIT': ['DELIVERED'],
    'DELIVERED': [], // No transitions allowed from delivered
    'CANCELLED': [] // No transitions allowed from cancelled
  };

  if (currentStatus !== newStatus) {
    const allowedTransitions = validTransitions[currentStatus] || [];
    if (!allowedTransitions.includes(newStatus)) {
      errors.push(`Invalid status transition from ${currentStatus} to ${newStatus}`);
    }
  }

  return errors;
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
 * Get existing order from DynamoDB
 */
async function getExistingOrder(orderId: string): Promise<any> {
  try {
    const tableName = process.env.ORDER_TABLE_NAME || `Order-${process.env.AMPLIFY_BRANCH}`;
    
    const command = new GetCommand({
      TableName: tableName,
      Key: { id: orderId }
    });

    const response = await docClient.send(command);
    return response.Item || null;
  } catch (error) {
    console.error('Error fetching existing order:', error);
    return null;
  }
}

/**
 * Validate user access to an existing order
 */
function validateUserAccessToOrder(order: any, userProfile: UserProfile): boolean {
  if (!order.orgPolAccess) {
    return false;
  }

  const [salesOrg, countryPol] = order.orgPolAccess.split('#');
  
  return userProfile.salesOrganizations.includes(salesOrg) &&
         userProfile.allowedCountryPols.includes(countryPol);
}

/**
 * Validate ISO date string
 */
function isValidISODate(dateString: string): boolean {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime()) && dateString === date.toISOString();
}
