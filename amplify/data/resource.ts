import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { orderResolvers } from "../functions/orderResolvers/resource";

/*== ORDER MANAGEMENT SYSTEM ============================================
This schema defines an Order Management System with PostgreSQL backend.
All operations are handled by custom Lambda resolvers that connect to
Aurora PostgreSQL database.
=========================================================================*/

const schema = a.schema({
  // Order type definition with all tracking fields
  Order: a.customType({
    id: a.id().required(),
    orderNumber: a.string().required(),
    content: a.string(),
    status: a.string().required(),
    carrier: a.string(),
    resourceType: a.string(),
    departureLocation: a.string(),
    destinationLocation: a.string(),
    isDone: a.boolean().required(),
    createdAt: a.datetime().required(),
    updatedAt: a.datetime().required(),
    owner: a.string().required(),
  }),

  // Response type for list operations
  ListOrdersResponse: a.customType({
    items: a.ref('Order').array().required(),
    total: a.integer().required(),
    limit: a.integer().required(),
    offset: a.integer().required(),
  }),

  // Delete response type
  DeleteOrderResponse: a.customType({
    id: a.id().required(),
    deleted: a.boolean().required(),
  }),

  // Query operations
  listOrders: a
    .query()
    .arguments({
      status: a.string(),
      carrier: a.string(),
      isDone: a.boolean(),
      limit: a.integer(),
      offset: a.integer(),
    })
    .returns(a.ref('ListOrdersResponse'))
    .authorization((allow) => [allow.authenticated()])
    .handler(
      a.handler.function(orderResolvers)
    ),

  getOrder: a
    .query()
    .arguments({
      id: a.id().required(),
    })
    .returns(a.ref('Order'))
    .authorization((allow) => [allow.authenticated()])
    .handler(
      a.handler.function(orderResolvers)
    ),

  // Mutation operations
  createOrder: a
    .mutation()
    .arguments({
      content: a.string(),
      status: a.string(),
      carrier: a.string(),
      resourceType: a.string(),
      departureLocation: a.string(),
      destinationLocation: a.string(),
      isDone: a.boolean(),
    })
    .returns(a.ref('Order'))
    .authorization((allow) => [allow.authenticated()])
    .handler(
      a.handler.function(orderResolvers)
    ),

  updateOrder: a
    .mutation()
    .arguments({
      id: a.id().required(),
      content: a.string(),
      status: a.string(),
      carrier: a.string(),
      resourceType: a.string(),
      departureLocation: a.string(),
      destinationLocation: a.string(),
      isDone: a.boolean(),
    })
    .returns(a.ref('Order'))
    .authorization((allow) => [allow.authenticated()])
    .handler(
      a.handler.function(orderResolvers)
    ),

  deleteOrder: a
    .mutation()
    .arguments({
      id: a.id().required(),
    })
    .returns(a.ref('DeleteOrderResponse'))
    .authorization((allow) => [allow.authenticated()])
    .handler(
      a.handler.function(orderResolvers)
    ),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    // This tells the data client in your app (generateClient())
    // to sign API requests with the user authentication token.
    defaultAuthorizationMode: 'userPool',
  },
});

/*== USAGE EXAMPLES ===================================================
Frontend code examples for using the Order Management API:
=========================================================================*/

/*
"use client"
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";

const client = generateClient<Schema>();

// List all orders with optional filtering
const { data: ordersResponse } = await client.queries.listOrders({
  status: "pending",
  limit: 20,
  offset: 0
});

// Get a specific order
const { data: order } = await client.queries.getOrder({
  id: "order-id-here"
});

// Create a new order
const { data: newOrder } = await client.mutations.createOrder({
  content: "Order description",
  status: "pending",
  carrier: "FedEx",
  resourceType: "Package",
  departureLocation: "New York, NY",
  destinationLocation: "Los Angeles, CA",
  isDone: false
});

// Update an existing order
const { data: updatedOrder } = await client.mutations.updateOrder({
  id: "order-id-here",
  status: "in_transit",
  isDone: false
});

// Delete an order
const { data: deleteResult } = await client.mutations.deleteOrder({
  id: "order-id-here"
});
*/
