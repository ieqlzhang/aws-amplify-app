import { Handler } from 'aws-lambda';
import { Client } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { readFileSync } from 'fs';
import { join } from 'path';

interface DatabaseSecret {
  username: string;
  password: string;
  host: string;
  port: number;
  dbname: string;
}

interface DbInitEvent {
  secretArn?: string;
  dbEndpoint?: string;
  dbName?: string;
}

interface DbInitResponse {
  statusCode: number;
  body: {
    message: string;
    recordCount?: number;
    schemaSource?: string;
    error?: string;
    timestamp: string;
  };
}

export const handler: Handler<DbInitEvent, DbInitResponse> = async (event, context) => {
  console.log('Database initialization started', JSON.stringify(event, null, 2));
  
  let client: Client | null = null;
  
  try {
    // Get database credentials from Secrets Manager
    const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION });
    const secretArn = event.secretArn || process.env.DB_SECRET_ARN;
    
    if (!secretArn) {
      throw new Error('DB_SECRET_ARN environment variable is not set');
    }
    
    const secretCommand = new GetSecretValueCommand({
      SecretId: secretArn,
    });
    
    const secretResponse = await secretsClient.send(secretCommand);
    if (!secretResponse.SecretString) {
      throw new Error('Database secret not found');
    }
    
    const secret: DatabaseSecret = JSON.parse(secretResponse.SecretString);
    
    // Create PostgreSQL client
    client = new Client({
      host: event.dbEndpoint || process.env.DB_ENDPOINT || secret.host,
      port: secret.port || 5432,
      database: event.dbName || process.env.DB_NAME || 'ordermanagement',
      user: secret.username,
      password: secret.password,
      ssl: {
        rejectUnauthorized: false, // Required for RDS
      },
      connectionTimeoutMillis: 10000,
      query_timeout: 30000,
    });
    
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected to database successfully');
    
    // Read schema from schema.sql file
    console.log('Reading schema from schema.sql file...');
    const schemaPath = join(__dirname, 'schema.sql');
    const schemaSql = readFileSync(schemaPath, 'utf8');
    console.log('Schema file read successfully');
    
    // Split SQL by statements and execute them one by one
    const statements = schemaSql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    console.log(`Executing ${statements.length} SQL statements...`);
    
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          console.log(`Executing: ${statement.substring(0, 100)}...`);
          await client.query(statement);
          console.log('Statement executed successfully');
        } catch (error) {
          console.error(`Error executing statement: ${statement.substring(0, 100)}...`, error);
          
          // Continue with non-critical errors (like table already exists)
          if (error instanceof Error) {
            const errorMessage = error.message.toLowerCase();
            if (errorMessage.includes('already exists') || 
                errorMessage.includes('duplicate key') ||
                errorMessage.includes('duplicate')) {
              console.log('Non-critical error, continuing...');
              continue;
            }
          }
          throw error;
        }
      }
    }
    
    console.log('Database schema executed successfully');
    
    // Test the database setup with a simple query
    const testResult = await client.query('SELECT COUNT(*) as count FROM orders');
    const recordCount = testResult.rows[0]?.count || 0;
    console.log(`Orders table initialized with ${recordCount} records`);
    
    return {
      statusCode: 200,
      body: {
        message: 'Database initialization completed successfully',
        recordCount: parseInt(recordCount, 10),
        schemaSource: 'schema.sql',
        timestamp: context.awsRequestId || new Date().toISOString(),
      },
    };
    
  } catch (error) {
    console.error('Database initialization failed:', error);
    
    return {
      statusCode: 500,
      body: {
        message: 'Database initialization failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: context.awsRequestId || new Date().toISOString(),
      },
    };
    
  } finally {
    if (client) {
      try {
        await client.end();
        console.log('Database connection closed');
      } catch (error) {
        console.error('Error closing database connection:', error);
      }
    }
  }
};
