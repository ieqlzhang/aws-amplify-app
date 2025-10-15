# Ocean Order Management System Implementation Plan

## Overview
Transform the existing Amplify Gen2 Todo app into a multi-tenant ocean order management system with sophisticated authorization based on sales organizations and country ports of loading.

## Current State Analysis
- Basic Amplify Gen2 setup with Vite + React frontend
- Simple Cognito User Pool authentication (email-based)
- Single Todo model with owner-based authorization
- Standard AppSync GraphQL API with DynamoDB

## Target Architecture

### Data Models

#### Order Model
```typescript
Order {
  id: string;
  // Multi-tenant fields
  salesOrganization: string;    // "NL20", "1S20", "TH20", "B820"
  countryPortOfLoading: string; // "CN", "TH"
  orgPolAccess: string;         // "NL20#CN", "1S20#TH"
  
  // Core fields
  orderNumber: string;
  shipTo?: string;
  status: string;
  isGoodIssued: boolean;
  
  // Shipping details
  carrier?: string;
  resourceType?: string;
  departureLocation?: string;
  destinationLocation?: string;
  countryPortOfDestination?: string;
  pol?: string;  // Port of Loading
  pod?: string;  // Port of Destination
  etd?: string;  // Estimated Time of Departure (ISO date)
  eta?: string;  // Estimated Time of Arrival (ISO date)
  
  // Business logic fields
  trackingNumber?: string;
  estimatedDelivery?: string;  // ISO datetime
  containerType?: string;
  
  // Audit fields
  createdBy?: string;
  lastModifiedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}
```

#### UserProfile Model
```typescript
UserProfile {
  userId: string;
  email?: string;
  salesOrganizations: string[];  // ["NL20", "1S20"]
  allowedCountryPols: string[];  // ["CN", "TH"]
  permissions: string[];         // ["orders:read", "orders:write"]
  isActive: boolean;
}
```

### Authorization Logic
Users can only access orders where:
```
order.orgPolAccess ∈ (user.salesOrganizations × user.allowedCountryPols)
```

Example: User with `salesOrganizations: ["NL20", "1S20"]` and `allowedCountryPols: ["CN", "TH"]` can access orders with `orgPolAccess` values: "NL20#CN", "NL20#TH", "1S20#CN", "1S20#TH".

## Implementation Phases

### Phase 1: Backend Infrastructure Setup
**Duration: 1-2 days**

#### 1.1 Update Amplify Backend Configuration
- [ ] Modify `amplify/backend.ts` to include Lambda functions
- [ ] Configure custom authorization modes
- [ ] Set up environment variables for multi-tenant configuration

#### 1.2 Lambda Functions Structure
Create Lambda functions directory structure:
```
amplify/
├── backend.ts
├── functions/
│   ├── auth-handler/
│   │   ├── handler.ts
│   │   └── resource.ts
│   ├── order-validator/
│   │   ├── handler.ts
│   │   └── resource.ts
│   ├── user-profile-manager/
│   │   ├── handler.ts
│   │   └── resource.ts
│   └── audit-logger/
│       ├── handler.ts
│       └── resource.ts
```

#### 1.3 Dependencies Update
- [ ] Add Lambda-related dependencies
- [ ] Add DynamoDB utilities
- [ ] Add JWT handling libraries

### Phase 2: Data Schema Transformation
**Duration: 1 day**

#### 2.1 Replace Todo Schema
- [ ] Remove existing Todo model
- [ ] Implement Order model with all fields
- [ ] Implement UserProfile model
- [ ] Configure proper field types and validations

#### 2.2 DynamoDB Configuration
- [ ] Set up Global Secondary Indexes (GSI):
  - `orgPolAccess-index` for efficient multi-tenant queries
  - `orderNumber-index` for order number lookups
  - `status-createdAt-index` for status-based filtering
- [ ] Configure TTL if needed for audit logs
- [ ] Set up proper partition and sort keys

#### 2.3 Authorization Rules
- [ ] Replace simple `allow.owner()` with custom authorization
- [ ] Implement function-based authorization using Lambda
- [ ] Configure field-level permissions

### Phase 3: Authentication & User Management
**Duration: 2 days**

#### 3.1 Cognito User Pool Enhancement
- [ ] Add custom attributes to Cognito User Pool:
  - `custom:salesOrganizations`
  - `custom:allowedCountryPols`
  - `custom:permissions`
- [ ] Configure user registration flow
- [ ] Set up user groups for different roles

