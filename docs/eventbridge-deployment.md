# Week 2 — EventBridge, OrderPlaced, and Consumer Lambdas

Deploy **after** the Week 1 DynamoDB stack exists. Order Intake is updated in this week to publish `OrderPlaced`; it therefore depends on the EventBridge stack.

Schema contract: [`docs/event-schema.md`](event-schema.md)

## Deploy order

```text
DynamoDB (week 1)
  -> consumers.yaml
  -> eventbridge.yaml   (needs consumer ARNs)
  -> lambda-order-intake.yaml  (needs event bus export)
  -> upload function zips
  -> api-gateway.yaml   (if not already deployed)
```

### 1. Consumers

```bash
aws cloudformation deploy \
  --template-file infrastructure/consumers.yaml \
  --stack-name order-processing-consumers \
  --parameter-overrides Environment=dev DynamoDBStackName=order-processing-db \
  --capabilities CAPABILITY_NAMED_IAM
```

### 2. EventBridge bus + OrderPlaced rule

```bash
PAYMENT_ARN=$(aws cloudformation describe-stacks --stack-name order-processing-consumers \
  --query "Stacks[0].Outputs[?OutputKey=='PaymentFunctionArn'].OutputValue" --output text)
INVENTORY_ARN=$(aws cloudformation describe-stacks --stack-name order-processing-consumers \
  --query "Stacks[0].Outputs[?OutputKey=='InventoryFunctionArn'].OutputValue" --output text)
NOTIFICATION_ARN=$(aws cloudformation describe-stacks --stack-name order-processing-consumers \
  --query "Stacks[0].Outputs[?OutputKey=='NotificationFunctionArn'].OutputValue" --output text)

aws cloudformation deploy \
  --template-file infrastructure/eventbridge.yaml \
  --stack-name order-processing-events \
  --parameter-overrides \
    Environment=dev \
    ProjectName=order-processing \
    PaymentFunctionArn=$PAYMENT_ARN \
    InventoryFunctionArn=$INVENTORY_ARN \
    NotificationFunctionArn=$NOTIFICATION_ARN
```

### 3. Update Order Intake (PutItem + PutEvents)

```bash
aws cloudformation deploy \
  --template-file infrastructure/lambda-order-intake.yaml \
  --stack-name order-processing-lambda \
  --parameter-overrides \
    Environment=dev \
    DynamoDBStackName=order-processing-db \
    EventBridgeStackName=order-processing-events \
  --capabilities CAPABILITY_NAMED_IAM
```

### 4. Upload real function code (includes AWS SDK v3)

Node.js 20 Lambda runtimes do **not** bundle AWS SDK v3. Install deps, then zip `index.js` + `node_modules`.

```bash
# Order Intake
cd lambdas/order-intake && npm install --omit=dev
zip -r ../../order-intake.zip index.js node_modules package.json
cd ../..
aws lambda update-function-code \
  --function-name order-intake-dev \
  --zip-file fileb://order-intake.zip

# Payment
cd lambdas/payment-processor && npm install --omit=dev
zip -r ../../payment-processor.zip index.js node_modules package.json
cd ../..
aws lambda update-function-code \
  --function-name payment-processor-dev \
  --zip-file fileb://payment-processor.zip

# Inventory
cd lambdas/inventory-update && npm install --omit=dev
zip -r ../../inventory-update.zip index.js node_modules package.json
cd ../..
aws lambda update-function-code \
  --function-name inventory-update-dev \
  --zip-file fileb://inventory-update.zip

# Notification
cd lambdas/notification && npm install --omit=dev
zip -r ../../notification.zip index.js node_modules package.json
cd ../..
aws lambda update-function-code \
  --function-name notification-dev \
  --zip-file fileb://notification.zip
```

## Verify

1. `POST` an order to API Gateway (`OrdersPostUrl`).
2. Expect `201` with `eventPublished: true`.
3. In DynamoDB, the item should gain:
   - `paymentStatus = PROCESSED`
   - `inventoryStatus = RESERVED`
   - `notificationStatus = SENT`
4. CloudWatch Logs for each consumer should show the EventBridge event.

```bash
aws dynamodb get-item \
  --table-name Orders-dev \
  --key "{\"orderId\":{\"S\":\"PASTE_ORDER_ID\"}}"
```

## What not to do yet

- Cognito / API authorizer (separate Auth role)
- SQS in front of Notification (Week 3)
- Real payment gateway
