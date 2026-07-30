# Authentication & API Security

Covers Cognito authentication on `POST /orders`, HTTPS, request body validation, and throttling.

## What was added

| Control | Where | What it does |
|---|---|---|
| Cognito User Pool + app client | `infrastructure/cognito.yaml` | Issues JWTs for demo users (email/password) |
| Cognito authorizer | `infrastructure/api-gateway.yaml` | Requires `Authorization: Bearer <IdToken>` |
| Request validator + model | `api-gateway.yaml` | Rejects bodies missing `customerId` / `items` (or invalid item shape) with `400` before Lambda |
| Stage throttling | `api-gateway.yaml` MethodSettings | Default 10 RPS / burst 20 (override via parameters) |
| HTTPS | execute-api endpoint | API Gateway regional URLs are HTTPS only — there is no HTTP invoke URL |

## Deploy order

```bash
# 1. Cognito
aws cloudformation deploy \
  --template-file infrastructure/cognito.yaml \
  --stack-name order-processing-cognito \
  --parameter-overrides Environment=dev ProjectName=order-processing

# 2. Redeploy / update API Gateway (needs Lambda ARN + Cognito stack)
LAMBDA_ARN=$(aws cloudformation describe-stacks \
  --stack-name order-processing-lambda \
  --query "Stacks[0].Outputs[?OutputKey=='OrderIntakeFunctionArn'].OutputValue" \
  --output text)

aws cloudformation deploy \
  --template-file infrastructure/api-gateway.yaml \
  --stack-name order-processing-api \
  --parameter-overrides \
    ProjectName=order-processing \
    StageName=dev \
    OrderIntakeFunctionArn=$LAMBDA_ARN \
    CognitoStackName=order-processing-cognito \
    ThrottleRateLimit=10 \
    ThrottleBurstLimit=20
```

## Create a demo user and get a token

```bash
USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name order-processing-cognito \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)
CLIENT_ID=$(aws cloudformation describe-stacks --stack-name order-processing-cognito \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolClientId'].OutputValue" --output text)

# Create user (email = username)
aws cognito-idp admin-create-user \
  --user-pool-id "$USER_POOL_ID" \
  --username "demo@example.com" \
  --user-attributes Name=email,Value=demo@example.com Name=email_verified,Value=true \
  --temporary-password "TempPass1" \
  --message-action SUPPRESS

# Set permanent password
aws cognito-idp admin-set-user-password \
  --user-pool-id "$USER_POOL_ID" \
  --username "demo@example.com" \
  --password "DemoPass1" \
  --permanent

# USER_PASSWORD_AUTH -> IdToken (use this as Bearer token for API Gateway)
aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id "$CLIENT_ID" \
  --auth-parameters USERNAME=demo@example.com,PASSWORD=DemoPass1 \
  --query "AuthenticationResult.IdToken" \
  --output text
```

## Call the API

```bash
API_URL=$(aws cloudformation describe-stacks --stack-name order-processing-api \
  --query "Stacks[0].Outputs[?OutputKey=='OrdersPostUrl'].OutputValue" --output text)
TOKEN="paste-id-token-here"

# Missing token -> 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{"customerId":"c1","items":[{"sku":"SKU-1","quantity":1,"unitPrice":9.99}]}'

# Valid token + valid body -> 201 (when Lambda/DB/EventBridge are up)
curl -s -X POST "$API_URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"customerId":"c1","items":[{"sku":"SKU-1","quantity":1,"unitPrice":9.99}]}'

# Valid token + invalid body -> 400 from API Gateway validator
curl -s -X POST "$API_URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"customerId":"c1"}'
```

## Presentation talking points

1. **AuthN** — only Cognito-issued JWTs reach Lambda; anonymous `POST` fails.
2. **Validation** — bad payloads never invoke Order Intake (saves cost, clearer errors).
3. **Throttling** — burst/rate limits protect the stage from accidental floods during the demo.
4. **HTTPS** — TLS is enforced by API Gateway; clients never get an `http://` execute-api URL.
5. **Next hardening** — WAF/Shield (separate Week 3 role) sits in front of this same API.
