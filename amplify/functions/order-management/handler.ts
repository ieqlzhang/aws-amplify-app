import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Order Interface
interface Order {
  id: string;
  salesOrganization: string;
  countryPortOfLoading: string;
  orgPolAccess: string;
  orderNumber: string;
  shipTo?: string;
  status: 'DRAFT' | 'CONFIRMED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';
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
  createdAt?: string;
  updatedAt?: string;
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

// Order Management Event
interface OrderManagementEvent {
  operation: 'createOrder' | 'updateOrder' | 'deleteOrder' | 'getOrder' | 'listOrders' | 'listOrdersByStatus';
  arguments?: {
    input?: Partial<Order>;
    id?: string;
    filter?: any;
    limit?: number;
    nextToken?: string;
  };
  identity?: {
    sub: string;
    username?: string;
  };
  requestContext?: {
    identity?: {
      sourceIp?: string;
      userAgent?: string;
    };
  };
}

// Response Interface
interface OrderManagementResponse {
  success: boolean;
  data?: Order | Order[];
  error?: string;
  nextToken?: string;
  count?: number;
}

export const handler = async (event: OrderManagementEvent): Promise<OrderManagementResponse> => {
  try {
    console.log('Order management event received:', JSON.stringify(event, null, 2));

    // Validate user identity
    if (!event.identity?.sub) {
      return {
        success: false,
        error: 'User identity not found'
      };
    }

    switch (event.operation) {
      case 'createOrder':
        return await createOrder(event.arguments?.input!, event.identity, event.requestContext);
      case 'updateOrder':
        return await updateOrder(event.arguments?.input!, event.identity, event.requestContext);
      case 'deleteOrder':
        return await deleteOrder(event.arguments?.id!, event.identity, event.requestContext);
      case 'getOrder':
        return await getOrder(event.arguments?.id!, event.identity);
      case 'listOrders':
        return await listOrders(event.arguments?.filter, event.identity, event.arguments?.limit, event.arguments?.nextToken);
      case 'listOrdersByStatus':
        return await listOrdersByStatus(event.arguments?.filter?.status, event.identity, event.arguments?.limit);
      default:
        return {
          success: false,
          error: 'Unknown operation'
        };
    }

  } catch (error) {
    console.error('Order management error:', error);
    return {
      success: false,
      error: 'Internal order management error'
    };
  }
};

/**
 * Create a new order
 */
async function createOrder(orderInput: Partial<Order>, identity: any, requestContext?: any): Promise<OrderManagementResponse> {
  try {
    // Get user profile for authorization
    const userProfile = await getUserProfile(identity.sub);
    if (!userProfile || !userProfile.isActive) {
      await logAuditEvent({
        eventType: 'AUTHORIZATION_FAILURE',
        userId: identity.sub,
        resourceType: 'ORDER',
        action: 'CREATE_ORDER',
        success: false,
        errorMessage: 'User profile not found or inactive'
      }, requestContext);

      return {
        success: false,
        error: 'User profile not found or inactive'
      };
    }

    // Check permissions
    if (!userProfile.permissions.includes('orders:write')) {
      await logAuditEvent({
        eventType: 'AUTHORIZATION_FAILURE',
        userId: identity.sub,
        resourceType: 'ORDER',
        action: 'CREATE_ORDER',
        success: false,
        errorMessage: 'Insufficient permissions'
      }, requestContext);

      return {
        success: false,
        error: 'Insufficient permissions for order creation'
      };
    }

    // Validate required fields
    if (!orderInput.orderNumber || !orderInput.salesOrganization || !orderInput.countryPortOfLoading) {
      return {
        success: false,
        error: 'Missing required fields: orderNumber, salesOrganization, countryPortOfLoading'
      };
    }

    // Validate user authorization for org/pol combination
    if (!userProfile.salesOrganizations.includes(orderInput.salesOrganization!)) {
      await logAuditEvent({
        eventType: 'AUTHORIZATION_FAILURE',
        userId: identity.sub,
        resourceType: 'ORDER',
        action: 'CREATE_ORDER',
        success: false,
        errorMessage: `Unauthorized sales organization: ${orderInput.salesOrganization}`
      }, requestContext);

      return {
        success: false,
        error: `Unauthorized for sales organization: ${orderInput.salesOrganization}`
      };
    }

    if (!userProfile.allowedCountryPols.includes(orderInput.countryPortOfLoading!)) {
      await logAuditEvent({
        eventType: 'AUTHORIZATION_FAILURE',
        userId: identity.sub,
        resourceType: 'ORDER',
        action: 'CREATE_ORDER',
        success: false,
        errorMessage: `Unauthorized country port: ${orderInput.countryPortOfLoading}`
      }, requestContext);

      return {
        success: false,
        error: `Unauthorized for country port: ${orderInput.countryPortOfLoading}`
      };
    }

    // Check for duplicate order number within sales organization
    const existingOrder = await findOrderByNumber(orderInput.orderNumber!, orderInput.salesOrganization!);
    if (existingOrder) {
      return {
        success: false,
        error: 'Order number already exists for this sales organization'
      };
    }

    // Create the order
    const now = new Date().toISOString();
    const orderId = generateOrderId();
    const orgPolAccess = `${orderInput.salesOrganization}#${orderInput.countryPortOfLoading}`;

    const newOrder: Order = {
      id: orderId,
      salesOrganization: orderInput.salesOrganization!,
      countryPortOfLoading: orderInput.countryPortOfLoading!,
      orgPolAccess,
      orderNumber: orderInput.orderNumber!,
      shipTo: orderInput.shipTo,
      status: orderInput.status || 'DRAFT',
      isGoodIssued: orderInput.isGoodIssued || false,
      carrier: orderInput.carrier,
      resourceType: orderInput.resourceType,
      departureLocation: orderInput.departureLocation,
      destinationLocation: orderInput.destinationLocation,
      countryPortOfDestination: orderInput.countryPortOfDestination,
      pol: orderInput.pol,
      pod: orderInput.pod,
      etd: orderInput.etd,
      eta: orderInput.eta,
      trackingNumber: orderInput.trackingNumber,
      estimatedDelivery: orderInput.estimatedDelivery,
      containerType: orderInput.containerType,
      createdBy: identity.sub,
      lastModifiedBy: identity.sub,
      createdAt: now,
      updatedAt: now
    };

    // Save to DynamoDB
    await saveOrder(newOrder);

    // Log audit event
    await logAuditEvent({
      eventType: 'ORDER_CREATED',
      userId: identity.sub,
      resourceType: 'ORDER',
      resourceId: orderId,
      action: 'CREATE_ORDER',
      details: {
        orderNumber: newOrder.orderNumber,
        salesOrganization: newOrder.salesOrganization,
        status: newOrder.status
      },
      orgPolAccess,
      success: true
    }, requestContext);

    return {
      success: true,
      data: newOrder
    };

  } catch (error) {
    console.error('Error creating order:', error);
    await logAuditEvent({
      eventType: 'ORDER_CREATED',
      userId: identity.sub,
      resourceType: 'ORDER',
      action: 'CREATE_ORDER',
      success: false,
      errorMessage: 'Internal error during order creation'
    }, requestContext);

    return {
      success: false,
      error: 'Failed to create order'
    };
  }
}

/**
 * Update an existing order
 */
async function updateOrder(orderInput: Partial<Order>, identity: any, requestContext?: any): Promise<OrderManagementResponse> {
  try {
    if (!orderInput.id) {
      return {
        success: false,
        error: 'Order ID is required for updates'
      };
    }

    // Get user profile for authorization
    const userProfile = await getUserProfile(identity.sub);
    if (!userProfile || !userProfile.isActive) {
      return {
        success: false,
        error: 'User profile not found or inactive'
      };
    }

    // Check permissions
    if (!userProfile.permissions.includes('orders:write')) {
      await logAuditEvent({
        eventType: 'AUTHORIZATION_FAILURE',
        userId: identity.sub,
        resourceType: 'ORDER',
        resourceId: orderInput.id,
        action: 'UPDATE_ORDER',
        success: false,
        errorMessage: 'Insufficient permissions'
      }, requestContext);

      return {
        success: false,
        error: 'Insufficient permissions for order updates'
      };
    }

    // Get existing order
    const existingOrder = await getOrderById(orderInput.id);
    if (!existingOrder) {
      return {
        success: false,
        error: 'Order not found'
      };
    }

    // Validate user can access this order
    const hasAccess = validateUserAccessToOrder(existingOrder, userProfile);
    if (!hasAccess) {
      await logAuditEvent({
        eventType: 'AUTHORIZATION_FAILURE',
        userId: identity.sub,
        resourceType: 'ORDER',
        resourceId: orderInput.id,
        action: 'UPDATE_ORDER',
        success: false,
        errorMessage: 'Unauthorized access to order'
      }, requestContext);

      return {
        success: false,
        error: 'Unauthorized to update this order'
      };
    }

    // Validate status transitions if status is being changed
    if (orderInput.status && orderInput.status !== existingOrder.status) {
      const validTransition = validateStatusTransition(existingOrder.status, orderInput.status);
      if (!validTransition) {
        return {
          success: false,
          error: `Invalid status transition from ${existingOrder.status} to ${orderInput.status}`
        };
      }
    }

    // Prepare update
    const now = new Date().toISOString();
    const updatedOrder: Order = {
      ...existingOrder,
      ...orderInput,
      id: existingOrder.id, // Ensure ID doesn't change
      salesOrganization: existingOrder.salesOrganization, // Core fields shouldn't change
      countryPortOfLoading: existingOrder.countryPortOfLoading,
      orgPolAccess: existingOrder.orgPolAccess,
      createdBy: existingOrder.createdBy,
      createdAt: existingOrder.createdAt,
      lastModifiedBy: identity.sub,
      updatedAt: now
    };

    // Save updated order
    await saveOrder(updatedOrder);

    // Log audit event
    await logAuditEvent({
      eventType: 'ORDER_UPDATED',
      userId: identity.sub,
      resourceType: 'ORDER',
      resourceId: updatedOrder.id,
      action: 'UPDATE_ORDER',
      details: {
        changes: orderInput,
        previousStatus: existingOrder.status,
        newStatus: updatedOrder.status
      },
      orgPolAccess: updatedOrder.orgPolAccess,
      success: true
    }, requestContext);

    return {
      success: true,
      data: updatedOrder
    };

  } catch (error) {
    console.error('Error updating order:', error);
    return {
      success: false,
      error: 'Failed to update order'
    };
  }
}

/**
 * Delete an order
 */
async function deleteOrder(orderId: string, identity: any, requestContext?: any): Promise<OrderManagementResponse> {
  try {
    // Get user profile for authorization
    const userProfile = await getUserProfile(identity.sub);
    if (!userProfile || !userProfile.isActive) {
      return {
        success: false,
        error: 'User profile not found or inactive'
      };
    }

    // Check permissions
    if (!userProfile.permissions.includes('orders:write')) {
      return {
        success: false,
        error: 'Insufficient permissions for order deletion'
      };
    }

    // Get existing order
    const existingOrder = await getOrderById(orderId);
    if (!existingOrder) {
      return {
        success: false,
        error: 'Order not found'
      };
    }

    // Validate user can access this order
    const hasAccess = validateUserAccessToOrder(existingOrder, userProfile);
    if (!hasAccess) {
      return {
        success: false,
        error: 'Unauthorized to delete this order'
      };
    }

    // Business rule: Cannot delete orders that have goods issued
    if (existingOrder.isGoodIssued) {
      return {
        success: false,
        error: 'Cannot delete orders that have goods issued'
      };
    }

    // Business rule: Cannot delete delivered orders
    if (existingOrder.status === 'DELIVERED') {
      return {
        success: false,
        error: 'Cannot delete delivered orders'
      };
    }

    // Delete the order
    await deleteOrderById(orderId);

    // Log audit event
    await logAuditEvent({
      eventType: 'ORDER_DELETED',
      userId: identity.sub,
      resourceType: 'ORDER',
      resourceId: orderId,
      action: 'DELETE_ORDER',
      details: {
        orderNumber: existingOrder.orderNumber,
        status: existingOrder.status
      },
      orgPolAccess: existingOrder.orgPolAccess,
      success: true
    }, requestContext);

    return {
      success: true,
      data: existingOrder
    };

  } catch (error) {
    console.error('Error deleting order:', error);
    return {
      success: false,
      error: 'Failed to delete order'
    };
  }
}

/**
 * Get a single order by ID
 */
async function getOrder(orderId: string, identity: any): Promise<OrderManagementResponse> {
  try {
    // Get user profile for authorization
    const userProfile = await getUserProfile(identity.sub);
    if (!userProfile || !userProfile.isActive) {
      return {
        success: false,
        error: 'User profile not found or inactive'
      };
    }

    // Check permissions
    if (!userProfile.permissions.includes('orders:read')) {
      return {
        success: false,
        error: 'Insufficient permissions for order access'
      };
    }

    // Get the order
    const order = await getOrderById(orderId);
    if (!order) {
      return {
        success: false,
        error: 'Order not found'
      };
    }

    // Validate user can access this order
    const hasAccess = validateUserAccessToOrder(order, userProfile);
    if (!hasAccess) {
      return {
        success: false,
        error: 'Unauthorized to access this order'
      };
    }

    // Log audit event for order access
    await logAuditEvent({
      eventType: 'ORDER_VIEWED',
      userId: identity.sub,
      resourceType: 'ORDER',
      resourceId: orderId,
      action: 'VIEW_ORDER',
      orgPolAccess: order.orgPolAccess,
      success: true
    });

    return {
      success: true,
      data: order
    };

  } catch (error) {
    console.error('Error getting order:', error);
    return {
      success: false,
      error: 'Failed to retrieve order'
    };
  }
}

/**
 * List orders with multi-tenant filtering
 */
async function listOrders(filter: any, identity: any, limit?: number, nextToken?: string): Promise<OrderManagementResponse> {
  try {
    // Get user profile for authorization
    const userProfile = await getUserProfile(identity.sub);
    if (!userProfile || !userProfile.isActive) {
      return {
        success: false,
        error: 'User profile not found or inactive'
      };
    }

    // Check permissions
    if (!userProfile.permissions.includes('orders:read')) {
      return {
        success: false,
        error: 'Insufficient permissions for order access'
      };
    }

    // Calculate allowed org-pol access combinations for the user
    const allowedOrgPolAccess = calculateAllowedOrgPolAccess(
      userProfile.salesOrganizations,
      userProfile.allowedCountryPols
    );

    // Query orders with multi-tenant filtering
    const orders = await queryOrdersByOrgPolAccess(allowedOrgPolAccess, filter, limit || 50);

    // Log audit event for data access
    await logAuditEvent({
      eventType: 'DATA_ACCESS',
      userId: identity.sub,
      resourceType: 'ORDER',
      action: 'LIST_ORDERS',
      details: {
        filter: filter,
        allowedAccess: allowedOrgPolAccess
      },
      success: true
    });

    return {
      success: true,
      data: orders,
      count: orders.length
    };

  } catch (error) {
    console.error('Error listing orders:', error);
    return {
      success: false,
      error: 'Failed to list orders'
    };
  }
}

/**
 * List orders by status with multi-tenant filtering
 */
async function listOrdersByStatus(status: string, identity: any, limit?: number): Promise<OrderManagementResponse> {
  try {
    // Get user profile for authorization
    const userProfile = await getUserProfile(identity.sub);
    if (!userProfile || !userProfile.isActive) {
      return {
        success: false,
        error: 'User profile not found or inactive'
      };
    }

    // Check permissions
    if (!userProfile.permissions.includes('orders:read')) {
      return {
        success: false,
        error: 'Insufficient permissions for order access'
      };
    }

    // Calculate allowed org-pol access combinations
    const allowedOrgPolAccess = calculateAllowedOrgPolAccess(
      userProfile.salesOrganizations,
      userProfile.allowedCountryPols
    );

    // Query orders by status with org-pol filtering
    const orders = await queryOrdersByStatus(status, allowedOrgPolAccess, limit || 50);

    return {
      success: true,
      data: orders,
      count: orders.length
    };

  } catch (error) {
    console.error('Error listing orders by status:', error);
    return {
      success: false,
      error: 'Failed to list orders by status'
    };
  }
}

// Helper Functions

/**
 * Generate unique order ID
 */
function generateOrderId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substr(2, 8);
  return `order_${timestamp}_${randomPart}`;
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
    console.error('Error getting user profile:', error);
    return null;
  }
}

