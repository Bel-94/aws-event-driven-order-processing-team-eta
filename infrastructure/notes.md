# API Gateway (Week 1) — ownership notes

You own the **entry point**: everything from the customer’s HTTP call up to invoking the Order Intake Lambda.

```
Customer
   |
   v
API Gateway  (POST /orders)   ← YOU (CloudFormation)
   |
   v
Lambda: Order Intake          ← teammate
   |
   v
DynamoDB Orders table         ← teammate
```

See the roadmap image: `docs/architecture-roadmap.png` and Week 1 slice: `docs/week-1-architecture.png`.

## What you must deliver

| Piece | Why it exists |
|---|---|
| Rest API | Named container for routes |
| Resource `/orders` | Path customers call |
| Method `POST` | Only create-order is needed in Week 1 |
| Integration `AWS_PROXY` | Hand the full request to Lambda; return Lambda’s response as HTTP |
| Stage (`dev`) | Makes a real URL: `https://{apiId}.execute-api.{region}.amazonaws.com/dev/orders` |
| `AWS::Lambda::Permission` | Lets API Gateway invoke Order Intake (without this you get 500s) |

You do **not** create the Lambda code or DynamoDB table in this stack. Pass their function ARN/name as a parameter once it exists.

## Mental model (internalize this)

1. **API Gateway is not business logic** — it receives HTTP, authorizes (later), and forwards.
2. **Loose coupling starts here** — the client only knows a URL. It never talks to DynamoDB or (in Week 2) EventBridge.
3. **Proxy integration** — Lambda sees an API Gateway event (`body`, `headers`, `requestContext`) and must return `{ statusCode, headers, body }`.
4. **Permission is separate from the method** — creating POST + integration is not enough; IAM must allow `apigateway.amazonaws.com` to `lambda:InvokeFunction`.

## Deploy

Prerequisites:

- AWS CLI configured (`aws sts get-caller-identity` works)
- Order Intake Lambda already created (or create the stack after, then update with the ARN)

```bash
# From repo root — replace FUNCTION_ARN with your teammate’s Lambda ARN
aws cloudformation deploy \
  --template-file infrastructure/api-gateway.yaml \
  --stack-name order-processing-api \
  --parameter-overrides \
    ProjectName=order-processing \
    StageName=dev \
    OrderIntakeFunctionArn=FUNCTION_ARN \
  --capabilities CAPABILITY_IAM
```

If you only have the function **name**:

```bash
aws cloudformation deploy \
  --template-file infrastructure/api-gateway.yaml \
  --stack-name order-processing-api \
  --parameter-overrides \
    ProjectName=order-processing \
    StageName=dev \
    OrderIntakeFunctionName=order-intake
```

Get the demo URL:

```bash
aws cloudformation describe-stacks \
  --stack-name order-processing-api \
  --query "Stacks[0].Outputs[?OutputKey=='OrdersPostUrl'].OutputValue" \
  --output text
```

Smoke test (after Lambda + DynamoDB exist):

```bash
curl -X POST "PASTE_OrdersPostUrl_HERE" \
  -H "Content-Type: application/json" \
  -d "{\"customerId\":\"c-001\",\"items\":[{\"sku\":\"SKU-1\",\"qty\":1}]}"
```

## Contract with the Order Intake teammate

Agree on this early so integration is painless:

**Request (example):**

```json
{
  "customerId": "c-001",
  "items": [{ "sku": "SKU-1", "qty": 1 }]
}
```

**Lambda response shape (required for proxy integration):**

```json
{
  "statusCode": 201,
  "headers": { "Content-Type": "application/json" },
  "body": "{\"orderId\":\"...\",\"status\":\"PENDING\"}"
}
```

`body` must be a **string** (often `JSON.stringify(...)` in Node).

## Week 1 demo checklist

- [ ] Stack deploys without errors
- [ ] Output `OrdersPostUrl` works
- [ ] POST returns 2xx when Lambda + DynamoDB are ready
- [ ] You can explain: API → Lambda → DynamoDB (PENDING), and why the client never talks to DynamoDB directly

## Common failures

| Symptom | Likely cause |
|---|---|
| `403` / missing auth | Unexpected; Week 1 uses `AuthorizationType: NONE` |
| `500` + AccessDenied in Lambda logs | Missing or wrong `AWS::Lambda::Permission` / SourceArn |
| `502` Bad Gateway | Lambda threw, timed out, or returned a non-proxy response shape |
| Method not found | Hitting wrong stage or path (must be `POST .../dev/orders`) |

## Out of scope for your Week 1 PR (intentionally)

- EventBridge / consumers (Week 2)
- SQS + DLQ (Week 3)
- Cognito / API keys (optional later)
- Creating the Order Intake Lambda or DynamoDB in this template
