const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const TABLE_NAME = process.env.ORDERS_TABLE_NAME;
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Simulated payment processor.
 * EventBridge delivers OrderPlaced; we only touch paymentStatus so we
 * do not race with inventory/notification on the same attribute.
 */
exports.handler = async (event) => {
  console.log("Payment consumer event:", JSON.stringify(event));

  const detail = event.detail || {};
  const orderId = detail.orderId;
  if (!orderId) {
    throw new Error("OrderPlaced detail missing orderId");
  }

  // Simulate payment work (always succeeds in Week 2).
  console.log(`Simulating payment for order ${orderId}, total=${detail.totalAmount} ${detail.currency}`);

  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { orderId },
      UpdateExpression: "SET paymentStatus = :ps, updatedAt = :u",
      ExpressionAttributeValues: {
        ":ps": "PROCESSED",
        ":u": new Date().toISOString(),
      },
      ConditionExpression: "attribute_exists(orderId)",
    })
  );

  console.log(`paymentStatus=PROCESSED for ${orderId}`);
  return { ok: true, orderId, paymentStatus: "PROCESSED" };
};
