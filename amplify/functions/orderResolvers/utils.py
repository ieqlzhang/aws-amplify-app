"""
Utility functions for Order Management System
Contains validation, transformation, and helper functions
"""

import re
import uuid
from datetime import datetime
from typing import Dict, Any, Optional, List
from database import ORDER_STATUSES, MAX_ORDER_CONTENT_LENGTH, MAX_LOCATION_LENGTH, MAX_CARRIER_LENGTH, MAX_RESOURCE_TYPE_LENGTH

class ValidationError(Exception):
    """Exception raised for validation errors"""
    pass

class UnauthorizedError(Exception):
    """Exception raised for unauthorized access"""
    pass

class OrderNotFoundError(Exception):
    """Exception raised when order is not found"""
    pass

def validate_order_input(order_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validate and sanitize order input data
    
    Args:
        order_data: Dictionary containing order data
        
    Returns:
        Validated and sanitized order data
        
    Raises:
        ValidationError: If validation fails
    """
    validated = {}
    
    # Validate content
    if 'content' in order_data:
        content = order_data['content']
        if content is not None:
            if not isinstance(content, str):
                raise ValidationError('Content must be a string')
            if len(content) > MAX_ORDER_CONTENT_LENGTH:
                raise ValidationError(f'Content must be {MAX_ORDER_CONTENT_LENGTH} characters or less')
            validated['content'] = content.strip() if content.strip() else None
    
    # Validate status
    if 'status' in order_data:
        status = order_data['status']
        if status is not None:
            if status not in ORDER_STATUSES:
                raise ValidationError(f'Status must be one of: {", ".join(ORDER_STATUSES)}')
            validated['status'] = status
    
    # Validate carrier
    if 'carrier' in order_data:
        carrier = order_data['carrier']
        if carrier is not None:
            if not isinstance(carrier, str):
                raise ValidationError('Carrier must be a string')
            if len(carrier) > MAX_CARRIER_LENGTH:
                raise ValidationError(f'Carrier must be {MAX_CARRIER_LENGTH} characters or less')
            validated['carrier'] = carrier.strip() if carrier.strip() else None
    
    # Validate resource_type
    if 'resource_type' in order_data:
        resource_type = order_data['resource_type']
        if resource_type is not None:
            if not isinstance(resource_type, str):
                raise ValidationError('Resource type must be a string')
            if len(resource_type) > MAX_RESOURCE_TYPE_LENGTH:
                raise ValidationError(f'Resource type must be {MAX_RESOURCE_TYPE_LENGTH} characters or less')
            validated['resource_type'] = resource_type.strip() if resource_type.strip() else None
    
    # Validate departure_location
    if 'departure_location' in order_data:
        departure_location = order_data['departure_location']
        if departure_location is not None:
            if not isinstance(departure_location, str):
                raise ValidationError('Departure location must be a string')
            if len(departure_location) > MAX_LOCATION_LENGTH:
                raise ValidationError(f'Departure location must be {MAX_LOCATION_LENGTH} characters or less')
            validated['departure_location'] = departure_location.strip() if departure_location.strip() else None
    
    # Validate destination_location
    if 'destination_location' in order_data:
        destination_location = order_data['destination_location']
        if destination_location is not None:
            if not isinstance(destination_location, str):
                raise ValidationError('Destination location must be a string')
            if len(destination_location) > MAX_LOCATION_LENGTH:
                raise ValidationError(f'Destination location must be {MAX_LOCATION_LENGTH} characters or less')
            validated['destination_location'] = destination_location.strip() if destination_location.strip() else None
    
    # Validate is_done
    if 'is_done' in order_data:
        is_done = order_data['is_done']
        if is_done is not None:
            if not isinstance(is_done, bool):
                raise ValidationError('is_done must be a boolean')
            validated['is_done'] = is_done
    
    return validated

def generate_order_number() -> str:
    """
    Generate a unique order number
    
    Returns:
        String order number in format ORD-XXXXXX
    """
    # Generate a UUID and use last 6 characters
    order_id = str(uuid.uuid4()).replace('-', '').upper()[-6:]
    return f'ORD-{order_id}'

def transform_db_row_to_order(row: Dict[str, Any]) -> Dict[str, Any]:
    """
    Transform database row to GraphQL order format
    
    Args:
        row: Database row dictionary
        
    Returns:
        Order dictionary in GraphQL format
    """
    return {
        'id': row['id'],
        'orderNumber': row['order_number'],
        'content': row['content'],
        'status': row['status'],
        'carrier': row['carrier'],
        'resourceType': row['resource_type'],
        'departureLocation': row['departure_location'],
        'destinationLocation': row['destination_location'],
        'isDone': row['is_done'],
        'createdAt': row['created_at'].isoformat() if row['created_at'] else None,
        'updatedAt': row['updated_at'].isoformat() if row['updated_at'] else None,
        'owner': row['owner_id']
    }

def transform_order_to_db_params(order_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Transform GraphQL order input to database parameters
    
    Args:
        order_data: Order data from GraphQL
        
    Returns:
        Dictionary with database column names
    """
    db_params = {}
    
    field_mapping = {
        'content': 'content',
        'status': 'status',
        'carrier': 'carrier',
        'resourceType': 'resource_type',
        'resource_type': 'resource_type',  # Support both formats
        'departureLocation': 'departure_location',
        'departure_location': 'departure_location',  # Support both formats
        'destinationLocation': 'destination_location',
        'destination_location': 'destination_location',  # Support both formats
        'isDone': 'is_done',
        'is_done': 'is_done'  # Support both formats
    }
    
    for graphql_field, db_field in field_mapping.items():
        if graphql_field in order_data:
            db_params[db_field] = order_data[graphql_field]
    
    return db_params

def get_user_id_from_event(event: Dict[str, Any]) -> str:
    """
    Extract user ID from GraphQL resolver event
    
    Args:
        event: GraphQL resolver event
        
    Returns:
        User ID string
        
    Raises:
        UnauthorizedError: If user is not authenticated
    """
    # Try to get user ID from identity
    if 'identity' in event and event['identity']:
        user_id = event['identity'].get('sub')
        if user_id:
            return user_id
    
    # Try to get from request context (for API Gateway events)
    if 'requestContext' in event:
        authorizer = event['requestContext'].get('authorizer', {})
        claims = authorizer.get('claims', {})
        user_id = claims.get('sub')
        if user_id:
            return user_id
    
    raise UnauthorizedError('User not authenticated')

def validate_uuid(uuid_string: str) -> bool:
    """
    Validate if string is a valid UUID
    
    Args:
        uuid_string: String to validate
        
    Returns:
        True if valid UUID, False otherwise
    """
    try:
        uuid.UUID(uuid_string)
        return True
    except ValueError:
        return False

def build_pagination_params(args: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build pagination parameters from GraphQL arguments
    
    Args:
        args: GraphQL resolver arguments
        
    Returns:
        Dictionary with limit, offset, and ordering
    """
    limit = args.get('limit', 20)
    
    # Validate and constrain limit
    if limit > 100:
        limit = 100
    if limit < 1:
        limit = 1
    
    offset = args.get('offset', 0)
    if offset < 0:
        offset = 0
    
    # Handle sorting
    sort_field = args.get('sortField', 'created_at')
    sort_direction = args.get('sortDirection', 'DESC')
    
    # Map GraphQL field names to database field names
    field_mapping = {
        'createdAt': 'created_at',
        'updatedAt': 'updated_at',
        'orderNumber': 'order_number',
        'status': 'status'
    }
    
    db_sort_field = field_mapping.get(sort_field, 'created_at')
    
    # Validate sort direction
    if sort_direction.upper() not in ['ASC', 'DESC']:
        sort_direction = 'DESC'
    
    return {
        'limit': limit,
        'offset': offset,
        'order_by': f'{db_sort_field} {sort_direction.upper()}'
    }

def create_graphql_response(data: Any = None, errors: List[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Create a GraphQL response format
    
    Args:
        data: Response data
        errors: List of error objects
        
    Returns:
        GraphQL response dictionary
    """
    response = {}
    
    if data is not None:
        response['data'] = data
    
    if errors:
        response['errors'] = errors
    
    return response

def create_error_response(message: str, error_type: str = 'Error', path: List[str] = None) -> Dict[str, Any]:
    """
    Create an error response
    
    Args:
        message: Error message
        error_type: Type of error
        path: GraphQL path where error occurred
        
    Returns:
        Error response dictionary
    """
    error = {
        'message': message,
        'extensions': {
            'code': error_type
        }
    }
    
    if path:
        error['path'] = path
    
    return create_graphql_response(errors=[error])

def log_performance(operation: str, start_time: datetime, additional_info: Dict[str, Any] = None):
    """
    Log performance metrics for operations
    
    Args:
        operation: Name of the operation
        start_time: Operation start time
        additional_info: Additional information to log
    """
    import logging
    
    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds()
    
    log_data = {
        'operation': operation,
        'duration_seconds': duration,
        'timestamp': end_time.isoformat()
    }
    
    if additional_info:
        log_data.update(additional_info)
    
    logging.info(f'Performance: {operation} completed in {duration:.3f}s', extra=log_data)

def sanitize_search_term(search_term: str) -> str:
    """
    Sanitize search terms to prevent SQL injection
    
    Args:
        search_term: Raw search term
        
    Returns:
        Sanitized search term
    """
    if not search_term:
        return ''
    
    # Remove potentially dangerous characters
    sanitized = re.sub(r'[%_\\]', '', search_term.strip())
    
    # Limit length
    if len(sanitized) > 100:
        sanitized = sanitized[:100]
    
    return sanitized

def validate_filters(filters: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validate and sanitize filter parameters
    
    Args:
        filters: Raw filter parameters
        
    Returns:
        Validated filter parameters
    """
    validated_filters = {}
    
    # Validate status filter
    if 'status' in filters and filters['status']:
        status = filters['status']
        if status in ORDER_STATUSES:
            validated_filters['status'] = status
    
    # Validate carrier filter
    if 'carrier' in filters and filters['carrier']:
        carrier = sanitize_search_term(filters['carrier'])
        if carrier:
            validated_filters['carrier'] = carrier
    
    # Validate resource type filter
    if 'resourceType' in filters and filters['resourceType']:
        resource_type = sanitize_search_term(filters['resourceType'])
        if resource_type:
            validated_filters['resource_type'] = resource_type
    
    # Validate is_done filter
    if 'isDone' in filters and isinstance(filters['isDone'], bool):
        validated_filters['is_done'] = filters['isDone']
    
    # Validate order number filter
    if 'orderNumber' in filters and filters['orderNumber']:
        order_number = sanitize_search_term(filters['orderNumber'])
        if order_number:
            validated_filters['order_number'] = order_number
    
    return validated_filters