/**
 * Save order to DynamoDB
 */
async function saveOrder(order: Order): Promise<void> {
  const tableName = process.env.ORDER_TABLE_NAME || `Order-${process.env.AMPLIFY_BRANCH}`;

  const command = new PutCommand({
    TableName: tableName,
    Item: order
  });

  await docClient.send(command);
}

/**
 * Get order by ID from DynamoDB
 */
async function getOrderById(orderId: string): Promise<Order | null> {
  try {
    const tableName = process.env.ORDER_TABLE_NAME || `Order-${process.env.AMPLIFY_BRANCH}`;

    const command = new GetCommand({
      TableName: tableName,
      Key: { id: orderId }
    });

    const response = await docClient.send(command);
    return response.Item as Order || null;

  } catch (error) {
    console.error('Error getting order by ID:', error);
    return null;
  }
}

/**
 * Delete order by ID from DynamoDB
 */
async function deleteOrderById(orderId: string): Promise<void> {
  const tableName = process.env.ORDER_TABLE_NAME || `Order-${process.env.AMPLIFY_BRANCH}`;

  const command = new DeleteCommand({
    TableName: tableName,
    Key: { id: orderId }
  });

  await docClient.send(command);
}

/**
 * Find order by order number and sales organization
 */
async function findOrderByNumber(orderNumber: string, salesOrganization: string): Promise<Order | null> {
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
    return response.Items && response.Items.length > 0 ? response.Items[0] as Order : null;

  } catch (error) {
    console.error('Error finding order by number:', error);
    return null;
  }
}

