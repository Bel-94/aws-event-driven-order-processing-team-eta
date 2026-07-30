# IAM Permissions

## Order Intake — `order-intake-execution-role-${Environment}`

**Defined in:** `infrastructure/lambda-order-intake.yaml`

| Permission | Why | Scope |
|---|---|---|
| `dynamodb:PutItem` | Create order with `status: PENDING` | Orders table ARN only |
| `events:PutEvents` | Publish `OrderPlaced` after the DynamoDB write | Custom event bus ARN only |
| `logs:CreateLogGroup` / `CreateLogStream` / `PutLogEvents` | Runtime logs | Via `AWSLambdaBasicExecutionRole` |

**Not granted to Order Intake:** `UpdateItem`, `Scan`, `Query`, `DeleteItem`, bus-wide wildcards.

## Consumers — `order-consumers-execution-role-${Environment}`

**Defined in:** `infrastructure/consumers.yaml`  
Shared by Payment, Inventory, and Notification.

| Permission | Why | Scope |
|---|---|---|
| `dynamodb:UpdateItem` | Each consumer sets its own status attribute | Orders table ARN only |
| CloudWatch Logs | Debug consumer invocations | Via `AWSLambdaBasicExecutionRole` |

**Not granted to consumers:** `PutItem`, `DeleteItem`, `Scan`, `events:PutEvents`.

## EventBridge → Lambda invoke

Not an execution-role permission. `infrastructure/eventbridge.yaml` adds `AWS::Lambda::Permission` so `events.amazonaws.com` can invoke each consumer, scoped to the `OrderPlaced` rule ARN.

## PoLP notes

- Consumers update **different attributes** (`paymentStatus`, `inventoryStatus`, `notificationStatus`) so they do not overwrite each other.
- Tighten logs further (function-scoped log ARNs) and split consumer roles per function during the Week 3 IAM review if desired.
