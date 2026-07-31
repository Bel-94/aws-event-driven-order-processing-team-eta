const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { EventBridgeClient, PutEventsCommand } = require("@aws-sdk/client-eventbridge");
const { randomUUID } = require("crypto");

// ---------------------------------------------------------------------------
// Setup
// Table name and event bus come from environment variables (CloudFormation).
// We never hardcode resource names in Lambda code.
// ---------------------------------------------------------------------------
const TABLE_NAME = process.env.ORDERS_TABLE_NAME;
const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME;
const EVENT_SOURCE = process.env.EVENT_SOURCE || "order.processing";

const ALLOWED_ORIGINS = (
  process.env.CORS_ALLOWED_ORIGINS ||
  "https://main.d1lubsio53fudu.amplifyapp.com,http://127.0.0.1:4200,http://localhost:4200"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const eventBridge = new EventBridgeClient({});

function responseHeaders(event) {
  const origin = event?.headers?.origin || event?.headers?.Origin || "";
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "OPTIONS,POST",
  };
}

function jsonResponse(event, statusCode, body) {
  return {
    statusCode,
    headers: responseHeaders(event),
    body: JSON.stringify(body),
  };
}
// ---------------------------------------------------------------------------
// SECTION 1 — Validation
// ---------------------------------------------------------------------------

const REQUIRED_TOP_LEVEL_FIELDS = ["customerId", "items"];
const REQUIRED_ITEM_FIELDS = ["sku", "quantity", "unitPrice"];

function validateOrder(body) {
  const missingFields = REQUIRED_TOP_LEVEL_FIELDS.filter(
    (field) => body[field] === undefined || body[field] === null || body[field] === ""
  );

  if (missingFields.length > 0) {
    return {
      valid: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    };
  }

  if (typeof body.customerId !== "string" || body.customerId.trim() === "") {
    return {
      valid: false,
      message: "customerId must be a non-empty string",
    };
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return {
      valid: false,
      message: "items must be a non-empty array",
    };
  }

  for (let i = 0; i < body.items.length; i++) {
    const item = body.items[i];

    const missingItemFields = REQUIRED_ITEM_FIELDS.filter(
      (field) => item[field] === undefined || item[field] === null || item[field] === ""
    );

    if (missingItemFields.length > 0) {
      return {
        valid: false,
        message: `Item at index ${i} is missing: ${missingItemFields.join(", ")}`,
      };
    }

    if (typeof item.sku !== "string" || item.sku.trim() === "") {
      return {
        valid: false,
        message: `Item at index ${i} has an invalid sku — must be a non-empty string`,
      };
    }

    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      return {
        valid: false,
        message: `Item with sku "${item.sku}" has an invalid quantity — must be a whole number of at least 1`,
      };
    }

    if (typeof item.unitPrice !== "number" || item.unitPrice <= 0) {
      return {
        valid: false,
        message: `Item with sku "${item.sku}" has an invalid unitPrice — must be a number greater than 0`,
      };
    }
  }

  if (body.currency !== undefined) {
    if (typeof body.currency !== "string" || !/^[A-Z]{3}$/.test(body.currency)) {
      return {
        valid: false,
        message: "currency must be a 3-letter uppercase code, e.g. USD, GHS, EUR",
      };
    }
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// SECTION 2 — Order builder
// ---------------------------------------------------------------------------

function buildOrderItem(body) {
  const now = new Date().toISOString();
  const orderId = `ord_${randomUUID()}`;

  const totalAmount = body.items.reduce((sum, item) => {
    return sum + item.quantity * item.unitPrice;
  }, 0);

  return {
    orderId,
    customerId: body.customerId.trim(),
    ...(typeof body.customerEmail === "string" && body.customerEmail.trim()
      ? { customerEmail: body.customerEmail.trim().toLowerCase() }
      : {}),
    items: body.items,
    status: "PENDING",
    totalAmount: parseFloat(totalAmount.toFixed(2)),
    currency: body.currency || "USD",
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// SECTION 2b — Publish OrderPlaced to EventBridge (Week 2)
// ---------------------------------------------------------------------------

async function publishOrderPlaced(orderItem) {
  if (!EVENT_BUS_NAME) {
    throw new Error("EVENT_BUS_NAME environment variable is not set");
  }

  const result = await eventBridge.send(
    new PutEventsCommand({
      Entries: [
        {
          EventBusName: EVENT_BUS_NAME,
          Source: EVENT_SOURCE,
          DetailType: "OrderPlaced",
          Detail: JSON.stringify(orderItem),
        },
      ],
    })
  );

  if (result.FailedEntryCount && result.FailedEntryCount > 0) {
    console.error("PutEvents failed entries:", JSON.stringify(result.Entries));
    throw new Error("Failed to publish OrderPlaced event to EventBridge");
  }

  console.log("OrderPlaced published to EventBridge. orderId:", orderItem.orderId);
}

// ---------------------------------------------------------------------------
// SECTION 3 — Lambda handler
// Flow: parse -> validate -> build -> DynamoDB PutItem -> EventBridge PutEvents -> 201
// ---------------------------------------------------------------------------

exports.handler = async (event) => {
  console.log("Incoming request:", JSON.stringify(event, null, 2));

  // Browser preflight from Amplify / local Angular
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: responseHeaders(event),
      body: "",
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (parseError) {
    console.warn("Failed to parse request body:", parseError.message);
    return jsonResponse(event, 400, { message: "Request body is not valid JSON" });
  }

  const validation = validateOrder(body);
  if (!validation.valid) {
    console.warn("Validation failed:", validation.message);
    return jsonResponse(event, 400, { message: validation.message });
  }

  const orderItem = buildOrderItem(body);
  console.log("Built order item:", JSON.stringify(orderItem, null, 2));

  try {
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: orderItem,
        ConditionExpression: "attribute_not_exists(orderId)",
      })
    );
  } catch (dbError) {
    console.error("DynamoDB write failed:", dbError);

    if (dbError.name === "ConditionalCheckFailedException") {
      return jsonResponse(event, 409, { message: "An order with this ID already exists" });
    }

    return jsonResponse(event, 500, {
      message: "Failed to save the order. Please try again.",
    });
  }

  console.log("Order written to DynamoDB successfully. orderId:", orderItem.orderId);

  try {
    await publishOrderPlaced(orderItem);
  } catch (publishError) {
    console.error("EventBridge publish failed after DynamoDB write:", publishError);
    return jsonResponse(event, 500, {
      message:
        "Order was saved but OrderPlaced event failed to publish. Check EVENT_BUS_NAME and IAM events:PutEvents.",
      orderId: orderItem.orderId,
    });
  }

  return jsonResponse(event, 201, {
    orderId: orderItem.orderId,
    status: orderItem.status,
    totalAmount: orderItem.totalAmount,
    currency: orderItem.currency,
    createdAt: orderItem.createdAt,
    eventPublished: true,
  });
};
