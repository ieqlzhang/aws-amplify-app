import { Handler } from 'aws-lambda';
import { Pool, PoolClient, Client } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// Types
interface DatabaseSecret {
  username: string;
  password: string;
  host: string;
  port: number;
  dbname: string;
}

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: {
    rejectUnauthorized: boolean;
  };
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
  max: number;
  min: number;
}

interface Order {
  id: string;
  orderNumber: string;
  content?: string | null;
  status: string;
  carrier?: string | null;
  resourceType?: string | null;
  departureLocation?: string | null;
  destinationLocation?: string | null;
  isDone: boolean;
  createdAt: string;
  updatedAt: string;
  owner: string;
}

interface GraphQLEvent {
  info: {
    fieldName: string;
    parentTypeName: string;
    selectionSetList?: string[];
  };
  arguments: Record<string, any>;
  identity?: {
    sub: string;
    username: string;
    claims: Record<string, any>;
  };
  source?: Record<string, any>;
  request: {
    headers: Record<string, string>;
  };
  prev?: {
    result: Record<string, any>;
  };
}

interface GraphQLResponse<T = any> {
  data?: T;
  errors?: Array<{
    message: string;
    extensions?: {
      code: string;
    };
    path?: Array<string | number>;
  }>;
}

// Global connection pool - reused across Lambda invocations
let connectionPool: Pool | null = null;

// Order status constants
const ORDER_STATUSES = [
  'pending',
  'confirmed', 
  'in_transit',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'returned'
];

// Validation constants
const MAX_ORDER_CONTENT_LENGTH = 2000;
const MAX_LOCATION_LENGTH = 500;
const MAX_CARRIER_LENGTH = 100;
const MAX_RESOURCE_TYPE_LENGTH = 100;
const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

// Custom error classes
class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

class UnauthorizedError extends Error {
  constructor(message: string = 'Unauthorized access') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

class OrderNotFoundError extends Error {
  constructor(id: string) {
    super(`Order with ID ${id} not found`);
    this.name = 'OrderNotFoundError';
  }
}

class DatabaseError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message);
    this.name = 'DatabaseError';
  }
}

// Database connection management
async function getDatabaseCredentials(): Promise<DatabaseSecret> {
  const secretArn = process.env.DB_SECRET_ARN;
  if (!secretArn) {
    throw new DatabaseError('DB_SECRET_ARN environment variable is not set');
  }

  const secretsClient = new SecretsManagerClient({ 
    region: process.env.AWS_REGION || 'us-east-1' 
  });
  
  const command = new GetSecretValueCommand({
    SecretId: secretArn,
  });

  try {
    const response = await secretsClient.send(command);
    if (!response.SecretString) {
      throw new DatabaseError('Database secret not found');
    }

    return JSON.parse(response.SecretString);
  } catch (error) {
    console.error('Error retrieving database credentials:', error);
    throw new DatabaseError('Failed to retrieve database credentials');
  }
}

async function createDatabaseConfig(): Promise<DatabaseConfig> {
  const credentials = await getDatabaseCredentials();
  
  return {
    host: process.env.DB_ENDPOINT || credentials.host,
    port: credentials.port || 5432,
    database: process.env.DB_NAME || 'ordermanagement',
    user: credentials.username,
    password: credentials.password,
    ssl: {
      rejectUnauthorized: false, // Required for RDS SSL
    },
    connectionTimeoutMillis: 10000, // 10 seconds
    idleTimeoutMillis: 30000, // 30 seconds
    max: 10, // Maximum pool size
    min: 1,  // Minimum pool size
  };
}

async function getConnectionPool(): Promise<Pool> {
  if (!connectionPool) {
    console.log('Creating new database connection pool');
    const config = await createDatabaseConfig();
    
    connectionPool = new Pool(config);
    
    // Handle pool errors
    connectionPool.on('error', (err) => {
      console.error('Database pool error:', err);
    });

    connectionPool.on('connect', (client) => {
      console.log('New client connected to database');
    });

    connectionPool.on('remove', (client) => {
      console.log('Client removed from database pool');
    });
  }

  return connectionPool;
}

async function executeQuery<T = any>(query: string, params: any[] = []): Promise<T[]> {
  const pool = await getConnectionPool();
  const client = await pool.connect();
  
  try {
    console.log('Executing query:', query.substring(0, 100) + '...');
    const result = await client.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('Database query error:', error);
    console.error('Query:', query);
    console.error('Params:', params);
    throw error;
  } finally {
    client.release();
  }
}

