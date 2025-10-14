import { DatabaseCluster, DatabaseClusterEngine, AuroraPostgresEngineVersion, Credentials, ClusterInstance } from 'aws-cdk-lib/aws-rds';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { SubnetGroup } from 'aws-cdk-lib/aws-rds';
import { Vpc, SubnetType, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { RemovalPolicy, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface DatabaseResourceProps {
  readonly vpc: Vpc;
  readonly databaseSecurityGroup: SecurityGroup;
}

export class DatabaseResource extends Construct {
  public readonly cluster: DatabaseCluster;
  public readonly databaseSecret: Secret;
  public readonly databaseEndpoint: string;

  constructor(scope: Construct, id: string, props: DatabaseResourceProps) {
    super(scope, id);

    // Create database credentials secret
    this.databaseSecret = new Secret(this, 'DatabaseCredentials', {
      description: 'Aurora PostgreSQL database credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'postgres' }),
        generateStringKey: 'password',
        excludeCharacters: '"@/\\\'',
        passwordLength: 32,
      },
    });

    // Create DB subnet group
    const subnetGroup = new SubnetGroup(this, 'DatabaseSubnetGroup', {
      description: 'Subnet group for Aurora PostgreSQL cluster',
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      },
    });

    // Create Aurora PostgreSQL Serverless v2 cluster
    this.cluster = new DatabaseCluster(this, 'OrderManagementDatabase', {
      engine: DatabaseClusterEngine.auroraPostgres({
        version: AuroraPostgresEngineVersion.VER_15_4,
      }),
      credentials: Credentials.fromSecret(this.databaseSecret),
      vpc: props.vpc,
      subnetGroup,
      serverlessV2MinCapacity: 0.5, // Minimum ACUs (cost optimization)
      serverlessV2MaxCapacity: 2,   // Maximum ACUs (sufficient for development)
      writer: ClusterInstance.serverlessV2('writer', {
        enablePerformanceInsights: false, // Disable to reduce costs
      }),
      readers: [], // No read replicas for cost optimization
      defaultDatabaseName: 'ordermanagement',
      
      // Security and backup settings
      backup: {
        retention: Duration.days(7), // 7 days backup retention
        preferredWindow: '03:00-04:00', // Low traffic window
      },
      preferredMaintenanceWindow: 'sun:04:00-sun:05:00',
      
      // Enable deletion protection for production (set to false for dev)
      deletionProtection: false,
      
      // Remove the cluster when stack is deleted (for development)
      removalPolicy: RemovalPolicy.DESTROY,
      
      // CloudWatch logs
      cloudwatchLogsExports: ['postgresql'],
      
      // Performance and monitoring
      monitoringInterval: Duration.seconds(60),
      
      // Security groups
      securityGroups: [props.databaseSecurityGroup],
    });

    // Store database endpoint for Lambda functions
    this.databaseEndpoint = this.cluster.clusterEndpoint.hostname;

    // Add tags for cost tracking
    this.cluster.node.addMetadata('component', 'order-management-database');
  }
}
