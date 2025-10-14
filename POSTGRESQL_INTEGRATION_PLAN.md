# PostgreSQL Integration Implementation Plan
## AWS Amplify Gen2 + Aurora PostgreSQL + Lambda GraphQL Resolvers

### Overview
This document provides step-by-step implementation instructions for integrating Aurora PostgreSQL with your existing AWS Amplify Gen2 React application, transforming it from a simple Todo app into an Order Management System with PostgreSQL backend using custom Lambda resolvers.

---

## Current Architecture Analysis

### **Existing Stack:**
- **Frontend**: React + Vite + TypeScript
- **Backend**: AWS Amplify Gen2
- **Database**: DynamoDB (via Amplify's default GraphQL API)
- **Authentication**: Amazon Cognito User Pools
- **Current Model**: Todo (`content`: string, `isDone`: boolean)

### **Target Architecture:**
- **Frontend**: React + Vite + TypeScript (updated for order management)
- **Backend**: AWS Amplify Gen2 + Custom Lambda Resolvers
- **Database**: Aurora PostgreSQL Serverless v2
- **Authentication**: Amazon Cognito User Pools (unchanged)
- **GraphQL**: Custom resolvers connecting to Lambda functions
- **New Model**: Order Management System with tracking capabilities

---

## Implementation Steps

### **Step 1: Update Amplify Dependencies**
- [x] Add required CDK dependencies to `amplify/package.json`:
  ```json
  {
    "devDependencies": {
      "aws-cdk-lib": "^2.138.0",
      "constructs": "^10.0.0",
      "pg": "^8.11.0",
      "@types/pg": "^8.10.0"
    }
  }
  ```
- [x] Run `npm install` in the `amplify/` directory to install dependencies
- [x] Install PostgreSQL client libraries in the root project: `npm install pg @types/pg`

### **Step 2: Create VPC Infrastructure via CDK**
**Note**: All infrastructure will be defined as CDK code in Amplify backend configuration, NOT manual AWS CLI deployment.

- [x] Create `amplify/storage/vpc-resource.ts` with VPC CDK constructs:
  ```typescript
  import { Vpc, SubnetType, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
  import { defineBackend } from '@aws-amplify/backend';
  
  // VPC with public and private subnets across multiple AZs
  // Internet Gateway and NAT Gateway configuration
  // Route tables for public/private subnet routing
  // Security groups for RDS and Lambda communication
  ```
- [x] Update `amplify/backend.ts` to include VPC resource
- [x] Commit and push changes to trigger automatic deployment via Amplify

### **Step 3: Set Up Aurora PostgreSQL RDS via CDK**
**Note**: RDS will be defined as CDK code and deployed automatically through Amplify pipeline.

- [ ] Create `amplify/storage/database-resource.ts` with RDS CDK constructs:
  ```typescript
  import { DatabaseCluster } from 'aws-cdk-lib/aws-rds';
  import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
  
  // Aurora PostgreSQL Serverless v2 cluster configuration
  // Database parameters and backup settings
  // AWS Secrets Manager for database credentials
  // VPC endpoints for Secrets Manager (cost optimization)
  ```
- [ ] Configure database initialization and migration scripts
- [ ] Update `amplify/backend.ts` to include database resource
- [ ] Commit and push changes to trigger automatic deployment

### **Step 4: Design PostgreSQL Schema for Order Management**
- [ ] Create enhanced Order table schema:
  ```sql
  CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(100) UNIQUE NOT NULL,
    content TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    carrier VARCHAR(100),
    resource_type VARCHAR(100),
    departure_location TEXT,
    destination_location TEXT,
    is_done BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    owner_id VARCHAR(255) NOT NULL
  );
  ```
- [ ] Create indexes for performance optimization:
  ```sql
  CREATE INDEX idx_orders_owner_id ON orders(owner_id);
  CREATE INDEX idx_orders_status ON orders(status);
  CREATE INDEX idx_orders_order_number ON orders(order_number);
  CREATE INDEX idx_orders_created_at ON orders(created_at);
  ```

### **Step 5: Create Database Initialization Lambda Function**
- [ ] Create database initialization script
- [ ] Set up database migration scripts
- [ ] Create database initialization Lambda function

### **Step 6: Implement Connection Management**
- [ ] Implement connection pooling strategy
- [ ] Configure Lambda environment variables
- [ ] Set up database connection utilities

### **Step 7: Create Core Lambda Functions for Order Operations**

#### **Query Resolvers:**
- [ ] `listOrders` - Fetch orders with filtering and pagination
- [ ] `getOrder` - Fetch single order by ID

#### **Mutation Resolvers:**
- [ ] `createOrder` - Create new order item
- [ ] `updateOrder` - Update existing order
- [ ] `deleteOrder` - Delete order by ID

### **Step 8: Implement Lambda Function Base Structure**
- [ ] Create base Lambda handler with PostgreSQL connection
- [ ] Implement error handling and logging
- [ ] Add input validation and sanitization
- [ ] Configure timeout and memory settings
- [ ] Implement proper connection closing and cleanup

### **Step 9: Configure Security and Authorization**
- [ ] Integrate Cognito user context in Lambda functions
- [ ] Implement row-level security for owner-based access
- [ ] Add request validation and rate limiting
- [ ] Configure IAM roles and policies

### **Step 10: Update GraphQL Schema for Order Management**
- [ ] Modify `amplify/data/resource.ts` to use custom resolvers
- [ ] Configure Lambda data sources for GraphQL API
- [ ] Update GraphQL schema with order management fields:
  ```graphql
  type Order @aws_cognito_user_pools {
    id: ID!
    orderNumber: String!
    content: String
    status: String!
    carrier: String
    resourceType: String
    departureLocation: String
    destinationLocation: String
    isDone: Boolean!
    createdAt: AWSDateTime!
    updatedAt: AWSDateTime!
    owner: String!
  }
  ```

### **Step 11: Configure Resolver Mapping**
- [ ] Configure request/response mapping templates
- [ ] Set up resolver pipeline for complex operations
- [ ] Implement GraphQL subscriptions for real-time updates
- [ ] Add error handling in GraphQL layer

### **Step 12: Create CDK Infrastructure Code**
- [ ] Create RDS construct in `amplify/backend.ts`
- [ ] Add VPC configuration
- [ ] Configure Lambda functions with proper VPC settings
- [ ] Set up Secrets Manager integration

### **Step 13: Set Up Lambda Layer for Dependencies**
- [ ] Create Lambda layer for PostgreSQL client libraries
- [ ] Optimize layer for cold start performance
- [ ] Configure layer versioning strategy

### **Step 14: Configure Environment Management**
- [ ] Set up environment-specific configurations
- [ ] Configure different settings for dev/staging/production
- [ ] Add environment variables management

### **Step 15: Update Frontend for Order Management**
- [ ] Update existing GraphQL queries to handle new order fields
- [ ] Modify `src/App.tsx` for order management interface
- [ ] Update TypeScript types from new schema
- [ ] Add error handling for new backend

### **Step 16: Enhance UI Components**
- [ ] Add UI components for new fields (order number, status, carrier, etc.)
- [ ] Implement filtering and sorting capabilities by status, carrier, location
- [ ] Update modal components for order creation/editing
- [ ] Add order status tracking visualization

### **Step 17: Implement Unit Testing**
- [ ] Test Lambda functions with mock PostgreSQL connections
- [ ] Test database utility functions
- [ ] Test GraphQL resolver logic

### **Step 18: Implement Integration Testing**
- [ ] Test GraphQL API endpoints
- [ ] Test authentication and authorization
- [ ] Test error scenarios and edge cases

### **Step 19: Implement End-to-End Testing**
- [ ] Test complete order management workflows
- [ ] Performance testing with concurrent users
- [ ] Load testing for Aurora PostgreSQL

### **Step 20: Configure Deployment**
- [ ] Update `amplify.yml` for new resources
- [ ] Configure build and deployment pipeline
- [ ] Set up environment promotion strategy

### **Step 21: Set Up Monitoring and Logging**
- [ ] Configure CloudWatch dashboards
- [ ] Set up Aurora PostgreSQL monitoring
- [ ] Configure Lambda function monitoring
- [ ] Set up alerts for critical metrics

---

## File Structure Changes

### New Files to Create:
```
amplify/
├── data/
│   ├── resource.ts (modify existing)
│   └── resolvers/
│       ├── Query.listOrders.ts
│       ├── Query.getOrder.ts
│       ├── Mutation.createOrder.ts
│       ├── Mutation.updateOrder.ts
│       └── Mutation.deleteOrder.ts
├── functions/
│   ├── orderResolvers/
│   │   ├── index.ts
│   │   ├── database.ts
│   │   ├── types.ts
│   │   └── utils.ts
│   └── dbInit/
│       ├── index.ts
│       └── schema.sql
└── storage/
    └── database.ts
```

---

## Technical Considerations

### **Database Connection Management**
- **Challenge**: Lambda cold starts with database connections
- **Solution**: Connection pooling with `pg-pool` or AWS RDS Proxy
- **Optimization**: Implement connection reuse across Lambda invocations

### **Cost Implications**
- **Aurora PostgreSQL**: Minimum billing (~$0.50/hour for Serverless v2)
- **VPC NAT Gateway**: ~$32/month per AZ
- **Lambda**: Pay per request (should be minimal cost increase)
- **RDS Proxy** (Optional): Additional cost but improved connection management

### **Performance Considerations**
- **Cold Start**: Optimize Lambda package size and initialization
- **Database**: Proper indexing and query optimization
- **Connection Pooling**: Reduce connection overhead
- **Caching**: Consider ElastiCache for frequently accessed data

### **Security Best Practices**
- VPC security groups restricting database access
- Secrets Manager for credential management
- IAM roles with least privilege access
- Enable RDS encryption at rest and in transit

---

## Migration Strategy

### **Option 1: Fresh Start (Recommended for Development)**
- Deploy new PostgreSQL backend alongside existing DynamoDB
- Test thoroughly before switching frontend
- No data migration required

### **Option 2: Data Migration (For Production)**
- Export existing DynamoDB data
- Create migration Lambda function
- Import data to PostgreSQL with proper transformations
- Implement rollback strategy

---

## Rollback Plan

### **Quick Rollback Steps:**
1. Revert `amplify/data/resource.ts` to original DynamoDB schema
2. Redeploy Amplify backend
3. Database resources can remain (but will incur costs)

### **Complete Rollback:**
1. Remove all PostgreSQL-related CDK resources
2. Clean up VPC and networking components
3. Restore original Amplify configuration

---

## Success Criteria

### **Functional Requirements:**
- [ ] All Order CRUD operations work with PostgreSQL backend
- [ ] Order management system handles all new fields (order_number, status, carrier, resource_type, departure_location, destination_location)
- [ ] User authentication and authorization function correctly with owner-based access
- [ ] Real-time updates via GraphQL subscriptions work for order status changes
- [ ] Performance matches or exceeds current DynamoDB implementation
- [ ] Order filtering and sorting by status, carrier, and location work correctly

### **Non-Functional Requirements:**
- [ ] System handles concurrent users efficiently
- [ ] Database connections are properly managed with connection pooling
- [ ] Error handling provides meaningful feedback for order operations
- [ ] Monitoring and alerting are operational for order management workflows
- [ ] Order data integrity is maintained with PostgreSQL ACID transactions

---

## Code Push and Deployment Workflow

### **Infrastructure as Code (CDK) Approach:**
All infrastructure changes are implemented as CDK code within the Amplify backend configuration. This ensures:
- **Version Control**: All infrastructure is tracked in Git
- **Automated Deployment**: Amplify automatically deploys infrastructure changes
- **Environment Consistency**: Same infrastructure across all environments
- **Rollback Capability**: Easy to revert through Git

### **Deployment Process:**
1. **Code Changes**: Write CDK constructs in `amplify/` directory
2. **Local Testing**: Test CDK synthesis locally: `npx ampx sandbox`
3. **Commit Changes**: `git add .` and `git commit -m "description"`
4. **Push to GitHub**: `git push origin main` (or dev branch)
5. **Automatic Deployment**: Amplify detects changes and deploys automatically
6. **Monitor Deployment**: Check Amplify Console for deployment status
7. **Verify Resources**: Confirm infrastructure is created in AWS Console

### **Step-by-Step Implementation Commands:**

#### **For Each Infrastructure Step:**
```bash
# 1. Make code changes (CDK constructs)
# 2. Test locally (optional but recommended)
npx ampx sandbox

# 3. Commit and push changes
git add .
git commit -m "Add VPC infrastructure via CDK"
git push origin main

# 4. Monitor deployment in Amplify Console
# 5. Verify resources in AWS Console
```

#### **For Lambda Function Changes:**
```bash
# 1. Create/modify Lambda functions in amplify/functions/
# 2. Update amplify/backend.ts to include functions
# 3. Test locally
npx ampx sandbox

# 4. Commit and push
git add .
git commit -m "Add order management Lambda resolvers"
git push origin main
```

#### **For GraphQL Schema Changes:**
```bash
# 1. Modify amplify/data/resource.ts
# 2. Test GraphQL operations locally
npx ampx sandbox

# 3. Commit and push
git add .
git commit -m "Update GraphQL schema for order management"
git push origin main
```

---

## Implementation Notes for AI Agent

### **Step-by-Step Execution:**
- Each step should be completed sequentially
- **All infrastructure must be implemented as CDK code** - NO manual AWS CLI commands
- Verify successful completion of each step before proceeding
- Test each component thoroughly before moving to the next step
- Use `git commit` and `git push` after each major step to trigger deployment
- Monitor Amplify Console for deployment status after each push
- Use appropriate error handling and logging throughout implementation

### **Key Implementation Points:**
- **CDK-First Approach**: All AWS resources defined as CDK constructs in Amplify backend
- **Automated Deployment**: Let Amplify handle all resource provisioning automatically
- **Git-Based Workflow**: Use Git commits to trigger infrastructure deployments
- Transform existing Todo model to comprehensive Order management system
- Maintain backward compatibility during transition where possible
- Implement proper PostgreSQL connection management to avoid connection leaks
- Ensure all new order fields are properly validated and handled
- Update UI to reflect order management capabilities rather than simple todo functionality

### **Important Deployment Reminders:**
- **Never use AWS CLI** for infrastructure provisioning - use CDK code only
- **Always commit and push** changes to trigger Amplify deployment
- **Monitor Amplify Console** for deployment status and errors
- **Test locally first** using `npx ampx sandbox` when possible
- **One major change per commit** for easier rollback if needed

---

## Next Steps

1. **Begin implementation with Step 1: Update Amplify Dependencies**
2. **Follow the Code Push and Deployment Workflow for each step**
3. **Use CDK constructs for all infrastructure (VPC, RDS, Lambda, etc.)**
4. **Commit and push changes after each major step**
5. **Monitor Amplify Console for successful deployment**
6. **Test each component as it's implemented**
7. **Validate the complete order management system functionality**

---

*This plan provides a comprehensive roadmap for migrating from DynamoDB to Aurora PostgreSQL while maintaining the existing user experience and adding enhanced capabilities.*
