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
  secretArn: string;
  dbEndpoint: string;
  dbName: string;
}

export const handler: Handler<DbInitEvent> = async (event) => {
  console.log('Database initialization started', JSON.stringify(event, null, 2));
  
  let client: Client | null = null;
  
  try {
    // Get database credentials from Secrets Manager
    const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION });
    const secretCommand = new GetSecretValueCommand({
      SecretId: event.secretArn || process.env.DB_SECRET_ARN,
    });
    
    const secretResponse = await secretsClient.send(secretCommand);
    if (!secretResponse.SecretString) {
      throw new Error('Database secret not found');
    }
    
    const secret: DatabaseSecret = JSON.parse(secretResponse.SecretString);
    
    // Create PostgreSQL client
    client = new Client({
      host: event.dbEndpoint || process.env.DB_ENDPOINT,
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
    
    // Read and execute schema SQL
    const schemaPath = join(__dirname, 'schema.sql');
    const schemaSql = readFileSync(schemaPath, 'utf8');
    
    console.log('Executing database schema...');
    
    // Split SQL by statements and execute them one by one
    const statements = schemaSql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          console.log(`Executing: ${statement.substring(0, 100)}...`);
          await client.query(statement);
        } catch (error) {
          console.error(`Error executing statement: ${statement.substring(0, 100)}...`, error);
          
          // Continue with non-critical errors (like table already exists)
          if (error instanceof Error && 
              (error.message.includes('already exists') || 
               error.message.includes('duplicate key'))) {
            console.log('Non-critical error, continuing...');
            continue;
          }
          throw error;
        }
      }
    }
    
    console.log('Database schema executed successfully');
    
    // Test the database setup with a simple query
    const testResult = await client.query('SELECT COUNT(*) as count FROM orders');
    console.log(`Orders table initialized with ${testResult.rows[0].count} records`);
    
    return {
      statusCode: 200,
      body: {
        message: 'Database initialization completed successfully',
        recordCount: testResult.rows[0].count,
      },
    };
    
  } catch (error) {
    console.error('Database initialization failed:', error);
    
    return {
      statusCode: 500,
      body: {
        message: 'Database initialization failed',
        error: error instanceof Error ? error.message : 'Unknown error',
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
