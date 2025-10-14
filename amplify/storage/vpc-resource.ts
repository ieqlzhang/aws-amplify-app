import { Vpc, SubnetType, SecurityGroup, Port, Peer } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class VpcResource extends Construct {
  public readonly vpc: Vpc;
  public readonly databaseSecurityGroup: SecurityGroup;
  public readonly lambdaSecurityGroup: SecurityGroup;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // Create VPC with public and private subnets across multiple AZs
    this.vpc = new Vpc(this, 'OrderManagementVpc', {
      maxAzs: 2, // Use 2 AZs for high availability
      natGateways: 1, // Cost optimization - use 1 NAT Gateway
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'Private',
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });

    // Security group for RDS Database
    this.databaseSecurityGroup = new SecurityGroup(this, 'DatabaseSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for Aurora PostgreSQL database',
      allowAllOutbound: false,
    });

    // Security group for Lambda functions
    this.lambdaSecurityGroup = new SecurityGroup(this, 'LambdaSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for Lambda functions accessing database',
      allowAllOutbound: true,
    });

    // Allow Lambda to connect to PostgreSQL database on port 5432
    this.databaseSecurityGroup.addIngressRule(
      this.lambdaSecurityGroup,
      Port.tcp(5432),
      'Allow Lambda functions to access PostgreSQL database'
    );

    // Allow HTTPS outbound traffic for Secrets Manager access
    this.lambdaSecurityGroup.addEgressRule(
      Peer.anyIpv4(),
      Port.tcp(443),
      'Allow HTTPS outbound for Secrets Manager and other AWS services'
    );

    // Allow PostgreSQL outbound traffic from Lambda to RDS
    this.lambdaSecurityGroup.addEgressRule(
      this.databaseSecurityGroup,
      Port.tcp(5432),
      'Allow Lambda to connect to PostgreSQL database'
    );
  }
}