/**
 * Query orders by org-pol access combinations
 */
async function queryOrdersByOrgPolAccess(allowedAccess: string[], filter?: any, limit?: number): Promise<Order[]> {
  try {
    const tableName = process.env.ORDER_TABLE_NAME || `Order-${process.env.AMPLIFY_BRANCH}`;
    const orders: Order[] = [];

    // Query each allowed org-pol combination
    for (const orgPolAccess of allowedAccess) {
      const command = new QueryCommand({
        TableName: tableName,
        IndexName: 'orgPolAccess-index',
        KeyConditionExpression: 'orgPolAccess = :orgPolAccess',
        ExpressionAttributeValues: {
          ':orgPolAccess': orgPolAccess
        },
        Limit: limit ? Math.ceil(limit / allowedAccess.length) : undefined
      });

      const response = await docClient.send(command);
      if (response.Items) {
        orders.push(...(response.Items as Order[]));
      }
    }

    return orders.slice(0, limit);

  } catch (error) {
    console.error('Error querying orders by org-pol access:', error);
    return [];
  }
}

/**
 * Query orders by status with org-pol filtering
 */
async function queryOrdersByStatus(status: string, allowedAccess: string[], limit?: number): Promise<Order[]> {
  try {
    const tableName = process.env.ORDER_TABLE_NAME || `Order-${process.env.AMPLIFY_BRANCH}`;

    const command = new QueryCommand({
      TableName: tableName,
      IndexName: 'status-index',
      KeyConditionExpression: '#status = :status',
      FilterExpression: 'orgPolAccess IN (' + allowedAccess.map((_, i) => `:access${i}`).join(',') + ')',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': status,
        ...allowedAccess.reduce((acc, access, i) => ({ ...acc, [`:access${i}`]: access }), {})
      },
      Limit: limit
    });

    const response = await docClient.send(command);
    return response.Items as Order[] || [];

  } catch (error) {
    console.error('Error querying orders by status:', error);
    return [];
  }
}

