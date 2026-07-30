const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const TABLE_NAME = process.env.ORDERS_TABLE_NAME;
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Simulated inventory reservation.
 * Reserves stock for each SKU in the OrderPlaced detail.
 */
exports.handler = async (event) => {
  console.log("Inventory consumer event:", JSON.stringify(event));

  const detail = event.detail || {};
  const orderId = detail.orderId;
  if (!orderId) {
    throw new Error("OrderPlaced detail missing orderId");
  }

  const skus = (detail.items || []).map((i) => i.sku).join(", ");
  console.log(`Simulating inventory reserve for order ${orderId}: ${skus}`);

  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { orderId },
      UpdateExpression: "SET inventoryStatus = :is, updatedAt = :u",
      ExpressionAttributeValues: {
        ":is": "RESERVED",
        ":u": new Date().toISOString(),
      },
      ConditionExpression: "attribute_exists(orderId)",
    })
  );

  console.log(`inventoryStatus=RESERVED for ${orderId}`);
  return { ok: true, orderId, inventoryStatus: "RESERVED" };
};