// Utility functions
function validateUuid(uuidString: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuidString);
}

function generateOrderNumber(): string {
  const randomId = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `ORD-${randomId}`;
}

function getUserIdFromEvent(event: GraphQLEvent): string {
  // Try to get user ID from identity
  if (event.identity?.sub) {
    return event.identity.sub;
  }
  
  throw new UnauthorizedError('User not authenticated');
}

function transformDbRowToOrder(row: any): Order {
  return {
    id: row.id,
    orderNumber: row.order_number,
    content: row.content,
    status: row.status,
    carrier: row.carrier,
    resourceType: row.resource_type,
    departureLocation: row.departure_location,
    destinationLocation: row.destination_location,
    isDone: row.is_done,
    createdAt: row.created_at?.toISOString() || '',
    updatedAt: row.updated_at?.toISOString() || '',
    owner: row.owner_id
  };
}

function validateOrderInput(orderData: Record<string, any>): Record<string, any> {
  const validated: Record<string, any> = {};
  
  // Validate content
  if ('content' in orderData && orderData.content !== null) {
    if (typeof orderData.content !== 'string') {
      throw new ValidationError('Content must be a string');
    }
    if (orderData.content.length > MAX_ORDER_CONTENT_LENGTH) {
      throw new ValidationError(`Content must be ${MAX_ORDER_CONTENT_LENGTH} characters or less`);
    }
    validated.content = orderData.content.trim() || null;
  }
  
  // Validate status
  if ('status' in orderData && orderData.status !== null) {
    if (!ORDER_STATUSES.includes(orderData.status)) {
      throw new ValidationError(`Status must be one of: ${ORDER_STATUSES.join(', ')}`);
    }
    validated.status = orderData.status;
  }
  
  // Validate carrier
  if ('carrier' in orderData && orderData.carrier !== null) {
    if (typeof orderData.carrier !== 'string') {
      throw new ValidationError('Carrier must be a string');
    }
    if (orderData.carrier.length > MAX_CARRIER_LENGTH) {
      throw new ValidationError(`Carrier must be ${MAX_CARRIER_LENGTH} characters or less`);
    }
    validated.carrier = orderData.carrier.trim() || null;
  }
  
  // Similar validation for other fields...
  if ('resourceType' in orderData && orderData.resourceType !== null) {
    validated.resource_type = orderData.resourceType;
  }
  
  if ('departureLocation' in orderData && orderData.departureLocation !== null) {
    validated.departure_location = orderData.departureLocation;
  }
  
  if ('destinationLocation' in orderData && orderData.destinationLocation !== null) {
    validated.destination_location = orderData.destinationLocation;
  }
  
  if ('isDone' in orderData && orderData.isDone !== null) {
    validated.is_done = orderData.isDone;
  }
  
  return validated;
}

function createGraphQLResponse<T>(data?: T, errors?: any[]): GraphQLResponse<T> {
  const response: GraphQLResponse<T> = {};
  
  if (data !== undefined) {
    response.data = data;
  }
  
  if (errors) {
    response.errors = errors;
  }
  
  return response;
}

function createErrorResponse(message: string, errorType: string = 'Error'): GraphQLResponse {
  return createGraphQLResponse(undefined, [{
    message,
    extensions: {
      code: errorType
    }
  }]);
}

