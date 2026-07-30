const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const TABLE_NAME = process.env.ORDERS_TABLE_NAME;
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Simulated notification service.
 * Week 3 will put SQS (+ DLQ) in front of this function.
 */
exports.handler = async (event) => {
  console.log("Notification consumer event:", JSON.stringify(event));

  const detail = event.detail || {};
  const orderId = detail.orderId;
  if (!orderId) {
    throw new Error("OrderPlaced detail missing orderId");
  }

  console.log(
    `Simulating notification for order ${orderId} to customer ${detail.customerId}`
  );

  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { orderId },
      UpdateExpression: "SET notificationStatus = :ns, updatedAt = :u",
      ExpressionAttributeValues: {
        ":ns": "SENT",
        ":u": new Date().toISOString(),
      },
      ConditionExpression: "attribute_exists(orderId)",
    })
  );

  console.log(`notificationStatus=SENT for ${orderId}`);
  return { ok: true, orderId, notificationStatus: "SENT" };
};