#### 3.2 User Profile Management Lambda
```typescript
// Functions: 
// - createUserProfile (Post-confirmation trigger)
// - updateUserProfile
// - getUserProfile
// - validateUserAccess
```

#### 3.3 Custom Authorization Lambda
```typescript
// Core function: authorizeRequest
// - Validates JWT token
// - Extracts user profile
// - Checks permissions against requested resources
// - Returns authorization decision
```

### Phase 4: Order Management System
**Duration: 2-3 days**

#### 4.1 Order CRUD Operations
- [ ] Create Order Lambda functions:
  - `createOrder` - with validation and audit
  - `updateOrder` - with authorization checks
  - `deleteOrder` - with soft delete option
  - `listOrders` - with multi-tenant filtering
  - `getOrder` - with authorization validation

#### 4.2 Business Logic Implementation
- [ ] Order validation rules
- [ ] Status transition logic
- [ ] Audit trail implementation
- [ ] Integration with external systems (if needed)

#### 4.3 Multi-Tenant Data Access
```typescript
// Filtering logic for each query:
const allowedOrgPolAccess = user.salesOrganizations
  .flatMap(org => 
    user.allowedCountryPols.map(country => `${org}#${country}`)
  );

// DynamoDB query with GSI
const queryParams = {
  IndexName: 'orgPolAccess-index',
  KeyConditionExpression: 'orgPolAccess = :orgPolAccess',
  ExpressionAttributeValues: {
    ':orgPolAccess': { S: orgPolAccessValue }
  }
};
```

### Phase 5: API Security & AppSync Configuration
**Duration: 1-2 days**

#### 5.1 AppSync Custom Authorization
- [ ] Configure custom authorization resolver
- [ ] Implement field-level security
- [ ] Set up request/response mapping templates

#### 5.2 GraphQL Schema Updates
- [ ] Define Order and UserProfile types
- [ ] Create mutations with proper authorization
- [ ] Set up subscriptions for real-time updates
- [ ] Implement filtering and pagination

#### 5.3 Security Hardening
- [ ] Input validation and sanitization
- [ ] Rate limiting configuration
- [ ] Error handling and logging
- [ ] Security headers and CORS setup

### Phase 6: Testing & Validation
**Duration: 2 days**

#### 6.1 Unit Tests
- [ ] Lambda function unit tests
- [ ] Authorization logic tests
- [ ] Data validation tests
- [ ] Multi-tenant isolation tests

#### 6.2 Integration Tests
- [ ] End-to-end API tests
- [ ] Cross-tenant data access tests
- [ ] Permission boundary tests
- [ ] Performance tests for large datasets

#### 6.3 Security Testing
- [ ] Authentication bypass attempts
- [ ] Authorization escalation tests
- [ ] Data leakage between tenants
- [ ] Input injection tests

### Phase 7: Frontend Updates
**Duration: 2-3 days**

#### 7.1 Update React Components
- [ ] Replace Todo components with Order management
- [ ] Implement user profile display
- [ ] Add multi-select filters for organizations/countries
- [ ] Create order creation/editing forms

#### 7.2 State Management
- [ ] Update API client configuration
- [ ] Implement proper error handling
- [ ] Add loading states and pagination
- [ ] Implement real-time updates via subscriptions

#### 7.3 UI/UX Enhancements
- [ ] Order dashboard with filtering
- [ ] Responsive design for mobile devices
- [ ] Export functionality
- [ ] Advanced search capabilities

## Technical Implementation Details

### Lambda Function Examples

#### Authorization Handler
```typescript
export const handler = async (event: AppSyncAuthorizerEvent) => {
  try {
    const token = extractJWTToken(event.authorizationToken);
    const userProfile = await getUserProfile(token.sub);
    
    const allowedAccess = calculateAllowedOrgPolAccess(
      userProfile.salesOrganizations,
      userProfile.allowedCountryPols
    );
    
    const resourceAccess = extractResourceRequirements(event);
    const isAuthorized = validateAccess(allowedAccess, resourceAccess);
    
    return {
      isAuthorized,
      resolverContext: {
        userProfile,
        allowedAccess
      }
    };
  } catch (error) {
    return { isAuthorized: false };
  }
};
```

#### Order Validator
```typescript
export const handler = async (event: any) => {
  const { operation, arguments: args, identity } = event;
  
  switch (operation) {
    case 'createOrder':
      return validateCreateOrder(args.input, identity);
    case 'updateOrder':
      return validateUpdateOrder(args.input, identity);
    default:
      throw new Error('Unknown operation');
  }
};

