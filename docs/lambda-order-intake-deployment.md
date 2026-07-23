# Order Intake Lambda - Deployment Guide

## What this function does

When a customer places an order, API Gateway receives the HTTP request and passes it straight to this Lambda. The function validates the incoming data, generates an order ID, and writes the order to DynamoDB with a status of `PENDING`. That is it for Week 1. The EventBridge part where other services get notified comes in Week 2.

If something in the request is wrong, the function returns a `400` with a plain description of what failed. If the database write goes wrong, it returns a `500`. A successful request gets back a `201` with the new order ID and a short summary.

---

## Project files

```
lambdas/
  order-intake/
    index.js

infrastructure/
  lambda-order-intake.yaml
  lambda-order-intake.yaml
  dynamodb.yaml
  api-gateway.yaml
```

---

## Deployment order

These three CloudFormation stacks depend on each other. DynamoDB has to be up first because the Lambda stack imports the table name and ARN from it. The API Gateway stack needs the Lambda ARN, so it goes last.

```
DynamoDB stack  ->  Lambda stack  ->  API Gateway stack
```

If you try to deploy the Lambda stack before DynamoDB exists, CloudFormation will fail trying to resolve the cross-stack reference.

---

## Deploying via CloudShell

CloudShell is the easiest way to do this. It runs inside the AWS account, already has the CLI configured, and you do not need to install anything.

Open CloudShell from the AWS Console (the terminal icon in the top navigation bar).

Clone the repo if you have not already:

```bash
git clone https://github.com/Bel-94/aws-event-driven-order-processing-team-eta.git
cd aws-event-driven-order-processing-team-eta
```

Deploy the Lambda stack:

```bash
aws cloudformation deploy \
  --template-file infrastructure/lambda-order-intake.yaml \
  --stack-name order-processing-lambda \
  --parameter-overrides \
    Environment=dev \
    DynamoDBStackName=order-processing-db \
  --capabilities CAPABILITY_NAMED_IAM
```

`CAPABILITY_NAMED_IAM` is required because the stack creates an IAM role with a specific name. CloudFormation will not deploy without it.

Once the stack is up, upload the actual function code:

```bash
zip -j order-intake.zip lambdas/order-intake/index.js

aws lambda update-function-code \
  --function-name order-intake-dev \
  --zip-file fileb://order-intake.zip
```

The `-j` flag on zip keeps the file flat inside the archive, which is what Lambda expects.

Get the function ARN and share it with whoever is deploying the API Gateway stack:

```bash
aws cloudformation describe-stacks \
  --stack-name order-processing-lambda \
  --query "Stacks[0].Outputs[?OutputKey=='OrderIntakeFunctionArn'].OutputValue" \
  --output text
```
---

## Testing before API Gateway is connected

You can invoke the Lambda directly from CloudShell to confirm the DynamoDB write works, without waiting for API Gateway to be set up.

Create a test event file:

```bash
cat > test-event.json << 'ENDJSON'
{
  "body": "{\"customerId\":\"cust_001\",\"items\":[{\"sku\":\"SKU-123\",\"productName\":\"Wireless Mouse\",\"quantity\":2,\"unitPrice\":19.99}]}"
}
ENDJSON
```

Invoke the function:

```bash
aws lambda invoke \
  --function-name order-intake-dev \
  --payload file://test-event.json \
  --cli-binary-format raw-in-base64-out \
  response.json

cat response.json
```

A successful response:

```json
{
  "statusCode": 201,
  "headers": { "Content-Type": "application/json" },
  "body": "{\"orderId\":\"ord_...\",\"status\":\"PENDING\",\"totalAmount\":39.98,\"currency\":\"USD\",\"createdAt\":\"2026-07-23T...\"}"
}
```

Check that the item actually landed in DynamoDB:

```bash
aws dynamodb scan \
  --table-name Orders-dev \
  --query "Items[0]"
```

---

## What a valid order request looks like

```json
{
  "customerId": "cust_3b2a1c9e",
  "items": [
    {
      "sku": "SKU-12345",
      "productName": "Wireless Mouse",
      "quantity": 2,
      "unitPrice": 19.99
    }
  ],
  "currency": "USD"
}
```

`customerId` and `items` are required. Each item needs `sku`, `quantity`, and `unitPrice`. `currency` is optional and defaults to `USD` if left out.

---

## What gets stored in DynamoDB

```json
{
  "orderId": "ord_8f14e45f-...",
  "customerId": "cust_3b2a1c9e",
  "items": [...],
  "status": "PENDING",
  "totalAmount": 39.98,
  "currency": "USD",
  "createdAt": "2026-07-22T14:32:00Z",
  "updatedAt": "2026-07-22T14:32:00Z"
}
```

`status` will stay `PENDING` until the Week 2 consumer Lambdas update it to reflect payment, inventory, and notification outcomes.

---

## Updating the code after a change

If you edit `index.js`, re-zip and push the update. No need to redeploy the CloudFormation stack unless you change the template itself.

```bash
zip -j order-intake.zip lambdas/order-intake/index.js

aws lambda update-function-code \
  --function-name order-intake-dev \
  --zip-file fileb://order-intake.zip
```

---

## Things that can go wrong

| Error | What it usually means |
|---|---|
| `Export order-processing-db-OrdersTableName does not exist` | The DynamoDB stack has not been deployed yet, or the stack name passed does not match |
| `InsufficientCapabilitiesException` | The `--capabilities CAPABILITY_NAMED_IAM` flag was left out of the deploy command |
| `ResourceNotFoundException` on invoke | The function name is wrong or you are in the wrong region |
| `AccessDeniedException` in the Lambda logs | The execution role is missing `dynamodb:PutItem` |
| `502 Bad Gateway` from API Gateway | The Lambda threw an unhandled error or returned a response in the wrong shape |

---

## IAM permissions

The execution role has the minimum permissions needed for Week 1.

| Permission | Reason |
|---|---|
| `dynamodb:PutItem` | Writing a new order record to the table |
| `logs:CreateLogGroup` | CloudWatch needs this on the first run to create the log group |
| `logs:CreateLogStream` | Required to write log entries |
| `logs:PutLogEvents` | Required to send log output to CloudWatch |

---

## Week 2 note

The function will need to publish an `OrderPlaced` event to EventBridge after the DynamoDB write. At that point the execution role will need an `events:PutEvents` permission added. That update happens in Week 2 alongside the EventBridge stack.
