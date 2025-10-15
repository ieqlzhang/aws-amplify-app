import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Audit Event Interface
interface AuditEvent {
  id?: string;
  eventType: 'ORDER_CREATED' | 'ORDER_UPDATED' | 'ORDER_DELETED' | 'ORDER_VIEWED' | 'USER_LOGIN' | 'USER_PROFILE_UPDATED' | 'AUTHORIZATION_FAILURE' | 'DATA_ACCESS';
  userId: string;
  resourceType: 'ORDER' | 'USER_PROFILE' | 'SYSTEM';
  resourceId?: string;
  action: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp?: string;
  orgPolAccess?: string;
  success: boolean;
  errorMessage?: string;
}

// Audit Log Event
interface AuditLogEvent {
  operation: 'logEvent' | 'getAuditTrail' | 'getAuditSummary';
  arguments?: {
    event?: AuditEvent;
    filter?: AuditFilter;
  };
  requestContext?: {
    identity?: {
      sourceIp?: string;
      userAgent?: string;
    };
  };
}

// Audit Filter Interface
interface AuditFilter {
  userId?: string;
  eventType?: string;
  resourceId?: string;
  dateFrom?: string;
  dateTo?: string;
  orgPolAccess?: string;
  limit?: number;
}

// Response Interface
interface AuditResponse {
  success: boolean;
  data?: AuditEvent | AuditEvent[];
  error?: string;
  count?: number;
}

export const handler = async (event: AuditLogEvent): Promise<AuditResponse> => {
  try {
    console.log('Audit logger event received:', JSON.stringify(event, null, 2));

    switch (event.operation) {
      case 'logEvent':
        return await logAuditEvent(event.arguments?.event!, event.requestContext);
      case 'getAuditTrail':
        return await getAuditTrail(event.arguments?.filter);
      case 'getAuditSummary':
        return await getAuditSummary(event.arguments?.filter);
      default:
        return {
          success: false,
          error: 'Unknown operation'
        };
    }

  } catch (error) {
    console.error('Audit logger error:', error);
    return {
      success: false,
      error: 'Internal audit logging error'
    };
  }
};

/**
 * Log an audit event
 */
async function logAuditEvent(auditEvent: AuditEvent, requestContext?: any): Promise<AuditResponse> {
  try {
    // Generate unique ID for the audit event
    const eventId = generateEventId();
    
    // Enrich the audit event with context information
    const enrichedEvent: AuditEvent = {
      ...auditEvent,
      id: eventId,
      timestamp: auditEvent.timestamp || new Date().toISOString(),
      ipAddress: auditEvent.ipAddress || requestContext?.identity?.sourceIp || 'unknown',
      userAgent: auditEvent.userAgent || requestContext?.identity?.userAgent || 'unknown'
    };

    // Validate the audit event
    const validationErrors = validateAuditEvent(enrichedEvent);
    if (validationErrors.length > 0) {
      return {
        success: false,
        error: `Audit event validation failed: ${validationErrors.join(', ')}`
      };
    }

    // Store the audit event in DynamoDB
    await storeAuditEvent(enrichedEvent);

    console.log('Audit event logged successfully:', eventId);

    return {
      success: true,
      data: enrichedEvent
    };

  } catch (error) {
    console.error('Error logging audit event:', error);
    return {
      success: false,
      error: 'Failed to log audit event'
    };
  }
}

/**
 * Get audit trail based on filter criteria
 */
async function getAuditTrail(filter?: AuditFilter): Promise<AuditResponse> {
  try {
    // This is a simplified implementation
    // In a real system, you'd implement proper querying with GSIs
    console.log('Getting audit trail with filter:', filter);

    // For now, return a success response indicating the function exists
    // Full implementation would require GSI setup and proper querying
    return {
      success: true,
      data: [],
      count: 0
    };

  } catch (error) {
    console.error('Error getting audit trail:', error);
    return {
      success: false,
      error: 'Failed to retrieve audit trail'
    };
  }
}

/**
 * Get audit summary statistics
 */
async function getAuditSummary(filter?: AuditFilter): Promise<AuditResponse> {
  try {
    // This is a simplified implementation
    // In a real system, you'd implement aggregation queries
    console.log('Getting audit summary with filter:', filter);

    // For now, return a success response indicating the function exists
    return {
      success: true,
      data: [],
      count: 0
    };

  } catch (error) {
    console.error('Error getting audit summary:', error);
    return {
      success: false,
      error: 'Failed to retrieve audit summary'
    };
  }
}

/**
 * Store audit event in DynamoDB
 */
async function storeAuditEvent(auditEvent: AuditEvent): Promise<void> {
  const tableName = process.env.AUDIT_LOG_TABLE_NAME || `AuditLog-${process.env.AMPLIFY_BRANCH}`;

  // Add TTL for automatic cleanup (90 days from now)
  const ttl = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60); // 90 days

  const command = new PutCommand({
    TableName: tableName,
    Item: {
      ...auditEvent,
      ttl // DynamoDB TTL field for automatic deletion
    }
  });

  await docClient.send(command);
}

