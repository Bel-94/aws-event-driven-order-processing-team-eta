const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

const TABLE_NAME = process.env.ORDERS_TABLE_NAME;
const NOTIFICATION_SECRET_ARN = process.env.NOTIFICATION_SECRET_ARN;
/**
 * Verified SES identity used as From (required in sandbox + production).
 * Example: orders@freshbasket.example or your verified Gmail for the demo.
 */
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL || "";
/**
 * Fallback recipient when the order has no customerEmail, or when you need a
 * guaranteed inbox during SES sandbox demos (must also be verified in sandbox).
 */
const SES_DEFAULT_TO_EMAIL = process.env.SES_DEFAULT_TO_EMAIL || "";

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const secretsClient = new SecretsManagerClient({});
const sesClient = new SESClient({});

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

function resolveRecipient(detail, secret) {
  const fromEvent =
    (typeof detail.customerEmail === "string" && detail.customerEmail.trim()) ||
    (typeof detail.email === "string" && detail.email.trim()) ||
    "";
  const fromSecret =
    (secret && typeof secret.defaultRecipient === "string" && secret.defaultRecipient.trim()) ||
    "";
  return fromEvent || SES_DEFAULT_TO_EMAIL || fromSecret;
}

function resolveFromAddress(secret) {
  const fromSecret =
    (secret && typeof secret.fromEmail === "string" && secret.fromEmail.trim()) || "";
  return SES_FROM_EMAIL || fromSecret;
}

function buildEmailBodies(detail) {
  const orderId = detail.orderId;
  const total = detail.totalAmount != null ? `${detail.currency || "USD"} ${detail.totalAmount}` : "see your account";
  const itemLines = Array.isArray(detail.items)
    ? detail.items
        .map(
          (i) =>
            `• ${i.productName || i.sku} × ${i.quantity} @ ${i.unitPrice}`
        )
        .join("\n")
    : "• Your FreshBasket items";

  const text = [
    "FreshBasket — order confirmed",
    "",
    `Hi there,`,
    "",
    `Thanks for shopping with FreshBasket. Your order is confirmed and queued for delivery preparation.`,
    "",
    `Order number: ${orderId}`,
    `Total: ${total}`,
    "",
    "Items:",
    itemLines,
    "",
    "What happens next (event-driven checkout):",
    "1. Payment is processed by its own service",
    "2. Inventory reserves your items independently",
    "3. This email is sent by the Notification service via Amazon SES",
    "",
    "You will get another update when your order is out for delivery.",
    "",
    "— FreshBasket",
    "Fresh groceries. Smarter checkout.",
  ].join("\n");

  const html = `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f5f7f6;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#141916;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7f6;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4ebe6;">
            <tr>
              <td style="background:#1b7a4e;padding:24px 28px;">
                <div style="font-size:22px;font-weight:700;color:#ffffff;">FreshBasket</div>
                <div style="margin-top:4px;font-size:13px;color:#d7f0e3;">Fresh groceries. Smarter checkout.</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <h1 style="margin:0 0 12px;font-size:22px;">Your order is confirmed</h1>
                <p style="margin:0 0 16px;line-height:1.55;color:#3d4741;">
                  Thanks for shopping with us. Checkout finished as soon as we accepted the order—
                  payment, inventory, and this email each ran as separate cloud services.
                </p>
                <p style="margin:0 0 8px;"><strong>Order number:</strong> ${orderId}</p>
                <p style="margin:0 0 20px;"><strong>Total:</strong> ${total}</p>
                <div style="background:#f3faf6;border-radius:12px;padding:16px;margin-bottom:20px;">
                  <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#166140;margin-bottom:8px;">Items</div>
                  <pre style="margin:0;font-family:inherit;white-space:pre-wrap;line-height:1.5;color:#141916;">${itemLines}</pre>
                </div>
                <p style="margin:0;font-size:13px;line-height:1.55;color:#3d4741;">
                  Sent asynchronously by the Notification Lambda through Amazon SES after an
                  <em>OrderPlaced</em> event on EventBridge.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();

  return { text, html };
}

async function sendOrderConfirmationEmail(detail, secret) {
  const toAddress = resolveRecipient(detail, secret);
  const fromAddress = resolveFromAddress(secret);

  if (!fromAddress) {
    throw new Error(
      "SES_FROM_EMAIL (or secret.fromEmail) is not configured — cannot send confirmation email"
    );
  }
  if (!toAddress) {
    throw new Error(
      "No customerEmail on the order and SES_DEFAULT_TO_EMAIL is empty — nowhere to send"
    );
  }

  const { text, html } = buildEmailBodies(detail);
  const subject = `FreshBasket order confirmed · ${detail.orderId}`;

  const result = await sesClient.send(
    new SendEmailCommand({
      Source: `FreshBasket <${fromAddress}>`,
      Destination: { ToAddresses: [toAddress] },
      Message: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: {
          Text: { Data: text, Charset: "UTF-8" },
          Html: { Data: html, Charset: "UTF-8" },
        },
      },
      // Helpful for CloudWatch / SES metrics during the demo
      Tags: [
        { Name: "service", Value: "notification" },
        { Name: "orderId", Value: String(detail.orderId).slice(0, 64) },
      ],
    })
  );

  console.log(
    `SES email sent. to=${toAddress} from=${fromAddress} messageId=${result.MessageId}`
  );
  return { toAddress, fromAddress, messageId: result.MessageId };
}

async function processOrder(detail) {
  const { orderId, customerId } = detail;

  if (!orderId) {
    throw new Error("OrderPlaced event is missing orderId");
  }

  const secret = await loadNotificationCredentials();
  console.log(`Processing notification for order ${orderId} customer ${customerId}`);

  const emailResult = await sendOrderConfirmationEmail(detail, secret);

  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { orderId },
      UpdateExpression:
        "SET notificationStatus = :ns, notificationChannel = :ch, notificationTo = :to, notificationMessageId = :mid, updatedAt = :u",
      ExpressionAttributeValues: {
        ":ns": "SENT",
        ":ch": "email",
        ":to": emailResult.toAddress,
        ":mid": emailResult.messageId || "unknown",
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