/**
 * Calculate allowed org-pol access combinations for a user
 */
function calculateAllowedOrgPolAccess(salesOrganizations: string[], allowedCountryPols: string[]): string[] {
  const combinations: string[] = [];

  for (const org of salesOrganizations) {
    for (const country of allowedCountryPols) {
      combinations.push(`${org}#${country}`);
    }
  }

  return combinations;
}

/**
 * Validate user access to an order
 */
function validateUserAccessToOrder(order: Order, userProfile: UserProfile): boolean {
  if (!order.orgPolAccess) {
    return false;
  }

  const [salesOrg, countryPol] = order.orgPolAccess.split('#');

  return userProfile.salesOrganizations.includes(salesOrg) &&
    userProfile.allowedCountryPols.includes(countryPol);
}

/**
 * Validate status transition
 */
function validateStatusTransition(currentStatus: string, newStatus: string): boolean {
  const validTransitions: Record<string, string[]> = {
    'DRAFT': ['CONFIRMED', 'CANCELLED'],
    'CONFIRMED': ['IN_TRANSIT', 'CANCELLED'],
    'IN_TRANSIT': ['DELIVERED'],
    'DELIVERED': [], // No transitions from delivered
    'CANCELLED': [] // No transitions from cancelled
  };

  const allowed = validTransitions[currentStatus] || [];
  return allowed.includes(newStatus);
}

/**
 * Log audit event
 */
async function logAuditEvent(auditEvent: any, requestContext?: any): Promise<void> {
  try {
    // In a real implementation, you would call the audit logger Lambda
    // For now, just log to CloudWatch
    console.log('Audit Event:', JSON.stringify({
      ...auditEvent,
      timestamp: new Date().toISOString(),
      ipAddress: requestContext?.identity?.sourceIp || 'unknown',
      userAgent: requestContext?.identity?.userAgent || 'unknown'
    }, null, 2));

  } catch (error) {
    console.error('Error logging audit event:', error);
    // Don't fail the main operation if audit logging fails
  }
}
