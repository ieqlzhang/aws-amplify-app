"""
Main Lambda handler for Order Management GraphQL resolvers
Handles all CRUD operations for orders using PostgreSQL
"""

import json
import logging
from datetime import datetime
from typing import Dict, Any, Optional

# Import our custom modules
from database import (
    execute_query, execute_mutation, database_transaction, 
    build_where_clause, DatabaseError, test_connection
)
from utils import (
    validate_order_input, generate_order_number, transform_db_row_to_order,
    transform_order_to_db_params, get_user_id_from_event, validate_uuid,
    build_pagination_params, create_graphql_response, create_error_response,
    log_performance, validate_filters, ValidationError, UnauthorizedError,
    OrderNotFoundError
)

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def handler(event, context):
    """
    Main Lambda handler for GraphQL resolvers
    
    Args:
        event: GraphQL resolver event
        context: Lambda context
        
    Returns:
        GraphQL response dictionary
    """
    start_time = datetime.now()
    
    try:
        logger.info(f'Order resolver invoked: {json.dumps(event, default=str)}')
        
        # Extract field name to determine which resolver to execute
        field_name = event.get('info', {}).get('fieldName')
        
        if not field_name:
            return create_error_response('Invalid GraphQL field name', 'INVALID_REQUEST')
        
        # Route to appropriate resolver
        if field_name == 'listOrders':
            result = list_orders_resolver(event)
        elif field_name == 'getOrder':
            result = get_order_resolver(event)
        elif field_name == 'createOrder':
            result = create_order_resolver(event)
        elif field_name == 'updateOrder':
            result = update_order_resolver(event)
        elif field_name == 'deleteOrder':
            result = delete_order_resolver(event)
        else:
            return create_error_response(f'Unknown resolver: {field_name}', 'INVALID_RESOLVER')
        
        log_performance(f'{field_name}_resolver', start_time, {
            'user_id': event.get('identity', {}).get('sub', 'unknown'),
            'arguments': event.get('arguments', {})
        })
        
        return result
        
    except Exception as e:
        logger.error(f'Unhandled error in order resolver: {e}', exc_info=True)
        return create_error_response(
            'Internal server error', 
            'INTERNAL_ERROR'
        )

