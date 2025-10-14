"""
Database initialization Lambda function for PostgreSQL
Creates the order management schema by reading from schema.sql file
"""

import json
import os
import logging
from typing import Dict, Any
from contextlib import contextmanager
import psycopg2
from psycopg2.extras import RealDictCursor
import boto3
from botocore.exceptions import ClientError

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

class DatabaseError(Exception):
    """Custom exception for database-related errors"""
    pass

def get_database_credentials() -> Dict[str, Any]:
    """
    Retrieve database credentials from AWS Secrets Manager
    
    Returns:
        Dict containing database credentials
    
    Raises:
        DatabaseError: If credentials cannot be retrieved
    """
    secret_arn = os.environ.get('DB_SECRET_ARN')
    if not secret_arn:
        raise DatabaseError('DB_SECRET_ARN environment variable is not set')
    
    try:
        # Create Secrets Manager client
        secrets_client = boto3.client(
            'secretsmanager',
            region_name=os.environ.get('AWS_REGION', 'us-east-1')
        )
        
        # Get secret value
        response = secrets_client.get_secret_value(SecretId=secret_arn)
        secret_string = response.get('SecretString')
        
        if not secret_string:
            raise DatabaseError('Database secret not found')
        
        credentials = json.loads(secret_string)
        logger.info('Database credentials retrieved successfully')
        return credentials
        
    except ClientError as e:
        logger.error(f'Error retrieving database credentials: {e}')
        raise DatabaseError(f'Failed to retrieve database credentials: {e}')
    except json.JSONDecodeError as e:
        logger.error(f'Error parsing database credentials: {e}')
        raise DatabaseError(f'Invalid database credentials format: {e}')

@contextmanager
def get_db_connection():
    """
    Context manager for database connections
    """
    connection = None
    
    try:
        # Get database credentials
        credentials = get_database_credentials()
        
        # Create connection configuration
        config = {
            'host': os.environ.get('DB_ENDPOINT', credentials.get('host')),
            'port': credentials.get('port', 5432),
            'database': os.environ.get('DB_NAME', 'ordermanagement'),
            'user': credentials.get('username'),
            'password': credentials.get('password'),
            'sslmode': 'require',
            'connect_timeout': 10,
        }
        
        # Validate required fields
        required_fields = ['host', 'user', 'password']
        for field in required_fields:
            if not config.get(field):
                raise DatabaseError(f'Missing required database configuration: {field}')
        
        # Create connection
        connection = psycopg2.connect(**config)
        logger.info('Connected to database successfully')
        
        yield connection
        
    except Exception as e:
        if connection:
            connection.rollback()
        logger.error(f'Database connection error: {e}')
        raise DatabaseError(f'Database connection failed: {e}')
    finally:
        if connection:
            connection.close()
            logger.info('Database connection closed')

def read_schema_file() -> str:
    """
    Read the schema.sql file from the same directory
    
    Returns:
        SQL schema content as string
    
    Raises:
        DatabaseError: If schema file cannot be read
    """
    try:
        # Get the directory of this script
        current_dir = os.path.dirname(os.path.abspath(__file__))
        schema_path = os.path.join(current_dir, 'schema.sql')
        
        # Read the schema file
        with open(schema_path, 'r', encoding='utf-8') as schema_file:
            schema_content = schema_file.read()
            
        logger.info(f'Successfully read schema file: {schema_path}')
        return schema_content
        
    except FileNotFoundError:
        logger.error(f'Schema file not found: {schema_path}')
        raise DatabaseError(f'Schema file not found: {schema_path}')
    except Exception as e:
        logger.error(f'Error reading schema file: {e}')
        raise DatabaseError(f'Failed to read schema file: {e}')

def execute_sql_statements(connection, sql_content: str):
    """
    Execute SQL statements from content string
    
    Args:
        connection: Database connection
        sql_content: SQL content as string
    """
    try:
        with connection.cursor() as cursor:
            # Split SQL by statements and execute them one by one
            # Filter out empty statements and comments
            statements = [
                stmt.strip() 
                for stmt in sql_content.split(';') 
                if stmt.strip() and not stmt.strip().startswith('--')
            ]
            
            for statement in statements:
                if statement:
                    try:
                        logger.info(f'Executing: {statement[:100]}...')
                        cursor.execute(statement)
                        connection.commit()
                        logger.info('Statement executed successfully')
                        
                    except psycopg2.Error as e:
                        # Check if it's a non-critical error (like table already exists)
                        error_message = str(e).lower()
                        if ('already exists' in error_message or 
                            'duplicate' in error_message or
                            'relation' in error_message and 'already exists' in error_message):
                            logger.info(f'Non-critical error (continuing): {e}')
                            connection.rollback()
                            continue
                        else:
                            logger.error(f'Error executing statement: {e}')
                            connection.rollback()
                            raise
                            
    except Exception as e:
        logger.error(f'Error executing SQL statements: {e}')
        raise DatabaseError(f'SQL execution failed: {e}')

def handler(event, context):
    """
    Lambda handler for database initialization
    
    Args:
        event: Lambda event (can contain secretArn, dbEndpoint, dbName)
        context: Lambda context
        
    Returns:
        Response dictionary with status and message
    """
    logger.info('Database initialization started')
    logger.info(f'Event: {json.dumps(event, default=str)}')
    
    try:
        # Read schema from file
        logger.info('Reading schema from schema.sql file...')
        schema_sql = read_schema_file()
        
        # Get database connection and execute schema
        with get_db_connection() as connection:
            logger.info('Executing database schema...')
            
            # Execute schema statements
            execute_sql_statements(connection, schema_sql)
            
            logger.info('Database schema executed successfully')
            
            # Test the database setup with a simple query
            with connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute('SELECT COUNT(*) as count FROM orders')
                result = cursor.fetchone()
                record_count = result['count'] if result else 0
                
                logger.info(f'Orders table initialized with {record_count} records')
        
        return {
            'statusCode': 200,
            'body': {
                'message': 'Database initialization completed successfully',
                'recordCount': record_count,
                'schemaSource': 'schema.sql',
                'timestamp': context.aws_request_id if context else 'local'
            }
        }
        
    except DatabaseError as e:
        logger.error(f'Database initialization failed: {e}')
        return {
            'statusCode': 500,
            'body': {
                'message': 'Database initialization failed',
                'error': str(e),
                'timestamp': context.aws_request_id if context else 'local'
            }
        }
    except Exception as e:
        logger.error(f'Unexpected error during database initialization: {e}', exc_info=True)
        return {
            'statusCode': 500,
            'body': {
                'message': 'Database initialization failed with unexpected error',
                'error': str(e),
                'timestamp': context.aws_request_id if context else 'local'
            }
        }