// Resolver functions
async function listOrdersResolver(event: GraphQLEvent): Promise<GraphQLResponse> {
  try {
    const userId = getUserIdFromEvent(event);
    const args = event.arguments || {};
    const filter = args.filter || {};
    
    // Build query with basic owner filter
    let query = `
      SELECT id, order_number, content, status, carrier, resource_type,
             departure_location, destination_location, is_done,
             created_at, updated_at, owner_id
      FROM orders
      WHERE owner_id = $1
    `;
    
    const params: any[] = [userId];
    let paramIndex = 2;
    
    // Add filters
    if (filter.status) {
      query += ` AND status = $${paramIndex}`;
      params.push(filter.status);
      paramIndex++;
    }
    
    if (filter.carrier) {
      query += ` AND carrier ILIKE $${paramIndex}`;
      params.push(`%${filter.carrier}%`);
      paramIndex++;
    }
    
    // Add pagination
    const limit = Math.min(args.limit || DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
    const offset = args.offset || 0;
    
    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    // Execute query
    const rows = await executeQuery(query, params);
    const orders = rows.map(transformDbRowToOrder);
    
    console.log(`Listed ${orders.length} orders for user ${userId}`);
    
    return createGraphQLResponse({
      items: orders,
      total: orders.length,
      limit,
      offset
    });
    
  } catch (error) {
    console.error('Error in listOrdersResolver:', error);
    if (error instanceof UnauthorizedError) {
      return createErrorResponse(error.message, 'UNAUTHORIZED');
    }
    return createErrorResponse('Failed to list orders', 'INTERNAL_ERROR');
  }
}

async function getOrderResolver(event: GraphQLEvent): Promise<GraphQLResponse> {
  try {
    const userId = getUserIdFromEvent(event);
    const orderId = event.arguments?.id;
    
    if (!orderId) {
      return createErrorResponse('Order ID is required', 'VALIDATION_ERROR');
    }
    
    if (!validateUuid(orderId)) {
      return createErrorResponse('Invalid order ID format', 'VALIDATION_ERROR');
    }
    
    const query = `
      SELECT id, order_number, content, status, carrier, resource_type,
             departure_location, destination_location, is_done,
             created_at, updated_at, owner_id
      FROM orders
      WHERE id = $1 AND owner_id = $2
    `;
    
    const rows = await executeQuery(query, [orderId, userId]);
    
    if (rows.length === 0) {
      return createErrorResponse('Order not found', 'NOT_FOUND');
    }
    
    const order = transformDbRowToOrder(rows[0]);
    
    console.log(`Retrieved order ${orderId} for user ${userId}`);
    return createGraphQLResponse(order);
    
  } catch (error) {
    console.error('Error in getOrderResolver:', error);
    if (error instanceof UnauthorizedError) {
      return createErrorResponse(error.message, 'UNAUTHORIZED');
    }
    return createErrorResponse('Failed to get order', 'INTERNAL_ERROR');
  }
}

async function createOrderResolver(event: GraphQLEvent): Promise<GraphQLResponse> {
  try {
    const userId = getUserIdFromEvent(event);
    const inputData = event.arguments?.input || {};
    
    // Validate input
    const validatedData = validateOrderInput(inputData);
    
    // Generate order number
    const orderNumber = generateOrderNumber();
    
    // Set defaults
    validatedData.status = validatedData.status || 'pending';
    validatedData.is_done = validatedData.is_done || false;
    
    // Build insert query
    const fields = ['order_number', 'owner_id', ...Object.keys(validatedData)];
    const placeholders = fields.map((_, index) => `$${index + 1}`).join(', ');
    const fieldNames = fields.join(', ');
    
    const query = `
      INSERT INTO orders (${fieldNames})
      VALUES (${placeholders})
      RETURNING id, order_number, content, status, carrier, resource_type,
               departure_location, destination_location, is_done,
               created_at, updated_at, owner_id
    `;
    
    const values = [orderNumber, userId, ...Object.values(validatedData)];
    const rows = await executeQuery(query, values);
    
    if (rows.length === 0) {
      return createErrorResponse('Failed to create order', 'DATABASE_ERROR');
    }
    
    const order = transformDbRowToOrder(rows[0]);
    
    console.log(`Created order ${order.id} for user ${userId}`);
    return createGraphQLResponse(order);
    
  } catch (error) {
    console.error('Error in createOrderResolver:', error);
    if (error instanceof UnauthorizedError) {
      return createErrorResponse(error.message, 'UNAUTHORIZED');
    }
    if (error instanceof ValidationError) {
      return createErrorResponse(error.message, 'VALIDATION_ERROR');
    }
    return createErrorResponse('Failed to create order', 'INTERNAL_ERROR');
  }
}

async function updateOrderResolver(event: GraphQLEvent): Promise<GraphQLResponse> {
  try {
    const userId = getUserIdFromEvent(event);
    const inputData = event.arguments?.input || {};
    const orderId = inputData.id;
    
    if (!orderId) {
      return createErrorResponse('Order ID is required', 'VALIDATION_ERROR');
    }
    
    if (!validateUuid(orderId)) {
      return createErrorResponse('Invalid order ID format', 'VALIDATION_ERROR');
    }
    
    // Validate input (excluding ID)
    const updateData = { ...inputData };
    delete updateData.id;
    const validatedData = validateOrderInput(updateData);
    
    if (Object.keys(validatedData).length === 0) {
      return createErrorResponse('No fields to update', 'VALIDATION_ERROR');
    }
    
    // Build update query
    const setClauses = Object.keys(validatedData).map((field, index) => 
      `${field} = $${index + 1}`
    );
    setClauses.push('updated_at = NOW()');
    
    const query = `
      UPDATE orders
      SET ${setClauses.join(', ')}
      WHERE id = $${Object.keys(validatedData).length + 1} AND owner_id = $${Object.keys(validatedData).length + 2}
      RETURNING id, order_number, content, status, carrier, resource_type,
               departure_location, destination_location, is_done,
               created_at, updated_at, owner_id
    `;
    
    const values = [...Object.values(validatedData), orderId, userId];
    const rows = await executeQuery(query, values);
    
    if (rows.length === 0) {
      return createErrorResponse('Order not found or access denied', 'NOT_FOUND');
    }
    
    const order = transformDbRowToOrder(rows[0]);
    
    console.log(`Updated order ${orderId} for user ${userId}`);
    return createGraphQLResponse(order);
    
  } catch (error) {
    console.error('Error in updateOrderResolver:', error);
    if (error instanceof UnauthorizedError) {
      return createErrorResponse(error.message, 'UNAUTHORIZED');
    }
    if (error instanceof ValidationError) {
      return createErrorResponse(error.message, 'VALIDATION_ERROR');
    }
    return createErrorResponse('Failed to update order', 'INTERNAL_ERROR');
  }
}

async function deleteOrderResolver(event: GraphQLEvent): Promise<GraphQLResponse> {
  try {
    const userId = getUserIdFromEvent(event);
    const orderId = event.arguments?.id;
    
    if (!orderId) {
      return createErrorResponse('Order ID is required', 'VALIDATION_ERROR');
    }
    
    if (!validateUuid(orderId)) {
      return createErrorResponse('Invalid order ID format', 'VALIDATION_ERROR');
    }
    
    const query = `
      DELETE FROM orders
      WHERE id = $1 AND owner_id = $2
      RETURNING id
    `;
    
    const rows = await executeQuery(query, [orderId, userId]);
    
    if (rows.length === 0) {
      return createErrorResponse('Order not found or access denied', 'NOT_FOUND');
    }
    
    console.log(`Deleted order ${orderId} for user ${userId}`);
    return createGraphQLResponse({ id: orderId, deleted: true });
    
  } catch (error) {
    console.error('Error in deleteOrderResolver:', error);
    if (error instanceof UnauthorizedError) {
      return createErrorResponse(error.message, 'UNAUTHORIZED');
    }
    return createErrorResponse('Failed to delete order', 'INTERNAL_ERROR');
  }
}

// Main handler
export const handler: Handler<GraphQLEvent, GraphQLResponse> = async (event, context) => {
  const startTime = Date.now();
  
  try {
    console.log('Order resolver invoked:', JSON.stringify(event, null, 2));
    
    // Extract field name to determine which resolver to execute
    const fieldName = event.info?.fieldName;
    
    if (!fieldName) {
      return createErrorResponse('Invalid GraphQL field name', 'INVALID_REQUEST');
    }
    
    let result: GraphQLResponse;
    
    // Route to appropriate resolver
    switch (fieldName) {
      case 'listOrders':
        result = await listOrdersResolver(event);
        break;
      case 'getOrder':
        result = await getOrderResolver(event);
        break;
      case 'createOrder':
        result = await createOrderResolver(event);
        break;
      case 'updateOrder':
        result = await updateOrderResolver(event);
        break;
      case 'deleteOrder':
        result = await deleteOrderResolver(event);
        break;
      default:
        return createErrorResponse(`Unknown resolver: ${fieldName}`, 'INVALID_RESOLVER');
    }
    
    const duration = Date.now() - startTime;
    console.log(`${fieldName} resolver completed in ${duration}ms`);
    
    return result;
    
  } catch (error) {
    console.error('Unhandled error in order resolver:', error);
    return createErrorResponse('Internal server error', 'INTERNAL_ERROR');
  }
};
