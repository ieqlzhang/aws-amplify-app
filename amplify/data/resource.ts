import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { authHandler } from '../functions/auth-handler/resource';

/*== OCEAN ORDER MANAGEMENT SYSTEM SCHEMA ===============================
This schema defines the data models for the multi-tenant ocean order 
management system with sophisticated authorization based on sales 
organizations and country ports of loading.
=========================================================================*/

const schema = a.schema({
  // Order Model - Core business entity
  Order: a
    .model({
      // Multi-tenant fields
      salesOrganization: a.string().required(),
      countryPortOfLoading: a.string().required(), 
      orgPolAccess: a.string().required(), // Computed: "salesOrg#country"
      
      // Core fields
      orderNumber: a.string().required(),
      shipTo: a.string(),
      status: a.enum(['DRAFT', 'CONFIRMED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED']),
      isGoodIssued: a.boolean().default(false),
      
      // Shipping details
      carrier: a.string(),
      resourceType: a.string(),
      departureLocation: a.string(),
      destinationLocation: a.string(),
      countryPortOfDestination: a.string(),
      pol: a.string(), // Port of Loading
      pod: a.string(), // Port of Destination
      etd: a.datetime(), // Estimated Time of Departure
      eta: a.datetime(), // Estimated Time of Arrival
      
      // Business logic fields
      trackingNumber: a.string(),
      estimatedDelivery: a.datetime(),
      containerType: a.string(),
      
      // Audit fields
      createdBy: a.string(),
      lastModifiedBy: a.string(),
    })
    .secondaryIndexes((index) => [
      index('orgPolAccess'), // Multi-tenant queries
      index('orderNumber'), // Order number lookups
      index('status'), // Status-based filtering
      index('salesOrganization'), // Sales org queries
    ])
    .authorization((allow) => [
      // Custom authorization using our Lambda function
      allow.custom(),
    ]),

  // UserProfile Model - User authorization and permissions
  UserProfile: a
    .model({
      userId: a.string().required(),
      email: a.email(),
      salesOrganizations: a.string().array(), // ["NL20", "1S20"]
      allowedCountryPols: a.string().array(), // ["CN", "TH"] 
      permissions: a.string().array(), // ["orders:read", "orders:write"]
      isActive: a.boolean().default(false),
    })
    .identifier(['userId'])
    .authorization((allow) => [
      // Only authenticated users can read their own profile
      allow.owner(),
      // Custom authorization for admin operations
      allow.custom(),
    ]),

  // AuditLog Model - Security and compliance tracking
  AuditLog: a
    .model({
      eventType: a.enum([
        'ORDER_CREATED', 
        'ORDER_UPDATED', 
        'ORDER_DELETED', 
        'ORDER_VIEWED',
        'USER_LOGIN',
        'USER_PROFILE_UPDATED',
        'AUTHORIZATION_FAILURE',
        'DATA_ACCESS'
      ]),
      userId: a.string().required(),
      resourceType: a.enum(['ORDER', 'USER_PROFILE', 'SYSTEM']),
      resourceId: a.string(),
      action: a.string().required(),
      details: a.json(),
      ipAddress: a.string(),
      userAgent: a.string(),
      orgPolAccess: a.string(),
      success: a.boolean().required(),
      errorMessage: a.string(),
      ttl: a.integer(), // TTL for automatic cleanup
    })
    .secondaryIndexes((index) => [
      index('userId'), // User activity queries
      index('eventType'), // Event type filtering
      index('resourceId'), // Resource-specific audit
    ])
    .authorization((allow) => [
      // Only system and admin users can access audit logs
      allow.custom(),
    ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    // Primary authorization mode using Cognito User Pool
    defaultAuthorizationMode: 'userPool',
    // Custom authorization for complex multi-tenant logic
    lambdaAuthorizationMode: {
      function: authHandler,
    },
  },
});

/*== USAGE EXAMPLES ======================================================
Multi-tenant Order Management Examples:

// Create an order (requires user to have access to salesOrg + country)
const newOrder = await client.models.Order.create({
  salesOrganization: "NL20",
  countryPortOfLoading: "CN", 
  orgPolAccess: "NL20#CN", // Will be auto-computed
  orderNumber: "ORD123456",
  status: "DRAFT",
  isGoodIssued: false
});

// Query orders for user's authorized org/pol combinations
const userOrders = await client.models.Order.list({
  filter: {
    orgPolAccess: { 
      in: ["NL20#CN", "NL20#TH", "1S20#CN"] // User's allowed combinations
    }
  }
});

// Get user profile
const userProfile = await client.models.UserProfile.get({
  userId: "current-user-id"
});

// Query audit trail (admin only)
const auditTrail = await client.models.AuditLog.list({
  filter: {
    userId: { eq: "target-user-id" },
    eventType: { eq: "ORDER_CREATED" }
  }
});
=========================================================================*/
