"""
Database connection management utilities for PostgreSQL
Handles connection pooling, query execution, and transaction management
"""

import json
import os
import logging
from typing import Dict, Any, List, Optional, Tuple
from contextlib import contextmanager
import psycopg2
from psycopg2 import pool, sql
from psycopg2.extras import RealDictCursor
import boto3
from botocore.exceptions import ClientError

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Global connection pool - reused across Lambda invocations
connection_pool = None

class DatabaseError(Exception):
    """Custom exception for database-related errors"""
    pass

class ConnectionPoolError(DatabaseError):
    """Exception raised when connection pool operations fail"""
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

def create_database_config() -> Dict[str, Any]:
    """
    Create database configuration from environment and secrets
    
    Returns:
        Dict containing database configuration
    """
    credentials = get_database_credentials()
    
    config = {
        'host': os.environ.get('DB_ENDPOINT', credentials.get('host')),
        'port': credentials.get('port', 5432),
        'database': os.environ.get('DB_NAME', 'ordermanagement'),
        'user': credentials.get('username'),
        'password': credentials.get('password'),
        'sslmode': 'require',
        'connect_timeout': 10,
        'application_name': 'order-management-lambda'
    }
    
    # Validate required fields
    required_fields = ['host', 'user', 'password']
    for field in required_fields:
        if not config.get(field):
            raise DatabaseError(f'Missing required database configuration: {field}')
    
    return config

def get_connection_pool():
    """
    Get or create the global connection pool
    
    Returns:
        psycopg2 connection pool
    """
    global connection_pool
    
    if connection_pool is None:
        try:
            logger.info('Creating new database connection pool')
            config = create_database_config()
            
            # Create connection pool
            connection_pool = psycopg2.pool.ThreadedConnectionPool(
                minconn=1,
                maxconn=10,
                host=config['host'],
                port=config['port'],
                database=config['database'],
                user=config['user'],
                password=config['password'],
                sslmode=config['sslmode'],
                connect_timeout=config['connect_timeout'],
                application_name=config['application_name']
            )
            
            logger.info('Database connection pool created successfully')
            
        except Exception as e:
            logger.error(f'Error creating connection pool: {e}')
            raise ConnectionPoolError(f'Failed to create connection pool: {e}')
    
    return connection_pool

@contextmanager
def get_db_connection():
    """
    Context manager for database connections
    Automatically handles connection acquisition and release
    
    Yields:
        psycopg2 connection with RealDictCursor
    """
    pool = get_connection_pool()
    connection = None
    
    try:
        connection = pool.getconn()
        if connection.closed:
            # Connection is closed, remove it and get a new one
            pool.putconn(connection, close=True)
            connection = pool.getconn()
        
        # Test the connection
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
            
        yield connection
        
    except Exception as e:
        if connection:
            connection.rollback()
        logger.error(f'Database connection error: {e}')
        raise DatabaseError(f'Database connection failed: {e}')
    finally:
        if connection:
            pool.putconn(connection)

def execute_query(query: str, params: Tuple = ()) -> List[Dict[str, Any]]:
    """
    Execute a SELECT query and return results as list of dictionaries
    
    Args:
        query: SQL query string
        params: Query parameters tuple
        
    Returns:
        List of dictionaries representing query results
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                logger.info(f'Executing query: {query[:100]}...')
                cursor.execute(query, params)
                results = cursor.fetchall()
                
                # Convert RealDictRow to regular dict
                return [dict(row) for row in results]
                
    except Exception as e:
        logger.error(f'Query execution error: {e}')
        logger.error(f'Query: {query}')
        logger.error(f'Params: {params}')
        raise DatabaseError(f'Query execution failed: {e}')

def execute_mutation(query: str, params: Tuple = ()) -> Optional[Dict[str, Any]]:
    """
    Execute an INSERT/UPDATE/DELETE query and return the affected row (if any)
    
    Args:
        query: SQL query string
        params: Query parameters tuple
        
    Returns:
        Dictionary representing the affected row (for RETURNING queries)
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                logger.info(f'Executing mutation: {query[:100]}...')
                cursor.execute(query, params)
                
                # Commit the transaction
                conn.commit()
                
                # Return result if query has RETURNING clause
                if cursor.description:
                    result = cursor.fetchone()
                    return dict(result) if result else None
                
                return None
                
    except Exception as e:
        logger.error(f'Mutation execution error: {e}')
        logger.error(f'Query: {query}')
        logger.error(f'Params: {params}')
        raise DatabaseError(f'Mutation execution failed: {e}')

@contextmanager
def database_transaction():
    """
    Context manager for database transactions
    Automatically handles commit/rollback
    
    Yields:
        psycopg2 connection with RealDictCursor for transaction operations
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                logger.info('Transaction started')
                yield cursor
                conn.commit()
                logger.info('Transaction committed')
                
    except Exception as e:
        logger.error(f'Transaction rolled back due to error: {e}')
        raise

def test_connection() -> bool:
    """
    Test database connectivity
    
    Returns:
        True if connection successful, False otherwise
    """
    try:
        result = execute_query('SELECT NOW() as current_time')
        logger.info(f'Database connection test successful: {result[0]}')
        return True
    except Exception as e:
        logger.error(f'Database connection test failed: {e}')
        return False

def close_connections():
    """
    Close all database connections in the pool
    """
    global connection_pool
    
    if connection_pool:
        try:
            logger.info('Closing database connection pool')
            connection_pool.closeall()
            connection_pool = None
            logger.info('Database connection pool closed')
        except Exception as e:
            logger.error(f'Error closing connection pool: {e}')

def sanitize_db_value(value: Any) -> Any:
    """
    Safely sanitize values for database queries
    
    Args:
        value: Value to sanitize
        
    Returns:
        Sanitized value
    """
    if value is None:
        return None
    
    if isinstance(value, str):
        return value.strip()
    
    return value

def build_where_clause(filters: Dict[str, Any], base_conditions: List[str] = None) -> Tuple[str, List[Any]]:
    """
    Build WHERE clause and parameters from filter dictionary
    
    Args:
        filters: Dictionary of filter conditions
        base_conditions: List of base WHERE conditions to include
        
    Returns:
        Tuple of (where_clause_string, parameters_list)
    """
    if base_conditions is None:
        base_conditions = []
    
    conditions = base_conditions.copy()
    params = []
    param_index = len(params) + 1
    
    for key, value in filters.items():
        if value is not None and value != '':
            if key == 'status':
                conditions.append(f'status = %s')
                params.append(value)
            elif key == 'carrier':
                conditions.append(f'carrier ILIKE %s')
                params.append(f'%{value}%')
            elif key == 'resource_type':
                conditions.append(f'resource_type ILIKE %s')
                params.append(f'%{value}%')
            elif key == 'is_done':
                conditions.append(f'is_done = %s')
                params.append(value)
            elif key == 'order_number':
                conditions.append(f'order_number ILIKE %s')
                params.append(f'%{value}%')
    
    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    return where_clause, params

# Order status constants
ORDER_STATUSES = [
    'pending',
    'confirmed', 
    'in_transit',
    'out_for_delivery',
    'delivered',
    'cancelled',
    'returned'
]

# Validation constants
MAX_ORDER_CONTENT_LENGTH = 2000
MAX_LOCATION_LENGTH = 500
MAX_CARRIER_LENGTH = 100
MAX_RESOURCE_TYPE_LENGTH = 100
DEFAULT_PAGE_LIMIT = 20
MAX_PAGE_LIMIT = 100
