-- Database initialization script for Order Management System
-- This script creates the orders table and necessary indexes

-- Enable UUID extension for generating UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create orders table with enhanced fields for order management
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- Create indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_orders_owner_id ON orders(owner_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_carrier ON orders(carrier);
CREATE INDEX IF NOT EXISTS idx_orders_resource_type ON orders(resource_type);

-- Create a composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_orders_owner_status_created ON orders(owner_id, status, created_at DESC);

-- Create a trigger to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply the trigger to the orders table
DROP TRIGGER IF EXISTS update_orders_modtime ON orders;
CREATE TRIGGER update_orders_modtime 
    BEFORE UPDATE ON orders 
    FOR EACH ROW 
    EXECUTE FUNCTION update_modified_column();

-- Add some sample data for testing (optional - can be removed in production)
-- This helps verify the database setup is working correctly
INSERT INTO orders (order_number, content, status, carrier, resource_type, departure_location, destination_location, owner_id)
VALUES 
    ('ORD-001', 'Sample order for testing', 'pending', 'FedEx', 'Package', 'New York, NY', 'Los Angeles, CA', 'test-user-1'),
    ('ORD-002', 'Another test order', 'in_transit', 'UPS', 'Document', 'Chicago, IL', 'Miami, FL', 'test-user-1'),
    ('ORD-003', 'Completed test order', 'delivered', 'DHL', 'Equipment', 'Seattle, WA', 'Boston, MA', 'test-user-2')
ON CONFLICT (order_number) DO NOTHING;

-- Create a function to generate unique order numbers
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TEXT AS $$
DECLARE
    new_order_number TEXT;
    counter INTEGER := 1;
BEGIN
    LOOP
        new_order_number := 'ORD-' || LPAD(counter::TEXT, 6, '0');
        
        -- Check if this order number already exists
        IF NOT EXISTS (SELECT 1 FROM orders WHERE order_number = new_order_number) THEN
            RETURN new_order_number;
        END IF;
        
        counter := counter + 1;
        
        -- Safety check to prevent infinite loop
        IF counter > 999999 THEN
            RAISE EXCEPTION 'Unable to generate unique order number';
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions (adjust as needed for your specific setup)
-- These would typically be handled by the database admin or through IAM
-- GRANT SELECT, INSERT, UPDATE, DELETE ON orders TO lambda_execution_role;
-- GRANT USAGE, SELECT ON SEQUENCE orders_id_seq TO lambda_execution_role;
