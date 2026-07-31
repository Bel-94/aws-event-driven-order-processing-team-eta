const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

const TABLE_NAME = process.env.ORDERS_TABLE_NAME;
const NOTIFICATION_SECRET_ARN = process.env.NOTIFICATION_SECRET_ARN;
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const secretsClient = new SecretsManagerClient({});

async function loadNotificationCredentials() {
  if (!NOTIFICATION_SECRET_ARN) {
    console.log("NOTIFICATION_SECRET_ARN not set — skipping Secrets Manager lookup");
    return null;
  }

  const result = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: NOTIFICATION_SECRET_ARN })
  );
  const secret = JSON.parse(result.SecretString || "{}");
  console.log("Loaded notification service secret. keys:", Object.keys(secret).join(","));
  return secret;
}

async function processOrder(detail) {
  const { orderId, customerId } = detail;

  if (!orderId) {
    throw new Error("OrderPlaced event is missing orderId");
  }

  await loadNotificationCredentials();

  console.log(`Processing notification for order ${orderId} customer ${customerId}`);

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

  console.log(`notificationStatus set to SENT for order ${orderId}`);
}

exports.handler = async (event) => {
  console.log("SQS event received:", JSON.stringify(event, null, 2));

  const batchItemFailures = [];

  for (const record of event.Records) {
    const messageId = record.messageId;

    try {
      const body = JSON.parse(record.body);
      const detail = body.detail || body;
      await processOrder(detail);
    } catch (err) {
      console.error(`Failed to process message ${messageId}:`, err.message);
      batchItemFailures.push({ itemIdentifier: messageId });
    }
  }

  console.log(
    `Batch complete. ${event.Records.length - batchItemFailures.length} succeeded, ${batchItemFailures.length} failed.`
  );

  return { batchItemFailures };
};
