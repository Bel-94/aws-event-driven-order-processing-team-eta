# Live demo script (deployed account)

Region: `us-east-1` · Account used for this run: `806162193320`

## Stacks (in order)

| Stack | Status |
| --- | --- |
| `order-processing-security` | CREATE_COMPLETE |
| `order-processing-db` | CREATE_COMPLETE |
| `order-processing-cognito` | CREATE_COMPLETE |
| `order-processing-sqs` | CREATE_COMPLETE |
| `order-processing-consumers` | CREATE_COMPLETE |
| `order-processing-events` | CREATE_COMPLETE |
| `order-processing-lambda` | CREATE_COMPLETE |
| `order-processing-api` | CREATE_COMPLETE |
| `order-processing-waf` | CREATE_COMPLETE |

## Endpoints / IDs

```text
API:        https://j8c0xjlxa1.execute-api.us-east-1.amazonaws.com/dev/orders
User pool:  us-east-1_N09ec4PPl
Client:     3ke9ugr3lbmk44gmasfooc8vje
Demo user:  demo@example.com / DemoPass1!
Table:      Orders-dev
```

## 1. Auth gate (30s)

**No token → 401**

```powershell
Invoke-WebRequest -Uri $API_URL -Method POST -ContentType "application/json" `
  -Body '{"customerId":"x"}' -UseBasicParsing
```

**Bad body + token → 400** (model validation)

## 2. Happy path (2 min)

1. Cognito `USER_PASSWORD_AUTH` → IdToken  
2. `POST /orders` with:

```json
{
  "customerId": "cust_demo_001",
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

3. Expect **201** + `eventPublished: true`  
4. Wait ~5–10s, then DynamoDB `get-item` on `orderId`

### Proven run (2026-07-31)

| Check | Result |
| --- | --- |
| HTTP | `201` |
| orderId | `ord_84b5ae36-05bf-45df-82a9-b50e15a4fb16` |
| totalAmount | `39.98` |
| eventPublished | `true` |
| paymentStatus | `PROCESSED` |
| inventoryStatus | `RESERVED` |
| notificationStatus | `SENT` |

## 3. Talking points while item loads

- Intake Lambda writes DynamoDB + publishes `OrderPlaced` to EventBridge  
- EventBridge → SQS queues → Payment / Inventory / Notification Lambdas  
- Cognito JWT on API Gateway; WAF on the stage; CMK/Secrets on sensitive paths  

## 4. Optional failure demo (DLQ)

Temporarily make Notification throw (see `docs/sqs-dlq-inspector-deployment.md`), place another order, show message in Notification DLQ, then restore code.

## 5. Security slide (console)

- Cognito user pool + authorizer on `POST /orders`  
- WAF Web ACL associated to API stage  
- KMS CMK on DynamoDB (if `UseCustomerManagedKey=true`)  
- Secrets Manager used by Payment/Notification  
- IAM before/after in `docs/PERMISSIONS.md`  
- Inspector (if stack deployed)