def list_orders_resolver(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Resolver for listing orders with filtering and pagination
    
    Args:
        event: GraphQL resolver event
        
    Returns:
        GraphQL response with list of orders
    """
    try:
        # Get user ID for authorization
        user_id = get_user_id_from_event(event)
        
        # Extract arguments
        args = event.get('arguments', {})
        filter_args = args.get('filter', {})
        
        # Validate and build filters
        filters = validate_filters(filter_args)
        
        # Build pagination parameters
        pagination = build_pagination_params(args)
        
        # Build WHERE clause with owner filter
        base_conditions = ['owner_id = %s']
        where_clause, params = build_where_clause(filters, base_conditions)
        params = [user_id] + params  # Add user_id as first parameter
        
        # Build the main query
        query = f"""
            SELECT id, order_number, content, status, carrier, resource_type,
                   departure_location, destination_location, is_done,
                   created_at, updated_at, owner_id
            FROM orders
            {where_clause}
            ORDER BY {pagination['order_by']}
            LIMIT %s OFFSET %s
        """
        
        # Add pagination parameters
        params.extend([pagination['limit'], pagination['offset']])
        
        # Execute query
        rows = execute_query(query, tuple(params))
        
        # Transform results
        orders = [transform_db_row_to_order(row) for row in rows]
        
        # Get total count for pagination (optional)
        count_query = f"""
            SELECT COUNT(*) as total
            FROM orders
            {where_clause}
        """
        count_params = [user_id] + (params[1:-2] if len(params) > 2 else [])
        count_result = execute_query(count_query, tuple(count_params))
        total = count_result[0]['total'] if count_result else 0
        
        response_data = {
            'items': orders,
            'total': total,
            'limit': pagination['limit'],
            'offset': pagination['offset']
        }
        
        logger.info(f'Listed {len(orders)} orders for user {user_id}')
        return create_graphql_response(response_data)
        
    except UnauthorizedError as e:
        return create_error_response(str(e), 'UNAUTHORIZED')
    except ValidationError as e:
        return create_error_response(str(e), 'VALIDATION_ERROR')
    except DatabaseError as e:
        logger.error(f'Database error in list_orders: {e}')
        return create_error_response('Database error occurred', 'DATABASE_ERROR')
    except Exception as e:
        logger.error(f'Error in list_orders_resolver: {e}', exc_info=True)
        return create_error_response('Failed to list orders', 'INTERNAL_ERROR')

def get_order_resolver(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Resolver for getting a single order by ID
    
    Args:
        event: GraphQL resolver event
        
    Returns:
        GraphQL response with order data
    """
    try:
        # Get user ID for authorization
        user_id = get_user_id_from_event(event)
        
        # Extract order ID from arguments
        args = event.get('arguments', {})
        order_id = args.get('id')
        
        if not order_id:
            return create_error_response('Order ID is required', 'VALIDATION_ERROR')
        
        if not validate_uuid(order_id):
            return create_error_response('Invalid order ID format', 'VALIDATION_ERROR')
        
        # Query for the specific order
        query = """
            SELECT id, order_number, content, status, carrier, resource_type,
                   departure_location, destination_location, is_done,
                   created_at, updated_at, owner_id
            FROM orders
            WHERE id = %s AND owner_id = %s
        """
        
        rows = execute_query(query, (order_id, user_id))
        
        if not rows:
            return create_error_response('Order not found', 'NOT_FOUND')
        
        order = transform_db_row_to_order(rows[0])
        
        logger.info(f'Retrieved order {order_id} for user {user_id}')
        return create_graphql_response(order)
        
    except UnauthorizedError as e:
        return create_error_response(str(e), 'UNAUTHORIZED')
    except DatabaseError as e:
        logger.error(f'Database error in get_order: {e}')
        return create_error_response('Database error occurred', 'DATABASE_ERROR')
    except Exception as e:
        logger.error(f'Error in get_order_resolver: {e}', exc_info=True)
        return create_error_response('Failed to get order', 'INTERNAL_ERROR')

def create_order_resolver(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Resolver for creating a new order
    
    Args:
        event: GraphQL resolver event
        
    Returns:
        GraphQL response with created order data
    """
    try:
        # Get user ID for authorization
        user_id = get_user_id_from_event(event)
        
        # Extract input data
        args = event.get('arguments', {})
        input_data = args.get('input', {})
        
        # Validate input data
        validated_data = validate_order_input(input_data)
        
        # Transform to database parameters
        db_params = transform_order_to_db_params(validated_data)
        
        # Generate order number if not provided
        order_number = generate_order_number()
        
        # Set default values
        db_params.setdefault('status', 'pending')
        db_params.setdefault('is_done', False)
        
        # Build insert query
        fields = ['order_number', 'owner_id'] + list(db_params.keys())
        placeholders = ', '.join(['%s'] * len(fields))
        field_names = ', '.join(fields)
        
        query = f"""
            INSERT INTO orders ({field_names})
            VALUES ({placeholders})
            RETURNING id, order_number, content, status, carrier, resource_type,
                     departure_location, destination_location, is_done,
                     created_at, updated_at, owner_id
        """
        
        # Prepare values
        values = [order_number, user_id] + list(db_params.values())
        
        # Execute mutation
        result = execute_mutation(query, tuple(values))
        
        if not result:
            return create_error_response('Failed to create order', 'DATABASE_ERROR')
        
        order = transform_db_row_to_order(result)
        
        logger.info(f'Created order {order["id"]} for user {user_id}')
        return create_graphql_response(order)
        
    except UnauthorizedError as e:
        return create_error_response(str(e), 'UNAUTHORIZED')
    except ValidationError as e:
        return create_error_response(str(e), 'VALIDATION_ERROR')
    except DatabaseError as e:
        logger.error(f'Database error in create_order: {e}')
        return create_error_response('Database error occurred', 'DATABASE_ERROR')
    except Exception as e:
        logger.error(f'Error in create_order_resolver: {e}', exc_info=True)
        return create_error_response('Failed to create order', 'INTERNAL_ERROR')

def update_order_resolver(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Resolver for updating an existing order
    
    Args:
        event: GraphQL resolver event
        
    Returns:
        GraphQL response with updated order data
    """
    try:
        # Get user ID for authorization
        user_id = get_user_id_from_event(event)
        
        # Extract input data
        args = event.get('arguments', {})
        input_data = args.get('input', {})
        
        order_id = input_data.get('id')
        if not order_id:
            return create_error_response('Order ID is required', 'VALIDATION_ERROR')
        
        if not validate_uuid(order_id):
            return create_error_response('Invalid order ID format', 'VALIDATION_ERROR')
        
        # Validate input data (excluding ID)
        update_data = {k: v for k, v in input_data.items() if k != 'id'}
        validated_data = validate_order_input(update_data)
        
        if not validated_data:
            return create_error_response('No fields to update', 'VALIDATION_ERROR')
        
        # Transform to database parameters
        db_params = transform_order_to_db_params(validated_data)
        
        # Build update query
        set_clauses = []
        values = []
        
        for field, value in db_params.items():
            set_clauses.append(f'{field} = %s')
            values.append(value)
        
        # Add updated_at timestamp
        set_clauses.append('updated_at = NOW()')
        
        # Add WHERE clause parameters
        values.extend([order_id, user_id])
        
        query = f"""
            UPDATE orders
            SET {', '.join(set_clauses)}
            WHERE id = %s AND owner_id = %s
            RETURNING id, order_number, content, status, carrier, resource_type,
                     departure_location, destination_location, is_done,
                     created_at, updated_at, owner_id
        """
        
        # Execute mutation
        result = execute_mutation(query, tuple(values))
        
        if not result:
            return create_error_response('Order not found or access denied', 'NOT_FOUND')
        
        order = transform_db_row_to_order(result)
        
        logger.info(f'Updated order {order_id} for user {user_id}')
        return create_graphql_response(order)
        
    except UnauthorizedError as e:
        return create_error_response(str(e), 'UNAUTHORIZED')
    except ValidationError as e:
        return create_error_response(str(e), 'VALIDATION_ERROR')
    except DatabaseError as e:
        logger.error(f'Database error in update_order: {e}')
        return create_error_response('Database error occurred', 'DATABASE_ERROR')
    except Exception as e:
        logger.error(f'Error in update_order_resolver: {e}', exc_info=True)
        return create_error_response('Failed to update order', 'INTERNAL_ERROR')

def delete_order_resolver(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Resolver for deleting an order
    
    Args:
        event: GraphQL resolver event
        
    Returns:
        GraphQL response with deletion confirmation
    """
    try:
        # Get user ID for authorization
        user_id = get_user_id_from_event(event)
        
        # Extract order ID from arguments
        args = event.get('arguments', {})
        order_id = args.get('id')
        
        if not order_id:
            return create_error_response('Order ID is required', 'VALIDATION_ERROR')
        
        if not validate_uuid(order_id):
            return create_error_response('Invalid order ID format', 'VALIDATION_ERROR')
        
        # Delete the order
        query = """
            DELETE FROM orders
            WHERE id = %s AND owner_id = %s
            RETURNING id
        """
        
        result = execute_mutation(query, (order_id, user_id))
        
        if not result:
            return create_error_response('Order not found or access denied', 'NOT_FOUND')
        
        logger.info(f'Deleted order {order_id} for user {user_id}')
        return create_graphql_response({'id': order_id, 'deleted': True})
        
    except UnauthorizedError as e:
        return create_error_response(str(e), 'UNAUTHORIZED')
    except DatabaseError as e:
        logger.error(f'Database error in delete_order: {e}')
        return create_error_response('Database error occurred', 'DATABASE_ERROR')
    except Exception as e:
        logger.error(f'Error in delete_order_resolver: {e}', exc_info=True)
        return create_error_response('Failed to delete order', 'INTERNAL_ERROR')

# Health check function
def health_check():
    """
    Perform health check on database connection
    
    Returns:
        Dict with health status
    """
    try:
        connection_ok = test_connection()
        return {
            'status': 'healthy' if connection_ok else 'unhealthy',
            'database': 'connected' if connection_ok else 'disconnected',
            'timestamp': datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f'Health check failed: {e}')
        return {
            'status': 'unhealthy',
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }
