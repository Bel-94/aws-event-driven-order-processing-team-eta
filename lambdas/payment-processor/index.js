const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

const TABLE_NAME = process.env.ORDERS_TABLE_NAME;
const PAYMENT_SECRET_ARN = process.env.PAYMENT_SECRET_ARN;
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const secretsClient = new SecretsManagerClient({});

async function loadPaymentCredentials() {
  if (!PAYMENT_SECRET_ARN) {
    console.log("PAYMENT_SECRET_ARN not set — skipping Secrets Manager lookup");
    return null;
  }

  const result = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: PAYMENT_SECRET_ARN })
  );
  const secret = JSON.parse(result.SecretString || "{}");
  // Never log the secret value — only confirm it loaded for the demo.
  console.log("Loaded payment gateway secret. keys:", Object.keys(secret).join(","));
  return secret;
}

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

  await loadPaymentCredentials();

  console.log(
    `Simulating payment for order ${orderId}, total=${detail.totalAmount} ${detail.currency}`
  );

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
