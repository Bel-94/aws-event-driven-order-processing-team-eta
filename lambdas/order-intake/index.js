const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { randomUUID } = require("crypto");

// ---------------------------------------------------------------------------
// Setup
// Table name comes from the environment variable defined in CloudFormation.
// We never hardcode resource names in Lambda code.
// ---------------------------------------------------------------------------
const TABLE_NAME = process.env.ORDERS_TABLE_NAME;

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

// ---------------------------------------------------------------------------
// SECTION 1 — Validation (Role 2 contribution)
//
// This runs before we do anything with the database.
// If the request is bad we return a 400 immediately and nothing gets written.
// ---------------------------------------------------------------------------

const REQUIRED_TOP_LEVEL_FIELDS = ["customerId", "items"];
const REQUIRED_ITEM_FIELDS = ["sku", "quantity", "unitPrice"];

function validateOrder(body) {
  // Check top-level required fields exist and are not empty
  const missingFields = REQUIRED_TOP_LEVEL_FIELDS.filter(
    (field) => body[field] === undefined || body[field] === null || body[field] === ""
  );

  if (missingFields.length > 0) {
    return {
      valid: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    };
  }

  // customerId must be a non-empty string
  if (typeof body.customerId !== "string" || body.customerId.trim() === "") {
    return {
      valid: false,
      message: "customerId must be a non-empty string",
    };
  }

  // items must be an array with at least one entry
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return {
      valid: false,
      message: "items must be a non-empty array",
    };
  }

  // Validate each item in the order
  for (let i = 0; i < body.items.length; i++) {
    const item = body.items[i];

    // Check all required item fields are present
    const missingItemFields = REQUIRED_ITEM_FIELDS.filter(
      (field) => item[field] === undefined || item[field] === null || item[field] === ""
    );

    if (missingItemFields.length > 0) {
      return {
        valid: false,
        message: `Item at index ${i} is missing: ${missingItemFields.join(", ")}`,
      };
    }

    // sku must be a non-empty string
    if (typeof item.sku !== "string" || item.sku.trim() === "") {
      return {
        valid: false,
        message: `Item at index ${i} has an invalid sku — must be a non-empty string`,
      };
    }

    // quantity must be a whole number greater than zero
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      return {
        valid: false,
        message: `Item with sku "${item.sku}" has an invalid quantity — must be a whole number of at least 1`,
      };
    }

    // unitPrice must be a positive number
    if (typeof item.unitPrice !== "number" || item.unitPrice <= 0) {
      return {
        valid: false,
        message: `Item with sku "${item.sku}" has an invalid unitPrice — must be a number greater than 0`,
      };
    }
  }

  // currency is optional, but if provided it must be a 3-letter code
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
// SECTION 2 — Order builder (Role 4 contribution)
//
// Builds the complete record that will be written to DynamoDB.
// The orderId is generated here so the client never has to provide one.
// ---------------------------------------------------------------------------

function buildOrderItem(body) {
  const now = new Date().toISOString();
  const orderId = `ord_${randomUUID()}`;

  // Calculate the total from the items array
  const totalAmount = body.items.reduce((sum, item) => {
    return sum + item.quantity * item.unitPrice;
  }, 0);

  return {
    // Partition key — matches the KeySchema in dynamodb.yaml
    orderId,

    // Customer and items exactly as received (already validated above)
    customerId: body.customerId.trim(),
    items: body.items,

    // Status starts as PENDING.
    // Week 2 consumer Lambdas will update this to PAID, STOCK_RESERVED, etc.
    status: "PENDING",

    // Rounded to 2 decimal places to avoid floating point issues e.g. 39.999999
    totalAmount: parseFloat(totalAmount.toFixed(2)),

    // Default to USD if not provided — already validated as 3-letter code if present
    currency: body.currency || "USD",

    // createdAt is set once and never changed.
    // updatedAt will be updated by consumer Lambdas when they process the order.
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// SECTION 3 — Lambda handler (entry point)
//
// API Gateway calls this with a proxy event.
// The flow is: parse body -> validate -> build record -> write to DynamoDB -> respond.
// Any failure short-circuits and returns an appropriate HTTP response.
// ---------------------------------------------------------------------------

exports.handler = async (event) => {
  console.log("Incoming request:", JSON.stringify(event, null, 2));

  // Step 1: Parse the request body.
  // API Gateway proxy integration sends body as a raw string, not an object.
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (parseError) {
    console.warn("Failed to parse request body:", parseError.message);
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Request body is not valid JSON",
      }),
    };
  }

  // Step 2: Validate the parsed body.
  const validation = validateOrder(body);
  if (!validation.valid) {
    console.warn("Validation failed:", validation.message);
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: validation.message,
      }),
    };
  }

  // Step 3: Build the complete order record.
  const orderItem = buildOrderItem(body);
  console.log("Built order item:", JSON.stringify(orderItem, null, 2));

  // Step 4: Write to DynamoDB.
  // ConditionExpression prevents overwriting an existing order if the same
  // orderId somehow appears twice (near impossible with UUID, but safe practice).
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

    // ConditionalCheckFailedException means the orderId already existed
    if (dbError.name === "ConditionalCheckFailedException") {
      return {
        statusCode: 409,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "An order with this ID already exists",
        }),
      };
    }

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Failed to save the order. Please try again.",
      }),
    };
  }

  console.log("Order written to DynamoDB successfully. orderId:", orderItem.orderId);

  // Step 5: Return 201 Created with a summary for the client.
  // We do not return the full item — just what the client needs to know.
  return {
    statusCode: 201,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orderId: orderItem.orderId,
      status: orderItem.status,
      totalAmount: orderItem.totalAmount,
      currency: orderItem.currency,
      createdAt: orderItem.createdAt,
    }),
  };
};