const validateCreateOrder = async (orderInput: any, identity: any) => {
  // Validate required fields
  if (!orderInput.orderNumber || !orderInput.salesOrganization) {
    throw new Error('Missing required fields');
  }
  
  // Set orgPolAccess
  orderInput.orgPolAccess = `${orderInput.salesOrganization}#${orderInput.countryPortOfLoading}`;
  
  // Verify user has access to this org/pol combination
  const userProfile = await getUserProfile(identity.sub);
  const hasAccess = validateUserAccessToOrgPol(
    userProfile,
    orderInput.salesOrganization,
    orderInput.countryPortOfLoading
  );
  
  if (!hasAccess) {
    throw new Error('Unauthorized access to this organization/port combination');
  }
  
  return orderInput;
};
```

### DynamoDB Schema Design

#### Order Table
```
Primary Key: id (string)
GSI1: orgPolAccess (string) -> createdAt (string)
GSI2: orderNumber (string) -> id (string)
GSI3: status (string) -> createdAt (string)
```

#### UserProfile Table
```
Primary Key: userId (string)
Attributes: email, salesOrganizations, allowedCountryPols, permissions, isActive
```

## Deployment Strategy

### Environment Setup
1. **Development Environment**
   - Local Amplify sandbox
   - Test data seeding
   - Mock external services

2. **Staging Environment**
   - Full Amplify deployment
   - Production-like data
   - Performance testing

3. **Production Environment**
   - Blue-green deployment
   - Monitoring and alerting
   - Backup and disaster recovery

### Migration Strategy
1. **Data Migration**
   - Export existing Todo data (if needed)
   - Transform to Order format
   - Import with proper tenant assignments

2. **User Migration**
   - Extract user information
   - Create UserProfile records
   - Assign appropriate permissions

## Monitoring & Maintenance

### Observability
- [ ] CloudWatch logs for all Lambda functions
- [ ] X-Ray tracing for performance monitoring
- [ ] Custom metrics for business KPIs
- [ ] Alerting for authorization failures

### Performance Optimization
- [ ] DynamoDB auto-scaling
- [ ] Lambda function memory optimization
- [ ] AppSync caching configuration
- [ ] Frontend code splitting and lazy loading

## Security Considerations

### Data Protection
- [ ] Encryption at rest for DynamoDB
- [ ] Encryption in transit for all APIs
- [ ] Sensitive data masking in logs
- [ ] Audit trail for all data access

### Access Control
- [ ] Principle of least privilege
- [ ] Regular access reviews
- [ ] Automated permission validation
- [ ] Cross-tenant data leakage prevention

## Risk Assessment

### High Priority Risks
1. **Data Leakage Between Tenants**
   - Mitigation: Comprehensive authorization testing
   - Monitoring: Real-time access pattern analysis

2. **Performance at Scale**
   - Mitigation: Proper indexing and caching
   - Monitoring: Query performance metrics

3. **Authorization Logic Complexity**
   - Mitigation: Thorough unit testing and documentation
   - Monitoring: Authorization failure rates

### Medium Priority Risks
1. **Lambda Cold Starts**
   - Mitigation: Provisioned concurrency for critical functions
   
2. **DynamoDB Throttling**
   - Mitigation: Auto-scaling and proper capacity planning

## Success Criteria

### Functional Requirements
- [ ] Users can only access orders within their authorized org/pol combinations
- [ ] All CRUD operations work correctly with proper authorization
- [ ] Real-time updates work across the system
- [ ] Data integrity is maintained across all operations

### Non-Functional Requirements
- [ ] API response time < 500ms for 95% of requests
- [ ] Zero cross-tenant data leakage
- [ ] 99.9% availability
- [ ] Support for 10,000+ concurrent users

## Timeline Summary
- **Phase 1-2: Backend Setup & Schema** - 2-3 days
- **Phase 3-4: Auth & Order Management** - 4-5 days  
- **Phase 5-6: Security & Testing** - 3-4 days
- **Phase 7: Frontend Updates** - 2-3 days
- **Total Estimated Time: 11-15 days**

## Next Steps
1. Review and approve this implementation plan
2. Set up development environment
3. Begin Phase 1 implementation
4. Establish testing protocols
5. Plan user acceptance testing

---

*This plan serves as a living document and should be updated as implementation progresses and requirements evolve.*