/**
 * Validate audit event data
 */
function validateAuditEvent(auditEvent: AuditEvent): string[] {
  const errors: string[] = [];

  // Required fields
  if (!auditEvent.eventType) {
    errors.push('eventType is required');
  }

  if (!auditEvent.userId) {
    errors.push('userId is required');
  }

  if (!auditEvent.resourceType) {
    errors.push('resourceType is required');
  }

  if (!auditEvent.action) {
    errors.push('action is required');
  }

  if (auditEvent.success === undefined) {
    errors.push('success flag is required');
  }

  // Validate event type
  const validEventTypes = ['ORDER_CREATED', 'ORDER_UPDATED', 'ORDER_DELETED', 'ORDER_VIEWED', 'USER_LOGIN', 'USER_PROFILE_UPDATED', 'AUTHORIZATION_FAILURE', 'DATA_ACCESS'];
  if (auditEvent.eventType && !validEventTypes.includes(auditEvent.eventType)) {
    errors.push(`Invalid eventType. Must be one of: ${validEventTypes.join(', ')}`);
  }

  // Validate resource type
  const validResourceTypes = ['ORDER', 'USER_PROFILE', 'SYSTEM'];
  if (auditEvent.resourceType && !validResourceTypes.includes(auditEvent.resourceType)) {
    errors.push(`Invalid resourceType. Must be one of: ${validResourceTypes.join(', ')}`);
  }

  // Validate timestamp format if provided
  if (auditEvent.timestamp && !isValidISODate(auditEvent.timestamp)) {
    errors.push('timestamp must be a valid ISO date string');
  }

  return errors;
}

/**
 * Generate unique event ID
 */
function generateEventId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substr(2, 5);
  return `audit_${timestamp}_${randomPart}`;
}

/**
 * Validate ISO date string
 */
function isValidISODate(dateString: string): boolean {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime()) && dateString === date.toISOString();
}

/**
 * Helper function to create audit events for common operations
 */
export const createAuditEvent = {
  orderCreated: (userId: string, orderId: string, orderDetails: any, orgPolAccess: string): AuditEvent => ({
    eventType: 'ORDER_CREATED',
    userId,
    resourceType: 'ORDER',
    resourceId: orderId,
    action: 'CREATE_ORDER',
    details: {
      orderNumber: orderDetails.orderNumber,
      salesOrganization: orderDetails.salesOrganization,
      status: orderDetails.status
    },
    orgPolAccess,
    success: true
  }),

  orderUpdated: (userId: string, orderId: string, changes: any, orgPolAccess: string): AuditEvent => ({
    eventType: 'ORDER_UPDATED',
    userId,
    resourceType: 'ORDER',
    resourceId: orderId,
    action: 'UPDATE_ORDER',
    details: {
      changes: changes
    },
    orgPolAccess,
    success: true
  }),

  orderDeleted: (userId: string, orderId: string, orgPolAccess: string): AuditEvent => ({
    eventType: 'ORDER_DELETED',
    userId,
    resourceType: 'ORDER',
    resourceId: orderId,
    action: 'DELETE_ORDER',
    orgPolAccess,
    success: true
  }),

  orderViewed: (userId: string, orderId: string, orgPolAccess: string): AuditEvent => ({
    eventType: 'ORDER_VIEWED',
    userId,
    resourceType: 'ORDER',
    resourceId: orderId,
    action: 'VIEW_ORDER',
    orgPolAccess,
    success: true
  }),

  userLogin: (userId: string, ipAddress: string, success: boolean, errorMessage?: string): AuditEvent => ({
    eventType: 'USER_LOGIN',
    userId,
    resourceType: 'SYSTEM',
    action: 'USER_LOGIN',
    ipAddress,
    success,
    errorMessage
  }),

  userProfileUpdated: (userId: string, targetUserId: string, changes: any): AuditEvent => ({
    eventType: 'USER_PROFILE_UPDATED',
    userId,
    resourceType: 'USER_PROFILE',
    resourceId: targetUserId,
    action: 'UPDATE_USER_PROFILE',
    details: {
      changes: changes
    },
    success: true
  }),

  authorizationFailure: (userId: string, resourceType: string, resourceId: string, reason: string): AuditEvent => ({
    eventType: 'AUTHORIZATION_FAILURE',
    userId,
    resourceType: resourceType as any,
    resourceId,
    action: 'AUTHORIZATION_CHECK',
    details: {
      reason: reason
    },
    success: false,
    errorMessage: reason
  }),

  dataAccess: (userId: string, resourceType: string, action: string, orgPolAccess?: string): AuditEvent => ({
    eventType: 'DATA_ACCESS',
    userId,
    resourceType: resourceType as any,
    action,
    orgPolAccess,
    success: true
  })
};
