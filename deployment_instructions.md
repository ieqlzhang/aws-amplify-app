# Deployment Instructions for Ocean Order Management Backend

## Current Implementation Status
✅ **Backend Complete** - Ready for AWS Amplify deployment via git push

## What Will Be Deployed

### 🚀 **5 Lambda Functions**
1. **auth-handler** - Multi-tenant authorization logic
2. **order-validator** - Business rules validation  
3. **user-profile-manager** - User profile CRUD + Cognito integration
4. **audit-logger** - Security event logging
5. **order-management** - Complete order CRUD operations

### 🗄️ **3 DynamoDB Tables** (Auto-created by Amplify)
1. **Order** - With GSIs for orgPolAccess, orderNumber, status
2. **UserProfile** - User permissions and org/pol access
3. **AuditLog** - Security and compliance tracking

### 🔐 **Enhanced Cognito User Pool**
- Custom attributes for multi-tenant data
- Post-confirmation triggers
- MFA support (SMS + TOTP)

## Git Deployment Commands

### Step 1: Check Current Status
```bash
git status
git branch
```

### Step 2: Stage All Changes
```bash
git add .
```

### Step 3: Commit Backend Implementation
```bash
git commit -m "feat: Complete multi-tenant ocean order management backend

- Add 5 Lambda functions for order management and authorization
- Replace Todo schema with Order, UserProfile, and AuditLog models  
- Implement multi-tenant authorization with orgPolAccess pattern
- Add comprehensive business rules and validation
- Configure Cognito with custom attributes and triggers
- Set up DynamoDB GSIs for efficient multi-tenant queries
- Add audit logging for security compliance
- Configure backend-only deployment in amplify.yml

Ready for AWS Amplify deployment and testing."
```

### Step 4: Force Push to Dev Branch (Overwrite Existing)
```bash
# Create/switch to dev branch
git checkout -B dev

# Force push to overwrite existing dev branch
git push -f origin dev
```

### Alternative: If you prefer to preserve git history
```bash
# Switch to dev branch (if it exists)
git checkout dev || git checkout -b dev

# Merge from main/master
git merge main --allow-unrelated-histories

# Push to dev branch  
git push origin dev
```

## Expected Deployment Outcome

### ✅ What Should Deploy Successfully
- **Cognito User Pool** with custom attributes
- **5 Lambda Functions** with proper IAM roles
- **3 DynamoDB Tables** with configured GSIs
- **AppSync GraphQL API** with custom authorization
- **CloudWatch Logs** for Lambda function monitoring

### ⚠️ What to Monitor During Deployment
1. **Build Logs** - Check Amplify Console for any compilation errors
2. **Lambda Deployment** - Verify all 5 functions deploy without errors
3. **DynamoDB Creation** - Ensure tables and indexes are created properly
4. **Cognito Configuration** - Check custom attributes are set correctly

### 🔧 Post-Deployment Testing Steps
1. **Access AWS Amplify Console** - Verify backend deployment status
2. **Check CloudFormation** - Review created resources
3. **Test Cognito** - Create test user to verify custom attributes
4. **Lambda Testing** - Use AWS Console to test individual functions
5. **GraphQL Playground** - Test queries/mutations via AppSync console

## Troubleshooting Common Issues

### If Lambda Functions Fail to Deploy
- Check `package.json` in amplify/ directory
- Verify all imports in handler.ts files
- Review CloudWatch logs for specific error messages

### If DynamoDB Tables Don't Create Properly
- Check GraphQL schema syntax in `data/resource.ts`
- Verify index configurations are valid
- Review CloudFormation template in Amplify Console

### If Cognito Custom Attributes Fail
- Check attribute syntax in `auth/resource.ts`
- Verify dataType specifications
- Review Cognito console for attribute creation

## Expected Resources After Deployment

```
AWS Resources Created:
├── Cognito User Pool (with custom attributes)
├── AppSync GraphQL API (with Lambda authorization)
├── DynamoDB Tables:
│   ├── Order (with 4 GSIs)
│   ├── UserProfile 
│   └── AuditLog (with 3 GSIs)
├── Lambda Functions:
│   ├── auth-handler
│   ├── order-validator
│   ├── user-profile-manager
│   ├── audit-logger
│   └── order-management
└── IAM Roles & Policies (auto-generated)
```

## Next Steps After Successful Deployment
1. **Create Test Users** with different org/pol permissions
2. **Test Multi-Tenant Authorization** via GraphQL playground
3. **Validate Business Rules** by testing order operations
4. **Review Audit Logs** to ensure compliance tracking works
5. **Performance Testing** with concurrent user scenarios

---
**Deployment Method:** AWS Amplify Console (triggered by git push)
**Branch:** dev (force overwrite existing)
**Frontend:** Disabled (backend-only deployment)
