const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const TABLE_NAME = process.env.ORDERS_TABLE_NAME;
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// ---------------------------------------------------------------------------
// How this function is triggered (Week 3 change)
//
// In Week 2, EventBridge called this function directly with an event object
// whose shape was: { detail: { orderId, customerId, ... } }
//
// In Week 3, EventBridge sends the OrderPlaced event into an SQS queue first.
// SQS then calls this function with a batch of records. Each record's body
// is a JSON string of the original EventBridge event.
//
// The function loops through the batch, processes each message, and returns
// a batchItemFailures list for anything that errors. SQS uses that list to
// retry only the failed messages rather than the whole batch — messages not
// in the failure list are deleted from the queue automatically.
// ---------------------------------------------------------------------------

async function processOrder(detail) {
  const { orderId, customerId } = detail;

  if (!orderId) {
    // Throwing here means this message goes back to SQS for retry,
    // and eventually to the DLQ if it keeps failing.
    throw new Error("OrderPlaced event is missing orderId");
  }

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

  // SQS delivers a batch of records. We track any that fail so SQS can
  // retry them individually rather than replaying the whole batch.
  const batchItemFailures = [];

  for (const record of event.Records) {
    let messageId = record.messageId;

    try {
      // The SQS message body is a JSON string of the EventBridge envelope.
      // EventBridge wraps the original event when it targets an SQS queue,
      // so the actual order data lives inside the "detail" key.
      const body = JSON.parse(record.body);

      // EventBridge wraps events sent to SQS inside a "detail" field.
      // If for some reason the body is already flat (e.g. a test message
      // sent directly to SQS), we fall back to the body itself.
      const detail = body.detail || body;

      await processOrder(detail);
    } catch (err) {
      console.error(`Failed to process message ${messageId}:`, err.message);

      // Returning the messageId here tells SQS this specific message failed.
      // SQS will make it visible again for retry. After MaxReceiveCount
      // retries it moves to the DLQ automatically.
      batchItemFailures.push({ itemIdentifier: messageId });
    }
  }

  console.log(
    `Batch complete. ${event.Records.length - batchItemFailures.length} succeeded, ${batchItemFailures.length} failed.`
  );

  return { batchItemFailures };
};
