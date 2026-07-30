# SQS, Dead Letter Queue & Amazon Inspector - Deployment Guide

This covers everything added in Week 3 for the notification buffer and vulnerability scanning. By the end of this, we will have SQS sitting between 
EventBridge and the Notification Lambda, a DLQ catching any messages that repeatedly fail, and Inspector actively scanning all Lambda functions in the account.

---

## What changed and why

Before this week, EventBridge called the Notification Lambda directly. That works fine when everything is healthy, but if the Lambda throws an error or times 
out, the event is gone. There is no retry, no record of what failed, nothing to investigate.

SQS fixes that. EventBridge now puts the OrderPlaced event onto a queue instead of calling the Lambda. The Lambda polls the queue and processes messages 
in small batches. If a message fails after three attempts, SQS moves it to the Dead Letter Queue automatically. Nothing gets silently dropped.

Inspector runs alongside all of this as a passive scanner. Once enabled it continuously checks the Lambda function packages for known vulnerabilities in 
their dependencies. No manual trigger needed - it fires automatically whenever a new function version is deployed.

---

## Files added or changed

```
infrastructure/
  sqs-dlq.yaml               new - SQS queue, DLQ, and queue policy
  inspector.yaml             new - Inspector v2 enablement and optional SNS alerts
  eventbridge.yaml           updated - Notification target is now the SQS queue, not the Lambda
  consumers.yaml             updated - Notification Lambda has its own role with SQS permissions
                                       and an event source mapping connecting it to the queue

lambdas/
  notification/index.js      updated - now reads from SQS batches instead of EventBridge events
```

---

## Deploy order

The SQS stack has to exist before consumers and eventbridge because both import the queue ARN from it.

```
sqs-dlq stack  ->  consumers stack  ->  eventbridge stack
```

Inspector is independent and can go up at any point.

---

## Deploying from CloudShell

Open CloudShell from the AWS Console, navigate to the repo, and run these in order.

**Step 1 - SQS and DLQ**

```bash
aws cloudformation deploy \
  --template-file infrastructure/sqs-dlq.yaml \
  --stack-name order-processing-sqs \
  --parameter-overrides \
    Environment=dev \
    ProjectName=order-processing
```

Confirm it worked and grab the queue URL for reference:

```bash
aws cloudformation describe-stacks \
  --stack-name order-processing-sqs \
  --query "Stacks[0].Outputs" \
  --output table
```

**Step 2 - Update the consumers stack**

The consumers stack now needs the SQS stack name so it can import the queue ARN for the Notification Lambda's permissions and event source mapping.

```bash
aws cloudformation deploy \
  --template-file infrastructure/consumers.yaml \
  --stack-name order-processing-consumers \
  --parameter-overrides \
    Environment=dev \
    DynamoDBStackName=order-processing-db \
    SQSStackName=order-processing-sqs \
  --capabilities CAPABILITY_NAMED_IAM
```

Upload the updated Notification Lambda code:

```bash
zip -j notification.zip lambdas/notification/index.js

aws lambda update-function-code \
  --function-name notification-dev \
  --zip-file fileb://notification.zip
```

**Step 3 - Update EventBridge to route Notification events to SQS**

You need the Payment and Inventory function ARNs from the consumers stack:

```bash
PAYMENT_ARN=$(aws cloudformation describe-stacks \
  --stack-name order-processing-consumers \
  --query "Stacks[0].Outputs[?OutputKey=='PaymentFunctionArn'].OutputValue" \
  --output text)

INVENTORY_ARN=$(aws cloudformation describe-stacks \
  --stack-name order-processing-consumers \
  --query "Stacks[0].Outputs[?OutputKey=='InventoryFunctionArn'].OutputValue" \
  --output text)
```

Then deploy:

```bash
aws cloudformation deploy \
  --template-file infrastructure/eventbridge.yaml \
  --stack-name order-processing-eventbridge \
  --parameter-overrides \
    Environment=dev \
    ProjectName=order-processing \
    PaymentFunctionArn=$PAYMENT_ARN \
    InventoryFunctionArn=$INVENTORY_ARN \
    SQSStackName=order-processing-sqs
```

**Step 4 - Inspector**

To enable scanning without email alerts:

```bash
aws cloudformation deploy \
  --template-file infrastructure/inspector.yaml \
  --stack-name order-processing-inspector \
  --parameter-overrides \
    Environment=dev \
    ProjectName=order-processing
```

