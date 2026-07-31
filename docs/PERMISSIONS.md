# IAM Permissions Review (Week 3)

This is the security-story artifact for the final presentation: what we grant, why, and what we tightened.

## Before (early Week 1 mindset)

| Principal | Typical beginner grant | Risk |
|---|---|---|
| Order Intake role | `dynamodb:*` on `*` | Can read/delete any table |
| Consumers | One shared role with broad DynamoDB + maybe `*` | Blast radius across all consumers |
| API Gateway | No Cognito; open `POST` | Anyone can place orders |
| Notification | Same role as payment; EventBridge direct invoke | No buffer; shared privileges |

## After (current least privilege)

### Order Intake — `order-intake-execution-role-${Environment}`

| Permission | Scope |
|---|---|
| `dynamodb:PutItem` | Orders table ARN only |
| `events:PutEvents` | Custom event bus ARN only |
| CloudWatch Logs | Via basic execution role |

### Payment + Inventory — `order-consumers-execution-role-${Environment}`

| Permission | Scope |
|---|---|
| `dynamodb:UpdateItem` | Orders table ARN only |
| Secrets policy (optional attach) | Payment + notification secret ARNs + CMK decrypt |
| CloudWatch Logs | Via basic execution role |

### Notification — `order-notification-execution-role-${Environment}`

| Permission | Scope |
|---|---|
| `dynamodb:UpdateItem` | Orders table ARN only |
| `sqs:ReceiveMessage` / `DeleteMessage` / `GetQueueAttributes` / `ChangeMessageVisibility` | Notification queue ARN only |
| Secrets policy (optional attach) | Same managed policy from data_security |
| CloudWatch Logs | Via basic execution role |

### Resource policies (not execution roles)

| Policy | Purpose |
|---|---|
| API Gateway → Lambda invoke | Only this API can invoke Order Intake |
| EventBridge → Payment/Inventory invoke | Only OrderPlaced rule can invoke |
| EventBridge → SQS SendMessage | Queue accepts EventBridge events |
| Cognito authorizer on `POST /orders` | JWT required |

## PoLP decisions called out in the demo

1. **Create vs update split** — Intake can only `PutItem`; consumers can only `UpdateItem`.
2. **Notification isolated** — SQS permissions are not on the payment/inventory role.
3. **No Scan/Query/Delete** on Orders for any Lambda in this project.
4. **Secrets via managed policy** — consumers read specific secret ARNs, not `secretsmanager:*`.
5. **Known tradeoff** — Payment and Inventory still share one role, so Inventory inherits unused secrets access when `AttachSecretsPolicy=true`. Splitting payment into its own role is a natural follow-up.

## Known logging tradeoff

`AWSLambdaBasicExecutionRole` allows logs on `arn:aws:logs:*:*:*`. Acceptable for the demo; a stricter design scopes log ARNs per function (see earlier Order Intake notes).