To also get email alerts for HIGH and CRITICAL findings, add your email:

```bash
aws cloudformation deploy \
  --template-file infrastructure/inspector.yaml \
  --stack-name order-processing-inspector \
  --parameter-overrides \
    Environment=dev \
    ProjectName=order-processing \
    AlertEmail=your@email.com \
  --capabilities CAPABILITY_IAM
```

You will get a confirmation email from AWS SNS after the stack deploys. Click the confirmation link or alerts will not come through.

---

## Verifying the SQS setup

Send a test order through the API and confirm it flows all the way through.

```bash
curl -X POST https://<api-id>.execute-api.<region>.amazonaws.com/dev/orders \
  -H "Content-Type: application/json" \
  -d '{"customerId":"cust_001","items":[{"sku":"SKU-123","productName":"Test Item","quantity":1,"unitPrice":9.99}]}'
```

Check the Notification Lambda logs in CloudWatch to confirm it picked up the message from SQS:

```bash
aws logs tail /aws/lambda/notification-dev --follow
```

Check the DynamoDB record to confirm notificationStatus was updated:

```bash
aws dynamodb scan \
  --table-name Orders-dev \
  --query "Items[0]"
```

---

## Testing the DLQ (failure simulation)

This shows that a failure does not silently lose the event. ( I think this can be optional tho.. I mean testing this)

Temporarily break the Notification Lambda by deploying a version that throws on purpose:

```bash
cat > /tmp/broken-notification.js << 'BROKEN'
exports.handler = async () => {
  throw new Error("Simulated failure for DLQ demo");
};
BROKEN

zip -j /tmp/broken.zip /tmp/broken-notification.js

aws lambda update-function-code \
  --function-name notification-dev \
  --zip-file fileb:///tmp/broken.zip
```

Send an order through the API. After three failed delivery attempts, the message will land in the DLQ. Check it:

```bash
aws sqs get-queue-attributes \
  --queue-url $(aws cloudformation describe-stacks \
    --stack-name order-processing-sqs \
    --query "Stacks[0].Outputs[?OutputKey=='NotificationDLQUrl'].OutputValue" \
    --output text) \
  --attribute-names ApproximateNumberOfMessages
```

The `ApproximateNumberOfMessages` count will be 1. That is the failed message sitting safely in the DLQ rather than being lost.

Once the demo is done, restore the real code:

```bash
zip -j notification.zip lambdas/notification/index.js

aws lambda update-function-code \
  --function-name notification-dev \
  --zip-file fileb://notification.zip
```

---

## Viewing Inspector findings

After deploying the Inspector stack, give it a few minutes to run its initial scan. Then check findings in the console:

AWS Console → Inspector → Findings → filter by Resource type: Lambda

Or from the CLI:

```bash
aws inspector2 list-findings \
  --filter-criteria '{"resourceType":[{"comparison":"EQUALS","value":"AWS_LAMBDA_FUNCTION"}]}' \
  --query "findings[*].{Severity:severity,Title:title,Function:resources[0].id}" \
  --output table
```

If there are no findings, that is a good sign. Inspector will continue scanning automatically as new function versions are deployed.

---

## Things that can go wrong

| Error | What it usually means |
|---|---|
| `Export order-processing-sqs-NotificationQueueArn does not exist` | SQS stack is not deployed yet or the stack name passed does not match |
| `InvalidParameterValueException` on event source mapping | The Notification Lambda timeout is higher than the SQS visibility timeout - Lambda timeout must be lower |
| Messages not appearing in DLQ after failures | The SQS queue policy may not be allowing EventBridge to send - check the `NotificationQueuePolicy` resource deployed correctly |
| Inspector showing no findings after deploy | Normal if dependencies are clean - wait a few minutes for the initial scan to complete |
| SNS confirmation email never arrived | Check spam folder, or redeploy with the correct email address |

---

## SQS configuration reference

| Setting | Value | Reason |
|---|---|---|
| Visibility timeout | 60 seconds | Gives the Lambda time to finish processing before SQS retries |
| Lambda timeout | 30 seconds | Must be lower than visibility timeout |
| Batch size | 5 messages | Small enough to process quickly, large enough to be efficient |
| Max receive count | 3 | Three attempts before a message moves to the DLQ |
| Main queue retention | 4 days | Time window to recover if the Lambda is down for a while |
| DLQ retention | 14 days | Longer window so the team has time to investigate failures |
